const request = require('supertest');
const app = require('../src/app');
const supabase = require('../src/db/supabaseClient');

describe('Phase 4 - Processing / IDFS Generation (FR-02 & NFR DR-02a)', () => {
  beforeEach(async () => {
    if (supabase._resetMemoryStore) {
      supabase._resetMemoryStore();
    }
  });

  it('should automatically process a cleaned ELS packet into an IDFS dataset', async () => {
    const elsPacket = {
      packetId: 'PKT-ELS-PROC-01',
      source: 'ASPERA-3',
      instrument: 'ELS',
      cleaned: 1,
      payload: {
        energyRange: 750,
        electronFlux: 32000,
        timestamp: '2026-09-13T01:00:00Z'
      }
    };

    const res = await request(app)
      .post('/api/telemetry/ingest')
      .send(elsPacket);

    expect(res.statusCode).toBe(201);
    expect(res.body.packet.status).toBe('PROCESSED');

    // Verify dataset in Supabase
    const { data: datasets } = await supabase
      .from('idfs_datasets')
      .select('*')
      .eq('instrument', 'ELS');

    expect(datasets.length).toBe(1);
    expect(datasets[0].data_json).toHaveProperty('energyRange', 750);
    expect(datasets[0].data_json).toHaveProperty('electronFlux', 32000);
    expect(datasets[0].public_released).toBe(0);
    expect(datasets[0].processing_started_at).toBeDefined();
    expect(datasets[0].processing_completed_at).toBeDefined();
  });

  it('should accept IMA boundary amuPerQ values at exactly 1 and exactly 1e6', async () => {
    // Boundary 1: amuPerQ = 1
    const imaMin = {
      packetId: 'PKT-IMA-MIN',
      source: 'ASPERA-3',
      instrument: 'IMA',
      cleaned: 1,
      payload: {
        mass: 1,
        energy: 200,
        angle: 45,
        amuPerQ: 1,
        ionFlux: 5000
      }
    };

    const minRes = await request(app)
      .post('/api/telemetry/ingest')
      .send(imaMin);

    expect(minRes.statusCode).toBe(201);
    expect(minRes.body.packet.status).toBe('PROCESSED');

    // Boundary 2: amuPerQ = 1e6
    const imaMax = {
      packetId: 'PKT-IMA-MAX',
      source: 'ASPERA-3',
      instrument: 'IMA',
      cleaned: 1,
      payload: {
        mass: 1000000,
        energy: 500,
        angle: 0,
        amuPerQ: 1000000,
        ionFlux: 8000
      }
    };

    const maxRes = await request(app)
      .post('/api/telemetry/ingest')
      .send(imaMax);

    expect(maxRes.statusCode).toBe(201);
    expect(maxRes.body.packet.status).toBe('PROCESSED');
  });

  it('should reject IMA amuPerQ strictly exceeding 1e6 with ERR_IMA_RANGE', async () => {
    const imaOver = {
      packetId: 'PKT-IMA-OVER',
      source: 'ASPERA-3',
      instrument: 'IMA',
      cleaned: 1,
      payload: {
        mass: 2000000,
        energy: 100,
        angle: 10,
        amuPerQ: 1000001,
        ionFlux: 1000
      }
    };

    const res = await request(app)
      .post('/api/telemetry/ingest')
      .send(imaOver);

    // Ingestion succeeds with RECEIVED status, but processing fails with ERR_IMA_RANGE
    expect(res.statusCode).toBe(201);
    expect(res.body.packet.status).toBe('RECEIVED'); // Did not mark PROCESSED

    // Manual run of processing reveals error
    const runRes = await request(app)
      .post(`/api/processing/run/${res.body.packet.id}`);

    expect(runRes.statusCode).toBe(422);
    expect(runRes.body.code).toBe('ERR_IMA_RANGE');
  });

  it('should exhibit deliberate NPD gap: stores negative hydrogenFlux as-is without rejection', async () => {
    const npdNegativeFlux = {
      packetId: 'PKT-NPD-NEG-FLUX',
      source: 'ASPERA-3',
      instrument: 'NPD',
      cleaned: 1,
      payload: {
        hydrogenFlux: -42.5,
        oxygenFlux: 120,
        energyRange: 350
      }
    };

    const res = await request(app)
      .post('/api/telemetry/ingest')
      .send(npdNegativeFlux);

    expect(res.statusCode).toBe(201);

    const { data: dataset } = await supabase
      .from('idfs_datasets')
      .select('*')
      .eq('instrument', 'NPD')
      .single();

    expect(dataset).toBeDefined();
    // Confirms the deliberate gap: negative flux was stored as-is
    expect(dataset.data_json.hydrogenFlux).toBe(-42.5);
  });
});
