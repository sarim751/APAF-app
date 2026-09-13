const express = require('express');
const router = express.Router();
const metricsService = require('../services/metrics');

router.get('/latency', async (req, res, next) => {
  try {
    const metrics = await metricsService.getLatencyMetrics();
    return res.status(200).json({
      success: true,
      metrics
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
