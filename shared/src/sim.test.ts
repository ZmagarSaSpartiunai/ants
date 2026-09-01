import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Bot } from './bot.js';
import { applyCommand, createGame, distance, step, trailById } from './sim.js';
import { GameNode, GameState, KINDS, LINK_RANGE, NEUTRAL, TICK_HZ } from './types.js';

function run(s: GameState, seconds: number, bots: Bot[] = []): void {
  for (let i = 0; i < seconds * TICK_HZ; i++) {
    for (const b of bots) for (const c of b.think(s)) applyCommand(s, c);
    step(s);
    if (s.over) break;
  }
}

/** Nearest node satisfying a predicate that is still within linking range. */
function nearby(s: GameState, from: GameNode, ok: (n: GameNode) => boolean): GameNode | undefined {
  return s.nodes
    .filter((n) => n.id !== from.id && ok(n) && distance(from, n) <= LINK_RANGE)
    .sort((a, b) => distance(from, a) - distance(from, b))[0];
}

function fingerprint(s: GameState): string {
  return JSON.stringify([
    s.tick,
    s.nodes.map((n) => [n.owner, Math.round(n.count * 1000)]),
    s.trails.map((t) => [t.id, t.owner, t.from, t.to, Math.round(t.chew * 1000)]),
    s.packets.map((p) => [p.owner, p.from, p.to, Math.round(p.pos * 1e6), Math.round(p.amount * 1000)]),
  ]);
}

test('the same seed produces a byte-identical match', () => {
  const a = createGame(12345, 2);
  const b = createGame(12345, 2);
  run(a, 90, [new Bot(0, 'hard', 7), new Bot(1, 'normal', 8)]);
  run(b, 90, [new Bot(0, 'hard', 7), new Bot(1, 'normal', 8)]);
  assert.equal(fingerprint(a), fingerprint(b));
});

test('a bot match ends with exactly one winner and no NaN', () => {
  for (const seed of [1, 77, 4242, 90210]) {
    for (const count of [2, 3, 4]) {
      const s = createGame(seed, count);
      const bots = [];
      for (let i = 0; i < count; i++) bots.push(new Bot(i, i === 0 ? 'hard' : 'normal', seed + i));
      run(s, 600, bots);
      for (const n of s.nodes) {
        assert.ok(Number.isFinite(n.count), `node ${n.id} count is ${n.count}`);
        assert.ok(n.count >= -0.001, `node ${n.id} went negative: ${n.count}`);
      }
      assert.ok(s.over, `seed ${seed} with ${count} players never ended`);
      assert.ok(s.winner !== NEUTRAL, `seed ${seed} with ${count} players ended in a draw`);
    }
  }
});

test('cutting the chain freezes everything downstream', () => {
  const s = createGame(555, 2);
  const home = s.nodes[s.players[0].home];
  const far = nearby(s, home, (n) => n.owner === NEUTRAL && n.kind === 'nest')!;
  far.owner = 0;
  far.count = 5;
  const onward = nearby(s, far, (n) => n.owner === NEUTRAL && n.kind === 'nest')!;
  onward.owner = 0;
  onward.count = 5;

  assert.ok(applyCommand(s, { t: 'link', p: 0, from: home.id, to: far.id }));
  assert.ok(applyCommand(s, { t: 'link', p: 0, from: far.id, to: onward.id }));
  step(s);
  assert.ok(s.supplied[onward.id], 'the far node should be supplied through the chain');
  run(s, 5);
  assert.ok(onward.count > 5, 'a supplied node should have grown');

  // Growth is what is under test, so clear the trails *and* the columns still
  // walking them -- an arriving packet would otherwise look like growth.
  s.trails.length = 0;
  s.packets.length = 0;
  step(s);
  assert.equal(s.supplied[onward.id], false, 'cutting the first link must starve the chain');

  const starved = onward.count;
  const control = s.nodes[s.players[1].home].count;
  run(s, 10);
  assert.equal(onward.count, starved, `an unsupplied node kept growing: ${starved} -> ${onward.count}`);
  assert.ok(s.nodes[s.players[1].home].count > control, 'a supplied home must keep growing');
});

