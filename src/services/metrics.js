const supabase = require('../db/supabaseClient');
const systemLogger = require('./systemLogger');

const metricsService = {
  /**
   * Calculates processing latency metrics per instrument and identifies SLA violations
   */
  async getLatencyMetrics() {
    const scaledSlaMs = Number(process.env.SCALED_SLA_MS || 5000);
    const { data: datasets, error } = await supabase
      .from('idfs_datasets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch datasets for metrics: ${error.message}`);
    }

    const instruments = ['ELS', 'IMA', 'NPD'];
    const summary = {};
    const violations = [];

    instruments.forEach(inst => {
      summary[inst] = {
        count: 0,
        avgLatencyMs: 0,
        maxLatencyMs: 0,
        minLatencyMs: null
      };
    });

    if (datasets) {
      for (const ds of datasets) {
        const inst = ds.instrument;
        if (!summary[inst]) {
          summary[inst] = { count: 0, avgLatencyMs: 0, maxLatencyMs: 0, minLatencyMs: null };
        }

        const start = new Date(ds.processing_started_at).getTime();
        const end = new Date(ds.processing_completed_at).getTime();
        const latencyMs = Math.max(0, end - start);

        summary[inst].count++;
        summary[inst].maxLatencyMs = Math.max(summary[inst].maxLatencyMs, latencyMs);
        summary[inst].minLatencyMs = summary[inst].minLatencyMs === null 
          ? latencyMs 
          : Math.min(summary[inst].minLatencyMs, latencyMs);
        
        // Accumulate for average calculation
        summary[inst]._totalMs = (summary[inst]._totalMs || 0) + latencyMs;

        if (latencyMs > scaledSlaMs) {
          violations.push({
            datasetId: ds.id,
            instrument: inst,
            latencyMs,
            slaLimitMs: scaledSlaMs,
            packetId: ds.packet_id
          });
        }
      }

      // Finalize averages
      for (const inst of Object.keys(summary)) {
        const item = summary[inst];
        if (item.count > 0) {
          item.avgLatencyMs = Number((item._totalMs / item.count).toFixed(2));
        }
        delete item._totalMs;
      }
    }

    return {
      scaledSlaMs,
      summary,
      totalViolations: violations.length,
      violations
    };
  }
};

module.exports = metricsService;
