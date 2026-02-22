import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../utils/api';
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

// ---------------------------------------------------------------------------
// Section reveal wrapper — shows skeleton until loaded, then fades in content
// ---------------------------------------------------------------------------

function SectionReveal({ loaded, children, skeleton }) {
  if (!loaded) return skeleton;
  return <div className="animate-section-in">{children}</div>;
}

// ---------------------------------------------------------------------------
// Inline skeleton fragments
// ---------------------------------------------------------------------------

function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl p-5 border border-gray-200">
          <div className="animate-pulse space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-4 w-20 bg-gray-200 rounded" />
              <div className="h-8 w-8 bg-gray-200 rounded-lg" />
            </div>
            <div className="h-8 w-24 bg-gray-200 rounded" />
            <div className="h-3 w-16 bg-gray-200 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function GaugeSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-5 w-32 bg-gray-200 rounded mb-6" />
      <div className="h-48 w-48 bg-gray-200 rounded-full mx-auto" />
      <div className="mt-6 space-y-3">
        <div className="h-4 w-full bg-gray-200 rounded" />
        <div className="h-4 w-4/5 bg-gray-200 rounded" />
        <div className="h-4 w-3/5 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-5 w-28 bg-gray-200 rounded" />
        <div className="h-8 w-24 bg-gray-200 rounded" />
      </div>
      <div className="h-72 bg-gray-200 rounded" />
    </div>
  );
}

function AIInsightsSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-7 w-7 bg-purple-100 rounded-lg" />
        <div className="h-5 w-36 bg-gray-200 rounded" />
      </div>
      <div className="space-y-3">
        <div className="h-4 rounded animate-shimmer w-3/4" />
        <div className="h-4 rounded animate-shimmer w-full" />
        <div className="h-4 rounded animate-shimmer w-2/3" />
        <p className="text-xs text-gray-400 mt-3 text-center">AI is analyzing your health data...</p>
      </div>
    </div>
  );
}