test('a beetle column walks through a worker column', () => {
  const s = createGame(31337, 2);
  const den = s.nodes.find((n) => n.kind === 'den')!;
  const nest = s.nodes.find((n) => n.kind === 'nest' && n.id !== den.id)!;
  den.owner = 0;
  den.count = KINDS.den.cap;
  nest.owner = 1;
  nest.count = KINDS.nest.cap;
  s.players[0].home = den.id;
  s.players[1].home = nest.id;

  s.packets.push({ owner: 0, unit: 'beetle', amount: 2, from: den.id, to: nest.id, pos: 0.5, air: false, dead: false });
  s.packets.push({ owner: 1, unit: 'worker', amount: 5, from: nest.id, to: den.id, pos: 0.5, air: false, dead: false });
  step(s);

  const beetles = s.packets.filter((p) => p.unit === 'beetle');
  const workers = s.packets.filter((p) => p.unit === 'worker');
  assert.equal(workers.length, 0, 'five workers must lose to two beetles');
  assert.equal(beetles.length, 1, 'the beetle column must survive');
  // 2 beetles at toughness 4 = 8 against 5 workers at 1, so 3/4 of a beetle lives.
  assert.ok(Math.abs(beetles[0].amount - 0.75) < 1e-9, `beetle remainder was ${beetles[0].amount}`);
});

test('an air route cannot be gnawed and carries no supply', () => {
  const s = createGame(2024, 2);
  const hive = s.nodes.find((n) => n.kind === 'hive')!;
  const target = s.nodes.find((n) => n.id !== hive.id && n.kind === 'nest')!;
  hive.owner = 0;
  hive.count = 8;
  target.owner = 0;
  target.count = 3;
  s.players[0].home = hive.id;

  assert.ok(applyCommand(s, { t: 'link', p: 0, from: hive.id, to: target.id }));
  const route = s.trails[0];
  assert.ok(route.air, 'a hive must produce an air route');
  assert.equal(applyCommand(s, { t: 'chew', p: 1, trail: route.id }), false, 'air routes are immune');

  step(s);
  assert.equal(s.supplied[target.id], false, 'wasps fly, they do not build roads');
});

test('gnawing costs more the fatter the trail, and un-held progress bleeds off', () => {
  const s = createGame(99, 2);
  const a = s.nodes[s.players[0].home];
  const b = s.nodes.find((n) => n.id !== a.id && n.kind === 'nest')!;
  a.count = KINDS.nest.cap;
  assert.ok(applyCommand(s, { t: 'link', p: 0, from: a.id, to: b.id }));
  const trail = s.trails[0];

  for (let i = 0; i < TICK_HZ * 3; i++) step(s);
  assert.ok(applyCommand(s, { t: 'chew', p: 1, trail: trail.id }));
  for (let i = 0; i < TICK_HZ; i++) step(s);
  const held = trailById(s, trail.id);
  assert.ok(held && held.chew > 0.9, 'a second of holding should show up as progress');

  applyCommand(s, { t: 'chew', p: 1, trail: -1 });
  for (let i = 0; i < TICK_HZ; i++) step(s);
  assert.ok(trailById(s, trail.id)!.chew === 0, 'letting go must reset the gnawing');
});

test('gnawing occupies the player completely', () => {
  const s = createGame(4, 2);
  const mine = s.nodes[s.players[0].home];
  const theirs = nearby(s, mine, (n) => n.owner === NEUTRAL)!;
  theirs.owner = 1;
  theirs.count = 5;
  const onwards = nearby(s, theirs, (n) => n.owner === NEUTRAL)!;
  assert.ok(applyCommand(s, { t: 'link', p: 1, from: theirs.id, to: onwards.id }));
  assert.ok(applyCommand(s, { t: 'chew', p: 0, trail: s.trails[0].id }));

  const free = nearby(s, mine, (n) => n.owner === NEUTRAL)!;
  assert.equal(
    applyCommand(s, { t: 'link', p: 0, from: mine.id, to: free.id }),
    false,
    'a gnawing player must not be able to act',
  );
});

test('a bot match lasts long enough to be a match', () => {
  const lengths: number[] = [];
  for (const seed of [3, 11, 64, 205, 900]) {
    const s = createGame(seed, 2);
    run(s, 900, [new Bot(0, 'normal', seed), new Bot(1, 'normal', seed + 1)]);
    lengths.push(s.tick / TICK_HZ);
  }
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  console.log(`  duel length: ${lengths.map((l) => l.toFixed(0)).join('s, ')}s (avg ${avg.toFixed(0)}s)`);
  assert.ok(avg > 45, `matches end too fast to feel like a game: ${avg.toFixed(0)}s`);
  assert.ok(avg < 420, `matches drag on: ${avg.toFixed(0)}s`);
});
