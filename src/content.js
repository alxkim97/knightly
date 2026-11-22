// Lesson + puzzle data access. Files live in public/data so web and desktop
// fetch them the same way (relative URL works from '/' and from file://).
import { Chess } from 'chess.js';

// ── Lessons ─────────────────────────────────────────────
let lessonCache = null;
export async function loadLessons() {
  if (lessonCache) return lessonCache;
  const res = await fetch('data/lessons.json');
  lessonCache = await res.json();
  return lessonCache;
}

export const CATEGORIES = ['opening', 'midgame', 'endgame'];
export const CATEGORY_LABEL = { opening: 'Openings', midgame: 'Midgame', endgame: 'Endgame' };
export const CATEGORY_DESC = {
  opening: 'The ideas behind well-known openings, one move at a time.',
  midgame: 'Core principles for the phase where most games are decided.',
  endgame: 'Checkmating and technique patterns every player needs.',
};
export const CATEGORY_PIECE = { opening: 'p', midgame: 'n', endgame: 'k' };

export function firstIncomplete(lessons, completed) {
  return lessons.find((l) => !completed.has(l.id)) || null;
}

// ── Puzzles ─────────────────────────────────────────────
let puzzleCache = null;
export async function loadPuzzleBank() {
  if (puzzleCache) return puzzleCache;
  const res = await fetch('data/puzzles.json');
  puzzleCache = await res.json();
  return puzzleCache;
}

export function ratingToLevel(rating) {
  if (rating < 1100) return 'beginner';
  if (rating < 1500) return 'easy';
  if (rating < 1900) return 'intermediate';
  if (rating < 2300) return 'advanced';
  return 'hard';
}
export const LEVELS = ['beginner', 'easy', 'intermediate', 'advanced', 'hard'];
export const LEVEL_LABEL = { beginner: 'Beginner', easy: 'Easy', intermediate: 'Intermediate', advanced: 'Advanced', hard: 'Hard' };

function dateSeedIndex(dateStr, length) {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) hash = (hash * 31 + dateStr.charCodeAt(i)) >>> 0;
  return hash % length;
}

// Lichess's daily puzzle comes as { game: { pgn }, puzzle: { initialPly,
// solution, ... } } with no FEN. The puzzle position is the game after
// initialPly + 1 half-moves; we rebuild it and only trust it if the first
// solution move is legal there.
function lichessToPuzzle(data, todayStr) {
  const p = data.puzzle;
  if (p.fen) return { fen: p.fen };
  const full = new Chess();
  full.loadPgn(data.game.pgn);
  const moves = full.history();
  for (const plies of [p.initialPly + 1, p.initialPly]) {
    const g = new Chess();
    for (const san of moves.slice(0, plies)) g.move(san);
    const uci = p.solution[0];
    try {
      if (g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })) {
        g.undo();
        return { fen: g.fen() };
      }
    } catch { /* not legal here, try the other offset */ }
  }
  throw new Error('daily puzzle position did not check out');
}

const DAILY_KEY = 'knightly_daily_puzzle';
let dailyPromise = null;
export function getDailyPuzzle() {
  if (dailyPromise) return dailyPromise;
  dailyPromise = (async () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    try {
      const cached = JSON.parse(localStorage.getItem(DAILY_KEY) || 'null');
      if (cached && cached.date === todayStr) return cached;
    } catch { /* ignore */ }
    try {
      const res = await fetch('https://lichess.org/api/puzzle/daily');
      if (res.ok) {
        const data = await res.json();
        const { fen } = lichessToPuzzle(data, todayStr);
        const puzzle = {
          id: 'daily-' + data.puzzle.id,
          level: ratingToLevel(data.puzzle.rating),
          rating: data.puzzle.rating,
          themes: data.puzzle.themes,
          fen,
          solution: data.puzzle.solution,
          date: todayStr,
          daily: true,
        };
        try { localStorage.setItem(DAILY_KEY, JSON.stringify(puzzle)); } catch { /* ignore */ }
        return puzzle;
      }
    } catch { /* offline or unexpected shape: fall back to the local bank */ }
    const bank = await loadPuzzleBank();
    return { ...bank[dateSeedIndex(todayStr, bank.length)], date: todayStr, daily: true };
  })();
  return dailyPromise;
}

export function sideToMove(fen) {
  return (fen || '').split(' ')[1] === 'b' ? 'b' : 'w';
}