function AlertsSkeleton() {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <div className="animate-pulse">
        <div className="h-5 w-28 bg-gray-200 rounded mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-6 w-16 bg-gray-200 rounded-full" />
              <div className="h-4 w-full bg-gray-200 rounded" />
              <div className="h-4 w-24 bg-gray-200 rounded flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export default function Dashboard() {
  // Phase 1: patient fetch
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [patientId, setPatientId] = useState(null);

  // Phase 2: independent section data (null = loading)
  const [latestVitals, setLatestVitals] = useState(null);
  const [summary, setSummary] = useState(null);
  const [vitalsHistory, setVitalsHistory] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [riskScore, setRiskScore] = useState(null);
  const [aiInsights, setAiInsights] = useState(null);
  const [aiAnalyzedAt, setAiAnalyzedAt] = useState(null);
  const [aiCached, setAiCached] = useState(false);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(true);
  const [riskScoreLoading, setRiskScoreLoading] = useState(true);

  const [chartRange, setChartRange] = useState('7d');
  const [lastUpdated, setLastUpdated] = useState(null);
  const chartRangeRef = useRef(chartRange);

  useEffect(() => {
    chartRangeRef.current = chartRange;
  }, [chartRange]);

  // Phase 1: fetch patient ID
  useEffect(() => {
    let cancelled = false;

    async function fetchPatient() {
      try {
        const { data: patients } = await api.get('/api/patients');
        if (cancelled) return;
        if (!patients.length) {
          setError('No patients found');
          setInitialLoading(false);
          return;
        }
        setPatientId(patients[0].id);
        setInitialLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Failed to load dashboard data');
          setInitialLoading(false);
        }
      }
    }

    fetchPatient();
    return () => { cancelled = true; };
  }, []);

  // Phase 2: fire all data fetches independently once patientId is set
  useEffect(() => {
    if (!patientId) return;
    const range = chartRangeRef.current;

    // Vitals latest
    api.get(`/api/vitals/${patientId}/latest`)
      .then((r) => {
        setLatestVitals(r.data);
        setLastUpdated(new Date());
      })
      .catch(() => {});

    // Summary
    api.get(`/api/vitals/${patientId}/summary?range=${range}`)
      .then((r) => setSummary(r.data.summary))
      .catch(() => {});

    // Vitals history (chart)
    api.get(`/api/vitals/${patientId}?range=${range}`)
      .then((r) => setVitalsHistory(r.data))
      .catch(() => {});

    // Alerts
    api.get(`/api/alerts/${patientId}?limit=5`)
      .then((r) => setAlerts(r.data.alerts))
      .catch(() => {});

    // Risk score (rule-based, instant)
    api.get(`/api/risk/${patientId}/score`)
      .then((r) => {
        setRiskScore(r.data.ruleBasedScore);
        setRiskScoreLoading(false);
      })
      .catch(() => setRiskScoreLoading(false));

    // AI insights (slow, may be cached)
    api.get(`/api/risk/${patientId}/insights`)
      .then((r) => {
        setAiInsights(r.data.aiPrediction);
        setAiAnalyzedAt(r.data.analyzedAt);
        setAiCached(r.data.cached);
        setAiInsightsLoading(false);
      })
      .catch(() => setAiInsightsLoading(false));
  }, [patientId]);

  // Re-fetch chart data when range changes (after initial load)
  useEffect(() => {
    if (!patientId || initialLoading) return;

    async function refetch() {
      try {
        const [summaryRes, vitalsRes] = await Promise.all([
          api.get(`/api/vitals/${patientId}/summary?range=${chartRange}`),
          api.get(`/api/vitals/${patientId}?range=${chartRange}`),
        ]);
        setSummary(summaryRes.data.summary);
        setVitalsHistory(vitalsRes.data);
      } catch {
        // Silent fail — keep existing data
      }
    }

    refetch();
  }, [patientId, chartRange]);

  // Refresh latest vitals + alerts (polling)
  const refreshData = useCallback(async () => {
    if (!patientId) return;
    try {
      const [latestRes, alertsRes] = await Promise.all([
        api.get(`/api/vitals/${patientId}/latest`),
        api.get(`/api/alerts/${patientId}?limit=5`),
      ]);
      setLatestVitals(latestRes.data);
      setAlerts(alertsRes.data.alerts);
      setLastUpdated(new Date());
    } catch {
      // Keep existing data
    }
  }, [patientId]);

  // Refresh chart data (socket handler)
  const refreshChartData = useCallback(async () => {
    if (!patientId) return;
    try {
      const range = chartRangeRef.current;
      const [summaryRes, vitalsRes] = await Promise.all([
        api.get(`/api/vitals/${patientId}/summary?range=${range}`),
        api.get(`/api/vitals/${patientId}?range=${range}`),
      ]);
      setSummary(summaryRes.data.summary);
      setVitalsHistory(vitalsRes.data);
    } catch {
      // Keep existing data
    }
  }, [patientId]);

  // Socket.io for real-time updates
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
        setAlerts((prev) => prev ? [alert, ...prev].slice(0, 5) : [alert]);
      }
    });

    return () => socket.disconnect();
  }, [patientId, refreshChartData]);

  // Polling fallback
  useEffect(() => {
    if (!patientId || initialLoading) return;
    const interval = setInterval(refreshData, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [patientId, initialLoading, refreshData]);

  // Refresh handlers
  const handleRefreshScore = useCallback(async () => {
    if (!patientId) return;
    try {
      setRiskScoreLoading(true);
      const { data } = await api.get(`/api/risk/${patientId}/score`);
      setRiskScore(data.ruleBasedScore);
    } catch {
      // Keep existing data
    } finally {
      setRiskScoreLoading(false);
    }
  }, [patientId]);

  const handleRefreshInsights = useCallback(async () => {
    if (!patientId) return;
    try {
      setAiInsightsLoading(true);
      const { data } = await api.get(`/api/risk/${patientId}/insights?refresh=true`);
      setAiInsights(data.aiPrediction);
      setAiAnalyzedAt(data.analyzedAt);
      setAiCached(data.cached);
    } catch {
      // Keep existing data
    } finally {
      setAiInsightsLoading(false);
    }
  }, [patientId]);

  // Demo mode: listen for risk refresh trigger
  useEffect(() => {
    function handleDemoRefresh() {
      handleRefreshScore();
      handleRefreshInsights();
    }
    window.addEventListener('demo-refresh-risk', handleDemoRefresh);
    return () => window.removeEventListener('demo-refresh-risk', handleDemoRefresh);
  }, [handleRefreshScore, handleRefreshInsights]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (initialLoading) return <DashboardSkeleton />;

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

  const vitalsReady = latestVitals != null && summary != null;
  const chartReady = vitalsHistory != null;
  const gaugeReady = riskScore != null;
  const alertsReady = alerts != null;
  const aiReady = aiInsights != null && !aiInsightsLoading;

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
      <SectionReveal loaded={vitalsReady} skeleton={<StatCardsSkeleton />}>
        <div data-demo="stat-cards" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            label="Heart Rate"
            vitalKey="heart_rate"
            value={latestVitals?.heart_rate}
            unit="BPM"
            trend={summary?.heart_rate?.trend}
            icon={Heart}
            accentColor="red"
          />
          <StatCard
            label="Blood Pressure"
            vitalKey="blood_pressure_systolic"
            value={
              latestVitals?.blood_pressure_systolic != null
                ? `${latestVitals.blood_pressure_systolic}/${latestVitals.blood_pressure_diastolic}`
                : null
            }
            primaryValue={latestVitals?.blood_pressure_systolic}
            secondaryVitalKey="blood_pressure_diastolic"
            secondaryValue={latestVitals?.blood_pressure_diastolic}
            unit="mmHg"
            trend={summary?.blood_pressure_systolic?.trend}
            icon={Activity}
            accentColor="purple"
          />
          <StatCard
            label="Blood Glucose"
            vitalKey="glucose"
            value={latestVitals?.glucose}
            unit="mg/dL"
            trend={summary?.glucose?.trend}
            icon={Droplets}
            accentColor="orange"
          />
          <StatCard
            label="SpO2"
            vitalKey="oxygen_saturation"
            value={latestVitals?.oxygen_saturation}
            unit="%"
            trend={summary?.oxygen_saturation?.trend}
            icon={Wind}
            accentColor="blue"
          />
          <StatCard
            label="Sleep"
            vitalKey="sleep_hours"
            value={latestVitals?.sleep_hours}
            unit="hrs"
            trend={summary?.sleep_hours?.trend}
            icon={Moon}
            accentColor="indigo"
          />
        </div>
      </SectionReveal>

      {/* MIDDLE ROW: Risk Score + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div data-demo="risk-gauge" className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <SectionReveal loaded={gaugeReady} skeleton={<GaugeSkeleton />}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Health Risk Score
            </h3>
            <RiskScoreGauge
              score={riskScore?.overallScore ?? 0}
              category={riskScore?.category ?? 'low'}
              factors={riskScore?.factors ?? []}
              loading={riskScoreLoading}
              onRefresh={handleRefreshScore}
            />
          </SectionReveal>
        </div>

        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-6">
          <SectionReveal loaded={chartReady} skeleton={<ChartSkeleton />}>
            <VitalsTrendChart
              data={vitalsHistory ?? []}
              range={chartRange}
              onRangeChange={setChartRange}
            />
          </SectionReveal>
        </div>
      </div>

      {/* AI Insights */}
      <SectionReveal loaded={aiReady} skeleton={<AIInsightsSkeleton />}>
        <AIInsightsCard
          aiPrediction={aiInsights}
          loading={false}
          analyzedAt={aiAnalyzedAt}
          onRefresh={handleRefreshInsights}
          cached={aiCached}
        />
      </SectionReveal>

      {/* BOTTOM ROW: Recent Alerts */}
      <SectionReveal loaded={alertsReady} skeleton={<AlertsSkeleton />}>
        <RecentAlerts alerts={alerts ?? []} />
      </SectionReveal>
    </div>
  );
}
