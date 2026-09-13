const request = require('supertest');
const app = require('../src/app');

describe('Phase 0 - Express App Bootstrap', () => {
  it('should respond with 404 for unhandled routes', async () => {
    const res = await request(app).get('/unknown-endpoint');
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('code', 'ERR_NOT_FOUND');
  });
});
