import db from '../db/database.js';

const r = db
  .prepare(
    `DELETE FROM chat_messages
     WHERE content LIKE '%is offline%'
        OR content LIKE '%ANTHROPIC%'
        OR content LIKE '%set GEMINI_API_KEY%'`
  )
  .run();
console.log(`Cleared ${r.changes} stale chat message(s).`);
