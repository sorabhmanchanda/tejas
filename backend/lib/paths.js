import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// On Railway, mount a volume at /data and set DATA_DIR=/data.
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..');
export const DB_DIR = path.join(DATA_DIR, 'db');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

for (const dir of [DB_DIR, UPLOAD_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}
