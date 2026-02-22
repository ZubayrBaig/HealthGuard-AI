import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const TOAST_CONFIG = {
  success: { icon: CheckCircle, bg: 'bg-green-50', border: 'border-l-green-500', iconColor: 'text-green-600' },
  error:   { icon: AlertTriangle, bg: 'bg-red-50', border: 'border-l-red-500', iconColor: 'text-red-600' },
  info:    { icon: Info, bg: 'bg-blue-50', border: 'border-l-blue-500', iconColor: 'text-blue-600' },
};

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback((type, message) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    setToasts((prev) => [{ id, type, message }, ...prev].slice(0, MAX_TOASTS));

    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timersRef.current.delete(id);
    }, AUTO_DISMISS_MS);
    timersRef.current.set(id, timer);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-2 w-80">
          {toasts.map((toast) => {
            const config = TOAST_CONFIG[toast.type] || TOAST_CONFIG.info;
            const Icon = config.icon;
            return (
              <div
                key={toast.id}
                className={`animate-toast-in ${config.bg} border border-gray-200 border-l-4 ${config.border} rounded-lg shadow-lg p-3 flex items-start gap-3`}
              >
                <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${config.iconColor}`} />
                <p className="flex-1 text-sm text-gray-800">{toast.message}</p>
                <button
                  onClick={() => dismiss(toast.id)}
                  className="flex-shrink-0 p-0.5 text-gray-400 hover:text-gray-600 rounded"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
