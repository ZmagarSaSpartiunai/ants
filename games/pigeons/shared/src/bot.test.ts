import test from 'node:test';
import assert from 'node:assert/strict';
import { Bot, BotLevel } from './bot.js';
import { createMatch, resolveRound } from './match.js';
import { FOOD_IDS } from './food.js';

/** Plays a whole match of bot against bot and reports how it ended. */
function playOut(seed: number, a: BotLevel, b: BotLevel): { rounds: number; winner: number | null; over: boolean } {
  const s = createMatch(seed, 2);
  const bots = [new Bot(0, a, seed), new Bot(1, b, (seed + 7919) >>> 0)];
  let rounds = 0;
  while (!s.over && rounds < 200) {
    const shots = bots.map((bot) => bot.choose(s)).filter((x) => x !== null);
    resolveRound(s, shots);
    rounds++;
  }

  return { rounds, winner: s.winner, over: s.over };
}

test('a bot fires when it can', () => {
  const s = createMatch(1234, 2);
  const bot = new Bot(0, 'normal', 42);

  assert.notEqual(bot.choose(s), null);
});

test('a bot never fires while it is digesting', () => {
  const s = createMatch(1234, 2);
  const bot = new Bot(0, 'normal', 42);
  resolveRound(s, [{ slot: 0, food: 'melon', angle: -0.6, power: 1 }]);

  assert.equal(bot.choose(s), null);
});

test('a bot never fires once the match is over', () => {
  const s = createMatch(1234, 2);
  s.over = true;
  const bot = new Bot(0, 'normal', 42);

  assert.equal(bot.choose(s), null);
});

test('a bot with nobody left to shoot at holds its fire', () => {
  const s = createMatch(1234, 2);
  s.birds[1].alive = false;
  const bot = new Bot(0, 'normal', 42);

  assert.equal(bot.choose(s), null);
});

test('a bot only ever names a real food', () => {
  const s = createMatch(1234, 2);
  const bot = new Bot(0, 'normal', 42);
  for (let r = 0; r < 60; r++) {
    const shot = bot.choose(s);
    if (shot) assert.ok(FOOD_IDS.includes(shot.food), `made up ${shot.food}`);
    resolveRound(s, []);
    if (s.over) break;
  }
});

test('a bot never asks for a shot the rules would refuse', () => {
  const s = createMatch(4242, 2);
  const bot = new Bot(0, 'sharp', 7);
  for (let r = 0; r < 40; r++) {
    const shot = bot.choose(s);
    if (shot) {
      assert.ok(Number.isFinite(shot.angle), 'the angle must be a number');
      assert.ok(shot.power > 0 && shot.power <= 1, `power out of range: ${shot.power}`);
      assert.equal(shot.slot, 0);
    }
    resolveRound(s, shot ? [shot] : []);
    if (s.over) break;
  }
});

test('the same seed plays the same match twice', () => {
  assert.deepEqual(playOut(999, 'normal', 'normal'), playOut(999, 'normal', 'normal'));
});

test('a bot does not repeat the same shot every round', () => {
  const s = createMatch(1234, 2);
  const bot = new Bot(0, 'normal', 42);
  const angles = new Set<number>();
  for (let r = 0; r < 12; r++) {
    const shot = bot.choose(s);
    if (shot) angles.add(Math.round(shot.angle * 1000));
    resolveRound(s, []);
  }

  assert.ok(angles.size > 6, `only ${angles.size} distinct shots in twelve rounds`);
});

test('matches actually end rather than running for ever', () => {
  let ended = 0;
  const lengths: number[] = [];
  for (let seed = 0; seed < 24; seed++) {
    const out = playOut(seed * 1013, 'normal', 'normal');
    if (out.over) {
      ended++;
      lengths.push(out.rounds);
    }
  }
  const median = lengths.sort((x, y) => x - y)[Math.floor(lengths.length / 2)];

  // Measured at a median of 25 with the current table. The bound is loose
  // enough to survive tuning and tight enough to catch the failure that was
  // actually there: shots that flew through birds, so nothing ever ended.
  assert.equal(ended, 24, `only ${ended} of 24 matches ended`);
  assert.ok(median <= 40, `matches drag: median ${median} rounds`);
});

test('a sharper bot beats an easier one more often than not', () => {
  // Not always -- the wind should still be able to rob anyone. But if the
  // levels do not separate at all, they are not levels.
  let sharpWins = 0;
  for (let seed = 0; seed < 30; seed++) {
    if (playOut(seed * 2657, 'easy', 'sharp').winner === 1) sharpWins++;
  }

  assert.ok(sharpWins >= 17, `the sharp bot won only ${sharpWins} of 30`);
});
