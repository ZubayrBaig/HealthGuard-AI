import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database.js';
import {
  SUPPORTED_DEVICES,
  generateDeviceVitals,
  generateFirmwareVersion,
} from '../services/deviceConfig.js';

// ---------------------------------------------------------------------------
// Lazy prepared statements
// ---------------------------------------------------------------------------

let _stmts = null;
function stmts() {
  if (!_stmts) {
    _stmts = {
      getPatient: db.prepare('SELECT id FROM patients WHERE id = ?'),
      getDevices: db.prepare(
        'SELECT * FROM connected_devices WHERE patient_id = ? ORDER BY created_at DESC',
      ),
      getDevice: db.prepare(
        'SELECT * FROM connected_devices WHERE id = ? AND patient_id = ?',
      ),
      getActiveByType: db.prepare(
        "SELECT id FROM connected_devices WHERE patient_id = ? AND device_type = ? AND status IN ('connected', 'syncing', 'pending')",
      ),
      insertDevice: db.prepare(`
        INSERT INTO connected_devices
          (id, patient_id, device_type, device_name, status, battery_level,
           firmware_version, settings, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      updateStatus: db.prepare(
        'UPDATE connected_devices SET status = ? WHERE id = ?',
      ),
      updateSync: db.prepare(
        "UPDATE connected_devices SET status = 'connected', last_sync_at = ?, connected_at = COALESCE(connected_at, ?) WHERE id = ?",
      ),
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

function validatePatient(patientId, res) {
  const patient = stmts().getPatient.get(patientId);
  if (!patient) {
    res.status(404).json({ error: 'Patient not found' });
    return false;
  }
  return true;
}

function parseDevice(row) {
  return {
    ...row,
    settings: JSON.parse(row.settings || '{}'),
  };
}

function insertVitalReading(patientId, deviceType, io) {
  const vitals = generateDeviceVitals(deviceType);
  if (!vitals) return null;

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
    sleep_hours: vitals.sleep_hours,
    steps: vitals.steps,
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
// Router factory
// ---------------------------------------------------------------------------

export default function createDevicesRouter(io) {
  const router = Router();

  // GET /api/devices/supported — device catalog (no patientId needed)
  router.get('/supported', (_req, res) => {
    res.json(SUPPORTED_DEVICES);
  });

  // GET /api/devices/:patientId — all devices for a patient
  router.get('/:patientId', (req, res) => {
    if (!validatePatient(req.params.patientId, res)) return;

    const rows = stmts().getDevices.all(req.params.patientId);
    res.json(rows.map(parseDevice));
  });

  // POST /api/devices/:patientId/connect — simulate connecting a device
  router.post('/:patientId/connect', (req, res) => {
    const { patientId } = req.params;
    const { device_type } = req.body;

    if (!validatePatient(patientId, res)) return;

    // Validate device type
    if (!device_type || !SUPPORTED_DEVICES[device_type]) {
      return res.status(400).json({
        error: 'Invalid device_type',
        supported: Object.keys(SUPPORTED_DEVICES),
      });
    }

    // Check for existing active device of this type
    const existing = stmts().getActiveByType.get(patientId, device_type);
    if (existing) {
      return res.status(409).json({
        error: `A ${SUPPORTED_DEVICES[device_type].name} is already connected or connecting`,
      });
    }

    const config = SUPPORTED_DEVICES[device_type];
    const deviceId = uuidv4();
    const batteryLevel = Math.floor(Math.random() * 61) + 40; // 40–100
    const firmwareVersion = generateFirmwareVersion(device_type);

    stmts().insertDevice.run(
      deviceId, patientId, device_type, config.name,
      'pending', batteryLevel, firmwareVersion,
      '{}', nowTimestamp(),
    );

    const device = parseDevice(stmts().getDevice.get(deviceId, patientId));
    res.status(201).json(device);

    // Simulate connection flow
    setTimeout(() => {
      stmts().updateStatus.run('syncing', deviceId);
      io.emit('device-status-change', {
        deviceId,
        patientId,
        status: 'syncing',
        device_type,
        device_name: config.name,
      });
    }, 2000);

    setTimeout(() => {
      const now = nowTimestamp();
      stmts().updateSync.run(now, now, deviceId);
      io.emit('device-status-change', {
        deviceId,
        patientId,
        status: 'connected',
        device_type,
        device_name: config.name,
      });

      // Generate initial vitals reading
      insertVitalReading(patientId, device_type, io);
    }, 6000);
  });

  // POST /api/devices/:patientId/:deviceId/sync — simulate manual sync
  router.post('/:patientId/:deviceId/sync', (req, res) => {
    const { patientId, deviceId } = req.params;

    if (!validatePatient(patientId, res)) return;

    const device = stmts().getDevice.get(deviceId, patientId);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    if (device.status !== 'connected') {
      return res.status(400).json({ error: 'Device must be connected to sync' });
    }

    const config = SUPPORTED_DEVICES[device.device_type];

    // Set to syncing
    stmts().updateStatus.run('syncing', deviceId);
    io.emit('device-status-change', {
      deviceId,
      patientId,
      status: 'syncing',
      device_type: device.device_type,
      device_name: device.device_name,
    });

    res.json({ message: 'Sync started', deviceId });

    // Generate 3 vitals readings at 1s intervals, then mark connected
    for (let i = 1; i <= 3; i++) {
      setTimeout(() => {
        insertVitalReading(patientId, device.device_type, io);
      }, i * 1000);
    }

    setTimeout(() => {
      const now = nowTimestamp();
      stmts().updateSync.run(now, now, deviceId);
      io.emit('device-status-change', {
        deviceId,
        patientId,
        status: 'connected',
        device_type: device.device_type,
        device_name: config.name,
      });
    }, 3000);
  });

  // DELETE /api/devices/:patientId/:deviceId — disconnect a device
  router.delete('/:patientId/:deviceId', (req, res) => {
    const { patientId, deviceId } = req.params;

    if (!validatePatient(patientId, res)) return;

    const device = stmts().getDevice.get(deviceId, patientId);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    stmts().updateStatus.run('disconnected', deviceId);
    io.emit('device-status-change', {
      deviceId,
      patientId,
      status: 'disconnected',
      device_type: device.device_type,
      device_name: device.device_name,
    });

    res.json({ message: 'Device disconnected', deviceId });
  });

  return router;
}
