import test from 'node:test';
import assert from 'node:assert/strict';
import { isDone, leftToDo, nextPicture, paintById, PALETTE, PICTURES } from './index.js';

test('every paint has a distinct id and a real colour', () => {
  const ids = new Set(PALETTE.map((p) => p.id));

  assert.equal(ids.size, PALETTE.length, 'two paints share an id');
  for (const paint of PALETTE) {
    assert.match(paint.hex, /^#[0-9a-f]{6}$/i, `${paint.id}: ${paint.hex} is not a colour`);
  }
});

test('every paint is named in Ukrainian, because the name is spoken', () => {
  // A wrong name here is not a typo. The player cannot read, so this word is
  // the only thing telling them what the colour is called.
  const names = new Set(PALETTE.map((p) => p.name));
  assert.equal(names.size, PALETTE.length, 'two paints share a name');
  for (const paint of PALETTE) {
    assert.match(paint.name, /^[а-яіїєґ'ʼ]+$/i, `${paint.id}: "${paint.name}" is not a Ukrainian word`);
  }
});

test('the palette holds the colours a four-year-old is expected to know', () => {
  const want = ['червоний', 'жовтий', 'зелений', 'синій', 'чорний', 'білий'];
  for (const name of want) {
    assert.ok(PALETTE.some((p) => p.name === name), `no ${name}`);
  }
});

test('every picture has a distinct id and enough to colour', () => {
  const ids = new Set(PICTURES.map((p) => p.id));
  assert.equal(ids.size, PICTURES.length, 'two pictures share an id');
  for (const picture of PICTURES) {
    assert.ok(picture.regions.length >= 4, `${picture.id} has only ${picture.regions.length} parts`);
    assert.ok(picture.regions.length <= 8, `${picture.id} has ${picture.regions.length} parts, which is a chore`);
    assert.equal(new Set(picture.regions).size, picture.regions.length, `${picture.id} names a part twice`);
    assert.match(picture.title, /^[а-яіїєґ'ʼ ]+$/i, `${picture.id}: "${picture.title}" is not a Ukrainian word`);
  }
});

test('a picture is finished only when every part has a colour', () => {
  const picture = PICTURES[0];
  const filled: Record<string, string | undefined> = {};

  assert.equal(isDone(picture, filled), false);
  assert.equal(leftToDo(picture, filled), picture.regions.length);
  for (const r of picture.regions) filled[r] = 'red';
  assert.equal(isDone(picture, filled), true);
  assert.equal(leftToDo(picture, filled), 0);
});

test('a colour on a part that is not in this picture does not finish it', () => {
  const picture = PICTURES[0];

  assert.equal(isDone(picture, { хвіст: 'red', щось: 'blue' }), false);
});

test('the pictures go round for ever, so there is never a dead end', () => {
  let at = PICTURES[0];
  for (let i = 0; i < PICTURES.length; i++) at = nextPicture(at.id);

  assert.equal(at.id, PICTURES[0].id, 'the round trip did not come back');
});

test('an unknown picture still leads somewhere', () => {
  assert.ok(nextPicture('nothing-like-this'));
});

test('a paint id off the wire cannot reach through the palette', () => {
  assert.equal(paintById('constructor'), null);
  assert.equal(paintById('__proto__'), null);
  assert.equal(paintById(7), null);
  assert.equal(paintById(null), null);
  assert.equal(paintById('red')?.name, 'червоний');
});
