// Playing habits, mined from your saved games (progress.games). Pure: no DOM.
//
// Each game row carries, once its review has finished:
//   summary = { acc, accOpp, n: {b,g,i,m,x}, phase: {o:[moves,lost], m:[..], e:[..]},
//               tags: { hang: 2, missedWin: 1, ... }, peak, low, moments: [...] }
// plus tm (seconds spent on each of your moves), plies, result, how, difficulty, color.
// Games whose review hasn't run (or failed) still count for results and openings.

export const LEVELS = ['beginner', 'easy', 'intermediate', 'advanced', 'hard', 'expert'];
const LEVEL_NAME = { beginner: 'Beginner', easy: 'Easy', intermediate: 'Intermediate', advanced: 'Advanced', hard: 'Hard', expert: 'Expert' };
const PHASE_NAME = { o: 'the opening', m: 'the middlegame', e: 'the endgame' };

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

export function buildInsights(allGames) {
  const games = (allGames || []).filter((g) => g && g.mode !== 'pvp').sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
  const reviewed = games.filter((g) => g.summary && g.summary.acc != null);
  const out = {
    games: games.length, reviewed: reviewed.length,
    record: { w: 0, d: 0, l: 0 },
    avgAcc: null, recentAcc: null, olderAcc: null,
    phases: { o: { moves: 0, lost: 0 }, m: { moves: 0, lost: 0 }, e: { moves: 0, lost: 0 } },
    tags: {}, tagGames: {},
    counts: { b: 0, g: 0, i: 0, m: 0, x: 0 },
    speed: null, byLevel: [], openings: [], suggestions: [], accSeries: [],
  };
  for (const g of games) {
    if (g.result === 'win') out.record.w++; else if (g.result === 'draw') out.record.d++; else if (g.result === 'loss') out.record.l++;
  }

  for (const g of reviewed) {
    const s = g.summary;
    for (const k of Object.keys(out.counts)) out.counts[k] += (s.n && s.n[k]) || 0;
    for (const ph of ['o', 'm', 'e']) {
      const p = s.phase && s.phase[ph];
      if (p) { out.phases[ph].moves += p[0]; out.phases[ph].lost += p[1]; }
    }
    for (const [t, n] of Object.entries(s.tags || {})) { out.tags[t] = (out.tags[t] || 0) + n; out.tagGames[t] = (out.tagGames[t] || 0) + 1; }
  }
  out.avgAcc = reviewed.length ? Math.round(avg(reviewed.map((g) => g.summary.acc))) : null;
  out.accSeries = reviewed.slice(0, 20).reverse().map((g) => g.summary.acc);
  if (reviewed.length >= 6) {
    out.recentAcc = Math.round(avg(reviewed.slice(0, 3).map((g) => g.summary.acc)));
    out.olderAcc = Math.round(avg(reviewed.slice(3, 9).map((g) => g.summary.acc)));
  }

  // Thinking time: do quick moves cost you more?
  const fast = { n: 0, bad: 0 }, slow = { n: 0, bad: 0 };
  let secs = [];
  for (const g of reviewed) {
    const flagged = new Set((g.summary.moments || []).map((m) => m.ply));
    (g.tm || []).forEach((t, k) => {
      const ply = g.color === 'w' ? k * 2 : k * 2 + 1;
      const bad = flagged.has(ply);
      const bucket = t < 3 ? fast : slow;
      bucket.n++; if (bad) bucket.bad++;
      secs.push(t);
    });
  }
  if (secs.length >= 20) out.speed = { avg: Math.round(avg(secs)), fastShare: pct(fast.n, fast.n + slow.n), fastRate: fast.n ? fast.bad / fast.n : 0, slowRate: slow.n ? slow.bad / slow.n : 0, fastN: fast.n, slowN: slow.n };

  // By level and openings.
  for (const lv of LEVELS) {
    const gs = games.filter((g) => g.difficulty === lv);
    if (gs.length) out.byLevel.push({ level: lv, name: LEVEL_NAME[lv], n: gs.length, w: gs.filter((g) => g.result === 'win').length, d: gs.filter((g) => g.result === 'draw').length, l: gs.filter((g) => g.result === 'loss').length });
  }
  const opening = new Map();
  for (const g of games) {
    if (!g.open) continue;
    const key = `${g.color === 'w' ? 'As White' : 'As Black'}: ${g.open}`;
    const o = opening.get(key) || { name: key, n: 0, w: 0 };
    o.n++; if (g.result === 'win') o.w++;
    opening.set(key, o);
  }
  out.openings = [...opening.values()].sort((a, b) => b.n - a.n).slice(0, 4);

  out.suggestions = suggest(out, games, reviewed);
  return out;
}

