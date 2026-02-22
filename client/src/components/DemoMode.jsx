import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../utils/api';
import { ChevronRight, ChevronLeft, X, Play, Check, Loader2, Droplets, Activity, Heart, Wind, Thermometer } from 'lucide-react';

// ---------------------------------------------------------------------------
// Story beats
// ---------------------------------------------------------------------------

const STEPS = [
  {
    label: 'Meet Sarah',
    narrator: 'Meet Sarah Johnson — 54 years old, managing Type 2 Diabetes and Hypertension',
    page: '/dashboard',
    target: null,
  },
  {
    label: 'Connect Devices',
    narrator: 'Pairing Apple Watch and Dexcom G7 — watch the devices connect in real-time',
    page: '/devices',
    target: null,
  },
  {
    label: 'Morning Check-in',
    narrator: 'Normal morning vitals are streaming in — watch the stat cards update',
    page: '/dashboard',
    target: '[data-demo="stat-cards"]',
  },
  {
    label: 'Trigger Spike',
    narrator: 'Choose a vital to spike — pick one to trigger an alert',
    page: '/dashboard',
    target: '[data-demo="stat-cards"]',
    spikeStep: true,
  },
  {
    label: 'Smart Alert Fires',
    narrator: 'Notice the alert notification in the top right \u2197',
    page: null,
    target: null,
  },
  {
    label: 'AI Analyzes Risk',
    narrator: 'The AI is analyzing the new health data — watch the risk gauge',
    page: '/dashboard',
    target: '[data-demo="risk-gauge"]',
  },
  {
    label: 'Ask the Assistant',
    narrator: 'Ask the AI about the spike — click Send when ready',
    page: '/chat',
    target: null,
  },
];

const SPIKE_OPTIONS = [
  { key: 'glucose', label: 'Glucose', icon: Droplets, color: 'text-orange-400' },
  { key: 'blood_pressure', label: 'BP', icon: Activity, color: 'text-purple-400' },
  { key: 'heart_rate', label: 'Heart Rate', icon: Heart, color: 'text-red-400' },
  { key: 'oxygen', label: 'SpO2', icon: Wind, color: 'text-blue-400' },
  { key: 'temperature', label: 'Temp', icon: Thermometer, color: 'text-amber-400' },
];

