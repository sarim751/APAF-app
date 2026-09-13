const path = require('path');
require('dotenv').config();
const express = require('express');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets (supports root public and src/public across all working directories)
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.static(path.join(process.cwd(), 'public')));
app.use(express.static(path.join(__dirname, 'public')));



// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'apaf-lite-secret-fallback',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  })
);

const { errorHandler } = require('./middleware/errorHandler');
const ingestionRouter = require('./routes/ingestion');
const processingRouter = require('./routes/processing');
const archiveRouter = require('./routes/archive');
const authRouter = require('./routes/auth');
const publicDashboardRouter = require('./routes/publicDashboard');
const scienceTeamRouter = require('./routes/scienceTeam');
const systemLogRouter = require('./routes/systemLog');
const metricsRouter = require('./routes/metrics');

// Mount routes
app.use(publicDashboardRouter); // mounts GET /
app.use(authRouter); // mounts /auth and /api/auth
app.use(scienceTeamRouter); // mounts /science and /api/datasets
app.use(systemLogRouter); // mounts /admin/logs
app.use('/api/telemetry', ingestionRouter);
app.use('/api/processing', processingRouter);
app.use('/api/archive', archiveRouter);
app.use('/api/metrics', metricsRouter);

// 404 Handler for undefined routes
app.use((req, res, next) => {
  res.status(404).json({
    code: 'ERR_NOT_FOUND',
    message: `Cannot ${req.method} ${req.path}`
  });
});

// Central error handling middleware
app.use(errorHandler);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`APAF-Lite server running on port ${PORT}`);
  });
}

module.exports = app;
