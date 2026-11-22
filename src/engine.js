// chess.js-backed game store. v1 ran this inside Electron's preload (so the
// page could `require` chess.js); now it's an ordinary module, which is what
// lets the same code run on the web. Several boards can be live at once
// (game, review, puzzle, lesson, previews), each under its own id.
import { Chess } from 'chess.js';

function serialize(game) {
  return {
    fen: game.fen(),
    turn: game.turn(),
    history: game.history({ verbose: true }),
    isCheck: game.isCheck(),
    isCheckmate: game.isCheckmate(),
    isStalemate: game.isStalemate(),
    isDraw: game.isDraw(),
    isGameOver: game.isGameOver(),
    legalMoves: game.moves({ verbose: true }),
    board: game.board(),
  };
}

const games = new Map();
function getGame(id) {
  if (!games.has(id)) games.set(id, new Chess());
  return games.get(id);
}

export const engine = {
  reset(id, fen) {
    const game = getGame(id);
    try {
      if (fen) game.load(fen); else game.reset();
    } catch {
      game.reset();
    }
    return serialize(game);
  },
  state(id) {
    return serialize(getGame(id));
  },
  move(id, moveObj) {
    const game = getGame(id);
    try {
      const result = game.move(moveObj);
      return result ? serialize(game) : null;
    } catch {
      return null;
    }
  },
  undo(id) {
    const game = getGame(id);
    game.undo();
    return serialize(game);
  },
  destroy(id) {
    games.delete(id);
  },
};

// Static board read from a FEN without touching the store — for thumbnails.
export function boardFromFen(fen) {
  try { return new Chess(fen).board(); } catch { return new Chess().board(); }
}
