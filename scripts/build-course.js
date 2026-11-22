// Builds public/data/course.json: the Learn path (units → lessons → short
// exercises). Every position and answer is checked with chess.js here, so a
// typo'd FEN, an illegal move or a wrong "correct answer" fails the build
// instead of shipping a broken exercise.
//
// Exercise types
//   explain  board + text, tap Continue                  { fen, title, text, marks?, arrows?, showTargets? }
//   tap      tap a square                                { fen, title, prompt, answer: [sq] | { targetsOf: sq } }
//   choice   pick one option                             { fen, title, prompt, options, answer, moves?, verify? }
//   move     make a move on the board                    { fen, title, prompt, accept: [uci] | 'mate' | 'legal' }
//   line     play a whole opening/endgame line, both sides (embedded from public/data/lessons.json)
// verify (choice, moves:true): 'mate' | 'stalemate' | 'legal' — the answer must have the property and the
// other options must not.
const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');

const OLD = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'lessons.json'), 'utf8'));
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const EMPTY = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

const explain = (fen, title, text, o = {}) => ({ type: 'explain', fen, title, text, ...o });
const tap = (fen, title, prompt, answer, good, bad, o = {}) => ({ type: 'tap', fen, title, prompt, answer, good, bad, ...o });
const choice = (fen, title, prompt, options, answer, good, bad, o = {}) => ({ type: 'choice', fen, title, prompt, options, answer, good, bad, ...o });
const move = (fen, title, prompt, accept, good, bad, o = {}) => ({ type: 'move', fen, title, prompt, accept, good, bad, ...o });
const line = (oldId, title) => {
  const l = OLD.find((x) => x.id === oldId);
  if (!l) throw new Error('unknown old lesson ' + oldId);
  return { type: 'line', fen: l.startFen, title: title || l.title, intro: l.intro, completion: l.completion, steps: l.steps };
};

