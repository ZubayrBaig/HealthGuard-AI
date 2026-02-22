import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { HeartPulse } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import api from './utils/api';
import { ToastProvider } from './context/ToastContext';
import { NotificationProvider } from './context/NotificationContext';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import DemoLanding from './components/DemoLanding';
import Login from './pages/Login';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Vitals from './pages/Vitals';
import Chat from './pages/Chat';
import Alerts from './pages/Alerts';
import Profile from './pages/Profile';
import Devices from './pages/Devices';

export default function App() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <HeartPulse className="h-10 w-10 text-blue-500 animate-pulse" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppContent />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function AppContent() {
  const { isDemoMode, patient, patientLoading } = useAuth();
  const [hasPatient, setHasPatient] = useState(null); // null = loading

  // In demo mode, check if a patient exists (for DemoLanding)
  useEffect(() => {
    if (!isDemoMode) return;

    async function checkPatient() {
      try {
        const { data } = await api.get('/api/patients');
        setHasPatient(data.length > 0);
      } catch {
        setHasPatient(false);
      }
    }
    checkPatient();
  }, [isDemoMode]);

  // Demo mode: loading
  if (isDemoMode && hasPatient === null) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <HeartPulse className="h-10 w-10 text-blue-500 animate-pulse" />
      </div>
    );
  }

  // Demo mode: no patient yet — show DemoLanding
  if (isDemoMode && !hasPatient) {
    return <DemoLanding onStart={() => setHasPatient(true)} />;
  }

  // Auth mode: wait for patient linking
  if (!isDemoMode && patientLoading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <HeartPulse className="h-10 w-10 text-blue-500 animate-pulse" />
      </div>
    );
  }

  return (
    <ToastProvider>
      <NotificationProvider patient={patient}>
        <ErrorBoundary>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/vitals" element={<Vitals />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/devices" element={<Devices />} />
              <Route path="/profile" element={<Profile />} />
            </Route>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ErrorBoundary>
      </NotificationProvider>
    </ToastProvider>
  );
}
