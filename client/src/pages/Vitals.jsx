import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Heart,
  Activity,
  Droplets,
  Wind,
  Thermometer,
  Moon,
  Footprints,
  Plus,
  RefreshCw,
} from 'lucide-react';
import VitalDetailChart from '../components/VitalDetailChart';
import LogVitalsModal from '../components/LogVitalsModal';

// ─── Vital type configuration ────────────────────────────────────────────────

const VITAL_TABS = [
  { key: 'heart_rate', label: 'Heart Rate', unit: 'BPM', color: '#ef4444', icon: Heart, normalMin: 60, normalMax: 100 },
  { key: 'blood_pressure', label: 'Blood Pressure', unit: 'mmHg', color: '#8b5cf6', icon: Activity, normalMin: 90, normalMax: 120 },
  { key: 'glucose', label: 'Glucose', unit: 'mg/dL', color: '#f97316', icon: Droplets, normalMin: 70, normalMax: 140 },
  { key: 'oxygen_saturation', label: 'SpO2', unit: '%', color: '#3b82f6', icon: Wind, normalMin: 95, normalMax: 100 },
  { key: 'temperature', label: 'Temperature', unit: '°F', color: '#10b981', icon: Thermometer, normalMin: 97.0, normalMax: 99.0 },
  { key: 'sleep_hours', label: 'Sleep', unit: 'hrs', color: '#6366f1', icon: Moon, normalMin: 7, normalMax: 9 },
  { key: 'steps', label: 'Steps', unit: 'steps', color: '#14b8a6', icon: Footprints, normalMin: 7000, normalMax: 10000 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSummaryKey(tab) {
  // Summary endpoint uses 'blood_pressure_systolic' not 'blood_pressure'
  return tab.key === 'blood_pressure' ? 'blood_pressure_systolic' : tab.key;
}

function getCurrentValue(latest, tab) {
  if (!latest) return null;
  if (tab.key === 'blood_pressure') {
    const sys = latest.blood_pressure_systolic;
    const dia = latest.blood_pressure_diastolic;
    if (sys == null) return null;
    return `${sys}/${dia}`;
  }
  return latest[tab.key];
}

function formatStatValue(val, tab) {
  if (val == null) return '—';
  if (tab.key === 'steps') return Math.round(val).toLocaleString();
  if (Number.isFinite(val)) return Math.round(val * 10) / 10;
  return val;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Vitals() {
  const [activeTab, setActiveTab] = useState('heart_rate');
  const [range, setRange] = useState('7d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [patientId, setPatientId] = useState(null);
  const [vitalsData, setVitalsData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [latestVitals, setLatestVitals] = useState(null);
  const [showLogModal, setShowLogModal] = useState(false);

  // Fetch patient ID on mount
  useEffect(() => {
    let cancelled = false;
    async function loadPatient() {
      try {
        const { data: patients } = await axios.get('/api/patients');
        if (!patients.length) {
          setError('No patients found');
          setLoading(false);
          return;
        }
        if (!cancelled) setPatientId(patients[0].id);
      } catch {
        if (!cancelled) {
          setError('Failed to load patient data');
          setLoading(false);
        }
      }
    }
    loadPatient();
    return () => { cancelled = true; };
  }, []);

  // Fetch vitals data when patientId or range changes
  const fetchData = useCallback(async () => {
    if (!patientId) return;
    try {
      setLoading(true);
      setError(null);
      const [vitalsRes, summaryRes, latestRes] = await Promise.all([
        axios.get(`/api/vitals/${patientId}?range=${range}`),
        axios.get(`/api/vitals/${patientId}/summary?range=${range}`),
        axios.get(`/api/vitals/${patientId}/latest`),
      ]);
      setVitalsData(vitalsRes.data);
      setSummary(summaryRes.data.summary);
      setLatestVitals(latestRes.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load vitals data');
    } finally {
      setLoading(false);
    }
  }, [patientId, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const activeConfig = VITAL_TABS.find((t) => t.key === activeTab);
  const summaryKey = getSummaryKey(activeConfig);
  const stats = summary?.[summaryKey];

  // For BP, also grab diastolic summary for min/max display
  const bpDiaStats = activeTab === 'blood_pressure' ? summary?.blood_pressure_diastolic : null;

  if (error && !vitalsData.length) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-600 font-medium mb-3">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Vitals</h1>
          <p className="text-sm text-gray-500 mt-1">Detailed vital sign tracking</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="90d">90 days</option>
          </select>
          <button
            onClick={() => setShowLogModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Log Vitals
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {VITAL_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border ${
                isActive
                  ? 'text-white border-transparent'
                  : 'text-gray-600 border-gray-200 bg-white hover:bg-gray-50'
              }`}
              style={isActive ? { backgroundColor: tab.color } : undefined}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Stats summary cards */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
              <div className="h-3 w-12 bg-gray-200 rounded mb-2" />
              <div className="h-6 w-16 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      ) : stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatMini
            label="Current"
            value={getCurrentValue(latestVitals, activeConfig)}
            unit={activeConfig.unit}
            config={activeConfig}
          />
          <StatMini
            label="Average"
            value={
              activeTab === 'blood_pressure' && stats?.avg != null && bpDiaStats?.avg != null
                ? `${Math.round(stats.avg)}/${Math.round(bpDiaStats.avg)}`
                : formatStatValue(stats?.avg, activeConfig)
            }
            unit={activeConfig.unit}
            config={activeConfig}
          />
          <StatMini
            label="Min"
            value={
              activeTab === 'blood_pressure' && stats?.min != null && bpDiaStats?.min != null
                ? `${stats.min}/${bpDiaStats.min}`
                : formatStatValue(stats?.min, activeConfig)
            }
            unit={activeConfig.unit}
            config={activeConfig}
          />
          <StatMini
            label="Max"
            value={
              activeTab === 'blood_pressure' && stats?.max != null && bpDiaStats?.max != null
                ? `${stats.max}/${bpDiaStats.max}`
                : formatStatValue(stats?.max, activeConfig)
            }
            unit={activeConfig.unit}
            config={activeConfig}
          />
        </div>
      )}

      {/* Normal range badge */}
      {!loading && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Normal range: {activeConfig.normalMin}–{activeConfig.normalMax} {activeConfig.unit}
          </span>
          {activeTab === 'blood_pressure' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Diastolic: 60–80 mmHg
            </span>
          )}
        </div>
      )}

      {/* Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {loading ? (
          <div className="h-[350px] bg-gray-100 rounded-lg animate-pulse" />
        ) : (
          <VitalDetailChart
            data={vitalsData}
            vitalConfig={activeConfig}
            range={range}
          />
        )}
      </div>

      {/* Log Vitals Modal */}
      <LogVitalsModal
        isOpen={showLogModal}
        onClose={() => setShowLogModal(false)}
        patientId={patientId}
        onSuccess={fetchData}
      />
    </div>
  );
}

// ─── StatMini sub-component ──────────────────────────────────────────────────

function StatMini({ label, value, unit, config }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-bold text-gray-900">
          {value != null ? value : '—'}
        </span>
        <span className="text-xs text-gray-500">{unit}</span>
      </div>
    </div>
  );
}
