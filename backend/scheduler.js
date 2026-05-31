// =============================================
// Cron-driven agent ticks + daily briefing rhythm.
// Lightweight: ticks just stamp last_tick and consolidate episodes.
// Heavy LLM work (briefing) is generated on demand by the API too.
// =============================================

import cron from 'node-cron';
import db from './db/database.js';

function tickAgents() {
  const now = new Date().toISOString();
  const agents = db.prepare('SELECT id, tick_ms, last_tick FROM agents').all();
  for (const a of agents) {
    const last = a.last_tick ? new Date(a.last_tick.replace(' ', 'T')).getTime() : 0;
    if (Date.now() - last >= a.tick_ms) {
      db.prepare('UPDATE agents SET last_tick = ?, status = ? WHERE id = ?').run(now, 'active', a.id);
    }
  }
}

// Deep sleep: consolidate old unconsolidated episodes into a rolled-up entity.
function deepSleep() {
  const now = new Date().toISOString();
  const agents = db.prepare('SELECT id, sleep_hours FROM agents').all();
  for (const a of agents) {
    const unconsolidated = db
      .prepare('SELECT COUNT(*) AS c FROM episodes WHERE agent_id = ? AND consolidated = 0')
      .get(a.id).c;
    if (unconsolidated >= 5) {
      db.prepare(
        `INSERT INTO entities (agent_id, name, type, summary)
         VALUES (?, ?, 'pattern', ?)`
      ).run(
        a.id,
        `Daily roll-up ${new Date().toLocaleDateString('en-IN')}`,
        `Consolidated ${unconsolidated} episodes during deep sleep.`
      );
      db.prepare('UPDATE episodes SET consolidated = 1 WHERE agent_id = ? AND consolidated = 0').run(a.id);
    }
    db.prepare('UPDATE agents SET last_sleep = ? WHERE id = ?').run(now, a.id);
  }
}

export function startScheduler() {
  // Tick every 5 minutes; each agent self-gates on its own interval.
  cron.schedule('*/5 * * * *', tickAgents);
  // Nightly consolidation at 3am local.
  cron.schedule('0 3 * * *', deepSleep);

  // Stamp an initial tick so cards don't look stale on first boot.
  tickAgents();
  console.log('[scheduler] agent ticks + nightly deep sleep scheduled');
}
