const rateLimit = require('express-rate-limit');
const systemLogger = require('../services/systemLogger');

const loginRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'ERR_AUTH_RATE_LIMIT',
    message: 'Too many login attempts. Please try again after 10 minutes.'
  },
  handler: async (req, res, next, options) => {
    await systemLogger.logEvent(
      'ERR_AUTH_FAILED',
      `Rate limit exceeded for login attempts from IP ${req.ip}`,
      'WARNING',
      { ip: req.ip, path: req.path }
    );
    res.status(429).json(options.message);
  },
  skip: (req) => {
    // Skip rate limiter in test environment unless explicitly testing rate limiting
    return process.env.NODE_ENV === 'test' && !req.headers['x-test-ratelimit'];
  }
});

module.exports = {
  loginRateLimiter
};
