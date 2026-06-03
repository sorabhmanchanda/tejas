// =============================================
// Agents listing + findings (approve/dismiss) + per-agent chat.
// =============================================

import { Router } from 'express';
import db from '../db/database.js';
import { callAI, hasApiKey } from '../lib/ai.js';
import { buildFleetContext } from '../lib/agentContext.js';
import { requireLoginId } from '../lib/user.js';

const router = Router();
router.use(requireLoginId);

const AGENT_PERSONAS = {
  anna: `You are Anna (अन्न), the nutrition agent for an eggetarian Indian user on a fat-loss cut.
You speak in food. You know dal varieties, paneer prep, egg-based meals, dahi-rice combos.
You suggest concrete meals with portions. You favour high-protein, high-fibre options.
You do NOT suggest meat or fish. You do suggest eggs, paneer, tofu, dal, sprouts, dairy.
Be warm but precise. Numbers matter.`,
  agni: `You are Agni (अग्नि), the calorie and macro tracker.
You think in numbers: kcal, grams, deficits, TDEE.
You're matter-of-fact and analytical. No fluff, no judgement.
You spot patterns across days and flag drift early.
You recalculate targets as weight changes.
You share the Tejas log with Anna, Bala, Nidra, and Sage — use the SHARED LOG below for meals and macros.`,
  bala: `You are Bala (बल), the strength and running coach.
You program PPL splits with 2-3 easy runs per week. Progressive overload focus.
You care about form, recovery, and consistency over hero workouts.
You know when to push (PRs) and when to back off (cumulative fatigue, poor sleep).
You speak like a trainer who's lifted for years — practical, not theoretical.`,
  nidra: `You are Nidra (निद्रा), the recovery and wellness agent.
You watch sleep, hydration, soreness, stress.
You're calm and quietly observant. You notice patterns the user might miss.
You recommend rest days, hydration boosts, earlier bedtimes when warranted.
You don't moralize about sleep — you help engineer better recovery.`,
  sage: `You are Sage, chief coach.
You synthesize input from Anna, Agni, Bala, and Nidra into one coherent picture.
You write the morning briefing and evening check-in.
You think in weeks, not just days. You spot trends.
You're the trusted advisor — calm, direct, never preachy.`,
};

router.get('/', (req, res) => {
  const { loginId } = req;
  const agents = db.prepare('SELECT * FROM agents ORDER BY rowid').all();
  const enriched = agents.map((a) => {
    const ep = db
      .prepare('SELECT COUNT(*) AS c FROM episodes WHERE agent_id = ? AND login_id = ?')
      .get(a.id, loginId).c;
    const ent = db
      .prepare('SELECT COUNT(*) AS c FROM entities WHERE agent_id = ? AND login_id = ?')
      .get(a.id, loginId).c;
    const find = db
      .prepare(
        "SELECT COUNT(*) AS c FROM findings WHERE agent_id = ? AND login_id = ? AND status = 'pending'"
      )
      .get(a.id, loginId).c;
    return { ...a, metrics: { ep, ent, find, ds: a.id === 'nidra' ? 1 : 0 } };
  });
  res.json({ agents: enriched });
});

router.get('/findings', (req, res) => {
  const status = ['pending', 'approved', 'dismissed'].includes(req.query?.status)
    ? req.query.status
    : 'pending';
  const findings = db
    .prepare(
      `SELECT f.*, a.name AS agent_name, a.color AS agent_color
       FROM findings f JOIN agents a ON a.id = f.agent_id
       WHERE f.login_id = ? AND f.status = ? ORDER BY f.created_at DESC`
    )
    .all(req.loginId, status);
  res.json({ findings });
});

router.post('/findings/:id/:action', (req, res) => {
  const id = Number(req.params.id);
  const action = req.params.action;
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad id' });
  if (!['approve', 'dismiss'].includes(action)) {
    return res.status(400).json({ error: 'action must be approve|dismiss' });
  }
  const status = action === 'approve' ? 'approved' : 'dismissed';
  const info = db
    .prepare(
      'UPDATE findings SET status = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ? AND login_id = ?'
    )
    .run(status, id, req.loginId);
  if (info.changes === 0) return res.status(404).json({ error: 'finding not found' });
  res.json({ id, status });
});

router.delete('/:id/chat', (req, res) => {
  const agentId = req.params.id;
  if (!AGENT_PERSONAS[agentId]) return res.status(404).json({ error: 'unknown agent' });
  db.prepare('DELETE FROM chat_messages WHERE agent_id = ? AND login_id = ?').run(agentId, req.loginId);
  res.json({ cleared: true });
});

router.get('/:id/chat', (req, res) => {
  const agentId = req.params.id;
  if (!AGENT_PERSONAS[agentId]) return res.status(404).json({ error: 'unknown agent' });
  const messages = db
    .prepare(
      'SELECT role, content, created_at FROM chat_messages WHERE agent_id = ? AND login_id = ? ORDER BY created_at'
    )
    .all(agentId, req.loginId);
  res.json({ messages });
});

router.post('/:id/chat', async (req, res) => {
  const agentId = req.params.id;
  const persona = AGENT_PERSONAS[agentId];
  if (!persona) return res.status(404).json({ error: 'unknown agent' });

  const userMessage = req.body?.message;
  if (typeof userMessage !== 'string' || userMessage.trim().length === 0) {
    return res.status(400).json({ error: 'message is required' });
  }

  db.prepare('INSERT INTO chat_messages (login_id, agent_id, role, content) VALUES (?, ?, ?, ?)').run(
    req.loginId,
    agentId,
    'user',
    userMessage.trim().slice(0, 4000)
  );

  const history = db
    .prepare(
      `SELECT role, content FROM chat_messages WHERE agent_id = ? AND login_id = ?
       ORDER BY created_at DESC LIMIT 20`
    )
    .all(agentId, req.loginId)
    .reverse()
    .filter((m) => !/is offline|set GEMINI_API_KEY/i.test(m.content));

  if (!hasApiKey()) {
    const meals = buildFleetContext(req.loginId).includes("TODAY'S MEALS (0 logged)")
      ? 'No meals logged today yet in shared log.'
      : 'See today\'s meals in the shared log when Gemini is enabled.';
    const reply = `(${agentId} is offline — add GEMINI_API_KEY to backend/.env.) ${meals} You asked: "${userMessage.trim().slice(0, 100)}".`;
    db.prepare('INSERT INTO chat_messages (login_id, agent_id, role, content) VALUES (?, ?, ?, ?)').run(
      req.loginId,
      agentId,
      'assistant',
      reply
    );
    return res.json({ reply, mock: true });
  }

  try {
    const fleetContext = buildFleetContext(req.loginId);
    const reply = await callAI({
      maxTokens: 1000,
      system: `${persona}\n\n${fleetContext}`,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });
    db.prepare('INSERT INTO chat_messages (login_id, agent_id, role, content) VALUES (?, ?, ?, ?)').run(
      req.loginId,
      agentId,
      'assistant',
      reply
    );
    res.json({ reply });
  } catch (e) {
    console.error('[chat]', e.message);
    res.status(502).json({ error: 'Agent could not respond right now' });
  }
});

export default router;
