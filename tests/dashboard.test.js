const request = require('supertest');
const app = require('../src/app');
const supabase = require('../src/db/supabaseClient');
const seed = require('../src/db/seed');

describe('Phase 6 & 7 - Dashboards (FR-07, FR-08/08a) and Latency Metrics (NFR DR-01a)', () => {
  let agentScientist;
  let agentAdmin;

  beforeEach(async () => {
    if (supabase._resetMemoryStore) {
      supabase._resetMemoryStore();
    }
    await seed();

    // Create session agents
    agentScientist = request.agent(app);
    await agentScientist
      .post('/api/auth/login')
      .send({ username: 'scientist', password: 'science123' });

    agentAdmin = request.agent(app);
    await agentAdmin
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
  });

  it('should only show public_released datasets on the public dashboard (FR-07)', async () => {
    // 1. Ingest an ELS packet (initially public_released = 0)
    await request(app)
      .post('/api/telemetry/ingest')
      .send({
        packetId: 'PKT-ELS-PUB-01',
        source: 'ASPERA-3',
        instrument: 'ELS',
        cleaned: 1,
        payload: { energyRange: 500, electronFlux: 1000 }
      });

    // Public dashboard API check: should be null (not released yet)
    const pubRes1 = await request(app).get('/api/public/summary');
    expect(pubRes1.statusCode).toBe(200);
    expect(pubRes1.body.instruments.ELS).toBeNull();

    // 2. Fetch the dataset ID and release it as Admin
    const { data: datasets } = await supabase.from('idfs_datasets').select('*').eq('instrument', 'ELS');
    const datasetId = datasets[0].id;

    const releaseRes = await agentAdmin
      .patch(`/api/datasets/${datasetId}/release`);
    expect(releaseRes.statusCode).toBe(200);
    expect(releaseRes.body.dataset.public_released).toBe(1);

    // Public dashboard check: should now be visible!
    const pubRes2 = await request(app).get('/api/public/summary');
    expect(pubRes2.statusCode).toBe(200);
    expect(pubRes2.body.instruments.ELS).toBeDefined();
    expect(pubRes2.body.instruments.ELS.id).toBe(datasetId);
  });

  it('should allow science team members to view all datasets regardless of release status (FR-08)', async () => {
    await request(app)
      .post('/api/telemetry/ingest')
      .send({
        packetId: 'PKT-ELS-PRIV-01',
        source: 'ASPERA-3',
        instrument: 'ELS',
        cleaned: 1,
        payload: { energyRange: 300, electronFlux: 5000 }
      });

    const sciRes = await agentScientist
      .get('/science/dashboard')
      .set('Accept', 'application/json');

    expect(sciRes.statusCode).toBe(200);
    expect(sciRes.body.datasets.length).toBeGreaterThan(0);
    expect(sciRes.body.datasets[0].public_released).toBe(0);
  });

  it('should compute processing latency metrics via GET /api/metrics/latency (NFR APAF-DR-01a)', async () => {
    await request(app)
      .post('/api/telemetry/ingest')
      .send({
        packetId: 'PKT-METRICS-01',
        source: 'ASPERA-3',
        instrument: 'ELS',
        cleaned: 1,
        payload: { energyRange: 400, electronFlux: 8000 }
      });

    const res = await request(app).get('/api/metrics/latency');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.metrics).toHaveProperty('scaledSlaMs');
    expect(res.body.metrics.summary).toHaveProperty('ELS');
    expect(res.body.metrics.summary.ELS.count).toBeGreaterThan(0);
  });

  it('should render HTML views for public and admin logs', async () => {
    const pubHtml = await request(app).get('/');
    expect(pubHtml.statusCode).toBe(200);
    expect(pubHtml.text).toContain('ASPERA-3 / Mars Express Public Science Portal');

    const adminHtml = await agentAdmin.get('/admin/logs');
    expect(adminHtml.statusCode).toBe(200);
    expect(adminHtml.text).toContain('System Logs');
  });
});
