import { Router } from 'express';
import db from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import { checkVitalsAndAlert } from '../services/alertEngine.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_RANGES = { '7d': 7, '30d': 30, '90d': 90 };

const VALID_VITAL_TYPES = [
  'heart_rate', 'blood_pressure', 'blood_pressure_systolic',
  'blood_pressure_diastolic', 'glucose', 'oxygen_saturation',
  'temperature', 'sleep_hours', 'steps',
];

const VITAL_FIELDS = [
  'heart_rate', 'blood_pressure_systolic', 'blood_pressure_diastolic',
  'glucose', 'oxygen_saturation', 'temperature', 'sleep_hours', 'steps',
];

const HIGHER_IS_WORSE = new Set([
  'heart_rate', 'blood_pressure_systolic', 'blood_pressure_diastolic',
  'glucose', 'temperature',
]);

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------

const getPatientStmt = db.prepare('SELECT id FROM patients WHERE id = ?');

const latestVitalStmt = db.prepare(
  'SELECT * FROM vitals WHERE patient_id = ? ORDER BY timestamp DESC LIMIT 1',
);

const insertVitalStmt = db.prepare(`
  INSERT INTO vitals (id, patient_id, timestamp, heart_rate,
    blood_pressure_systolic, blood_pressure_diastolic, glucose,
    oxygen_saturation, temperature, sleep_hours, steps, source)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validatePatient(patientId, res) {
  const patient = getPatientStmt.get(patientId);
  if (!patient) {
    res.status(404).json({ error: 'Patient not found' });
    return false;
  }
  return true;
}

function getRangeStartDate(range) {
  const days = VALID_RANGES[range];
  if (!days) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function getVitalColumns(type) {
  if (type === 'blood_pressure') {
    return ['blood_pressure_systolic', 'blood_pressure_diastolic'];
  }
  return [type];
}

function computeTrend(firstHalfAvg, secondHalfAvg, vitalType) {
  if (firstHalfAvg == null || secondHalfAvg == null || firstHalfAvg === 0) {
    return 'stable';
  }
  const pct = ((secondHalfAvg - firstHalfAvg) / Math.abs(firstHalfAvg)) * 100;

  if (HIGHER_IS_WORSE.has(vitalType)) {
    if (pct > 5) return 'worsening';
    if (pct < -5) return 'improving';
    return 'stable';
  }
  // higher is better (oxygen_saturation, sleep_hours, steps)
  if (pct > 5) return 'improving';
  if (pct < -5) return 'worsening';
  return 'stable';
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export default function createVitalsRouter(io) {
  const router = Router();

  // GET /:patientId/latest
  router.get('/:patientId/latest', (req, res) => {
    const { patientId } = req.params;
    if (!validatePatient(patientId, res)) return;

    const row = latestVitalStmt.get(patientId);
    if (!row) {
      return res.status(404).json({ error: 'No vitals found for this patient' });
    }
    res.json(row);
  });

  // GET /:patientId/summary
  router.get('/:patientId/summary', (req, res) => {
    const { patientId } = req.params;
    if (!validatePatient(patientId, res)) return;

    const range = req.query.range || '7d';
    if (!VALID_RANGES[range]) {
      return res.status(400).json({ error: 'Invalid range. Use 7d, 30d, or 90d.' });
    }

    const days = VALID_RANGES[range];
    const startDate = getRangeStartDate(range);

    const midDate = new Date();
    midDate.setDate(midDate.getDate() - Math.floor(days / 2));
    const midDateStr = midDate.toISOString().replace('T', ' ').slice(0, 19);

    // Aggregate min/max/avg
    const aggCols = VITAL_FIELDS.map(
      v => `MIN(${v}) AS ${v}_min, MAX(${v}) AS ${v}_max, AVG(${v}) AS ${v}_avg`,
    ).join(', ');
    const aggSql = `SELECT ${aggCols} FROM vitals WHERE patient_id = ? AND timestamp >= ?`;
    const aggRow = db.prepare(aggSql).get(patientId, startDate);

    // Half-period averages for trend
    const trendCols = VITAL_FIELDS.map(
      v => `AVG(CASE WHEN timestamp < ? THEN ${v} END) AS ${v}_first,
            AVG(CASE WHEN timestamp >= ? THEN ${v} END) AS ${v}_second`,
    ).join(', ');
    const trendSql = `SELECT ${trendCols} FROM vitals WHERE patient_id = ? AND timestamp >= ?`;
    const trendParams = [];
    for (let i = 0; i < VITAL_FIELDS.length; i++) {
      trendParams.push(midDateStr, midDateStr);
    }
    trendParams.push(patientId, startDate);
    const trendRow = db.prepare(trendSql).get(...trendParams);

    const summary = {};
    for (const vital of VITAL_FIELDS) {
      const avg = aggRow[`${vital}_avg`];
      summary[vital] = {
        min: aggRow[`${vital}_min`] ?? null,
        max: aggRow[`${vital}_max`] ?? null,
        avg: avg != null ? Math.round(avg * 10) / 10 : null,
        trend: computeTrend(
          trendRow[`${vital}_first`],
          trendRow[`${vital}_second`],
          vital,
        ),
      };
    }

    res.json({ patientId, range, summary });
  });

  // GET /:patientId
  router.get('/:patientId', (req, res) => {
    const { patientId } = req.params;
    if (!validatePatient(patientId, res)) return;

    const range = req.query.range || '7d';
    if (!VALID_RANGES[range]) {
      return res.status(400).json({ error: 'Invalid range. Use 7d, 30d, or 90d.' });
    }

    const startDate = getRangeStartDate(range);
    const type = req.query.type;

    let sql = 'SELECT * FROM vitals WHERE patient_id = ? AND timestamp >= ?';
    const params = [patientId, startDate];

    if (type) {
      if (!VALID_VITAL_TYPES.includes(type)) {
        return res.status(400).json({
          error: `Invalid type. Use one of: ${VALID_VITAL_TYPES.join(', ')}`,
        });
      }
      const columns = getVitalColumns(type);
      const notNullClauses = columns.map(c => `${c} IS NOT NULL`).join(' OR ');
      sql += ` AND (${notNullClauses})`;
    }

    sql += ' ORDER BY timestamp DESC';
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  });

  // POST /:patientId
  router.post('/:patientId', async (req, res) => {
    const { patientId } = req.params;
    if (!validatePatient(patientId, res)) return;

    const body = req.body;

    for (const field of VITAL_FIELDS) {
      if (body[field] !== undefined && body[field] !== null) {
        if (typeof body[field] !== 'number' || !isFinite(body[field])) {
          return res.status(400).json({ error: `Field '${field}' must be a number` });
        }
      }
    }

    if (body.source !== undefined && typeof body.source !== 'string') {
      return res.status(400).json({ error: "Field 'source' must be a string" });
    }

    const id = uuidv4();
    const timestamp = body.timestamp || new Date().toISOString().replace('T', ' ').slice(0, 19);
    const source = body.source || 'manual';

    const reading = {
      id,
      patient_id: patientId,
      timestamp,
      heart_rate: body.heart_rate ?? null,
      blood_pressure_systolic: body.blood_pressure_systolic ?? null,
      blood_pressure_diastolic: body.blood_pressure_diastolic ?? null,
      glucose: body.glucose ?? null,
      oxygen_saturation: body.oxygen_saturation ?? null,
      temperature: body.temperature ?? null,
      sleep_hours: body.sleep_hours ?? null,
      steps: body.steps ?? null,
      source,
    };

    insertVitalStmt.run(
      reading.id, reading.patient_id, reading.timestamp,
      reading.heart_rate, reading.blood_pressure_systolic,
      reading.blood_pressure_diastolic, reading.glucose,
      reading.oxygen_saturation, reading.temperature,
      reading.sleep_hours, reading.steps, reading.source,
    );

    // Alert engine checks thresholds, generates AI messages, inserts into DB,
    // and emits Socket.io 'new-alert' events per alert.
    const alerts = await checkVitalsAndAlert(patientId, reading, io);

    io.emit('vitals-updated', { patientId, reading });

    res.status(201).json({ reading, alerts });
  });

  return router;
}
