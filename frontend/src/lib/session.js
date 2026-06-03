const STORAGE_KEY = 'tejas_login_id';

export function getLoginId() {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setLoginId(loginId) {
  localStorage.setItem(STORAGE_KEY, loginId);
}

export function clearLoginId() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Normalize the same way the backend does (for display hints). */
export function normalizeLoginIdInput(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase().replace(/\s+/g, '_');
}

export const LOGIN_ID_HINT = '2–32 chars: lowercase letters, numbers, underscore, hyphen';
