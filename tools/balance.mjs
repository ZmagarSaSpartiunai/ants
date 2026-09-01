// Sweeps how much a node sends against bot matches.
//
// Two things have to come out right at once, and they pull apart:
//
//   * a match must END. There is no clock, so the numbers themselves have to
//     guarantee it -- weak output leaves fronts frozen for ever;
//   * ants walk one at a time, so the rate is literally how fast you watch them
//     leave. Too high and the board is a river, and a full node changes hands
//     before anyone can react.
//
//   node tools/balance.mjs

import { Bot, applyCommand, createGame, KINDS, step, TICK_HZ } from '../shared/dist/index.js';

const SEEDS = [3, 11, 64, 205, 900, 1337, 4242, 5150];
const CEILING = Number(process.env.CEILING ?? 400);

function trial(outBase, outPer) {
  KINDS.nest.outBase = outBase;
  KINDS.nest.outPer = outPer;
  KINDS.den.outBase = outBase * 0.4;
  KINDS.den.outPer = outPer * 0.3;
  KINDS.hive.outBase = outBase * 0.33;
  KINDS.hive.outPer = outPer * 0.2;

  const lengths = [];
  let never = 0;
  let peak = 0;
  let captures = 0;
  for (const seed of SEEDS) {
    for (const players of [2, 3, 4]) {
      const s = createGame(seed, players);
      const bots = s.players.map((p, i) => new Bot(i, 'normal', seed + i));
      let ticks = 0;
      for (; ticks < CEILING * TICK_HZ; ticks++) {
        for (const b of bots) for (const c of b.think(s)) applyCommand(s, c);
        for (const e of step(s)) if (e.t === 'capture') captures++;
        peak = Math.max(peak, s.packets.length);
        if (s.over) break;
      }
      if (!s.over) never++;
      lengths.push(ticks / TICK_HZ);
    }
  }
  lengths.sort((a, b) => a - b);

  return {
    avg: lengths.reduce((a, b) => a + b, 0) / lengths.length,
    med: lengths[lengths.length >> 1],
    max: lengths[lengths.length - 1],
    never,
    peak,
    captures: captures / lengths.length,
  };
}

console.log('база наЮніт | потік@30 @150 | сер. мед. макс. НЕзавершених пік_мурах захоплень');
for (const outBase of [0.6, 1.2]) {
  for (const outPer of [0.03, 0.06, 0.09, 0.14]) {
    const r = trial(outBase, outPer);
    const at30 = outBase + 30 * outPer;
    const at150 = outBase + 150 * outPer;
    const ok = r.never === 0 && r.avg < 220 && r.peak < 900;
    console.log(
      `${outBase.toFixed(1).padStart(4)} ${outPer.toFixed(2).padStart(6)} |` +
        `${at30.toFixed(1).padStart(9)}${at150.toFixed(1).padStart(6)} |` +
        `${r.avg.toFixed(0).padStart(5)}${r.med.toFixed(0).padStart(5)}${r.max.toFixed(0).padStart(6)}` +
        `${String(r.never).padStart(14)}${String(r.peak).padStart(10)}${r.captures.toFixed(0).padStart(11)}` +
        (ok ? '  <== годиться' : ''),
    );
  }
}
