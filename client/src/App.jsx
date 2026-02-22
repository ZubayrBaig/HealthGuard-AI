import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import { HeartPulse } from 'lucide-react';
import { ToastProvider } from './context/ToastContext';
import { NotificationProvider } from './context/NotificationContext';
import ErrorBoundary from './components/ErrorBoundary';
import DemoLanding from './components/DemoLanding';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Vitals from './pages/Vitals';
import Chat from './pages/Chat';
import Alerts from './pages/Alerts';
import Profile from './pages/Profile';

export default function App() {
  const [hasPatient, setHasPatient] = useState(null); // null = loading

  useEffect(() => {
    async function checkPatient() {
      try {
        const { data } = await axios.get('/api/patients');
        setHasPatient(data.length > 0);
      } catch {
        setHasPatient(false);
      }
    }
    checkPatient();
  }, []);

  // Loading check
  if (hasPatient === null) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <HeartPulse className="h-10 w-10 text-blue-500 animate-pulse" />
      </div>
    );
  }

  // No patient — show demo landing
  if (!hasPatient) {
    return <DemoLanding onStart={() => setHasPatient(true)} />;
  }

  return (
    <ToastProvider>
      <NotificationProvider>
        <ErrorBoundary>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/vitals" element={<Vitals />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/alerts" element={<Alerts />} />
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
