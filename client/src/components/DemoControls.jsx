import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Play, Square, ChevronUp, ChevronDown, Zap, Heart, Droplets, Activity } from 'lucide-react';

const SCENARIOS = [
  {
    key: 'glucose-spike',
    label: 'Glucose Spike',
    icon: Droplets,
    color: 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30',
    activeColor: 'bg-amber-500 text-white',
    description: 'Glucose rises 160→280',
  },
  {
    key: 'bp-crisis',
    label: 'BP Crisis',
    icon: Activity,
    color: 'bg-red-500/20 text-red-300 hover:bg-red-500/30',
    activeColor: 'bg-red-500 text-white',
    description: 'BP climbs to 185/120',
  },
  {
    key: 'cardiac-warning',
    label: 'Cardiac Warning',
    icon: Heart,
    color: 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30',
    activeColor: 'bg-purple-500 text-white',
    description: 'HR alternates 55↔120',
  },
  {
    key: 'normal',
    label: 'Return to Normal',
    icon: Zap,
    color: 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30',
    activeColor: 'bg-emerald-500 text-white',
    description: 'All vitals normalize',
  },
];

export default function DemoControls() {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState({ running: false, activeScenario: null, scenarioStep: 0 });
  const [loading, setLoading] = useState(null); // tracks which action is loading

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/demo/status');
      setStatus(data);
    } catch {
      // Silent fail
    }
  }, []);

  // Poll status while expanded
  useEffect(() => {
    if (!expanded) return;
    fetchStatus();
    const id = setInterval(fetchStatus, 3000);
    return () => clearInterval(id);
  }, [expanded, fetchStatus]);

  async function handleStart() {
    setLoading('start');
    try {
      await axios.post('/api/demo/start');
      await fetchStatus();
    } catch {
      // Silent fail
    } finally {
      setLoading(null);
    }
  }

  async function handleStop() {
    setLoading('stop');
    try {
      await axios.post('/api/demo/stop');
      await fetchStatus();
    } catch {
      // Silent fail
    } finally {
      setLoading(null);
    }
  }

  async function handleScenario(key) {
    setLoading(key);
    try {
      await axios.post(`/api/demo/scenario/${key}`);
      await fetchStatus();
    } catch {
      // Silent fail
    } finally {
      setLoading(null);
    }
  }

  // Collapsed pill
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 px-3 py-2 bg-gray-900/90 backdrop-blur-sm text-gray-300 text-xs font-medium rounded-full shadow-lg hover:bg-gray-800/90 transition-colors"
      >
        <Play className="h-3 w-3" />
        Demo
        {status.running && (
          <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-64 bg-gray-900/95 backdrop-blur-sm text-white rounded-xl shadow-2xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Play className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-semibold">Demo Controls</span>
        </div>
        <button
          onClick={() => setExpanded(false)}
          className="p-1 text-gray-400 hover:text-white rounded transition-colors"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* Start / Stop */}
        <div className="flex gap-2">
          <button
            onClick={handleStart}
            disabled={status.running || loading === 'start'}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="h-3.5 w-3.5" />
            {loading === 'start' ? 'Starting...' : 'Start'}
          </button>
          <button
            onClick={handleStop}
            disabled={!status.running || loading === 'stop'}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Square className="h-3.5 w-3.5" />
            {loading === 'stop' ? 'Stopping...' : 'Stop'}
          </button>
        </div>

        {/* Scenarios */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">
            Scenarios
          </p>
          <div className="space-y-1.5">
            {SCENARIOS.map(({ key, label, icon: Icon, color, activeColor, description }) => {
              const isActive = status.activeScenario === key;
              return (
                <button
                  key={key}
                  onClick={() => handleScenario(key)}
                  disabled={!status.running || loading === key}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    isActive ? activeColor : color
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                  <div className="flex-1 text-left">
                    <div>{loading === key ? `${label}...` : label}</div>
                    <div className={`text-[10px] ${isActive ? 'text-white/70' : 'text-gray-500'}`}>
                      {description}
                    </div>
                  </div>
                  {isActive && (
                    <span className="h-2 w-2 rounded-full bg-white animate-pulse flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between text-[10px] text-gray-500 pt-1 border-t border-white/5">
          <span className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${status.running ? 'bg-green-400' : 'bg-gray-600'}`} />
            {status.running ? 'Running' : 'Idle'}
          </span>
          {status.activeScenario && (
            <span>
              Step {status.scenarioStep + 1}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
