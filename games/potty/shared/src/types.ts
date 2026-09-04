/**
 * «На горщик!» -- the rules, with nothing in them that needs a screen.
 *
 * The player is three to six years old, so there is no losing. A miss costs a
 * splat on the floor and nothing else: a child this age who is thrown back to
 * the start stops playing and does not come back. The game gets a little
 * quicker as it goes and never gets hard.
 */

export const FIELD_W = 800;
export const FIELD_H = 450;
/** Where the floor is, and so where the potty stands. */
export const FLOOR_Y = 396;
/** The potty's mouth, in world units. Wide, because the hands are small. */
export const POTTY_W = 104;
/** How fast the potty slides towards the finger. */
export const POTTY_SPEED = 620;
export const DROP_R = 13;
export const GRAVITY = 300;

/** How many the potty holds before it has to be emptied. */
export const POTTY_CAP = 4;
/** Stars needed to finish a level. */
export const STARS_PER_LEVEL = 3;
/** Where the toilet stands, and how wide its target is. */
export const TOILET_X = 748;
export const TOILET_W = 86;
/** How long emptying takes. The potty catches nothing while it lasts. */
export const FLUSH_TIME = 1.05;
/** Nothing is dropped past here, or it would fall onto the toilet. */
export const DROP_MAX_X = 690;

/** Where the animals sit, left to right along the fence. */
export const SEATS: { x: number; y: number }[] = [
  { x: 130, y: 150 },
  { x: 320, y: 118 },
  { x: 510, y: 118 },
  { x: 690, y: 150 },
];

export type AnimalId = 'cat' | 'pig' | 'cow' | 'bird';

export const ANIMALS: AnimalId[] = ['cat', 'pig', 'cow', 'bird'];

export interface Drop {
  id: number;
  x: number;
  y: number;
  vy: number;
  /** Which seat it came from, so the client knows who to animate. */
  seat: number;
}

export interface Splat {
  x: number;
  seed: number;
}

export interface PottyState {
  seed: number;
  /** Seconds since the game began. */
  time: number;
  /** Where the potty is, its centre. */
  pottyX: number;
  drops: Drop[];
  splats: Splat[];
  caught: number;
  missed: number;
  /** How many are in the potty right now. */
  held: number;
  /** Stars earned towards the current level. */
  stars: number;
  /** Counts from one. It decides how many animals are awake. */
  level: number;
  /** Seconds left of emptying, or zero. */
  flushing: number;
  /** Seconds until the next animal goes. */
  until: number;
  nextId: number;
  /** Which seats are winding up, and how far through each is. */
  bracing: { seat: number; t: number }[];
}

/** What happened during one step, for the client to make a noise about. */
export type Event =
  | { t: 'brace'; seat: number }
  | { t: 'drop'; seat: number; x: number }
  /** Went in. `held` is how many are in the potty now, which is what is counted aloud. */
  | { t: 'catch'; held: number }
  /** The potty is full and will take nothing more until it is emptied. */
  | { t: 'full' }
  /** Caught on a full potty: it bounces off and lands on the floor. */
  | { t: 'overflow'; x: number }
  | { t: 'flush' }
  | { t: 'star'; stars: number }
  | { t: 'level'; level: number }
  | { t: 'miss'; x: number };
