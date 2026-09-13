const request = require('supertest');
const app = require('../src/app');
const supabase = require('../src/db/supabaseClient');

describe('Phase 5 - Archive (FR-05/06/06a)', () => {
  beforeEach(async () => {
    if (supabase._resetMemoryStore) {
      supabase._resetMemoryStore();
    }
  });

  it('should automatically create archive records with SHA-256 checksums during ingestion and processing', async () => {
    const packet = {
      packetId: 'PKT-ELS-ARCHIVE-01',
      source: 'ASPERA-3',
      instrument: 'ELS',
      cleaned: 1,
      payload: {
        energyRange: 450,
        electronFlux: 19000,
        timestamp: '2026-09-13T02:00:00Z'
      }
    };

    const ingestRes = await request(app)
      .post('/api/telemetry/ingest')
      .send(packet);

    expect(ingestRes.statusCode).toBe(201);

    // Verify archive records exist
    const { data: records } = await supabase
      .from('archive_records')
      .select('*');

    expect(records.length).toBeGreaterThanOrEqual(2); // 1 for TELEMETRY, 1 for IDFS
    const telemetryRecord = records.find(r => r.artifact_type === 'TELEMETRY');
    expect(telemetryRecord).toBeDefined();
    expect(telemetryRecord.checksum).toHaveLength(64); // SHA-256 is 64 hex chars
    expect(telemetryRecord.size_bytes).toBeGreaterThan(0);

    const idfsRecord = records.find(r => r.artifact_type === 'IDFS');
    expect(idfsRecord).toBeDefined();
    expect(idfsRecord.checksum).toHaveLength(64);
  });

  it('should allow querying and filtering archive records via GET /api/archive', async () => {
    // Ingest a packet to populate archive
    await request(app)
      .post('/api/telemetry/ingest')
      .send({
        packetId: 'PKT-ARCHIVE-QUERY-01',
        source: 'ASPERA-3',
        instrument: 'ELS',
        cleaned: 1,
        payload: { energyRange: 100, electronFlux: 200 }
      });

    const res = await request(app)
      .get('/api/archive?type=TELEMETRY');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.records.length).toBeGreaterThan(0);
    expect(res.body.records.every(r => r.artifact_type === 'TELEMETRY')).toBe(true);
  });

  it('should retrieve a specific archive record and underlying payload via GET /api/archive/:id', async () => {
    const ingestRes = await request(app)
      .post('/api/telemetry/ingest')
      .send({
        packetId: 'PKT-ARCHIVE-GET-01',
        source: 'ASPERA-3',
        instrument: 'ELS',
        cleaned: 1,
        payload: { energyRange: 120, electronFlux: 340 }
      });

    const { data: records } = await supabase
      .from('archive_records')
      .select('*')
      .eq('artifact_type', 'TELEMETRY');

    const targetRecord = records[0];
    const res = await request(app).get(`/api/archive/${targetRecord.id}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.record.id).toBe(targetRecord.id);
    expect(res.body.artifact).toBeDefined();
    expect(res.body.artifact.packet_id).toBe('PKT-ARCHIVE-GET-01');
  });

  it('should reject archive deletion by unauthenticated/non-admin users', async () => {
    const res = await request(app).delete('/api/archive/1');
    expect(res.statusCode).toBe(401);
  });
});
