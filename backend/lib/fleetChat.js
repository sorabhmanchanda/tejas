// Fleet group chat — agents discuss after logs; user can post and @mention agents.

import db from '../db/database.js';
import { callAI, hasApiKey } from './ai.js';
import { buildFleetContext } from './agentContext.js';

const AGENT_NAMES = {
  anna: 'Anna',
  agni: 'Agni',
  bala: 'Bala',
  nidra: 'Nidra',
  sage: 'Sage',
};

const AGENTS_BY_EVENT = {
  workout_logged: ['bala', 'anna', 'agni', 'nidra', 'sage'],
  meal_logged: ['anna', 'agni', 'sage'],
  weight_logged: ['agni', 'sage'],
};

/** Default responders when the user posts without @mentions (keeps API load reasonable). */
const AGENTS_FOR_USER_DEFAULT = ['anna', 'agni', 'sage'];

const MENTION_RE = /@(anna|agni|bala|nidra|sage)\b/gi;

const FLEET_PERSONAS = {
  bala: `You are Bala (बल), workout coach, posting in the Tejas fleet group chat.
React to the user's logged workout. Be practical, brief (2–4 sentences). Speak to the group, not a private DM.`,
  anna: `You are Anna (अन्न), nutrition agent, in the Tejas fleet group chat.
Read what other agents said. Suggest concrete eggetarian Indian food (portions, timing). No meat/fish. 2–4 sentences.`,
  agni: `You are Agni (अग्नि), macro tracker, in the Tejas fleet group chat.
Comment on calories/protein impact of what happened. Numbers-focused, 1–3 sentences.`,
  nidra: `You are Nidra (निद्रा), recovery agent, in the Tejas fleet group chat.
Note hydration, sleep, or recovery implications. Calm, 1–3 sentences.`,
  sage: `You are Sage, chief coach, in the Tejas fleet group chat.
Synthesize the thread into one clear takeaway and today's focus. 2–3 sentences. Last word in the thread.`,
};

const activeDiscussions = new Set();

export function isFleetDiscussing(loginId) {
  return activeDiscussions.has(loginId);
}

function insertFleetMessage(loginId, { agentId, role, content, eventType, sourceId }) {
  return db
    .prepare(
      `INSERT INTO fleet_messages (login_id, agent_id, role, content, event_type, source_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(loginId, agentId, role, content.slice(0, 4000), eventType ?? null, sourceId ?? null);
}

function formatEventSummary(event, profile) {
  const name = profile?.name ?? 'User';
  switch (event.type) {
    case 'workout_logged': {
      const w = event.workout;
      return `${name} logged ${w.workout_name || w.workout_type} (${w.duration_min ?? '?'} min, ${w.intensity || 'moderate'} intensity).`;
    }
    case 'meal_logged': {
      const m = event.meal;
      return `${name} logged ${m.meal_type}: ${m.food_name} (~${m.calories} kcal, ${m.protein_g}g protein).`;
    }
    case 'weight_logged':
      return `${name} weighed in at ${event.weight_kg} kg.`;
    default:
      return `${name} logged activity.`;
  }
}

function buildThreadText(thread, userName = 'You') {
  if (!thread.length) return '(no messages yet)';
  return thread
    .map((m) => {
      if (m.role === 'system') return `[system] ${m.content}`;
      if (m.role === 'user') return `[${userName}] ${m.content}`;
      return `[${AGENT_NAMES[m.agent_id] || m.agent_name || m.agent_id}] ${m.content}`;
    })
    .join('\n');
}

function parseMentionedAgents(text) {
  const found = [];
  const seen = new Set();
  for (const m of String(text).matchAll(MENTION_RE)) {
    const id = m[1].toLowerCase();
    if (!seen.has(id)) {
      seen.add(id);
      found.push(id);
    }
  }
  return found;
}

function agentsForUserMessage(text) {
  const mentioned = parseMentionedAgents(text);
  return mentioned.length ? mentioned : AGENTS_FOR_USER_DEFAULT;
}

function loadThreadRows(loginId, limit = 40) {
  return listFleetMessages(loginId, { limit }).map((r) => ({
    role: r.role,
    agent_id: r.agent_id,
    agent_name: r.agent_name,
    content: r.content,
  }));
}

function mockUserReply(agentId, profile) {
  const name = profile?.name ?? 'there';
  const mocks = {
    anna: `${name}, for eggetarian options — dal, eggs, or paneer; say which meal you're planning.`,
    agni: `I'll use today's log for the numbers — target ~${profile?.daily_protein_g ?? 140}g protein and ${profile?.daily_calorie_target ?? 2000} kcal.`,
    bala: `If this is about training, log the session when done and we'll adjust volume from there.`,
    nidra: `Hydration and sleep matter here — aim for 7h tonight and an extra glass of water.`,
    sage: `Noted. One clear focus: hit protein at your next meal, then check net kcal for the day.`,
  };
  return mocks[agentId] || 'Got it — we are on it.';
}

