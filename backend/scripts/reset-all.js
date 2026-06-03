// One-shot: wipe all user data (profiles, logs, chat). Agents table is kept.
import '../db/database.js';
import db from '../db/database.js';
import { resetAllUserData } from '../db/migrate.js';

resetAllUserData(db);
console.log('[reset-all] All user data cleared. Pick a login ID in the app to start fresh.');
