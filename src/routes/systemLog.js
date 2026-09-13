const express = require('express');
const router = express.Router();
const supabase = require('../db/supabaseClient');
const { requireAdmin } = require('../middleware/requireAuth');

router.get('/admin/logs', requireAdmin, async (req, res, next) => {
  try {
    const { severity, limit } = req.query;
    let query = supabase
      .from('system_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (severity) {
      query = query.eq('severity', severity.toUpperCase());
    }

    if (limit) {
      query = query.limit(Number(limit));
    } else {
      query = query.limit(100);
    }

    const { data: logs, error } = await query;
    if (error) throw error;

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(200).json({ success: true, count: logs.length, logs });
    }

    return res.render('admin/logs', {
      logs: logs || [],
      selectedSeverity: severity || '',
      user: req.session.user
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
