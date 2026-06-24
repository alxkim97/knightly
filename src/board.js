class ChessBoard {
  constructor(container, opts = {}) {
    this.container = container;
    this.interactive = opts.interactive !== false;
    this.onUserMove = opts.onUserMove || (() => {});
    this.flipped = !!opts.flipped;
    this.selected = null;
    this.legalTargets = [];
    this.lastMove = null;
    this.state = null;
    this.suggestion = null;

    this.boardEl = el('div', 'board');
    this.container.innerHTML = '';
    this.container.appendChild(this.boardEl);
    this.squareEls = {};
    this._buildSquares();
  }

  _orderedSquares() {
    const rows = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const rank = 8 - row;
        const file = FILES[col];
        rows.push({ square: file + rank, row, col });
      }
    }
    return rows;
  }

  _buildSquares() {
    this.boardEl.innerHTML = '';
    const squares = this._orderedSquares();
    const display = this.flipped ? [...squares].reverse() : squares;
    for (const { square, row, col } of display) {
      const sq = el('div', 'square');
      const isLight = (row + col) % 2 === 0;
      sq.classList.add(isLight ? 'light' : 'dark');
      sq.dataset.square = square;
      if (col === 0 || (this.flipped && col === 7)) {
        sq.appendChild(el('span', 'coord-rank', square[1]));
      }
      if (row === 7 || (this.flipped && row === 0)) {
        sq.appendChild(el('span', 'coord-file', square[0]));
      }
      sq.addEventListener('click', () => this._onSquareClick(square));
      this.boardEl.appendChild(sq);
      this.squareEls[square] = sq;
    }
  }

  setFlipped(flipped) {
    this.flipped = flipped;
    this._buildSquares();
    if (this.state) this.render(this.state);
  }

  _onSquareClick(square) {
    if (!this.interactive) return;
    const piece = this._pieceAt(square);

    if (this.selected) {
      const target = this.legalTargets.find((m) => m.to === square);
      if (target) {
        const needsPromotion = target.promotion !== undefined;
        this.clearSelection();
        this.onUserMove(target.from, target.to, needsPromotion ? 'q' : undefined, needsPromotion);
        return;
      }
      this.clearSelection();
      if (piece && piece.color === this.state.turn) {
        this._select(square);
      }
      return;
    }

    if (piece && piece.color === this.state.turn) {
      this._select(square);
    }
  }

  _pieceAt(square) {
    if (!this.state) return null;
    for (const row of this.state.board) {
      for (const cell of row) {
        if (cell && cell.square === square) return cell;
      }
    }
    return null;
  }

  _select(square) {
    this.selected = square;
    this.legalTargets = (this.state.legalMoves || []).filter((m) => m.from === square);
    this._paint();
  }

  clearSelection() {
    this.selected = null;
    this.legalTargets = [];
    this._paint();
  }

  showSuggestion(from, to) {
    this.suggestion = { from, to };
    this._paint();
  }

  clearSuggestion() {
    this.suggestion = null;
    this._paint();
  }

  render(state) {
    this.state = state;
    this.lastMove = state.history && state.history.length
      ? state.history[state.history.length - 1]
      : null;
    this.suggestion = null;
    this._paint();
  }

  _paint() {
    for (const square of Object.keys(this.squareEls)) {
      const sqEl = this.squareEls[square];
      sqEl.classList.remove('selected', 'last-from', 'last-to', 'in-check', 'legal-dot', 'legal-capture', 'suggest-from', 'suggest-to');
      sqEl.querySelectorAll('.piece').forEach((p) => p.remove());
    }
    if (!this.state) return;

    if (this.lastMove) {
      this.squareEls[this.lastMove.from]?.classList.add('last-from');
      this.squareEls[this.lastMove.to]?.classList.add('last-to');
    }
    if (this.suggestion) {
      this.squareEls[this.suggestion.from]?.classList.add('suggest-from');
      this.squareEls[this.suggestion.to]?.classList.add('suggest-to');
    }
    if (this.selected) this.squareEls[this.selected]?.classList.add('selected');
    for (const m of this.legalTargets) {
      this.squareEls[m.to]?.classList.add(m.captured ? 'legal-capture' : 'legal-dot');
    }

    if (this.state.isCheck) {
      const kingColor = this.state.turn;
      for (const row of this.state.board) {
        for (const cell of row) {
          if (cell && cell.type === 'k' && cell.color === kingColor) {
            this.squareEls[cell.square]?.classList.add('in-check');
          }
        }
      }
    }

    for (const row of this.state.board) {
      for (const cell of row) {
        if (!cell) continue;
        const sqEl = this.squareEls[cell.square];
        if (!sqEl) continue;
        const piece = el('span', `piece ${cell.color === 'w' ? 'white' : 'black'}`, PIECE_GLYPH[cell.color][cell.type]);
        sqEl.appendChild(piece);
      }
    }
  }
}