function mockReplies(event) {
  if (event.type === 'workout_logged') {
    const w = event.workout;
    return [
      {
        agent_id: 'bala',
        content: `Solid ${w.workout_name || w.workout_type} session. Keep the next 24h easy on joints — you earned the work.`,
      },
      {
        agent_id: 'anna',
        content:
          'Within 90 min: 3 eggs + 2 rotis or paneer bhurji with one katori dal. Aim ~35–40g protein to support recovery.',
      },
      {
        agent_id: 'agni',
        content: `Burn looks moderate; stay inside today's ${event.profile?.daily_calorie_target ?? 2000} kcal cap and prioritize protein.`,
      },
      {
        agent_id: 'nidra',
        content: 'Extra water tonight (+500ml) and aim for 7h sleep — glycogen refill happens in recovery.',
      },
      {
        agent_id: 'sage',
        content: 'Train done → fuel and sleep. Hit protein at the next meal, then walk it off lightly this evening.',
      },
    ];
  }
  if (event.type === 'meal_logged') {
    const m = event.meal;
    return [
      {
        agent_id: 'anna',
        content: `Logged ${m.food_name} — if dinner, keep the next bite protein-forward if you're under target.`,
      },
      {
        agent_id: 'agni',
        content: `That's ~${m.calories} kcal toward the day. Watch the running protein total vs ${event.profile?.daily_protein_g ?? 140}g.`,
      },
      {
        agent_id: 'sage',
        content: 'Meal on the board. Check remaining kcal before any late snack.',
      },
    ];
  }
  return [
    {
      agent_id: 'agni',
      content: `Weight noted at ${event.weight_kg} kg — targets may shift slightly; stay consistent this week.`,
    },
    { agent_id: 'sage', content: 'Trend beats single points. Same routine, measure again in 3–4 days.' },
  ];
}

async function runFleetDiscussion(loginId, event) {
  if (activeDiscussions.has(loginId)) return;
  activeDiscussions.add(loginId);

  try {
    const profile = db.prepare('SELECT * FROM user_profile WHERE login_id = ?').get(loginId);
    event.profile = profile;

    const agents = AGENTS_BY_EVENT[event.type];
    if (!agents?.length) return;

    const summary = formatEventSummary(event, profile);
    const sourceId = event.workout?.id ?? event.meal?.id ?? null;

    insertFleetMessage(loginId, {
      agentId: null,
      role: 'system',
      content: summary,
      eventType: event.type,
      sourceId,
    });

    const thread = [{ role: 'system', content: summary }];

    if (!hasApiKey()) {
      for (const msg of mockReplies(event)) {
        insertFleetMessage(loginId, {
          agentId: msg.agent_id,
          role: 'agent',
          content: msg.content,
          eventType: event.type,
          sourceId,
        });
        thread.push({ role: 'agent', agent_id: msg.agent_id, content: msg.content });
      }
      return;
    }

    const mockByAgent = Object.fromEntries(mockReplies(event).map((m) => [m.agent_id, m.content]));

    for (const agentId of agents) {
      let text;
      try {
        const persona = FLEET_PERSONAS[agentId];
        const reply = await callAI({
          maxTokens: 350,
          system: `${persona}

User profile: ${profile?.name ?? 'User'}, cut, eggetarian, ~${profile?.daily_calorie_target ?? 2000} kcal/day, ~${profile?.daily_protein_g ?? 140}g protein/day.
Event: ${summary}

Rules:
- ONE message only, no bullet lists unless tiny.
- Reference other agents by name if responding to them.
- Do not repeat the system line verbatim.`,
          messages: [
            {
              role: 'user',
              content: `Fleet chat thread so far:\n${buildThreadText(thread)}\n\nPost your message as ${AGENT_NAMES[agentId]}:`,
            },
          ],
        });
        text = (reply || '').trim() || mockByAgent[agentId] || '…';
      } catch (agentErr) {
        console.error(`[fleet/${agentId}]`, agentErr.message);
        text =
          mockByAgent[agentId] ||
          `${AGENT_NAMES[agentId]}: Log received — I'll sync fully when Gemini is available.`;
      }

      insertFleetMessage(loginId, {
        agentId,
        role: 'agent',
        content: text,
        eventType: event.type,
        sourceId,
      });
      thread.push({ role: 'agent', agent_id: agentId, content: text });
    }
  } catch (e) {
    console.error('[fleet]', e.message);
  } finally {
    activeDiscussions.delete(loginId);
  }
}

