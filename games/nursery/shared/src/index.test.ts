import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Day,
  feed,
  foodById,
  FOODS,
  KIDS,
  leftOnFloor,
  lightsOut,
  BOX_KEEP_OUT,
  MOMENT_DONE,
  MOMENT_TOLD,
  MOMENTS,
  momentDone,
  nextMoment,
  openDay,
  putAway,
  TOY_COUNT,
  tuck,
} from './index.js';

/** Does everything this moment asks for, correctly, and moves on. */
function getThrough(d: Day): void {
  if (d.moment === 'breakfast') for (const k of d.kids) feed(d, k.seat, k.wants);
  if (d.moment === 'tidy') for (const t of d.toys) putAway(d, t.id);
  if (d.moment === 'nap') {
    for (const k of d.kids) tuck(d, k.seat);
    lightsOut(d);
  }
  nextMoment(d);
}

// ------------------------------------------------------------- the catalogue

test('the morning runs in the order a morning has', () => {
  // A day has a shape, and that shape is what a nursery actually teaches.
  assert.deepEqual(MOMENTS, ['breakfast', 'tidy', 'nap']);
  for (const m of MOMENTS) {
    assert.ok(MOMENT_TOLD[m].length > 5, `${m} is never announced`);
    assert.ok(MOMENT_DONE[m].length > 5, `${m} is never finished out loud`);
  }
});

test('every food is named in Ukrainian, because the name is spoken', () => {
  const names = new Set(FOODS.map((f) => f.name));
  assert.equal(names.size, FOODS.length, 'two foods share a name');
  for (const f of FOODS) assert.match(f.name, /^[а-яіїєґ'ʼ]+$/i, `${f.id}: "${f.name}"`);
});

test('there is enough on the shelf for everybody to want something different', () => {
  assert.ok(FOODS.length >= KIDS);
});

// --------------------------------------------------------------- the morning

test('a morning opens on breakfast with a full room', () => {
  const d = openDay(7);

  assert.equal(d.moment, 'breakfast');
  assert.equal(d.kids.length, KIDS);
  assert.equal(d.toys.length, TOY_COUNT);
  assert.equal(d.over, false);
});

test('no two children ask for the same thing', () => {
  // Two asking for the same thing makes the shelf ambiguous, and being right
  // by accident teaches nothing at all.
  for (let seed = 0; seed < 60; seed++) {
    const d = openDay(seed * 7919);
    const wants = d.kids.map((k) => k.wants);
    assert.equal(new Set(wants).size, wants.length, `seed ${seed}: ${wants.join()}`);
    const animals = d.kids.map((k) => k.animal);
    assert.equal(new Set(animals).size, animals.length, `seed ${seed}: the same animal twice`);
  }
});

test('a child is fed only what it asked for', () => {
  const d = openDay(3);
  const kid = d.kids[0];
  const wrong = FOODS.find((f) => f.id !== kid.wants)!.id;

  assert.equal(feed(d, kid.seat, wrong), 'wrong');
  assert.equal(kid.fed, false, 'the wrong thing still fed it');
  assert.equal(d.slips, 1);
  assert.equal(feed(d, kid.seat, kid.wants), 'right');
  assert.equal(kid.fed, true);
});

test('a child who has eaten is not fed twice', () => {
  const d = openDay(3);
  const kid = d.kids[0];
  feed(d, kid.seat, kid.wants);

  assert.equal(feed(d, kid.seat, kid.wants), 'idle');
  assert.equal(d.slips, 0, 'a harmless second tap counted against the player');
});

test('breakfast is over when everybody has eaten', () => {
  const d = openDay(3);

  assert.equal(momentDone(d), false);
  for (const k of d.kids) feed(d, k.seat, k.wants);
  assert.equal(momentDone(d), true);
});

test('tidying counts down, and each toy goes away once', () => {
  const d = openDay(3);
  nextMoment(d);
  assert.equal(d.moment, 'tidy');
  assert.equal(leftOnFloor(d), TOY_COUNT);

  assert.equal(putAway(d, d.toys[0].id), 'right');
  assert.equal(leftOnFloor(d), TOY_COUNT - 1);
  assert.equal(putAway(d, d.toys[0].id), 'idle', 'the same toy went in twice');
  assert.equal(putAway(d, 999), 'idle');
});

test('the light goes off last, and not before', () => {
  // A room going dark with somebody still sitting up teaches the shape of a
  // bedtime backwards.
  const d = openDay(3);
  nextMoment(d);
  nextMoment(d);
  assert.equal(d.moment, 'nap');

  assert.equal(lightsOut(d), 'wrong');
  assert.equal(d.lightOff, false);
  for (const k of d.kids.slice(0, KIDS - 1)) tuck(d, k.seat);
  assert.equal(lightsOut(d), 'wrong', 'one child was left sitting up');
  tuck(d, d.kids[KIDS - 1].seat);
  assert.equal(lightsOut(d), 'right');
  assert.equal(momentDone(d), true);
});

test('nothing from one moment works during another', () => {
  const d = openDay(3);

  assert.equal(putAway(d, d.toys[0].id), 'idle', 'toys were tidied during breakfast');
  assert.equal(tuck(d, 0), 'idle', 'a child was put to bed during breakfast');
  assert.equal(lightsOut(d), 'idle', 'the light went off during breakfast');
});

test('the whole morning can be got through, and then it ends', () => {
  for (let seed = 0; seed < 30; seed++) {
    const d = openDay(seed * 104729);
    for (let i = 0; i < MOMENTS.length; i++) getThrough(d);

    assert.equal(d.over, true, `seed ${seed} never ended`);
    assert.equal(d.slips, 0, 'doing everything right counted a slip');
    assert.equal(nextMoment(d), null);
  }
});

test('nothing happens once the morning is over', () => {
  const d = openDay(5);
  for (let i = 0; i < MOMENTS.length; i++) getThrough(d);

  assert.equal(feed(d, 0, d.kids[0].wants), 'idle');
  assert.equal(putAway(d, d.toys[0].id), 'idle');
  assert.equal(tuck(d, 0), 'idle');
  assert.equal(lightsOut(d), 'idle');
});

test('the same seed gives the same morning', () => {
  assert.deepEqual(openDay(4242), openDay(4242));
});

test('a made-up food off a button cannot reach through the shelf', () => {
  assert.equal(foodById('constructor'), null);
  assert.equal(foodById('__proto__'), null);
  assert.equal(foodById(2), null);
  assert.equal(foodById('apple')?.name, 'яблучко');
});

test('the toys land inside the room, and never behind the box', () => {
  // A toy under the box looks like a toy that cannot be picked up, and the
  // tidying would never finish for a reason nothing on screen explains.
  for (let seed = 0; seed < 60; seed++) {
    for (const t of openDay(seed * 31).toys) {
      assert.ok(t.x > 40 && t.x < 660, `a toy landed at x ${t.x}`);
      assert.ok(t.y > 340 && t.y < 450, `a toy landed at y ${t.y}, on top of a child`);
      assert.ok(
        !(t.x > BOX_KEEP_OUT.x0 && t.y > BOX_KEEP_OUT.y0),
        `a toy landed on the box at ${Math.round(t.x)},${Math.round(t.y)}`,
      );
    }
  }
});
