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
  /** Seconds until the next animal goes. */
  until: number;
  nextId: number;
  /** Which seat is winding up, and how far through, or null. */
  bracing: { seat: number; t: number } | null;
}

/** What happened during one step, for the client to make a noise about. */
export type Event =
  | { t: 'brace'; seat: number }
  | { t: 'drop'; seat: number; x: number }
  | { t: 'catch'; count: number }
  | { t: 'miss'; x: number };
