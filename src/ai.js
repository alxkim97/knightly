const DIFFICULTY_PRESETS = [
  { key: 'beginner', label: 'Beginner', desc: '~400 Elo — makes frequent mistakes', randomMoveChance: 0.55, skill: 0, moveTimeMs: 50 },
  { key: 'easy', label: 'Easy', desc: '~700 Elo — knows the basics', randomMoveChance: 0.3, skill: 2, moveTimeMs: 120 },
  { key: 'intermediate', label: 'Intermediate', desc: '~1300 Elo — club player', randomMoveChance: 0, useElo: 1320, moveTimeMs: 500 },
  { key: 'advanced', label: 'Advanced', desc: '~1700 Elo — strong club player', randomMoveChance: 0, useElo: 1700, moveTimeMs: 900 },
  { key: 'hard', label: 'Hard', desc: '~2100 Elo — expert level', randomMoveChance: 0, useElo: 2100, moveTimeMs: 1300 },
  { key: 'expert', label: 'Expert', desc: 'Full strength — good luck', randomMoveChance: 0, skill: 20, moveTimeMs: 1800, full: true },
];

class StockfishAI {
  constructor() {
    this.worker = null;
    this.ready = null;
    this.pending = null;
  }

  init() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      try {
        this.worker = new Worker('src/vendor/stockfish/stockfish-nnue-16-single.js');
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
