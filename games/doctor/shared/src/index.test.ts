import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AILMENTS,
  ailmentById,
  callNext,
  isOver,
  nextStep,
  openSurgery,
  patient,
  PATIENTS,
  ROUND,
  SPOTS,
  Surgery,
  TOOLS,
  use,
} from './index.js';

/** Treats whoever is on the couch, correctly, and shows the next one in. */
function cure(g: Surgery): void {
  let step = nextStep(g);
  while (step) {
    assert.equal(use(g, step.tool, step.spot) === 'wrongTool', false);
    step = nextStep(g);
  }
  callNext(g);
}

// ------------------------------------------------------------- the catalogue

test('every complaint has something to do about it', () => {
  for (const a of AILMENTS) {
    assert.ok(a.steps.length >= 1, `${a.id} has no cure`);
    assert.ok(a.steps.length <= 3, `${a.id} takes ${a.steps.length} steps, which is a chore`);
    assert.ok(a.told.length > 3 && a.cured.length > 3, `${a.id} says nothing`);
  }
});

test('every step names a tool and a place that exist', () => {
  // A step naming a tool nobody has is a patient who can never be cured, and
  // the game would simply stop with nothing on screen looking wrong.
  const tools = new Set(TOOLS.map((t) => t.id));
  for (const a of AILMENTS) {
    for (const s of a.steps) {
      assert.ok(tools.has(s.tool), `${a.id}: no such tool as ${s.tool}`);
      assert.ok(SPOTS.includes(s.spot), `${a.id}: no such place as ${s.spot}`);
    }
  }
});

test('every tool is good for something', () => {
  const used = new Set(AILMENTS.flatMap((a) => a.steps.map((s) => s.tool)));
  for (const tool of TOOLS) {
    assert.ok(used.has(tool.id), `${tool.id} is on the tray and cures nothing`);
  }
});

test('names are Ukrainian, because every one of them is said out loud', () => {
  for (const t of TOOLS) assert.match(t.name, /^[а-яіїєґ'ʼ]+$/i, `${t.id}: "${t.name}"`);
  for (const p of PATIENTS) assert.match(p.name, /^[а-яіїєґ'ʼ]+$/i, `${p.id}: "${p.name}"`);
});

// ---------------------------------------------------------------- the visits

test('a day brings a full queue', () => {
  const g = openSurgery(7);

  assert.equal(g.queue.length, ROUND);
  assert.ok(patient(g));
  assert.equal(isOver(g), false);
});

test('neither the animal nor the complaint repeats twice running', () => {
  // The same thing twice reads as the game having got stuck, and the second
  // one teaches nothing the first did not.
  for (let seed = 0; seed < 60; seed++) {
    const g = openSurgery(seed * 7919, 8);
    for (let i = 1; i < g.queue.length; i++) {
      assert.notEqual(g.queue[i].animal, g.queue[i - 1].animal, `seed ${seed}: same animal twice`);
      assert.notEqual(g.queue[i].ailment, g.queue[i - 1].ailment, `seed ${seed}: same complaint twice`);
    }
  }
});

test('the right tool in the right place is the only thing that helps', () => {
  const g = openSurgery(3);
  const step = nextStep(g)!;
  const wrongTool = TOOLS.find((t) => t.id !== step.tool)!.id;
  const wrongSpot = SPOTS.find((s) => s !== step.spot)!;

  assert.equal(use(g, wrongTool, step.spot), 'wrongTool');
  assert.equal(use(g, step.tool, wrongSpot), 'wrongSpot');
  assert.equal(patient(g)!.done, 0, 'a wrong tap moved the treatment on');
  assert.ok(['treated', 'cured'].includes(use(g, step.tool, step.spot)));
  assert.equal(patient(g)!.done, 1);
});

test('a wrong tap costs nothing but the clean-run mark', () => {
  const g = openSurgery(3);
  const step = nextStep(g)!;
  use(g, TOOLS.find((t) => t.id !== step.tool)!.id, step.spot);

  assert.equal(g.slipped, true);
  assert.equal(g.queue.length, ROUND, 'a wrong tap took a patient away');
  cure(g);
  assert.equal(g.clean, 0, 'a slip still counted as a clean visit');
});

test('a patient treated cleanly counts, and the next one starts clean again', () => {
  const g = openSurgery(3);
  cure(g);

  assert.equal(g.clean, 1);
  assert.equal(g.slipped, false, 'the slip carried over to the next patient');
});

test('the steps have to be done in their own order', () => {
  const twoStep = AILMENTS.find((a) => a.steps.length > 1)!;
  const g = openSurgery(1);
  g.queue[0] = { animal: PATIENTS[0].id, ailment: twoStep.id, done: 0 };
  const second = twoStep.steps[1];

  assert.equal(use(g, second.tool, second.spot) === 'treated', false, 'the second step was allowed first');
  assert.equal(patient(g)!.done, 0);
});

test('every patient in a day can be cured, and then the day ends', () => {
  for (let seed = 0; seed < 40; seed++) {
    const g = openSurgery(seed * 104729);
    for (let i = 0; i < ROUND; i++) cure(g);

    assert.equal(isOver(g), true, `seed ${seed} never ended`);
    assert.equal(g.clean, ROUND);
    assert.equal(patient(g), null);
    assert.equal(nextStep(g), null);
  }
});

test('nothing happens once the day is over', () => {
  const g = openSurgery(5);
  for (let i = 0; i < ROUND; i++) cure(g);

  assert.equal(use(g, 'plaster', 'paw'), 'idle');
});

test('the same seed brings the same patients', () => {
  assert.deepEqual(openSurgery(4242).queue, openSurgery(4242).queue);
});

test('a made-up complaint cannot reach through the catalogue', () => {
  assert.equal(ailmentById('constructor'), null);
  assert.equal(ailmentById('__proto__'), null);
  assert.equal(ailmentById(3), null);
  assert.equal(ailmentById('scratch')?.steps.length, 1);
});
