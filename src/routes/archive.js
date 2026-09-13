const express = require('express');
const router = express.Router();
const supabase = require('../db/supabaseClient');
const systemLogger = require('../services/systemLogger');
const { NotFoundError, AuthError } = require('../middleware/errorHandler');

// GET /api/archive - Browse & filter archive
router.get('/', async (req, res, next) => {
  try {
    const { type, dateFrom, dateTo } = req.query;
    let query = supabase
      .from('archive_records')
      .select('*')
      .order('stored_at', { ascending: false });

    if (type) {
      query = query.eq('artifact_type', type.toUpperCase());
    }
    if (dateFrom) {
      query = query.gte('stored_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('stored_at', dateTo);
    }

    const { data: records, error } = await query;
    if (error) throw error;

    return res.status(200).json({
      success: true,
      count: records.length,
      records
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/archive/:id - Retrieve specific archive record and underlying payload
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data: record, error } = await supabase
      .from('archive_records')
      .select('*')
      .eq('id', Number(id))
      .maybeSingle();

    if (error || !record) {
      throw new NotFoundError(`Archive record #${id} not found`, 'ERR_ARCHIVE_NOT_FOUND');
    }

    // Fetch underlying artifact
    let artifactDetails = null;
    if (record.artifact_type === 'TELEMETRY') {
      const { data } = await supabase
        .from('telemetry_packets')
        .select('*')
        .eq('id', record.artifact_id)
        .maybeSingle();
      artifactDetails = data;
    } else if (record.artifact_type === 'INTERMEDIATE') {
      const { data } = await supabase
        .from('intermediate_files')
        .select('*')
        .eq('id', record.artifact_id)
        .maybeSingle();
      artifactDetails = data;
    } else if (record.artifact_type === 'IDFS') {
      const { data } = await supabase
        .from('idfs_datasets')
        .select('*')
        .eq('id', record.artifact_id)
        .maybeSingle();
      artifactDetails = data;
    }

    return res.status(200).json({
      success: true,
      record,
      artifact: artifactDetails
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/archive/:id - Admin only deletion with audit logging
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check admin authentication
    const user = req.session && req.session.user;
    if (!user || user.role !== 'ADMIN') {
      throw new AuthError('Admin privileges required to delete archive records', 'ERR_FORBIDDEN');
    }

    const { data: record } = await supabase
      .from('archive_records')
      .select('*')
      .eq('id', Number(id))
      .maybeSingle();

    if (!record) {
      throw new NotFoundError(`Archive record #${id} not found`, 'ERR_ARCHIVE_NOT_FOUND');
    }

    // Audit log before deletion
    await systemLogger.logEvent(
      'INFO_ARCHIVE_DELETED',
      `Admin '${user.username}' deleted ${record.artifact_type} archive record #${id} (checksum: ${record.checksum})`,
      'INFO',
      { deletedBy: user.username, archiveRecordId: id, artifactType: record.artifact_type }
    );

    const { error: delErr } = await supabase
      .from('archive_records')
      .delete()
      .eq('id', Number(id));

    if (delErr) throw delErr;

    return res.status(200).json({
      success: true,
      message: `Archive record #${id} deleted successfully`
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
