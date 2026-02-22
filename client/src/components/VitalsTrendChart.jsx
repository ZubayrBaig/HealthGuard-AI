import { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { format } from 'date-fns';

const LINE_CONFIG = [
  { key: 'heart_rate', label: 'Heart Rate', color: '#ef4444', show: true },
  { key: 'glucose', label: 'Glucose', color: '#f97316', show: true },
  { key: 'systolic', label: 'Systolic', color: '#8b5cf6', show: true },
  { key: 'diastolic', label: 'Diastolic', color: '#a78bfa', show: true, dashed: true },
];

export default function VitalsTrendChart({ data, range, onRangeChange }) {
  const [visibleLines, setVisibleLines] = useState({
    heart_rate: true,
    glucose: true,
    systolic: true,
    diastolic: true,
  });

  const chartData = data
    .slice()
    .reverse()
    .map((v) => ({
      timestamp: v.timestamp,
      date: format(new Date(v.timestamp.replace(' ', 'T')), 'MMM d'),
      time: format(new Date(v.timestamp.replace(' ', 'T')), 'MMM d, h:mm a'),
      heart_rate: v.heart_rate,
      glucose: v.glucose,
      systolic: v.blood_pressure_systolic,
      diastolic: v.blood_pressure_diastolic,
    }));

  const toggleLine = (key) => {
    setVisibleLines((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="text-lg font-semibold text-gray-900">Vitals Trend</h3>
        <div className="flex items-center gap-3">
          {/* Line toggles */}
          <div className="flex items-center gap-1.5">
            {LINE_CONFIG.map((line) => (
              <button
                key={line.key}
                onClick={() => toggleLine(line.key)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                  visibleLines[line.key]
                    ? 'border-gray-300 bg-white text-gray-700'
                    : 'border-transparent bg-gray-100 text-gray-400'
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: visibleLines[line.key] ? line.color : '#d1d5db',
                  }}
                />
                {line.label}
              </button>
            ))}
          </div>

          {/* Range selector */}
          <select
            value={range}
            onChange={(e) => onRangeChange(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="90d">90 days</option>
          </select>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: '#64748b' }}
            tickLine={false}
            axisLine={{ stroke: '#e2e8f0' }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 12, fill: '#64748b' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '13px',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            }}
            labelFormatter={(_, payload) =>
              payload?.[0]?.payload?.time || ''
            }
          />
          {LINE_CONFIG.map(
            (line) =>
              visibleLines[line.key] && (
                <Line
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  stroke={line.color}
                  strokeWidth={line.dashed ? 1.5 : 2}
                  strokeDasharray={line.dashed ? '4 2' : undefined}
                  dot={false}
                  name={line.label}
                  connectNulls
                />
              ),
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
