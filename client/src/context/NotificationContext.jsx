import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { io as socketIO } from 'socket.io-client';
import api from '../utils/api';
import NotificationToast from '../components/NotificationToast';

const NotificationContext = createContext(null);

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 5000;

export function NotificationProvider({ children, patient: linkedPatient }) {
  const [patientId, setPatientId] = useState(linkedPatient?.id || null);
  const [patientName, setPatientName] = useState(linkedPatient?.name || null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasCritical, setHasCritical] = useState(false);
  const [toasts, setToasts] = useState([]);
  const socketRef = useRef(null);
  const timersRef = useRef(new Map());

  // Update from linked patient prop (auth mode)
  useEffect(() => {
    if (linkedPatient) {
      setPatientId(linkedPatient.id);
      setPatientName(linkedPatient.name);
    }
  }, [linkedPatient]);

  // Fallback: fetch patient from API (demo mode)
  useEffect(() => {
    if (linkedPatient) return;
    async function init() {
      try {
        const { data: patients } = await api.get('/api/patients');
        if (patients.length) {
          setPatientId(patients[0].id);
          setPatientName(patients[0].name);
        }
      } catch {
        // Silently fail — sidebar will show 0
      }
    }
    init();
  }, [linkedPatient]);

  // Fetch unread count + critical flag
  const refreshUnread = useCallback(async () => {
    if (!patientId) return;
    try {
      const [countRes, criticalRes] = await Promise.all([
        api.get(`/api/alerts/${patientId}/unread-count`),
        api.get(`/api/alerts/${patientId}?type=critical&acknowledged=false&limit=1`),
      ]);
      setUnreadCount(countRes.data.count);
      setHasCritical(criticalRes.data.alerts.length > 0);
    } catch {
      // Keep existing values on failure
    }
  }, [patientId]);

  useEffect(() => {
    if (patientId) refreshUnread();
  }, [patientId, refreshUnread]);

  // Socket.io connection
  useEffect(() => {
    const socket = socketIO({ path: '/socket.io' });
    socketRef.current = socket;

    socket.on('new-alert', ({ alert }) => {
      if (!alert) return;

      // Add toast
      const toastId = alert.id || Date.now().toString();
      setToasts((prev) => {
        const next = [{ id: toastId, alert, timestamp: Date.now() }, ...prev];
        return next.slice(0, MAX_TOASTS);
      });

      // Increment unread
      setUnreadCount((c) => c + 1);
      if (alert.type === 'critical') setHasCritical(true);

      // Auto-dismiss non-critical toasts
      if (alert.type !== 'critical') {
        const timer = setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== toastId));
          timersRef.current.delete(toastId);
        }, AUTO_DISMISS_MS);
        timersRef.current.set(toastId, timer);
      }
    });

    return () => {
      socket.disconnect();
      // Clear all auto-dismiss timers
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
    };
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const acknowledgeAlert = useCallback(async (alertId) => {
    const { data } = await api.patch(`/api/alerts/${alertId}/acknowledge`);
    setUnreadCount((c) => Math.max(0, c - 1));
    // Re-check critical status
    if (patientId) {
      try {
        const res = await api.get(
          `/api/alerts/${patientId}?type=critical&acknowledged=false&limit=1`,
        );
        setHasCritical(res.data.alerts.length > 0);
      } catch {
        // Keep existing value
      }
    }
    return data;
  }, [patientId]);

  return (
    <NotificationContext.Provider
      value={{ unreadCount, hasCritical, toasts, dismissToast, acknowledgeAlert, refreshUnread, patientId, patientName }}
    >
      {children}
      <NotificationToast toasts={toasts} onDismiss={dismissToast} />
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider');
  return ctx;
}
