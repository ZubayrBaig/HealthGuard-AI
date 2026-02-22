import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new Database(join(__dirname, 'healthguard.db'));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

export default db;
