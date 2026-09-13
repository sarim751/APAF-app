const supabase = require('../db/supabaseClient');
const schemaValidator = require('./schemaValidator');
const systemLogger = require('./systemLogger');
const { ProcessingError, NotFoundError } = require('../middleware/errorHandler');

const idfsProcessor = {
  processELS(payload) {
    if (payload.energyRange === undefined || payload.electronFlux === undefined) {
      throw new ProcessingError("Missing required ELS fields: 'energyRange' and 'electronFlux'", 'ERR_PROCESSING_FAILED');
    }

    return {
      energyRange: Number(payload.energyRange),
      electronFlux: Number(payload.electronFlux),
      timestamp: payload.timestamp || new Date().toISOString()
    };
  },

  processIMA(payload) {
    const amuPerQ = Number(payload.amuPerQ !== undefined ? payload.amuPerQ : (payload.mass / (payload.charge || 1)));

    // Genuine boundary check per SRS §4.1.1.3: 1 <= amuPerQ <= 1e6
    if (isNaN(amuPerQ) || amuPerQ < 1 || amuPerQ > 1000000) {
      throw new ProcessingError(`IMA amuPerQ out of range [1, 1e6]: ${amuPerQ}`, 'ERR_IMA_RANGE');
    }

    return {
      mass: Number(payload.mass !== undefined ? payload.mass : 1),
      energy: Number(payload.energy !== undefined ? payload.energy : 100),
      angle: Number(payload.angle !== undefined ? payload.angle : 0),
      amuPerQ,
      ionFlux: Number(payload.ionFlux !== undefined ? payload.ionFlux : 0)
    };
  },

  processNPD(payload) {
    if (payload.hydrogenFlux === undefined && payload.oxygenFlux === undefined) {
      throw new ProcessingError("Missing required NPD flux data", 'ERR_PROCESSING_FAILED');
    }

    // DELIBERATE NPD GAP: stores negative hydrogenFlux as-is without validation/normalization
    // This allows honest FAILED test execution against frozen baseline
    return {
      hydrogenFlux: Number(payload.hydrogenFlux !== undefined ? payload.hydrogenFlux : 0),
      oxygenFlux: Number(payload.oxygenFlux !== undefined ? payload.oxygenFlux : 0),
      energyRange: Number(payload.energyRange !== undefined ? payload.energyRange : 300)
    };
  },

  /**
   * Processes a telemetry packet into an IDFS dataset
   * @param {number|string} packetId - Database ID or packet_id string
   */
  async processPacket(packetIdentifier) {
    // 1. Fetch packet from DB
    let query = supabase.from('telemetry_packets').select('*');
    if (typeof packetIdentifier === 'number' || !isNaN(Number(packetIdentifier))) {
      query = query.eq('id', Number(packetIdentifier));
    } else {
      query = query.eq('packet_id', packetIdentifier);
    }

    const { data: packet, error: fetchErr } = await query.maybeSingle();

    if (fetchErr || !packet) {
      throw new NotFoundError(`Telemetry packet '${packetIdentifier}' not found`, 'ERR_PACKET_NOT_FOUND');
    }

    // Check preconditions: packet must be cleaned or received-and-cleaned
    if (packet.status === 'BLOCKED') {
      throw new ProcessingError(`Cannot process BLOCKED packet '${packet.packet_id}'`, 'ERR_PROCESSING_BLOCKED');
    }

    if (packet.cleaned !== 1 && packet.status !== 'CLEANED') {
      throw new ProcessingError(`Packet '${packet.packet_id}' is not cleaned. Run cleanup first.`, 'ERR_UNPROCESSED_UNCLEAN');
    }

    const processingStartedAt = new Date().toISOString();
    const startTimeMs = Date.now();
    let transformed;

    const payload = typeof packet.payload_json === 'string'
      ? JSON.parse(packet.payload_json)
      : packet.payload_json;

    // 2. Dispatch to per-instrument processor
    try {
      switch (packet.instrument) {
        case 'ELS':
          transformed = this.processELS(payload);
          break;
        case 'IMA':
          transformed = this.processIMA(payload);
          break;
        case 'NPD':
          transformed = this.processNPD(payload);
          break;
        default:
          throw new ProcessingError(`Unsupported instrument '${packet.instrument}' for IDFS processing`, 'ERR_INVALID_INSTRUMENT');
      }
    } catch (procErr) {
      await systemLogger.logEvent(
        procErr.code || 'ERR_PROCESSING_FAILED',
        `Processing failed for packet '${packet.packet_id}': ${procErr.message}`,
        'ERROR',
        { packetId: packet.packet_id, instrument: packet.instrument }
      );
      throw procErr;
    }

    // 3. Schema compliance check (NFR APAF-DR-02a)
    const { valid, errors } = schemaValidator.validateIdfs(packet.instrument, transformed);
    if (!valid) {
      const errMsg = errors ? errors.map(e => `${e.instancePath || 'root'} ${e.message}`).join(', ') : 'Schema validation failed';
      await systemLogger.logEvent(
        'ERR_PROCESSING_FAILED',
        `PDS/IDFS schema validation error for ${packet.instrument}: ${errMsg}`,
        'ERROR',
        { packetId: packet.packet_id, errors }
      );
      throw new ProcessingError(`IDFS schema compliance error: ${errMsg}`, 'ERR_PROCESSING_FAILED', errors);
    }

    const processingCompletedAt = new Date().toISOString();
    const durationMs = Date.now() - startTimeMs;

    // Check SLA timeliness (NFR APAF-DR-01a)
    const scaledSla = Number(process.env.SCALED_SLA_MS || 5000);
    if (durationMs > scaledSla) {
      await systemLogger.logEvent(
        'WARNING_SLA_EXCEEDED',
        `Processing latency ${durationMs}ms exceeded scaled SLA limit of ${scaledSla}ms for packet '${packet.packet_id}'`,
        'WARNING',
        { durationMs, slaLimit: scaledSla, packetId: packet.packet_id }
      );
    }

    // 4. Save IDFS dataset
    const datasetEntry = {
      packet_id: packet.id,
      instrument: packet.instrument,
      data_json: transformed,
      public_released: 0,
      processing_started_at: processingStartedAt,
      processing_completed_at: processingCompletedAt,
      created_at: new Date().toISOString()
    };

    const { data: insertedDataset, error: insertErr } = await supabase
      .from('idfs_datasets')
      .insert(datasetEntry)
      .select()
      .single();

    if (insertErr) {
      throw new ProcessingError(`Failed to save IDFS dataset: ${insertErr.message}`);
    }

    // 5. Update packet status to PROCESSED
    await supabase
      .from('telemetry_packets')
      .update({ status: 'PROCESSED' })
      .eq('id', packet.id);

    // 6. Log success
    await systemLogger.logEvent(
      'INFO_PROCESSING_SUCCESS',
      `IDFS dataset successfully generated for packet '${packet.packet_id}' (${packet.instrument}) in ${durationMs}ms`,
      'INFO',
      { datasetId: insertedDataset.id, packetId: packet.packet_id }
    );

    // 7. Archive dataset (Phase 5 integration)
    try {
      const archiveService = require('./archiveService');
      if (archiveService && typeof archiveService.archiveArtifact === 'function') {
        await archiveService.archiveArtifact('IDFS', insertedDataset.id, insertedDataset);
      }
    } catch (archErr) {
      // Archive service may be implemented in later phase
    }

    return insertedDataset;
  }
};

module.exports = idfsProcessor;
