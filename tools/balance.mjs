// Sweeps nest growth/drain/cap against bot matches. Balance is not a thing to
// guess at: the numbers that make growth readable and the numbers that let an
// attack overcome regrowth pull in opposite directions.
import { KINDS, createGame, applyCommand, step, TICK_HZ, Bot } from '../shared/dist/index.js';

// Captures per match is the tell for churn: hundreds means nodes are pinned at
// zero and flipping on every column, which looks busy and settles nothing.

const SEEDS = [3, 11, 64, 205, 900, 1337, 4242, 5150];
const LIMIT = 600;

function trial(growth, cap) {
  KINDS.nest.growth = growth;
  KINDS.nest.cap = cap;
  const lengths = [];
  let unfinished = 0;
  // Ending on the clock rather than on the board means the rules stalled.
  let byClock = 0;
  let captures = 0;
  for (const seed of SEEDS) {
    for (const n of [2, 3, 4]) {
      const s = createGame(seed, n);
      const bots = [];
      for (let i = 0; i < n; i++) bots.push(new Bot(i, 'normal', seed + i));
      let ticks = 0;
      for (; ticks < LIMIT * TICK_HZ; ticks++) {
        for (const b of bots) for (const c of b.think(s)) applyCommand(s, c);
        for (const e of step(s)) if (e.t === 'capture') captures++;
        if (s.over) break;
      }
      if (!s.over) unfinished++;
      if (ticks >= 299 * TICK_HZ) byClock++;
      lengths.push(ticks / TICK_HZ);
    }
  }
  lengths.sort((a, b) => a - b);
  return {
    avg: lengths.reduce((a, b) => a + b, 0) / lengths.length,
    med: lengths[lengths.length >> 1],
    max: lengths[lengths.length - 1],
    unfinished,
    byClock,
    captures: captures / lengths.length,
  };
}

console.log('приріст місткість | сер. мед. макс. по таймеру захоплень | с на +1  заповнення');
for (const growth of [1.6, 2.0, 2.6, 3.2, 4.0]) {
  for (const cap of [18, 24, 30]) {
    const r = trial(growth, cap);
    const ok = r.unfinished === 0 && r.avg > 70 && r.avg < 190 && r.byClock < 6 && r.captures < 60;
    console.log(
      `${growth.toFixed(1).padStart(8)} ${String(cap).padStart(9)} |` +
      `${r.avg.toFixed(0).padStart(5)}${r.med.toFixed(0).padStart(5)}${r.max.toFixed(0).padStart(6)}` +
      `${String(r.byClock).padStart(11)}${r.captures.toFixed(0).padStart(10)} | ${(1 / growth).toFixed(2)}с${(cap / growth).toFixed(0).padStart(11)}с` +
      (ok ? '  <== годиться' : ''),
    );
  }
}
