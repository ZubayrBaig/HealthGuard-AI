import db from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import { chatCompletion } from './ai.js';

// ---------------------------------------------------------------------------
// Thresholds (same rules as the original alertChecker, most-severe-first)
// ---------------------------------------------------------------------------

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
  heart_rate: 'BPM',
  blood_pressure_systolic: 'mmHg',
  blood_pressure_diastolic: 'mmHg',
  glucose: 'mg/dL',
  oxygen_saturation: '%',
  temperature: '\u00B0F',
};

const NORMAL_RANGES = {
  heart_rate: '60-100 BPM',
  blood_pressure_systolic: '<120 mmHg',
  blood_pressure_diastolic: '<80 mmHg',
  glucose: '70-140 mg/dL',
  oxygen_saturation: '≥95%',
  temperature: '97.0-99.5°F',
};

// ---------------------------------------------------------------------------
// Prepared statements (lazy — DB tables may not exist at import time)
// ---------------------------------------------------------------------------

let _getPatientStmt = null;
let _insertAlertStmt = null;

function getPatientStmt() {
  if (!_getPatientStmt) {
    _getPatientStmt = db.prepare(
      'SELECT id, name, conditions, medications FROM patients WHERE id = ?',
    );
  }
  return _getPatientStmt;
}

function insertAlertStmt() {
  if (!_insertAlertStmt) {
    _insertAlertStmt = db.prepare(`
      INSERT INTO alerts (id, patient_id, type, title, message,
        vital_type, vital_value, threshold_value, acknowledged,
        ai_message, emergency_context, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `);
  }
  return _insertAlertStmt;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowTimestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function generateBasicMessage(vitalType, actualValue, rule) {
  const unit = UNIT_MAP[vitalType] || '';
  const verb = rule.direction === 'above' ? 'exceeds' : 'is below';
  return `${rule.title}: ${actualValue}${unit} ${verb} the threshold of ${rule.value}${unit}.`;
}

function parseJson(raw) {
  let str = raw;
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) str = match[1].trim();
  return JSON.parse(str);
}

// ---------------------------------------------------------------------------
// AI message generation
// ---------------------------------------------------------------------------

async function generateAIMessages(breachedAlerts, patient) {
  const conditions = JSON.parse(patient.conditions || '[]');
  const medications = JSON.parse(patient.medications || '[]');

  const triggeredList = breachedAlerts
    .map((a) => {
      const unit = UNIT_MAP[a.vital_type] || '';
      const normalRange = NORMAL_RANGES[a.vital_type] || 'N/A';
      return `- ${a.vital_type}: ${a.vital_value}${unit} (${a.type} — threshold: ${a.threshold_value}${unit}, normal range: ${normalRange})`;
    })
    .join('\n');

  const systemPrompt = `You are a clinical alert assistant for a health monitoring app. Generate patient-friendly, context-aware alert messages. Consider the patient's conditions and medications when crafting messages. Be specific and actionable — don't just state the reading is high/low, suggest what the patient should do.

For critical alerts, also provide an emergency_context field with concise info that could be shared with a caregiver or 911 operator (include the reading, normal range, relevant conditions, and current medications).

Respond with ONLY valid JSON matching this schema:
{
  "alerts": [
    {
      "vital_type": "the vital key exactly as provided",
      "ai_message": "patient-friendly message",
      "emergency_context": "emergency info string OR null if not critical"
    }
  ]
}`;

  const userMessage = `Patient: ${patient.name}
Conditions: ${conditions.length ? conditions.join(', ') : 'None reported'}
Medications: ${medications.length ? medications.join(', ') : 'None reported'}

Triggered alerts:
${triggeredList}`;

  const response = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    { temperature: 0.3 },
  );

  const content = response.choices?.[0]?.message?.content;
  if (!content) return {};

  const parsed = parseJson(content);
  const map = {};
  for (const item of parsed.alerts || []) {
    if (item.vital_type) {
      map[item.vital_type] = {
        ai_message: typeof item.ai_message === 'string' ? item.ai_message : null,
        emergency_context: typeof item.emergency_context === 'string' ? item.emergency_context : null,
      };
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function checkVitalsAndAlert(patientId, vitalsReading, io) {
  const patient = getPatientStmt().get(patientId);
  if (!patient) return [];

  const createdAt = nowTimestamp();
  const breached = [];

  // 1. Check each vital against thresholds (first match wins per vital)
  for (const [vitalType, rules] of Object.entries(THRESHOLDS)) {
    const value = vitalsReading[vitalType];
    if (value == null) continue;

    for (const rule of rules) {
      const hit =
        (rule.direction === 'above' && value > rule.value) ||
        (rule.direction === 'below' && value < rule.value);

      if (hit) {
        breached.push({
          id: uuidv4(),
          vital_type: vitalType,
          vital_value: value,
          threshold_value: rule.value,
          type: rule.type,
          title: rule.title,
          message: generateBasicMessage(vitalType, value, rule),
        });
        break; // first match wins
      }
    }
  }

  if (breached.length === 0) return [];

  // 2. Generate AI messages (single batch call for all breached vitals)
  let aiMap = {};
  try {
    aiMap = await generateAIMessages(breached, patient);
  } catch {
    // AI unavailable — alerts still get created with basic messages
  }

  // 3. Insert alerts into DB and emit Socket.io events
  const alerts = [];

  for (const b of breached) {
    const ai = aiMap[b.vital_type] || {};
    const alert = {
      id: b.id,
      patient_id: patientId,
      type: b.type,
      title: b.title,
      message: b.message,
      vital_type: b.vital_type,
      vital_value: b.vital_value,
      threshold_value: b.threshold_value,
      acknowledged: 0,
      ai_message: ai.ai_message || null,
      emergency_context: ai.emergency_context || null,
      created_at: createdAt,
    };

    insertAlertStmt().run(
      alert.id, patientId, alert.type, alert.title, alert.message,
      alert.vital_type, alert.vital_value, alert.threshold_value,
      alert.ai_message, alert.emergency_context, createdAt,
    );

    alerts.push(alert);

    // 4. Emit real-time event per alert
    if (io) {
      io.emit('new-alert', { patientId, alert });
    }
  }

  return alerts;
}
