import { useState, useEffect, useCallback, useRef } from 'react';
import { io as socketIO } from 'socket.io-client';
import { formatDistanceToNow } from 'date-fns';
import {
  Watch, Activity, HeartPulse, CircleDot, Droplets, Mountain,
  Search, RefreshCw, Unplug, Bluetooth, Battery,
  Loader2, Wifi, Zap,
} from 'lucide-react';
import api from '../utils/api';
import { useToast } from '../context/ToastContext';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ICON_MAP = {
  watch: Watch,
  activity: Activity,
  'heart-pulse': HeartPulse,
  'circle-dot': CircleDot,
  droplets: Droplets,
  mountain: Mountain,
};

const CAPABILITY_LABELS = {
  heart_rate: { emoji: '\u2764\uFE0F', label: 'HR' },
  blood_pressure: { emoji: '\uD83E\uDE7A', label: 'BP' },
  oxygen_saturation: { emoji: '\uD83E\uDEC1', label: 'SpO2' },
  glucose: { emoji: '\uD83E\uDE78', label: 'Glucose' },
  temperature: { emoji: '\uD83C\uDF21\uFE0F', label: 'Temp' },
  sleep_hours: { emoji: '\uD83D\uDE34', label: 'Sleep' },
  steps: { emoji: '\uD83D\uDC5F', label: 'Steps' },
};

const STATUS_CONFIG = {
  connected: { dot: 'bg-green-500', text: 'text-green-700', label: 'Connected', animate: false },
  syncing: { dot: 'bg-blue-500', text: 'text-blue-700', label: 'Syncing...', animate: true },
  pending: { dot: 'bg-yellow-500', text: 'text-yellow-700', label: 'Pairing...', animate: true },
  disconnected: { dot: 'bg-gray-400', text: 'text-gray-500', label: 'Disconnected', animate: false },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.disconnected;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${config.text}`}>
      <span className={`h-2 w-2 rounded-full ${config.dot} ${config.animate ? 'animate-pulse-dot' : ''}`} />
      {config.label}
    </span>
  );
}

function CapabilityChips({ capabilities }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {capabilities.map((cap) => {
        const info = CAPABILITY_LABELS[cap];
        if (!info) return null;
        return (
          <span
            key={cap}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-600"
          >
            <span>{info.emoji}</span> {info.label}
          </span>
        );
      })}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center">
      <Bluetooth className="h-12 w-12 text-gray-300 mx-auto mb-4" />
      <h3 className="text-base font-semibold text-gray-700 mb-1">No devices connected yet</h3>
      <p className="text-sm text-gray-500 max-w-sm mx-auto">
        Connect a device below to start automatic health tracking
      </p>
    </div>
  );
}

function ConnectedDeviceCard({ device, supported, onSync, onDisconnect, isSyncing, isJustConnected }) {
  const config = supported[device.device_type];
  const DeviceIcon = ICON_MAP[config?.icon] || Watch;
  const brandColor = config?.color || '#6b7280';
  const showSyncBar = device.status === 'syncing' || isSyncing;

  return (
    <div
      className={`relative bg-white rounded-xl border border-gray-200 border-l-4 p-5 transition-all ${
        isJustConnected ? 'animate-connect-flash' : ''
      }`}
      style={{ borderLeftColor: brandColor }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-lg"
            style={{ backgroundColor: brandColor + '18' }}
          >
            <DeviceIcon className="h-5 w-5" style={{ color: brandColor }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{device.device_name}</h3>
            <p className="text-xs text-gray-500">{config?.brand}</p>
          </div>
        </div>
        <StatusBadge status={device.status} />
      </div>

      {/* Details */}
      <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
        {device.last_sync_at && (
          <span>
            Synced {formatDistanceToNow(new Date(device.last_sync_at.replace(' ', 'T')), { addSuffix: true })}
          </span>
        )}
        {device.battery_level != null && (
          <span className="inline-flex items-center gap-1">
            <Battery className="h-3 w-3" />
            {device.battery_level}%
          </span>
        )}
      </div>

      {/* Capabilities */}
      {config?.capabilities && (
        <div className="mb-4">
          <CapabilityChips capabilities={config.capabilities} />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onSync(device.id)}
          disabled={showSyncBar || device.status !== 'connected'}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${showSyncBar ? 'animate-spin' : ''}`} />
          Sync Now
        </button>
        <button
          onClick={() => onDisconnect(device.id, device.device_name)}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
        >
          <Unplug className="h-3.5 w-3.5" />
          Disconnect
        </button>
      </div>

      {/* Sync progress bar */}
      {showSyncBar && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-100 rounded-b-xl overflow-hidden">
          <div className="h-full bg-blue-500 animate-sync-bar rounded-b-xl" />
        </div>
      )}
    </div>
  );
}

