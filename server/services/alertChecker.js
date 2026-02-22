import db from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';

// Rules per vital ordered most-severe-first. First match wins (break).
const THRESHOLDS = {
  heart_rate: [
    { direction: 'above', value: 150, type: 'critical', title: 'Critically High Heart Rate' },
    { direction: 'above', value: 120, type: 'warning', title: 'Elevated Heart Rate' },
    { direction: 'below', value: 40, type: 'critical', title: 'Critically Low Heart Rate' },
    { direction: 'below', value: 50, type: 'warning', title: 'Low Heart Rate' },
  ],
  blood_pressure_systolic: [
    { direction: 'above', value: 160, type: 'critical', title: 'Critically High Systolic Blood Pressure' },
    { direction: 'above', value: 140, type: 'warning', title: 'Elevated Systolic Blood Pressure' },
  ],
  blood_pressure_diastolic: [
    { direction: 'above', value: 100, type: 'critical', title: 'Critically High Diastolic Blood Pressure' },
    { direction: 'above', value: 90, type: 'warning', title: 'Elevated Diastolic Blood Pressure' },
  ],
  glucose: [
    { direction: 'above', value: 250, type: 'critical', title: 'Critically High Blood Glucose' },
    { direction: 'above', value: 200, type: 'warning', title: 'Elevated Blood Glucose' },
  ],
  oxygen_saturation: [
    { direction: 'below', value: 92, type: 'critical', title: 'Critically Low Oxygen Saturation' },
    { direction: 'below', value: 95, type: 'warning', title: 'Low Oxygen Saturation' },
  ],
  temperature: [
    { direction: 'above', value: 103, type: 'critical', title: 'Critically High Temperature' },
    { direction: 'above', value: 100.4, type: 'warning', title: 'Elevated Temperature' },
  ],
};

const UNIT_MAP = {
  heart_rate: 'bpm',
  blood_pressure_systolic: 'mmHg',
  blood_pressure_diastolic: 'mmHg',
  glucose: 'mg/dL',
  oxygen_saturation: '%',
  temperature: '\u00B0F',
};

function generateMessage(vitalType, actualValue, rule) {
  const unit = UNIT_MAP[vitalType] || '';
  const verb = rule.direction === 'above' ? 'exceeds' : 'is below';
  return `${rule.title}: ${actualValue}${unit} ${verb} the threshold of ${rule.value}${unit}.`;
}

function nowTimestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

const insertAlertStmt = db.prepare(`
  INSERT INTO alerts (id, patient_id, type, title, message,
    vital_type, vital_value, threshold_value, acknowledged, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
`);

export function checkVitals(reading, patientId) {
  const alerts = [];
  const createdAt = nowTimestamp();

  for (const [vitalType, rules] of Object.entries(THRESHOLDS)) {
    const value = reading[vitalType];
    if (value == null) continue;

    for (const rule of rules) {
      const breached =
        (rule.direction === 'above' && value > rule.value) ||
        (rule.direction === 'below' && value < rule.value);

      if (breached) {
        const id = uuidv4();
        const message = generateMessage(vitalType, value, rule);

        insertAlertStmt.run(
          id, patientId, rule.type, rule.title, message,
          vitalType, value, rule.value, createdAt,
        );

        alerts.push({
          id,
          patient_id: patientId,
          type: rule.type,
          title: rule.title,
          message,
          vital_type: vitalType,
          vital_value: value,
          threshold_value: rule.value,
          acknowledged: 0,
          created_at: createdAt,
        });

        break;
      }
    }
  }

  return alerts;
}
