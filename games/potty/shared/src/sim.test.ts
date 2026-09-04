import test from 'node:test';
import assert from 'node:assert/strict';
import { castFor, createGame, fits, happyCount, jammed, step } from './sim.js';
import {
  AnimalId,
  BIG,
  Event,
  FIELD_W,
  FLOOR_Y,
  GOAL,
  POTTY_CAP,
  POTTY_W,
  PottyState,
  POUR_X,
  MIDDLING,
  SEATS,
  SIZE,
  SMALL,
  START_AWAKE,
  STRIKES,
  TOILET_X,
  WAIT,
} from './types.js';

const DT = 1 / 60;

/** Runs the game with a fixed aim and collects what happened. */
function play(s: PottyState, seconds: number, aim: (s: PottyState) => number): Event[] {
  const out: Event[] = [];
  for (let i = 0; i < seconds * 60; i++) out.push(...step(s, DT, aim(s)));

  return out;
}

/** A player who helps whoever is asking, and empties the potty when it is full. */
function helper(s: PottyState): number {
  // Stays put while something is still falling: driving off the moment an
  // animal lets go wastes the trip, and now costs it a strike as well.
  if (s.drops.length) return SEATS[s.drops[0].seat].x;
  const asking = s.animals.find((a) => a.urge !== null);
  if (!asking) return s.pottyX;
  if (!fits(s, asking)) return TOILET_X;

  return SEATS[asking.seat].x;
}

// ------------------------------------------------------------------ the ask

test('nothing falls until the potty is underneath', () => {
  // The whole game rests on this: a miss is never bad luck, it is always
  // somebody who was not helped.
  const s = createGame(4);
  const events = play(s, 3.5, () => 0);

  assert.ok(events.some((e) => e.t === 'urge'), 'nobody ever asked');
  assert.ok(!events.some((e) => e.t === 'drop'), 'something fell with no potty under it');
  assert.equal(s.drops.length, 0);
});

test('putting the potty under an asking animal makes it go', () => {
  const s = createGame(4);
  play(s, 1.5, () => 0);
  const asking = s.animals.find((a) => a.urge !== null)!;
  const events = play(s, 2.5, () => SEATS[asking.seat].x);

  assert.ok(events.some((e) => e.t === 'drop' && e.seat === asking.seat), 'it did not let go');
  assert.ok(events.some((e) => e.t === 'catch'), 'it did not land in the potty');
});

test('a full potty cannot help anybody, however well it is placed', () => {
  const s = createGame(4);
  s.held = POTTY_CAP;
  play(s, 1.5, () => 0);
  const asking = s.animals.find((a) => a.urge !== null)!;
  const events = play(s, 2, () => SEATS[asking.seat].x);

  assert.ok(!events.some((e) => e.t === 'drop'), 'a full potty took another one');
});

// -------------------------------------------------------------- the strikes

test('the first time nobody comes, it just lands on the floor', () => {
  const s = createGame(4);
  const events = play(s, WAIT[0] + 3, () => 0);
  const angry = events.filter((e) => e.t === 'angry');

  assert.ok(angry.length > 0, 'nobody was left waiting');
  assert.equal((angry[0] as { strikes: number }).strikes, 1);
  assert.ok(events.some((e) => e.t === 'miss'), 'nothing landed on the floor');
  assert.ok(!events.some((e) => e.t === 'boom'), 'one miss must not blow anyone up');
});

test('the third time is the one that bursts', () => {
  const s = createGame(4);
  const events = play(s, 90, () => 0);
  const boom = events.find((e) => e.t === 'boom') as { seat: number } | undefined;

  assert.ok(boom, 'nobody ever burst');
  // Exactly two warnings for that animal before it went.
  const warnings = events.filter((e) => e.t === 'angry' && (e as { seat: number }).seat === boom!.seat);
  assert.equal(warnings.length, STRIKES - 1, `got ${warnings.length} warnings before the bang`);
});

test('a burst animal covers the place and stops asking', () => {
  const s = createGame(4);
  const before = s.splats.length;
  play(s, 90, () => 0);
  const dead = s.animals.filter((a) => !a.alive);

  assert.ok(dead.length > 0, 'nobody burst');
  assert.ok(s.splats.length > before + 5, 'a burst should leave a mess');
  // Up the walls, not a tidy line along the floor: it went off.
  assert.ok(s.splats.some((sp) => sp.y !== undefined && sp.y < FLOOR_Y - 60), 'the mess stayed on the floor');
  for (const a of dead) assert.equal(a.urge, null, 'a burst animal is still asking');
});

// ------------------------------------------------------------- how it ends

test('leaving everybody to it loses the game', () => {
  const s = createGame(4);
  const events = play(s, 240, () => 0);

  assert.equal(s.over, 'lost');
  assert.ok(s.animals.every((a) => !a.alive), 'somebody survived a total loss');
  assert.ok(events.some((e) => e.t === 'over' && !e.won));
});

