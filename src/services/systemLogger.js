const supabase = require('../db/supabaseClient');

const systemLogger = {
  /**
   * Log an event into system_logs table
   * @param {string} code - e.g. ERR_INVALID_PACKET, ERR_AUTH_FAILED, INFO_INGEST_SUCCESS
   * @param {string} message - human-readable description
   * @param {'INFO' | 'WARNING' | 'ERROR'} severity
   * @param {object|null} context
   */
  async logEvent(code, message, severity = 'INFO', context = null) {
    try {
      const validSeverities = ['INFO', 'WARNING', 'ERROR'];
      const normalizedSeverity = validSeverities.includes(severity) ? severity : 'INFO';

      const entry = {
        code,
        message,
        severity: normalizedSeverity,
        context_json: context ? (typeof context === 'string' ? context : JSON.stringify(context)) : null,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('system_logs')
        .insert(entry);

      if (error) {
        console.error('systemLogger error writing to DB:', error.message);
      }

      return data;
    } catch (err) {
      console.error('systemLogger exception:', err);
    }
  }
};

module.exports = systemLogger;
