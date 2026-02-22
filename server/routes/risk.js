import { Router } from 'express';
import db from '../db/database.js';
import {
  calculateRiskScore,
  predictRisk,
  getCachedPrediction,
  setCachedPrediction,
} from '../services/riskEngine.js';

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------

const getPatientStmt = db.prepare(
  'SELECT id, name, conditions, medications FROM patients WHERE id = ?',
);

const latestVitalStmt = db.prepare(
  'SELECT * FROM vitals WHERE patient_id = ? ORDER BY timestamp DESC LIMIT 1',
);

// ---------------------------------------------------------------------------
// Shared helper — fetches patient profile, latest vitals, and 7-day history
// ---------------------------------------------------------------------------

function fetchRiskContext(patientId) {
  const patient = getPatientStmt.get(patientId);
  if (!patient) return { error: 'Patient not found' };

  const conditions = JSON.parse(patient.conditions || '[]');
  const medications = JSON.parse(patient.medications || '[]');

  const latest = latestVitalStmt.get(patientId);
  if (!latest) return { error: 'No vitals found for this patient' };

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const startDate = sevenDaysAgo.toISOString().replace('T', ' ').slice(0, 19);

  const history = db.prepare(
    'SELECT * FROM vitals WHERE patient_id = ? AND timestamp >= ? ORDER BY timestamp ASC',
  ).all(patientId, startDate);

  return { patient, conditions, medications, latest, history };
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export default function createRiskRouter() {
  const router = Router();

  // GET /api/risk/:patientId/score — rule-based score only (instant, no AI)
  router.get('/:patientId/score', (req, res) => {
    const { patientId } = req.params;
    const ctx = fetchRiskContext(patientId);
    if (ctx.error) {
      return res.status(404).json({ error: ctx.error });
    }

    const ruleBasedScore = calculateRiskScore(ctx.latest, ctx.history, ctx.conditions);

    res.json({
      patientId,
      ruleBasedScore,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/risk/:patientId/insights — AI prediction (slow, cached)
  router.get('/:patientId/insights', async (req, res) => {
    const { patientId } = req.params;
    const bypassCache = req.query.refresh === 'true';

    // Check cache first
    if (!bypassCache) {
      const cached = getCachedPrediction(patientId);
      if (cached) {
        return res.json({
          patientId,
          aiPrediction: cached.result,
          cached: true,
          analyzedAt: new Date(cached.timestamp).toISOString(),
          timestamp: new Date().toISOString(),
        });
      }
    }

    const ctx = fetchRiskContext(patientId);
    if (ctx.error) {
      return res.status(404).json({ error: ctx.error });
    }

    const aiPrediction = await predictRisk(ctx.latest, ctx.history, {
      name: ctx.patient.name,
      conditions: ctx.conditions,
      medications: ctx.medications,
    });

    // Cache the result
    const now = Date.now();
    setCachedPrediction(patientId, aiPrediction);

    res.json({
      patientId,
      aiPrediction,
      cached: false,
      analyzedAt: new Date(now).toISOString(),
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