test('helping everybody five times wins it', () => {
  const s = createGame(4);
  const events = play(s, 240, helper);

  assert.equal(s.over, 'won', `ended as ${s.over}`);
  assert.equal(happyCount(s), SEATS.length, 'not everybody was happy');
  for (const a of s.animals) assert.equal(a.pooped, GOAL, `seat ${a.seat} only went ${a.pooped} times`);
  assert.ok(events.some((e) => e.t === 'over' && e.won && e.happy === SEATS.length));
});

test('a happy animal stops asking, so the game can actually end', () => {
  const s = createGame(4);
  play(s, 240, helper);

  assert.ok(s.animals.every((a) => a.urge === null), 'somebody is still waiting after the end');
});

test('the game ends once every animal is either happy or gone', () => {
  // Mixed endings have to finish too, or a half-saved game runs for ever.
  for (const seed of [1, 2, 3, 5, 8]) {
    const s = createGame(seed);
    // Helps only the two on the left; the right pair is left to burst.
    play(s, 300, (g) => {
      if (g.drops.length) return SEATS[g.drops[0].seat].x;
      const asking = g.animals.find((a) => a.urge !== null && !a.asleep && a.seat < 2);
      if (!asking) return g.pottyX;
      if (!fits(g, asking)) return TOILET_X;

      return SEATS[asking.seat].x;
    });

    assert.ok(s.over !== null, `seed ${seed} never ended`);
    for (const a of s.animals) {
      assert.ok(!a.alive || a.pooped === GOAL, `seat ${a.seat} left in limbo`);
    }
  }
});

test('nothing happens at all once it is over', () => {
  const s = createGame(4);
  play(s, 240, () => 0);
  const after = play(s, 10, () => 0);

  assert.deepEqual(after, [], 'the game kept going after it ended');
});

// --------------------------------------------------------------- the potty

test('the potty is not teleported to the toilet when it flushes', () => {
  const s = createGame(1);
  s.held = POTTY_CAP;
  s.pottyX = TOILET_X - 200;
  const before = s.pottyX;
  step(s, DT, TOILET_X);

  assert.ok(s.pottyX - before < 20, `jumped ${s.pottyX - before} units in one frame`);
  for (let i = 0; i < 36; i++) step(s, DT, TOILET_X);
  assert.ok(s.flushing > 0, 'the flush was over before this could be checked');
  assert.ok(Math.abs(s.pottyX - POUR_X) < 2, `poured from ${s.pottyX}, not beside the toilet`);
});

test('a full potty is heavier and slower', () => {
  const empty = createGame(1);
  const loaded = createGame(1);
  loaded.held = POTTY_CAP;
  for (let i = 0; i < 20; i++) {
    step(empty, DT, FIELD_W);
    step(loaded, DT, FIELD_W);
  }

  assert.ok(loaded.pottyX < empty.pottyX - 8, 'a loaded potty should be slower');
});

test('the potty cannot be walked off the edge of the world', () => {
  const s = createGame(1);
  play(s, 3, () => -9999);
  assert.ok(s.pottyX >= POTTY_W / 2, `escaped left to ${s.pottyX}`);
  play(s, 3, () => 9999);
  assert.ok(s.pottyX <= FIELD_W - POTTY_W / 2, `escaped right to ${s.pottyX}`);
});

test('splats do not pile up without limit', () => {
  const s = createGame(9);
  play(s, 300, () => 0);

  assert.ok(s.splats.length <= 40, `${s.splats.length} splats on the floor`);
});

test('a drop that has landed is gone', () => {
  const s = createGame(4);
  play(s, 120, helper);
  for (const d of s.drops) assert.ok(d.y <= FLOOR_Y, `a landed drop was left at ${d.y}`);
});

test('never more than two animals ask at once', () => {
  // Four at a time with a four-second clock each is not a game, it is a queue
  // nobody can serve.
  const s = createGame(7);
  for (let i = 0; i < 200 * 60; i++) {
    step(s, DT, 400);
    assert.ok(s.animals.filter((a) => a.urge !== null).length <= 2, 'three at once');
  }
});

test('the same seed plays out the same way twice', () => {
  const a = createGame(77);
  const b = createGame(77);
  play(a, 60, helper);
  play(b, 60, helper);

  assert.deepEqual(a.animals, b.animals);
  assert.equal(a.caught, b.caught);
  assert.deepEqual(a.splats, b.splats);
});

// ------------------------------------------------------------------ the cast

test('the cast is two small, one middling and one big', () => {
  // A straight shuffle can deal a cow, a pig and a sheep together, and then
  // the potty is full after every animal and the game is a queue at the loo.
  for (let seed = 0; seed < 40; seed++) {
    const { cast } = castFor(seed * 7919);
    const small = cast.filter((c: AnimalId) => SMALL.includes(c)).length;
    const mid = cast.filter((c: AnimalId) => MIDDLING.includes(c)).length;
    const big = cast.filter((c: AnimalId) => BIG.includes(c)).length;

    assert.equal(cast.length, 4);
    assert.equal(new Set(cast).size, 4, `seed ${seed} dealt a duplicate: ${cast.join()}`);
    assert.equal(small, 2, `seed ${seed}: ${cast.join()}`);
    assert.equal(mid, 1, `seed ${seed}: ${cast.join()}`);
    assert.equal(big, 1, `seed ${seed}: ${cast.join()}`);
  }
});