function AvailableDeviceCard({ deviceKey, config, onConnect, isConnecting }) {
  const DeviceIcon = ICON_MAP[config.icon] || Watch;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden transition-shadow hover:shadow-md">
      {/* Header with brand color wash */}
      <div
        className="px-5 pt-5 pb-4"
        style={{
          background: `linear-gradient(135deg, ${config.color}08, ${config.color}15)`,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="p-2.5 rounded-xl"
            style={{ backgroundColor: config.color + '18' }}
          >
            <DeviceIcon className="h-6 w-6" style={{ color: config.color }} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{config.name}</h3>
            <p className="text-xs text-gray-500">{config.brand}</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 pb-5 space-y-3">
        <p className="text-sm text-gray-600 line-clamp-1">{config.description}</p>

        {/* Specs */}
        <div className="flex gap-4 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1">
            <Zap className="h-3 w-3" /> {config.syncInterval}
          </span>
          <span className="inline-flex items-center gap-1">
            <Battery className="h-3 w-3" /> {config.batteryLife}
          </span>
        </div>

        {/* Capabilities */}
        <CapabilityChips capabilities={config.capabilities} />

        {/* Connect button */}
        <button
          onClick={() => onConnect(deviceKey)}
          disabled={isConnecting}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isConnecting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Wifi className="h-4 w-4" />
              Connect
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function DevicesSkeleton() {
  return (
    <div className="space-y-8">
      <div className="h-8 w-48 rounded bg-gray-200 animate-pulse" />
      <div>
        <div className="h-6 w-32 rounded bg-gray-200 animate-pulse mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-52 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Devices() {
  const { addToast } = useToast();

  const [patientId, setPatientId] = useState(null);
  const [devices, setDevices] = useState([]);
  const [supported, setSupported] = useState({});
  const [loading, setLoading] = useState(true);
  const [connectingType, setConnectingType] = useState(null);
  const [syncingDeviceId, setSyncingDeviceId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [justConnected, setJustConnected] = useState(null);

  // Refs for latest values in socket callback
  const connectingTypeRef = useRef(connectingType);
  const syncingDeviceIdRef = useRef(syncingDeviceId);
  const supportedRef = useRef(supported);
  useEffect(() => { connectingTypeRef.current = connectingType; }, [connectingType]);
  useEffect(() => { syncingDeviceIdRef.current = syncingDeviceId; }, [syncingDeviceId]);
  useEffect(() => { supportedRef.current = supported; }, [supported]);

  // Fetch patient ID
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const { data: patients } = await api.get('/api/patients');
        if (cancelled) return;
        if (patients.length) setPatientId(patients[0].id);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  // Fetch devices + catalog
  const fetchDevices = useCallback(async () => {
    if (!patientId) return;
    try {
      const [devRes, supRes] = await Promise.all([
        api.get(`/api/devices/${patientId}`),
        api.get('/api/devices/supported'),
      ]);
      setDevices(devRes.data);
      setSupported(supRes.data);
    } catch {
      // silent
    }
  }, [patientId]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // Socket.io real-time updates
  useEffect(() => {
    if (!patientId) return;

    const socket = socketIO({ path: '/socket.io' });

    socket.on('device-status-change', (data) => {
      if (data.patientId !== patientId) return;

      // Connected after a connect flow
      if (data.status === 'connected' && connectingTypeRef.current) {
        setConnectingType(null);
        setJustConnected(data.deviceId);
        addToast('success', `${data.device_name} connected successfully! Syncing your latest health data...`);
        setTimeout(() => setJustConnected(null), 2000);
      }

      // Sync finished
      if (data.status === 'connected' && syncingDeviceIdRef.current === data.deviceId) {
        setSyncingDeviceId(null);
      }

      fetchDevices();
    });

    socket.on('vitals-updated', (data) => {
      if (data.patientId !== patientId) return;
      const src = data.reading?.source;
      if (src && src !== 'manual' && src !== 'simulated' && src !== 'demo') {
        const deviceName = supportedRef.current[src]?.name || src;
        addToast('info', `New vitals received from ${deviceName}`);
      }
    });

    return () => socket.disconnect();
  }, [patientId, fetchDevices, addToast]);

  // Handlers
  async function handleConnect(deviceType) {
    setConnectingType(deviceType);
    try {
      await api.post(`/api/devices/${patientId}/connect`, { device_type: deviceType });
      fetchDevices();
    } catch (err) {
      setConnectingType(null);
      addToast('error', err.response?.data?.error || 'Failed to connect device');
    }
  }

  async function handleSync(deviceId) {
    setSyncingDeviceId(deviceId);
    try {
      await api.post(`/api/devices/${patientId}/${deviceId}/sync`);
    } catch {
      setSyncingDeviceId(null);
      addToast('error', 'Failed to sync device');
    }
  }

  async function handleDisconnect(deviceId, deviceName) {
    if (!window.confirm(`Disconnect ${deviceName}?`)) return;
    try {
      await api.delete(`/api/devices/${patientId}/${deviceId}`);
      addToast('info', `${deviceName} disconnected`);
      fetchDevices();
    } catch {
      addToast('error', 'Failed to disconnect device');
    }
  }

  // Derived state
  const activeDevices = devices.filter((d) => d.status !== 'disconnected');
  const activeTypes = new Set(activeDevices.map((d) => d.device_type));
  const availableDevices = Object.entries(supported)
    .filter(([key]) => !activeTypes.has(key))
    .filter(
      ([, dev]) =>
        !searchQuery ||
        dev.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dev.brand.toLowerCase().includes(searchQuery.toLowerCase()),
    );

  if (loading) return <DevicesSkeleton />;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Devices</h1>
        <p className="text-sm text-gray-500 mt-1">
          Connect and manage your wearable health devices
        </p>
      </div>

      {/* Section 1 — My Devices */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          My Devices
          {activeDevices.length > 0 && (
            <span className="text-xs font-normal text-gray-400">
              {activeDevices.length} device{activeDevices.length !== 1 ? 's' : ''}
            </span>
          )}
        </h2>

        {activeDevices.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeDevices.map((device) => (
              <ConnectedDeviceCard
                key={device.id}
                device={device}
                supported={supported}
                onSync={handleSync}
                onDisconnect={handleDisconnect}
                isSyncing={syncingDeviceId === device.id}
                isJustConnected={justConnected === device.id}
              />
            ))}
          </div>
        )}
      </section>

      {/* Section 2 — Available Devices */}
      <section>
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Available Devices</h2>
          </div>
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search devices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
        </div>

        {availableDevices.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">
            {searchQuery
              ? 'No devices match your search'
              : 'All supported devices are connected'}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {availableDevices.map(([key, config]) => (
              <AvailableDeviceCard
                key={key}
                deviceKey={key}
                config={config}
                onConnect={handleConnect}
                isConnecting={connectingType === key}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
