// Does a match actually end, how long does it take, and how many ants are on
// the board while it does? With no clock in the game, "it ends" is a property
// the numbers have to guarantee, so it has to be measured rather than assumed.
//
//   node tools/pace.mjs            # a couple of seeds, verbose
//   node tools/pace.mjs sweep      # every seed, summary only

import { Bot, applyCommand, createGame, KINDS, outputRate, step, TICK_HZ } from '../shared/dist/index.js';

const CEILING = Number(process.env.CEILING ?? 400);
const SEEDS = [3, 11, 64, 205, 900, 1337, 4242, 5150];

function play(seed, players, verbose) {
  const s = createGame(seed, players);
  const bots = s.players.map((p, i) => new Bot(i, 'normal', seed + i));
  const started = Date.now();
  let peak = 0;
  let captures = 0;

  for (let i = 0; i < CEILING * TICK_HZ; i++) {
    for (const b of bots) for (const c of b.think(s)) applyCommand(s, c);
    for (const e of step(s)) if (e.t === 'capture') captures++;
    peak = Math.max(peak, s.packets.length);
    if (verbose && i % (45 * TICK_HZ) === 0) {
      const own = s.players.map((p) => s.nodes.filter((n) => n.owner === p.id).length);
      const force = s.players.map((p) =>
        Math.round(s.nodes.filter((n) => n.owner === p.id).reduce((a, n) => a + n.count, 0)),
      );
      console.log(
        `  ${String(i / TICK_HZ).padStart(4)}с: вузли ${own.join(':')} сила ${force.join(':')}` +
          ` мурах у дорозі ${s.packets.length}`,
      );
    }
    if (s.over) break;
  }

  return {
    seconds: s.tick / TICK_HZ,
    over: s.over,
    peak,
    captures,
    realTime: (Date.now() - started) / 1000,
    strongest: Math.round(Math.max(0, ...s.nodes.filter((n) => n.owner >= 0).map((n) => n.count))),
  };
}

if (process.argv[2] === 'sweep') {
  let never = 0;
  const lens = [];
  let peak = 0;
  for (const seed of SEEDS) {
    for (const n of [2, 3, 4]) {
      const r = play(seed, n, false);
      if (!r.over) never++;
      lens.push(r.seconds);
      peak = Math.max(peak, r.peak);
    }
  }
  lens.sort((a, b) => a - b);
  const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
  console.log(`матчів: ${lens.length}, не завершилось: ${never}`);
  console.log(
    `тривалість: середня ${avg.toFixed(0)}с, медіана ${lens[lens.length >> 1].toFixed(0)}с, ` +
      `найдовший ${lens[lens.length - 1].toFixed(0)}с`,
  );
  console.log(`найбільше мурах на полі одночасно: ${peak}`);
} else {
  for (const seed of [205, 4242]) {
    console.log(`=== зерно ${seed} ===`);
    const r = play(seed, 2, true);
    console.log(
      `  ${r.over ? `завершено на ${r.seconds.toFixed(0)}с` : 'НЕ ЗАВЕРШИЛОСЬ'}` +
        `, захоплень ${r.captures}, пік мурах ${r.peak}, найсильніший вузол ${r.strongest}`,
    );
    console.log(`  обрахунок: ${r.realTime.toFixed(1)}с реальних на ${r.seconds.toFixed(0)}с ігрових`);
  }
  const nest = KINDS.nest;
  console.log(`\nмурашник: приріст ${nest.growth}/с, межа ${nest.cap}`);
  console.log(`потік при 30 мурахах: ${(nest.outBase + 30 * nest.outPer).toFixed(2)}/с`);
  console.log(`потік при ${nest.cap}: ${(nest.outBase + nest.cap * nest.outPer).toFixed(2)}/с`);
}
