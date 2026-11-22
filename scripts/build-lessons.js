// Builds public/data/lessons.json from the lesson definitions below. Every move is
// replayed through chess.js so a typo'd square or illegal line fails loudly
// at build time instead of silently breaking the in-app trainer.
const fs = require('fs');
const path = require('path');
const { Chess } = require('chess.js');

const LESSONS = [
  // ── Openings ──────────────────────────────────────────────────────────
  {
    id: 'open-italian', category: 'opening', title: 'Italian Game',
    intro: "One of the oldest openings in chess. Both sides fight for the center and develop their pieces toward the action.",
    startMoves: [],
    teach: [
      ['e4', "White opens with the King's Pawn, claiming central space and opening lines for the bishop and queen."],
      ['e5', 'Black mirrors immediately, contesting the center on equal terms.'],
      ['Nf3', 'White develops a knight that attacks e5 and prepares to castle.'],
      ['Nc6', 'Black defends e5 and develops a piece of their own — good chess is rarely one-sided.'],
      ['Bc4', "White's bishop swings to c4, eyeing the weak f7 square — this is the Italian Game."],
      ['Bc5', 'Black answers in kind, completing a harmonious, mirrored setup.'],
    ],
    completion: 'You just played the Italian Game — a great first opening because every move has a clear purpose.',
  },
  {
    id: 'open-ruylopez', category: 'opening', title: 'Ruy Lopez',
    intro: 'The most respected of all king-pawn openings. White pins the knight defending e5 and quietly builds pressure.',
    startMoves: [],
    teach: [
      ['e4', 'White stakes a claim in the center.'],
      ['e5', 'Black does the same.'],
      ['Nf3', 'White develops with tempo, attacking the e5 pawn.'],
      ['Nc6', "Black's knight steps in to defend it."],
      ['Bb5', "White pins Black's defender with the Ruy Lopez bishop — subtle pressure that lasts for moves to come."],
    ],
    completion: "That's the Ruy Lopez — quiet on the surface, but it's produced more grandmaster games than almost any other opening.",
  },
  {
    id: 'open-sicilian', category: 'opening', title: 'Open Sicilian',
    intro: 'The Sicilian Defense is the sharpest reply to 1.e4 — Black fights for the center from the side instead of the front.',
    startMoves: [],
    teach: [
      ['e4', 'White advances in the center as usual.'],
      ['c5', "Black strikes back on the queenside instead of mirroring — the hallmark of the Sicilian."],
      ['Nf3', 'White develops and prepares d4.'],
      ['d6', 'Black supports a future ...e5 or ...Nf6 and keeps options flexible.'],
      ['d4', 'White breaks open the center.'],
      ['cxd4', 'Black captures, trading the c-pawn for White’s d-pawn.'],
      ['Nxd4', 'White recaptures with the knight, reaching a typical Open Sicilian — sharp and unbalanced.'],
    ],
    completion: 'This is the Open Sicilian — one of the most fought-over tabiyas in all of chess theory.',
  },
  {
    id: 'open-qgd', category: 'opening', title: "Queen's Gambit Declined",
    intro: 'White offers a pawn to gain central control and faster development. Black politely declines and holds the center instead.',
    startMoves: [],
    teach: [
      ['d4', 'White claims the center with the queen pawn.'],
      ['d5', 'Black answers symmetrically.'],
      ['c4', "White offers the c-pawn — if Black grabs it, White gets quick development. This is the Queen's Gambit."],
      ['e6', "Black declines the gambit, reinforcing d5 instead of grabbing the pawn."],
      ['Nc3', 'White develops naturally, keeping the center solid.'],
    ],
    completion: "You've played the classical Queen's Gambit Declined — one of the most rock-solid defenses in chess.",
  },
  {
    id: 'open-london', category: 'opening', title: 'London System',
    intro: 'A simple, low-theory setup for White: develop the same way almost every game and let the opponent adapt to you.',
    startMoves: [],
    teach: [
      ['d4', 'White starts in the center.'],
      ['d5', 'Black mirrors.'],
      ['Nf3', 'White develops a knight first.'],
      ['Nf6', 'Black follows the same plan.'],
      ['Bf4', "White's bishop comes out before the e-pawn blocks it in — the signature London System move."],
    ],
    completion: "That's the London System — easy to learn, hard to refute, and a favorite of players who don't want to memorize reams of theory.",
  },
  {
    id: 'open-scandinavian', category: 'opening', title: 'Scandinavian Defense',
    intro: 'A direct way to meet 1.e4: trade central pawns immediately and bring the queen out early.',
    startMoves: [],
    teach: [
      ['e4', 'White advances the king pawn.'],
      ['d5', 'Black immediately challenges it.'],
      ['exd5', 'White captures...'],
      ['Qxd5', '...and Black recaptures with the queen, accepting an early excursion in exchange for simple, active piece play.'],
      ['Nc3', 'White develops with tempo, forcing the queen to move again.'],
    ],
    completion: "That's the Scandinavian Defense — simple to understand and a good way to avoid heavily-analyzed main lines.",
  },

  // ── Midgame ───────────────────────────────────────────────────────────
  {
    id: 'mid-center', category: 'midgame', title: 'Control the Center',
    intro: 'Pieces placed in or aimed at the center control more squares and can reach either side of the board quickly. Fighting for central squares (d4/d5/e4/e5) is priority one in the early midgame.',
    startMoves: ['e4', 'e5', 'Nf3', 'Nc6'],
    teach: [
      ['Bc4', "White's bishop joins the fight for the center and aims at f7. In the midgame, almost every move should improve control of the center or your piece activity."],
    ],
    completion: 'Central control is the foundation everything else in the middlegame is built on.',
  },
  {
    id: 'mid-king-safety', category: 'midgame', title: 'King Safety First',
    intro: "Before opening the position with pawn breaks or trades, get your king to safety. A king stuck in the center is a long-term liability.",
    startMoves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'],
    teach: [
      ['O-O', "With development underway, White castles — tucking the king behind a wall of pawns before the position opens up."],
    ],
    completion: "Castle early when you can. A safe king lets you play more freely in the rest of the game.",
  },
  {
    id: 'mid-piece-activity', category: 'midgame', title: 'Activity Over Material',
    intro: "A pawn is worth little if winning it costs you time and lets your opponent's pieces run free. Strong players often prefer a slightly worse pawn structure if it keeps their pieces active.",
    startMoves: ['d4', 'd5', 'Nf3', 'Nf6', 'c4'],
    teach: [
      ['e6', "Black reinforces the center rather than snatching the c4 pawn — keeping the position solid and pieces flexible beats grabbing a pawn that's hard to hold onto."],
    ],
    completion: "Ask 'what happens after I take this pawn?' before grabbing material — sometimes the answer is 'my position falls apart.'",
  },
  {
    id: 'mid-open-files', category: 'midgame', title: 'Open Files for Your Rooks',
    intro: "Rooks are powerful on open or half-open files where they aren't blocked by pawns. Part of the midgame plan is steering pawn trades toward files your rooks can use.",
    startMoves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4'],
    teach: [
      ['Nf6', "Black develops naturally. Notice the c-file is now half-open for Black — a classic Sicilian theme, and exactly the kind of file a rook wants to sit on."],
    ],
    completion: "Always ask which files are about to open, and get your rooks pointed at them.",
  },
  {
    id: 'mid-good-trades', category: 'midgame', title: 'Evaluate Trades by Consequence',
    intro: "Not all pieces of the same type are equal in a given position. A 'good bishop' traded for a 'bad knight' can still be a great trade if it wrecks your opponent's pawn structure.",
    startMoves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'],
    teach: [
      ['Bxc6', "White trades the bishop for the knight. It looks like giving up the bishop pair for nothing, but after ...dxc6, Black's pawn structure is permanently weakened. Evaluate trades by what the position looks like afterward, not just point values."],
    ],
    completion: 'Material value is a starting point, not the final word — always picture the position after the trade.',
  },

  // ── Endgame ───────────────────────────────────────────────────────────
  {
    id: 'end-square-rule', category: 'endgame', title: 'The Square Rule',
    intro: "To know if a passed pawn can outrun the enemy king, picture a square from the pawn to the promotion square. If the defending king is already inside that square, it can catch the pawn; if not, the pawn runs home alone.",
    startFen: '7k/8/8/4P3/8/8/8/K7 w - - 0 1',
    teach: [
      ['e6', "Black's king on h8 is far outside the square from e5 to e8 — this pawn cannot be caught."],
      ['Kg7', 'Black tries anyway...'],
      ['e7', '...but the pawn is simply faster.'],
      ['Kf7', 'One step too slow.'],
      ['e8=Q', 'The pawn promotes untouched. Always check the square rule before assuming a passed pawn is dangerous — or safe.'],
    ],
    completion: 'The square rule turns "is this pawn fast enough?" into something you can check at a glance.',
  },
  {
    id: 'end-back-rank', category: 'endgame', title: 'Back Rank Mate',
    intro: "A king castled behind its own pawns with no escape squares and no piece guarding the back rank is in serious danger the moment a rook or queen reaches that rank.",
    startFen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1',
    teach: [
      ['Ra8', "Black's own pawns on f7, g7 and h7 block every escape square, and the rook covers the entire back rank — checkmate."],
    ],
    completion: "Whenever your opponent's back rank is undefended, check whether a rook or queen can land on it with check.",
  },
  {
    id: 'end-queen-mate', category: 'endgame', title: 'King + Queen vs King',
    intro: 'The most basic winning endgame: queen and king cooperate to box the enemy king into a corner or edge, where it eventually runs out of squares.',
    startFen: '7k/8/6K1/8/8/8/8/Q7 w - - 0 1',
    teach: [
      ['Qa8', "The queen delivers mate along the back rank, while White's king nearby cuts off every nearby escape square — queen and king always work as a team."],
    ],
    completion: 'Bring your king up to help, rather than trying to mate with the queen alone — it is faster and safer.',
  },
  {
    id: 'end-cut-off', category: 'endgame', title: 'Cutting Off the King with a Rook',
    intro: "In rook endgames, a rook placed on the right rank or file can completely block the enemy king from reaching the action on the other side of the board.",
    startFen: '8/8/4k3/8/8/8/8/4K2R w - - 0 1',
    teach: [
      ['Rh5', "The rook moves to an active rank, cutting Black's king off from advancing further — a core rook-endgame technique you'll use constantly."],
    ],
    completion: "A rook on an active rank or file is often worth more than grabbing a pawn immediately.",
  },
  {
    id: 'end-stalemate-trap', category: 'endgame', title: 'Beware of Stalemate',
    intro: "A position is a stalemate — an immediate draw — if the side to move has no legal moves and is not in check. It is one of the most common ways to throw away a completely winning position.",
    startFen: '7k/5K2/8/8/8/3Q4/8/8 w - - 0 1',
    teach: [
      ['Qg6', "This looks like progress, but check carefully: Black's king on h8 has no legal moves (g8, g7 and h7 are all covered) and is not in check. That's a stalemate — a draw, not a win!"],
    ],
    completion: "Before your final move in a won endgame, always ask: does my opponent have any legal move left at all?",
  },
];

