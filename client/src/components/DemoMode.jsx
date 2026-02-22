import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../utils/api';
import { ChevronRight, ChevronLeft, X, Play, Check, Loader2 } from 'lucide-react';

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
    label: 'Glucose Spike',
    narrator: 'A dangerous glucose reading of 245 mg/dL just arrived...',
    page: '/dashboard',
    target: '[data-demo="stat-cards"]',
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
    narrator: 'Ask the AI about the glucose spike — click Send when ready',
    page: '/chat',
    target: null,
  },
];

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

  const navigate = useNavigate();
  const location = useLocation();
  const advancingRef = useRef(false);

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
    if (!executedSteps.has(stepIndex)) {
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
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('demo-prefill-chat', {
            detail: 'My glucose just spiked to 245. What should I do?',
          }),
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
