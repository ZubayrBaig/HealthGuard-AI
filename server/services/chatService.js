import db from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import getClient, { chatCompletion } from './ai.js';
import { calculateRiskScore } from './riskEngine.js';

// ---------------------------------------------------------------------------
// Lazy prepared statements
// ---------------------------------------------------------------------------

let _stmts = null;
function stmts() {
  if (!_stmts) {
    _stmts = {
      getPatient: db.prepare(
        'SELECT id, name, date_of_birth, conditions, medications, emergency_contact_name, emergency_contact_phone, alert_preferences, normal_ranges FROM patients WHERE id = ?',
      ),
      latestVitals: db.prepare(
        'SELECT * FROM vitals WHERE patient_id = ? ORDER BY timestamp DESC LIMIT 1',
      ),
      recentAlerts: db.prepare(
        'SELECT type, title, vital_type, vital_value, created_at FROM alerts WHERE patient_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 5',
      ),
      insertMessage: db.prepare(
        'INSERT INTO chat_history (id, patient_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
      ),
      recentMessages: db.prepare(
        'SELECT role, content FROM chat_history WHERE patient_id = ? ORDER BY created_at DESC LIMIT ?',
      ),
      countMessages: db.prepare(
        'SELECT COUNT(*) as total FROM chat_history WHERE patient_id = ?',
      ),
      deleteHistory: db.prepare(
        'DELETE FROM chat_history WHERE patient_id = ?',
      ),
    };
  }
  return _stmts;
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

const BASE_INSTRUCTIONS = `You are HealthGuard AI, a supportive health assistant. You help patients understand their health data, provide general wellness guidance, help with symptom assessment, and remind about medications. You are NOT a doctor — always recommend consulting their healthcare provider for medical decisions. Be warm, clear, and encouraging. If vitals data suggests something concerning, proactively mention it.

Keep responses concise (2-4 paragraphs max) unless the patient asks for more detail.`;

const VITAL_LABELS = {
  heart_rate: { label: 'Heart Rate', unit: 'BPM' },
  blood_pressure_systolic: { label: 'Systolic BP', unit: 'mmHg' },
  blood_pressure_diastolic: { label: 'Diastolic BP', unit: 'mmHg' },
  glucose: { label: 'Blood Glucose', unit: 'mg/dL' },
  oxygen_saturation: { label: 'SpO2', unit: '%' },
  temperature: { label: 'Temperature', unit: '°F' },
};

export function buildSystemPrompt(patientId) {
  const patient = stmts().getPatient.get(patientId);
  if (!patient) return BASE_INSTRUCTIONS;

  const conditions = JSON.parse(patient.conditions || '[]');
  const medications = JSON.parse(patient.medications || '[]');
  const alertPreferences = JSON.parse(patient.alert_preferences || '{}');
  const normalRanges = JSON.parse(patient.normal_ranges || '{}');

  // Calculate age from DOB
  let age = null;
  if (patient.date_of_birth) {
    const dob = new Date(patient.date_of_birth);
    const today = new Date();
    age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  }

  // Latest vitals
  const latest = stmts().latestVitals.get(patientId);

  // 7-day history for risk score
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const startDate = sevenDaysAgo.toISOString().replace('T', ' ').slice(0, 19);
  const history = db.prepare(
    'SELECT * FROM vitals WHERE patient_id = ? AND timestamp >= ? ORDER BY timestamp ASC',
  ).all(patientId, startDate);

  // Risk score
  let riskSection = '';
  if (latest && history.length > 0) {
    const risk = calculateRiskScore(latest, history, conditions);
    const topFactors = risk.factors
      .filter((f) => f.zone !== 'normal')
      .slice(0, 3)
      .map((f) => `${f.explanation} (trend: ${f.trend})`)
      .join('; ');
    riskSection = `\nRisk Assessment: ${risk.category} (score: ${risk.overallScore}/100)`;
    if (topFactors) riskSection += `\nTop concerns: ${topFactors}`;
  }

  // Latest vitals section
  let vitalsSection = '';
  if (latest) {
    const lines = [];
    if (latest.heart_rate != null) lines.push(`- Heart Rate: ${latest.heart_rate} BPM`);
    if (latest.blood_pressure_systolic != null) {
      lines.push(`- Blood Pressure: ${latest.blood_pressure_systolic}/${latest.blood_pressure_diastolic ?? 'N/A'} mmHg`);
    }
    if (latest.glucose != null) lines.push(`- Blood Glucose: ${latest.glucose} mg/dL`);
    if (latest.oxygen_saturation != null) lines.push(`- SpO2: ${latest.oxygen_saturation}%`);
    if (latest.temperature != null) lines.push(`- Temperature: ${latest.temperature}°F`);
    if (lines.length) vitalsSection = `\nLatest Vitals:\n${lines.join('\n')}`;
  }

  // Recent alerts (last 24 hours)
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  const alertCutoff = oneDayAgo.toISOString().replace('T', ' ').slice(0, 19);
  const recentAlerts = stmts().recentAlerts.all(patientId, alertCutoff);

  let alertsSection = '';
  if (recentAlerts.length > 0) {
    const lines = recentAlerts.map((a) => {
      const vital = VITAL_LABELS[a.vital_type];
      const reading = vital && a.vital_value != null
        ? ` — ${a.vital_type} ${a.vital_value} ${vital.unit}`
        : '';
      return `- [${a.type}] ${a.title}${reading}`;
    });
    alertsSection = `\nRecent Alerts (last 24h):\n${lines.join('\n')}`;
  }

  // Emergency contact
  let emergencySection = '';
  if (patient.emergency_contact_name) {
    emergencySection = `\n- Emergency Contact: ${patient.emergency_contact_name}`;
    if (patient.emergency_contact_phone) emergencySection += ` (${patient.emergency_contact_phone})`;
  }

  // Alert preferences
  const enabledAlerts = Object.entries(alertPreferences)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const alertPrefSection = enabledAlerts.length
    ? `\n- Alert Preferences: Receiving ${enabledAlerts.join(', ')} alerts`
    : '';

  // Custom normal ranges
  let normalRangesSection = '';
  const rangeEntries = Object.entries(normalRanges).filter(([, v]) => v && (v.min != null || v.max != null));
  if (rangeEntries.length) {
    const lines = rangeEntries.map(([key, range]) => {
      const label = VITAL_LABELS[key]?.label || key;
      const unit = VITAL_LABELS[key]?.unit || '';
      const parts = [];
      if (range.min != null) parts.push(`min ${range.min}`);
      if (range.max != null) parts.push(`max ${range.max}`);
      return `- ${label}: ${parts.join(', ')} ${unit}`;
    });
    normalRangesSection = `\nCustom Normal Ranges (patient-specific):\n${lines.join('\n')}`;
  }

  return `${BASE_INSTRUCTIONS}

Patient Profile:
- Name: ${patient.name}${age != null ? `\n- Age: ${age} years old` : ''}${patient.date_of_birth ? `\n- Date of Birth: ${patient.date_of_birth}` : ''}
- Conditions: ${conditions.length ? conditions.join(', ') : 'None reported'}
- Medications: ${medications.length ? medications.join(', ') : 'None reported'}${emergencySection}${alertPrefSection}
${vitalsSection}${normalRangesSection}${riskSection}${alertsSection}`;
}

// ---------------------------------------------------------------------------
// Chat history management
// ---------------------------------------------------------------------------

export function saveMessage(patientId, role, content) {
  const id = uuidv4();
  const createdAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
  stmts().insertMessage.run(id, patientId, role, content, createdAt);
  return { id, patient_id: patientId, role, content, created_at: createdAt };
}

export function getRecentMessages(patientId, limit = 20) {
  // Fetch most recent N messages (DESC), then reverse to chronological order
  const rows = stmts().recentMessages.all(patientId, limit);
  return rows.reverse();
}

export function getHistory(patientId, page = 1, limit = 50) {
  const total = stmts().countMessages.get(patientId).total;
  const totalPages = Math.ceil(total / limit) || 1;

  // Page 1 = most recent messages. We compute offset from the end.
  const offset = Math.max(0, total - page * limit);
  const fetchLimit = Math.min(limit, total - offset);

  const messages = fetchLimit > 0
    ? db.prepare(
        'SELECT * FROM chat_history WHERE patient_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?',
      ).all(patientId, fetchLimit, offset)
    : [];

  return {
    messages,
    pagination: { page, limit, total, totalPages },
  };
}

export function clearHistory(patientId) {
  stmts().deleteHistory.run(patientId);
}

// ---------------------------------------------------------------------------
// AI call — streaming with non-streaming fallback
// ---------------------------------------------------------------------------

export async function sendMessage(patientId, userMessage) {
  // 1. Save user message
  saveMessage(patientId, 'user', userMessage);

  // 2. Build context
  const systemPrompt = buildSystemPrompt(patientId);
  const recentHistory = getRecentMessages(patientId, 20);

  // The user message is already the last one in recentHistory (we just saved it),
  // so we use recentHistory directly as the conversation.
  const messages = [
    { role: 'system', content: systemPrompt },
    ...recentHistory.map((m) => ({ role: m.role, content: m.content })),
  ];

  // 3. Try streaming
  try {
    const stream = await getClient().chat.completions.create({
      model: process.env.FEATHERLESS_MODEL,
      messages,
      temperature: 0.7,
      stream: true,
    });
    return { stream };
  } catch (streamErr) {
    // 4. Fallback to non-streaming
    try {
      const response = await chatCompletion(messages, { temperature: 0.7 });
      const content = response.choices?.[0]?.message?.content || 'I apologize, but I was unable to generate a response. Please try again.';
      return { content };
    } catch {
      return { content: 'I apologize, but I\'m having trouble connecting right now. Please try again in a moment.' };
    }
  }
}
