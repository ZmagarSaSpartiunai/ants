import test from 'node:test';
import assert from 'node:assert/strict';
import { foodById, FOODS, FOOD_IDS } from './food.js';

test('every listed food has an entry, and every entry is listed', () => {
  for (const id of FOOD_IDS) assert.ok(FOODS[id], `${id} is listed but has no entry`);
  assert.equal(Object.keys(FOODS).length, FOOD_IDS.length);
});

test('the free food costs nothing to digest, so a round is never dead', () => {
  assert.equal(FOODS.seed.digest, 0);
});

test('a slower, wider shot is the one that costs turns', () => {
  // The trade the child actually makes: the melon covers half the roof but
  // takes two rounds to come back from.
  assert.ok(FOODS.melon.blast > FOODS.seed.blast);
  assert.ok(FOODS.melon.digest > FOODS.seed.digest);
  assert.ok(FOODS.melon.speed < FOODS.seed.speed);
});

test('the pepper is the only food the wind cannot touch', () => {
  assert.equal(FOODS.pepper.drag, 0);
  for (const id of FOOD_IDS) {
    if (id !== 'pepper') assert.ok(FOODS[id].drag > 0, `${id} should feel the wind`);
  }
});

test('only the ice cream bounces', () => {
  assert.ok(FOODS.icecream.bounces > 0);
  for (const id of FOOD_IDS) {
    if (id !== 'icecream') assert.equal(FOODS[id].bounces, 0, `${id} should not bounce`);
  }
});

test('a food id off the wire is checked, not trusted', () => {
  assert.equal(foodById('seed')?.id, 'seed');
  assert.equal(foodById('diamond'), null);
  assert.equal(foodById(null), null);
  assert.equal(foodById('constructor'), null, 'inherited properties are not foods');
});
