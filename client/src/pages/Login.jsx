import { HeartPulse, LogIn, Play, Shield, Activity, MessageCircle } from 'lucide-react';
import { useAuth, isAuthEnabled } from '../context/AuthContext';
import { Navigate, useNavigate } from 'react-router-dom';

export default function Login() {
  const { isAuthenticated, loginWithRedirect, enterDemoMode } = useAuth();
  const navigate = useNavigate();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  function handleTryDemo() {
    enterDemoMode();
    navigate('/dashboard');
  }

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6">
      <div className="max-w-lg text-center">
        {/* Brand */}
        <div className="inline-flex items-center gap-3 mb-8">
          <HeartPulse className="h-12 w-12 text-blue-500" />
          <span className="text-3xl font-bold text-white tracking-tight">
            HealthGuard AI
          </span>
        </div>

        <h1 className="text-2xl font-semibold text-white mb-3">
          Your AI-Powered Preventive Health Partner
        </h1>
        <p className="text-gray-400 mb-8">
          Track vitals, receive intelligent alerts, and chat with an AI health
          assistant — all in one place.
        </p>

        {/* Feature highlights */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="text-center">
            <Activity className="h-6 w-6 text-blue-400 mx-auto mb-2" />
            <p className="text-xs text-gray-400">Track Vitals</p>
          </div>
          <div className="text-center">
            <Shield className="h-6 w-6 text-blue-400 mx-auto mb-2" />
            <p className="text-xs text-gray-400">AI Risk Analysis</p>
          </div>
          <div className="text-center">
            <MessageCircle className="h-6 w-6 text-blue-400 mx-auto mb-2" />
            <p className="text-xs text-gray-400">Smart Alerts</p>
          </div>
        </div>

        {/* Buttons */}
        <div className="space-y-3">
          {isAuthEnabled && (
            <button
              onClick={() => loginWithRedirect()}
              className="w-full inline-flex items-center justify-center gap-2 px-8 py-3 text-base font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors"
            >
              <LogIn className="h-5 w-5" />
              Sign In
            </button>
          )}

          <button
            onClick={handleTryDemo}
            className={`w-full inline-flex items-center justify-center gap-2 px-8 py-3 text-base font-semibold rounded-xl transition-colors ${
              isAuthEnabled
                ? 'text-gray-300 bg-white/10 hover:bg-white/20'
                : 'text-white bg-blue-600 hover:bg-blue-700'
            }`}
          >
            <Play className="h-5 w-5" />
            Try Demo
          </button>
        </div>
      </div>
    </div>
  );
}
