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
  p.streak = p.streak || { current: 0, best: 0, last: null, freezeWeek: null };
  p.streakDays = p.streakDays || [];
  p.days = p.days || {};
  return p.streak;
}

// Bring the streak up to date with today. Returns true if anything changed
// (a freeze was used or the streak broke) so the caller can save.
export function normalizeStreak(p) {
  const s = ensure(p);
  const today = dayKey();
  if (!s.last || !s.current) return false;
  if (s.last === today || s.last === addDays(today, -1)) return false;
  if (s.last === addDays(today, -2) && s.freezeWeek !== weekKey(today)) {
    s.freezeWeek = weekKey(today);
    s.frozen = addDays(today, -1);
    s.last = addDays(today, -1);
    return true;
  }
  s.current = 0;
  return true;
}

// Count today toward the streak. Returns true the first time per day.
export function markStreakDay(p) {
  normalizeStreak(p);
  const s = p.streak;
  const today = dayKey();
  if (s.last === today) return false;
  s.current = s.last === addDays(today, -1) ? (s.current || 0) + 1 : 1;
  s.best = Math.max(s.best || 0, s.current);
  s.last = today;
  if (!p.streakDays.includes(today)) p.streakDays.push(today);
  p.streakDays = p.streakDays.slice(-60);
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

export function streakDoneToday(p) { return !!p.streak && p.streak.last === dayKey(); }

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
      frozen: p.streak.frozen === key,
      today: key === today,
      future: key > today,
      xp: p.days[key] || 0,
    };
  });
}
