import { useState, useEffect, useCallback } from 'react';
import { io as socketIO } from 'socket.io-client';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import {
  HeartPulse,
  Activity,
  Heart,
  MessageCircle,
  Bell,
  Smartphone,
  User,
  Menu,
  X,
  LogOut,
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import PageTransition from './PageTransition';
import DemoMode from './DemoMode';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: Activity },
  { to: '/vitals', label: 'Vitals', icon: Heart },
  { to: '/chat', label: 'AI Assistant', icon: MessageCircle },
  { to: '/alerts', label: 'Alerts', icon: Bell, useBadge: true },
  { to: '/devices', label: 'Devices', icon: Smartphone, useDeviceBadge: true },
  { to: '/profile', label: 'Profile', icon: User },
];

export default function Layout() {
  const { unreadCount, hasCritical, patientName, patientId } = useNotification();
  const { user, isDemoMode, logout, exitDemoMode } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deviceCount, setDeviceCount] = useState(0);
  const location = useLocation();

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Fetch connected device count
  const fetchDeviceCount = useCallback(() => {
    if (!patientId) return;
    api.get(`/api/devices/${patientId}`)
      .then((r) => {
        setDeviceCount(r.data.filter((d) => d.status === 'connected' || d.status === 'syncing').length);
      })
      .catch(() => {});
  }, [patientId]);

  useEffect(() => { fetchDeviceCount(); }, [fetchDeviceCount]);

  useEffect(() => {
    if (!patientId) return;
    const socket = socketIO({ path: '/socket.io' });
    socket.on('device-status-change', (data) => {
      if (data.patientId === patientId) fetchDeviceCount();
    });
    return () => socket.disconnect();
  }, [patientId, fetchDeviceCount]);

  return (
  <>
    <div className={`flex overflow-hidden ${isDemoMode ? 'h-[calc(100vh-3rem)]' : 'h-screen'}`}>
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0f172a] text-white flex flex-col transform transition-transform duration-300 lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }${isDemoMode ? ' pb-4' : ''}`}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <HeartPulse className="h-8 w-8 text-[#3b82f6]" />
            <span className="text-xl font-bold tracking-tight">HealthGuard AI</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 text-gray-400 hover:text-white rounded"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ to, label, icon: Icon, useBadge, useDeviceBadge }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[#3b82f6] text-white'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {useBadge && unreadCount > 0 && (
                <span
                  className={`ml-auto inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-xs font-semibold text-white ${
                    hasCritical ? 'animate-pulse' : ''
                  }`}
                >
                  {unreadCount}
                </span>
              )}
              {useDeviceBadge && deviceCount > 0 && (
                <span className="ml-auto inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-green-500 text-xs font-semibold text-white">
                  {deviceCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="px-3 py-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-3 mb-3">
            {user?.picture ? (
              <img
                src={user.picture}
                alt={user.name}
                className="h-8 w-8 rounded-full"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-semibold text-white">
                {isDemoMode ? 'D' : (user?.name?.[0] || '?')}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {isDemoMode ? 'Demo User' : (user?.name || 'User')}
              </p>
              {user?.email && (
                <p className="text-xs text-gray-400 truncate">{user.email}</p>
              )}
            </div>
          </div>
            {isDemoMode ? (
            <button
              onClick={() => { exitDemoMode(); }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <LogOut className="h-5 w-5 flex-shrink-0" />
              Exit Demo
            </button>
          ) : (
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <LogOut className="h-5 w-5 flex-shrink-0" />
              Sign Out
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 flex-shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold text-gray-900">{patientName || 'Patient'}</h2>
          </div>
          <Link
            to="/alerts"
            className="relative p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span
                className={`absolute top-1 right-1 h-4 min-w-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ${
                  hasCritical ? 'animate-pulse' : ''
                }`}
              >
                {unreadCount}
              </span>
            )}
          </Link>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-[#f8fafc] p-4 sm:p-6">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </main>
      </div>
    </div>
    {isDemoMode && <DemoMode />}
  </>
  );
}
