const express = require('express');
const router = express.Router();
const authService = require('../services/auth');
const { loginRateLimiter } = require('../middleware/rateLimit');

// GET /auth/login - Render login form
router.get('/login', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/science/dashboard');
  }
  res.render('science/login', { error: null, redirect: req.query.redirect || '/science/dashboard' });
});

// POST /auth/login - Form-based login
router.post('/login', loginRateLimiter, async (req, res) => {
  try {
    const { username, password, redirect } = req.body;
    const user = await authService.authenticate(username, password, { ip: req.ip });
    req.session.user = user;
    return res.redirect(redirect || '/science/dashboard');
  } catch (err) {
    return res.render('science/login', {
      error: err.message,
      redirect: req.body.redirect || '/science/dashboard'
    });
  }
});

// POST /api/auth/login - API JSON login
router.post('/api/auth/login', loginRateLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const user = await authService.authenticate(username, password, { ip: req.ip });
    req.session.user = user;
    return res.status(200).json({
      success: true,
      message: 'Authentication successful',
      user
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout - API Logout
router.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  });
});

// GET /auth/logout - Browser Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// GET /api/auth/me - Check current session
router.get('/api/auth/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.status(200).json({ authenticated: true, user: req.session.user });
  }
  return res.status(200).json({ authenticated: false, user: null });
});

module.exports = router;
