// Fleet group chat — agents reply in sequence after user logs activity.

import db from '../db/database.js';
import { callAI, hasApiKey } from './ai.js';

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

function buildThreadText(thread) {
  if (!thread.length) return '(no messages yet)';
  return thread
    .map((m) => {
      if (m.role === 'system') return `[system] ${m.content}`;
      return `[${AGENT_NAMES[m.agent_id] || m.agent_id}] ${m.content}`;
    })
    .join('\n');
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

    for (const agentId of agents) {
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

      const text = (reply || '').trim() || '…';
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
    insertFleetMessage(loginId, {
      agentId: 'sage',
      role: 'agent',
      content: 'Fleet sync hiccup — your log is saved. Try again in a moment.',
      eventType: event.type,
      sourceId: null,
    });
  } finally {
    activeDiscussions.delete(loginId);
  }
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
