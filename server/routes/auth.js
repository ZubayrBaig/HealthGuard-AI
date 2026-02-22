import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database.js';

// ---------------------------------------------------------------------------
// Lazy prepared statements
// ---------------------------------------------------------------------------

let _stmts = null;
function stmts() {
  if (!_stmts) {
    _stmts = {
      getByAuth0Sub: db.prepare('SELECT * FROM patients WHERE auth0_sub = ?'),
      getFirstUnlinked: db.prepare(
        'SELECT * FROM patients WHERE auth0_sub IS NULL ORDER BY created_at ASC LIMIT 1',
      ),
      linkPatient: db.prepare('UPDATE patients SET auth0_sub = ? WHERE id = ?'),
      insertPatient: db.prepare(`
        INSERT INTO patients (id, name, date_of_birth, conditions, medications, auth0_sub, created_at)
        VALUES (?, ?, ?, '[]', '[]', ?, datetime('now'))
      `),
    };
  }
  return _stmts;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePatient(row) {
  if (!row) return null;
  return {
    ...row,
    conditions: JSON.parse(row.conditions || '[]'),
    medications: JSON.parse(row.medications || '[]'),
    alert_preferences: JSON.parse(
      row.alert_preferences || '{"critical":true,"warning":true,"info":true}',
    ),
    normal_ranges: JSON.parse(row.normal_ranges || '{}'),
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default function createAuthRouter() {
  const router = Router();

  // POST /api/auth/link-patient
  // Links the authenticated Auth0 user to a patient record.
  // 1. If a patient already has this auth0_sub, return it.
  // 2. If an unlinked patient exists, link it (covers demo-seed scenario).
  // 3. Otherwise, create a new patient.
  router.post('/link-patient', (req, res) => {
    if (!req.user || !req.user.sub) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { sub, email, name } = req.user;

    // 1. Already linked?
    let patient = stmts().getByAuth0Sub.get(sub);
    if (patient) {
      return res.json(parsePatient(patient));
    }

    // 2. Link to first unlinked patient
    const unlinked = stmts().getFirstUnlinked.get();
    if (unlinked) {
      stmts().linkPatient.run(sub, unlinked.id);
      patient = stmts().getByAuth0Sub.get(sub);
      return res.json(parsePatient(patient));
    }

    // 3. Create new patient
    const id = uuidv4();
    const patientName = name || email || 'New Patient';
    stmts().insertPatient.run(id, patientName, '1990-01-01', sub);
    patient = stmts().getByAuth0Sub.get(sub);
    return res.status(201).json(parsePatient(patient));
  });

  // GET /api/auth/me
  // Returns the patient linked to the current Auth0 user.
  router.get('/me', (req, res) => {
    if (!req.user || !req.user.sub) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const patient = stmts().getByAuth0Sub.get(req.user.sub);
    if (!patient) {
      return res.status(404).json({ error: 'No patient linked to this account' });
    }

    res.json({
      ...parsePatient(patient),
      auth0: {
        email: req.user.email,
        name: req.user.name,
        picture: req.user.picture,
      },
    });
  });

  return router;
}
