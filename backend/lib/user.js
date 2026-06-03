// Login ID helpers — no passwords; household-style shared app.

export const LOGIN_ID_RE = /^[a-z0-9][a-z0-9_-]{1,31}$/;

export function normalizeLoginId(raw) {
  if (typeof raw !== 'string') return null;
  const id = raw.trim().toLowerCase().replace(/\s+/g, '_');
  if (!LOGIN_ID_RE.test(id)) return null;
  return id;
}

/** Attach req.loginId from X-Tejas-User header (required on protected routes). */
export function requireLoginId(req, res, next) {
  const id = normalizeLoginId(req.headers['x-tejas-user'] || '');
  if (!id) {
    return res.status(401).json({
      error: 'Login ID required. Send header X-Tejas-User (2–32 chars: letters, numbers, _ -).',
    });
  }
  req.loginId = id;
  next();
}
