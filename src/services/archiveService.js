const crypto = require('crypto');
const supabase = require('../db/supabaseClient');
const systemLogger = require('./systemLogger');

const archiveService = {
  /**
   * Generates a SHA-256 checksum for arbitrary data
   * @param {string|object} payload
   * @returns {string}
   */
  computeChecksum(payload) {
    const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHash('sha256').update(serialized).digest('hex');
  },

  /**
   * Archives an artifact into archive_records table
   * @param {'TELEMETRY' | 'INTERMEDIATE' | 'IDFS'} artifactType
   * @param {number} artifactId
   * @param {object} payload
   */
  async archiveArtifact(artifactType, artifactId, payload) {
    if (!['TELEMETRY', 'INTERMEDIATE', 'IDFS'].includes(artifactType)) {
      throw new Error(`Invalid artifact type: ${artifactType}`);
    }

    const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const checksum = this.computeChecksum(serialized);
    const sizeBytes = Buffer.byteLength(serialized, 'utf8');
    const storedAt = new Date().toISOString();

    const record = {
      artifact_type: artifactType,
      artifact_id: Number(artifactId),
      stored_at: storedAt,
      checksum,
      size_bytes: sizeBytes
    };

    const { data: inserted, error } = await supabase
      .from('archive_records')
      .insert(record)
      .select()
      .single();

    if (error) {
      console.error(`Failed to archive ${artifactType} #${artifactId}:`, error.message);
      return null;
    }

    await systemLogger.logEvent(
      'INFO_ARTIFACT_ARCHIVED',
      `Archived ${artifactType} artifact #${artifactId} with SHA-256 [${checksum.slice(0, 8)}...] (${sizeBytes} bytes)`,
      'INFO',
      { artifactType, artifactId, checksum, sizeBytes }
    );

    return inserted;
  }
};

module.exports = archiveService;
