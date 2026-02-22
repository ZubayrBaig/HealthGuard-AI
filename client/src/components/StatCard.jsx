import { TrendingUp, TrendingDown, Minus, Watch, Activity as ActivityIcon, HeartPulse, CircleDot, Droplets, Mountain } from 'lucide-react';

const DEVICE_ICON_MAP = {
  watch: Watch,
  activity: ActivityIcon,
  'heart-pulse': HeartPulse,
  'circle-dot': CircleDot,
  droplets: Droplets,
  mountain: Mountain,
};

const STATUS_THRESHOLDS = {
  heart_rate: [
    { check: v => v > 150 || v < 40, status: 'critical' },
    { check: v => v > 120 || v < 50, status: 'warning' },
  ],
  blood_pressure_systolic: [
    { check: v => v > 160, status: 'critical' },
    { check: v => v > 140, status: 'warning' },
  ],
  blood_pressure_diastolic: [
    { check: v => v > 100, status: 'critical' },
    { check: v => v > 90, status: 'warning' },
  ],
  glucose: [
    { check: v => v > 250, status: 'critical' },
    { check: v => v > 200, status: 'warning' },
  ],
  oxygen_saturation: [
    { check: v => v < 92, status: 'critical' },
    { check: v => v < 95, status: 'warning' },
  ],
  temperature: [
    { check: v => v > 103, status: 'critical' },
    { check: v => v > 100.4, status: 'warning' },
  ],
};

function getStatus(vitalKey, value) {
  if (value == null) return 'normal';
  const rules = STATUS_THRESHOLDS[vitalKey];
  if (!rules) return 'normal';
  for (const rule of rules) {
    if (rule.check(value)) return rule.status;
  }
  return 'normal';
}

const STATUS_STYLES = {
  normal: 'border-green-200 bg-green-50/50',
  warning: 'border-yellow-300 bg-yellow-50/50',
  critical: 'border-red-300 bg-red-50/50',
};

const STATUS_DOT = {
  normal: 'bg-green-500',
  warning: 'bg-yellow-500',
  critical: 'bg-red-500',
};

const ACCENT_COLORS = {
  red: 'bg-red-100 text-red-600',
  purple: 'bg-purple-100 text-purple-600',
  orange: 'bg-orange-100 text-orange-600',
  blue: 'bg-blue-100 text-blue-600',
  indigo: 'bg-indigo-100 text-indigo-600',
};

const TREND_CONFIG = {
  improving: { icon: TrendingDown, label: 'Improving', className: 'text-green-600' },
  worsening: { icon: TrendingUp, label: 'Worsening', className: 'text-red-500' },
  stable: { icon: Minus, label: 'Stable', className: 'text-gray-400' },
};

export default function StatCard({
  label,
  vitalKey,
  value,
  unit,
  trend,
  icon: Icon,
  accentColor,
  primaryValue,
  secondaryVitalKey,
  secondaryValue,
  source,
  supportedDevices,
}) {
  // Determine status — for BP, check both and take worst
  let status = getStatus(vitalKey, primaryValue ?? value);
  if (secondaryVitalKey && secondaryValue != null) {
    const secondaryStatus = getStatus(secondaryVitalKey, secondaryValue);
    const severity = { critical: 2, warning: 1, normal: 0 };
    if (severity[secondaryStatus] > severity[status]) {
      status = secondaryStatus;
    }
  }

  const trendInfo = TREND_CONFIG[trend] || TREND_CONFIG.stable;
  const TrendIcon = trendInfo.icon;

  // For vitals where "higher is better", flip the trend arrow direction
  const higherIsBetter = vitalKey === 'oxygen_saturation' || vitalKey === 'sleep_hours';
  const TrendDisplay = higherIsBetter
    ? (trend === 'improving' ? TREND_CONFIG.improving : trend === 'worsening' ? TREND_CONFIG.worsening : TREND_CONFIG.stable)
    : trendInfo;

  return (
    <div className={`rounded-xl border p-5 transition-colors ${STATUS_STYLES[status]}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-600">{label}</span>
        <div className={`p-2 rounded-lg ${ACCENT_COLORS[accentColor]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-2xl font-bold text-gray-900">
          {value != null ? value : '—'}
        </span>
        <span className="text-sm text-gray-500">{unit}</span>
        {source && source !== 'manual' && source !== 'simulated' && source !== 'demo' && supportedDevices?.[source] && (() => {
          const dev = supportedDevices[source];
          const DevIcon = DEVICE_ICON_MAP[dev.icon] || Watch;
          return (
            <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-gray-400" title={`From ${dev.name}`}>
              <DevIcon className="h-3 w-3" style={{ color: dev.color }} />
            </span>
          );
        })()}
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
        <TrendDisplay.icon className={`h-3.5 w-3.5 ${TrendDisplay.className}`} />
        <span className={`text-xs font-medium ${TrendDisplay.className}`}>
          {TrendDisplay.label}
        </span>
      </div>
    </div>
  );
}
