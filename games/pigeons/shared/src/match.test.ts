import test from 'node:test';
import assert from 'node:assert/strict';
import { canFire, createMatch, resolveRound } from './match.js';
import { GROUND_Y, MatchState, Shot, START_HP } from './types.js';

function seedShot(slot: number, angle: number): Shot {
  return { slot, food: 'seed', angle, power: 1 };
}

/**
 * Stands a bird just above the ground.
 *
 * A shot stops on props and on the ground, never on a bird: what hurts is the
 * blast at the point it lands. So to reach a bird you land beside it, and a
 * bird standing low means a melon dropped at its feet lands inside its radius.
 */
function perchLow(s: MatchState, slot: number, x: number): void {
  s.birds[slot].x = x;
  s.birds[slot].y = GROUND_Y - 20;
}

/** A melon let go straight down, landing at the thrower's own feet. */
function drop(slot: number): Shot {
  return { slot, food: 'melon', angle: Math.PI / 2, power: 0.05 };
}

test('a fresh match seats every player alive and idle', () => {
  const s = createMatch(1234, 2);

  assert.equal(s.birds.length, 2);
  assert.ok(s.birds.every((b) => b.alive && b.busy === 0 && b.hp === START_HP));
  assert.equal(s.over, false);
});

test('the player count is clamped, not trusted', () => {
  assert.equal(createMatch(1, 99).birds.length, 4);
  assert.equal(createMatch(1, 0).birds.length, 2);
});

test('the outcome never depends on who answered first', () => {
  const a = createMatch(1234, 2);
  const b = createMatch(1234, 2);
  const one = seedShot(0, -0.6);
  const two = seedShot(1, -2.5);

  resolveRound(a, [one, two]);
  resolveRound(b, [two, one]);

  assert.deepEqual(a.birds, b.birds, 'arrival order must not change the outcome');
});

test('a round is simultaneous: two birds can finish each other off at once', () => {
  // The whole reason damage is collected and applied together. Resolving shot
  // by shot would let slot 0 knock slot 1 out before slot 1's melon, already in
  // the air, was allowed to land.
  const s = createMatch(1234, 2);
  perchLow(s, 0, 380);
  perchLow(s, 1, 420);
  s.birds[0].hp = 1;
  s.birds[1].hp = 1;
  const result = resolveRound(s, [drop(0), drop(1)]);

  assert.deepEqual(result.downed, [0, 1], 'both should go down together');
  assert.equal(s.over, true);
  assert.equal(s.winner, null, 'a mutual knockout has no winner');
});

test('a bird knocked out this round still gets the shot it already threw', () => {
  const s = createMatch(1234, 2);
  perchLow(s, 0, 380);
  perchLow(s, 1, 420);
  s.birds[1].hp = 1;
  const result = resolveRound(s, [drop(0), seedShot(1, -0.8)]);

  assert.equal(result.flights.length, 2, 'the dying bird had already let go');
});

test('eating a melon costs the bird the next two rounds', () => {
  const s = createMatch(1234, 2);
  resolveRound(s, [{ slot: 0, food: 'melon', angle: -0.6, power: 1 }]);
  assert.equal(s.birds[0].busy, 2);

  resolveRound(s, []);
  assert.equal(s.birds[0].busy, 1, 'a round of waiting should count down');
});

test('a bird still digesting cannot fire', () => {
  const s = createMatch(1234, 2);
  resolveRound(s, [{ slot: 0, food: 'melon', angle: -0.6, power: 1 }]);
  const before = s.birds[1].hp;
  resolveRound(s, [seedShot(0, -0.6)]);

  assert.equal(s.birds[1].hp, before);
  assert.equal(canFire(s, 0), false);
});

test('a bird whose shot was ignored still counts down, not stuck for ever', () => {
  const s = createMatch(1234, 2);
  resolveRound(s, [{ slot: 0, food: 'melon', angle: -0.6, power: 1 }]);
  // Slot 0 keeps hammering the button while it digests. Those shots are
  // ignored, but they must not freeze the timer.
  resolveRound(s, [seedShot(0, -0.6)]);
  resolveRound(s, [seedShot(0, -0.6)]);

  assert.equal(s.birds[0].busy, 0, 'the bird must become free again');
  assert.equal(canFire(s, 0), true);
});