// ── Course ───────────────────────────────────────────────
const UNITS = [
  {
    id: 'u1', title: 'The board and pieces', sub: 'How every piece moves',
    lessons: [
      { id: 'u1-board', title: 'Meet the board', piece: 'r', exercises: [
        explain(START, 'The board', 'Chess is played on an 8×8 board. Columns are files, named a to h. Rows are ranks, numbered 1 to 8. Every square is named file first, then rank: this one is e4.', { marks: { e4: 'hl' } }),
        tap(EMPTY, 'Find e4', 'Tap the e4 square.', ['e4'], 'That is e4: the e-file, 4th rank.', 'Find the e-file first (5th column), then go up to rank 4.'),
        tap(EMPTY, 'Find d5', 'Tap the d5 square.', ['d5'], 'Right. d5 is one of the four centre squares.', 'd is the 4th file. Count up to the 5th rank.'),
        tap(EMPTY, 'Find h1', 'Tap the h1 square.', ['h1'], 'h1: White\'s bottom-right corner.', 'h is the last file on the right, and rank 1 is White\'s first row.'),
        choice(START, 'Light or dark?', 'The square in each player\'s bottom-right corner is always light. What colour is h1?', ['Light', 'Dark'], 0, 'Light. If the board is set up with a dark square there, turn it round.', 'Look at the bottom-right corner of the board.'),
        explain(START, 'The starting position', 'Each side starts with 8 pawns, 2 rooks, 2 knights, 2 bishops, a queen and a king. White always moves first. The queen starts on her own colour: the white queen on the light d1 square.', { marks: { d1: 'hl', d8: 'hl' } }),
        tap(START, 'Find the queen', 'Tap the white queen.', ['d1'], 'The white queen starts on d1, a light square.', 'The queen has the crown with points. She sits next to the king.'),
        tap(START, 'Find a knight', 'Tap one of the black knights.', ['b8', 'g8'], 'Knights start next to the rooks, on b8 and g8 for Black.', 'Knights look like a horse. Black\'s pieces are on the far side.'),
      ] },
      { id: 'u1-rook-bishop', title: 'Rook and bishop', piece: 'b', exercises: [
        explain('4k3/8/8/8/3R4/8/8/4K3 w - - 0 1', 'The rook', 'The rook moves any number of squares in a straight line: up, down, left or right. It can\'t jump over pieces.', { showTargets: 'd4' }),
        tap('4k3/8/8/8/3R4/8/8/4K3 w - - 0 1', 'Rook moves', 'Tap any square the rook on d4 can move to.', { targetsOf: 'd4' }, 'Yes. The rook covers its whole file and rank.', 'Rooks only move in straight lines along the file or rank.'),
        move('4k3/8/8/1p6/8/8/1R6/4K3 w - - 0 1', 'Rook capture', 'Capture the black pawn with your rook.', ['b2b5'], 'Rooks capture by moving onto the enemy piece.', 'The pawn is on the same file as your rook.'),
        explain('4k3/8/8/8/3B4/8/8/4K3 w - - 0 1', 'The bishop', 'The bishop moves any number of squares diagonally. A bishop stays on its starting colour for the whole game.', { showTargets: 'd4' }),
        tap('4k3/8/8/8/8/8/3P4/2B1K3 w - - 0 1', 'Bishop moves', 'Tap a square the bishop can move to. Your own pawn is in the way on one side.', { targetsOf: 'c1' }, 'Right. The pawn on d2 blocks the other diagonal.', 'Bishops move diagonally and can\'t pass through their own pieces.'),
        move('4k3/6r1/8/8/8/8/1B6/4K3 w - - 0 1', 'Bishop capture', 'Win the black rook.', ['b2g7'], 'The long diagonal was open all the way to g7.', 'Follow the diagonal from b2 up to the right.'),
        choice('4k3/8/8/8/2B1R3/8/8/4K3 w - - 0 1', 'Which piece?', 'Which of these pieces moves diagonally?', ['The rook', 'The bishop'], 1, 'Bishops move on diagonals, rooks on straight lines.', 'One moves in straight lines, the other on diagonals.'),
      ] },
      { id: 'u1-queen-king', title: 'Queen and king', piece: 'q', exercises: [
        explain('4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1', 'The queen', 'The queen moves like a rook and a bishop combined: any number of squares in a straight line or diagonally. She is your strongest piece.', { showTargets: 'd4' }),
        move('4k3/8/8/7r/8/8/8/3QK3 w - - 0 1', 'Queen capture', 'Capture the rook with your queen.', ['d1h5'], 'The diagonal d1–h5 was open.', 'Look along the diagonal from d1 toward the right.'),
        tap('4k3/8/8/2p5/8/2Q5/8/4K3 w - - 0 1', 'Queen moves', 'Tap a square the queen on c3 can move to.', { targetsOf: 'c3' }, 'The queen reaches files, ranks and diagonals.', 'Straight lines and diagonals from c3. The pawn on c5 blocks part of the file.'),
        explain('4k3/8/8/8/4K3/8/8/8 w - - 0 1', 'The king', 'The king moves one square in any direction. It is slow, but the whole game is about it: if your king is trapped, you lose.', { showTargets: 'e4' }),
        choice('4k3/8/8/8/8/8/3r4/4K3 w - - 0 1', 'Safe squares', 'A king can never move onto an attacked square. Which king move is legal?', ['Kf1', 'Ke2', 'Kf2'], 0, 'Kf1 is the only one of these not attacked by the rook.', 'The rook on d2 attacks the whole 2nd rank.', { moves: true, verify: 'legal' }),
        move('4k3/8/8/8/8/8/3q4/4K3 w - - 0 1', 'King capture', 'The black queen is next to your king and nothing defends it. Take it.', ['e1d2'], 'Kings can capture too, as long as the piece isn\'t defended.', 'Your king can step onto d2.'),
      ] },
      { id: 'u1-knight', title: 'Knight jumps', piece: 'n', exercises: [
        explain('4k3/8/8/8/3N4/8/8/4K3 w - - 0 1', 'The knight', 'The knight moves in an L: two squares one way, then one square to the side. It is the only piece that can jump over others.', { showTargets: 'd4' }),
        tap('4k3/8/8/8/8/8/8/1N2K3 w - - 0 1', 'Knight moves', 'Tap a square the knight can jump to.', { targetsOf: 'b1' }, 'From the edge a knight has fewer jumps.', 'Two squares in one direction, then one to the side.'),
        move('4k3/8/2q5/8/3N4/8/8/4K3 w - - 0 1', 'Win the queen', 'Your knight can take the queen. Do it.', ['d4c6'], 'Knights are great at catching queens off guard.', 'Try the L-shape from d4 toward c6.'),
        choice('4k3/8/8/8/3N4/8/8/4K3 w - - 0 1', 'Count the jumps', 'How many squares can this knight reach?', ['4', '6', '8'], 2, 'Eight. A knight in the centre is at its strongest.', 'Count every L-shape from d4.'),
        move('4k3/8/8/8/8/2r5/PPP5/1N2K3 w - - 0 1', 'Jump over', 'Your pawns are in the way, but knights jump. Take the rook.', ['b1c3'], 'Pieces in between never stop a knight.', 'The rook on c3 is one L-jump from b1.'),
      ] },
      { id: 'u1-pawns', title: 'Pawns and promotion', piece: 'p', exercises: [
        explain(START, 'Pawns', 'Pawns move straight forward one square. On its very first move a pawn may move two squares. Pawns never move backwards.', { showTargets: 'e2' }),
        move('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'First move', 'Move the pawn two squares forward.', ['e2e4'], 'A two-square first move.', 'From e2, a pawn may go straight to e4 on its first move.'),
        explain('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', 'Pawn captures', 'A pawn captures one square diagonally forward, never straight ahead.', { showTargets: 'e4' }),
        move('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', 'Capture', 'Capture the black pawn.', ['e4d5'], 'Pawns capture diagonally.', 'The black pawn is diagonally in front of yours.'),
        choice('4k3/8/8/4p3/4P3/8/8/4K3 w - - 0 1', 'Blocked', 'Can the white pawn on e4 move?', ['Yes', 'No'], 1, 'No. It can\'t capture straight ahead, so a pawn facing another pawn is stuck.', 'Pawns move forward but capture diagonally. What is in front of it?'),
        explain('k7/4P3/8/8/8/8/8/4K3 w - - 0 1', 'Promotion', 'A pawn that reaches the far rank turns into a queen, rook, bishop or knight. You almost always choose a queen.'),
        move('k7/4P3/8/8/8/8/8/4K3 w - - 0 1', 'Promote', 'Push the pawn to the last rank.', ['e7e8q'], 'A new queen. That is a huge gain.', 'One step forward to e8.'),
      ] },
      { id: 'u1-check', title: 'Checkpoint: pieces', piece: 'k', checkpoint: true, exercises: [
        move('r3k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'Rook capture', 'Take the black rook.', ['a1a8'], 'The a-file was wide open.', 'Your rook and the black rook share a file.'),
        move('4k3/8/8/4b3/8/5N2/8/4K3 w - - 0 1', 'Knight capture', 'Take the bishop with your knight.', ['f3e5'], 'Nice jump.', 'One L-jump from f3 lands on e5.'),
        tap('4k3/8/8/8/8/2P5/1B6/4K3 w - - 0 1', 'Bishop moves', 'Tap a square the bishop on b2 can move to.', { targetsOf: 'b2' }, 'Correct.', 'Diagonals only, and your pawn blocks one of them.'),
        choice(START, 'Most valuable', 'Not counting the king, which piece is worth the most?', ['Rook', 'Queen', 'Knight'], 1, 'The queen is worth about 9 pawns, a rook 5, a knight 3.', 'Which piece combines two others?'),
        move('8/1P2k3/8/8/8/8/8/4K3 w - - 0 1', 'Promote', 'Make a new queen.', ['b7b8q'], 'Promoted.', 'Push the pawn one square.'),
        move('4k3/8/8/8/8/8/4n3/4K3 w - - 0 1', 'King capture', 'The knight is next to your king and undefended. Take it.', ['e1e2'], 'The king can capture any undefended neighbour.', 'Step onto e2.'),
      ] },
    ],
  },
  {
    id: 'u2', title: 'Check and mate', sub: 'Finish the game',
    lessons: [
      { id: 'u2-check', title: 'Check and escapes', piece: 'k', exercises: [
        explain('4k3/8/8/8/8/8/8/4R1K1 b - - 0 1', 'Check', 'When a king is attacked it is in check. The player in check must get out of it on the very next move.', { marks: { e8: 'bad' }, arrows: [['e1', 'e8']] }),
        choice('4k3/8/8/1B6/8/8/8/4K3 b - - 0 1', 'Check or not?', 'Is the black king in check?', ['Yes', 'No'], 0, 'Yes. The bishop on b5 attacks e8 along the diagonal.', 'Trace the bishop\'s diagonals from b5.'),
        explain('4r1k1/8/8/8/8/8/8/4K3 w - - 0 1', 'Three ways out', 'There are three ways out of check: move the king, block the attack, or capture the attacking piece.', { marks: { e1: 'bad' }, arrows: [['e8', 'e1']] }),
        move('4r1k1/8/8/8/8/8/8/4K3 w - - 0 1', 'Move away', 'Your king is in check. Move it to safety.', 'legal', 'Any square off the e-file is safe.', 'The rook attacks the whole e-file, including e2.'),
        move('4r1k1/8/8/8/8/8/3B4/4K3 w - - 0 1', 'Block', 'Block the check with your bishop.', ['d2e3'], 'The bishop now stands between the rook and your king.', 'Put the bishop on the e-file, between the rook and the king.'),
        move('4r1k1/8/3N4/8/8/8/8/4K3 w - - 0 1', 'Capture', 'Capture the piece giving check.', ['d6e8'], 'Removing the attacker is often the best escape.', 'Your knight can reach e8.'),
        choice('4r1k1/8/8/8/8/8/3P1P2/3QK3 w - - 0 1', 'Find the escape', 'Which move gets out of check?', ['Qe2', 'd3', 'f3'], 0, 'Qe2 blocks the e-file.', 'The check comes down the e-file. Something has to land on it.', { moves: true, verify: 'legal' }),
      ] },
      { id: 'u2-backrank', title: 'Back-rank mate', piece: 'r', exercises: [
        explain('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'Checkmate', 'Checkmate is check with no way out: the king can\'t move, the check can\'t be blocked, and the attacker can\'t be captured. Checkmate ends the game.'),
        explain('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'The back-rank trap', 'A king behind its own unmoved pawns has no escape squares. A rook or queen landing on the back rank can deliver mate.', { arrows: [['a1', 'a8']], marks: { f7: 'hl', g7: 'hl', h7: 'hl' } }),
        move('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'Mate in one', 'Deliver checkmate.', 'mate', 'Ra8 is mate. The pawns block their own king.', 'Aim your rook at the 8th rank.'),
        move('3r2k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1', 'Mate in one', 'Checkmate in one move.', 'mate', 'Rxd8 is mate: nothing defended the rook on d8.', 'The black rook on d8 is undefended.'),
        move('6k1/5ppp/8/8/8/8/5PPP/4Q1K1 w - - 0 1', 'Queen mate', 'Checkmate with the queen.', 'mate', 'Qe8 mate. Same pattern, different piece.', 'The e-file is open to the 8th rank.'),
        move('6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 1', 'Make a window', 'You are Black. White threatens Ra8 mate. Push a pawn to give your king an escape square.', ['h7h6', 'h7h5', 'g7g6', 'g7g5', 'f7f6', 'f7f5'], 'Now your king has a square to run to. Players call this a luft.', 'Move one of the three pawns in front of your king.'),
      ] },
      { id: 'u2-queen-mates', title: 'Queen mates', piece: 'q', exercises: [
        explain('7k/8/5K2/8/8/8/8/6Q1 w - - 0 1', 'King and queen', 'A queen mates easily with the king\'s help: put the queen right next to the enemy king, protected by your own king.', { marks: { g7: 'hl' } }),
        move('7k/8/5K2/8/8/8/8/6Q1 w - - 0 1', 'Mate in one', 'Checkmate.', 'mate', 'Qg7 mate. Your king protects the queen.', 'Put the queen next to the black king on a square your king covers.'),
        move('k7/8/1K6/8/8/8/8/7Q w - - 0 1', 'Mate in one', 'Checkmate along the back rank.', 'mate', 'Qh8 mate. Your king covers a7 and b7.', 'The 8th rank is open from h8.'),
        choice('7k/8/5K2/8/8/8/8/6Q1 w - - 0 1', 'Which one mates?', 'Which move is checkmate?', ['Qg7', 'Qg8', 'Qh1'], 0, 'Qg7 is protected by your king, so the black king is stuck.', 'After the check, can the black king capture or escape?', { moves: true, verify: 'mate' }),
        move('7k/5K2/8/8/8/8/8/6Q1 w - - 0 1', 'Mate in one', 'Checkmate.', 'mate', 'Mate.', 'Your king already covers the squares around h8 except the corner file.'),
      ] },
      { id: 'u2-stalemate', title: 'Stalemate traps', piece: 'k', exercises: [
        explain('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', 'Stalemate', 'Stalemate: the side to move is not in check but has no legal move. The game is a draw, even if the other side is far ahead.', { marks: { h8: 'hl' } }),
        choice('7k/8/6K1/8/8/8/8/5Q2 w - - 0 1', 'Spot the trap', 'One of these moves throws away the win. Which move is stalemate?', ['Qf7', 'Qf8', 'Qh1'], 0, 'After Qf7 Black has no legal move and isn\'t in check: a draw.', 'Which move leaves the king with no moves and no check?', { moves: true, verify: 'stalemate' }),
        move('7k/8/6K1/8/8/8/8/5Q2 w - - 0 1', 'Finish properly', 'Now deliver checkmate instead.', 'mate', 'Mate, not stalemate.', 'Give check on the back rank.'),
        choice('k7/2Q5/1K6/8/8/8/8/8 b - - 0 1', 'What is this?', 'Black to move. What has happened?', ['Checkmate', 'Stalemate', 'Neither'], 1, 'Stalemate: the black king has no moves but is not in check.', 'Is the black king attacked right now?'),
        move('k7/8/1K6/8/8/8/8/2Q5 w - - 0 1', 'Careful', 'Mate in one. One wrong queen move is stalemate.', 'mate', 'Qc8 mate.', 'Check on the back rank. Your king covers a7 and b7.'),
      ] },
      { id: 'u2-checkpoint', title: 'Checkpoint: mate', piece: 'k', checkpoint: true, exercises: [
        move('6k1/8/6K1/8/8/8/8/R7 w - - 0 1', 'Mate in one', 'Checkmate with the rook.', 'mate', 'Ra8 mate.', 'Your king covers the 7th rank. Use the back rank.'),
        move('1k6/8/1K6/8/8/8/8/7R w - - 0 1', 'Mate in one', 'Checkmate with the rook.', 'mate', 'Rh8 mate.', 'Check along the 8th rank.'),
        choice('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1', 'What is this?', 'Black to move. What has happened?', ['Check', 'Checkmate', 'Stalemate'], 1, 'Checkmate. The king is attacked and has nowhere to go.', 'Is the king attacked? Can it escape?'),
        move('4k3/8/8/8/8/8/8/r3K3 w - - 0 1', 'Escape', 'You are in check. Get out of it.', 'legal', 'Safe.', 'The rook attacks the 1st rank.'),
        move('6k1/8/6K1/8/8/8/8/1Q6 w - - 0 1', 'Mate in one', 'Checkmate with the queen.', 'mate', 'Mate.', 'Use the 8th rank.'),
      ] },
    ],
  },
  {
    id: 'u3', title: 'Tactics I', sub: 'Forks, pins, skewers, loose pieces',
    lessons: [
      { id: 'u3-forks', title: 'Forks', piece: 'n', exercises: [
        explain('r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1', 'The fork', 'A fork is one piece attacking two at once. Your opponent can only save one of them.', { arrows: [['c7', 'a8'], ['c7', 'e8']] }),
        move('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'Knight fork', 'Fork the king and the rook.', ['b5c7'], 'Nc7+ hits the king and the rook. After the king moves, the rook falls.', 'Find a square that attacks both e8 and a8.'),
        move('3r3k/pp4pp/8/4N3/8/8/P4PPP/6K1 w - - 0 1', 'Find the fork', 'Move the knight to a square where it attacks the king and the rook at the same time.', ['e5f7'], 'Nf7+ checks the king on h8 and hits the rook on d8.', 'You need a square that reaches both h8 and d8.'),
        move('4k3/8/8/2n1r3/8/3P4/8/6K1 w - - 0 1', 'Pawn fork', 'Even a pawn can fork. Attack both black pieces.', ['d3d4'], 'd4 attacks the knight and the rook. One of them is lost.', 'A pawn attacks the two squares diagonally in front of it.'),
        choice('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'Which square?', 'Which knight move forks king and rook?', ['Nc7+', 'Nd6+', 'Na7'], 0, 'From c7 the knight reaches both a8 and e8.', 'Check which squares each move attacks.', { moves: true }),
        move('r5k1/8/8/8/8/8/8/3QK3 w - - 0 1', 'Queen fork', 'Fork the king and rook with your queen.', ['d1d5'], 'Qd5+ checks along one diagonal and hits the rook along the other. Nothing can take the queen.', 'Find one square that sees both g8 and a8 on diagonals.'),
      ] },
      { id: 'u3-pins', title: 'Pins', piece: 'b', exercises: [
        explain('4k3/3n4/8/1B6/8/8/8/4K3 b - - 0 1', 'The pin', 'A pin attacks a piece that can\'t move away because a more valuable piece is behind it. When the king is behind, the pinned piece can\'t legally move at all.', { arrows: [['b5', 'e8']] }),
        choice('4k3/3n4/8/1B6/8/8/8/4K3 b - - 0 1', 'Can it move?', 'Can the black knight on d7 move?', ['Yes', 'No'], 1, 'No. Moving it would expose the king to the bishop.', 'What is behind the knight on the diagonal?'),
        move('4k3/3n4/8/8/8/8/8/4KB2 w - - 0 1', 'Make a pin', 'Pin the knight to the king.', ['f1b5'], 'Bb5 pins the knight.', 'Put the bishop on the diagonal that runs through d7 to e8.'),
        tap('4k2r/p7/2n5/1B6/8/8/8/4K3 w - - 0 1', 'Spot the pin', 'Tap the pinned black piece.', ['c6'], 'The knight on c6 is pinned against the king.', 'Follow the bishop\'s diagonal toward the black king.'),
        move('4k3/8/2n5/1B6/3P4/8/8/4K3 w - - 0 1', 'Attack the pinned piece', 'The knight can\'t move. Attack it with a pawn.', ['d4d5'], 'd5 attacks the pinned knight, and it can\'t run.', 'A pawn on d5 would attack c6.'),
      ] },
      { id: 'u3-skewers', title: 'Skewers', piece: 'r', exercises: [
        explain('8/6q1/8/8/3k4/8/8/B3K3 b - - 0 1', 'The skewer', 'A skewer is a pin in reverse: the valuable piece is in front. When it moves out of the way, the piece behind it falls.', { arrows: [['a1', 'g7']] }),
        move('q7/8/8/8/k7/8/8/1R2K3 w - - 0 1', 'Skewer', 'Check the king so that the queen behind it is exposed.', ['b1a1'], 'Ra1+. The king must step aside and Rxa8 follows.', 'Line up your rook with the king and queen on the a-file.'),
        move('8/8/8/q4k2/8/8/8/6KR w - - 0 1', 'Skewer', 'Skewer the king and queen along the 5th rank.', ['h1h5'], 'Rh5+ and the queen on a5 drops.', 'Check on the 5th rank from the side.'),
        choice('8/6q1/8/8/3k4/8/8/B3K3 b - - 0 1', 'Name it', 'The bishop attacks the king, with the queen behind it. What is this?', ['Pin', 'Skewer', 'Fork'], 1, 'Skewer: the more valuable piece is in front.', 'Is the more valuable piece in front or behind?'),
      ] },
      { id: 'u3-hanging', title: 'Hanging pieces', piece: 'p', exercises: [
        explain('6k1/4bppp/p7/8/3q4/5N2/5PPP/6K1 w - - 0 1', 'Loose pieces', 'A hanging piece is attacked and not defended. Before every move, check what your opponent left loose and what you are leaving loose.', { marks: { d4: 'hl' } }),
        tap('6k1/4bppp/p7/8/3q4/5N2/5PPP/6K1 w - - 0 1', 'Find it', 'Tap the black piece your knight can capture for free.', ['d4'], 'The queen on d4 has no defender.', 'Trace the knight\'s jumps from f3.'),
        move('6k1/4bppp/p7/8/3q4/5N2/5PPP/6K1 w - - 0 1', 'Take it', 'Capture the queen.', ['f3d4'], 'That is 9 points of material.', 'Your knight reaches d4.'),
        tap('r5k1/5ppp/2n5/8/8/5Q2/5PPP/6K1 w - - 0 1', 'Find it', 'Tap the black piece your queen can win for free.', ['c6'], 'The knight on c6 is undefended. The f7 pawn is guarded by the king.', 'Look along the queen\'s diagonals and files.'),
        move('r5k1/5ppp/2n5/8/8/5Q2/5PPP/6K1 w - - 0 1', 'Take it', 'Win the knight.', ['f3c6'], 'A free piece.', 'The diagonal from f3 runs to c6.'),
        move('r5k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'Free rook', 'Black left the rook on a8 undefended. Take it.', ['a1a8'], 'And it is even checkmate.', 'Your rook and theirs share the a-file.'),
      ] },
      { id: 'u3-checkpoint', title: 'Checkpoint: tactics', piece: 'k', checkpoint: true, exercises: [
        move('2r1k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'Fork', 'Fork the king and the rook.', ['b5d6'], 'Nd6+ forks e8 and c8.', 'Find one square that attacks both c8 and e8.'),
        move('4k3/5n2/8/8/8/8/8/3BK3 w - - 0 1', 'Pin', 'Pin the knight to the king.', ['d1h5'], 'Bh5 pins the knight on f7.', 'The diagonal from h5 runs through f7 to e8.'),
        move('8/8/8/q4k2/8/8/8/6KR w - - 0 1', 'Skewer', 'Win the queen with a skewer.', ['h1h5'], 'Rh5+ wins the queen.', 'Check along the 5th rank.'),
        move('6k1/5ppp/8/1b6/8/8/5PPP/1R4K1 w - - 0 1', 'Hanging piece', 'Win the undefended piece.', ['b1b5'], 'Free bishop.', 'Your rook and the bishop share a file.'),
        choice('r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1', 'Name it', 'What tactic is the knight on c7 using?', ['Fork', 'Pin', 'Skewer'], 0, 'A fork: one piece, two targets.', 'How many black pieces does the knight attack?'),
      ] },
    ],
  },
  {
    id: 'u4', title: 'Opening principles', sub: 'Centre, development, king safety',
    lessons: [
      { id: 'u4-center', title: 'Control the centre', piece: 'p', exercises: [
        explain(START, 'The centre', 'The four middle squares (d4, e4, d5, e5) are the centre. Pieces there control more of the board, so both sides fight for them from move one.', { marks: { d4: 'hl', e4: 'hl', d5: 'hl', e5: 'hl' } }),
        choice(START, 'First move', 'Which first move fights for the centre?', ['e4', 'a4', 'h3'], 0, 'e4 takes space in the centre and opens lines for the bishop and queen.', 'Which pawn move reaches the middle of the board?', { moves: true }),
        move(START, 'Claim the centre', 'Move your d-pawn two squares.', ['d2d4'], 'd4 grabs the centre.', 'Push the pawn in front of the queen.'),
        choice('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', 'Black replies', 'Black to move. Which reply contests the centre?', ['e5', 'h5', 'a6'], 0, '...e5 meets White in the centre on equal terms.', 'Which move puts a pawn in the middle?', { moves: true }),
        line('mid-center', 'Centre in action'),
      ] },
      { id: 'u4-develop', title: 'Develop with purpose', piece: 'n', exercises: [
        explain(START, 'Develop', 'Development means bringing knights and bishops off the back rank early, toward the centre. Knights usually belong on f3 and c3.', { showTargets: 'g1' }),
        move('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'Develop a knight', 'Develop a knight toward the centre and attack the e5 pawn.', ['g1f3'], 'Nf3 develops and attacks e5.', 'The g1 knight can reach a square that hits e5.'),
        choice('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', 'Next piece', 'Which move develops a new minor piece?', ['Bc4', 'Qe2', 'h3'], 0, 'Bc4 brings a bishop into play, aiming at f7.', 'Knights and bishops are the minor pieces.', { moves: true }),
        choice(START, 'Queen early?', 'Why not bring the queen out on move two?', ['It gets chased by smaller pieces and you lose time', 'The queen can\'t move in the opening', 'It is against the rules'], 0, 'Every time your queen is attacked you spend a move running instead of developing.', 'Think about what happens when knights and bishops attack her.'),
        move('rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2', 'Develop', 'Develop a knight.', ['g1f3', 'b1c3'], 'Good. Knights first is a solid habit.', 'Either knight toward the centre works.'),
      ] },
      { id: 'u4-castle', title: 'Castle early', piece: 'k', exercises: [
        explain('r3k2r/pppqbppp/2npbn2/4p3/4P3/2NPBN2/PPPQBPPP/R3K2R w KQkq - 0 1', 'Castling', 'Castling moves the king two squares toward a rook, and the rook hops over it. It tucks the king away and brings the rook toward the centre. Neither piece may have moved, the squares between must be empty, and the king can\'t be in check or pass through an attacked square.'),
        move('r3k2r/pppqbppp/2npbn2/4p3/4P3/2NPBN2/PPPQBPPP/R3K2R w KQkq - 0 1', 'Castle', 'Castle kingside: move the king two squares toward the h-rook.', ['e1g1'], 'Castled. Your king is safe behind its pawns.', 'Move the king from e1 to g1.'),
        choice('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'Can you castle?', 'Can White castle right now?', ['Yes', 'No'], 1, 'No. You can\'t castle out of check.', 'Is the white king attacked?'),
        choice('4k3/8/8/8/2b5/8/8/R3K2R w KQ - 0 1', 'Which side?', 'The bishop on c4 watches f1. Which castling is legal?', ['O-O', 'O-O-O'], 1, 'Queenside. The king can\'t pass through f1 while the bishop attacks it.', 'The king may not cross an attacked square.', { moves: true, verify: 'legal' }),
        move('4k3/8/8/8/2b5/8/8/R3K2R w KQ - 0 1', 'Castle queenside', 'Castle queenside: move the king two squares toward the a-rook.', ['e1c1'], 'Castled long.', 'Move the king from e1 to c1.'),
      ] },
      { id: 'u4-italian', title: 'Italian Game', piece: 'b', exercises: [
        explain(START, 'The Italian Game', 'One of the oldest openings. Both sides fight for the centre and develop toward it. You will play both sides, move by move.'),
        line('open-italian'),
      ] },
      { id: 'u4-qgd', title: "Queen's Gambit", piece: 'p', exercises: [
        explain(START, "The Queen's Gambit", 'White offers a pawn to pull Black\'s centre pawn away. Black declines and keeps a solid centre. You play both sides.'),
        line('open-qgd'),
      ] },
      { id: 'u4-checkpoint', title: 'Checkpoint: openings', piece: 'k', checkpoint: true, exercises: [
        move(START, 'Open', 'Open with the king\'s pawn, two squares.', ['e2e4'], 'A classic first move.', 'The pawn in front of the king.'),
        move('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'Develop', 'Develop a knight.', ['g1f3', 'b1c3'], 'Developed.', 'Bring a knight toward the centre.'),
        move('rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 'King safety', 'Castle kingside.', ['e1g1'], 'Safe king, active rook.', 'King from e1 to g1.'),
        choice(START, 'The centre', 'Which four squares make up the centre?', ['d4 e4 d5 e5', 'a1 h1 a8 h8', 'c3 f3 c6 f6'], 0, 'Right.', 'The very middle of the board.'),
        choice('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'Castling rule', 'Can White castle?', ['Yes', 'No'], 1, 'Not while in check.', 'Look at the e-file.'),
      ] },
    ],
  },
  {
    id: 'u5', title: 'Endgame basics', sub: 'Win the won positions',
    lessons: [
      { id: 'u5-square', title: 'The square rule', piece: 'p', exercises: [
        explain('7k/8/8/p7/8/8/8/4K3 w - - 0 1', 'The square rule', 'Can a king catch a passed pawn? Picture a square from the pawn to its promotion square. If the king can step into it, it catches the pawn.', { marks: { a5: 'hl', e5: 'hl', a1: 'hl', e1: 'hl' } }),
        choice('7k/8/8/p7/8/8/8/4K3 w - - 0 1', 'Catch it?', 'White to move. Can the white king catch the pawn?', ['Yes', 'No'], 0, 'Yes. The king is inside the square a5–e5–e1–a1.', 'Picture the square from a5 down to a1.'),
        choice('7k/8/8/p7/8/8/8/6K1 w - - 0 1', 'Catch it?', 'White to move. Can the white king catch the pawn now?', ['Yes', 'No'], 1, 'No. The king on g1 is outside the square and the pawn promotes.', 'Is g1 inside the square a5–e5–e1–a1?'),
        move('7k/8/8/p7/8/8/8/4K3 w - - 0 1', 'Chase', 'Head toward the pawn.', ['e1d2', 'e1d1', 'e1e2'], 'Right direction. You stay inside the square.', 'Move the king toward a1.'),
        line('end-square-rule'),
      ] },
      { id: 'u5-kq', title: 'King and queen vs king', piece: 'q', exercises: [
        explain('7k/8/6K1/8/8/8/8/Q7 w - - 0 1', 'The technique', 'Use the queen to shrink the king\'s box, bring your own king close, then mate on the edge. Watch for stalemate every move.'),
        move('7k/8/6K1/8/8/8/8/Q7 w - - 0 1', 'Mate in one', 'Checkmate.', 'mate', 'Mate.', 'Check on the 8th rank, or next to the king where yours protects.'),
        move('8/8/8/8/8/1K6/8/k5Q1 w - - 0 1', 'Mate in one', 'Checkmate.', 'mate', 'Mate in the corner.', 'The black king is stuck on the first rank.'),
        line('end-queen-mate'),
      ] },
      { id: 'u5-rook', title: 'Cutting off with a rook', piece: 'r', exercises: [
        explain('8/8/4k3/8/8/8/8/4K2R w - - 0 1', 'The rook wall', 'A rook can cut the enemy king off along a rank or file. Push the king to the edge, then mate with king and rook together.'),
        line('end-cut-off'),
        move('6k1/8/6K1/8/8/8/8/R7 w - - 0 1', 'Mate in one', 'Checkmate.', 'mate', 'Ra8 mate.', 'The back rank.'),
        move('4k3/8/4K3/8/8/8/8/7R w - - 0 1', 'Mate in one', 'Checkmate.', 'mate', 'Rh8 mate.', 'Kings facing each other: check from the side.'),
      ] },
      { id: 'u5-opposition', title: 'Opposition', piece: 'k', exercises: [
        explain('8/8/4k3/8/4K3/8/8/8 b - - 0 1', 'Opposition', 'Kings standing on the same file with one square between them are in opposition. The side that does not have to move holds it, and the other king must give way.', { marks: { e6: 'hl', e4: 'hl' } }),
        choice('8/8/3k4/8/8/3K4/8/8 w - - 0 1', 'Take it', 'Which king move takes the opposition?', ['Kd4', 'Ke4', 'Kc3'], 0, 'Kd4: one square between the kings, and Black must move.', 'Face the black king with exactly one square between.', { moves: true }),
        move('8/8/4k3/8/8/4K3/8/8 w - - 0 1', 'Take it', 'Take the opposition.', ['e3e4'], 'Ke4. Now Black has to give ground.', 'Step forward so only one square separates the kings.'),
        line('end-stalemate-trap', 'Beware of stalemate'),
      ] },
      { id: 'u5-checkpoint', title: 'Checkpoint: endgames', piece: 'k', checkpoint: true, exercises: [
        move('7k/8/5K2/8/8/8/8/6Q1 w - - 0 1', 'Queen mate', 'Checkmate.', 'mate', 'Mate.', 'Protect the queen with your king.'),
        move('1k6/8/1K6/8/8/8/8/7R w - - 0 1', 'Rook mate', 'Checkmate.', 'mate', 'Mate.', 'Back rank.'),
        choice('7k/8/8/p7/8/8/8/6K1 w - - 0 1', 'Square rule', 'Can the white king catch the pawn?', ['Yes', 'No'], 1, 'No, it is outside the square.', 'Picture the square from a5 to a1.'),
        move('8/8/4k3/8/8/4K3/8/8 w - - 0 1', 'Opposition', 'Take the opposition.', ['e3e4'], 'Correct.', 'One square between the kings.'),
        choice('7k/8/6K1/8/8/8/8/5Q2 w - - 0 1', 'Avoid it', 'Which move is stalemate?', ['Qf7', 'Qf8', 'Qh1'], 0, 'Qf7 leaves Black with no moves.', 'No check, no moves.', { moves: true, verify: 'stalemate' }),
      ] },
    ],
  },
];

// ── Validation ───────────────────────────────────────────
const errors = [];
const uci = (m) => m.from + m.to + (m.promotion || '');
function game(fen, where) {
  const g = new Chess();
  try { g.load(fen); } catch (e) { errors.push(`${where}: bad FEN ${fen} (${e.message})`); return null; }
  return g;
}
function targetsOf(fen, sq) {
  // Moves for the piece on sq, even if it isn't that side's turn.
  const g = new Chess(fen);
  const p = g.get(sq);
  if (!p) return null;
  if (p.color !== g.turn()) {
    const parts = fen.split(' ');
    parts[1] = p.color; parts[3] = '-';
    try { g.load(parts.join(' ')); } catch { return null; }
  }
  return [...new Set(g.moves({ square: sq, verbose: true }).map((m) => m.to))];
}
function sanResult(fen, san) {
  const g = new Chess(fen);
  try {
    const m = g.move(san);
    return { legal: true, uci: uci(m), mate: g.isCheckmate(), stalemate: g.isStalemate() };
  } catch { return { legal: false }; }
}

let total = 0;
UNITS.forEach((u, ui) => {
  u.n = ui + 1;
  u.lessons.forEach((l) => {
    l.exercises.forEach((x, xi) => {
      total++;
      const where = `${l.id}#${xi + 1} (${x.type} "${x.title}")`;
      const g = game(x.fen, where);
      if (!g) return;
      if (!x.title) errors.push(`${where}: missing title`);
      if (x.type !== 'explain' && x.type !== 'line' && (!x.good || !x.bad)) errors.push(`${where}: missing feedback text`);
      if (x.showTargets) {
        const t = targetsOf(x.fen, x.showTargets);
        if (!t || !t.length) errors.push(`${where}: showTargets ${x.showTargets} has no piece/moves`);
        else x.marks = { ...(x.marks || {}), ...Object.fromEntries(t.map((s) => [s, 'dot'])), [x.showTargets]: 'hl' };
        delete x.showTargets;
      }
      if (x.type === 'tap') {
        if (x.answer && x.answer.targetsOf) {
          const t = targetsOf(x.fen, x.answer.targetsOf);
          if (!t || !t.length) errors.push(`${where}: targetsOf ${x.answer.targetsOf} empty`);
          x.from = x.answer.targetsOf;
          x.answer = t || [];
        }
        if (!Array.isArray(x.answer) || !x.answer.length) errors.push(`${where}: no answer squares`);
      }
      if (x.type === 'move') {
        const legal = g.moves({ verbose: true });
        if (x.accept === 'mate' || x.accept === 'legal') {
          const want = x.accept;
          x.accept = legal.filter((m) => {
            if (want === 'legal') return true;
            const h = new Chess(x.fen); h.move(m); return h.isCheckmate();
          }).map(uci);
          if (!x.accept.length) errors.push(`${where}: no ${want} moves in position`);
          if (want === 'mate') x.goal = 'mate';
        } else {
          const legalSet = new Set(legal.map(uci));
          x.accept.forEach((a) => { if (!legalSet.has(a)) errors.push(`${where}: accepted move ${a} is illegal`); });
        }
      }
      if (x.type === 'choice') {
        if (!(x.answer >= 0 && x.answer < x.options.length)) errors.push(`${where}: answer index out of range`);
        if (x.moves) {
          const res = x.options.map((o) => sanResult(x.fen, o));
          res.forEach((r, i) => {
            if (x.verify === 'legal') {
              if (i === x.answer && !r.legal) errors.push(`${where}: answer ${x.options[i]} is illegal`);
              if (i !== x.answer && r.legal) errors.push(`${where}: wrong option ${x.options[i]} is actually legal`);
            } else if (!r.legal) errors.push(`${where}: option ${x.options[i]} is illegal`);
            if (x.verify === 'mate' || x.verify === 'stalemate') {
              const ok = r[x.verify];
              if (i === x.answer && !ok) errors.push(`${where}: answer ${x.options[i]} is not ${x.verify}`);
              if (i !== x.answer && ok) errors.push(`${where}: wrong option ${x.options[i]} is also ${x.verify}`);
            }
          });
          x.optionMoves = res.map((r) => (r.legal ? r.uci : null));
        }
      }
      if (x.type === 'line') {
        const h = new Chess(x.fen);
        x.steps.forEach((s, si) => {
          try { h.move({ from: s.from, to: s.to, promotion: s.promotion }); } catch { errors.push(`${where}: line step ${si + 1} ${s.san} illegal`); }
        });
      }
      // Every exercise in a lesson must have a unique, stable reference for Review.
      x.ref = `${l.id}#${xi + 1}`;
    });
  });
});

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n  ` + errors.join('\n  '));
  process.exit(1);
}
const out = path.join(__dirname, '..', 'public', 'data', 'course.json');
fs.writeFileSync(out, JSON.stringify({ version: 1, units: UNITS }));
const lessonCount = UNITS.reduce((n, u) => n + u.lessons.length, 0);
console.log(`✓ course.json: ${UNITS.length} units, ${lessonCount} lessons, ${total} exercises, all checked`);
