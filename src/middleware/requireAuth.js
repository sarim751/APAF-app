const { AuthError } = require('./errorHandler');

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }

  // If HTML request (browser navigation), redirect to login
  if (req.accepts('html') && !req.path.startsWith('/api/')) {
    return res.redirect('/auth/login?redirect=' + encodeURIComponent(req.originalUrl));
  }

  return next(new AuthError('Authentication required to access this resource', 'ERR_UNAUTHORIZED'));
};

const requireAdmin = (req, res, next) => {
  if (!req.session || !req.session.user) {
    if (req.accepts('html') && !req.path.startsWith('/api/')) {
      return res.redirect('/auth/login?redirect=' + encodeURIComponent(req.originalUrl));
    }
    return next(new AuthError('Authentication required', 'ERR_UNAUTHORIZED'));
  }

  if (req.session.user.role !== 'ADMIN') {
    const err = new Error('Admin privileges required');
    err.code = 'ERR_FORBIDDEN';
    err.status = 403;
    return next(err);
  }

  next();
};

module.exports = {
  requireAuth,
  requireAdmin
};