test('the cast actually varies, and so does who sits where', () => {
  const casts = new Set<string>();
  const bigSeats = new Set<number>();
  for (let seed = 0; seed < 60; seed++) {
    const { cast } = castFor(seed * 104729);
    casts.add(cast.join());
    bigSeats.add(cast.findIndex((c: AnimalId) => BIG.includes(c)));
  }

  assert.ok(casts.size > 8, `only ${casts.size} different casts in sixty games`);
  assert.ok(bigSeats.size > 2, 'the big animal always sits in the same place');
});

test('the whole potty is one cow, and a hamster is a tenth of it', () => {
  assert.equal(SIZE.cow, POTTY_CAP);
  assert.equal(SIZE.hamster, POTTY_CAP / 10);
});

// -------------------------------------------------------------- how it fills

test('an animal will not go if what it makes does not fit', () => {
  const s = createGame(4);
  const a = s.animals.find((x) => !x.asleep)!;
  s.held = POTTY_CAP - a.size + 1;
  a.urge = 3;
  const events = play(s, 1, () => SEATS[a.seat].x);

  assert.ok(!events.some((e) => e.t === 'drop'), 'it squeezed in where there was no room');
  assert.ok(jammed(s), 'the game should know somebody is stuck');
});

test('the same animal goes once there is room again', () => {
  const s = createGame(4);
  const a = s.animals.find((x) => !x.asleep)!;
  s.held = POTTY_CAP;
  a.urge = 5;
  play(s, 0.5, () => SEATS[a.seat].x);
  s.held = 0;
  const events = play(s, 1, () => SEATS[a.seat].x);

  assert.ok(events.some((e) => e.t === 'drop'), 'it never went even with an empty pot');
});

test('the potty can be emptied at any time, not only when it is exactly full', () => {
  // Half a pot and a cow asking is a dead end if only a full pot may be poured.
  const s = createGame(4);
  s.held = 3;
  const events = play(s, 3, () => TOILET_X);

  assert.ok(events.some((e) => e.t === 'flush'), 'a part-full potty refused to empty');
  assert.equal(s.held, 0);
});

test('a fuller potty is a slower potty, all the way up', () => {
  const light = createGame(1);
  const heavy = createGame(1);
  light.held = 2;
  heavy.held = POTTY_CAP;
  for (let i = 0; i < 20; i++) {
    step(light, DT, FIELD_W);
    step(heavy, DT, FIELD_W);
  }

  assert.ok(heavy.pottyX < light.pottyX - 5, 'weight made no difference');
});

// ------------------------------------------------------------- who is there

test('only two animals are on the fence to begin with', () => {
  const s = createGame(4);

  assert.equal(s.animals.filter((a) => !a.asleep).length, START_AWAKE);
});

test('emptying the potty brings the next animal along', () => {
  const s = createGame(4);
  s.held = POTTY_CAP;
  const events = play(s, 4, () => TOILET_X);

  assert.ok(events.some((e) => e.t === 'wake'), 'nobody arrived after a flush');
  assert.equal(s.animals.filter((a) => !a.asleep).length, START_AWAKE + 1);
});

test('a sleeping animal never asks and never takes a strike', () => {
  const s = createGame(4);
  const asleep = s.animals.filter((a) => a.asleep).map((a) => a.seat);
  play(s, 30, () => 0);
  for (const seat of asleep) {
    const a = s.animals[seat];
    if (a.asleep) assert.equal(a.strikes, 0, `seat ${seat} was punished in its sleep`);
  }
});

test('everybody gets onto the fence even if the potty is never emptied', () => {
  // Otherwise the two who are out burst, the other two never arrive, and the
  // game sits there for ever with an empty fence.
  const s = createGame(4);
  play(s, 300, () => 0);

  assert.equal(s.over, 'lost');
  assert.ok(s.animals.every((a) => !a.asleep), 'somebody was left asleep for ever');
  assert.ok(s.animals.every((a) => !a.alive));
});

test('driving off after making somebody go costs a strike too', () => {
  // Otherwise the potty could pull away every time and the animal would go
  // again and again with nothing ever counted against it -- the game would
  // never end and nothing would ever look wrong.
  const s = createGame(4);
  const a = s.animals.find((x) => !x.asleep)!;
  a.urge = 3;
  play(s, 0.6, () => SEATS[a.seat].x);
  assert.equal(s.drops.length, 1, 'it never let go');
  const events = play(s, 3, () => 0);

  assert.ok(events.some((e) => e.t === 'miss'), 'it did not land on the floor');
  assert.equal(a.strikes, 1, 'a wasted trip cost nothing');
});