function buildLesson(def) {
  const game = new Chess();
  if (def.startFen) {
    game.load(def.startFen);
  }
  for (const san of def.startMoves || []) {
    const m = game.move(san);
    if (!m) throw new Error(`[${def.id}] illegal startMoves move: ${san}`);
  }
  const startFen = game.fen();
  const steps = def.teach.map(([san, note]) => {
    const m = game.move(san);
    if (!m) throw new Error(`[${def.id}] illegal teach move: ${san} (fen: ${game.fen()})`);
    return { from: m.from, to: m.to, promotion: m.promotion, san: m.san, note };
  });
  const finalFlags = { isCheckmate: game.isCheckmate(), isStalemate: game.isStalemate() };
  return {
    id: def.id,
    category: def.category,
    title: def.title,
    intro: def.intro,
    completion: def.completion,
    startFen,
    steps,
    finalFlags,
  };
}

const built = LESSONS.map(buildLesson);

for (const l of built) {
  console.log(`${l.category.padEnd(9)} ${l.id.padEnd(20)} ${l.steps.length} steps` +
    (l.finalFlags.isCheckmate ? '  [checkmate]' : '') +
    (l.finalFlags.isStalemate ? '  [stalemate]' : ''));
}

const outPath = path.join(__dirname, '..', 'public', 'data', 'lessons.json');
fs.writeFileSync(outPath, JSON.stringify(built, null, 2), 'utf8');
console.log(`\nWrote ${built.length} lessons to ${outPath}`);
