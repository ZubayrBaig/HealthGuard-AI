import { Router } from 'express';
import db from '../db/database.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TYPES = new Set(['critical', 'warning', 'info']);

// Lazy prepared statements (DB tables may not exist at import time)
let _stmts = null;
function stmts() {
  if (!_stmts) {
    _stmts = {
      getPatient: db.prepare('SELECT id FROM patients WHERE id = ?'),
      countUnacknowledged: db.prepare(
        'SELECT COUNT(*) as count FROM alerts WHERE patient_id = ? AND acknowledged = 0',
      ),
      getAlert: db.prepare('SELECT * FROM alerts WHERE id = ?'),
      acknowledge: db.prepare('UPDATE alerts SET acknowledged = 1 WHERE id = ?'),
    };
  }
  return _stmts;
}

function validatePatient(patientId, res) {
  const patient = stmts().getPatient.get(patientId);
  if (!patient) {
    res.status(404).json({ error: 'Patient not found' });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default function createAlertsRouter() {
  const router = Router();

  // GET /:patientId — paginated, filterable alert list
  router.get('/:patientId', (req, res) => {
    const { patientId } = req.params;
    if (!validatePatient(patientId, res)) return;

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 20), 100);
    const offset = (page - 1) * limit;

    // Build dynamic WHERE clause
    const conditions = ['patient_id = ?'];
    const params = [patientId];

    if (req.query.type && VALID_TYPES.has(req.query.type)) {
      conditions.push('type = ?');
      params.push(req.query.type);
    }

    if (req.query.acknowledged === 'true') {
      conditions.push('acknowledged = 1');
    } else if (req.query.acknowledged === 'false') {
      conditions.push('acknowledged = 0');
    }

    const where = conditions.join(' AND ');

    // Total count for pagination metadata
    const countRow = db.prepare(
      `SELECT COUNT(*) as total FROM alerts WHERE ${where}`,
    ).get(...params);
    const total = countRow.total;

    // Fetch page
    const alerts = db.prepare(
      `SELECT * FROM alerts WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ).all(...params, limit, offset);

    // Unacknowledged count (always unfiltered for badge display)
    const { count: unacknowledgedCount } = stmts().countUnacknowledged.get(patientId);

    res.json({
      alerts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      unacknowledgedCount,
    });
  });

  // PATCH /:alertId/acknowledge — mark an alert as acknowledged
  router.patch('/:alertId/acknowledge', (req, res) => {
    const { alertId } = req.params;

    const alert = stmts().getAlert.get(alertId);
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    stmts().acknowledge.run(alertId);

    res.json({ ...alert, acknowledged: 1 });
  });

  // GET /:patientId/unread-count — count of unacknowledged alerts
  router.get('/:patientId/unread-count', (req, res) => {
    const { patientId } = req.params;
    if (!validatePatient(patientId, res)) return;

    const { count } = stmts().countUnacknowledged.get(patientId);
    res.json({ count });
  });

  return router;
}
