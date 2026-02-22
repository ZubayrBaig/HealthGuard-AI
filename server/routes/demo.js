import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database.js';
import { seedDb } from '../db/schema.js';
import { checkVitalsAndAlert } from '../services/alertEngine.js';
import { setCachedPrediction } from '../services/riskEngine.js';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let currentStep = 0;
let demoPatientId = null;

// ---------------------------------------------------------------------------
// Lazy prepared statements
// ---------------------------------------------------------------------------

let _stmts = null;
function stmts() {
  if (!_stmts) {
    _stmts = {
      firstPatient: db.prepare('SELECT id, name, conditions, medications FROM patients LIMIT 1'),
      patientCount: db.prepare('SELECT COUNT(*) as count FROM patients'),
      deleteVitals: db.prepare('DELETE FROM vitals WHERE patient_id = ?'),
      deleteAlerts: db.prepare('DELETE FROM alerts WHERE patient_id = ?'),
      deleteChat: db.prepare('DELETE FROM chat_history WHERE patient_id = ?'),
      insertVital: db.prepare(`
        INSERT INTO vitals (id, patient_id, timestamp, heart_rate,
          blood_pressure_systolic, blood_pressure_diastolic, glucose,
          oxygen_saturation, temperature, sleep_hours, steps, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
    };
  }
  return _stmts;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowTimestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function insertReading(patientId, vitals, io) {
  const id = uuidv4();
  const timestamp = nowTimestamp();

  const reading = {
    id,
    patient_id: patientId,
    timestamp,
    heart_rate: vitals.heart_rate,
    blood_pressure_systolic: vitals.blood_pressure_systolic,
    blood_pressure_diastolic: vitals.blood_pressure_diastolic,
    glucose: vitals.glucose,
    oxygen_saturation: vitals.oxygen_saturation,
    temperature: vitals.temperature,
    sleep_hours: vitals.sleep_hours ?? null,
    steps: vitals.steps ?? null,
    source: 'demo',
  };

  stmts().insertVital.run(
    reading.id, reading.patient_id, reading.timestamp,
    reading.heart_rate, reading.blood_pressure_systolic,
    reading.blood_pressure_diastolic, reading.glucose,
    reading.oxygen_saturation, reading.temperature,
    reading.sleep_hours, reading.steps, reading.source,
  );

  return reading;
}

// ---------------------------------------------------------------------------
// Normal vitals templates for Step 2 (slight variations across 3 readings)
// ---------------------------------------------------------------------------

const NORMAL_READINGS = [
  { heart_rate: 72, blood_pressure_systolic: 118, blood_pressure_diastolic: 76, glucose: 110, oxygen_saturation: 97, temperature: 98.4 },
  { heart_rate: 74, blood_pressure_systolic: 120, blood_pressure_diastolic: 78, glucose: 108, oxygen_saturation: 97.5, temperature: 98.3 },
  { heart_rate: 71, blood_pressure_systolic: 116, blood_pressure_diastolic: 74, glucose: 112, oxygen_saturation: 97, temperature: 98.5 },
];

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export default function createDemoRouter(io) {
  const router = Router();

  // POST /api/demo/seed — seed demo data if database is empty
  router.post('/seed', (req, res) => {
    const { count } = stmts().patientCount.get();
    if (count > 0) {
      return res.status(400).json({ error: 'Database already has patient data' });
    }
    seedDb();
    const patient = stmts().firstPatient.get();
    res.json({ message: 'Demo data created', patient });
  });

  // GET /api/demo/status
  router.get('/status', (req, res) => {
    res.json({ currentStep, patientId: demoPatientId });
  });

  // POST /api/demo/step/:stepNumber — guided demo story beats
  router.post('/step/:stepNumber', async (req, res) => {
    const stepNum = parseInt(req.params.stepNumber, 10);
    if (stepNum < 1 || stepNum > 6) {
      return res.status(400).json({ error: 'Step must be between 1 and 6' });
    }

    // Look up patient
    const patient = stmts().firstPatient.get();
    if (!patient) {
      return res.status(404).json({ error: 'No patient found — run /api/demo/seed first' });
    }
    demoPatientId = patient.id;
    currentStep = stepNum;

    switch (stepNum) {
      // Step 1 — Meet Sarah: reset all data
      case 1: {
        stmts().deleteVitals.run(patient.id);
        stmts().deleteAlerts.run(patient.id);
        stmts().deleteChat.run(patient.id);
        // Clear AI prediction cache
        setCachedPrediction(patient.id, null);

        const conditions = JSON.parse(patient.conditions || '[]');
        const medications = JSON.parse(patient.medications || '[]');

        return res.json({
          step: 1,
          patient: {
            id: patient.id,
            name: patient.name,
            conditions,
            medications,
          },
        });
      }

      // Step 2 — Morning Check-in: 3 normal readings staggered over ~5s
      case 2: {
        // Insert first reading immediately
        const r1 = insertReading(patient.id, NORMAL_READINGS[0], io);
        await checkVitalsAndAlert(patient.id, r1, io);
        io.emit('vitals-updated', { patientId: patient.id, reading: r1 });

        // Schedule reading 2 at +2s
        setTimeout(async () => {
          const r2 = insertReading(patient.id, NORMAL_READINGS[1], io);
          await checkVitalsAndAlert(patient.id, r2, io);
          io.emit('vitals-updated', { patientId: patient.id, reading: r2 });
        }, 2000);

        // Schedule reading 3 at +4s
        setTimeout(async () => {
          const r3 = insertReading(patient.id, NORMAL_READINGS[2], io);
          await checkVitalsAndAlert(patient.id, r3, io);
          io.emit('vitals-updated', { patientId: patient.id, reading: r3 });
        }, 4000);

        return res.json({
          step: 2,
          message: 'Inserting 3 normal readings over 5 seconds',
        });
      }

      // Step 3 — Glucose Spike: single reading with glucose 245
      case 3: {
        const spikeVitals = {
          heart_rate: 75,
          blood_pressure_systolic: 122,
          blood_pressure_diastolic: 80,
          glucose: 245,
          oxygen_saturation: 97,
          temperature: 98.4,
        };
        const reading = insertReading(patient.id, spikeVitals, io);
        const alerts = await checkVitalsAndAlert(patient.id, reading, io);
        io.emit('vitals-updated', { patientId: patient.id, reading });

        return res.json({
          step: 3,
          message: 'Glucose spike inserted',
          alertTriggered: alerts.length > 0,
        });
      }

      // Step 4 — Smart Alert Fires: no backend action
      case 4:
        return res.json({
          step: 4,
          message: 'Observe the alert notification',
        });

      // Step 5 — AI Analyzes Risk: no backend action (frontend triggers refresh)
      case 5:
        return res.json({
          step: 5,
          message: 'Frontend should trigger risk refresh',
        });

      // Step 6 — Ask the Assistant: no backend action (frontend handles)
      case 6:
        return res.json({
          step: 6,
          message: 'Navigate to chat',
        });

      default:
        return res.status(400).json({ error: 'Invalid step' });
    }
  });

  return router;
}
