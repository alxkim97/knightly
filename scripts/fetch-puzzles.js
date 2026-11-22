// One-off data-generation script: slowly, politely samples puzzles from
// Lichess's public puzzle API (CC0-licensed data) across difficulty bands,
// writing progress incrementally so partial runs aren't lost. Designed to
// stay well under any anonymous rate limit (one request every ~5-8s, with
// exponential backoff on 429) rather than bursting requests.
const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');

const OUT_PATH = path.join(__dirname, '..', 'public', 'data', 'puzzles.json');
const PER_TIER = 20;
const TIERS = [
  { difficulty: 'easiest', level: 'beginner' },
  { difficulty: 'easier', level: 'easy' },
  { difficulty: 'normal', level: 'intermediate' },
  { difficulty: 'harder', level: 'advanced' },
  { difficulty: 'hardest', level: 'hard' },
];
const MAX_RUNTIME_MS = 18 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (base) => base + Math.random() * 2000;

function fenFromPgnPrefix(pgn, initialPly) {
  const tokens = pgn.split(' ').filter(Boolean);
  const game = new Chess();
  for (let i = 0; i <= initialPly; i++) {
    if (!tokens[i]) break;
    game.move(tokens[i]);
  }
  return game.fen();
}

function loadExisting() {
  try {
    return JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function save(puzzles) {
  fs.writeFileSync(OUT_PATH, JSON.stringify(puzzles, null, 2), 'utf8');
}

async function fetchOne(difficulty) {
  const res = await fetch(`https://lichess.org/api/puzzle/next?angle=mix&difficulty=${difficulty}`);
  if (res.status === 429) return { rateLimited: true };
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return { data: await res.json() };
}

async function main() {
  const startedAt = Date.now();
  const puzzles = loadExisting();
  const seen = new Set(puzzles.map((p) => p.id));
  let backoff = 30000;

  for (const tier of TIERS) {
    let count = puzzles.filter((p) => p.level === tier.level).length;
    while (count < PER_TIER) {
      if (Date.now() - startedAt > MAX_RUNTIME_MS) {
        console.log('\nMax runtime reached, stopping.');
        save(puzzles);
        return;
      }
      let outcome;
      try {
        outcome = await fetchOne(tier.difficulty);
      } catch (err) {
        console.log(`\n  network error: ${err.message}`);
        await sleep(jitter(backoff));
        continue;
      }
      if (outcome.rateLimited) {
        process.stdout.write(`\n  429, backing off ${Math.round(backoff / 1000)}s...`);
        await sleep(jitter(backoff));
        backoff = Math.min(backoff * 1.5, 5 * 60 * 1000);
        continue;
      }
      backoff = 30000;
      const p = outcome.data.puzzle;
      if (!seen.has(p.id)) {
        seen.add(p.id);
        const fen = p.fen || fenFromPgnPrefix(outcome.data.game.pgn, p.initialPly);
        puzzles.push({ id: p.id, level: tier.level, rating: p.rating, themes: p.themes, fen, solution: p.solution });
        count++;
        save(puzzles);
        process.stdout.write(`\r${tier.level}: ${count}/${PER_TIER}      `);
      }
      await sleep(jitter(5000));
    }
    console.log('');
  }
  console.log(`\nDone. Total puzzles: ${puzzles.length}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
