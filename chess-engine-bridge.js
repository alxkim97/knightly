// Shared by preload.js and preload-mini.js so the two chess.js-backed
// engine bridges (main window vs. pop-out mini board) can't drift apart.
const { Chess } = require('chess.js');

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

function createGameStore() {
  const games = new Map();

  function getGame(id) {
    if (!games.has(id)) games.set(id, new Chess());
    return games.get(id);
  }

  return {
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
}

module.exports = { createGameStore };
