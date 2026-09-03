import test from 'node:test';
import assert from 'node:assert/strict';
import { windFor } from './rng.js';

test('the same seed and round always give the same wind', () => {
  assert.equal(windFor(12345, 7), windFor(12345, 7));
});

test('a client that reconnects at round 7 needs no history', () => {
  // The point of the whole design: wind is computed, not remembered. Asking
  // for round 7 cold must match asking for it after walking rounds 0..6.
  let last = 0;
  for (let r = 0; r <= 7; r++) last = windFor(999, r);

  assert.equal(last, windFor(999, 7));
});

test('the wind changes between rounds', () => {
  assert.notEqual(windFor(4242, 1), windFor(4242, 2));
});

test('the wind stays inside its stated range', () => {
  for (let r = 0; r < 500; r++) {
    const w = windFor(777, r);
    assert.ok(w >= -1 && w <= 1, `round ${r} gave ${w}, which is out of range`);
  }
});

test('different matches get different weather', () => {
  assert.notEqual(windFor(1, 3), windFor(2, 3));
});

test('the wind blows both ways over a match', () => {
  let left = 0;
  let right = 0;
  for (let r = 0; r < 200; r++) (windFor(31337, r) < 0 ? left++ : right++);

  assert.ok(left > 40 && right > 40, `lopsided weather: ${left} left, ${right} right`);
});
