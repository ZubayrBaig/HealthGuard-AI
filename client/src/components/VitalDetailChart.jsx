import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
} from 'recharts';
import { format } from 'date-fns';

function CustomDot({ cx, cy, payload, dataKey, normalMin, normalMax, color }) {
  const val = payload[dataKey];
  if (val == null || (val >= normalMin && val <= normalMax)) return null;
  return <circle cx={cx} cy={cy} r={4} fill="#ef4444" stroke="#fff" strokeWidth={1.5} />;
}

function CustomTooltip({ active, payload, unit, normalMin, normalMax, isBP }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-lg text-sm">
      <p className="text-gray-500 mb-1">{row.time}</p>
      {isBP ? (
        <>
          <p className="font-medium text-gray-900">
            Systolic: <span style={{ color: '#8b5cf6' }}>{row.systolic ?? '—'}</span> mmHg
            {row.systolic != null && (row.systolic < 90 || row.systolic > 120) && (
              <span className="ml-1 text-red-500 text-xs">abnormal</span>
            )}
          </p>
          <p className="font-medium text-gray-900">
            Diastolic: <span style={{ color: '#a78bfa' }}>{row.diastolic ?? '—'}</span> mmHg
            {row.diastolic != null && (row.diastolic < 60 || row.diastolic > 80) && (
              <span className="ml-1 text-red-500 text-xs">abnormal</span>
            )}
          </p>
        </>
      ) : (
        <p className="font-medium text-gray-900">
          {payload[0]?.name}: <span style={{ color: payload[0]?.color }}>{row.value ?? '—'}</span> {unit}
          {row.value != null && (row.value < normalMin || row.value > normalMax) && (
            <span className="ml-1 text-red-500 text-xs">abnormal</span>
          )}
        </p>
      )}
    </div>
  );
}

export default function VitalDetailChart({ data, vitalConfig }) {
  const isBP = vitalConfig.key === 'blood_pressure';

  const chartData = data
    .slice()
    .reverse()
    .map((v) => {
      const ts = v.timestamp.replace(' ', 'T');
      if (isBP) {
        return {
          date: format(new Date(ts), 'MMM d'),
          time: format(new Date(ts), 'MMM d, h:mm a'),
          systolic: v.blood_pressure_systolic,
          diastolic: v.blood_pressure_diastolic,
        };
      }
      return {
        date: format(new Date(ts), 'MMM d'),
        time: format(new Date(ts), 'MMM d, h:mm a'),
        value: v[vitalConfig.key],
      };
    });

  // Compute Y domain to always include normal range
  let yMin, yMax;
  if (isBP) {
    const allVals = chartData.flatMap((d) => [d.systolic, d.diastolic].filter((v) => v != null));
    yMin = Math.min(60, ...allVals) - 5;
    yMax = Math.max(120, ...allVals) + 5;
  } else {
    const allVals = chartData.map((d) => d.value).filter((v) => v != null);
    yMin = Math.min(vitalConfig.normalMin, ...allVals) - (vitalConfig.normalMax - vitalConfig.normalMin) * 0.15;
    yMax = Math.max(vitalConfig.normalMax, ...allVals) + (vitalConfig.normalMax - vitalConfig.normalMin) * 0.15;
  }

  // Round for cleaner axis
  yMin = Math.floor(yMin);
  yMax = Math.ceil(yMax);

  const gradientId = `gradient-${vitalConfig.key}`;
  const gradientIdDia = 'gradient-diastolic';

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[350px] text-gray-400 text-sm">
        No data available for this range.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={vitalConfig.color} stopOpacity={0.15} />
            <stop offset="95%" stopColor={vitalConfig.color} stopOpacity={0.02} />
          </linearGradient>
          {isBP && (
            <linearGradient id={gradientIdDia} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.1} />
              <stop offset="95%" stopColor="#a78bfa" stopOpacity={0.01} />
            </linearGradient>
          )}
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

        {/* Normal range band(s) */}
        {isBP ? (
          <>
            <ReferenceArea y1={90} y2={120} fill="#22c55e" fillOpacity={0.06} label="" />
            <ReferenceArea y1={60} y2={80} fill="#22c55e" fillOpacity={0.04} label="" />
          </>
        ) : (
          <ReferenceArea
            y1={vitalConfig.normalMin}
            y2={vitalConfig.normalMax}
            fill="#22c55e"
            fillOpacity={0.08}
          />
        )}

        <XAxis
          dataKey="date"
          tick={{ fontSize: 12, fill: '#64748b' }}
          tickLine={false}
          axisLine={{ stroke: '#e2e8f0' }}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[yMin, yMax]}
          tick={{ fontSize: 12, fill: '#64748b' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          content={
            <CustomTooltip
              unit={vitalConfig.unit}
              normalMin={vitalConfig.normalMin}
              normalMax={vitalConfig.normalMax}
              isBP={isBP}
            />
          }
        />

        {isBP ? (
          <>
            <Area
              type="monotone"
              dataKey="systolic"
              stroke="#8b5cf6"
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              name="Systolic"
              dot={(props) => (
                <CustomDot {...props} dataKey="systolic" normalMin={90} normalMax={120} color="#8b5cf6" />
              )}
              connectNulls
            />
            <Area
              type="monotone"
              dataKey="diastolic"
              stroke="#a78bfa"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              fill={`url(#${gradientIdDia})`}
              name="Diastolic"
              dot={(props) => (
                <CustomDot {...props} dataKey="diastolic" normalMin={60} normalMax={80} color="#a78bfa" />
              )}
              connectNulls
            />
          </>
        ) : (
          <Area
            type="monotone"
            dataKey="value"
            stroke={vitalConfig.color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            name={vitalConfig.label}
            dot={(props) => (
              <CustomDot
                {...props}
                dataKey="value"
                normalMin={vitalConfig.normalMin}
                normalMax={vitalConfig.normalMax}
                color={vitalConfig.color}
              />
            )}
            connectNulls
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
