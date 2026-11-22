// Spaced review. Anything you get wrong (a lesson exercise or a puzzle)
// comes back after 1 day. Each first-try correct review pushes it to the next
// gap (3, then 7, then 21 days); after that it counts as learned and leaves
// the queue. A wrong answer sends it back to 1 day.
//
// progress.review = { [ref]: { box, due, misses, added, data? } }
//   ref  'u3-forks#2' for a course exercise, 'pz:<id>' for a puzzle
//   box  0..3 index into INTERVALS of the gap just scheduled
//   data puzzle snapshot for 'pz:' refs (fen, solution, rating, ...)
import { dayKey, addDays } from './streak.js';

export const INTERVALS = [1, 3, 7, 21];
export const SESSION_SIZE = 10;

export function ensureReview(p) {
  p.review = p.review || {};
  p.reviewStats = p.reviewStats || { done: 0, learned: 0 };
  // v2.1 stored a flat list of missed refs; fold it into the schedule.
  if (Array.isArray(p.missed)) {
    for (const m of p.missed) {
      if (!p.review[m.ref]) p.review[m.ref] = { box: 0, due: addDays(dayKey(new Date(m.at)), 1), misses: 1, added: dayKey(new Date(m.at)) };
    }
    delete p.missed;
    return true;
  }
  return false;
}

export function addMiss(p, ref, data) {
  ensureReview(p);
  const today = dayKey();
  const old = p.review[ref];
  p.review[ref] = { box: 0, due: addDays(today, 1), misses: (old?.misses || 0) + 1, added: old?.added || today, ...(data || old?.data ? { data: data || old.data } : {}) };
}

// Returns 'learned' | 'next' | 'reset'.
export function reviewResult(p, ref, firstTry) {
  ensureReview(p);
  const item = p.review[ref];
  if (!item) return null;
  const today = dayKey();
  p.reviewStats.done++;
  if (!firstTry) {
    item.box = 0;
    item.due = addDays(today, INTERVALS[0]);
    item.misses = (item.misses || 0) + 1;
    return 'reset';
  }
  if (item.box + 1 >= INTERVALS.length) {
    delete p.review[ref];
    p.reviewStats.learned++;
    return 'learned';
  }
  item.box++;
  item.due = addDays(today, INTERVALS[item.box]);
  return 'next';
}

export function reviewLists(p) {
  ensureReview(p);
  const today = dayKey();
  const all = Object.entries(p.review).map(([ref, it]) => ({ ref, ...it }));
  all.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : (b.misses || 0) - (a.misses || 0)));
  return { due: all.filter((x) => x.due <= today), upcoming: all.filter((x) => x.due > today) };
}

export function dueCount(p) {
  if (!p.review) return 0;
  const today = dayKey();
  return Object.values(p.review).filter((x) => x.due <= today).length;
}

export function stageLabel(item) {
  return `Step ${Math.min(item.box + 1, INTERVALS.length)} of ${INTERVALS.length}`;
}

export function dueLabel(item) {
  const today = dayKey();
  if (item.due <= today) return 'Due now';
  if (item.due === addDays(today, 1)) return 'Tomorrow';
  const toDate = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const days = Math.round((toDate(item.due) - toDate(today)) / 86400000);
  return `In ${days} days`;
}

// Turn a stored puzzle into a player exercise.
export function puzzleExercise(ref, puzzle) {
  const side = (puzzle.fen.split(' ')[1] === 'b') ? 'Black' : 'White';
  return {
    type: 'puzzle', ref, fen: puzzle.fen, solution: puzzle.solution,
    title: `Puzzle · ${puzzle.rating}`,
    prompt: `${side} to play. Find the best move${puzzle.solution.length > 2 ? 's' : ''}.`,
    good: (puzzle.themes || []).length ? `Solved. Theme: ${puzzle.themes.slice(0, 2).join(', ')}.` : 'Solved.',
    bad: 'Not the best move here. Look for checks, captures and threats first.',
  };
}
