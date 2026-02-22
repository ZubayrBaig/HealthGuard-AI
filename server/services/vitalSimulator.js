import db from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import { checkVitalsAndAlert } from './alertEngine.js';

// ---------------------------------------------------------------------------
// Normal baselines (healthy Sarah Johnson)
// ---------------------------------------------------------------------------

const NORMAL_BASELINES = {
  heart_rate: 75,
  blood_pressure_systolic: 118,
  blood_pressure_diastolic: 76,
  glucose: 105,
  oxygen_saturation: 97.5,
  temperature: 98.4,
};

// Noise ranges per vital (± this amount around baseline)
const NOISE = {
  heart_rate: 10,
  blood_pressure_systolic: 8,
  blood_pressure_diastolic: 5,
  glucose: 15,
  oxygen_saturation: 1,
  temperature: 0.3,
};

// ---------------------------------------------------------------------------
// Scenario definitions
// ---------------------------------------------------------------------------

const SCENARIOS = {
  'glucose-spike': {
    repeat: false,
    steps: [
      { glucose: 160 },
      { glucose: 200 },
      { glucose: 230 },
      { glucose: 255 },
      { glucose: 280 },
    ],
  },
  'bp-crisis': {
    repeat: false,
    steps: [
      { blood_pressure_systolic: 145, blood_pressure_diastolic: 95 },
      { blood_pressure_systolic: 155, blood_pressure_diastolic: 100 },
      { blood_pressure_systolic: 165, blood_pressure_diastolic: 108 },
      { blood_pressure_systolic: 175, blood_pressure_diastolic: 115 },
      { blood_pressure_systolic: 185, blood_pressure_diastolic: 120 },
    ],
  },
  'cardiac-warning': {
    repeat: true,
    steps: [
      { heart_rate: 55 },
      { heart_rate: 110 },
      { heart_rate: 52 },
      { heart_rate: 115 },
      { heart_rate: 48 },
      { heart_rate: 120 },
    ],
  },
};

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let activeScenario = null;
let scenarioStep = 0;
let intervalId = null;
let patientId = null;

// Lazy prepared statement for inserting vitals
let _insertStmt = null;
function insertStmt() {
  if (!_insertStmt) {
    _insertStmt = db.prepare(`
      INSERT INTO vitals (id, patient_id, timestamp, heart_rate,
        blood_pressure_systolic, blood_pressure_diastolic, glucose,
        oxygen_saturation, temperature, sleep_hours, steps, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }
  return _insertStmt;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Bell-curve-ish random in [-1, 1] */
function gaussRandom() {
  return ((Math.random() + Math.random() + Math.random()) / 3 - 0.5) * 2;
}

function generateReading() {
  const reading = {};
  for (const [vital, baseline] of Object.entries(NORMAL_BASELINES)) {
    reading[vital] = Math.round((baseline + gaussRandom() * NOISE[vital]) * 10) / 10;
  }

  // Apply scenario overrides
  if (activeScenario && SCENARIOS[activeScenario]) {
    const scenario = SCENARIOS[activeScenario];
    const step = scenario.steps[scenarioStep];
    if (step) {
      Object.assign(reading, step);
    }
  }

  // Round integer vitals
  reading.heart_rate = Math.round(reading.heart_rate);
  reading.blood_pressure_systolic = Math.round(reading.blood_pressure_systolic);
  reading.blood_pressure_diastolic = Math.round(reading.blood_pressure_diastolic);

  return reading;
}

function advanceScenario() {
  if (!activeScenario || !SCENARIOS[activeScenario]) return;

  const scenario = SCENARIOS[activeScenario];
  scenarioStep++;

  if (scenarioStep >= scenario.steps.length) {
    if (scenario.repeat) {
      scenarioStep = 0;
    } else {
      // Scenario finished
      activeScenario = null;
      scenarioStep = 0;
    }
  }
}

async function tick(io) {
  if (!patientId) return;

  const vitals = generateReading();
  const id = uuidv4();
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

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
    sleep_hours: null,
    steps: null,
    source: 'simulator',
  };

  // Insert into DB
  insertStmt().run(
    reading.id, reading.patient_id, reading.timestamp,
    reading.heart_rate, reading.blood_pressure_systolic,
    reading.blood_pressure_diastolic, reading.glucose,
    reading.oxygen_saturation, reading.temperature,
    reading.sleep_hours, reading.steps, reading.source,
  );

  // Run alert engine (generates AI messages, inserts alerts, emits new-alert events)
  await checkVitalsAndAlert(patientId, reading, io);

  // Emit vitals update for real-time charts
  io.emit('vitals-updated', { patientId, reading });

  // Advance scenario step
  advanceScenario();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function startSimulator(io) {
  if (intervalId) return { alreadyRunning: true };

  // Look up the first patient
  const patient = db.prepare('SELECT id FROM patients LIMIT 1').get();
  if (!patient) return { error: 'No patient in database' };
  patientId = patient.id;

  // Fire first tick immediately, then every 10 seconds
  tick(io);
  intervalId = setInterval(() => tick(io), 10_000);

  console.log(`[Simulator] Started for patient ${patientId}`);
  return { started: true, patientId };
}

export function stopSimulator() {
  if (!intervalId) return { alreadyStopped: true };

  clearInterval(intervalId);
  intervalId = null;
  activeScenario = null;
  scenarioStep = 0;

  console.log('[Simulator] Stopped');
  return { stopped: true };
}

export function setScenario(name) {
  if (name === 'normal') {
    activeScenario = null;
    scenarioStep = 0;
    return { scenario: 'normal', message: 'Returning to normal vitals' };
  }

  if (!SCENARIOS[name]) {
    return { error: `Unknown scenario: ${name}` };
  }

  activeScenario = name;
  scenarioStep = 0;
  console.log(`[Simulator] Scenario activated: ${name}`);
  return { scenario: name, message: `Scenario '${name}' activated` };
}

export function getStatus() {
  return {
    running: intervalId !== null,
    activeScenario,
    scenarioStep,
    patientId,
  };
}
