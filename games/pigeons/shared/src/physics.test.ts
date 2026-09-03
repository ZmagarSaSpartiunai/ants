import test from 'node:test';
import assert from 'node:assert/strict';
import { flyShot } from './physics.js';
import { GROUND_Y, Prop, Shot } from './types.js';

function roof(id: number, x: number, y: number): Prop {
  return { id, x, y, w: 120, h: 20, kind: 'roof', hp: 100, intact: true };
}

const lobbed: Shot = { slot: 0, food: 'seed', angle: -Math.PI / 4, power: 1 };

test('what goes up comes down', () => {
  const path = flyShot({ x: 100, y: 100 }, lobbed, [], 0);
  const top = Math.min(...path.points.map((p) => p.y));

  assert.ok(top < 100, 'the shot should rise before it falls');
  assert.ok(path.end.y > top, 'and it should come back down');
});

test('the same shot flown twice lands in the same spot', () => {
  const a = flyShot({ x: 100, y: 100 }, lobbed, [], 0.4);
  const b = flyShot({ x: 100, y: 100 }, lobbed, [], 0.4);

  assert.deepEqual(a.end, b.end);
});

test('more power carries the shot further', () => {
  const soft = flyShot({ x: 100, y: 100 }, { ...lobbed, power: 0.3 }, [], 0);
  const hard = flyShot({ x: 100, y: 100 }, { ...lobbed, power: 1 }, [], 0);

  assert.ok(hard.end.x > soft.end.x);
});

test('power is clamped, so a client cannot ask for a rocket', () => {
  const sane = flyShot({ x: 100, y: 100 }, { ...lobbed, power: 1 }, [], 0);
  const cheat = flyShot({ x: 100, y: 100 }, { ...lobbed, power: 99 }, [], 0);

  assert.deepEqual(cheat.end, sane.end);
});

test('wind pushes a seed but not a pepper', () => {
  const calm = flyShot({ x: 100, y: 100 }, lobbed, [], 0);
  const blown = flyShot({ x: 100, y: 100 }, lobbed, [], 1);
  assert.notEqual(calm.end.x, blown.end.x);

  const hot: Shot = { slot: 0, food: 'pepper', angle: -Math.PI / 4, power: 1 };
  assert.equal(
    flyShot({ x: 100, y: 100 }, hot, [], 0).end.x,
    flyShot({ x: 100, y: 100 }, hot, [], 1).end.x,
    'the pepper is the one food the wind cannot touch',
  );
});

test('wind blowing left carries the shot left', () => {
  const left = flyShot({ x: 400, y: 100 }, lobbed, [], -1);
  const right = flyShot({ x: 400, y: 100 }, lobbed, [], 1);

  assert.ok(left.end.x < right.end.x);
});

test('an intact prop stops the shot; rubble does not', () => {
  const wall = roof(1, 200, 60);
  const flat: Shot = { slot: 0, food: 'seed', angle: 0, power: 1 };

  const stopped = flyShot({ x: 100, y: 66 }, flat, [wall], 0);
  assert.equal(stopped.hitProp, 1);
  assert.equal(stopped.landing, 'prop');

  wall.intact = false;
  assert.equal(flyShot({ x: 100, y: 66 }, flat, [wall], 0).hitProp, null, 'rubble stops nothing');
});

test('an ice cream bounces off a roof instead of splatting on it', () => {
  const wall = roof(1, 200, 60);
  const cold: Shot = { slot: 0, food: 'icecream', angle: 0, power: 1 };

  assert.ok(flyShot({ x: 100, y: 66 }, cold, [wall], 0).bounced > 0);
});

test('a bounce runs out: the ice cream splats eventually', () => {
  const wall = roof(1, 200, 60);
  const cold: Shot = { slot: 0, food: 'icecream', angle: 0, power: 1 };
  const path = flyShot({ x: 100, y: 66 }, cold, [wall], 0);

  assert.ok(path.bounced <= 2, 'it must not bounce for ever');
  assert.notEqual(path.landing, 'spent', 'it should come to rest somewhere real');
});

test('a shot that hits nothing lands on the ground', () => {
  // From mid-field a full-power throw leaves the map before it can land, which
  // is its own outcome; start at the edge to watch it come down.
  const path = flyShot({ x: 100, y: 100 }, lobbed, [], 0);

  assert.equal(path.landing, 'ground');
  assert.ok(path.end.y >= GROUND_Y);
});

test('a shot thrown off the map is recorded as gone, not as a hit', () => {
  const away: Shot = { slot: 0, food: 'pepper', angle: 0, power: 1 };
  const path = flyShot({ x: 760, y: 60 }, away, [], 0);

  assert.equal(path.landing, 'away');
  assert.equal(path.hitProp, null);
});

test('a shot that never lands is dropped rather than looping for ever', () => {
  const up: Shot = { slot: 0, food: 'pepper', angle: -Math.PI / 2, power: 1 };
  const path = flyShot({ x: 100, y: 100 }, up, [], 0);

  assert.ok(path.points.length < 1200, `the flight must be capped, got ${path.points.length}`);
});

test('the arc has enough points to draw a smooth curve', () => {
  const path = flyShot({ x: 100, y: 200 }, lobbed, [], 0);

  assert.ok(path.points.length > 20, 'the client needs a real arc, not two points');
});
