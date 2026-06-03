// Tiny fetch wrapper around the Tejas backend.
// Dev: Vite proxies /api → localhost:3001. Production: set VITE_API_URL on Vercel.
import { getLoginId } from './session.js';

const API_ROOT = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const BASE = API_ROOT ? `${API_ROOT}/api` : '/api';

// Fallback when localStorage is slow/unavailable (e.g. iOS Safari) — set from App after login.
let activeLoginId = '';

export function setApiLoginId(loginId) {
  activeLoginId = typeof loginId === 'string' ? loginId : '';
}

function resolveLoginId() {
  return getLoginId() || activeLoginId;
}

async function request(path, { method = 'GET', body, isForm = false, auth = true } = {}) {
  const opts = { method, headers: {} };
  if (auth) {
    const loginId = resolveLoginId();
    if (!loginId) {
      throw new Error('Not signed in. Go back and pick a login ID first.');
    }
    opts.headers['X-Tejas-User'] = loginId;
  }
  if (body && !isForm) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body && isForm) {
    opts.body = body;
  }
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  health: () => request('/health', { auth: false }),

  // Auth (no password)
  listUsers: () => request('/auth/users', { auth: false }),
  startSession: (loginId) =>
    request('/auth/session', { method: 'POST', body: { loginId }, auth: false }),
  resetMyData: () => request('/auth/reset', { method: 'POST' }),
  resetAllData: () => request('/auth/reset-all', { method: 'POST' }),

  // Profile / onboarding
  getProfile: () => request('/profile'),
  previewTargets: (payload) => request('/profile/preview', { method: 'POST', body: payload }),
  saveProfile: (payload) => request('/profile', { method: 'POST', body: payload }),

  // Today + logs
  today: () => request('/log/today'),
  weightHistory: (days = 7) => request(`/log/weight/history?days=${days}`),
  logMeal: (payload) => request('/log/meal', { method: 'POST', body: payload }),
  parseMeal: (text, meal_type) =>
    request('/log/meal/parse', { method: 'POST', body: { text, meal_type } }),
  logWorkout: (payload) => request('/log/workout', { method: 'POST', body: payload }),
  logWater: (amount_ml = 250) => request('/log/water', { method: 'POST', body: { amount_ml } }),
  logWeight: (weight_kg) => request('/log/weight', { method: 'POST', body: { weight_kg } }),
  logSleep: (payload) => request('/log/sleep', { method: 'POST', body: payload }),

  // Photo (multipart)
  analyzePhoto: (file) => {
    const form = new FormData();
    form.append('photo', file);
    return request('/photo/analyze', { method: 'POST', body: form, isForm: true });
  },

  // Agents
  getAgents: () => request('/agents'),
  getFindings: (status = 'pending') => request(`/agents/findings?status=${status}`),
  resolveFinding: (id, action) => request(`/agents/findings/${id}/${action}`, { method: 'POST' }),
  getChat: (agentId) => request(`/agents/${agentId}/chat`),
  sendChat: (agentId, message) =>
    request(`/agents/${agentId}/chat`, { method: 'POST', body: { message } }),

  // Fleet group chat
  getFleetMessages: (since = 0) =>
    request(`/fleet/messages?since=${since}&limit=80`),
  fleetStatus: () => request('/fleet/status'),

  // Briefing
  latestBriefing: () => request('/briefing/latest'),
  generateBriefing: (workout_name) =>
    request('/briefing/morning', { method: 'POST', body: { workout_name } }),
};
