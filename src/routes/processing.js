const express = require('express');
const router = express.Router();
const idfsProcessor = require('../services/idfsProcessor');
const supabase = require('../db/supabaseClient');

router.post('/run/:packetId', async (req, res, next) => {
  try {
    const dataset = await idfsProcessor.processPacket(req.params.packetId);
    return res.status(200).json({
      success: true,
      message: 'Packet processed successfully into IDFS dataset',
      dataset
    });
  } catch (err) {
    next(err);
  }
});

router.get('/datasets', async (req, res, next) => {
  try {
    const { instrument } = req.query;
    let query = supabase.from('idfs_datasets').select('*').order('created_at', { ascending: false });

    if (instrument) {
      query = query.eq('instrument', instrument.toUpperCase());
    }

    const { data: datasets, error } = await query;
    if (error) throw error;

    return res.status(200).json({ success: true, datasets });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
