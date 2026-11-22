export const DIFFICULTY_PRESETS = [
  { key: 'beginner', label: 'Beginner', desc: '~400 Elo — makes frequent mistakes', randomMoveChance: 0.55, skill: 0, moveTimeMs: 50 },
  { key: 'easy', label: 'Easy', desc: '~700 Elo — knows the basics', randomMoveChance: 0.3, skill: 2, moveTimeMs: 120 },
  { key: 'intermediate', label: 'Intermediate', desc: '~1300 Elo — club player', randomMoveChance: 0, useElo: 1320, moveTimeMs: 500 },
  { key: 'advanced', label: 'Advanced', desc: '~1700 Elo — strong club player', randomMoveChance: 0, useElo: 1700, moveTimeMs: 900 },
  { key: 'hard', label: 'Hard', desc: '~2100 Elo — expert level', randomMoveChance: 0, useElo: 2100, moveTimeMs: 1300 },
  { key: 'expert', label: 'Expert', desc: 'Full strength — good luck', randomMoveChance: 0, skill: 20, moveTimeMs: 1800, full: true },
];

export class StockfishAI {
  constructor() {
    this.worker = null;
    this.ready = null;
    this.pending = null;
  }

  init() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      try {
        this.worker = new Worker('stockfish/stockfish-nnue-16-single.js');
      } catch (err) {
        reject(err);
        return;
      }
      const onReady = (e) => {
        if (e.data === 'uciok') {
          this.worker.removeEventListener('message', onReady);
          resolve();
        }
      };
      this.worker.addEventListener('message', onReady);
      this.worker.postMessage('uci');
    });
    return this.ready;
  }

  async setDifficulty(presetKey) {
    await this.init();
    const preset = DIFFICULTY_PRESETS.find((p) => p.key === presetKey) || DIFFICULTY_PRESETS[2];
    this.preset = preset;
    this.worker.postMessage('setoption name UCI_LimitStrength value ' + (preset.useElo ? 'true' : 'false'));
    if (preset.useElo) {
      this.worker.postMessage('setoption name UCI_Elo value ' + preset.useElo);
    } else {
      this.worker.postMessage('setoption name Skill Level value ' + preset.skill);
    }
  }

  // Full strength, for analysis and hints.
  async setFullStrength() {
    await this.init();
    this.worker.postMessage('setoption name UCI_LimitStrength value false');
    this.worker.postMessage('setoption name Skill Level value 20');
  }

  // Score a position. cp/mate are from the side to move's point of view.
  analyse(fen, ms = 220) {
    return new Promise((resolve) => {
      let last = { cp: 0, mate: null, pv: [] };
      const listener = (e) => {
        const line = e.data;
        if (typeof line !== 'string') return;
        if (line.startsWith('info') && line.includes(' score ') && line.includes(' pv ') && !/(lowerbound|upperbound)/.test(line)) {
          const mate = line.match(/score mate (-?\d+)/);
          const cp = line.match(/score cp (-?\d+)/);
          last = { cp: cp ? Number(cp[1]) : 0, mate: mate ? Number(mate[1]) : null, pv: line.split(' pv ')[1].trim().split(/\s+/) };
        } else if (line.startsWith('bestmove')) {
          this.worker.removeEventListener('message', listener);
          const best = line.split(' ')[1];
          resolve({ ...last, best: best && best !== '(none)' ? best : null });
        }
      };
      this.worker.addEventListener('message', listener);
      this.worker.postMessage('position fen ' + fen);
      this.worker.postMessage('go movetime ' + ms);
    });
  }

  getBestMove(fen) {
    return new Promise((resolve) => {
      const preset = this.preset || DIFFICULTY_PRESETS[2];
      const listener = (e) => {
        const line = e.data;
        if (typeof line === 'string' && line.startsWith('bestmove')) {
          this.worker.removeEventListener('message', listener);
          const move = line.split(' ')[1];
          resolve(move === '(none)' ? null : move);
        }
      };
      this.worker.addEventListener('message', listener);
      this.worker.postMessage('position fen ' + fen);
      const ms = Math.max(20, preset.moveTimeMs);
      this.worker.postMessage('go movetime ' + ms);
    });
  }

  async pickMove(fen, legalMoves) {
    const preset = this.preset || DIFFICULTY_PRESETS[2];
    if (preset.randomMoveChance && Math.random() < preset.randomMoveChance && legalMoves.length) {
      const m = legalMoves[Math.floor(Math.random() * legalMoves.length)];
      return { from: m.from, to: m.to, promotion: m.promotion ? 'q' : undefined };
    }
    const uci = await this.getBestMove(fen);
    if (!uci) return null;
    return {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
    };
  }

  terminate() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.ready = null;
  }
}

// How long the computer "thinks" before it moves, so it feels like a person:
// quick and impulsive at the low levels, slower and more deliberate higher up,
// always varied, and shorter when the move is obvious (a recapture, a forced
// reply, the first few opening moves).
const THINK_MS = {
  beginner: [350, 1400], easy: [450, 1900], intermediate: [650, 2800],
  advanced: [900, 3600], hard: [1100, 4400], expert: [1300, 5200],
};
export function thinkDelay(key, { plies = 0, legalCount = 20, recapture = false } = {}) {
  const [lo, hi] = THINK_MS[key] || THINK_MS.intermediate;
  if (legalCount <= 1) return 200 + Math.random() * 250;
  let t = lo + (hi - lo) * Math.pow(Math.random(), 1.7); // most replies are on the quicker side, a few are long
  if (plies < 8) t *= 0.55;
  if (recapture) t *= 0.65;
  if (legalCount > 35) t *= 1.2;
  return Math.round(t);
}
