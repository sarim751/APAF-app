const supabase = require('../db/supabaseClient');
const systemLogger = require('./systemLogger');

const cleanupService = {
  /**
   * Cleans an uncleaned telemetry packet and generates an intermediate file.
   * @param {object} packet - Row from telemetry_packets
   */
  async cleanPacket(packet) {
    const payload = typeof packet.payload_json === 'string' 
      ? JSON.parse(packet.payload_json) 
      : { ...packet.payload_json };

    const instrument = packet.instrument;
    let isRecoverable = true;
    let cleanupNotes = [];
    const cleanedPayload = { ...payload };

    // Deliberate unrecoverable edge case for NPD:
    // When NPD telemetry is uncleaned and corrupt (e.g. missing both hydrogenFlux and oxygenFlux or flagged corrupt)
    if (instrument === 'NPD') {
      if (payload.corrupt === true || (payload.hydrogenFlux === undefined && payload.oxygenFlux === undefined)) {
        isRecoverable = false;
        cleanupNotes.push('Fatal gap: Missing required NPD flux telemetry data cannot be interpolated.');
      }
    }

    // Instrument normalization for recoverable cases
    if (isRecoverable) {
      if (instrument === 'ELS') {
        if (cleanedPayload.energyRange === undefined && cleanedPayload.rawEnergy !== undefined) {
          cleanedPayload.energyRange = cleanedPayload.rawEnergy;
          cleanupNotes.push("Normalized 'rawEnergy' to 'energyRange'");
        }
        if (cleanedPayload.electronFlux === undefined && cleanedPayload.rawFlux !== undefined) {
          cleanedPayload.electronFlux = cleanedPayload.rawFlux;
          cleanupNotes.push("Normalized 'rawFlux' to 'electronFlux'");
        }
        if (!cleanedPayload.timestamp) {
          cleanedPayload.timestamp = packet.received_at || new Date().toISOString();
          cleanupNotes.push("Synthesized missing timestamp from reception time");
        }
      } else if (instrument === 'IMA') {
        if (cleanedPayload.amuPerQ === undefined && cleanedPayload.mass && cleanedPayload.energy) {
          cleanedPayload.amuPerQ = cleanedPayload.mass / 1.0;
          cleanupNotes.push("Derived amuPerQ from mass");
        }
        if (cleanedPayload.angle === undefined) {
          cleanedPayload.angle = 0;
          cleanupNotes.push("Zero-filled missing sensor angle");
        }
      } else if (instrument === 'NPD') {
        if (cleanedPayload.oxygenFlux === undefined && cleanedPayload.hydrogenFlux !== undefined) {
          cleanedPayload.oxygenFlux = 0;
          cleanupNotes.push("Defaulted missing oxygenFlux to 0 for single-species acquisition");
        }
        if (cleanedPayload.energyRange === undefined) {
          cleanedPayload.energyRange = 300;
          cleanupNotes.push("Defaulted energyRange to nominal 300 eV");
        }
      }

      cleanupNotes.push('Cleanup normalization completed successfully.');
    }

    const intermediateStatus = isRecoverable ? 'OK' : 'BLOCKED';
    const packetStatus = isRecoverable ? 'CLEANED' : 'BLOCKED';
    const packetCleanedFlag = isRecoverable ? 1 : 0;
    const notesStr = cleanupNotes.join('; ');

    // 1. Insert intermediate_files record
    const { data: interFile, error: interErr } = await supabase
      .from('intermediate_files')
      .insert({
        packet_id: packet.id,
        generated_at: new Date().toISOString(),
        cleanup_notes: notesStr,
        status: intermediateStatus
      })
      .select()
      .single();

    if (interErr) {
      console.error('Failed to create intermediate_files record:', interErr.message);
    }

    // 2. Update telemetry_packets
    const updateFields = {
      cleaned: packetCleanedFlag,
      status: packetStatus
    };
    if (isRecoverable) {
      updateFields.payload_json = cleanedPayload;
    }

    await supabase
      .from('telemetry_packets')
      .update(updateFields)
      .eq('id', packet.id);

    // 3. Log event
    if (isRecoverable) {
      await systemLogger.logEvent(
        'INFO_CLEANUP_SUCCESS',
        `Intermediate file generated for packet '${packet.packet_id}'. Telemetry cleaned.`,
        'INFO',
        { packetId: packet.packet_id, intermediateId: interFile ? interFile.id : null }
      );

      // Phase 5 integration: Archive intermediate file
      try {
        const archiveService = require('./archiveService');
        if (archiveService && typeof archiveService.archiveArtifact === 'function' && interFile) {
          await archiveService.archiveArtifact('INTERMEDIATE', interFile.id, {
            intermediateId: interFile.id,
            packetId: packet.packet_id,
            notes: notesStr,
            status: intermediateStatus
          });
        }
      } catch (archErr) {
        // Archive service may be implemented in later phase
      }
    } else {
      await systemLogger.logEvent(
        'ERR_PROCESSING_BLOCKED',
        `Unrecoverable telemetry corruption in packet '${packet.packet_id}'. Processing blocked. Notes: ${notesStr}`,
        'ERROR',
        { packetId: packet.packet_id, intermediateId: interFile ? interFile.id : null }
      );
    }

    return {
      status: packetStatus,
      cleaned: packetCleanedFlag,
      intermediateFile: interFile,
      payload: isRecoverable ? cleanedPayload : payload,
      notes: notesStr
    };
  }
};

module.exports = cleanupService;
