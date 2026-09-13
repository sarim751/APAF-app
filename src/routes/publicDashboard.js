const express = require('express');
const router = express.Router();
const supabase = require('../db/supabaseClient');

router.get('/', async (req, res, next) => {
  try {
    const instruments = ['ELS', 'IMA', 'NPD'];
    const latestData = {};

    for (const inst of instruments) {
      const { data, error } = await supabase
        .from('idfs_datasets')
        .select('*')
        .eq('instrument', inst)
        .eq('public_released', 1)
        .order('created_at', { ascending: false })
        .limit(1);

      latestData[inst] = data && data.length > 0 ? data[0] : null;
    }

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(200).json({ success: true, instruments: latestData });
    }

    return res.render('public/dashboard', {
      instruments: latestData,
      user: req.session?.user || null
    });
  } catch (err) {
    next(err);
  }
});

router.get('/api/public/summary', async (req, res, next) => {
  try {
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

    return res.status(200).json({ success: true, instruments: latestData });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
