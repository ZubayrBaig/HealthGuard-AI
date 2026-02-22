import { chatCompletion } from './ai.js';

// ---------------------------------------------------------------------------
// Risk thresholds (per-vital scoring zones)
// ---------------------------------------------------------------------------

// Each vital maps to scoring tiers. Value ranges are [low, high] inclusive.
// Score ranges: normal=0, warning/elevated=8-12, high/fever=13-18, critical=19-25
const RISK_SCORING = {
  heart_rate: {
    score(v) {
      if (v >= 60 && v <= 100) return { points: 0, zone: 'normal' };
      if ((v >= 50 && v < 60) || (v > 100 && v <= 120)) return { points: 10, zone: 'warning' };
      return { points: 22, zone: 'critical' }; // <50 or >120
    },
    explain(v) {
      if (v < 50) return `Heart rate ${v} BPM is critically low (< 50)`;
      if (v > 120) return `Heart rate ${v} BPM is critically high (> 120)`;
      if (v < 60) return `Heart rate ${v} BPM is below normal (< 60)`;
      if (v > 100) return `Heart rate ${v} BPM is above normal (> 100)`;
      return `Heart rate ${v} BPM is within normal range`;
    },
  },
  blood_pressure_systolic: {
    score(v) {
      if (v < 120) return { points: 0, zone: 'normal' };
      if (v <= 129) return { points: 8, zone: 'elevated' };
      if (v <= 139) return { points: 14, zone: 'high' };
      if (v <= 179) return { points: 18, zone: 'high' };
      return { points: 25, zone: 'crisis' }; // >= 180
    },
    explain(v) {
      if (v >= 180) return `Systolic BP ${v} mmHg is in hypertensive crisis (>= 180)`;
      if (v >= 130) return `Systolic BP ${v} mmHg is high (130-179)`;
      if (v >= 120) return `Systolic BP ${v} mmHg is elevated (120-129)`;
      return `Systolic BP ${v} mmHg is normal`;
    },
  },
  blood_pressure_diastolic: {
    score(v) {
      if (v < 80) return { points: 0, zone: 'normal' };
      if (v <= 89) return { points: 10, zone: 'high' };
      if (v < 120) return { points: 16, zone: 'high' };
      return { points: 25, zone: 'crisis' }; // >= 120
    },
    explain(v) {
      if (v >= 120) return `Diastolic BP ${v} mmHg is in hypertensive crisis (>= 120)`;
      if (v >= 80) return `Diastolic BP ${v} mmHg is high (>= 80)`;
      return `Diastolic BP ${v} mmHg is normal`;
    },
  },
  glucose: {
    score(v) {
      if (v >= 70 && v <= 140) return { points: 0, zone: 'normal' };
      if (v > 140 && v <= 200) return { points: 10, zone: 'high' };
      if (v > 200) return { points: 22, zone: 'critical' };
      if (v < 70 && v >= 55) return { points: 12, zone: 'warning' };
      return { points: 25, zone: 'critical' }; // < 55
    },
    explain(v) {
      if (v < 55) return `Blood glucose ${v} mg/dL is critically low (< 55)`;
      if (v > 200) return `Blood glucose ${v} mg/dL is critically high (> 200)`;
      if (v > 140) return `Blood glucose ${v} mg/dL is high (141-200)`;
      if (v < 70) return `Blood glucose ${v} mg/dL is low (55-69)`;
      return `Blood glucose ${v} mg/dL is within normal range`;
    },
  },
  oxygen_saturation: {
    score(v) {
      if (v >= 95) return { points: 0, zone: 'normal' };
      if (v >= 90) return { points: 12, zone: 'low' };
      return { points: 25, zone: 'critical' }; // < 90
    },
    explain(v) {
      if (v < 90) return `SpO2 ${v}% is critically low (< 90)`;
      if (v < 95) return `SpO2 ${v}% is low (90-94)`;
      return `SpO2 ${v}% is within normal range`;
    },
  },
  temperature: {
    score(v) {
      if (v >= 97.0 && v <= 99.5) return { points: 0, zone: 'normal' };
      if (v > 99.5 && v <= 103) return { points: 10, zone: 'fever' };
      if (v > 103) return { points: 22, zone: 'critical' };
      if (v < 97.0) return { points: 6, zone: 'warning' };
      return { points: 0, zone: 'normal' };
    },
    explain(v) {
      if (v > 103) return `Temperature ${v}°F is critically high (> 103)`;
      if (v > 99.5) return `Temperature ${v}°F indicates fever (99.5-103)`;
      if (v < 97.0) return `Temperature ${v}°F is below normal (< 97)`;
      return `Temperature ${v}°F is within normal range`;
    },
  },
};

// Condition-specific weight multipliers
const CONDITION_WEIGHTS = {
  'Type 2 Diabetes': { glucose: 1.5 },
  'Hypertension': { blood_pressure_systolic: 1.5, blood_pressure_diastolic: 1.5 },
  'Heart Disease': { heart_rate: 1.5, oxygen_saturation: 1.2 },
  'COPD': { oxygen_saturation: 1.5, temperature: 1.2 },
};

// Vitals where a positive slope indicates worsening
const HIGHER_IS_WORSE = new Set([
  'heart_rate', 'blood_pressure_systolic', 'blood_pressure_diastolic',
  'glucose', 'temperature',
]);

