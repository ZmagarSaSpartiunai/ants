import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Bot } from './bot.js';
import {
  applyCommand,
  blockedBy,
  canLink,
  createGame,
  distance,
  linksFree,
  outputRate,
  step,
  trailById,
} from './sim.js';
import {
  GameNode,
  GameState,
  KINDS,
  NEUTRAL,
  TICK_HZ,
  UNITS,
  UNSUPPLIED_GROWTH,
} from './types.js';

function run(s: GameState, seconds: number, bots: Bot[] = []): void {
  for (let i = 0; i < seconds * TICK_HZ; i++) {
    for (const b of bots) for (const c of b.think(s)) applyCommand(s, c);
    step(s);
    if (s.over) break;
  }
}

/** Nearest node satisfying a predicate. Range is no longer a rule. */
function nearby(s: GameState, from: GameNode, ok: (n: GameNode) => boolean): GameNode | undefined {
  return s.nodes
    .filter((n) => n.id !== from.id && ok(n))
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

test('cutting the chain starves a node without killing it', () => {
  const s = createGame(555, 2);
  const home = s.nodes[s.players[0].home];
  const far = nearby(s, home, (n) => n.owner === NEUTRAL && n.kind === 'nest')!;
  far.owner = 0;
  const onward = nearby(s, far, (n) => n.owner === NEUTRAL && n.kind === 'nest')!;
  onward.owner = 0;

  assert.ok(applyCommand(s, { t: 'link', p: 0, from: home.id, to: far.id }));
  assert.ok(applyCommand(s, { t: 'link', p: 0, from: far.id, to: onward.id }));
  step(s);
  assert.ok(s.supplied[onward.id], 'the far node should be supplied through the chain');

  // No trails and no columns: growth alone is under test. Both nodes start low
  // so neither can hit the cap, which is what made the previous version of this
  // test vacuous -- it compared two nodes that were both already full.
  s.trails.length = 0;
  s.packets.length = 0;
  step(s);
  assert.equal(s.supplied[onward.id], false, 'a node off the chain is not supplied');
  assert.ok(s.supplied[home.id], 'a home supplies itself');

  onward.count = 1;
  home.count = 1;
  run(s, 5);
  const cut = onward.count - 1;
  const fed = home.count - 1;
  assert.ok(cut > 0, `a cut node must still grow, grew ${cut}`);
  assert.ok(fed > cut * 2, `a supplied node must grow far faster: ${fed} vs ${cut}`);
  const ratio = cut / fed;
  assert.ok(
    Math.abs(ratio - UNSUPPLIED_GROWTH) < 0.02,
    `cut growth should be ${UNSUPPLIED_GROWTH} of normal, was ${ratio.toFixed(3)}`,
  );
});

test('a cut node with a trail out does not drain itself to nothing', () => {
  const s = createGame(555, 2);
  const home = s.nodes[s.players[0].home];
  const far = nearby(s, home, (n) => n.owner === NEUTRAL && n.kind === 'nest')!;
  far.owner = 0;
  far.count = 12;
  const onward = nearby(s, far, (n) => n.owner === NEUTRAL)!;

  // `far` is cut off from home and still feeding a trail. It must not bleed out:
  // an exporting node was pinned at zero forever, which is what turned whole
  // boards into rows of zeroes.
  assert.ok(applyCommand(s, { t: 'link', p: 0, from: far.id, to: onward.id }));
  step(s);
  assert.equal(s.supplied[far.id], false);
  const before = far.count;
  run(s, 30);
  assert.ok(far.count >= before, `an exporting cut node drained: ${before} -> ${far.count}`);
});

test('one beetle is worth exactly two workers', () => {
  const fight = (beetles: number, workers: number) => {
    const s = createGame(31337, 2);
    const a = s.nodes[0];
    const b = s.nodes[1];
    a.x = 100; a.y = 100; b.x = 500; b.y = 500;
    a.owner = 0;
    b.owner = 1;
    s.players[0].home = a.id;
    s.players[1].home = b.id;
    s.trails.length = 0;
    s.packets.length = 0;
    s.packets.push({ owner: 0, unit: 'beetle', amount: beetles, from: a.id, to: b.id, pos: 0.5, air: false, dead: false });
    s.packets.push({ owner: 1, unit: 'worker', amount: workers, from: b.id, to: a.id, pos: 0.5, air: false, dead: false });
    step(s);

    return {
      beetles: s.packets.filter((p) => p.unit === 'beetle').reduce((n, p) => n + p.amount, 0),
      workers: s.packets.filter((p) => p.unit === 'worker').reduce((n, p) => n + p.amount, 0),
    };
  };

  // One beetle kills the first worker and walks on with half of itself left.
  const one = fight(1, 1);
  assert.equal(one.workers, 0, 'the worker must die');
  assert.ok(Math.abs(one.beetles - 0.5) < 1e-9, `half a beetle should remain, got ${one.beetles}`);

  // The second worker takes it with them: two workers exactly trade one beetle.
  const two = fight(1, 2);
  assert.equal(two.workers, 0, 'both workers must die');
  assert.equal(two.beetles, 0, 'and the beetle with them');

  // Three workers beat one beetle and one of them walks away.
  const three = fight(1, 3);
  assert.equal(three.beetles, 0, 'the beetle must die');
  assert.ok(Math.abs(three.workers - 1) < 1e-9, `one worker should survive, got ${three.workers}`);
});

test('a wasp weighs the same as a worker', () => {
  const s = createGame(31337, 2);
  const a = s.nodes[0];
  const b = s.nodes[1];
  a.x = 100; a.y = 100; b.x = 500; b.y = 500;
  // Wasps fly, so they never meet a ground column; against a garrison, though,
  // they hit exactly as hard as workers do.
  assert.equal(UNITS.wasp.power, UNITS.worker.power);
  assert.equal(UNITS.wasp.toughness, UNITS.worker.toughness);
  assert.equal(UNITS.beetle.power, UNITS.worker.power * 2);
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
  assert.ok(avg <= 180, `a match cannot outlast its own clock: ${avg.toFixed(0)}s`);
});

test('a node feeds only as many trails as its kind allows', () => {
  const s = createGame(8821, 2);
  const home = s.nodes[s.players[0].home];
  home.count = 40;
  const budget = KINDS[home.kind].links;
  const targets = s.nodes.filter((n) => n.id !== home.id).slice(0, budget + 2);

  for (let i = 0; i < budget; i++) {
    assert.equal(linksFree(s, home.id), budget - i);
    assert.ok(
      applyCommand(s, { t: 'link', p: 0, from: home.id, to: targets[i].id }),
      `link ${i + 1} of ${budget} should be allowed`,
    );
  }
  assert.equal(linksFree(s, home.id), 0);
  assert.equal(
    applyCommand(s, { t: 'link', p: 0, from: home.id, to: targets[budget].id }),
    false,
    'a node past its budget must refuse',
  );

  // Freeing one slot makes room again -- the budget is per node, not per match.
  assert.ok(applyCommand(s, { t: 'unlink', p: 0, trail: s.trails[0].id }));
  assert.ok(applyCommand(s, { t: 'link', p: 0, from: home.id, to: targets[budget].id }));
});

test('distance is not a rule, but a node in the way is', () => {
  const s = createGame(8821, 2);
  const home = s.nodes[s.players[0].home];
  const dist = (n: GameNode) => distance(home, n);
  const clearAndFar = s.nodes
    .filter((n) => n.id !== home.id && !blockedBy(s, home.id, n.id))
    .sort((a, b) => dist(b) - dist(a))[0];
  assert.ok(dist(clearAndFar) > 600, 'the test needs a genuinely distant node');
  assert.ok(canLink(s, 0, home.id, clearAndFar.id), 'a clear line may be any length');

  const blocked = s.nodes.find((n) => n.id !== home.id && blockedBy(s, home.id, n.id));
  assert.ok(blocked, 'the map should contain at least one obstructed line');
  assert.equal(canLink(s, 0, home.id, blocked!.id), false, 'ants cannot step over a node');

  // A hive flies, so the same obstructed line is fine from one.
  home.kind = 'hive';
  assert.ok(canLink(s, 0, home.id, blocked!.id), 'wasps ignore what is on the ground');
});

test('columns fight wherever they meet, not only in the same corridor', () => {
  const s = createGame(4711, 2);
  const a = s.nodes[0];
  const b = s.nodes[1];
  const c = s.nodes[2];
  const d = s.nodes[3];
  // Two crossing lanes: A->B and C->D, owned by different players, arranged so
  // the two columns are on top of each other right now.
  a.x = 100; a.y = 100; b.x = 500; b.y = 500;
  c.x = 500; c.y = 100; d.x = 100; d.y = 500;
  s.packets.push({ owner: 0, unit: 'worker', amount: 6, from: a.id, to: b.id, pos: 0.5, air: false, dead: false });
  s.packets.push({ owner: 1, unit: 'worker', amount: 4, from: c.id, to: d.id, pos: 0.5, air: false, dead: false });
  step(s);

  const left = s.packets.filter((p) => p.unit === 'worker');
  assert.equal(left.length, 1, 'the weaker crossing column must die');
  assert.equal(left[0].owner, 0);
  assert.ok(Math.abs(left[0].amount - 2) < 1e-9, `survivor should be 6-4=2, was ${left[0].amount}`);
});

test('wasps fly over a fight instead of joining it', () => {
  const s = createGame(4711, 2);
  const a = s.nodes[0];
  const b = s.nodes[1];
  a.x = 100; a.y = 100; b.x = 500; b.y = 500;
  s.packets.push({ owner: 0, unit: 'wasp', amount: 1, from: a.id, to: b.id, pos: 0.5, air: true, dead: false });
  s.packets.push({ owner: 1, unit: 'worker', amount: 40, from: b.id, to: a.id, pos: 0.5, air: false, dead: false });
  step(s);
  assert.ok(s.packets.some((p) => p.unit === 'wasp'), 'an air column is untouchable in the open');
});

test('damage adds up: three streams hurt three times as much as one', () => {
  /**
   * Measures the real drain on one garrison, and what the attackers were
   * producing while doing it. The two must agree: that is the claim, that
   * nothing is dropped when several streams converge on the same node.
   *
   * The attackers are chained so every one of them is supplied -- an unsupplied
   * node produces at a fraction, which would silently make three attackers look
   * like one and a half.
   */
  const measure = (sources: number) => {
    const s = createGame(4242, 2);
    for (const n of s.nodes) {
      n.owner = NEUTRAL;
      n.count = 0;
    }
    const target = s.nodes[0];
    target.owner = 1;
    target.count = KINDS.nest.cap;
    s.players[1].home = target.id;

    const attackers = s.nodes.filter((n) => n.id !== target.id && n.kind === 'nest').slice(0, sources);
    assert.equal(attackers.length, sources, 'the map must have enough nests for this test');
    s.players[0].home = attackers[0].id;

    // Positions are set by hand: this test is about arithmetic, and the map's
    // own layout would otherwise decide it by putting a node in the way.
    target.x = 800;
    target.y = 400;
    const spare = s.nodes.filter((n) => n.id !== target.id && !attackers.includes(n));
    for (const n of spare) {
      n.x = 60;
      n.y = 740;
    }
    attackers.forEach((a, i) => {
      a.owner = 0;
      a.count = 8;
      a.x = 300;
      a.y = 200 + i * 200;
    });
    for (let i = 0; i + 1 < attackers.length; i++) {
      assert.ok(applyCommand(s, { t: 'link', p: 0, from: attackers[i].id, to: attackers[i + 1].id }));
    }
    for (const a of attackers) {
      assert.ok(applyCommand(s, { t: 'link', p: 0, from: a.id, to: target.id }), 'attack must be legal');
    }

    // Attacker garrisons are pinned, so their output is constant and the drain
    // can be compared against it. Otherwise the columns landing now were
    // produced seconds ago, by smaller nodes, and the two never line up.
    const hold = (seconds: number): void => {
      for (let i = 0; i < seconds * TICK_HZ; i++) {
        for (const a of attackers) a.count = 8;
        target.count = Math.min(target.count, KINDS.nest.cap);
        step(s);
      }
    };

    hold(10);
    assert.equal(target.owner, 1, 'the target must still be holding when measured');
    for (const a of attackers) assert.ok(s.supplied[a.id], 'every attacker must be supplied');
    // Only the share actually aimed at the target counts as the assault.
    const output = attackers.reduce((sum, a) => {
      const trails = s.trails.filter((t) => t.from === a.id).length;

      return sum + outputRate(s, a) / trails;
    }, 0);
    const before = target.count;
    const window = 6;
    hold(window);

    return { drain: (before - target.count) / window, output };
  };

  const one = measure(1);
  const three = measure(3);
  assert.ok(one.drain > 0, `a single attacker must do something, did ${one.drain}/s`);
  assert.ok(
    Math.abs(one.drain - one.output) < one.output * 0.3,
    `one stream: drain ${one.drain.toFixed(1)}/s vs aimed output ${one.output.toFixed(1)}/s`,
  );
  assert.ok(
    Math.abs(three.drain - three.output) < three.output * 0.3,
    `three streams: drain ${three.drain.toFixed(1)}/s vs aimed output ${three.output.toFixed(1)}/s`,
  );
  // Not a clean three times: two of the three attackers spend half their output
  // holding the supply chain up, so what is aimed at the target is twice one
  // node's stream, and the damage is exactly that. Concentration adds up; it
  // just costs something to concentrate.
  assert.ok(
    three.drain > one.drain * 1.9,
    `three streams should hurt far more: ${three.drain.toFixed(1)} vs ${one.drain.toFixed(1)}`,
  );
});
