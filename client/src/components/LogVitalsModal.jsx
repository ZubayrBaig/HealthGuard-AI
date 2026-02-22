import { useState, useEffect } from 'react';
import { X, Check, Loader2, Watch, Activity, HeartPulse, CircleDot, Droplets, Mountain, Info } from 'lucide-react';
import api from '../utils/api';

const DEVICE_ICON_MAP = {
  watch: Watch,
  activity: Activity,
  'heart-pulse': HeartPulse,
  'circle-dot': CircleDot,
  droplets: Droplets,
  mountain: Mountain,
};

const FIELDS = [
  { key: 'heart_rate', label: 'Heart Rate (BPM)', min: 30, max: 220, step: 1, placeholder: 'e.g. 72' },
  { key: 'blood_pressure_systolic', label: 'Systolic (mmHg)', min: 60, max: 250, step: 1, placeholder: 'e.g. 120' },
  { key: 'blood_pressure_diastolic', label: 'Diastolic (mmHg)', min: 30, max: 150, step: 1, placeholder: 'e.g. 80' },
  { key: 'glucose', label: 'Blood Glucose (mg/dL)', min: 20, max: 500, step: 0.1, placeholder: 'e.g. 110' },
  { key: 'oxygen_saturation', label: 'SpO2 (%)', min: 50, max: 100, step: 0.1, placeholder: 'e.g. 98' },
  { key: 'temperature', label: 'Temperature (°F)', min: 90, max: 110, step: 0.1, placeholder: 'e.g. 98.6' },
  { key: 'sleep_hours', label: 'Sleep (hours)', min: 0, max: 24, step: 0.1, placeholder: 'e.g. 7.5' },
  { key: 'steps', label: 'Steps', min: 0, max: 100000, step: 1, placeholder: 'e.g. 8000' },
];

const INITIAL_VALUES = Object.fromEntries(FIELDS.map((f) => [f.key, '']));

export default function LogVitalsModal({ isOpen, onClose, patientId, onSuccess }) {
  const [values, setValues] = useState(INITIAL_VALUES);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [activeDevices, setActiveDevices] = useState([]);

  useEffect(() => {
    if (!isOpen || !patientId) return;
    Promise.all([
      api.get(`/api/devices/${patientId}`),
      api.get('/api/devices/supported'),
    ])
      .then(([devRes, supRes]) => {
        const connected = devRes.data
          .filter((d) => d.status === 'connected' || d.status === 'syncing')
          .map((d) => ({ ...d, config: supRes.data[d.device_type] }));
        setActiveDevices(connected);
      })
      .catch(() => {});
  }, [isOpen, patientId]);

  if (!isOpen) return null;

  const handleChange = (key, val) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Build payload — only include fields with values
    const payload = {};
    for (const field of FIELDS) {
      const raw = values[field.key];
      if (raw !== '' && raw != null) {
        payload[field.key] = Number(raw);
      }
    }

    if (Object.keys(payload).length === 0) {
      setError('Please fill in at least one vital sign.');
      return;
    }

    payload.source = 'manual';

    try {
      setSubmitting(true);
      setError(null);
      await api.post(`/api/vitals/${patientId}`, payload);
      setSuccess(true);
      setTimeout(() => {
        setValues(INITIAL_VALUES);
        setSuccess(false);
        onSuccess();
        onClose();
      }, 800);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save vitals.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Log Vitals</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {activeDevices.length > 0 && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-50 border border-blue-100">
              <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-blue-700">
                  Connected devices sync automatically. Manual entry is for readings from non-connected devices.
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  {activeDevices.map((d) => {
                    const DevIcon = DEVICE_ICON_MAP[d.config?.icon] || Watch;
                    return (
                      <span key={d.id} className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600">
                        <DevIcon className="h-3 w-3" style={{ color: d.config?.color }} />
                        {d.device_name}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <p className="text-sm text-gray-500">
            Enter any vitals you want to log. All fields are optional.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map((field) => (
              <div key={field.key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {field.label}
                </label>
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  placeholder={field.placeholder}
                  value={values[field.key]}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder:text-gray-400"
                />
              </div>
            ))}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || success}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                success
                  ? 'bg-green-500'
                  : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-60'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : success ? (
                <>
                  <Check className="h-4 w-4" />
                  Saved!
                </>
              ) : (
                'Save Vitals'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
