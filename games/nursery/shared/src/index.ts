/**
 * «У садочку» -- a morning as the one who looks after everybody.
 *
 * Three moments, in the order a real morning has them: breakfast, tidying up,
 * and a nap. The order is the point. A child of three or four is learning that
 * a day has a shape, and a game that shuffled the shape would be teaching the
 * opposite of what a nursery teaches.
 *
 * Nothing here draws anything. What is here is who is in the room, what each
 * of them wants, and what counts as having seen to them.
 */

export type Moment = 'breakfast' | 'tidy' | 'nap';

/** In the order a morning happens. */
export const MOMENTS: Moment[] = ['breakfast', 'tidy', 'nap'];

export const MOMENT_TOLD: Record<Moment, string> = {
  breakfast: 'Час снідати! Хто що хоче?',
  tidy: 'Тепер прибираємо іграшки.',
  nap: 'А тепер тиха година.',
};

export const MOMENT_DONE: Record<Moment, string> = {
  breakfast: 'Усі поснідали!',
  tidy: 'Усе прибрано!',
  nap: 'Усі сплять. Тиша.',
};

export type FoodId = 'apple' | 'milk' | 'porridge' | 'banana' | 'bread' | 'berry';

export interface Food {
  id: FoodId;
  name: string;
}

export const FOODS: Food[] = [
  { id: 'apple', name: 'яблучко' },
  { id: 'milk', name: 'молочко' },
  { id: 'porridge', name: 'кашка' },
  { id: 'banana', name: 'бананчик' },
  { id: 'bread', name: 'хлібчик' },
  { id: 'berry', name: 'ягідка' },
];

export type ToyId = 'ball' | 'cube' | 'bear' | 'car' | 'duck';

export const TOYS: ToyId[] = ['ball', 'cube', 'bear', 'car', 'duck'];

export const ANIMALS = ['cat', 'dog', 'bunny', 'bear', 'pig', 'frog'];

export interface Kid {
  seat: number;
  animal: string;
  /** What it asked for at breakfast. */
  wants: FoodId;
  fed: boolean;
  tucked: boolean;
}

export interface Toy {
  id: number;
  kind: ToyId;
  /** Where it was dropped, in world units. */
  x: number;
  y: number;
  away: boolean;
}

export interface Day {
  seed: number;
  moment: Moment;
  kids: Kid[];
  toys: Toy[];
  lightOff: boolean;
  /** Taps that did nothing useful, over the whole morning. */
  slips: number;
  over: boolean;
}

/** How many children are in the room. */
export const KIDS = 4;
/** How many toys end up on the floor. */
export const TOY_COUNT = 6;

/** The corner the toy box stands in. Nothing is dropped inside it. */
export const BOX_KEEP_OUT = { x0: 512, y0: 348 };

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
 * @param id a food id off a button
 * @return the food, or null when it is not one of ours
 */
export function foodById(id: unknown): Food | null {
  if (typeof id !== 'string') return null;

  return FOODS.find((f) => f.id === id) ?? null;
}

/**
 * @param seed anything; the same seed gives the same morning
 * @return the room at the start of breakfast
 */
export function openDay(seed: number): Day {
  let s = seed >>> 0;
  const roll = (): number => {
    const r = next(s);
    s = r.seed;

    return r.value;
  };

  const animals = [...ANIMALS];
  const kids: Kid[] = [];
  // Every child asks for something different. Two asking for the same thing
  // makes the shelf ambiguous, and being right by accident teaches nothing.
  const menu = [...FOODS];
  for (let seat = 0; seat < KIDS; seat++) {
    const animal = animals.splice(Math.floor(roll() * animals.length), 1)[0];
    const wants = menu.splice(Math.floor(roll() * menu.length), 1)[0].id;
    kids.push({ seat, animal, wants, fed: false, tucked: false });
  }

  const toys: Toy[] = [];
  for (let i = 0; i < TOY_COUNT; i++) {
    // Kept off the toy box, which stands in the bottom right. A toy behind the
    // box looks like a toy that cannot be picked up.
    let x = 90 + roll() * 520;
    // Below where the children stand, or a toy lies across somebody's face.
    const y = 352 + roll() * 84;
    if (x > BOX_KEEP_OUT.x0 && y > BOX_KEEP_OUT.y0) x -= BOX_KEEP_OUT.x0 - 90;
    toys.push({ id: i, kind: TOYS[Math.floor(roll() * TOYS.length)], x, y, away: false });
  }

  return { seed: s, moment: 'breakfast', kids, toys, lightOff: false, slips: 0, over: false };
}

/**
 * @param d the morning
 * @return whether everything this moment asks for has been done
 */
export function momentDone(d: Day): boolean {
  if (d.moment === 'breakfast') return d.kids.every((k) => k.fed);
  if (d.moment === 'tidy') return d.toys.every((t) => t.away);

  return d.kids.every((k) => k.tucked) && d.lightOff;
}

/**
 * Moves the morning on. Called once the finished moment has been celebrated.
 *
 * @param d the morning, advanced in place
 * @return the moment now open, or null when the morning is over
 */
export function nextMoment(d: Day): Moment | null {
  const at = MOMENTS.indexOf(d.moment);
  const then = MOMENTS[at + 1];
  if (!then) {
    d.over = true;

    return null;
  }
  d.moment = then;

  return then;
}

export type Outcome = 'right' | 'wrong' | 'idle';

/**
 * Gives a child something to eat.
 *
 * @param d the morning, advanced in place
 * @param seat which child
 * @param food what was offered
 * @return whether it was what they asked for
 */
export function feed(d: Day, seat: number, food: FoodId): Outcome {
  if (d.moment !== 'breakfast' || d.over) return 'idle';
  const kid = d.kids[seat];
  if (!kid || kid.fed) return 'idle';
  if (kid.wants !== food) {
    d.slips++;

    return 'wrong';
  }
  kid.fed = true;

  return 'right';
}

/**
 * Puts one toy in the box.
 *
 * @param d the morning, advanced in place
 * @param id which toy
 * @return whether there was a toy there to put away
 */
export function putAway(d: Day, id: number): Outcome {
  if (d.moment !== 'tidy' || d.over) return 'idle';
  const toy = d.toys.find((t) => t.id === id);
  if (!toy || toy.away) return 'idle';
  toy.away = true;

  return 'right';
}

/**
 * @param d the morning
 * @return how many toys are still on the floor
 */
export function leftOnFloor(d: Day): number {
  return d.toys.filter((t) => !t.away).length;
}

/**
 * Tucks a child in.
 *
 * @param d the morning, advanced in place
 * @param seat which child
 * @return whether there was anybody to tuck in
 */
export function tuck(d: Day, seat: number): Outcome {
  if (d.moment !== 'nap' || d.over) return 'idle';
  const kid = d.kids[seat];
  if (!kid || kid.tucked) return 'idle';
  kid.tucked = true;

  return 'right';
}

/**
 * Turns the light off, which only works once everybody is under a blanket.
 *
 * The light last is the whole shape of a bedtime, and a room that went dark
 * with somebody still sitting up would teach the shape backwards.
 *
 * @param d the morning, advanced in place
 * @return whether the light went off
 */
export function lightsOut(d: Day): Outcome {
  if (d.moment !== 'nap' || d.over || d.lightOff) return 'idle';
  if (!d.kids.every((k) => k.tucked)) {
    d.slips++;

    return 'wrong';
  }
  d.lightOff = true;

  return 'right';
}
