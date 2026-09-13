const express = require('express');
const router = express.Router();
const supabase = require('../db/supabaseClient');
const telemetryValidator = require('../services/telemetryValidator');
const systemLogger = require('../services/systemLogger');

router.post('/ingest', async (req, res, next) => {
  try {
    const validated = await telemetryValidator.validateIngest(req.body);

    const newPacket = {
      packet_id: validated.packetId,
      source: validated.source,
      instrument: validated.instrument,
      received_at: new Date().toISOString(),
      cleaned: validated.cleaned,
      status: 'RECEIVED',
      payload_json: validated.payload
    };

    const { data: inserted, error } = await supabase
      .from('telemetry_packets')
      .insert(newPacket)
      .select()
      .single();

    if (error) {
      throw new Error(`Database error during packet ingestion: ${error.message}`);
    }

    const packet = inserted;

    await systemLogger.logEvent(
      'INFO_PACKET_RECEIVED',
      `Telemetry packet '${packet.packet_id}' received from source '${packet.source}' for instrument '${packet.instrument || 'N/A'}'`,
      'INFO',
      { packetId: packet.packet_id, id: packet.id }
    );

    // Archive raw packet (Phase 5 integration)
    try {
      const archiveService = require('../services/archiveService');
      if (archiveService && typeof archiveService.archiveArtifact === 'function') {
        await archiveService.archiveArtifact('TELEMETRY', packet.id, packet);
      }
    } catch (archiveErr) {
      // Archive service may not be implemented yet in early phases
    }

    let cleanupResult = null;
    let processingResult = null;

    // Phase 3 integration: If uncleaned, trigger cleanup
    if (packet.cleaned === 0) {
      try {
        const cleanupService = require('../services/cleanupService');
        if (cleanupService && typeof cleanupService.cleanPacket === 'function') {
          cleanupResult = await cleanupService.cleanPacket(packet);
        }
      } catch (cleanErr) {
        console.warn('Cleanup service trigger notice:', cleanErr.message);
      }
    }

    // Phase 4 integration: If cleaned (or cleaned via cleanupService), trigger processing
    const currentCleaned = cleanupResult ? cleanupResult.cleaned : packet.cleaned;
    const currentStatus = cleanupResult ? cleanupResult.status : packet.status;

    if (currentCleaned === 1 && currentStatus !== 'BLOCKED') {
      try {
        const idfsProcessor = require('../services/idfsProcessor');
        if (idfsProcessor && typeof idfsProcessor.processPacket === 'function') {
          processingResult = await idfsProcessor.processPacket(packet.id);
        }
      } catch (procErr) {
        console.warn('Processing service trigger notice:', procErr.message);
      }
    }

    // Refresh packet state from DB
    const { data: latestPacket } = await supabase
      .from('telemetry_packets')
      .select('*')
      .eq('id', packet.id)
      .single();

    return res.status(201).json({
      success: true,
      message: 'Telemetry packet ingested successfully',
      packet: latestPacket || packet,
      cleanup: cleanupResult,
      processing: processingResult
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
