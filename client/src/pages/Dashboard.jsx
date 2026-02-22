import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { io as socketIO } from 'socket.io-client';
import { Heart, Activity, Droplets, Wind, Moon, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import DashboardSkeleton from '../components/DashboardSkeleton';
import StatCard from '../components/StatCard';
import RiskScoreGauge from '../components/RiskScoreGauge';
import AIInsightsCard from '../components/AIInsightsCard';
import VitalsTrendChart from '../components/VitalsTrendChart';
import RecentAlerts from '../components/RecentAlerts';

const POLL_INTERVAL_MS = 30_000;

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [patientId, setPatientId] = useState(null);
  const [latestVitals, setLatestVitals] = useState(null);
  const [summary, setSummary] = useState(null);
  const [vitalsHistory, setVitalsHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [chartRange, setChartRange] = useState('7d');
  const [riskData, setRiskData] = useState(null);
  const [riskLoading, setRiskLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const chartRangeRef = useRef(chartRange);

  // Keep ref in sync so socket handler uses latest range
  useEffect(() => {
    chartRangeRef.current = chartRange;
  }, [chartRange]);

  // Initial data load
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        const { data: patients } = await axios.get('/api/patients');
        if (!patients.length) {
          setError('No patients found');
          return;
        }

        const pid = patients[0].id;
        if (cancelled) return;
        setPatientId(pid);

        const [latestRes, summaryRes, vitalsRes, alertsRes, riskRes] = await Promise.all([
          axios.get(`/api/vitals/${pid}/latest`),
          axios.get(`/api/vitals/${pid}/summary?range=${chartRange}`),
          axios.get(`/api/vitals/${pid}?range=${chartRange}`),
          axios.get(`/api/alerts/${pid}?limit=5`),
          axios.get(`/api/risk/${pid}`),
        ]);

        if (cancelled) return;
        setLatestVitals(latestRes.data);
        setSummary(summaryRes.data.summary);
        setVitalsHistory(vitalsRes.data);
        setAlerts(alertsRes.data.alerts);
        setRiskData(riskRes.data);
        setRiskLoading(false);
        setLastUpdated(new Date());
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Failed to load dashboard data');
          setRiskLoading(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, []);

  // Re-fetch when chart range changes (after initial load)
  useEffect(() => {
    if (!patientId || loading) return;

    async function refetch() {
      try {
        const [summaryRes, vitalsRes] = await Promise.all([
          axios.get(`/api/vitals/${patientId}/summary?range=${chartRange}`),
          axios.get(`/api/vitals/${patientId}?range=${chartRange}`),
        ]);
        setSummary(summaryRes.data.summary);
        setVitalsHistory(vitalsRes.data);
      } catch {
        // Silent fail on range change — keep existing data
      }
    }

    refetch();
  }, [patientId, chartRange]);

  // Refresh latest vitals + alerts (used by polling)
  const refreshData = useCallback(async () => {
    if (!patientId) return;
    try {
      const [latestRes, alertsRes] = await Promise.all([
        axios.get(`/api/vitals/${patientId}/latest`),
        axios.get(`/api/alerts/${patientId}?limit=5`),
      ]);
      setLatestVitals(latestRes.data);
      setAlerts(alertsRes.data.alerts);
      setLastUpdated(new Date());
    } catch {
      // Keep existing data on refresh failure
    }
  }, [patientId]);

  // Refresh chart data (used by socket handler)
  const refreshChartData = useCallback(async () => {
    if (!patientId) return;
    try {
      const range = chartRangeRef.current;
      const [summaryRes, vitalsRes] = await Promise.all([
        axios.get(`/api/vitals/${patientId}/summary?range=${range}`),
        axios.get(`/api/vitals/${patientId}?range=${range}`),
      ]);
      setSummary(summaryRes.data.summary);
      setVitalsHistory(vitalsRes.data);
    } catch {
      // Keep existing data
    }
  }, [patientId]);

  // Socket.io listener for real-time updates
  useEffect(() => {
    if (!patientId) return;

    const socket = socketIO({ path: '/socket.io' });

    socket.on('vitals-updated', (data) => {
      if (data.patientId === patientId) {
        setLatestVitals((prev) => ({ ...prev, ...data.reading }));
        setLastUpdated(new Date());
        refreshChartData();
      }
    });

    socket.on('new-alert', ({ alert }) => {
      if (alert) {
        setAlerts((prev) => [alert, ...prev].slice(0, 5));
      }
    });

    return () => socket.disconnect();
  }, [patientId, refreshChartData]);

  // Polling fallback: refresh every 30 seconds
  useEffect(() => {
    if (!patientId || loading) return;
    const interval = setInterval(refreshData, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [patientId, loading, refreshData]);

  const handleRefreshRisk = useCallback(async () => {
    if (!patientId) return;
    try {
      setRiskLoading(true);
      const { data } = await axios.get(`/api/risk/${patientId}`);
      setRiskData(data);
    } catch {
      // Keep existing data on failure
    } finally {
      setRiskLoading(false);
    }
  }, [patientId]);

  if (loading) return <DashboardSkeleton />;

  if (error) {
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
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Real-time health overview
          {lastUpdated && (
            <span className="text-gray-400">
              {' · '}Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
            </span>
          )}
        </p>
      </div>

      {/* TOP ROW: 5 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Heart Rate"
          vitalKey="heart_rate"
          value={latestVitals.heart_rate}
          unit="BPM"
          trend={summary.heart_rate?.trend}
          icon={Heart}
          accentColor="red"
        />
        <StatCard
          label="Blood Pressure"
          vitalKey="blood_pressure_systolic"
          value={
            latestVitals.blood_pressure_systolic != null
              ? `${latestVitals.blood_pressure_systolic}/${latestVitals.blood_pressure_diastolic}`
              : null
          }
          primaryValue={latestVitals.blood_pressure_systolic}
          secondaryVitalKey="blood_pressure_diastolic"
          secondaryValue={latestVitals.blood_pressure_diastolic}
          unit="mmHg"
          trend={summary.blood_pressure_systolic?.trend}
          icon={Activity}
          accentColor="purple"
        />
        <StatCard
          label="Blood Glucose"
          vitalKey="glucose"
          value={latestVitals.glucose}
          unit="mg/dL"
          trend={summary.glucose?.trend}
          icon={Droplets}
          accentColor="orange"
        />
        <StatCard
          label="SpO2"
          vitalKey="oxygen_saturation"
          value={latestVitals.oxygen_saturation}
          unit="%"
          trend={summary.oxygen_saturation?.trend}
          icon={Wind}
          accentColor="blue"
        />
        <StatCard
          label="Sleep"
          vitalKey="sleep_hours"
          value={latestVitals.sleep_hours}
          unit="hrs"
          trend={summary.sleep_hours?.trend}
          icon={Moon}
          accentColor="indigo"
        />
      </div>

      {/* MIDDLE ROW: Risk Score + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Health Risk Score
          </h3>
          <RiskScoreGauge
            score={riskData?.ruleBasedScore?.overallScore ?? 0}
            category={riskData?.ruleBasedScore?.category ?? 'low'}
            factors={riskData?.ruleBasedScore?.factors ?? []}
            loading={riskLoading}
            onRefresh={handleRefreshRisk}
          />
        </div>

        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-6">
          <VitalsTrendChart
            data={vitalsHistory}
            range={chartRange}
            onRangeChange={setChartRange}
          />
        </div>
      </div>

      {/* AI Insights */}
      <AIInsightsCard
        aiPrediction={riskData?.aiPrediction}
        loading={riskLoading}
      />

      {/* BOTTOM ROW: Recent Alerts */}
      <RecentAlerts alerts={alerts} />
    </div>
  );
}