const SPIKE_CHAT_PREFILLS = {
  glucose: 'My glucose just spiked to 245. What should I do?',
  blood_pressure: 'My blood pressure just spiked to 175/108. What should I do?',
  heart_rate: 'My heart rate just spiked to 155 BPM. What should I do?',
  oxygen: 'My oxygen saturation just dropped to 89%. What should I do?',
  temperature: 'My temperature just spiked to 103.5\u00b0F. What should I do?',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pulseElement(selector) {
  if (!selector) return;
  setTimeout(() => {
    const el = document.querySelector(selector);
    if (el) {
      el.classList.add('demo-pulse');
      setTimeout(() => el.classList.remove('demo-pulse'), 1600);
    }
  }, 300);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DemoMode() {
  const [active, setActive] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [executedSteps] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [patientId, setPatientId] = useState(null);
  const [started, setStarted] = useState(false);
  const [chosenSpike, setChosenSpike] = useState(null);

  const navigate = useNavigate();
  const location = useLocation();
  const advancingRef = useRef(false);
  const chosenSpikeRef = useRef(null);

  // Fetch patient ID
  useEffect(() => {
    async function fetchPatient() {
      try {
        const { data: patients } = await api.get('/api/patients');
        if (patients.length) setPatientId(patients[0].id);
      } catch {
        // Silent
      }
    }
    fetchPatient();
  }, []);

  // Execute a step's actions
  const executeStep = useCallback(async (stepIndex) => {
    const step = STEPS[stepIndex];
    if (!step) return;

    setLoading(true);

    // Navigate if needed
    if (step.page && location.pathname !== step.page) {
      navigate(step.page);
    }

    // Fire backend action if not already executed
    // For spike steps, the POST happens when user picks a spike type
    if (!executedSteps.has(stepIndex) && !step.spikeStep) {
      try {
        await api.post(`/api/demo/step/${stepIndex + 1}`);
        executedSteps.add(stepIndex);
      } catch {
        // Continue even if backend fails
      }
    }

    // Special handling per step
    if (stepIndex === 5 && patientId) {
      // Step 6: trigger risk refresh on dashboard
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('demo-refresh-risk'));
      }, 500);
    }

    if (stepIndex === 6) {
      // Step 7: prefill chat input after navigation settles and component mounts
      const msg = SPIKE_CHAT_PREFILLS[chosenSpikeRef.current] || SPIKE_CHAT_PREFILLS.glucose;
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('demo-prefill-chat', { detail: msg }),
        );
      }, 1200);
    }

    // Pulse target element
    pulseElement(step.target);

    setLoading(false);
  }, [executedSteps, location.pathname, navigate, patientId]);

  // Advance to next step
  const advanceStep = useCallback(async () => {
    if (advancingRef.current || loading) return;
    advancingRef.current = true;

    if (!started) {
      // First click starts the demo at step 0
      setStarted(true);
      await executeStep(0);
      advancingRef.current = false;
      return;
    }

    if (currentStep < STEPS.length - 1) {
      const next = currentStep + 1;
      setCurrentStep(next);
      await executeStep(next);
    }

    advancingRef.current = false;
  }, [currentStep, loading, started, executeStep]);

  // Handle spike choice at Step 4
  const handleSpikeChoice = useCallback(async (spikeKey) => {
    setChosenSpike(spikeKey);
    chosenSpikeRef.current = spikeKey;
    setLoading(true);
    try {
      await api.post('/api/demo/step/4', { spike_type: spikeKey });
      executedSteps.add(3);
    } catch {
      // Continue even if backend fails
    }
    setLoading(false);
    // Auto-advance to next step after a short delay
    setTimeout(() => {
      const next = 4; // Step 5 — Smart Alert
      setCurrentStep(next);
      executeStep(next);
    }, 800);
  }, [executedSteps, executeStep]);

  // Go back (UI only, no backend undo)
  const goBack = useCallback(() => {
    if (currentStep > 0) {
      const prev = currentStep - 1;
      setCurrentStep(prev);
      const step = STEPS[prev];
      if (step.page && location.pathname !== step.page) {
        navigate(step.page);
      }
      pulseElement(step.target);
    }
  }, [currentStep, location.pathname, navigate]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!active) return;

    function handleKeyDown(e) {
      // Don't capture when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        advanceStep();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goBack();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setActive(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, advanceStep, goBack]);

  // Collapsed pill
  if (!active) {
    return (
      <button
        onClick={() => setActive(true)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-[#1e293b] text-gray-300 text-xs font-medium rounded-full shadow-lg hover:bg-[#334155] transition-colors"
      >
        <Play className="h-3 w-3" />
        Guided Demo
      </button>
    );
  }

  const step = STEPS[currentStep];
  const isLastStep = currentStep === STEPS.length - 1 && started;
  const isFirstStep = currentStep === 0;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 h-12 bg-[#1e293b] border-t border-white/10 flex items-center px-4 gap-4 shadow-2xl">
      {/* Progress dots */}
      <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
        {STEPS.map((s, i) => {
          const completed = started && i < currentStep;
          const current = started && i === currentStep;
          return (
            <div key={i} className="flex items-center">
              <div
                className={`h-2.5 w-2.5 rounded-full transition-all duration-300 ${
                  completed
                    ? 'bg-blue-400'
                    : current
                      ? 'bg-white ring-2 ring-blue-400/50'
                      : 'bg-white/20'
                }`}
                title={s.label}
              />
              {i < STEPS.length - 1 && (
                <div className={`w-3 h-px mx-0.5 ${completed ? 'bg-blue-400/60' : 'bg-white/10'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step label + narrator */}
      <div className="flex-1 min-w-0">
        {!started ? (
          <p className="text-sm text-gray-300 truncate">
            <span className="text-white font-medium">Guided Demo</span>
            <span className="text-gray-500 mx-2">\u00b7</span>
            Press Next Step to begin the story
          </p>
        ) : (
          <p className="text-sm text-gray-300 truncate">
            <span className="text-white font-medium">
              {currentStep + 1}. {step.label}
            </span>
            <span className="text-gray-500 mx-2">\u00b7</span>
            {step.narrator}
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {started && step.spikeStep && !executedSteps.has(currentStep) ? (
          /* Spike picker pills */
          <div className="flex items-center gap-1.5">
            {SPIKE_OPTIONS.map(({ key, label, icon: SIcon, color }) => (
              <button
                key={key}
                onClick={() => handleSpikeChoice(key)}
                disabled={loading}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-white/10 text-gray-200 hover:bg-white/20 hover:text-white transition-colors disabled:opacity-40"
              >
                <SIcon className={`h-3.5 w-3.5 ${color}`} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            {/* Back */}
            {started && (
              <button
                onClick={goBack}
                disabled={isFirstStep || loading}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-400 hover:text-white rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Back</span>
              </button>
            )}

            {/* Next Step */}
            <button
              onClick={advanceStep}
              disabled={loading || (started && isLastStep)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : started && isLastStep ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Done</span>
                </>
              ) : (
                <>
                  <span>{started ? 'Next Step' : 'Start Demo'}</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </>
        )}

        {/* Exit */}
        <button
          onClick={() => setActive(false)}
          className="p-1 text-gray-500 hover:text-white rounded transition-colors"
          title="Exit Demo (Esc)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