test('a seat cannot fire twice in one round', () => {
  const s = createMatch(1234, 2);
  const result = resolveRound(s, [seedShot(0, -0.6), seedShot(0, -0.9)]);

  assert.equal(result.flights.length, 1);
});

test('a made-up food is ignored rather than trusted', () => {
  const s = createMatch(1234, 2);
  const result = resolveRound(s, [{ slot: 0, food: 'diamond' as never, angle: -0.6, power: 1 }]);

  assert.equal(result.flights.length, 0);
});

test('a broken angle cannot poison the round', () => {
  const s = createMatch(1234, 2);
  const result = resolveRound(s, [{ slot: 0, food: 'seed', angle: NaN, power: 1 }]);

  assert.equal(result.flights.length, 0);
  assert.ok(s.birds.every((b) => Number.isFinite(b.hp)));
});

test('a shot from a seat that does not exist is ignored', () => {
  const s = createMatch(1234, 2);
  const result = resolveRound(s, [seedShot(9, -0.6)]);

  assert.equal(result.flights.length, 0);
});

test('the round counter advances even when nobody fires', () => {
  const s = createMatch(1234, 2);
  resolveRound(s, []);

  assert.equal(s.round, 1);
});

test('the result names the round that was played, not the next one', () => {
  const s = createMatch(1234, 2);

  assert.equal(resolveRound(s, []).round, 0);
  assert.equal(resolveRound(s, []).round, 1);
});

test('the last bird standing wins and the match closes', () => {
  const s = createMatch(1234, 2);
  perchLow(s, 0, 380);
  perchLow(s, 1, 420);
  s.birds[1].hp = 1;
  resolveRound(s, [drop(0)]);

  assert.equal(s.birds[1].alive, false);
  assert.equal(s.over, true);
  assert.equal(s.winner, 0);
  assert.equal(canFire(s, 0), false, 'nobody fires after the match is done');
});

test('two matches from the same seed play out identically', () => {
  const a = createMatch(4242, 3);
  const b = createMatch(4242, 3);
  const shots = [seedShot(0, -0.7), seedShot(1, -2.4), seedShot(2, -1.2)];
  for (let r = 0; r < 6; r++) {
    resolveRound(a, shots);
    resolveRound(b, shots);
  }

  assert.deepEqual(a, b);
});

test('a shot that breaks a prop does not open a hole for the same round', () => {
  // Everyone threw at the same moment, so every shot meets the world as it was.
  const s = createMatch(1234, 2);
  const roof = s.props[0];
  roof.hp = 1;
  // One on each side, firing inward: the roof is between them, so neither
  // shot can reach the other bird and both must meet the roof.
  s.birds[0].x = roof.x - 40;
  s.birds[0].y = roof.y + 10;
  s.birds[1].x = roof.x + roof.w + 40;
  s.birds[1].y = roof.y + 10;
  const result = resolveRound(s, [
    { slot: 0, food: 'seed', angle: 0, power: 1 },
    { slot: 1, food: 'seed', angle: Math.PI, power: 1 },
  ]);

  assert.ok(result.flights.every((f) => f.hitProp === roof.id), 'both met the intact roof');
  assert.equal(roof.intact, false, 'and it broke from the pair of them');
});

test('the result says which shots the flights came from', () => {
  // A client needs to know what each flight was carrying to draw the right
  // splat. Making it re-derive that would be a second copy of these rules.
  const s = createMatch(1234, 2);
  resolveRound(s, [{ slot: 0, food: 'melon', angle: -0.6, power: 1 }]);
  // Slot 0 is digesting now, so only slot 1's shot can count.
  const r = resolveRound(s, [
    { slot: 0, food: 'seed', angle: -0.6, power: 1 },
    { slot: 1, food: 'pepper', angle: -2.4, power: 1 },
  ]);

  assert.equal(r.shots.length, r.flights.length);
  assert.deepEqual(r.shots.map((x) => x.slot), [1]);
  assert.equal(r.shots[0].food, 'pepper');
});
