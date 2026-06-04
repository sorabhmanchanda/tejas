// SQLite stores CURRENT_TIMESTAMP in UTC. Compare calendar days in local time.

/** True when `column` falls on the user's local calendar day (today). */
export function isLocalToday(column) {
  return `date(${column}, 'localtime') = date('now', 'localtime')`;
}

/** True when `column` falls on yesterday (local). */
export function isLocalYesterday(column) {
  return `date(${column}, 'localtime') = date('now', '-1 day', 'localtime')`;
}
