import { el, FILES } from './util.js';
import { pieceSVG } from './pieces.js';

// Every live board, so a theme/piece change can repaint them in place.
export const liveBoards = new Set();

export class ChessBoard {
  constructor(container, opts = {}) {
    this.container = container;
    this.interactive = opts.interactive !== false;
    this.onUserMove = opts.onUserMove || (() => {});
    this.onPremove = opts.onPremove || (() => {});
    this.onPremoveClear = opts.onPremoveClear || (() => {});
    this.premoveColor = opts.premoveColor || null;
    this.flipped = !!opts.flipped;
    this.selected = null;
    this.legalTargets = [];
    this.lastMove = null;
    this.state = null;
    this.suggestion = null;
    this.premove = null;
    this._selectionIsPremove = false;
    this.annotations = { arrows: [], circles: [] };
    this._drag = null;
    this._rightDrag = null;

    this.container.innerHTML = '';
    this.container.style.position = 'relative';
    this.boardEl = el('div', 'board');
    this.container.appendChild(this.boardEl);
    this.svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgEl.setAttribute('viewBox', '0 0 8 8');
    this.svgEl.setAttribute('class', 'board-annotations');
    this.container.appendChild(this.svgEl);
    this.ghostEl = el('div', 'piece-ghost hidden');
    this.container.appendChild(this.ghostEl);
    this.squareEls = {};
    this._buildSquares();
    this._bindEvents();
    liveBoards.add(this);
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
      this.boardEl.appendChild(sq);
      this.squareEls[square] = sq;
    }
  }

  setFlipped(flipped) {
    this.flipped = flipped;
    this._buildSquares();
    if (this.state) this.render(this.state);
  }

  // ── Coordinates ──────────────────────────────────────────
  _squareFromPoint(clientX, clientY) {
    const rect = this.boardEl.getBoundingClientRect();
    const relX = (clientX - rect.left) / rect.width;
    const relY = (clientY - rect.top) / rect.height;
    if (relX < 0 || relX >= 1 || relY < 0 || relY >= 1) return null;
    let col = Math.floor(relX * 8);
    let row = Math.floor(relY * 8);
    if (this.flipped) { col = 7 - col; row = 7 - row; }
    const rank = 8 - row;
    return FILES[col] + rank;
  }

  _squareToUnit(square) {
    const file = FILES.indexOf(square[0]);
    const rank = parseInt(square[1], 10);
    let col = file, row = 8 - rank;
    if (this.flipped) { col = 7 - col; row = 7 - row; }
    return { x: col + 0.5, y: row + 0.5 };
  }

  // ── Pointer interaction (unified click + drag) ──────────
  _bindEvents() {
    this.boardEl.addEventListener('contextmenu', (e) => e.preventDefault());
    this.boardEl.addEventListener('pointerdown', (e) => this._onPointerDown(e));
  }

  _onPointerDown(e) {
    const square = this._squareFromPoint(e.clientX, e.clientY);
    if (!square || !this.state) return;

    if (e.button === 2) {
      e.preventDefault();
      this._rightDrag = { from: square, pointerId: e.pointerId };
      this.boardEl.setPointerCapture(e.pointerId);
      this.boardEl.addEventListener('pointermove', this._onRightDragMove = (ev) => this._onAnnotationMove(ev), { passive: true });
      this.boardEl.addEventListener('pointerup', this._onRightDragUp = (ev) => this._onAnnotationUp(ev), { once: true });
      return;
    }
    if (e.button !== 0) return;

    const piece = this._pieceAt(square);

    if (this.selected) {
      if (square === this.selected) {
        this._beginDrag(square, piece, e);
        return;
      }
      const target = this.legalTargets.find((m) => m.to === square);
      if (target) {
        this._completeSelection(target);
        return;
      }
      this._clearSelectionInternal();
    }

    const canMove = this.interactive && piece && piece.color === this.state.turn;
    const canPremove = !this.interactive && this.premoveColor && piece && piece.color === this.premoveColor && !this.state.isGameOver;
    if (canMove) {
      this._select(square, false);
      this._beginDrag(square, piece, e);
    } else if (canPremove) {
      this._select(square, true);
      this._beginDrag(square, piece, e);
    }
  }

  _beginDrag(square, piece, e) {
    this._drag = { from: square, pointerId: e.pointerId, moved: false, piece };
    this.boardEl.setPointerCapture(e.pointerId);
    this.boardEl.addEventListener('pointermove', this._onDragMove = (ev) => this._onPointerMove(ev));
    this.boardEl.addEventListener('pointerup', this._onDragUp = (ev) => this._onPointerUp(ev), { once: true });
  }

  _onPointerMove(e) {
    if (!this._drag) return;
    const dx = e.clientX - (this._dragStartX ?? e.clientX);
    if (this._dragStartX === undefined) { this._dragStartX = e.clientX; this._dragStartY = e.clientY; }
    if (!this._drag.moved) {
      const moveDist = Math.hypot(e.clientX - this._dragStartX, e.clientY - this._dragStartY);
      if (moveDist < 4) return;
      this._drag.moved = true;
      this.squareEls[this._drag.from]?.classList.add('dragging-from');
      this.ghostEl.className = 'piece-ghost';
      this.ghostEl.innerHTML = pieceSVG(this._drag.piece.color, this._drag.piece.type);
    }
    const rect = this.boardEl.getBoundingClientRect();
    const size = rect.width / 8;
    this.ghostEl.style.width = size + 'px';
    this.ghostEl.style.height = size + 'px';
    this.ghostEl.style.left = (e.clientX - rect.left - size / 2) + 'px';
    this.ghostEl.style.top = (e.clientY - rect.top - size / 2) + 'px';
  }

  _onPointerUp(e) {
    this.boardEl.removeEventListener('pointermove', this._onDragMove);
    const drag = this._drag;
    this._drag = null;
    this._dragStartX = undefined;
    this._dragStartY = undefined;
    this.ghostEl.className = 'piece-ghost hidden';
    this.squareEls[drag?.from]?.classList.remove('dragging-from');
    if (!drag || !drag.moved) return; // plain click already handled in pointerdown logic for non-drag taps

    const square = this._squareFromPoint(e.clientX, e.clientY);
    if (!square || square === drag.from) return;
    const target = this.legalTargets.find((m) => m.to === square);
    if (target) this._completeSelection(target);
  }

  _completeSelection(target) {
    const needsPromotion = target.promotion !== undefined;
    const isPremove = this._selectionIsPremove;
    this._clearSelectionInternal();
    if (isPremove) {
      this.onPremove(target.from, target.to, needsPromotion ? 'q' : undefined);
    } else {
      this.onUserMove(target.from, target.to, needsPromotion ? 'q' : undefined, needsPromotion);
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

  _select(square, isPremove) {
    this.selected = square;
    this._selectionIsPremove = isPremove;
    this.legalTargets = isPremove
      ? this._pseudoMovesFor(square)
      : (this.state.legalMoves || []).filter((m) => m.from === square);
    this._paint();
  }

  _clearSelectionInternal() {
    const wasPremove = this._selectionIsPremove;
    this.selected = null;
    this.legalTargets = [];
    this._selectionIsPremove = false;
    this._paint();
    if (wasPremove) this.onPremoveClear();
  }

  clearSelection() {
    this._clearSelectionInternal();
  }

  // ── Premove pseudo-legal generation (ignores check — real legality is
  // re-validated by the engine once it actually becomes this side's turn) ──
  _pseudoMovesFor(square) {
    const piece = this._pieceAt(square);
    if (!piece) return [];
    const file = FILES.indexOf(square[0]);
    const rank = parseInt(square[1], 10);
    const moves = [];
    const inBounds = (f, r) => f >= 0 && f <= 7 && r >= 1 && r <= 8;

    if (piece.type === 'n' || piece.type === 'k') {
      const offsets = piece.type === 'n'
        ? [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
        : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      offsets.forEach(([df, dr]) => {
        const f = file + df, r = rank + dr;
        if (!inBounds(f, r)) return;
        const sq = FILES[f] + r;
        const target = this._pieceAt(sq);
        if (!target || target.color !== piece.color) moves.push({ from: square, to: sq, captured: target?.type });
      });
    } else if (piece.type === 'p') {
      const dir = piece.color === 'w' ? 1 : -1;
      const startRank = piece.color === 'w' ? 2 : 7;
      const promoRank = piece.color === 'w' ? 8 : 1;
      if (inBounds(file, rank + dir) && !this._pieceAt(FILES[file] + (rank + dir))) {
        const to = FILES[file] + (rank + dir);
        moves.push({ from: square, to, promotion: rank + dir === promoRank ? 'q' : undefined });
        if (rank === startRank && !this._pieceAt(FILES[file] + (rank + 2 * dir))) {
          moves.push({ from: square, to: FILES[file] + (rank + 2 * dir) });
        }
      }
      [-1, 1].forEach((df) => {
        const f = file + df, r = rank + dir;
        if (!inBounds(f, r)) return;
        const sq = FILES[f] + r;
        const target = this._pieceAt(sq);
        if (target && target.color !== piece.color) moves.push({ from: square, to: sq, captured: target.type, promotion: r === promoRank ? 'q' : undefined });
      });
    } else {
      const dirs = piece.type === 'b' ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
        : piece.type === 'r' ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
        : [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
      dirs.forEach(([df, dr]) => {
        let f = file + df, r = rank + dr;
        while (inBounds(f, r)) {
          const sq = FILES[f] + r;
          const target = this._pieceAt(sq);
          if (target && target.color === piece.color) break;
          moves.push({ from: square, to: sq, captured: target?.type });
          if (target) break;
          f += df; r += dr;
        }
      });
    }
    return moves;
  }

  showSuggestion(from, to) {
    this.suggestion = { from, to };
    this._paint();
  }

  clearSuggestion() {
    this.suggestion = null;
    this._paint();
  }

  showPremove(from, to) {
    this.premove = { from, to };
    this._paint();
  }

  clearPremove() {
    this.premove = null;
    this._paint();
  }

  // ── Right-click arrow/circle annotations ─────────────────
  _onAnnotationMove() { /* visual feedback during drag is optional; finalized on pointerup */ }

  _onAnnotationUp(e) {
    this.boardEl.removeEventListener('pointermove', this._onRightDragMove);
    const drag = this._rightDrag;
    this._rightDrag = null;
    if (!drag) return;
    const to = this._squareFromPoint(e.clientX, e.clientY);
    if (!to) return;
    if (to === drag.from) {
      const idx = this.annotations.circles.indexOf(to);
      if (idx >= 0) this.annotations.circles.splice(idx, 1);
      else this.annotations.circles.push(to);
    } else {
      const existingIdx = this.annotations.arrows.findIndex((a) => a.from === drag.from && a.to === to);
      if (existingIdx >= 0) this.annotations.arrows.splice(existingIdx, 1);
      else this.annotations.arrows.push({ from: drag.from, to });
    }
    this._paintAnnotations();
  }

  _clearAnnotations() {
    if (this.annotations.arrows.length === 0 && this.annotations.circles.length === 0) return;
    this.annotations.arrows = [];
    this.annotations.circles = [];
    this._paintAnnotations();
  }

  _paintAnnotations() {
    this.svgEl.innerHTML = '';
    const color = 'rgba(21, 156, 88, 0.8)';
    for (const sq of this.annotations.circles) {
      const { x, y } = this._squareToUnit(sq);
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x - 0.44);
      rect.setAttribute('y', y - 0.44);
      rect.setAttribute('width', 0.88);
      rect.setAttribute('height', 0.88);
      rect.setAttribute('rx', 0.12);
      rect.setAttribute('fill', 'none');
      rect.setAttribute('stroke', color);
      rect.setAttribute('stroke-width', 0.09);
      this.svgEl.appendChild(rect);
    }
    for (const { from, to } of this.annotations.arrows) {
      const p1 = this._squareToUnit(from);
      const p2 = this._squareToUnit(to);
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const shortenEnd = 0.38;
      const ex = p2.x - ux * shortenEnd, ey = p2.y - uy * shortenEnd;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', p1.x); line.setAttribute('y1', p1.y);
      line.setAttribute('x2', ex); line.setAttribute('y2', ey);
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', 0.16);
      line.setAttribute('stroke-linecap', 'round');
      this.svgEl.appendChild(line);

      const headLen = 0.28, headWidth = 0.18;
      const bx = ex - ux * headLen, by = ey - uy * headLen;
      const perpX = -uy, perpY = ux;
      const p3 = `${ex},${ey}`;
      const p4 = `${bx + perpX * headWidth},${by + perpY * headWidth}`;
      const p5 = `${bx - perpX * headWidth},${by - perpY * headWidth}`;
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', `${p3} ${p4} ${p5}`);
      poly.setAttribute('fill', color);
      this.svgEl.appendChild(poly);
    }
  }

  render(state) {
    this.state = state;
    this.lastMove = state.history && state.history.length
      ? state.history[state.history.length - 1]
      : null;
    this.suggestion = null;
    this.premove = null;
    this._clearAnnotations();
    this._paint();
  }

  _paint() {
    for (const square of Object.keys(this.squareEls)) {
      const sqEl = this.squareEls[square];
      sqEl.classList.remove('selected', 'last-from', 'last-to', 'in-check', 'legal-dot', 'legal-capture', 'suggest-from', 'suggest-to', 'premove-from', 'premove-to');
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
    if (this.premove) {
      this.squareEls[this.premove.from]?.classList.add('premove-from');
      this.squareEls[this.premove.to]?.classList.add('premove-to');
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
        const piece = el('span', 'piece');
        piece.innerHTML = pieceSVG(cell.color, cell.type);
        sqEl.appendChild(piece);
      }
    }
  }
}

// Static, non-interactive board for cards and lists. Built as one HTML
// string (no ChessBoard instance) so a page of 30 thumbnails stays cheap.
export function boardThumb(board, { flipped = false } = {}) {
  const cells = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const r = flipped ? 7 - row : row;
      const c = flipped ? 7 - col : col;
      const cell = board[r][c];
      cells.push(`<span class="square ${(r + c) % 2 === 0 ? 'light' : 'dark'}">${cell ? `<span class="piece">${pieceSVG(cell.color, cell.type)}</span>` : ''}</span>`);
    }
  }
  const wrap = document.createElement('div');
  wrap.className = 'thumb';
  wrap.innerHTML = `<div class="board">${cells.join('')}</div>`;
  return wrap;
}
