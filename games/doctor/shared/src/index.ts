/**
 * «Лікарня» -- a patient comes in, and you make it better.
 *
 * What ails them is always visible: a scratch is drawn on the paw, mud is
 * drawn where the mud is, a fever is a red forehead. A child of three cannot
 * be asked to work out an invisible cause, but they can be asked to look, and
 * looking is the thing worth teaching.
 *
 * Nothing here draws anything. What is here is who comes in, what is wrong,
 * what fixes it and in what order -- all of which can be wrong with no screen
 * to show it.
 */

export type ToolId =
  | 'plaster'
  | 'sponge'
  | 'thermometer'
  | 'syrup'
  | 'brush'
  | 'tweezers'
  | 'stethoscope'
  | 'hug';

export interface Tool {
  id: ToolId;
  /** Said out loud when it is picked up. */
  name: string;
}

export const TOOLS: Tool[] = [
  { id: 'plaster', name: 'пластир' },
  { id: 'sponge', name: 'губка' },
  { id: 'thermometer', name: 'градусник' },
  { id: 'syrup', name: 'сироп' },
  { id: 'brush', name: 'щіточка' },
  { id: 'tweezers', name: 'пінцет' },
  { id: 'stethoscope', name: 'слухавка' },
  { id: 'hug', name: 'обіймашки' },
];

/** Places on the patient a tool can be used. The same on every animal. */
export type SpotId = 'paw' | 'forehead' | 'mouth' | 'chest' | 'body' | 'dirt1' | 'dirt2' | 'dirt3';

export const SPOTS: SpotId[] = ['paw', 'forehead', 'mouth', 'chest', 'body', 'dirt1', 'dirt2', 'dirt3'];

export interface Step {
  tool: ToolId;
  spot: SpotId;
}

export interface Ailment {
  id: string;
  /** Said out loud when the patient sits down. */
  told: string;
  /** Said out loud when the last step is done. */
  cured: string;
  /** In order. The one being waited for is the one that glows. */
  steps: Step[];
}

export const AILMENTS: Ailment[] = [
  {
    id: 'scratch',
    told: 'Ой, подряпина на лапці!',
    cured: 'Лапка як нова!',
    steps: [{ tool: 'plaster', spot: 'paw' }],
  },
  {
    id: 'dirt',
    told: 'Ой, який замурзаний!',
    cured: 'Чистенький!',
    steps: [
      { tool: 'sponge', spot: 'dirt1' },
      { tool: 'sponge', spot: 'dirt2' },
      { tool: 'sponge', spot: 'dirt3' },
    ],
  },
  {
    id: 'fever',
    told: 'Здається, температура.',
    cured: 'Все, вже не гаряче!',
    steps: [
      { tool: 'thermometer', spot: 'forehead' },
      { tool: 'syrup', spot: 'mouth' },
    ],
  },
  {
    id: 'tooth',
    told: 'Ой, зубик болить!',
    cured: 'Зубки блищать!',
    steps: [{ tool: 'brush', spot: 'mouth' }],
  },
  {
    id: 'thorn',
    told: 'Колючка в лапці!',
    cured: 'Витягли! Тепер не болить.',
    steps: [
      { tool: 'tweezers', spot: 'paw' },
      { tool: 'plaster', spot: 'paw' },
    ],
  },
  {
    id: 'cough',
    told: 'Кахи-кахи… щось кашляє.',
    cured: 'Більше не кашляє!',
    steps: [
      { tool: 'stethoscope', spot: 'chest' },
      { tool: 'syrup', spot: 'mouth' },
    ],
  },
  {
    id: 'sad',
    told: 'Комусь сумно…',
    cured: 'Тепер усміхається!',
    steps: [{ tool: 'hug', spot: 'body' }],
  },
];

export interface AnimalKind {
  id: string;
  name: string;
}

export const PATIENTS: AnimalKind[] = [
  { id: 'cat', name: 'котик' },
  { id: 'dog', name: 'песик' },
  { id: 'bunny', name: 'зайчик' },
  { id: 'bear', name: 'ведмедик' },
  { id: 'pig', name: 'свинка' },
  { id: 'frog', name: 'жабка' },
];

export interface Visit {
  animal: string;
  ailment: string;
  /** How many of the ailment's steps are done. */
  done: number;
}

