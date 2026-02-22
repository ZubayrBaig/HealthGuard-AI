import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database.js';
import { seedDb } from '../db/schema.js';
import { checkVitalsAndAlert } from '../services/alertEngine.js';
import { setCachedPrediction } from '../services/riskEngine.js';
import { SUPPORTED_DEVICES, generateDeviceVitals, generateFirmwareVersion } from '../services/deviceConfig.js';

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
      deleteDevices: db.prepare('DELETE FROM connected_devices WHERE patient_id = ?'),
      insertVital: db.prepare(`
        INSERT INTO vitals (id, patient_id, timestamp, heart_rate,
          blood_pressure_systolic, blood_pressure_diastolic, glucose,
          oxygen_saturation, temperature, sleep_hours, steps, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      insertDevice: db.prepare(`
        INSERT INTO connected_devices
          (id, patient_id, device_type, device_name, status, battery_level,
           firmware_version, settings, connected_at, last_sync_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      updateDeviceStatus: db.prepare(
        'UPDATE connected_devices SET status = ?, last_sync_at = ?, connected_at = COALESCE(connected_at, ?) WHERE id = ?',
      ),
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

function insertDeviceVitalReading(patientId, deviceType, io) {
  const vitals = generateDeviceVitals(deviceType);
  if (!vitals) return null;

  const id = uuidv4();
  const timestamp = nowTimestamp();

  const reading = {
    id,
    patient_id: patientId,
    timestamp,
    ...vitals,
    source: deviceType,
  };

  stmts().insertVital.run(
    reading.id, reading.patient_id, reading.timestamp,
    reading.heart_rate, reading.blood_pressure_systolic,
    reading.blood_pressure_diastolic, reading.glucose,
    reading.oxygen_saturation, reading.temperature,
    reading.sleep_hours, reading.steps, reading.source,
  );

  io.emit('vitals-updated', { patientId, reading });
  return reading;
}

// ---------------------------------------------------------------------------
// Normal vitals templates for Step 3 (slight variations across 3 readings)
// ---------------------------------------------------------------------------

const NORMAL_READINGS = [
  { heart_rate: 72, blood_pressure_systolic: 118, blood_pressure_diastolic: 76, glucose: 110, oxygen_saturation: 97, temperature: 98.4 },
  { heart_rate: 74, blood_pressure_systolic: 120, blood_pressure_diastolic: 78, glucose: 108, oxygen_saturation: 97.5, temperature: 98.3 },
  { heart_rate: 71, blood_pressure_systolic: 116, blood_pressure_diastolic: 74, glucose: 112, oxygen_saturation: 97, temperature: 98.5 },
];

// ---------------------------------------------------------------------------
// Spike presets for Step 4 (selectable by frontend)
// ---------------------------------------------------------------------------

const SPIKE_PRESETS = {
  glucose: {
    label: 'Glucose Spike',
    vitals: { heart_rate: 75, blood_pressure_systolic: 122, blood_pressure_diastolic: 80, glucose: 245, oxygen_saturation: 97, temperature: 98.4 },
  },
  blood_pressure: {
    label: 'BP Spike',
    vitals: { heart_rate: 88, blood_pressure_systolic: 175, blood_pressure_diastolic: 108, glucose: 115, oxygen_saturation: 96, temperature: 98.6 },
  },
  heart_rate: {
    label: 'Heart Rate Spike',
    vitals: { heart_rate: 155, blood_pressure_systolic: 130, blood_pressure_diastolic: 85, glucose: 112, oxygen_saturation: 95, temperature: 98.8 },
  },
  oxygen: {
    label: 'Low SpO2',
    vitals: { heart_rate: 92, blood_pressure_systolic: 128, blood_pressure_diastolic: 82, glucose: 110, oxygen_saturation: 89, temperature: 98.4 },
  },
  temperature: {
    label: 'High Temperature',
    vitals: { heart_rate: 105, blood_pressure_systolic: 125, blood_pressure_diastolic: 80, glucose: 118, oxygen_saturation: 96, temperature: 103.5 },
  },
};

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
  // Steps: 1=Meet Sarah, 2=Connect Devices, 3=Morning Check-in,
  //        4=Vital Spike (configurable), 5=Smart Alert, 6=AI Risk, 7=Ask Assistant
  router.post('/step/:stepNumber', async (req, res) => {
    const stepNum = parseInt(req.params.stepNumber, 10);
    if (stepNum < 1 || stepNum > 7) {
      return res.status(400).json({ error: 'Step must be between 1 and 7' });
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
        stmts().deleteDevices.run(patient.id);
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

      // Step 2 — Connect Devices: pair Apple Watch + Dexcom G7
      case 2: {
        const now = nowTimestamp();
        const devices = ['apple_watch', 'dexcom'];
        const deviceIds = [];

        for (const deviceType of devices) {
          const config = SUPPORTED_DEVICES[deviceType];
          const deviceId = uuidv4();
          deviceIds.push({ deviceId, deviceType, config });

          stmts().insertDevice.run(
            deviceId, patient.id, deviceType, config.name,
            'pending',
            Math.floor(Math.random() * 31) + 70, // 70-100
            generateFirmwareVersion(deviceType),
            '{}', null, null, now,
          );

          io.emit('device-status-change', {
            deviceId,
            patientId: patient.id,
            status: 'pending',
            device_type: deviceType,
            device_name: config.name,
          });
        }

        // Transition to syncing at +2s
        setTimeout(() => {
          for (const { deviceId, deviceType, config } of deviceIds) {
            db.prepare('UPDATE connected_devices SET status = ? WHERE id = ?')
              .run('syncing', deviceId);
            io.emit('device-status-change', {
              deviceId,
              patientId: patient.id,
              status: 'syncing',
              device_type: deviceType,
              device_name: config.name,
            });
          }
        }, 2000);

        // Transition to connected at +5s, generate initial readings
        setTimeout(() => {
          const ts = nowTimestamp();
          for (const { deviceId, deviceType, config } of deviceIds) {
            stmts().updateDeviceStatus.run('connected', ts, ts, deviceId);
            io.emit('device-status-change', {
              deviceId,
              patientId: patient.id,
              status: 'connected',
              device_type: deviceType,
              device_name: config.name,
            });
            insertDeviceVitalReading(patient.id, deviceType, io);
          }
        }, 5000);

        return res.json({
          step: 2,
          message: 'Connecting Apple Watch and Dexcom G7',
          devices: deviceIds.map(d => d.deviceType),
        });
      }

      // Step 3 — Morning Check-in: 3 normal readings staggered over ~5s
      case 3: {
        const r1 = insertReading(patient.id, NORMAL_READINGS[0], io);
        await checkVitalsAndAlert(patient.id, r1, io);
        io.emit('vitals-updated', { patientId: patient.id, reading: r1 });

        setTimeout(async () => {
          const r2 = insertReading(patient.id, NORMAL_READINGS[1], io);
          await checkVitalsAndAlert(patient.id, r2, io);
          io.emit('vitals-updated', { patientId: patient.id, reading: r2 });
        }, 2000);

        setTimeout(async () => {
          const r3 = insertReading(patient.id, NORMAL_READINGS[2], io);
          await checkVitalsAndAlert(patient.id, r3, io);
          io.emit('vitals-updated', { patientId: patient.id, reading: r3 });
        }, 4000);

        return res.json({
          step: 3,
          message: 'Inserting 3 normal readings over 5 seconds',
        });
      }

      // Step 4 — Vital Spike: configurable via spike_type body param
      case 4: {
        const spikeType = req.body.spike_type || 'glucose';
        const preset = SPIKE_PRESETS[spikeType] || SPIKE_PRESETS.glucose;
        const reading = insertReading(patient.id, preset.vitals, io);
        const alerts = await checkVitalsAndAlert(patient.id, reading, io);
        io.emit('vitals-updated', { patientId: patient.id, reading });

        return res.json({
          step: 4,
          message: `${preset.label} inserted`,
          spikeType,
          alertTriggered: alerts.length > 0,
        });
      }

      // Step 5 — Smart Alert Fires: no backend action
      case 5:
        return res.json({
          step: 5,
          message: 'Observe the alert notification',
        });

      // Step 6 — AI Analyzes Risk: no backend action (frontend triggers refresh)
      case 6:
        return res.json({
          step: 6,
          message: 'Frontend should trigger risk refresh',
        });

      // Step 7 — Ask the Assistant: no backend action (frontend handles)
      case 7:
        return res.json({
          step: 7,
          message: 'Navigate to chat',
        });

      default:
        return res.status(400).json({ error: 'Invalid step' });
    }
  });

  return router;
}
