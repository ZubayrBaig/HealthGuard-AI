// ---------------------------------------------------------------------------
// Supported wearable device metadata
// ---------------------------------------------------------------------------

export const SUPPORTED_DEVICES = {
  apple_watch: {
    name: 'Apple Watch',
    brand: 'Apple',
    icon: 'watch',
    color: '#333333',
    capabilities: ['heart_rate', 'blood_pressure', 'oxygen_saturation', 'steps', 'sleep_hours', 'temperature'],
    description: 'Comprehensive health tracking with ECG, blood oxygen, and sleep analysis',
    syncInterval: 'Real-time',
    batteryLife: '18 hours',
    firmwarePrefix: '10',
  },
  fitbit: {
    name: 'Fitbit Sense 2',
    brand: 'Fitbit',
    icon: 'activity',
    color: '#00B0B9',
    capabilities: ['heart_rate', 'oxygen_saturation', 'steps', 'sleep_hours', 'temperature'],
    description: 'Advanced health metrics with stress management and skin temperature',
    syncInterval: 'Every 15 min',
    batteryLife: '6+ days',
    firmwarePrefix: '194',
  },
  whoop: {
    name: 'WHOOP 4.0',
    brand: 'WHOOP',
    icon: 'heart-pulse',
    color: '#44CF6C',
    capabilities: ['heart_rate', 'oxygen_saturation', 'sleep_hours', 'temperature'],
    description: 'Performance optimization with strain, recovery, and sleep coaching',
    syncInterval: 'Continuous',
    batteryLife: '5 days',
    firmwarePrefix: '4',
  },
  oura_ring: {
    name: 'Oura Ring Gen 3',
    brand: 'Oura',
    icon: 'circle-dot',
    color: '#C4A962',
    capabilities: ['heart_rate', 'oxygen_saturation', 'sleep_hours', 'temperature', 'steps'],
    description: 'Discreet ring form factor with sleep tracking and readiness scores',
    syncInterval: 'Every 10 min',
    batteryLife: '7 days',
    firmwarePrefix: '3',
  },
  dexcom: {
    name: 'Dexcom G7',
    brand: 'Dexcom',
    icon: 'droplets',
    color: '#59A83C',
    capabilities: ['glucose'],
    description: 'Continuous glucose monitoring with real-time readings every 5 minutes',
    syncInterval: 'Every 5 min',
    batteryLife: '10 days (sensor)',
    firmwarePrefix: '2',
  },
  garmin: {
    name: 'Garmin Venu 3',
    brand: 'Garmin',
    icon: 'mountain',
    color: '#007CC3',
    capabilities: ['heart_rate', 'oxygen_saturation', 'steps', 'sleep_hours'],
    description: 'GPS smartwatch with advanced health monitoring and body battery',
    syncInterval: 'Every 15 min',
    batteryLife: '14 days',
    firmwarePrefix: '9',
  },
};

// ---------------------------------------------------------------------------
// Vitals generation ranges
// ---------------------------------------------------------------------------

const VITAL_RANGES = {
  heart_rate:               { min: 60,    max: 100 },
  blood_pressure_systolic:  { min: 110,   max: 140 },
  blood_pressure_diastolic: { min: 70,    max: 90 },
  glucose:                  { min: 80,    max: 180 },
  oxygen_saturation:        { min: 95,    max: 100 },
  temperature:              { min: 97.5,  max: 99.0 },
  sleep_hours:              { min: 5.0,   max: 9.0 },
  steps:                    { min: 2000,  max: 12000 },
};

// blood_pressure is a virtual capability that maps to two fields
const CAPABILITY_TO_FIELDS = {
  blood_pressure: ['blood_pressure_systolic', 'blood_pressure_diastolic'],
};

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

/**
 * Generate a vitals object with only the fields the given device supports.
 * Unsupported fields are set to null.
 */
export function generateDeviceVitals(deviceType) {
  const device = SUPPORTED_DEVICES[deviceType];
  if (!device) return null;

  // Expand capabilities into actual vital field names
  const fields = new Set();
  for (const cap of device.capabilities) {
    const mapped = CAPABILITY_TO_FIELDS[cap];
    if (mapped) {
      mapped.forEach((f) => fields.add(f));
    } else {
      fields.add(cap);
    }
  }

  const vitals = {};
  for (const [field, range] of Object.entries(VITAL_RANGES)) {
    if (fields.has(field)) {
      let value = randomInRange(range.min, range.max);
      // Integer fields
      if (field === 'heart_rate' || field === 'blood_pressure_systolic' ||
          field === 'blood_pressure_diastolic' || field === 'steps') {
        value = Math.round(value);
      } else {
        value = round1(value);
      }
      vitals[field] = value;
    } else {
      vitals[field] = null;
    }
  }

  return vitals;
}

/**
 * Generate a realistic firmware version string for a device type.
 */
export function generateFirmwareVersion(deviceType) {
  const device = SUPPORTED_DEVICES[deviceType];
  if (!device) return '1.0.0';
  const minor = Math.floor(Math.random() * 6);
  const patch = Math.floor(Math.random() * 10);
  return `${device.firmwarePrefix}.${minor}.${patch}`;
}
