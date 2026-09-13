const express = require('express');
const router = express.Router();
const supabase = require('../db/supabaseClient');
const { requireAuth, requireAdmin } = require('../middleware/requireAuth');
const systemLogger = require('../services/systemLogger');
const { NotFoundError } = require('../middleware/errorHandler');

// GET /science/dashboard - Full history, all instruments, all release statuses
router.get('/science/dashboard', requireAuth, async (req, res, next) => {
  try {
    const { data: datasets, error } = await supabase
      .from('idfs_datasets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(200).json({ success: true, datasets });
    }

    return res.render('science/dashboard', {
      datasets: datasets || [],
      user: req.session.user
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/datasets/:id/release - Admin toggle to release dataset to public view
router.patch('/api/datasets/:id/release', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: dataset, error: fetchErr } = await supabase
      .from('idfs_datasets')
      .select('*')
      .eq('id', Number(id))
      .maybeSingle();

    if (fetchErr || !dataset) {
      throw new NotFoundError(`IDFS dataset #${id} not found`, 'ERR_DATASET_NOT_FOUND');
    }

    const { data: updated, error: updateErr } = await supabase
      .from('idfs_datasets')
      .update({ public_released: 1 })
      .eq('id', Number(id))
      .select()
      .single();

    if (updateErr) throw updateErr;

    await systemLogger.logEvent(
      'INFO_DATASET_RELEASED',
      `Dataset #${id} (${dataset.instrument}) released for public view by '${req.session.user.username}'`,
      'INFO',
      { datasetId: id, releasedBy: req.session.user.username, instrument: dataset.instrument }
    );

    return res.status(200).json({
      success: true,
      message: `Dataset #${id} successfully marked as public_released`,
      dataset: updated
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
