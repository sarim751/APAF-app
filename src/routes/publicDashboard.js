const express = require('express');
const router = express.Router();
const supabase = require('../db/supabaseClient');

// Helper to fetch latest released dataset for each instrument
async function getLatestReleasedData() {
  const instruments = ['ELS', 'IMA', 'NPD'];
  const latestData = {};

  for (const inst of instruments) {
    const { data } = await supabase
      .from('idfs_datasets')
      .select('*')
      .eq('instrument', inst)
      .eq('public_released', 1)
      .order('created_at', { ascending: false })
      .limit(1);

    latestData[inst] = data && data.length > 0 ? data[0] : null;
  }
  return latestData;
}

// GET / - Separate Dedicated Mission Homepage with Interactive Preview Hub
router.get('/', async (req, res, next) => {
  try {
    const latestData = await getLatestReleasedData();

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(200).json({ success: true, instruments: latestData });
    }

    return res.render('public/home', {
      instruments: latestData,
      user: req.session?.user || null
    });
  } catch (err) {
    next(err);
  }
});

// GET /preview - Dedicated Public Data Preview Center with Instrument Filter Options
router.get(['/preview', '/telemetry', '/dashboard'], async (req, res, next) => {
  try {
    const latestData = await getLatestReleasedData();
    const selectedInstrument = (req.query.instrument || 'ALL').toUpperCase();

    return res.render('public/preview', {
      instruments: latestData,
      selectedInstrument,
      user: req.session?.user || null
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/summary - JSON endpoint for automated tests & integrations
router.get('/api/public/summary', async (req, res, next) => {
  try {
    const latestData = await getLatestReleasedData();
    return res.status(200).json({ success: true, instruments: latestData });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
