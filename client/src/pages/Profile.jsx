import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { differenceInYears, parseISO } from 'date-fns';
import {
  User, Stethoscope, Pill, Phone, Bell, SlidersHorizontal,
  Save, Loader2, Plus, X, Check,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VITAL_CONFIGS = [
  { key: 'heart_rate', label: 'Heart Rate', unit: 'BPM', defaultMin: 60, defaultMax: 100 },
  { key: 'blood_pressure_systolic', label: 'Systolic BP', unit: 'mmHg', defaultMin: null, defaultMax: 120 },
  { key: 'blood_pressure_diastolic', label: 'Diastolic BP', unit: 'mmHg', defaultMin: null, defaultMax: 80 },
  { key: 'glucose', label: 'Blood Glucose', unit: 'mg/dL', defaultMin: 70, defaultMax: 140 },
  { key: 'oxygen_saturation', label: 'SpO2', unit: '%', defaultMin: 95, defaultMax: null },
  { key: 'temperature', label: 'Temperature', unit: '°F', defaultMin: 97.0, defaultMax: 99.5 },
];

const ALERT_TYPES = [
  { key: 'critical', label: 'Critical alerts', desc: 'Life-threatening vital readings', color: 'red' },
  { key: 'warning', label: 'Warning alerts', desc: 'Vitals outside normal range', color: 'amber' },
  { key: 'info', label: 'Info alerts', desc: 'General health notifications', color: 'blue' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionCard({ icon: Icon, title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100">
        <Icon className="h-4.5 w-4.5 text-gray-500" />
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-blue-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Profile() {
  const [patientId, setPatientId] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(''); // 'saved' | 'error' | ''
  const [newCondition, setNewCondition] = useState('');
  const [newMedication, setNewMedication] = useState('');

  // Fetch patient
  const fetchPatient = useCallback(async () => {
    try {
      setLoading(true);
      const { data: patients } = await api.get('/api/patients');
      if (!patients.length) return;
      const id = patients[0].id;
      setPatientId(id);
      const { data } = await api.get(`/api/patients/${id}`);
      setForm({
        name: data.name || '',
        date_of_birth: data.date_of_birth || '',
        conditions: data.conditions || [],
        medications: data.medications || [],
        emergency_contact_name: data.emergency_contact_name || '',
        emergency_contact_phone: data.emergency_contact_phone || '',
        alert_preferences: data.alert_preferences || { critical: true, warning: true, info: true },
        normal_ranges: data.normal_ranges || {},
      });
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPatient(); }, [fetchPatient]);

  // Auto-clear save status
  useEffect(() => {
    if (!saveStatus) return;
    const t = setTimeout(() => setSaveStatus(''), 3000);
    return () => clearTimeout(t);
  }, [saveStatus]);

  // Save handler
  async function handleSave() {
    if (!patientId || !form) return;
    setSaving(true);
    setSaveStatus('');
    try {
      const { data } = await api.put(`/api/patients/${patientId}`, form);
      setForm({
        name: data.name || '',
        date_of_birth: data.date_of_birth || '',
        conditions: data.conditions || [],
        medications: data.medications || [],
        emergency_contact_name: data.emergency_contact_name || '',
        emergency_contact_phone: data.emergency_contact_phone || '',
        alert_preferences: data.alert_preferences || { critical: true, warning: true, info: true },
        normal_ranges: data.normal_ranges || {},
      });
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }

  // Form updaters
  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function addCondition() {
    const val = newCondition.trim();
    if (!val || form.conditions.includes(val)) return;
    updateField('conditions', [...form.conditions, val]);
    setNewCondition('');
  }

  function removeCondition(idx) {
    updateField('conditions', form.conditions.filter((_, i) => i !== idx));
  }

  function addMedication() {
    const val = newMedication.trim();
    if (!val) return;
    updateField('medications', [...form.medications, val]);
    setNewMedication('');
  }

  function removeMedication(idx) {
    updateField('medications', form.medications.filter((_, i) => i !== idx));
  }

  function toggleAlertPref(key) {
    updateField('alert_preferences', {
      ...form.alert_preferences,
      [key]: !form.alert_preferences[key],
    });
  }

  function updateNormalRange(vitalKey, bound, value) {
    const ranges = { ...form.normal_ranges };
    if (!ranges[vitalKey]) ranges[vitalKey] = {};
    const numVal = value === '' ? null : Number(value);
    ranges[vitalKey] = { ...ranges[vitalKey], [bound]: numVal };
    // Clean up: remove entry if both min and max are null
    if (ranges[vitalKey].min == null && ranges[vitalKey].max == null) {
      delete ranges[vitalKey];
    }
    updateField('normal_ranges', ranges);
  }

  // Calculated age
  const age = form?.date_of_birth
    ? differenceInYears(new Date(), parseISO(form.date_of_birth))
    : null;

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Unable to load patient profile.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Patient Profile</h1>
          <p className="text-sm text-gray-500 mt-1">Manage personal information and preferences</p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === 'saved' && (
            <span className="inline-flex items-center gap-1 text-sm text-green-600">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="text-sm text-red-600">Failed to save</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </button>
        </div>
      </div>

      {/* Personal Information */}
      <SectionCard icon={User} title="Personal Information">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={form.date_of_birth}
                onChange={(e) => updateField('date_of_birth', e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {age != null && (
                <span className="text-sm text-gray-500 whitespace-nowrap">Age {age}</span>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Chronic Conditions */}
      <SectionCard icon={Stethoscope} title="Chronic Conditions">
        <div className="flex flex-wrap gap-2 mb-3">
          {form.conditions.length === 0 && (
            <span className="text-sm text-gray-400">No conditions listed</span>
          )}
          {form.conditions.map((condition, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-sm bg-purple-50 text-purple-700 border border-purple-200 rounded-full"
            >
              {condition}
              <button
                onClick={() => removeCondition(idx)}
                className="text-purple-400 hover:text-purple-700 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newCondition}
            onChange={(e) => setNewCondition(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCondition()}
            placeholder="Add condition..."
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={addCondition}
            disabled={!newCondition.trim()}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </SectionCard>

      {/* Medications */}
      <SectionCard icon={Pill} title="Medications">
        <div className="space-y-2 mb-3">
          {form.medications.length === 0 && (
            <span className="text-sm text-gray-400">No medications listed</span>
          )}
          {form.medications.map((med, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg"
            >
              <span className="text-sm text-gray-800">{med}</span>
              <button
                onClick={() => removeMedication(idx)}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newMedication}
            onChange={(e) => setNewMedication(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addMedication()}
            placeholder="Add medication (e.g., Metformin 500mg twice daily)..."
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={addMedication}
            disabled={!newMedication.trim()}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </SectionCard>

      {/* Emergency Contact */}
      <SectionCard icon={Phone} title="Emergency Contact">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
            <input
              type="text"
              value={form.emergency_contact_name}
              onChange={(e) => updateField('emergency_contact_name', e.target.value)}
              placeholder="Full name"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            <input
              type="tel"
              value={form.emergency_contact_phone}
              onChange={(e) => updateField('emergency_contact_phone', e.target.value)}
              placeholder="(555) 123-4567"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </SectionCard>

      {/* Alert Preferences */}
      <SectionCard icon={Bell} title="Alert Preferences">
        <div className="space-y-4">
          {ALERT_TYPES.map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{label}</p>
                <p className="text-xs text-gray-500">{desc}</p>
              </div>
              <Toggle
                checked={form.alert_preferences[key] ?? true}
                onChange={() => toggleAlertPref(key)}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Normal Range Overrides */}
      <SectionCard icon={SlidersHorizontal} title="Normal Range Overrides">
        <p className="text-xs text-gray-500 mb-4">
          Customize alert thresholds for your vitals. Leave blank to use system defaults.
        </p>
        <div className="space-y-3">
          {VITAL_CONFIGS.map(({ key, label, unit, defaultMin, defaultMax }) => {
            const range = form.normal_ranges[key] || {};
            return (
              <div key={key} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                <span className="text-sm text-gray-700 w-full sm:w-auto sm:min-w-[120px]">{label}</span>
                <input
                  type="number"
                  step="any"
                  value={range.min ?? ''}
                  onChange={(e) => updateNormalRange(key, 'min', e.target.value)}
                  placeholder={defaultMin != null ? String(defaultMin) : '—'}
                  className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-center text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <span className="text-xs text-gray-400">to</span>
                <input
                  type="number"
                  step="any"
                  value={range.max ?? ''}
                  onChange={(e) => updateNormalRange(key, 'max', e.target.value)}
                  placeholder={defaultMax != null ? String(defaultMax) : '—'}
                  className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-center text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <span className="text-xs text-gray-500 w-12">{unit}</span>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
