import { useState } from 'react';
import { HeartPulse, Play, Loader2, Shield, Activity, MessageCircle } from 'lucide-react';
import api from '../utils/api';

export default function DemoLanding({ onStart }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleStartDemo() {
    try {
      setLoading(true);
      setError(null);
      await api.post('/api/demo/seed');
      onStart();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to set up demo');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6">
      <div className="max-w-lg text-center">
        {/* Brand */}
        <div className="inline-flex items-center gap-3 mb-8">
          <HeartPulse className="h-12 w-12 text-blue-500" />
          <span className="text-3xl font-bold text-white tracking-tight">HealthGuard AI</span>
        </div>

        <h1 className="text-2xl font-semibold text-white mb-3">
          AI-Powered Health Monitoring
        </h1>
        <p className="text-gray-400 mb-8">
          Track vitals, receive intelligent alerts, and chat with an AI health assistant.
          Start the demo to explore with sample patient data.
        </p>

        {/* Feature highlights */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="text-center">
            <Activity className="h-6 w-6 text-blue-400 mx-auto mb-2" />
            <p className="text-xs text-gray-400">Real-time Vitals</p>
          </div>
          <div className="text-center">
            <Shield className="h-6 w-6 text-blue-400 mx-auto mb-2" />
            <p className="text-xs text-gray-400">Smart Alerts</p>
          </div>
          <div className="text-center">
            <MessageCircle className="h-6 w-6 text-blue-400 mx-auto mb-2" />
            <p className="text-xs text-gray-400">AI Assistant</p>
          </div>
        </div>

        {/* Start button */}
        <button
          onClick={handleStartDemo}
          disabled={loading}
          className="inline-flex items-center gap-2 px-8 py-3 text-base font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Play className="h-5 w-5" />
          )}
          {loading ? 'Setting up...' : 'Start Demo'}
        </button>

        {error && (
          <p className="text-sm text-red-400 mt-4">{error}</p>
        )}
      </div>
    </div>
  );
}