function suggest(o, games, reviewed) {
  const list = [];
  const add = (id, tone, title, body, weight) => list.push({ id, tone, title, body, weight });
  const n = reviewed.length;
  const nextLevel = (lv) => LEVELS[Math.min(LEVELS.length - 1, LEVELS.indexOf(lv) + 1)];
  const prevLevel = (lv) => LEVELS[Math.max(0, LEVELS.indexOf(lv) - 1)];

  if (games.length < 3) {
    add('few', 'info', 'Play a few more games', 'Your habits show up after about three games against the computer. Each finished game is reviewed automatically, so just play and check back.', 100);
    return list;
  }
  if (n < 3) add('wait', 'info', 'Reviews are still coming in', 'Only some of your games have been analysed so far. Tips get sharper after three reviewed games.', 90);

  // Where the points go.
  const ph = Object.entries(o.phases).filter(([, v]) => v.moves >= 12).map(([k, v]) => ({ k, rate: v.lost / v.moves }));
  if (ph.length >= 2) {
    ph.sort((a, b) => b.rate - a.rate);
    const worst = ph[0], best = ph[ph.length - 1];
    if (worst.rate >= 3 && worst.rate >= best.rate * 1.5) {
      const tips = {
        o: 'Stick to a simple plan: control the centre, develop every knight and bishop, castle early, and avoid moving the same piece twice.',
        m: 'Before each move ask two questions: what is my opponent threatening, and what can I attack? Look at every check, capture and threat.',
        e: 'Activate your king, push passed pawns and trade into positions you know. Practise the Endgame basics in Learn.',
      };
      add('phase', 'tip', `You lose the most ground in ${PHASE_NAME[worst.k]}`, `${tips[worst.k]}`, 80);
    }
  }

  // Habits by type.
  const rate = (t) => (n ? (o.tagGames[t] || 0) / n : 0);
  if (n >= 3 && rate('hang') >= 0.3) add('hang', 'tip', 'You leave pieces undefended', `In ${o.tagGames.hang} of ${n} reviewed games a piece was left hanging or captured for free. Before you let go of a piece, check what your opponent can take afterwards. If a piece has no defender, move it or protect it.`, 95);
  if (n >= 3 && (rate('missedWin') >= 0.3 || rate('missedFork') >= 0.2)) add('missed', 'tip', 'You miss chances to win material', `Free captures or forks were available in ${Math.max(o.tagGames.missedWin || 0, o.tagGames.missedFork || 0)} of ${n} games and went unplayed. Habit: first look at every check, capture and threat for both sides. Then pick your move.`, 85);
  if ((o.tags.allowedMate || 0) + (o.tags.missedMate || 0) >= 1) add('mate', 'tip', 'Watch for checkmate, yours and theirs', `A mate was ${o.tags.allowedMate ? 'allowed' : 'missed'} in your recent games. Keep the king's escape squares in mind, and always ask whether your opponent has a check that leads somewhere.`, 88);
  if (n >= 3 && rate('throw') >= 0.25) add('throw', 'tip', 'Finish the games you are winning', `You were clearly ahead in ${o.tagGames.throw} of ${n} games and let it slip. When ahead: trade pieces, keep your king safe, and take the simplest path. You don't need the flashiest move.`, 84);

  // Speed.
  if (o.speed && o.speed.fastShare >= 35 && o.speed.fastRate >= Math.max(0.12, o.speed.slowRate * 1.5)) {
    add('fast', 'tip', 'Slow down on quick moves', `${o.speed.fastShare}% of your moves take under 3 seconds, and those are ${(o.speed.fastRate / Math.max(o.speed.slowRate, 0.01)).toFixed(1)}× as likely to be mistakes (${Math.round(o.speed.fastRate * 100)}% vs ${Math.round(o.speed.slowRate * 100)}%). Take one breath and run the check: what does this move allow?`, 82);
  }

  // Resigning.
  const losses = games.filter((g) => g.result === 'loss');
  const early = losses.filter((g) => g.how === 'resign' && (g.plies || 99) < 30);
  if (losses.length >= 3 && early.length / losses.length >= 0.4) add('resign', 'tip', 'Play on instead of resigning', `${early.length} of your ${losses.length} losses were early resignations. Computers at low levels blunder a lot, so a "lost" position is often still alive. Playing on is the fastest way to learn.`, 70);

  // Level.
  const last = games.slice(0, 8);
  const lvl = last[0] && last[0].difficulty;
  const atLvl = last.filter((g) => g.difficulty === lvl);
  if (lvl && atLvl.length >= 5) {
    const wins = atLvl.filter((g) => g.result === 'win').length;
    if (wins / atLvl.length >= 0.75 && lvl !== 'expert') add('up', 'good', `Ready for ${LEVEL_NAME[nextLevel(lvl)]}`, `You won ${wins} of your last ${atLvl.length} games on ${LEVEL_NAME[lvl]}. Time to try ${LEVEL_NAME[nextLevel(lvl)]}.`, 75);
    else if (wins / atLvl.length <= 0.12 && lvl !== 'beginner') add('down', 'info', `Try ${LEVEL_NAME[prevLevel(lvl)]} for a few games`, `You won ${wins} of your last ${atLvl.length} on ${LEVEL_NAME[lvl]}. A step down lets you practise your plans without getting overrun.`, 60);
  }

  // Positives.
  if (o.recentAcc != null && o.olderAcc != null && o.recentAcc - o.olderAcc >= 4) add('up-acc', 'good', 'Your accuracy is climbing', `Your last three games average ${o.recentAcc}% accuracy, up from ${o.olderAcc}% before. Keep doing what you're doing.`, 50);
  if (n >= 3 && o.counts.x === 0) add('clean', 'good', 'No blunders in your reviewed games', 'That is a strong habit. Now work on turning "good" moves into the best ones.', 45);
  const lastRev = reviewed[0];
  if (lastRev && lastRev.summary.acc >= 90) add('last', 'good', 'Last game: ' + lastRev.summary.acc + '% accuracy', 'A clean game. Open its review to see where the engine agreed with you.', 40);

  if (!list.length) add('ok', 'info', 'No clear weak spot yet', 'Your reviewed games show no repeated problem. Keep playing: patterns appear as the games add up.', 10);
  return list.sort((a, b) => b.weight - a.weight).slice(0, 5);
}

// Compact summary saved on the game row once its review is done.
export function summariseReview(review, color, { opponent = true } = {}) {
  const me = review[color];
  const them = review[color === 'w' ? 'b' : 'w'];
  const mine = review.plies.filter((p) => p.color === color);
  const winOf = (score) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, score)))) - 1);
  const wins = mine.map((p) => winOf(color === 'w' ? p.scoreBefore : -p.scoreBefore));
  return {
    acc: me.acc, accOpp: opponent ? them.acc : null,
    n: me.n, phase: me.phase, tags: me.tags,
    peak: wins.length ? Math.round(Math.max(...wins)) : null,
    low: wins.length ? Math.round(Math.min(...wins)) : null,
    cls: review.cls,
    moments: mine.filter((p) => p.text).map((p) => ({
      ply: p.ply, g: p.grade, san: p.san, bestUci: p.bestUci, bestSan: p.bestSan, text: p.text, better: p.better,
      ev: [p.evBefore, p.evAfter], tags: p.tags,
    })),
  };
}
