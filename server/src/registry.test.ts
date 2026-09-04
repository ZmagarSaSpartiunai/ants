import test from 'node:test';
import assert from 'node:assert/strict';
import { AGE_BANDS, bandFits, GAMES, findGame, shelfFor, socketPath } from './registry.js';

test('every game has a unique id and a unique path', () => {
  const ids = new Set(GAMES.map((g) => g.id));
  const paths = new Set(GAMES.map((g) => g.path));

  assert.equal(ids.size, GAMES.length, 'two games share an id');
  assert.equal(paths.size, GAMES.length, 'two games share a path');
});

test('every path is anchored and has no trailing slash', () => {
  for (const game of GAMES) {
    assert.ok(game.path.startsWith('/'), `${game.id}: path must start with /`);
    assert.ok(!game.path.endsWith('/'), `${game.id}: path must not end with /`);
  }
});

test('a game is found by its own path and by anything under it', () => {
  assert.equal(findGame('/ants')?.id, 'ants');
  assert.equal(findGame('/ants/')?.id, 'ants');
  assert.equal(findGame('/ants/assets/index.js')?.id, 'ants');
});

test('a longer path wins, so a game can live inside a shelf', () => {
  // '/kaka' is a shelf and '/kaka/pigeons' a game inside it. A plain prefix
  // scan would hand '/kaka/pigeons/' to the shelf and never reach the game.
  assert.equal(findGame('/kaka/pigeons/')?.id, 'pigeons');
  assert.equal(findGame('/kaka/')?.id, 'kaka');
});

test('a near miss is not a match', () => {
  assert.equal(findGame('/antsomething'), null);
  assert.equal(findGame('/'), null);
});

test('a multiplayer game gets a socket path under its own path', () => {
  assert.equal(socketPath({ ...GAMES[0], path: '/kaka/pigeons' }), '/kaka/pigeons/ws');
});

test('the shelf lists what belongs to it, not the whole catalogue', () => {
  const root = shelfFor(null).map((g) => g.id);
  const kaka = shelfFor('kaka').map((g) => g.id);

  assert.ok(root.includes('ants'), 'the root shelf should carry the top-level games');
  assert.ok(!root.includes('pigeons'), 'a game inside a shelf must not also sit on the root');
  assert.ok(kaka.includes('pigeons'));
});

test('a paid game stays on the shelf so it can be seen and wanted', () => {
  // The child seeing a locked card is the whole point: a hidden game sells
  // nothing. Access is decided later, by entitlements, not by hiding.
  const paid = GAMES.filter((g) => g.tier === 'paid');
  for (const game of paid) {
    assert.ok(shelfFor(game.shelf).some((g) => g.id === game.id), `${game.id} vanished from its shelf`);
  }
});

test('every game says who it is for, and says it sanely', () => {
  for (const game of GAMES) {
    const [from, to] = game.ages;
    assert.ok(Number.isInteger(from) && Number.isInteger(to), `${game.id}: ages must be whole years`);
    assert.ok(from >= 0 && from <= to, `${game.id}: nonsense age range ${from}..${to}`);
  }
});

test('the age bands cover every year without a gap', () => {
  // A gap would make a game invisible under every filter, which reads on the
  // shelf exactly like a game that failed to build.
  for (let age = 0; age <= 99; age++) {
    assert.ok(AGE_BANDS.some((b) => age >= b.from && age <= b.to), `nobody covers age ${age}`);
  }
});

test('a game shows under a band when the two overlap at all', () => {
  const six = AGE_BANDS.find((b) => b.id === 'kids')!;
  assert.ok(bandFits({ ...GAMES[0], ages: [6, 9] }, six));
  assert.ok(bandFits({ ...GAMES[0], ages: [4, 7] }, six), 'an overlap at the edge still counts');
  assert.ok(!bandFits({ ...GAMES[0], ages: [10, 99] }, six));
});

test('every game is reachable from at least one band', () => {
  for (const game of GAMES) {
    assert.ok(AGE_BANDS.some((b) => bandFits(game, b)), `${game.id} falls through every filter`);
  }
});