export interface Surgery {
  seed: number;
  queue: Visit[];
  at: number;
  /** How many patients were treated with no wrong taps at all. */
  clean: number;
  /** Whether the current patient has had a wrong tap. */
  slipped: boolean;
}

/** How many patients come in before the day is over. */
export const ROUND = 5;

/**
 * @param id the ailment
 * @return it, or null when the name is not one of ours
 */
export function ailmentById(id: unknown): Ailment | null {
  if (typeof id !== 'string') return null;

  return AILMENTS.find((a) => a.id === id) ?? null;
}

/**
 * @param seed the seed
 * @return a number in 0..1 and the seed to carry on with
 */
function next(seed: number): { value: number; seed: number } {
  let h = (seed + 0x6d2b79f5) >>> 0;
  h = Math.imul(h ^ (h >>> 15), h | 1) >>> 0;
  h = (h ^ (h + Math.imul(h ^ (h >>> 7), h | 61))) >>> 0;

  return { value: ((h ^ (h >>> 14)) >>> 0) / 4294967296, seed: h };
}

/**
 * A day's worth of patients.
 *
 * Neither the animal nor the complaint repeats twice running: the same thing
 * twice in a row reads to a child as the game having got stuck, and the second
 * one teaches nothing the first did not.
 *
 * @param seed anything; the same seed brings the same patients
 * @param count how many come in
 * @return the queue
 */
export function openSurgery(seed: number, count = ROUND): Surgery {
  let s = seed >>> 0;
  const roll = (): number => {
    const r = next(s);
    s = r.seed;

    return r.value;
  };
  const queue: Visit[] = [];
  for (let i = 0; i < count; i++) {
    let animal = PATIENTS[Math.floor(roll() * PATIENTS.length)].id;
    let ailment = AILMENTS[Math.floor(roll() * AILMENTS.length)].id;
    let tries = 0;
    while (queue.length && tries < 20 && (animal === queue[queue.length - 1].animal || ailment === queue[queue.length - 1].ailment)) {
      animal = PATIENTS[Math.floor(roll() * PATIENTS.length)].id;
      ailment = AILMENTS[Math.floor(roll() * AILMENTS.length)].id;
      tries++;
    }
    queue.push({ animal, ailment, done: 0 });
  }

  return { seed: s, queue, at: 0, clean: 0, slipped: false };
}

/**
 * @param g the surgery
 * @return who is on the couch, or null once the day is over
 */
export function patient(g: Surgery): Visit | null {
  return g.queue[g.at] ?? null;
}

/**
 * @param g the surgery
 * @return what has to be done next to the patient, or null when they are well
 */
export function nextStep(g: Surgery): Step | null {
  const visit = patient(g);
  if (!visit) return null;
  const ailment = ailmentById(visit.ailment);
  if (!ailment) return null;

  return ailment.steps[visit.done] ?? null;
}

export type Outcome = 'treated' | 'cured' | 'wrongTool' | 'wrongSpot' | 'idle';

/**
 * One use of one tool on one place.
 *
 * A wrong tap costs nothing but a shake of the head. Being told off by a
 * screen is the fastest way to stop a small child wanting to play, and there
 * is nothing here worth risking that for.
 *
 * @param g the surgery, advanced in place
 * @param tool what is in hand
 * @param spot where it was used
 * @return what happened
 */
export function use(g: Surgery, tool: ToolId, spot: SpotId): Outcome {
  const step = nextStep(g);
  if (!step) return 'idle';
  if (step.tool !== tool) {
    g.slipped = true;

    return 'wrongTool';
  }
  if (step.spot !== spot) {
    g.slipped = true;

    return 'wrongSpot';
  }
  const visit = patient(g)!;
  visit.done++;

  return nextStep(g) ? 'treated' : 'cured';
}

/**
 * Shows the next patient in. Called once the cured one has waved goodbye.
 *
 * @param g the surgery, advanced in place
 * @return whether anybody else is waiting
 */
export function callNext(g: Surgery): boolean {
  if (!g.slipped) g.clean++;
  g.slipped = false;
  g.at++;

  return !!patient(g);
}

/**
 * @param g the surgery
 * @return whether everybody has been seen
 */
export function isOver(g: Surgery): boolean {
  return g.at >= g.queue.length;
}
