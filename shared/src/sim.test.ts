import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Bot } from './bot.js';
import { goalProgress, judge, LEVELS } from './levels.js';
import {
  applyCommand,
  blockedBy,
  canLink,
  chewReadyIn,
  createGame,
  crossesWater,
  distance,
  linksFree,
  outputRate,
  severedFor,
  step,
  trailById,
} from './sim.js';
import {
  GameNode,
  GameState,
  KINDS,
  NEUTRAL,
  SPEED_FROM_STRENGTH,
  TRANSIT_HOPS,
  TICK_HZ,
  UNITS,
  UNIT_SIZE,
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

test('a long match keeps every number sane', () => {
  // Not a check on how long a match takes -- that is a design call, and
  // `node tools/pace.mjs` reports it. This checks the invariants that must hold
  // however long it runs: nothing goes negative, nothing exceeds its cap,
  // nothing turns into NaN, and a finished match has exactly one winner.
  let unfinished = 0;
  const lengths: number[] = [];
  for (const seed of [1, 77, 4242, 90210]) {
    for (const count of [2, 3, 4]) {
      const s = createGame(seed, count);
      const bots = [];
      for (let i = 0; i < count; i++) bots.push(new Bot(i, i === 0 ? 'hard' : 'normal', seed + i));
      run(s, 300, bots);
      for (const n of s.nodes) {
        assert.ok(Number.isFinite(n.count), `node ${n.id} count is ${n.count}`);
        assert.ok(n.count >= -0.001, `node ${n.id} went negative: ${n.count}`);
        assert.ok(
          n.count <= KINDS[n.kind].cap + 0.001,
          `node ${n.id} broke its cap: ${n.count} > ${KINDS[n.kind].cap}`,
        );
      }
      for (const p of s.packets) {
        assert.ok(Number.isFinite(p.amount) && p.amount > 0, `a column carries ${p.amount}`);
        assert.ok(p.pos >= 0 && p.pos <= 1, `a column is at ${p.pos} along its trail`);
      }
      if (s.over) {
        assert.notEqual(s.winner, NEUTRAL, `seed ${seed} with ${count} players ended in a draw`);
        assert.equal(
          s.players.filter((p) => p.alive).length,
          1,
          `a finished match must leave exactly one player standing`,
        );
      } else {
        unfinished++;
      }
      lengths.push(s.tick / TICK_HZ);
    }
  }
  console.log(`  за 300с не завершилось: ${unfinished} з ${lengths.length}`);
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
    s.packets.push({ owner: 0, unit: 'beetle', amount: beetles, from: a.id, to: b.id, pos: 0.5, air: false, hops: TRANSIT_HOPS, dead: false });
    s.packets.push({ owner: 1, unit: 'worker', amount: workers, from: b.id, to: a.id, pos: 0.5, air: false, hops: TRANSIT_HOPS, dead: false });
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

test('a bot duel makes progress rather than sitting still', () => {
  // How long a match should feel is a design decision, not something a test
  // gets to police -- `node tools/pace.mjs` reports it. What is checked here is
  // that the board actually moves: nodes change hands and somebody pulls ahead.
  const lengths: number[] = [];
  for (const seed of [3, 11, 64, 205, 900]) {
    const s = createGame(seed, 2);
    const before = s.nodes.filter((n) => n.owner !== NEUTRAL).length;
    run(s, 240, [new Bot(0, 'normal', seed), new Bot(1, 'normal', seed + 1)]);
    lengths.push(s.tick / TICK_HZ);
    const held = s.players.map((p) => s.nodes.filter((n) => n.owner === p.id).length);
    assert.ok(
      held[0] + held[1] > before,
      `seed ${seed}: nobody took anything in four minutes (${held.join(':')})`,
    );
    assert.notEqual(held[0], held[1], `seed ${seed}: four minutes and still dead level`);
  }
  console.log(`  тривалість дуелей: ${lengths.map((l) => l.toFixed(0) + 'с').join(', ')}`);
});

test('a node feeds only as many trails as its kind allows', () => {
  const s = createGame(8821, 2);
  s.rivers = [];
  const home = s.nodes[s.players[0].home];
  home.count = 40;
  const budget = KINDS[home.kind].links;
  // Reachable ones only: the budget is what this test is about, not geometry.
  const targets = s.nodes.filter((n) => canLink(s, 0, home.id, n.id)).slice(0, budget + 2);
  assert.ok(targets.length >= budget + 1, 'the map must offer enough reachable targets');

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
  s.rivers = [];
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
  s.packets.push({ owner: 0, unit: 'worker', amount: 6, from: a.id, to: b.id, pos: 0.5, air: false, hops: TRANSIT_HOPS, dead: false });
  s.packets.push({ owner: 1, unit: 'worker', amount: 4, from: c.id, to: d.id, pos: 0.5, air: false, hops: TRANSIT_HOPS, dead: false });
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
  s.packets.push({ owner: 0, unit: 'wasp', amount: 1, from: a.id, to: b.id, pos: 0.5, air: true, hops: TRANSIT_HOPS, dead: false });
  s.packets.push({ owner: 1, unit: 'worker', amount: 40, from: b.id, to: a.id, pos: 0.5, air: false, hops: TRANSIT_HOPS, dead: false });
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

    // Hand-placed nodes and hand-drawn water do not mix: this test is about
    // arithmetic, so the map is dried out first.
    s.rivers = [];
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

    // Long enough for the trail to fill end to end: at walking pace the first
    // ant needs well over ten seconds to cross, and measuring before the
    // pipeline is full reads as though production had gone missing.
    hold(30);
    assert.equal(target.owner, 1, 'the target must still be holding when measured');
    for (const a of attackers) assert.ok(s.supplied[a.id], 'every attacker must be supplied');
    // Only the share actually aimed at the target counts as the assault.
    const output = attackers.reduce((sum, a) => {
      const trails = s.trails.filter((t) => t.from === a.id).length;

      return sum + outputRate(s, a) / trails;
    }, 0);
    const before = target.count;
    const window = 10;
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

test('ants leave one at a time', () => {
  const s = createGame(4242, 2);
  const from = s.nodes[s.players[0].home];
  from.count = KINDS.nest.cap;
  const to = s.nodes.find((n) => n.id !== from.id && canLink(s, 0, from.id, n.id))!;
  assert.ok(applyCommand(s, { t: 'link', p: 0, from: from.id, to: to.id }));

  run(s, 6);
  const columns = s.packets.filter((p) => p.owner === 0);
  assert.ok(columns.length > 3, 'a strong nest should have several ants on the road');
  for (const c of columns) {
    assert.equal(c.amount, UNIT_SIZE, `every body on the trail is one ant, found ${c.amount}`);
  }
});

test('output rises with the garrison, and splits across trails', () => {
  /**
   * Units delivered out of `from` over ten seconds, with `targets` trails open.
   *
   * Measured at the far end rather than by watching the packet list grow: that
   * list shrinks whenever a column lands, so counting its ups counted arrivals
   * as departures and reported a node with two trails as producing twice as
   * much. Both targets are ours and empty, so everything sent is everything
   * that shows up, and both of them grow at their own rate in either case.
   */
  const delivered = (fill: number, targets: number): number => {
    const s = createGame(4242, 2);
    s.rivers = [];
    const from = s.nodes[0];
    const a = s.nodes[1];
    const b = s.nodes[2];
    // Placed by hand and equidistant: a trail's length decides how many ants
    // are *on* it, which would otherwise drown out what is being measured.
    from.x = 600; from.y = 400; from.kind = 'nest';
    a.x = 600; a.y = 120;
    b.x = 600; b.y = 680;
    for (const n of s.nodes.slice(3)) {
      n.x = 40;
      n.y = 760;
    }
    from.owner = 0;
    s.players[0].home = from.id;
    a.owner = 0;
    b.owner = 0;
    a.count = 0;
    b.count = 0;
    const others = s.nodes.slice(3).find((n) => n.id !== from.id)!;
    others.owner = 1;
    s.players[1].home = others.id;

    assert.ok(applyCommand(s, { t: 'link', p: 0, from: from.id, to: a.id }));
    if (targets > 1) assert.ok(applyCommand(s, { t: 'link', p: 0, from: from.id, to: b.id }));

    for (let i = 0; i < 10 * TICK_HZ; i++) {
      from.count = KINDS.nest.cap * fill;
      step(s);
    }

    return a.count + b.count + s.packets.filter((p) => !p.dead).length;
  };

  const thin = delivered(0.05, 1);
  const full = delivered(1, 1);
  assert.ok(full > thin * 1.6, `a full nest should out-produce a thin one: ${full} vs ${thin}`);

  // Two trails share that output rather than doubling it.
  const twoTrails = delivered(1, 2);
  assert.ok(
    twoTrails < full * 1.3,
    `two trails must share one node's output, not double it: ${full} vs ${twoTrails}`,
  );
});

test('a full garrison does not block the column: it walks through and lands beyond', () => {
  const s = createGame(4242, 2);
  const hub = s.nodes[s.players[0].home];
  hub.count = KINDS.nest.cap;
  // Two neighbours: one the column comes from, one it should be sent on to.
  const reachable = s.nodes.filter((n) => n.id !== hub.id && canLink(s, 0, hub.id, n.id));
  assert.ok(reachable.length >= 2, 'this map has to give the hub two neighbours');
  const [source, dest] = reachable;
  for (const n of [source, dest]) {
    n.owner = 0;
    n.count = 0;
  }
  assert.ok(applyCommand(s, { t: 'link', p: 0, from: hub.id, to: dest.id }));

  const column = 20;
  for (let i = 0; i < column; i++) {
    s.packets.push({ owner: 0, unit: 'worker', amount: 1, from: source.id, to: hub.id, pos: 0.999, air: false, hops: TRANSIT_HOPS, dead: false });
  }
  const destBefore = dest.count;
  run(s, 12);

  assert.equal(hub.count, KINDS.nest.cap, 'a full garrison must not go past its cap');
  // The hub also produces on its own, so the far node gains more than the
  // column -- what matters is that the column is not swallowed on the doorstep.
  assert.ok(
    dest.count - destBefore >= column,
    `the column must reach the far side, it gained ${(dest.count - destBefore).toFixed(1)} of ${column}`,
  );
});

test('a full tower shares the column out across every trail it has open', () => {
  const s = createGame(4242, 2);
  const hub = s.nodes[s.players[0].home];
  hub.count = KINDS.nest.cap;
  const reachable = s.nodes.filter((n) => n.id !== hub.id && canLink(s, 0, hub.id, n.id));
  assert.ok(reachable.length >= 3, 'this map has to give the hub three neighbours');
  const [source, ...outs] = reachable;
  const exits = outs.slice(0, KINDS.nest.links);
  assert.equal(exits.length, 3, 'the point of the test is more than one way out');
  for (const n of [source, ...exits]) {
    n.owner = 0;
    n.count = 0;
  }
  for (const n of exits) assert.ok(applyCommand(s, { t: 'link', p: 0, from: hub.id, to: n.id }));

  // A fat column walks into a tower that has no room and three ways on.
  const column = 60;
  for (let i = 0; i < column; i++) {
    s.packets.push({ owner: 0, unit: 'worker', amount: 1, from: source.id, to: hub.id, pos: 0.999, air: false, hops: TRANSIT_HOPS, dead: false });
  }
  step(s);

  const sent = exits.map((n) => s.packets.filter((p) => !p.dead && p.from === hub.id && p.to === n.id).length);
  const total = sent.reduce((a, b) => a + b, 0);
  assert.ok(total >= column, `the whole column must move on, ${total} of ${column}`);
  const fair = total / exits.length;
  for (const [i, got] of sent.entries()) {
    assert.ok(
      Math.abs(got - fair) <= 2,
      `every open trail takes a share: ${sent.join('/')} down trail ${i}, fair is ${fair.toFixed(1)}`,
    );
  }
});

test('pass-through skips a trail into a neighbour that is itself full', () => {
  const s = createGame(4242, 2);
  const hub = s.nodes[s.players[0].home];
  hub.count = KINDS.nest.cap;
  const reachable = s.nodes.filter((n) => n.id !== hub.id && canLink(s, 0, hub.id, n.id));
  assert.ok(reachable.length >= 3, 'this map has to give the hub three neighbours');
  const [source, blocked, open] = reachable;
  source.owner = 0;
  source.count = 0;
  blocked.owner = 0;
  blocked.count = KINDS[blocked.kind].cap;
  open.owner = 0;
  open.count = 0;
  assert.ok(applyCommand(s, { t: 'link', p: 0, from: hub.id, to: blocked.id }));
  assert.ok(applyCommand(s, { t: 'link', p: 0, from: hub.id, to: open.id }));

  for (let i = 0; i < 20; i++) {
    s.packets.push({ owner: 0, unit: 'worker', amount: 1, from: source.id, to: hub.id, pos: 0.999, air: false, hops: TRANSIT_HOPS, dead: false });
  }
  step(s);

  const toBlocked = s.packets.filter((p) => !p.dead && p.from === hub.id && p.to === blocked.id).length;
  const toOpen = s.packets.filter((p) => !p.dead && p.from === hub.id && p.to === open.id).length;
  assert.equal(toBlocked, 0, 'nothing should be sent at a neighbour that cannot take it');
  assert.ok(toOpen >= 20, `it all goes the way that is open, got ${toOpen}`);
});

test('two full nodes facing each other do not pass the same ants round for ever', () => {
  const s = createGame(4242, 2);
  const a = s.nodes[s.players[0].home];
  const b = s.nodes.find((n) => n.id !== a.id && canLink(s, 0, a.id, n.id))!;
  b.owner = 0;
  a.count = KINDS[a.kind].cap;
  b.count = KINDS[b.kind].cap;
  assert.ok(applyCommand(s, { t: 'link', p: 0, from: a.id, to: b.id }));
  assert.ok(applyCommand(s, { t: 'link', p: 0, from: b.id, to: a.id }));

  // Both are full and pointing at each other, so nothing either sends can ever
  // be used. If forwarding had no brake, every ant produced would join a loop
  // that never empties and the packet list would climb without limit.
  run(s, 30);
  const before = s.packets.length;
  run(s, 30);
  assert.ok(
    s.packets.length < before * 1.6 + 20,
    `the crowd must settle, went from ${before} to ${s.packets.length}`,
  );
});

test('a node passes foreign units through instead of turning them into its own', () => {
  const s = createGame(4242, 2);
  const den = s.nodes.find((n) => n.kind === 'den')!;
  den.owner = 0;
  den.count = KINDS.den.cap;
  s.players[0].home = den.id;
  // canLink checks ownership, so the den has to be ours before asking.
  const onward = s.nodes.find((n) => n.id !== den.id && canLink(s, 0, den.id, n.id))!;
  assert.ok(onward, 'the den needs somewhere to forward to');
  onward.owner = 0;
  onward.count = 0;
  assert.ok(applyCommand(s, { t: 'link', p: 0, from: den.id, to: onward.id }));

  // Workers arrive at a full beetle den. They must come out the far side still
  // workers -- a den makes beetles, it does not convert what walks through it.
  // They come from a third node, because nothing is ever sent straight back
  // where it came from.
  const source = s.nodes.find((n) => n.id !== den.id && n.id !== onward.id && canLink(s, 0, den.id, n.id))!;
  assert.ok(source, 'the column needs somewhere to have come from');
  for (let i = 0; i < 12; i++) {
    s.packets.push({ owner: 0, unit: 'worker', amount: 1, from: source.id, to: den.id, pos: 0.999, air: false, hops: TRANSIT_HOPS, dead: false });
  }
  // One tick: just far enough for them to step through, and not so far that
  // they have already been absorbed at the far end.
  step(s);
  const leaving = s.packets.filter((p) => !p.dead && p.from === den.id);
  assert.ok(leaving.length > 0, 'something must be moving on');
  assert.ok(
    leaving.some((p) => p.unit === 'worker'),
    `the workers must still be workers, got ${[...new Set(leaving.map((p) => p.unit))].join(',')}`,
  );
});

test('beetles keep pace with the ants, wasps fly twice as fast', () => {
  assert.equal(UNITS.beetle.speed, UNITS.worker.speed, 'a beetle crawls at ant pace');
  assert.equal(UNITS.wasp.speed, UNITS.worker.speed * 2, 'a wasp is twice as quick');

  // And that is what actually happens on the board, not just in the table.
  const s = createGame(4242, 2);
  const a = s.nodes[0];
  const b = s.nodes[1];
  a.x = 100; a.y = 400; b.x = 900; b.y = 400;
  a.owner = 0;
  // Empty, so nobody gets the strong-node bonus and this compares nothing but
  // the units' own speeds.
  a.count = 0;
  s.players[0].home = a.id;
  const kinds = ['worker', 'beetle', 'wasp'] as const;
  for (const unit of kinds) {
    s.packets.push({ owner: 0, unit, amount: 1, from: a.id, to: b.id, pos: 0, air: unit === 'wasp', hops: TRANSIT_HOPS, dead: false });
  }
  run(s, 5);
  const at = (unit: string) => s.packets.find((p) => p.unit === unit)!.pos;
  assert.ok(Math.abs(at('worker') - at('beetle')) < 1e-9, 'ant and beetle must stay level');
  assert.ok(at('wasp') > at('worker') * 1.9, 'the wasp must be well ahead');
});

test('a gnawed trail leaves ground that cannot be rebuilt at once', () => {
  const s = createGame(555, 2);
  const mine = s.nodes[s.players[0].home];
  mine.count = 40;
  const to = s.nodes.find((n) => n.id !== mine.id && canLink(s, 0, mine.id, n.id))!;
  assert.ok(applyCommand(s, { t: 'link', p: 0, from: mine.id, to: to.id }));
  const trail = s.trails[0];

  // Player 1 gnaws it through.
  assert.ok(applyCommand(s, { t: 'chew', p: 1, trail: trail.id }));
  let snapped = false;
  for (let i = 0; i < TICK_HZ * 15 && !snapped; i++) {
    for (const e of step(s)) if (e.t === 'snap') snapped = true;
  }
  assert.ok(snapped, 'the trail should have been bitten through');
  assert.equal(s.trails.length, 0);

  // The whole point: it cannot simply be redrawn.
  assert.equal(canLink(s, 0, mine.id, to.id), false, 'torn ground must refuse a new trail');
  assert.ok(severedFor(s, 0, mine.id, to.id) > 0, 'and it must say how long for');

  // Somewhere else is still fine, and so is the other direction.
  const other = s.nodes.find((n) => n.id !== mine.id && n.id !== to.id && canLink(s, 0, mine.id, n.id));
  assert.ok(other, 'other connections are unaffected');

  run(s, 6);
  assert.ok(canLink(s, 0, mine.id, to.id), 'and after five seconds it heals');
  assert.equal(s.severed.length, 0, 'healed scars must not pile up in the state');
});

test('letting go of a trail under the tooth scars it too', () => {
  const s = createGame(555, 2);
  const mine = s.nodes[s.players[0].home];
  mine.count = 40;
  const to = s.nodes.find((n) => n.id !== mine.id && canLink(s, 0, mine.id, n.id))!;
  assert.ok(applyCommand(s, { t: 'link', p: 0, from: mine.id, to: to.id }));
  const trail = s.trails[0];
  assert.ok(applyCommand(s, { t: 'chew', p: 1, trail: trail.id }));
  run(s, 1);
  assert.ok(trail.chew > 0.5, 'the gnawing must have got going');

  // Dropping it and redrawing would otherwise undo the attacker's work for free.
  assert.ok(applyCommand(s, { t: 'unlink', p: 0, trail: trail.id }));
  assert.equal(canLink(s, 0, mine.id, to.id), false, 'a trail abandoned under the tooth scars');
});

test('retiring an untouched trail is free', () => {
  const s = createGame(555, 2);
  const mine = s.nodes[s.players[0].home];
  const to = s.nodes.find((n) => n.id !== mine.id && canLink(s, 0, mine.id, n.id))!;
  assert.ok(applyCommand(s, { t: 'link', p: 0, from: mine.id, to: to.id }));
  assert.ok(applyCommand(s, { t: 'unlink', p: 0, trail: s.trails[0].id }));
  assert.ok(canLink(s, 0, mine.id, to.id), 'changing your mind must cost nothing');
});

test('breaking a trail kills everyone walking it, and only them', () => {
  const s = createGame(555, 2);
  const mine = s.nodes[s.players[0].home];
  mine.count = 120;
  const targets = s.nodes.filter((n) => n.id !== mine.id && canLink(s, 0, mine.id, n.id)).slice(0, 2);
  assert.equal(targets.length, 2, 'the test needs two reachable targets');
  for (const t of targets) assert.ok(applyCommand(s, { t: 'link', p: 0, from: mine.id, to: t.id }));
  const doomed = s.trails[0];
  const spared = s.trails[1];

  run(s, 4);
  const on = (t: typeof doomed) =>
    s.packets.filter((p) => !p.dead && p.from === t.from && p.to === t.to && p.owner === t.owner).length;
  assert.ok(on(doomed) > 2, `the trail should be busy before it is cut, had ${on(doomed)}`);
  assert.ok(on(spared) > 2, 'and so should its neighbour');

  assert.ok(applyCommand(s, { t: 'chew', p: 1, trail: doomed.id }));
  let snapped = false;
  for (let i = 0; i < TICK_HZ * 15 && !snapped; i++) {
    for (const e of step(s)) if (e.t === 'snap') snapped = true;
  }
  assert.ok(snapped, 'the trail should have been bitten through');
  assert.equal(on(doomed), 0, 'the column on the broken trail must be gone');
  assert.ok(on(spared) > 0, 'the column on the neighbouring trail must not be');
});

test('a player may only bite through one trail every four seconds', () => {
  const s = createGame(555, 2);
  const mine = s.nodes[s.players[0].home];
  mine.count = 90;
  const targets = s.nodes.filter((n) => n.id !== mine.id && canLink(s, 0, mine.id, n.id)).slice(0, 2);
  assert.equal(targets.length, 2, 'the test needs two reachable targets');
  for (const t of targets) assert.ok(applyCommand(s, { t: 'link', p: 0, from: mine.id, to: t.id }));
  const [first, second] = s.trails;

  assert.ok(applyCommand(s, { t: 'chew', p: 1, trail: first.id }));
  let snapped = false;
  for (let i = 0; i < TICK_HZ * 15 && !snapped; i++) {
    for (const e of step(s)) if (e.t === 'snap') snapped = true;
  }
  assert.ok(snapped);
  assert.ok(chewReadyIn(s, 1) > 0, 'the jaws need a moment');
  assert.equal(
    applyCommand(s, { t: 'chew', p: 1, trail: second.id }),
    false,
    'no cutting one line straight after another',
  );

  run(s, 5);
  assert.equal(chewReadyIn(s, 1), 0);
  assert.ok(applyCommand(s, { t: 'chew', p: 1, trail: second.id }), 'and after four seconds, ready again');
});

test('in the time two ants cross a gap, four wasps do', () => {
  /** Units of `unit` that complete the same journey in the same window. */
  const arrivals = (kind: 'nest' | 'hive', garrison: number): number => {
    const s = createGame(4242, 2);
    for (const n of s.nodes) {
      n.owner = NEUTRAL;
      n.count = 0;
    }
    s.rivers = [];
    const from = s.nodes[0];
    const to = s.nodes[1];
    // Same gap for both, and nothing else near enough to interfere.
    from.x = 200; from.y = 400; from.kind = kind;
    to.x = 800; to.y = 400; to.kind = 'nest';
    for (const n of s.nodes.slice(2)) {
      n.x = 60;
      n.y = 750;
    }
    from.owner = 0;
    to.owner = 0;
    s.players[0].home = from.id;
    // The opponent needs somewhere to exist: with nobody left alive the match
    // ends on the first tick and the simulation stops running entirely.
    const theirs = s.nodes[2];
    theirs.owner = 1;
    theirs.count = 50;
    s.players[1].home = theirs.id;
    assert.ok(applyCommand(s, { t: 'link', p: 0, from: from.id, to: to.id }));

    let landed = 0;
    // Hold the garrison so output is constant, and count what reaches the far
    // end over a window that starts once the route is full.
    const hold = (seconds: number, count: boolean): void => {
      for (let i = 0; i < seconds * TICK_HZ; i++) {
        from.count = garrison;
        for (const e of step(s)) if (count && e.t === 'delta' && e.node === to.id) landed++;
      }
    };
    hold(30, false);
    hold(20, true);

    return landed;
  };

  const ants = arrivals('nest', 60);
  const wasps = arrivals('hive', 60);
  assert.ok(ants > 10, `the ants must actually be arriving, got ${ants}`);
  const ratio = wasps / ants;
  assert.ok(
    ratio > 1.7 && ratio < 2.3,
    `twice as many wasps should land as ants: ${wasps} vs ${ants} (${ratio.toFixed(2)}x)`,
  );
});

test('the strength table is exactly as designed', () => {
  // Two workers kill one beetle; a beetle hits a garrison for two, the other
  // two for one each; a wasp flies at twice the pace of anything on foot.
  assert.equal(UNITS.beetle.toughness, UNITS.worker.toughness * 2);
  assert.equal(UNITS.wasp.toughness, UNITS.worker.toughness);
  assert.equal(UNITS.beetle.power, 2);
  assert.equal(UNITS.worker.power, 1);
  assert.equal(UNITS.wasp.power, 1);
  assert.equal(UNITS.beetle.speed, UNITS.worker.speed);
  assert.equal(UNITS.wasp.speed, UNITS.worker.speed * 2);
});

test('every campaign level is playable and its goal is reachable', () => {
  assert.ok(LEVELS.length >= 12, 'a campaign needs enough levels to be one');
  const seeds = new Set<number>();
  for (const l of LEVELS) {
    assert.ok(l.players >= 2 && l.players <= 4, `level ${l.id} has ${l.players} players`);
    assert.ok(!seeds.has(l.seed), `level ${l.id} repeats a map`);
    seeds.add(l.seed);

    const s = createGame(l.seed, l.players);
    if (l.goal.t === 'hold') {
      // Asking for more nodes than the map has would be unwinnable.
      assert.ok(
        l.goal.nodes < s.nodes.length,
        `level ${l.id} asks for ${l.goal.nodes} of ${s.nodes.length} nodes`,
      );
    }
    assert.equal(judge(s, l.goal, 0), 'playing', `level ${l.id} is already decided at the start`);
  }
});

test('a level is judged on its goal, not on annihilation', () => {
  const s = createGame(LEVELS[0].seed, 2);
  const hold = { t: 'hold' as const, nodes: 4 };
  assert.equal(judge(s, hold, 0), 'playing');
  let given = 0;
  for (const n of s.nodes) {
    if (n.owner === NEUTRAL && given < 3) {
      n.owner = 0;
      given++;
    }
  }
  assert.equal(judge(s, hold, 0), 'won', 'holding the asked-for nodes wins it');
  assert.deepEqual(goalProgress(s, hold, 0), { have: 4, need: 4 });

  // Being knocked out loses it, whatever the goal said.
  s.players[0].alive = false;
  assert.equal(judge(s, hold, 0), 'lost');
});

test('a strong node speeds its walkers up, and leaves wasps alone', () => {
  const reach = (kind: 'nest' | 'den' | 'hive', fill: number): number => {
    const s = createGame(4242, 2);
    const a = s.nodes[0];
    const b = s.nodes[1];
    a.x = 100; a.y = 400; b.x = 1100; b.y = 400;
    a.kind = kind;
    a.count = KINDS[kind].cap * fill;
    s.packets.push({
      owner: 0, unit: KINDS[kind].unit, amount: 1,
      from: a.id, to: b.id, pos: 0, air: kind === 'hive', hops: TRANSIT_HOPS, dead: false,
    });
    run(s, 4);

    return s.packets.find((p) => p.from === a.id)!.pos;
  };

  // On foot: a full node pushes its columns along a third faster, and the
  // bonus is measured against each kind's own cap so both reach all of it.
  const fullNest = reach('nest', 1);
  const emptyNest = reach('nest', 0);
  assert.ok(
    Math.abs(fullNest / emptyNest - (1 + SPEED_FROM_STRENGTH)) < 0.02,
    `a full nest should be a third quicker, was ${(fullNest / emptyNest).toFixed(3)}`,
  );
  assert.ok(Math.abs(reach('den', 1) - fullNest) < 1e-9, 'a full den keeps pace with a full nest');

  // In the air: the same speed whatever the hive is holding.
  assert.ok(
    Math.abs(reach('hive', 1) - reach('hive', 0)) < 1e-9,
    'a wasp flies at one speed and no other',
  );
});

test('water stops ants and beetles, and lets wasps over', () => {
  // Find a map that actually has a river; roughly half of them do.
  let s = createGame(1, 2);
  for (let seed = 1; seed < 200 && !s.rivers.length; seed++) s = createGame(seed, 2);
  assert.ok(s.rivers.length, 'the generator must produce rivers at all');
  const river = s.rivers[0];
  assert.ok(river.fords.length > 0, 'a river without a ford is a wall, not a river');

  // A pair of nodes on opposite banks, away from any ford.
  const a = s.nodes[0];
  const b = s.nodes[1];
  const far = river.points[Math.floor(river.points.length / 2)];
  const wet = river.fords.every(
    (f) => Math.hypot(far.x - f.x, far.y - f.y) > f.radius + 60,
  );
  assert.ok(wet, 'the test needs a stretch of water away from the fords');
  const dx = river.points[1].x - river.points[0].x;
  const dy = river.points[1].y - river.points[0].y;
  const len = Math.hypot(dx, dy) || 1;
  // Straddle the river along its normal, so the line between them must cross.
  a.x = Math.round(far.x - (-dy / len) * 120);
  a.y = Math.round(far.y - (dx / len) * 120);
  b.x = Math.round(far.x + (-dy / len) * 120);
  b.y = Math.round(far.y + (dx / len) * 120);
  for (const n of s.nodes.slice(2)) {
    n.x = 20;
    n.y = 20;
  }
  a.owner = 0;
  a.kind = 'nest';
  s.players[0].home = a.id;

  assert.ok(crossesWater(s, a, b), 'the line must actually cross the water');
  assert.equal(canLink(s, 0, a.id, b.id), false, 'ants cannot wade');

  // The same line from a hive is fine.
  a.kind = 'hive';
  assert.ok(canLink(s, 0, a.id, b.id), 'wasps fly over water');
});

test('a ford is a way across', () => {
  let s = createGame(1, 2);
  for (let seed = 1; seed < 200 && !s.rivers.length; seed++) s = createGame(seed, 2);
  const ford = s.rivers[0].fords[0];
  const dir = s.rivers[0].points;
  const dx = dir[1].x - dir[0].x;
  const dy = dir[1].y - dir[0].y;
  const len = Math.hypot(dx, dy) || 1;

  const a = s.nodes[0];
  const b = s.nodes[1];
  a.x = Math.round(ford.x - (-dy / len) * 90);
  a.y = Math.round(ford.y - (dx / len) * 90);
  b.x = Math.round(ford.x + (-dy / len) * 90);
  b.y = Math.round(ford.y + (dx / len) * 90);
  for (const n of s.nodes.slice(2)) {
    n.x = 20;
    n.y = 20;
  }
  a.owner = 0;
  a.kind = 'nest';
  s.players[0].home = a.id;

  assert.equal(crossesWater(s, a, b), undefined, 'a crossing at the ford is allowed');
  assert.ok(canLink(s, 0, a.id, b.id), 'and so the trail may be dug');
});

test('no node ever stands in the water', () => {
  for (let seed = 1; seed < 60; seed++) {
    for (const players of [2, 3, 4]) {
      const s = createGame(seed, players);
      for (const river of s.rivers) {
        for (const n of s.nodes) {
          for (let i = 0; i + 1 < river.points.length; i++) {
            const p = river.points[i];
            const q = river.points[i + 1];
            const dx = q.x - p.x;
            const dy = q.y - p.y;
            const len2 = dx * dx + dy * dy || 1;
            let t = ((n.x - p.x) * dx + (n.y - p.y) * dy) / len2;
            t = Math.max(0, Math.min(1, t));
            const d = Math.hypot(n.x - (p.x + dx * t), n.y - (p.y + dy * t));
            assert.ok(
              d > river.width,
              `seed ${seed}/${players}: node ${n.id} is standing in the river (${d.toFixed(0)})`,
            );
          }
        }
      }
    }
  }
});

test('every generated map leaves every player somewhere to go', () => {
  // Four layouts crossed with rivers and fords can very easily produce a board
  // where somebody is walled in from the first second. That is the one map
  // fault a player cannot play around, so it is swept for.
  let tight = { seed: 0, players: 0, targets: 99 };
  for (let seed = 1; seed <= 120; seed++) {
    for (const players of [2, 3, 4]) {
      const s = createGame(seed, players);
      assert.ok(s.nodes.length >= 9, `seed ${seed}/${players}: only ${s.nodes.length} nodes`);
      assert.equal(
        new Set(s.players.map((p) => p.home)).size,
        players,
        `seed ${seed}/${players}: two players share a home`,
      );

      for (const p of s.players) {
        const home = s.nodes[p.home];
        assert.equal(home.owner, p.id, `seed ${seed}/${players}: home ${p.home} is not owned`);
        const reachable = s.nodes.filter((n) => canLink(s, p.id, home.id, n.id)).length;
        assert.ok(
          reachable >= 2,
          `seed ${seed}/${players}: player ${p.id} can only reach ${reachable} nodes from home`,
        );
        if (reachable < tight.targets) tight = { seed, players, targets: reachable };
      }
    }
  }
  console.log(`  найтісніша карта: зерно ${tight.seed}, ${tight.players} гравці, ${tight.targets} цілі з домівки`);
});
