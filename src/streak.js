// Streak, daily goal and per-day XP. All dates are the user's local calendar
// day ("YYYY-MM-DD"), so a late-night lesson counts for the day you think it does.
//
// Streak rules (shown in Settings):
//   - A day counts when you finish a lesson, or solve 10 puzzles.
//   - Miss one day and a streak freeze covers it automatically, once per week.
//   - Practice is unlimited; nothing is ever locked behind lives.

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}
// Monday of the key's week, used to allow one freeze per week.
function weekKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const offset = (date.getDay() + 6) % 7;
  return dayKey(new Date(y, m - 1, d - offset));
}

export const PUZZLES_FOR_STREAK = 10;

function ensure(p) {
  p.streak = p.streak || { current: 0, best: 0, last: null, frozenDays: [] };
  p.streakDays = p.streakDays || [];
  p.days = p.days || {};
  return p.streak;
}

// The streak is never stored on its own: it is worked out from the set of
// days you were active, so every synced device gets the same answer.
// Walking back from today (or yesterday, if today isn't done yet), a single
// missed day between two active days is covered by a freeze, once per week.
export function computeStreak(activeDays, today = dayKey(), bestBase = 0) {
  const active = new Set(activeDays);
  let d = active.has(today) ? today : addDays(today, -1);
  let current = 0, last = null;
  const frozenDays = [];
  const usedWeeks = new Set();
  for (let guard = 0; guard < 5000; guard++) {
    if (active.has(d)) { current++; if (!last) last = d; d = addDays(d, -1); continue; }
    const prev = addDays(d, -1);
    if (active.has(prev) && !usedWeeks.has(weekKey(d))) { usedWeeks.add(weekKey(d)); frozenDays.push(d); d = prev; continue; }
    break;
  }
  if (!current) frozenDays.length = 0;
  let best = Math.max(bestBase || 0, current), run = 0, prevDay = null, used = new Set();
  for (const day of [...active].sort()) {
    if (prevDay && day === addDays(prevDay, 1)) run++;
    else if (prevDay && day === addDays(prevDay, 2) && !used.has(weekKey(addDays(prevDay, 1)))) { used.add(weekKey(addDays(prevDay, 1))); run++; }
    else { run = 1; used = new Set(); }
    best = Math.max(best, run);
    prevDay = day;
  }
  return { current, best, last: last || [...active].sort().pop() || null, frozenDays };
}

// Bring p.streak up to date with today. Returns true if it changed.
export function normalizeStreak(p) {
  const s = ensure(p);
  const next = computeStreak(p.streakDays, dayKey(), s.best);
  const changed = JSON.stringify(next) !== JSON.stringify({ current: s.current, best: s.best, last: s.last, frozenDays: s.frozenDays });
  p.streak = next;
  return changed;
}

// Count today toward the streak. Returns true the first time per day.
export function markStreakDay(p) {
  ensure(p);
  const today = dayKey();
  if (p.streakDays.includes(today)) return false;
  p.streakDays.push(today);
  p.streakDays.sort();
  normalizeStreak(p);
  return true;
}

export function addDayXp(p, amount) {
  ensure(p);
  const k = dayKey();
  p.days[k] = (p.days[k] || 0) + amount;
  const cutoff = addDays(k, -60);
  for (const key of Object.keys(p.days)) if (key < cutoff) delete p.days[key];
}

export function todayXp(p) { return (p.days || {})[dayKey()] || 0; }

export function streakDoneToday(p) { return (p.streakDays || []).includes(dayKey()); }

// Mon..Sun of the current week with state per day.
export function weekStrip(p) {
  ensure(p);
  const today = dayKey();
  const monday = weekKey(today);
  return ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, i) => {
    const key = addDays(monday, i);
    return {
      key, label,
      hit: p.streakDays.includes(key),
      frozen: (p.streak.frozenDays || []).includes(key),
      today: key === today,
      future: key > today,
      xp: p.days[key] || 0,
    };
  });
}
