const systemLogger = require('../services/systemLogger');

class AppError extends Error {
  constructor(message, code, status = 400, context = null) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, code = 'ERR_INVALID_PACKET', context = null) {
    super(message, code, 400, context);
  }
}

class ProcessingError extends AppError {
  constructor(message, code = 'ERR_PROCESSING_FAILED', context = null) {
    super(message, code, 422, context);
  }
}

class AuthError extends AppError {
  constructor(message, code = 'ERR_AUTH_FAILED', context = null) {
    super(message, code, 401, context);
  }
}

class NotFoundError extends AppError {
  constructor(message, code = 'ERR_NOT_FOUND', context = null) {
    super(message, code, 404, context);
  }
}

const errorHandler = async (err, req, res, next) => {
  const status = err.status || 500;
  const code = err.code || 'ERR_INTERNAL_SERVER';
  const message = err.message || 'An unexpected error occurred';
  const severity = status >= 500 ? 'ERROR' : (status >= 400 ? 'WARNING' : 'INFO');

  // Asynchronously log to system_logs
  try {
    await systemLogger.logEvent(
      code,
      message,
      severity === 'WARNING' && code === 'ERR_INVALID_PACKET' ? 'ERROR' : severity,
      err.context || { path: req.path, method: req.method, ip: req.ip }
    );
  } catch (logErr) {
    console.error('Failed to log error into system_logs:', logErr);
  }

  res.status(status).json({
    code,
    message
  });
};

module.exports = {
  AppError,
  ValidationError,
  ProcessingError,
  AuthError,
  NotFoundError,
  errorHandler
};
