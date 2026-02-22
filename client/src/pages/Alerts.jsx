import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Bell,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNotification } from '../context/NotificationContext';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertTriangle,
    badge: 'bg-red-100 text-red-700',
    border: 'border-l-red-500',
    activeTab: 'bg-red-500 text-white',
    label: 'Critical',
  },
  warning: {
    icon: AlertCircle,
    badge: 'bg-amber-100 text-amber-700',
    border: 'border-l-amber-500',
    activeTab: 'bg-amber-500 text-white',
    label: 'Warning',
  },
  info: {
    icon: Info,
    badge: 'bg-blue-100 text-blue-700',
    border: 'border-l-blue-500',
    activeTab: 'bg-blue-500 text-white',
    label: 'Info',
  },
};

const VITAL_LABELS = {
  heart_rate: { label: 'Heart Rate', unit: 'BPM' },
  blood_pressure_systolic: { label: 'Systolic BP', unit: 'mmHg' },
  blood_pressure_diastolic: { label: 'Diastolic BP', unit: 'mmHg' },
  glucose: { label: 'Blood Glucose', unit: 'mg/dL' },
  oxygen_saturation: { label: 'SpO2', unit: '%' },
  temperature: { label: 'Temperature', unit: '°F' },
};

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'warning', label: 'Warning' },
  { key: 'info', label: 'Info' },
];

const PAGE_SIZE = 15;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTimestamp(ts) {
  return new Date(ts.replace(' ', 'T'));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AlertSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-gray-200 p-4 animate-pulse"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="h-8 w-8 bg-gray-200 rounded-lg" />
            <div className="h-5 w-48 bg-gray-200 rounded" />
            <div className="ml-auto h-4 w-20 bg-gray-200 rounded" />
          </div>
          <div className="h-4 w-full bg-gray-200 rounded mb-2" />
          <div className="h-4 w-3/4 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  );
}

function AlertCard({ alert, onAcknowledge, expanded, onToggleEmergency }) {
  const [acknowledging, setAcknowledging] = useState(false);
  const config = SEVERITY_CONFIG[alert.type] || SEVERITY_CONFIG.info;
  const SeverityIcon = config.icon;
  const vital = VITAL_LABELS[alert.vital_type];
  const isAcknowledged = !!alert.acknowledged;
  const timeAgo = formatDistanceToNow(parseTimestamp(alert.created_at), {
    addSuffix: true,
  });

  async function handleAcknowledge() {
    try {
      setAcknowledging(true);
      await onAcknowledge(alert.id);
    } catch {
      // Silently fail
    } finally {
      setAcknowledging(false);
    }
  }

  return (
    <div
      className={`bg-white rounded-lg border border-gray-200 border-l-4 ${config.border} p-4 transition-opacity ${
        isAcknowledged ? 'opacity-60' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-2">
        <div className={`p-1.5 rounded-lg ${config.badge}`}>
          <SeverityIcon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {alert.title}
            </h3>
            {isAcknowledged && (
              <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex-shrink-0">
                <Check className="h-3 w-3" />
                Acknowledged
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400">{timeAgo}</span>
        </div>
      </div>

      {/* AI message (or fallback to basic) */}
      <p className="text-sm text-gray-700 leading-relaxed mb-3">
        {alert.ai_message || alert.message}
      </p>

      {/* Triggering vital */}
      {vital && alert.vital_value != null && (
        <div className="text-xs text-gray-500 mb-3">
          <span className="font-medium text-gray-600">{vital.label}:</span>{' '}
          {alert.vital_value} {vital.unit}
          {alert.threshold_value != null && (
            <span className="text-gray-400">
              {' '}
              (threshold: {alert.threshold_value} {vital.unit})
            </span>
          )}
        </div>
      )}

      {/* Actions row */}
      <div className="flex items-center gap-2">
        {!isAcknowledged && (
          <button
            onClick={handleAcknowledge}
            disabled={acknowledging}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            {acknowledging ? 'Acknowledging...' : 'Acknowledge'}
          </button>
        )}

        {alert.type === 'critical' && alert.emergency_context && (
          <button
            onClick={() => onToggleEmergency(alert.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            Emergency Info
          </button>
        )}
      </div>

      {/* Emergency context (expanded) */}
      {expanded && alert.emergency_context && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800 leading-relaxed">
            {alert.emergency_context}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Alerts() {
  const { acknowledgeAlert, refreshUnread } = useNotification();
  const [patientId, setPatientId] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [page, setPage] = useState(1);
  const [expandedEmergency, setExpandedEmergency] = useState(new Set());

  // Fetch patient ID
  useEffect(() => {
    async function fetchPatient() {
      try {
        const { data: patients } = await api.get('/api/patients');
        if (patients.length) setPatientId(patients[0].id);
      } catch {
        // Silent fail
      }
    }
    fetchPatient();
  }, []);

  // Fetch alerts
  const fetchAlerts = useCallback(async () => {
    if (!patientId) return;
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', PAGE_SIZE.toString());
      if (activeFilter !== 'all') params.set('type', activeFilter);
      if (!showAcknowledged) params.set('acknowledged', 'false');

      const { data } = await api.get(
        `/api/alerts/${patientId}?${params.toString()}`,
      );
      setAlerts(data.alerts);
      setPagination(data.pagination);
    } catch {
      // Keep existing data
    } finally {
      setLoading(false);
    }
  }, [patientId, page, activeFilter, showAcknowledged]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [activeFilter, showAcknowledged]);

  async function handleAcknowledge(alertId) {
    await acknowledgeAlert(alertId);
    // Optimistically update local state
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, acknowledged: 1 } : a)),
    );
    refreshUnread();
  }

  function handleToggleEmergency(alertId) {
    setExpandedEmergency((prev) => {
      const next = new Set(prev);
      if (next.has(alertId)) {
        next.delete(alertId);
      } else {
        next.add(alertId);
      }
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Alerts</h1>
        <p className="text-sm text-gray-500 mt-1">
          Monitor and manage health alert notifications
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {FILTER_TABS.map((tab) => {
            const isActive = activeFilter === tab.key;
            const sevConfig = SEVERITY_CONFIG[tab.key];
            return (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  isActive
                    ? sevConfig
                      ? sevConfig.activeTab
                      : 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <span className="text-sm text-gray-600">Show acknowledged</span>
          <button
            role="switch"
            aria-checked={showAcknowledged}
            onClick={() => setShowAcknowledged((v) => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              showAcknowledged ? 'bg-blue-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                showAcknowledged ? 'translate-x-4.5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </label>
      </div>

      {/* Alert list */}
      {loading ? (
        <AlertSkeleton />
      ) : alerts.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-16">
          <div className="p-4 rounded-full bg-gray-100 mb-4">
            <Bell className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            No alerts found
          </h3>
          <p className="text-sm text-gray-500 text-center max-w-sm">
            {activeFilter !== 'all'
              ? `No ${activeFilter} alerts to show.`
              : 'All vitals are within normal range. No alerts to display.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onAcknowledge={handleAcknowledge}
              expanded={expandedEmergency.has(alert.id)}
              onToggleEmergency={handleToggleEmergency}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.totalPages}
            <span className="text-gray-400 ml-1">
              ({pagination.total} total)
            </span>
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= pagination.totalPages}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
