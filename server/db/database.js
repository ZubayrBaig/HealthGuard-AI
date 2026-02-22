import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new Database(join(__dirname, 'healthguard.db'));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables eagerly so that prepared statements in route modules work
// even on a fresh database (ESM imports resolve before index.js calls initDb).
db.exec(`
  CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    date_of_birth TEXT NOT NULL,
    conditions TEXT NOT NULL DEFAULT '[]',
    medications TEXT NOT NULL DEFAULT '[]',
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS vitals (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    heart_rate INTEGER,
    blood_pressure_systolic INTEGER,
    blood_pressure_diastolic INTEGER,
    glucose REAL,
    oxygen_saturation REAL,
    temperature REAL,
    sleep_hours REAL,
    steps INTEGER,
    source TEXT DEFAULT 'manual',
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_vitals_patient_timestamp
    ON vitals(patient_id, timestamp);

  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('critical', 'warning', 'info')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    vital_type TEXT,
    vital_value REAL,
    threshold_value REAL,
    acknowledged INTEGER NOT NULL DEFAULT 0,
    ai_message TEXT,
    emergency_context TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_alerts_patient_created
    ON alerts(patient_id, created_at);

  CREATE TABLE IF NOT EXISTS chat_history (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_chat_patient_created
    ON chat_history(patient_id, created_at);

  CREATE TABLE IF NOT EXISTS connected_devices (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    device_type TEXT NOT NULL,
    device_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('connected', 'syncing', 'disconnected', 'pending')),
    last_sync_at TEXT,
    battery_level INTEGER,
    firmware_version TEXT,
    settings TEXT DEFAULT '{}',
    connected_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_devices_patient
    ON connected_devices(patient_id);
`);

// Migration: add columns for existing databases that lack them
try { db.exec('ALTER TABLE alerts ADD COLUMN ai_message TEXT'); } catch {}
try { db.exec('ALTER TABLE alerts ADD COLUMN emergency_context TEXT'); } catch {}
try { db.exec("ALTER TABLE patients ADD COLUMN alert_preferences TEXT NOT NULL DEFAULT '{\"critical\":true,\"warning\":true,\"info\":true}'"); } catch {}
try { db.exec("ALTER TABLE patients ADD COLUMN normal_ranges TEXT NOT NULL DEFAULT '{}'"); } catch {}
try { db.exec('ALTER TABLE patients ADD COLUMN auth0_sub TEXT'); } catch {}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_auth0_sub ON patients(auth0_sub) WHERE auth0_sub IS NOT NULL');

export default db;
