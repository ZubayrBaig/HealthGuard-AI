import { useState, useEffect, useRef } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────

const VITAL_NAMES = {
  heart_rate: 'Heart Rate',
  blood_pressure_systolic: 'Systolic BP',
  blood_pressure_diastolic: 'Diastolic BP',
  glucose: 'Blood Glucose',
  oxygen_saturation: 'SpO2',
  temperature: 'Temperature',
};

const TREND_CONFIG = {
  worsening: { icon: TrendingUp, className: 'text-red-500' },
  improving: { icon: TrendingDown, className: 'text-green-500' },
  stable: { icon: Minus, className: 'text-gray-400' },
};

const CATEGORY_LABELS = {
  low: 'Low Risk',
  moderate: 'Moderate',
  high: 'High',
  critical: 'Critical',
};

function getColor(score) {
  if (score >= 81) return '#ef4444';
  if (score >= 61) return '#f97316';
  if (score >= 31) return '#eab308';
  return '#22c55e';
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RiskScoreGauge({
  score = 0,
  category = 'low',
  factors = [],
  loading = false,
  onRefresh,
}) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const rafRef = useRef(null);

  // Animate score from 0 to target over ~1 second
  useEffect(() => {
    if (loading) {
      setAnimatedScore(0);
      return;
    }

    const target = score;
    const duration = 1000;
    const startTime = performance.now();
    const startScore = 0;

    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(startScore + (target - startScore) * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [score, loading]);

  const radius = 80;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75; // 270 degrees
  const filledLength = (animatedScore / 100) * arcLength;
  const color = getColor(animatedScore);

  const topFactors = factors.filter((f) => f.score > 0).slice(0, 3);

  return (
    <div>
      {/* Gauge */}
      <div className="flex flex-col items-center">
        <svg width="200" height="200" viewBox="0 0 200 200" className="mb-2">
          {/* Background track */}
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
            transform="rotate(135 100 100)"
          />

          {loading ? (
            /* Pulsing loading ring */
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke="#94a3b8"
              strokeWidth={strokeWidth}
              strokeDasharray={`${arcLength * 0.3} ${circumference}`}
              strokeLinecap="round"
              transform="rotate(135 100 100)"
              className="animate-spin"
              style={{
                transformOrigin: '100px 100px',
                animation: 'spin 1.5s linear infinite',
              }}
            />
          ) : (
            /* Filled arc */
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${filledLength} ${circumference}`}
              strokeLinecap="round"
              transform="rotate(135 100 100)"
            />
          )}

          {/* Score text */}
          <text
            x="100"
            y="92"
            textAnchor="middle"
            className="text-4xl font-bold"
            fill="#0f172a"
          >
            {loading ? '—' : animatedScore}
          </text>
          <text
            x="100"
            y="116"
            textAnchor="middle"
            className="text-sm"
            fill="#64748b"
          >
            / 100
          </text>
        </svg>

        {/* Category badge */}
        {!loading && (
          <span
            className="text-sm font-semibold px-3 py-1 rounded-full"
            style={{ backgroundColor: `${color}20`, color }}
          >
            {CATEGORY_LABELS[category] || category}
          </span>
        )}
      </div>

      {/* Refresh button */}
      {onRefresh && (
        <div className="flex justify-center mt-3">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Analysis
          </button>
        </div>
      )}

      {/* Risk factors */}
      {topFactors.length > 0 && (
        <div className="mt-5 space-y-2">
          <h4 className="text-sm font-medium text-gray-500">Top Risk Factors</h4>
          {topFactors.map((factor) => {
            const trendInfo = TREND_CONFIG[factor.trend] || TREND_CONFIG.stable;
            const TrendIcon = trendInfo.icon;
            const barWidth = Math.min((factor.score / 25) * 100, 100);
            return (
              <div key={factor.vital} className="py-2 px-3 rounded-lg bg-gray-50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">
                    {VITAL_NAMES[factor.vital] || factor.vital}
                  </span>
                  <div className="flex items-center gap-1">
                    <TrendIcon className={`h-3.5 w-3.5 ${trendInfo.className}`} />
                    <span className="text-xs font-medium text-gray-500">
                      +{factor.score}
                    </span>
                  </div>
                </div>
                {/* Score contribution bar */}
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-1">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${barWidth}%`,
                      backgroundColor: getColor(factor.score * 4),
                    }}
                  />
                </div>
                <p className="text-xs text-gray-500 leading-snug">{factor.explanation}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
