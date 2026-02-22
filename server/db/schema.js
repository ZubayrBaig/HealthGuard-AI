import db from './database.js';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

/** Box-Muller transform for normally-distributed random values. */
function gaussianRandom(mean = 0, stdDev = 1) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z * stdDev + mean;
}

function formatTimestamp(date) {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

// ---------------------------------------------------------------------------
// Schema initialisation
// ---------------------------------------------------------------------------

export function initDb() {
  // Table creation and migrations are handled eagerly in database.js
  // (so that prepared statements in route modules work on a fresh DB).
  // This function is kept for backward compatibility.
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

// Time-of-day modifiers keyed by reading index (0–5 → 00:00–20:00)
const TIME_MODIFIERS = [
  // 00:00 – sleep
  { hr: -12, sys: -10, dia: -6, glu: -15, spo2: -0.5, temp: -0.4, steps: 0 },
  // 04:00 – deep sleep
  { hr: -15, sys: -12, dia: -8, glu: -20, spo2: -0.5, temp: -0.5, steps: 0 },
  // 08:00 – morning
  { hr: 5, sys: 8, dia: 4, glu: 20, spo2: 0, temp: -0.1, steps: 500 },
  // 12:00 – midday
  { hr: 8, sys: 5, dia: 3, glu: 10, spo2: 0, temp: 0.3, steps: 2500 },
  // 16:00 – afternoon
  { hr: 10, sys: 3, dia: 2, glu: -5, spo2: 0, temp: 0.4, steps: 3500 },
  // 20:00 – evening
  { hr: 3, sys: 0, dia: 0, glu: 15, spo2: -0.3, temp: 0.1, steps: 1000 },
];

const BASE_HOURS = [0, 4, 8, 12, 16, 20];

// Anomaly schedule: day offset → override config
// `readings` lists which of the 6 daily slots get the anomalous value.
const ANOMALY_SCHEDULE = {
  5:  { vital: 'glucose', min: 250, max: 280, readings: [2, 3] },
  12: { vital: 'blood_pressure_systolic', min: 175, max: 190, readings: [2, 3, 4],
        secondary: { vital: 'blood_pressure_diastolic', min: 105, max: 115 } },
  18: { vital: 'glucose', min: 270, max: 300, readings: [3, 4] },
  22: { vital: 'blood_pressure_systolic', min: 170, max: 185, readings: [3, 4],
        secondary: { vital: 'blood_pressure_diastolic', min: 100, max: 110 } },
  26: { vital: 'glucose', min: 255, max: 290, readings: [2, 3] },
  28: { vital: 'oxygen_saturation', min: 91, max: 93, readings: [0, 1] },
};

// Alert definitions keyed by the same day offsets
const ALERT_DEFINITIONS = [
  {
    dayOffset: 5,
    type: 'warning',
    title: 'Elevated Blood Glucose',
    message: 'Blood glucose reading of {value} mg/dL exceeds the recommended threshold of 200 mg/dL for diabetic patients.',
    vital_type: 'glucose',
    threshold: 200,
    acknowledged: 1,
  },
  {
    dayOffset: 12,
    type: 'critical',
    title: 'High Blood Pressure Detected',
    message: 'Systolic blood pressure of {value} mmHg is critically elevated. Threshold: 160 mmHg.',
    vital_type: 'blood_pressure_systolic',
    threshold: 160,
    acknowledged: 1,
  },
  {
    dayOffset: 18,
    type: 'critical',
    title: 'Severely Elevated Blood Glucose',
    message: 'Blood glucose reading of {value} mg/dL is critically high. Threshold: 200 mg/dL. Check medication adherence.',
    vital_type: 'glucose',
    threshold: 200,
    acknowledged: 1,
  },
  {
    dayOffset: 22,
    type: 'warning',
    title: 'High Blood Pressure Detected',
    message: 'Systolic blood pressure of {value} mmHg exceeds the warning threshold of 160 mmHg.',
    vital_type: 'blood_pressure_systolic',
    threshold: 160,
    acknowledged: 0,
  },
  {
    dayOffset: 26,
    type: 'warning',
    title: 'Elevated Blood Glucose',
    message: 'Blood glucose reading of {value} mg/dL exceeds the recommended threshold of 200 mg/dL.',
    vital_type: 'glucose',
    threshold: 200,
    acknowledged: 0,
  },
  {
    dayOffset: 28,
    type: 'critical',
    title: 'Low Oxygen Saturation',
    message: 'Oxygen saturation of {value}% is below the safe threshold of 95%. Monitor closely.',
    vital_type: 'oxygen_saturation',
    threshold: 95,
    acknowledged: 0,
  },
];

function generateVitalReading(startDate, dayOffset, readingIndex, patientId) {
  const mod = TIME_MODIFIERS[readingIndex];

  // Build timestamp with random minute jitter
  const date = new Date(startDate);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(BASE_HOURS[readingIndex], Math.floor(Math.random() * 60), 0, 0);
  const timestamp = formatTimestamp(date);

  // Generate each vital: baseline + time-of-day modifier + gaussian noise
  let heart_rate = Math.round(75 + mod.hr + gaussianRandom(0, 4));
  let blood_pressure_systolic = Math.round(138 + mod.sys + gaussianRandom(0, 5));
  let blood_pressure_diastolic = Math.round(88 + mod.dia + gaussianRandom(0, 3));
  let glucose = round1(140 + mod.glu + gaussianRandom(0, 10));
  let oxygen_saturation = round1(97 + mod.spo2 + gaussianRandom(0, 0.5));
  let temperature = round1(98.2 + mod.temp + gaussianRandom(0, 0.2));
  const sleep_hours = readingIndex === 2
    ? round1(clamp(6.5 + gaussianRandom(0, 0.8), 3, 10))
    : null;
  let steps = mod.steps === 0
    ? 0
    : Math.max(0, Math.round(mod.steps + mod.steps * gaussianRandom(0, 0.15)));

  // Apply anomalies if scheduled for this day + reading slot
  const anomaly = ANOMALY_SCHEDULE[dayOffset];
  if (anomaly && anomaly.readings.includes(readingIndex)) {
    const overrides = { [anomaly.vital]: round1(randomInRange(anomaly.min, anomaly.max)) };
    if (anomaly.secondary) {
      overrides[anomaly.secondary.vital] = round1(
        randomInRange(anomaly.secondary.min, anomaly.secondary.max),
      );
    }
    if (overrides.heart_rate !== undefined) heart_rate = Math.round(overrides.heart_rate);
    if (overrides.blood_pressure_systolic !== undefined) blood_pressure_systolic = Math.round(overrides.blood_pressure_systolic);
    if (overrides.blood_pressure_diastolic !== undefined) blood_pressure_diastolic = Math.round(overrides.blood_pressure_diastolic);
    if (overrides.glucose !== undefined) glucose = overrides.glucose;
    if (overrides.oxygen_saturation !== undefined) oxygen_saturation = overrides.oxygen_saturation;
    if (overrides.temperature !== undefined) temperature = overrides.temperature;
  }

  // Clamp to physiological ranges
  heart_rate = clamp(heart_rate, 45, 150);
  blood_pressure_systolic = clamp(blood_pressure_systolic, 90, 200);
  blood_pressure_diastolic = clamp(blood_pressure_diastolic, 50, 120);
  glucose = clamp(glucose, 60, 400);
  oxygen_saturation = clamp(round1(oxygen_saturation), 88, 100);
  temperature = clamp(temperature, 96.0, 103.0);

  return {
    id: uuidv4(),
    patient_id: patientId,
    timestamp,
    heart_rate,
    blood_pressure_systolic,
    blood_pressure_diastolic,
    glucose,
    oxygen_saturation,
    temperature,
    sleep_hours,
    steps,
    source: 'simulated',
  };
}

export function seedDb() {
  const existing = db.prepare('SELECT COUNT(*) as count FROM patients').get();
  if (existing.count > 0) {
    console.log('Database already seeded, skipping.');
    return;
  }

  const seed = db.transaction(() => {
    // ---- Demo patient ----
    const patientId = uuidv4();
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 29); // 30 days including today

    db.prepare(`
      INSERT INTO patients (id, name, date_of_birth, conditions, medications,
        emergency_contact_name, emergency_contact_phone, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      patientId,
      'Sarah Johnson',
      '1958-04-12',
      JSON.stringify(['Type 2 Diabetes', 'Hypertension']),
      JSON.stringify(['Metformin 1000mg twice daily', 'Lisinopril 20mg daily', 'Atorvastatin 40mg daily']),
      'Michael Johnson',
      '(555) 867-5309',
      formatTimestamp(startDate),
    );

    // ---- 30 days of vitals ----
    const vitalStmt = db.prepare(`
      INSERT INTO vitals (id, patient_id, timestamp, heart_rate,
        blood_pressure_systolic, blood_pressure_diastolic, glucose,
        oxygen_saturation, temperature, sleep_hours, steps, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Track the first anomalous value per day for alert messages
    const anomalyValues = {};

    for (let day = 0; day < 30; day++) {
      for (let slot = 0; slot < 6; slot++) {
        const reading = generateVitalReading(startDate, day, slot, patientId);
        vitalStmt.run(
          reading.id, reading.patient_id, reading.timestamp,
          reading.heart_rate, reading.blood_pressure_systolic,
          reading.blood_pressure_diastolic, reading.glucose,
          reading.oxygen_saturation, reading.temperature,
          reading.sleep_hours, reading.steps, reading.source,
        );

        // Capture anomalous values for alert messages
        const anomaly = ANOMALY_SCHEDULE[day];
        if (anomaly && anomaly.readings.includes(slot) && !anomalyValues[day]) {
          anomalyValues[day] = {
            value: reading[anomaly.vital],
            timestamp: reading.timestamp,
          };
        }
      }
    }

    // ---- Alerts for each anomaly event ----
    const alertStmt = db.prepare(`
      INSERT INTO alerts (id, patient_id, type, title, message,
        vital_type, vital_value, threshold_value, acknowledged, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const def of ALERT_DEFINITIONS) {
      const captured = anomalyValues[def.dayOffset];
      if (!captured) continue;

      const message = def.message.replace('{value}', captured.value);
      alertStmt.run(
        uuidv4(), patientId, def.type, def.title, message,
        def.vital_type, captured.value, def.threshold,
        def.acknowledged, captured.timestamp,
      );
    }
  });

  seed();
  console.log('Database seeded successfully.');
}
