// Login ID session (no passwords). Switch users via X-Tejas-User header.

import { Router } from 'express';
import db from '../db/database.js';
import { normalizeLoginId, requireLoginId } from '../lib/user.js';
import { resetUserData, resetAllUserData } from '../db/migrate.js';

const router = Router();

// List known login IDs (for household picker).
router.get('/users', (_req, res) => {
  const users = db
    .prepare(
      `SELECT u.login_id, u.last_seen,
              CASE WHEN p.login_id IS NOT NULL THEN 1 ELSE 0 END AS has_profile
       FROM app_users u
       LEFT JOIN user_profile p ON p.login_id = u.login_id
       ORDER BY u.last_seen DESC`
    )
    .all();
  res.json({ users });
});

// Start or resume a session with a login ID.
router.post('/session', (req, res) => {
  const loginId = normalizeLoginId(req.body?.loginId ?? '');
  if (!loginId) {
    return res.status(400).json({
      error: 'Invalid login ID. Use 2–32 characters: lowercase letters, numbers, underscore, hyphen.',
    });
  }

  db.prepare(
    `INSERT INTO app_users (login_id, last_seen) VALUES (?, CURRENT_TIMESTAMP)
     ON CONFLICT(login_id) DO UPDATE SET last_seen = CURRENT_TIMESTAMP`
  ).run(loginId);

  const profile = db.prepare('SELECT * FROM user_profile WHERE login_id = ?').get(loginId);
  res.json({ loginId, hasProfile: Boolean(profile) });
});

// Reset current user's data (profile + logs + chat).
router.post('/reset', requireLoginId, (req, res) => {
  resetUserData(db, req.loginId);
  res.json({ reset: true, loginId: req.loginId });
});

// Wipe every user (dev / full app reset). Optional query ?all=1 with login header.
router.post('/reset-all', requireLoginId, (req, res) => {
  resetAllUserData(db);
  res.json({ reset: true, scope: 'all' });
});

export default router;
