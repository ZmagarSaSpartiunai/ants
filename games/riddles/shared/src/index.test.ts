import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allCards,
  ANIMALS,
  CHOICES,
  COLOURS,
  KINDS,
  makeRound,
  MAX_COUNT,
  SHAPES,
} from './index.js';

test('every question offers its own answer', () => {
  // The one bug that makes the game unwinnable, and the easiest to write.
  for (let seed = 0; seed < 60; seed++) {
    for (const r of makeRound(seed * 7919, 8)) {
      assert.ok(r.choices.includes(r.answer), `${r.ask}: the answer is not on offer`);
    }
  }
});

test('the choices are three, and all different', () => {
  for (let seed = 0; seed < 60; seed++) {
    for (const r of makeRound(seed * 104729, 8)) {
      assert.equal(r.choices.length, CHOICES, r.ask);
      assert.equal(new Set(r.choices).size, CHOICES, `${r.ask}: the same card twice`);
    }
  }
});

test('the answer is not always in the same place', () => {
  // A child works out "always the middle one" far sooner than anybody expects.
  const seen = new Set<number>();
  for (let seed = 0; seed < 40; seed++) {
    for (const r of makeRound(seed * 65537, 8)) seen.add(r.choices.indexOf(r.answer));
  }

  assert.equal(seen.size, CHOICES, `the answer only ever appeared in ${seen.size} of ${CHOICES} places`);
});

test('a round is a mix, not four colour questions running', () => {
  // Left to chance it can deal four of a kind, and a child decides the game is
  // about colours and loses interest when it turns out not to be.
  for (let seed = 0; seed < 30; seed++) {
    const kinds = new Set(makeRound(seed * 2654435761, 8).map((r) => r.kind));
    assert.equal(kinds.size, KINDS.length, `seed ${seed} used only ${kinds.size} kinds`);
  }
});

test('every question is asked out loud and in Ukrainian', () => {
  for (const r of makeRound(5, 12)) {
    assert.ok(r.ask.length > 3, `"${r.ask}" is not a question`);
    assert.match(r.ask, /[а-яіїєґ]/i, `"${r.ask}" is not Ukrainian`);
    assert.ok(r.praise.length > 1, `"${r.ask}" has nothing to say when answered`);
  }
});

test('the same seed asks the same round twice', () => {
  assert.deepEqual(makeRound(4242, 8), makeRound(4242, 8));
});

test('different seeds ask different rounds', () => {
  const rounds = new Set<string>();
  for (let seed = 0; seed < 30; seed++) rounds.add(JSON.stringify(makeRound(seed * 31, 8)));

  assert.ok(rounds.size > 25, `only ${rounds.size} different rounds in thirty seeds`);
});

test('every card a question can offer is one the game knows how to draw', () => {
  const known = new Set(allCards());
  for (let seed = 0; seed < 60; seed++) {
    for (const r of makeRound(seed * 97, 8)) {
      for (const c of r.choices) assert.ok(known.has(c), `${c} is offered but not in the catalogue`);
    }
  }
});

test('there is enough of everything to fill three choices', () => {
  assert.ok(ANIMALS.length >= CHOICES);
  assert.ok(COLOURS.length >= CHOICES);
  assert.ok(SHAPES.length >= CHOICES);
  assert.ok(MAX_COUNT >= CHOICES);
});

test('names and sounds are all distinct, or two cards would both be right', () => {
  for (const [what, list] of [
    ['animal sounds', ANIMALS.map((a) => a.says)],
    ['animal names', ANIMALS.map((a) => a.name)],
    ['colours', COLOURS.map((c) => c.name)],
    ['shapes', SHAPES.map((s) => s.name)],
  ] as [string, string[]][]) {
    assert.equal(new Set(list).size, list.length, `two ${what} are the same`);
  }
});
