/**
 * «На горщик!» -- the rules, with nothing in them that needs a screen.
 *
 * The player is three to six years old. There is a way to lose, but it takes
 * three ignored animals in a row to get there, and every step towards it is
 * drawn on the animal's face long before it happens.
 *
 * Nothing falls on its own. An animal asks, and waits, and only lets go once
 * the potty is actually underneath it -- so a miss is never bad luck, it is
 * always somebody who was not helped in time.
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

/**
 * How much the potty holds, measured in the same units the animals produce.
 *
 * Counting pieces was a lie: a cow and a hamster are not the same amount, and
 * a child can see that they are not. Ten is small enough to count to and big
 * enough that a cow fills the pot on its own.
 */
export const POTTY_CAP = 10;
/** Where the toilet stands, and how wide its target is. */
export const TOILET_X = 748;
export const TOILET_W = 86;
/** How long emptying takes. The potty catches nothing while it lasts. */
export const FLUSH_TIME = 1.05;
/** Where the potty stands to pour: beside the toilet, not on top of it. */
export const POUR_X = TOILET_X - 54;

/** How many times each animal has to go before it is happy and stops asking. */
export const GOAL = 5;
/** Three ignored urges and it bursts. The third is the one that does it. */
export const STRIKES = 3;
/**
 * How long an animal will wait, by how many times it has already been failed.
 *
 * The first wait is the gentle one. After that the face goes red and the clock
 * is the same five seconds every time, so the rule stops changing underneath a
 * child who has just learnt it.
 */
export const WAIT: number[] = [3.4, 5, 5];
/** The most animals that may be asking at once. */
export const MAX_URGES = 2;
/** Seconds between one animal starting to ask and the next. */
export const URGE_GAP = 1.9;

/** Where the animals sit, left to right along the fence. */
export const SEATS: { x: number; y: number }[] = [
  { x: 130, y: 150 },
  { x: 320, y: 118 },
  { x: 510, y: 118 },
  { x: 690, y: 150 },
];

export type AnimalId = 'hamster' | 'bird' | 'cat' | 'dog' | 'sheep' | 'pig' | 'cow';

/** How much each one produces, out of a potty that holds POTTY_CAP. */
export const SIZE: Record<AnimalId, number> = {
  hamster: 1,
  bird: 2,
  cat: 3,
  dog: 4,
  sheep: 5,
  pig: 6,
  cow: 10,
};

/**
 * The cast is drawn from these three groups, two small, one middling and one
 * big. A straight shuffle could deal a cow, a pig and a sheep together, and
 * then the potty is full after every single animal and the game is a queue at
 * the toilet.
 */
export const SMALL: AnimalId[] = ['hamster', 'bird', 'cat'];
export const MIDDLING: AnimalId[] = ['dog', 'sheep'];
export const BIG: AnimalId[] = ['pig', 'cow'];

/** How many animals are on the fence when the game starts. */
export const START_AWAKE = 2;

export interface Animal {
  seat: number;
  id: AnimalId;
  /** How much it produces, out of POTTY_CAP. */
  size: number;
  /** Not on the fence yet. It arrives when the potty is emptied. */
  asleep: boolean;
  /** How many have gone in the potty. At GOAL it is happy and stops asking. */
  pooped: number;
  /** How many times it has been left waiting. At STRIKES it bursts. */
  strikes: number;
  alive: boolean;
  /** Seconds left of the current ask, or null when it is not asking. */
  urge: number | null;
}

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
  /** Where it stuck. Absent means the floor, which is where most of them land. */
  y?: number;
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
  animals: Animal[];
  caught: number;
  missed: number;
  /** How much is in the potty right now, in the same units as SIZE. */
  held: number;
  /** Seconds left of emptying, or zero. */
  flushing: number;
  /** Seconds until another animal starts asking. */
  until: number;
  nextId: number;
  /** How it ended, or null while it is still going. */
  over: 'won' | 'lost' | null;
}

/** What happened during one step, for the client to make a noise about. */
export type Event =
  /** An animal has started asking and is waiting for the potty. */
  | { t: 'urge'; seat: number }
  /** The potty was underneath, so it let go. */
  | { t: 'drop'; seat: number; x: number }
  /** Went in. `held` is how full the potty is now, which is what is counted aloud. */
  | { t: 'catch'; held: number; seat: number }
  /** A new animal has arrived on the fence. */
  | { t: 'wake'; seat: number }
  /** That animal has had its fifth and is done. */
  | { t: 'happy'; seat: number }
  /** Left waiting. It is red from now on. */
  | { t: 'angry'; seat: number; strikes: number }
  /** Left waiting once too often. */
  | { t: 'boom'; seat: number }
  /** Somebody is asking who will not fit in what is left of the potty. */
  | { t: 'full' }
  | { t: 'flush' }
  | { t: 'miss'; x: number }
  | { t: 'over'; won: boolean; happy: number };
