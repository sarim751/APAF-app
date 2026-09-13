const supabase = require('../db/supabaseClient');
const { ValidationError } = require('../middleware/errorHandler');

const telemetryValidator = {
  async validateIngest(body) {
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Request body must be a JSON object', 'ERR_INVALID_PACKET');
    }

    const { packetId, source, instrument, cleaned, payload } = body;

    // Required fields check
    if (!packetId || typeof packetId !== 'string' || packetId.trim() === '') {
      throw new ValidationError('Missing or invalid required field: packetId', 'ERR_INVALID_PACKET');
    }

    if (!source || !['ASPERA-3', 'MEX-OA'].includes(source)) {
      throw new ValidationError("Invalid or missing 'source'. Must be 'ASPERA-3' or 'MEX-OA'", 'ERR_INVALID_PACKET');
    }

    if (source === 'ASPERA-3') {
      if (!instrument || !['ELS', 'IMA', 'NPD'].includes(instrument)) {
        throw new ValidationError("Invalid or missing 'instrument' for ASPERA-3. Must be 'ELS', 'IMA', or 'NPD'", 'ERR_INVALID_PACKET');
      }
    } else if (instrument && !['ELS', 'IMA', 'NPD'].includes(instrument)) {
      throw new ValidationError("Invalid 'instrument'. Must be 'ELS', 'IMA', or 'NPD'", 'ERR_INVALID_PACKET');
    }

    if (cleaned === undefined || (cleaned !== 0 && cleaned !== 1 && cleaned !== false && cleaned !== true)) {
      throw new ValidationError("Missing or invalid 'cleaned' flag. Must be 0 or 1", 'ERR_INVALID_PACKET');
    }

    if (!payload || typeof payload !== 'object') {
      throw new ValidationError("Missing or invalid 'payload'. Must be a JSON object", 'ERR_INVALID_PACKET');
    }

    // PacketId uniqueness check in Supabase
    const { data: existing, error } = await supabase
      .from('telemetry_packets')
      .select('id')
      .eq('packet_id', packetId.trim())
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking packet uniqueness:', error.message);
    }

    if (existing) {
      throw new ValidationError(`Packet with packetId '${packetId}' already exists`, 'ERR_INVALID_PACKET');
    }

    // Minimal instrument-specific structure check for pre-cleaned packets
    const isCleaned = cleaned === 1 || cleaned === true;
    if (isCleaned) {
      if (instrument === 'ELS') {
        if (payload.energyRange === undefined || payload.electronFlux === undefined) {
          throw new ValidationError("Cleaned ELS payload must contain 'energyRange' and 'electronFlux'", 'ERR_INVALID_PACKET');
        }
      } else if (instrument === 'IMA') {
        if (payload.amuPerQ === undefined && payload.mass === undefined) {
          throw new ValidationError("Cleaned IMA payload must contain 'amuPerQ' or mass/energy fields", 'ERR_INVALID_PACKET');
        }
      } else if (instrument === 'NPD') {
        if (payload.energyRange === undefined && payload.hydrogenFlux === undefined) {
          throw new ValidationError("Cleaned NPD payload must contain 'energyRange' or flux fields", 'ERR_INVALID_PACKET');
        }
      }
    }

    return {
      packetId: packetId.trim(),
      source,
      instrument: instrument || null,
      cleaned: isCleaned ? 1 : 0,
      payload
    };
  }
};

module.exports = telemetryValidator;
