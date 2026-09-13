const request = require('supertest');
const app = require('../src/app');
const supabase = require('../src/db/supabaseClient');

describe('Phase 3 - Cleanup / Intermediate Files (FR-04)', () => {
  beforeEach(async () => {
    if (supabase._resetMemoryStore) {
      supabase._resetMemoryStore();
    }
  });

  it('should auto-generate an OK intermediate file for uncleaned recoverable telemetry and mark it CLEANED', async () => {
    const uncleanedPacket = {
      packetId: 'PKT-ELS-UNCLEAN-01',
      source: 'ASPERA-3',
      instrument: 'ELS',
      cleaned: 0,
      payload: {
        rawEnergy: 650,
        rawFlux: 15400
      }
    };

    const res = await request(app)
      .post('/api/telemetry/ingest')
      .send(uncleanedPacket);

    expect(res.statusCode).toBe(201);
    expect(['CLEANED', 'PROCESSED']).toContain(res.body.packet.status);
    expect(res.body.packet.cleaned).toBe(1);

    // Verify intermediate file was created
    const { data: interFiles } = await supabase
      .from('intermediate_files')
      .select('*')
      .eq('packet_id', res.body.packet.id);

    expect(interFiles).toHaveLength(1);
    expect(interFiles[0].status).toBe('OK');
    expect(interFiles[0].cleanup_notes).toContain('Normalized');
  });

  it('should generate a BLOCKED intermediate file and mark packet BLOCKED for unrecoverable NPD telemetry', async () => {
    const corruptNpdPacket = {
      packetId: 'PKT-NPD-CORRUPT-01',
      source: 'ASPERA-3',
      instrument: 'NPD',
      cleaned: 0,
      payload: {
        corrupt: true,
        noiseLevel: 999
      }
    };

    const res = await request(app)
      .post('/api/telemetry/ingest')
      .send(corruptNpdPacket);

    expect(res.statusCode).toBe(201);
    expect(res.body.packet.status).toBe('BLOCKED');
    expect(res.body.packet.cleaned).toBe(0);

    // Verify intermediate file status is BLOCKED
    const { data: interFiles } = await supabase
      .from('intermediate_files')
      .select('*')
      .eq('packet_id', res.body.packet.id);

    expect(interFiles).toHaveLength(1);
    expect(interFiles[0].status).toBe('BLOCKED');

    // Verify system error log
    const { data: errorLogs } = await supabase
      .from('system_logs')
      .select('*')
      .eq('code', 'ERR_PROCESSING_BLOCKED');

    expect(errorLogs.length).toBeGreaterThan(0);
  });
});