async function runFleetUserReply(loginId, userText) {
  if (activeDiscussions.has(loginId)) return;
  activeDiscussions.add(loginId);

  try {
    const profile = db.prepare('SELECT * FROM user_profile WHERE login_id = ?').get(loginId);
    const userName = profile?.name ?? 'You';
    const agents = agentsForUserMessage(userText);
    const thread = loadThreadRows(loginId);
    const fleetContext = buildFleetContext(loginId);
    const mockByAgent = Object.fromEntries(agents.map((id) => [id, mockUserReply(id, profile)]));

    if (!hasApiKey()) {
      for (const agentId of agents) {
        insertFleetMessage(loginId, {
          agentId,
          role: 'agent',
          content: mockByAgent[agentId],
          eventType: 'user_message',
          sourceId: null,
        });
      }
      return;
    }

    const liveThread = [...thread];

    for (const agentId of agents) {
      let text;
      try {
        const persona = FLEET_PERSONAS[agentId];
        const reply = await callAI({
          maxTokens: 350,
          system: `${persona}

The user posted directly in the fleet group chat (not only a log event). Reply to their message; reference other agents by name when relevant.

User profile: ${userName}, cut, eggetarian, ~${profile?.daily_calorie_target ?? 2000} kcal/day, ~${profile?.daily_protein_g ?? 140}g protein/day.

Shared database (use these facts; do not claim you lack access):
${fleetContext}

Rules:
- ONE message only, 2–4 sentences max.
- Answer the user's question or comment directly.`,
          messages: [
            {
              role: 'user',
              content: `Fleet chat thread:\n${buildThreadText(liveThread, userName)}\n\nPost your reply as ${AGENT_NAMES[agentId]}:`,
            },
          ],
        });
        text = (reply || '').trim() || mockByAgent[agentId];
      } catch (agentErr) {
        console.error(`[fleet/user/${agentId}]`, agentErr.message);
        text = mockByAgent[agentId];
      }

      insertFleetMessage(loginId, {
        agentId,
        role: 'agent',
        content: text,
        eventType: 'user_message',
        sourceId: null,
      });
      liveThread.push({ role: 'agent', agent_id: agentId, content: text });
    }
  } catch (e) {
    console.error('[fleet/user]', e.message);
  } finally {
    activeDiscussions.delete(loginId);
  }
}

/**
 * User posts in fleet chat. Returns immediately; agents reply asynchronously.
 */
export function postFleetUserMessage(loginId, text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) {
    const err = new Error('message is required');
    err.status = 400;
    throw err;
  }
  if (activeDiscussions.has(loginId)) {
    const err = new Error('Fleet is still discussing. Try again in a moment.');
    err.status = 409;
    throw err;
  }

  const { lastInsertRowid } = insertFleetMessage(loginId, {
    agentId: null,
    role: 'user',
    content: trimmed.slice(0, 4000),
    eventType: 'user_message',
    sourceId: null,
  });

  setImmediate(() => {
    runFleetUserReply(loginId, trimmed).catch((e) => console.error('[fleet/user]', e.message));
  });

  return { id: Number(lastInsertRowid), accepted: true };
}

/** Fire-and-forget after a log endpoint succeeds. */
export function triggerFleetDiscussion(loginId, event) {
  setImmediate(() => {
    runFleetDiscussion(loginId, event).catch((e) => console.error('[fleet]', e.message));
  });
}

export function listFleetMessages(loginId, { limit = 80, sinceId = 0 } = {}) {
  const base = `SELECT f.id, f.agent_id, f.role, f.content, f.event_type, f.source_id, f.created_at,
              a.name AS agent_name, a.color AS agent_color
       FROM fleet_messages f
       LEFT JOIN agents a ON a.id = f.agent_id
       WHERE f.login_id = ?`;

  if (sinceId > 0) {
    return db
      .prepare(`${base} AND f.id > ? ORDER BY f.created_at ASC LIMIT ?`)
      .all(loginId, sinceId, limit);
  }

  const rows = db
    .prepare(`${base} ORDER BY f.created_at DESC LIMIT ?`)
    .all(loginId, limit);
  return rows.reverse();
}
