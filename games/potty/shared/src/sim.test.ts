import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, gapFor, step } from './sim.js';
import { Event, FLOOR_Y, FIELD_W, POTTY_W, PottyState } from './types.js';

/** Runs the game for a while with the potty parked, and collects what happened. */
function play(s: PottyState, seconds: number, aim: () => number): Event[] {
  const out: Event[] = [];
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) out.push(...step(s, dt, aim()));

  return out;
}

test('nothing falls until an animal has braced for it', () => {
  const s = createGame(11);
  const events = play(s, 6, () => s.pottyX);
  const first = events.findIndex((e) => e.t === 'drop');
  const braced = events.findIndex((e) => e.t === 'brace');

  assert.ok(braced >= 0, 'nobody ever braced');
  assert.ok(first > braced, 'the drop came with no warning at all');
});

test('a warning is long enough for a small child to get there', () => {
  // The potty crosses the field in about 1.3s. A warning shorter than the
  // journey would make the game a coin toss rather than a game.
  const s = createGame(5);
  const events = play(s, 20, () => s.pottyX);
  const braces = events.filter((e) => e.t === 'brace').length;
  const drops = events.filter((e) => e.t === 'drop').length;

  assert.ok(drops > 3, `only ${drops} drops in twenty seconds`);
  assert.equal(braces, drops, 'every drop must have had its own warning');
});

test('the potty catches what falls into it', () => {
  const s = createGame(3);
  // Chase whatever is falling: a following player should catch nearly all.
  const events = play(s, 40, () => (s.drops.length ? s.drops[0].x : s.pottyX));
  const caught = events.filter((e) => e.t === 'catch').length;
  const missed = events.filter((e) => e.t === 'miss').length;

  assert.ok(caught > 8, `a player who follows caught only ${caught}`);
  assert.ok(missed <= 1, `a player who follows missed ${missed}`);
});

test('a potty left in the corner misses, and misses cost nothing but a splat', () => {
  const s = createGame(3);
  const events = play(s, 30, () => 0);
  const missed = events.filter((e) => e.t === 'miss').length;

  assert.ok(missed > 3, 'standing still should miss');
  assert.equal(s.caught, events.filter((e) => e.t === 'catch').length);
  assert.ok(s.splats.length > 0, 'a miss should leave something on the floor');
  // No lives, no game over, nothing to read: the game simply goes on.
  assert.ok(!('over' in s), 'this game has no losing');
});

test('the potty cannot be walked off the edge of the world', () => {
  const s = createGame(1);
  play(s, 3, () => -9999);
  assert.ok(s.pottyX >= POTTY_W / 2, `potty escaped left to ${s.pottyX}`);
  play(s, 3, () => 9999);
  assert.ok(s.pottyX <= FIELD_W - POTTY_W / 2, `potty escaped right to ${s.pottyX}`);
});

test('the potty does not teleport to the finger', () => {
  // Instant tracking would mean never missing, which is not a game, and it
  // would also read as the potty being dragged rather than running.
  const s = createGame(1);
  const from = s.pottyX;
  step(s, 1 / 60, FIELD_W);

  assert.ok(s.pottyX - from < 20, `moved ${s.pottyX - from} units in one frame`);
});

test('it speeds up as it goes, but never past a floor', () => {
  assert.ok(gapFor(0) > gapFor(10), 'ten caught should be quicker than none');
  assert.ok(gapFor(10) > gapFor(40), 'forty caught should be quicker than ten');
  assert.ok(gapFor(500) >= 1.1, 'it must stay playable for a four-year-old');
});

test('the same seed plays out the same way twice', () => {
  const a = createGame(77);
  const b = createGame(77);
  play(a, 25, () => 400);
  play(b, 25, () => 400);

  assert.deepEqual(a.drops, b.drops);
  assert.equal(a.caught, b.caught);
  assert.deepEqual(a.splats, b.splats);
});

test('splats do not pile up without limit over a long game', () => {
  const s = createGame(9);
  play(s, 240, () => 0);

  assert.ok(s.splats.length <= 24, `${s.splats.length} splats on the floor`);
});

test('a drop that lands is gone, whether it was caught or not', () => {
  const s = createGame(4);
  play(s, 60, () => (s.drops.length ? s.drops[0].x : s.pottyX));

  for (const d of s.drops) assert.ok(d.y <= FLOOR_Y, `a landed drop was left at ${d.y}`);
});

test('drops do not all land in the same four places', () => {
  // Four fixed spots would mean the potty needs four positions and nothing in
  // between, which is a much smaller game than it looks.
  const s = createGame(21);
  const xs = new Set<number>();
  const dt = 1 / 60;
  for (let i = 0; i < 120 * 60; i++) {
    for (const e of step(s, dt, 0)) if (e.t === 'drop') xs.add(Math.round(e.x));
  }

  assert.ok(xs.size > 12, `only ${xs.size} distinct landing lines`);
});

test('nothing is ever dropped outside the field', () => {
  const s = createGame(33);
  const dt = 1 / 60;
  for (let i = 0; i < 200 * 60; i++) {
    for (const e of step(s, dt, 400)) {
      if (e.t === 'drop') assert.ok(e.x > 0 && e.x < FIELD_W, `dropped at ${e.x}`);
    }
  }
});