const SCORED_VITALS = Object.keys(RISK_SCORING);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function linearRegressionSlope(points) {
  const n = points.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (const { x, y } of points) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function getConditionWeight(conditions, vitalKey) {
  let weight = 1.0;
  for (const condition of conditions) {
    const weights = CONDITION_WEIGHTS[condition];
    if (weights && weights[vitalKey]) {
      weight = Math.max(weight, weights[vitalKey]);
    }
  }
  return weight;
}

function classifyTrend(slope, vitalKey) {
  const threshold = 0.5; // minimum slope magnitude to count as a trend
  if (Math.abs(slope) < threshold) return 'stable';
  const increasing = slope > 0;
  if (HIGHER_IS_WORSE.has(vitalKey)) {
    return increasing ? 'worsening' : 'improving';
  }
  // For SpO2: higher is better
  return increasing ? 'improving' : 'worsening';
}

// ---------------------------------------------------------------------------
// Rule-based risk calculator
// ---------------------------------------------------------------------------

export function calculateRiskScore(latestVitals, vitalsHistory, patientConditions) {
  const conditions = Array.isArray(patientConditions) ? patientConditions : [];
  const factors = [];
  let totalScore = 0;
  let outOfRangeCount = 0;

  for (const vitalKey of SCORED_VITALS) {
    const value = latestVitals?.[vitalKey];
    if (value == null) continue;

    const scorer = RISK_SCORING[vitalKey];
    const { points, zone } = scorer.score(value);
    const explanation = scorer.explain(value);
    const weight = getConditionWeight(conditions, vitalKey);

    // Weighted vital score
    const weightedPoints = Math.min(25, Math.round(points * weight));

    // Trend analysis from history
    const dataPoints = vitalsHistory
      .map((row, i) => (row[vitalKey] != null ? { x: i, y: row[vitalKey] } : null))
      .filter(Boolean);
    const slope = linearRegressionSlope(dataPoints);
    const trend = classifyTrend(slope, vitalKey);

    // Trend penalty: up to 5 points if trending in wrong direction
    let trendPenalty = 0;
    if (trend === 'worsening' && dataPoints.length >= 3) {
      const normalizedSlope = Math.min(Math.abs(slope) / 2, 1); // cap at 1
      trendPenalty = Math.round(normalizedSlope * 5);
    }

    const vitalScore = weightedPoints + trendPenalty;
    totalScore += vitalScore;

    if (zone !== 'normal') {
      outOfRangeCount++;
    }

    factors.push({
      vital: vitalKey,
      score: vitalScore,
      trend,
      zone,
      explanation,
    });
  }

  // Compound risk penalty
  if (outOfRangeCount >= 3) {
    totalScore += 10;
  } else if (outOfRangeCount >= 2) {
    totalScore += 5;
  }

  const overallScore = Math.max(0, Math.min(100, totalScore));

  let category;
  if (overallScore >= 80) category = 'critical';
  else if (overallScore >= 55) category = 'high';
  else if (overallScore >= 30) category = 'moderate';
  else category = 'low';

  // Sort factors by score descending so the worst are first
  factors.sort((a, b) => b.score - a.score);

  return { overallScore, category, factors };
}

// ---------------------------------------------------------------------------
// AI-powered prediction
// ---------------------------------------------------------------------------

const AI_FALLBACK = {
  predictions: [],
  recommendations: ['Unable to generate AI predictions at this time.'],
  confidence: 'low',
  reasoning: 'AI service unavailable or returned an invalid response.',
};

export async function predictRisk(latestVitals, vitalsHistory, patientProfile) {
  try {
    // Build summary of trends from history
    const trendSummary = {};
    for (const vitalKey of SCORED_VITALS) {
      const dataPoints = vitalsHistory
        .map((row, i) => (row[vitalKey] != null ? { x: i, y: row[vitalKey] } : null))
        .filter(Boolean);
      if (dataPoints.length < 2) continue;
      const values = dataPoints.map((p) => p.y);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const slope = linearRegressionSlope(dataPoints);
      trendSummary[vitalKey] = {
        avg: Math.round(avg * 10) / 10,
        min,
        max,
        trend: classifyTrend(slope, vitalKey),
      };
    }

    const systemPrompt = `You are a clinical risk assessment AI assistant. Analyze the patient data provided and generate a structured health risk assessment.

You MUST respond with ONLY valid JSON matching this exact schema (no markdown, no explanation outside JSON):
{
  "predictions": [
    { "risk": "description of potential risk", "timeframe": "24-72 hours", "likelihood": "low|medium|high" }
  ],
  "recommendations": ["actionable recommendation string"],
  "confidence": "low|medium|high",
  "reasoning": "brief explanation of your analysis"
}

Keep predictions to 2-4 items max. Keep recommendations to 3-5 items max. Be specific and actionable.`;

    const userMessage = `Patient Profile:
- Conditions: ${patientProfile.conditions?.join(', ') || 'None reported'}
- Medications: ${patientProfile.medications?.join(', ') || 'None reported'}

Latest Vital Signs:
- Heart Rate: ${latestVitals.heart_rate ?? 'N/A'} BPM
- Blood Pressure: ${latestVitals.blood_pressure_systolic ?? 'N/A'}/${latestVitals.blood_pressure_diastolic ?? 'N/A'} mmHg
- Blood Glucose: ${latestVitals.glucose ?? 'N/A'} mg/dL
- SpO2: ${latestVitals.oxygen_saturation ?? 'N/A'}%
- Temperature: ${latestVitals.temperature ?? 'N/A'}°F
- Sleep: ${latestVitals.sleep_hours ?? 'N/A'} hours

7-Day Vital Trends:
${JSON.stringify(trendSummary, null, 2)}

Analyze these vitals in the context of the patient's conditions and medications. Identify emerging risks and provide recommendations.`;

    const response = await chatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      { temperature: 0.3 },
    );

    const content = response.choices?.[0]?.message?.content;
    if (!content) return AI_FALLBACK;

    // Try to extract JSON from the response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    return {
      predictions: Array.isArray(parsed.predictions) ? parsed.predictions : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'low',
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    };
  } catch {
    return AI_FALLBACK;
  }
}
