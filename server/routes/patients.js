import { Router } from 'express';
import db from '../db/database.js';

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------

const getAllPatientsStmt = db.prepare(
  'SELECT id, name, date_of_birth, conditions, medications FROM patients ORDER BY name',
);

const getPatientByIdStmt = db.prepare(
  'SELECT * FROM patients WHERE id = ?',
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePatient(row) {
  return {
    ...row,
    conditions: JSON.parse(row.conditions || '[]'),
    medications: JSON.parse(row.medications || '[]'),
    alert_preferences: JSON.parse(row.alert_preferences || '{"critical":true,"warning":true,"info":true}'),
    normal_ranges: JSON.parse(row.normal_ranges || '{}'),
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default function createPatientsRouter() {
  const router = Router();

  // GET / — list all patients
  router.get('/', (req, res) => {
    const rows = getAllPatientsStmt.all();
    const patients = rows.map(row => ({
      ...row,
      conditions: JSON.parse(row.conditions),
      medications: JSON.parse(row.medications),
    }));
    res.json(patients);
  });

  // GET /:id — single patient detail
  router.get('/:id', (req, res) => {
    const row = getPatientByIdStmt.get(req.params.id);
    if (!row) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    res.json(parsePatient(row));
  });

  // PUT /:id — update patient profile
  router.put('/:id', (req, res) => {
    const row = getPatientByIdStmt.get(req.params.id);
    if (!row) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const allowedFields = [
      'name', 'date_of_birth',
      'emergency_contact_name', 'emergency_contact_phone',
      'gender', 'height_inches', 'weight_lbs', 'blood_type',
      'primary_care_provider', 'provider_phone', 'provider_clinic',
      'pharmacy_name', 'pharmacy_address', 'pharmacy_phone',
    ];
    const jsonFields = ['conditions', 'medications', 'alert_preferences', 'normal_ranges'];

    const setClauses = [];
    const values = [];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        setClauses.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }

    for (const field of jsonFields) {
      if (req.body[field] !== undefined) {
        setClauses.push(`${field} = ?`);
        values.push(JSON.stringify(req.body[field]));
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(req.params.id);
    db.prepare(`UPDATE patients SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);

    const updated = getPatientByIdStmt.get(req.params.id);
    res.json(parsePatient(updated));
  });

  return router;
}
