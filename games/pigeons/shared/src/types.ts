/**
 * Голуби: the shape of a match.
 *
 * Nothing in this package touches a window, a socket or a clock. A round is
 * decided from its arguments alone, so the server and every phone in the room
 * reach the same answer from the same handful of bytes.
 */

/** Fixed integration step for a shot. Never varies: replay depends on it. */
export const SHOT_DT = 1 / 120;
/** A shot still flying after this is dropped, so a bad angle cannot hang a round. */
export const SHOT_MAX_T = 8;
/** Downward pull, world units per second squared. */
export const GRAVITY = 900;
/** Speed of a throw at full power, before the food's own multiplier. */
export const THROW_SPEED = 620;
/** How hard the wind pushes, per unit of a food's drag. */
export const WIND_FORCE = 150;

/** The world the birds perch in. Everything is laid out inside this box. */
export const FIELD_W = 800;
export const FIELD_H = 360;
/** Below this the shot has left the world and nothing more can be hit. */
export const GROUND_Y = 330;

export const MIN_BIRDS = 2;
export const MAX_BIRDS = 4;

export type FoodId = 'seed' | 'melon' | 'pepper' | 'icecream';

export interface Food {
  id: FoodId;
  /** Multiplies the throw speed. */
  speed: number;
  /** Blast radius in world units. */
  blast: number;
  /** Damage at the centre of the blast, falling to zero at the rim. */
  power: number;
  /** How hard the wind pushes it sideways; 0 means immune. */
  drag: number;
  /** Bounces off intact props before it splats. */
  bounces: number;
  /** Rounds the bird waits before it may fire again. */
  digest: number;
}

export interface Bird {
  slot: number;
  x: number;
  y: number;
  hp: number;
  /** Rounds still to wait before this bird may fire. */
  busy: number;
  alive: boolean;
}

export type PropKind = 'roof' | 'awning' | 'chimney' | 'umbrella';

export interface Prop {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: PropKind;
  hp: number;
  /** A broken prop stops nothing; it is kept so the client can draw rubble. */
  intact: boolean;
}

export interface Shot {
  slot: number;
  food: FoodId;
  /** Radians; 0 points right, negative points up. */
  angle: number;
  /** 0..1 of a full-power throw. */
  power: number;
}

export interface MatchState {
  seed: number;
  round: number;
  birds: Bird[];
  props: Prop[];
  over: boolean;
  /** The winning slot, or null when everybody went down together. */
  winner: number | null;
}
