import { useNavigate } from 'react-router-dom';
import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertTriangle,
    border: 'border-l-red-500',
    bg: 'bg-red-50',
    iconColor: 'text-red-600',
  },
  warning: {
    icon: AlertCircle,
    border: 'border-l-amber-500',
    bg: 'bg-amber-50',
    iconColor: 'text-amber-600',
  },
  info: {
    icon: Info,
    border: 'border-l-blue-500',
    bg: 'bg-blue-50',
    iconColor: 'text-blue-600',
  },
};

export default function NotificationToast({ toasts, onDismiss }) {
  const navigate = useNavigate();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 w-80">
      {toasts.map((toast) => {
        const config = SEVERITY_CONFIG[toast.alert.type] || SEVERITY_CONFIG.info;
        const Icon = config.icon;

        return (
          <div
            key={toast.id}
            className={`animate-toast-in ${config.bg} border border-gray-200 border-l-4 ${config.border} rounded-lg shadow-lg overflow-hidden cursor-pointer transition-all duration-300`}
            onClick={() => {
              onDismiss(toast.id);
              navigate('/alerts');
            }}
          >
            <div className="flex items-start gap-3 p-3">
              <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${config.iconColor}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {toast.alert.title}
                </p>
                <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">
                  {toast.alert.ai_message || toast.alert.message}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(toast.id);
                }}
                className="flex-shrink-0 p-0.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
