const request = require('supertest');
const app = require('../src/app');
const supabase = require('../src/db/supabaseClient');
const seed = require('../src/db/seed');

describe('Phase 6 - Security & Authentication (NFR APAF-PR-01)', () => {
  beforeEach(async () => {
    if (supabase._resetMemoryStore) {
      supabase._resetMemoryStore();
    }
    await seed();
  });

  it('should successfully log in with valid science team credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'scientist', password: 'science123' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toHaveProperty('username', 'scientist');
    expect(res.body.user).toHaveProperty('role', 'SCIENCE_TEAM');
  });

  it('should reject invalid password with 401 and log ERR_AUTH_FAILED', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'scientist', password: 'wrongPassword' });

    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('ERR_AUTH_FAILED');

    // Verify system log entry
    const { data: logs } = await supabase
      .from('system_logs')
      .select('*')
      .eq('code', 'ERR_AUTH_FAILED');

    expect(logs.length).toBeGreaterThan(0);
  });

  it('should block unauthenticated access to /science/dashboard API', async () => {
    const res = await request(app)
      .get('/science/dashboard')
      .set('Accept', 'application/json');

    expect(res.statusCode).toBe(401);
  });

  it('should enforce rate limiting after repeated failed attempts', async () => {
    // Send 5 failed requests
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .set('x-test-ratelimit', 'true')
        .send({ username: 'scientist', password: 'bad' });
    }

    // 6th attempt should be rate-limited
    const rateLimitedRes = await request(app)
      .post('/api/auth/login')
      .set('x-test-ratelimit', 'true')
      .send({ username: 'scientist', password: 'bad' });

    expect(rateLimitedRes.statusCode).toBe(429);
    expect(rateLimitedRes.body.code).toBe('ERR_AUTH_RATE_LIMIT');
  });
});
