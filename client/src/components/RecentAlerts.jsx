import { Link } from 'react-router-dom';
import { AlertTriangle, AlertCircle, Info, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertTriangle,
    badge: 'bg-red-100 text-red-700',
    dot: 'bg-red-500',
    label: 'Critical',
  },
  warning: {
    icon: AlertCircle,
    badge: 'bg-amber-100 text-amber-700',
    dot: 'bg-amber-500',
    label: 'Warning',
  },
  info: {
    icon: Info,
    badge: 'bg-blue-100 text-blue-700',
    dot: 'bg-blue-500',
    label: 'Info',
  },
};

export default function RecentAlerts({ alerts }) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Alerts</h3>
        <p className="text-sm text-gray-500 text-center py-8">
          No recent alerts. All vitals are within normal range.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Recent Alerts</h3>
        <Link
          to="/alerts"
          className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          View all
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="space-y-2">
        {alerts.map((alert) => {
          const config = SEVERITY_CONFIG[alert.type] || SEVERITY_CONFIG.info;
          const SeverityIcon = config.icon;
          const timeAgo = formatDistanceToNow(
            new Date(alert.created_at.replace(' ', 'T')),
            { addSuffix: true },
          );

          return (
            <Link
              key={alert.id}
              to="/alerts"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <div className={`p-1.5 rounded-lg ${config.badge}`}>
                <SeverityIcon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {alert.title}
                </p>
                <p className="text-xs text-gray-500 truncate">{alert.message}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-gray-400">{timeAgo}</span>
                <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
