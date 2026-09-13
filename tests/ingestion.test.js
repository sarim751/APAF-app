const request = require('supertest');
const app = require('../src/app');
const supabase = require('../src/db/supabaseClient');

describe('Phase 2 - Telemetry Ingestion (FR-01 & FR-09)', () => {
  beforeEach(async () => {
    if (supabase._resetMemoryStore) {
      supabase._resetMemoryStore();
    }
  });

  it('should successfully ingest a valid ELS telemetry packet', async () => {
    const validPacket = {
      packetId: 'PKT-ELS-001',
      source: 'ASPERA-3',
      instrument: 'ELS',
      cleaned: 1,
      payload: {
        energyRange: 500,
        electronFlux: 12500,
        timestamp: '2026-09-13T00:00:00Z'
      }
    };

    const res = await request(app)
      .post('/api/telemetry/ingest')
      .send(validPacket);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.packet).toHaveProperty('packet_id', 'PKT-ELS-001');
    expect(['RECEIVED', 'PROCESSED']).toContain(res.body.packet.status);
    expect(res.body.packet).toHaveProperty('cleaned', 1);

    // Verify DB entry
    const { data: dbPacket } = await supabase
      .from('telemetry_packets')
      .select('*')
      .eq('packet_id', 'PKT-ELS-001')
      .single();

    expect(dbPacket).toBeDefined();
    expect(dbPacket.packet_id).toBe('PKT-ELS-001');
  });

  it('should reject a packet with missing required fields (e.g. missing packetId)', async () => {
    const invalidPacket = {
      source: 'ASPERA-3',
      instrument: 'ELS',
      cleaned: 1,
      payload: { energyRange: 100, electronFlux: 200 }
    };

    const res = await request(app)
      .post('/api/telemetry/ingest')
      .send(invalidPacket);

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('code', 'ERR_INVALID_PACKET');

    // Verify error was logged in system_logs (FR-09)
    const { data: logs } = await supabase
      .from('system_logs')
      .select('*')
      .eq('code', 'ERR_INVALID_PACKET');

    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].severity).toBe('ERROR');
  });

  it('should reject duplicate packet IDs', async () => {
    const packet = {
      packetId: 'PKT-ELS-DUP-01',
      source: 'ASPERA-3',
      instrument: 'ELS',
      cleaned: 1,
      payload: { energyRange: 200, electronFlux: 500 }
    };

    // First ingest: success
    const firstRes = await request(app)
      .post('/api/telemetry/ingest')
      .send(packet);
    expect(firstRes.statusCode).toBe(201);

    // Second ingest: duplicate
    const secondRes = await request(app)
      .post('/api/telemetry/ingest')
      .send(packet);
    expect(secondRes.statusCode).toBe(400);
    expect(secondRes.body.code).toBe('ERR_INVALID_PACKET');
  });
});
