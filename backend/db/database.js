import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB_DIR } from '../lib/paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = path.join(DB_DIR, 'tejas.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply schema (idempotent — uses IF NOT EXISTS / INSERT OR IGNORE).
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

// Run directly (npm run init-db) to (re)initialize the database.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('database.js')) {
  const agents = db.prepare('SELECT id, name FROM agents').all();
  console.log(`[db] Initialized at ${DB_PATH}`);
  console.log(`[db] Seeded ${agents.length} agents:`, agents.map((a) => a.name).join(', '));
}

export default db;
