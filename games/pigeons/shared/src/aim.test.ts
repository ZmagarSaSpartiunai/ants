import test from 'node:test';
import assert from 'node:assert/strict';
import { aimAt, speedOf } from './aim.js';
import { flyShot } from './physics.js';
import { GRAVITY, MAX_BIRDS, Shot } from './types.js';
import { FOOD_IDS } from './food.js';
import { createMatch } from './match.js';

/** Flies the aimed shot and reports how far off it landed. */
function missBy(from: { x: number; y: number }, to: { x: number; y: number }, power: number): number {
  const speed = speedOf('seed', power);
  const angle = aimAt(from, to, speed);
  assert.notEqual(angle, null, 'the throw should have been reachable');
  const shot: Shot = { slot: 0, food: 'seed', angle: angle as number, power };
  // No props and no ground: this measures the aim, not what it bumps into.
  const path = flyShot(from, shot, [], 0);
  let best = Infinity;
  for (const p of path.points) best = Math.min(best, Math.hypot(p.x - to.x, p.y - to.y));

  return best;
}

test('an aimed shot passes through the point it was aimed at', () => {
  assert.ok(missBy({ x: 100, y: 250 }, { x: 400, y: 250 }, 1) < 6);
});

test('aim works uphill and downhill alike', () => {
  assert.ok(missBy({ x: 100, y: 300 }, { x: 380, y: 190 }, 1) < 6, 'uphill');
  assert.ok(missBy({ x: 100, y: 120 }, { x: 380, y: 300 }, 1) < 6, 'downhill');
});

test('aim works to the left as well as to the right', () => {
  assert.ok(missBy({ x: 700, y: 250 }, { x: 300, y: 250 }, 1) < 6);
});

test('the lofted arc is chosen, so the shot goes over what is between', () => {
  const from = { x: 100, y: 250 };
  const to = { x: 400, y: 250 };
  const angle = aimAt(from, to, speedOf('seed', 1));
  const path = flyShot(from, { slot: 0, food: 'seed', angle: angle as number, power: 1 }, [], 0);
  const top = Math.min(...path.points.map((p) => p.y));

  assert.ok(top < 190, `the arc should rise well clear, peaked at ${top}`);
});

test('a target out of range is refused rather than guessed at', () => {
  assert.equal(aimAt({ x: 0, y: 250 }, { x: 5000, y: 250 }, speedOf('seed', 1)), null);
});

test('a dead throw has no answer', () => {
  assert.equal(aimAt({ x: 0, y: 0 }, { x: 100, y: 0 }, 0), null);
});

test('straight overhead is answered without arithmetic', () => {
  assert.equal(aimAt({ x: 100, y: 300 }, { x: 100, y: 100 }, 400), -Math.PI / 2);
  assert.equal(aimAt({ x: 100, y: 100 }, { x: 100, y: 300 }, 400), Math.PI / 2);
});

test('speed follows the food and the power behind it', () => {
  assert.ok(speedOf('pepper', 1) > speedOf('seed', 1), 'the pepper is the fast one');
  assert.ok(speedOf('melon', 1) < speedOf('seed', 1), 'the melon is the slow one');
  assert.equal(speedOf('seed', 0), 0);
  assert.equal(speedOf('seed', 99), speedOf('seed', 1), 'power is clamped');
});

test('every food can cross the map, or the cheap one is a dead button', () => {
  // At 620 the seed reached 427 units against 500 between the perches, so the
  // one food that costs nothing could not reach an opponent at all. A flat
  // throw carries v^2/g, and that has to clear the widest gap on the board.
  const s = createMatch(1, MAX_BIRDS);
  let widest = 0;
  for (const a of s.birds) {
    for (const b of s.birds) widest = Math.max(widest, Math.hypot(a.x - b.x, a.y - b.y));
  }
  for (const id of FOOD_IDS) {
    const v = speedOf(id, 1);
    assert.ok((v * v) / GRAVITY > widest, `${id} cannot cross ${Math.round(widest)} units`);
  }
});
