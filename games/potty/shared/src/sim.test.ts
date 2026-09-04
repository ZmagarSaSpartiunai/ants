import test from 'node:test';
import assert from 'node:assert/strict';
import { awakeSeats, createGame, gapFor, maxBracing, seatsFor, step } from './sim.js';
import {
  DROP_MAX_X,
  Event,
  FIELD_W,
  FLOOR_Y,
  POTTY_CAP,
  POTTY_W,
  PottyState,
  SEATS,
  STARS_PER_LEVEL,
  TOILET_X,
} from './types.js';

/** Runs the game for a while with the potty parked, and collects what happened. */
function play(s: PottyState, seconds: number, aim: () => number): Event[] {
  const out: Event[] = [];
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) out.push(...step(s, dt, aim()));

  return out;
}

/** Plays with a player who chases whatever is falling and empties when full. */
function playSmart(s: PottyState, seconds: number): Event[] {
  const out: Event[] = [];
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) {
    const aim = s.held >= POTTY_CAP ? TOILET_X : s.drops.length ? s.drops[0].x : s.pottyX;
    out.push(...step(s, dt, aim));
  }

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

test('a player who follows and empties catches nearly everything', () => {
  const s = createGame(3);
  const events = playSmart(s, 60);
  const missed = events.filter((e) => e.t === 'miss').length;

  assert.ok(s.caught > 12, `a player who follows caught only ${s.caught}`);
  assert.ok(missed <= 2, `a player who follows missed ${missed}`);
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

// --------------------------------------------------------------- fill and flush

test('the potty fills up and then takes nothing more', () => {
  const s = createGame(2);
  const events = playSmart(s, 30);
  const full = events.findIndex((e) => e.t === 'full');

  assert.ok(full >= 0, 'it never filled');
  assert.ok(s.held <= POTTY_CAP, `holding ${s.held} of ${POTTY_CAP}`);
});

test('a catch on a full potty overflows onto the floor instead of counting', () => {
  const s = createGame(2);
  s.held = POTTY_CAP;
  // Park a drop right over the potty and let it land.
  s.drops.push({ id: 99, x: s.pottyX, y: FLOOR_Y - 40, vy: 200, seat: 0 });
  const events: Event[] = [];
  for (let i = 0; i < 60; i++) events.push(...step(s, 1 / 60, s.pottyX));

  assert.ok(events.some((e) => e.t === 'overflow'), 'nothing overflowed');
  assert.ok(!events.some((e) => e.t === 'catch'), 'a full potty must not swallow more');
  assert.equal(s.held, POTTY_CAP);
  assert.ok(s.splats.length > 0, 'the overflow should land somewhere');
});

test('driving a full potty to the toilet empties it and earns a star', () => {
  const s = createGame(2);
  s.held = POTTY_CAP;
  const events: Event[] = [];
  for (let i = 0; i < 4 * 60; i++) events.push(...step(s, 1 / 60, TOILET_X));

  assert.ok(events.some((e) => e.t === 'flush'), 'it never flushed');
  assert.ok(events.some((e) => e.t === 'star'), 'no star for the trip');
  assert.equal(s.held, 0, 'the potty should be empty afterwards');
});

test('a potty that is not full does not flush, however long it stands there', () => {
  // Otherwise the trip is not a decision, and the whole point of it is choosing
  // the moment to make it.
  const s = createGame(2);
  s.held = POTTY_CAP - 1;
  const events: Event[] = [];
  for (let i = 0; i < 4 * 60; i++) events.push(...step(s, 1 / 60, TOILET_X));

  assert.ok(!events.some((e) => e.t === 'flush'));
  assert.equal(s.held, POTTY_CAP - 1);
});

test('nothing can be caught while it is being emptied', () => {
  const s = createGame(2);
  s.held = POTTY_CAP;
  s.pottyX = TOILET_X;
  step(s, 1 / 60, TOILET_X);
  assert.ok(s.flushing > 0, 'it should be flushing by now');
  // Drop something straight into it mid-flush.
  s.drops.push({ id: 99, x: TOILET_X, y: FLOOR_Y - 30, vy: 200, seat: 0 });
  const events: Event[] = [];
  for (let i = 0; i < 20; i++) events.push(...step(s, 1 / 60, TOILET_X));

  assert.ok(!events.some((e) => e.t === 'catch'), 'caught something with its hands full');
});

test('a full row of stars finishes a level and wakes another animal', () => {
  const s = createGame(2);
  const before = seatsFor(s.level);
  for (let star = 0; star < STARS_PER_LEVEL; star++) {
    s.held = POTTY_CAP;
    for (let i = 0; i < 3 * 60; i++) step(s, 1 / 60, TOILET_X);
  }

  assert.equal(s.level, 2, `level is ${s.level}`);
  assert.equal(s.stars, 0, 'stars should start again on a new level');
  assert.ok(seatsFor(s.level) > before, 'a level should bring something new');
});

test('the fence fills up and then stops, and doubles come later', () => {
  assert.equal(seatsFor(1), 2, 'level one should be gentle');
  assert.ok(seatsFor(3) > seatsFor(1));
  assert.equal(seatsFor(99), SEATS.length, 'it cannot wake animals that do not exist');
  assert.equal(maxBracing(1), 1, 'one at a time at first');
  assert.ok(maxBracing(2) > 1, 'two at once from the second level');
});

test('only awake animals ever go', () => {
  const s = createGame(6);
  const dt = 1 / 60;
  for (let i = 0; i < 90 * 60; i++) {
    for (const e of step(s, dt, 0)) {
      if (e.t === 'brace') {
        assert.ok(awakeSeats(s.level).includes(e.seat), `seat ${e.seat} at level ${s.level}`);
      }
    }
  }
});

test('nothing is ever dropped onto the toilet', () => {
  const s = createGame(8);
  const dt = 1 / 60;
  for (let i = 0; i < 200 * 60; i++) {
    for (const e of step(s, dt, 400)) {
      if (e.t === 'drop') assert.ok(e.x <= DROP_MAX_X, `dropped at ${e.x}, onto the toilet`);
    }
  }
});

test('a full potty still slows down for the trip, so the trip costs something', () => {
  // A free trip is not a decision either. Loaded, it moves noticeably slower.
  const empty = createGame(1);
  const loaded = createGame(1);
  loaded.held = POTTY_CAP;
  for (let i = 0; i < 20; i++) {
    step(empty, 1 / 60, FIELD_W);
    step(loaded, 1 / 60, FIELD_W);
  }

  assert.ok(loaded.pottyX < empty.pottyX - 8, 'a loaded potty should be slower');
});

test('the busy game is reached in a couple of minutes, not ten', () => {
  // Measured: a level is about four catches per star. If the fence only fills
  // up after ten minutes, no child of four ever sees it.
  const perStar = POTTY_CAP;
  const catchesToFullFence = (seatsFor(1) === SEATS.length ? 0 : SEATS.length - seatsFor(1)) *
    STARS_PER_LEVEL * perStar;

  assert.ok(catchesToFullFence <= 30, `${catchesToFullFence} catches before the fence is full`);
});
