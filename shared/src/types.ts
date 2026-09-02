// Rules of the game live here as data. Nothing in this package may touch the
// DOM, the network, the filesystem or the wall clock -- see CLAUDE.md.

export const TICK_HZ = 20;
export const DT = 1 / TICK_HZ;

/** Logical playfield. The client scales this to the viewport. */
export const FIELD_W = 1200;
export const FIELD_H = 800;

export const NEUTRAL = -1;

export type UnitType = 'worker' | 'beetle' | 'wasp';

/** A node produces exactly one unit type; the player never picks it. */
export type NodeKind = 'nest' | 'den' | 'hive';

export interface KindSpec {
  unit: UnitType;
  /** Units per second sent down trails even from an empty node. */
  outBase: number;
  /** Extra units per second for each ant in the garrison. */
  outPer: number;
  /** Units per second while supplied. */
  growth: number;
  /**
   * Hard ceiling. A node grows towards it slowly and fills it fast when columns
   * arrive, so stacking a nest up is worth doing: a big garrison is both a wall
   * and the size of the punch it can throw.
   */
  cap: number;
  /**
   * Trails this node may feed at once. This is the only limit on building:
   * there is no range and nothing blocks a line. A player who cannot tell why
   * a drag failed stops trusting the control entirely, and "this nest already
   * runs its three trails" is a reason you can see on the node itself.
   */
  links: number;
  radius: number;
}

/**
 * Growth is deliberately slow -- a nest gains about one ant every three
 * seconds. The garrison is a stockpile you build up over a whole match, not a
 * bar that refills between attacks, which is why the caps are in the hundreds.
 *
 * Output is what a node sends down its trails, and it never comes out of the
 * garrison. `outBase` is what even an empty node produces; `outPer` is the
 * extra per ant standing in it.
 *
 * `outPer` is deliberately shallow. It used to be twice this, and once a board
 * settled every node sat at its cap pushing five a second into neighbours that
 * were also at their cap: the field was solid with ants and none of them
 * changed a number anywhere. The stack is meant to be dangerous because it is
 * a wall an attacker has to break, not because it doubles as a firehose.
 *
 * At this setting a nest at 30 sends about one a second, one at 150 about
 * three. Low on purpose: ants are individuals here, so the rate is the rate
 * you watch them leave at.
 *
 * Rerun `node tools/balance.mjs` after changing any rule -- these numbers only
 * hold for the rules they were measured against.
 */
/** A nest is the yardstick; the other two are written as multiples of it. */
const NEST_BASE = 0.6;
const NEST_PER = 0.015;

/**
 * How often each kind sends somebody out, relative to a nest holding the same
 * garrison.
 *
 * A hive at twice the rate is deliberate: wasps fly at twice the speed, so at
 * an equal rate half as many would ever be in the air at once and a hive read
 * as the slowest thing on the board rather than the fastest. Two and two
 * together mean that in the time two ants cross a gap, four wasps do.
 *
 * A den at half the rate is the same idea from the other side: one beetle is
 * worth two workers, so half as many of them carries the same weight per
 * second, and the difference stays in *how* it arrives.
 */
const RATE = { nest: 1, den: 0.5, hive: 2 };

export const KINDS: Record<NodeKind, KindSpec> = {
  nest: {
    unit: 'worker', growth: 0.34, cap: 150, links: 3, radius: 30,
    outBase: NEST_BASE * RATE.nest, outPer: NEST_PER * RATE.nest,
  },
  den: {
    unit: 'beetle', growth: 0.16, cap: 120, links: 2, radius: 27,
    outBase: NEST_BASE * RATE.den, outPer: NEST_PER * RATE.den,
  },
  hive: {
    unit: 'wasp', growth: 0.13, cap: 100, links: 1, radius: 25,
    outBase: NEST_BASE * RATE.hive, outPer: NEST_PER * RATE.hive,
  },
};

export interface UnitSpec {
  /** Pixels per second along a trail. */
  speed: number;
  /** Multiplier when hitting an enemy node. */
  power: number;
  /**
   * Weight in a head-on clash and against a garrison. Two columns meet, each
   * side's strength is amount * toughness, the weaker column is wiped and the
   * stronger keeps the difference.
   *
   * One beetle is worth exactly two workers: it kills the first and walks on,
   * and the second takes it with them. Wasps weigh the same as workers -- what
   * they buy is reach, not force.
   */
  toughness: number;
  /** Ignores trails entirely: flies straight, cannot be cut. */
  flies: boolean;
}

/**
 * Beetles crawl at exactly the pace of the ants around them -- what makes a
 * beetle worth having is weight, not speed. Wasps fly at twice that.
 */
export const WALKING_SPEED = 40;

export const UNITS: Record<UnitType, UnitSpec> = {
  worker: { speed: WALKING_SPEED, power: 1, toughness: 1, flies: false },
  beetle: { speed: WALKING_SPEED, power: 2, toughness: 2, flies: false },
  wasp: { speed: WALKING_SPEED * 2, power: 1, toughness: 1, flies: true },
};

/**
 * A column on foot moves a little faster out of a strong node -- a third faster
 * at most, so it reads as momentum rather than as another rule to learn.
 * Measured against the node's own cap, so every kind can reach the whole bonus.
 *
 * Wasps are exempt. They already fly at twice walking pace, and stacking a
 * variable bonus on top made the one unit that is supposed to be simply fast
 * into the one whose speed you had to keep working out.
 */
export const SPEED_FROM_STRENGTH = 0.33;

/** Seconds of holding before the thinnest possible trail snaps. */
export const CHEW_BASE = 1.0;
/** Extra seconds per unit currently in transit on the trail. */
export const CHEW_PER_UNIT = 0.22;
/** Cap so a monstrous artery stays cuttable within one engagement. */
export const CHEW_MAX = 9.0;

/**
 * The flow model.
 *
 * A node's number is its garrison: its strength, and the wall an attacker has
 * to get through. **Sending never spends it.** What walks down a trail is what
 * the node produces, and the garrison only ever falls when an enemy column
 * actually arrives.
 *
 * Output rises with the garrison, which is what makes stacking a nest up worth
 * doing: a big nest is both a thick wall and a wide stream, without the stream
 * eating the wall.
 *
 * Ants leave **one at a time**. Not batches: a batch of a hundred takes a whole
 * node in a blink and makes the board unreadable, and single ants are also the
 * only way the unit rules can be watched happening -- one beetle meeting one
 * worker, killing it, walking on, and going down with the next.
 */
export const UNIT_SIZE = 1;

/**
 * A freshly taken node starts with at least this much, even if the column that
 * took it barely survived. Without a foothold the next straggler from either
 * side flips it straight back, and contested nodes flicker instead of being
 * fought over.
 */
export const CAPTURE_FOOTHOLD = 1.5;

/**
 * An arriving enemy takes down more than an arriving friend puts up.
 *
 * Without this the game cannot end. Sending costs a node nothing, so a defender
 * is refilled at exactly the rate an attacker empties them, and two evenly
 * matched fronts sit there for ever -- measured: five matches in twenty-four
 * never finished, and one ran twice as long as the rest put together.
 *
 * A small edge to the attacker means equal pressure still moves a front, which
 * is what lets a match end on its own with no clock to end it.
 */
export const ATTACK_EDGE = 1.35;

/**
 * What a node still produces when its supply chain is broken. Cutting used to
 * stop growth dead, and that produced boards where every node a player held sat
 * at zero forever: a cut node with a trail out kept exporting while producing
 * nothing, so it drained itself and stayed drained.
 *
 * A node always grows. Cutting makes it grow badly, which is punishment enough
 * and leaves the board readable.
 */
export const UNSUPPLIED_GROWTH = 0.35;

/** Un-held chewing bleeds off this many times faster than it accumulates, so a
 *  trail cannot be worn down in unattended nibbles. */
export const CHEW_DECAY = 2.5;

/**
 * How long the ground stays torn up where a trail was gnawed through.
 *
 * Without it the whole mechanic is pointless: you spend six seconds standing
 * still and exposed to break a supply line, and the owner redraws it in the
 * next instant. The scar is what turns those six seconds into something won.
 *
 * It also closes the obvious dodge -- letting go of a trail that is being
 * gnawed and immediately redrawing it counts as severed too.
 */
export const SEVERED_TICKS = TICK_HZ * 5;

/**
 * How long a player must wait between one set of jaws and the next.
 *
 * Gnawing is the answer to a stronger opponent, so it has to cost something
 * besides the seconds spent holding still. Without a wait, a player who is
 * behind can simply live on the enemy's supply lines, cutting one after
 * another for as long as they can find them.
 */
export const CHEW_COOLDOWN = TICK_HZ * 4;

export interface Point {
  x: number;
  y: number;
}

/**
 * Water. Ants and beetles cannot cross it, wasps fly over.
 *
 * It is not a wall: every river has fords, and those become the places worth
 * fighting for. A river straight across a map with no way over would only
 * split it into two games played side by side.
 */
export interface River {
  /** Centre line, as a polyline. */
  points: Point[];
  /** How wide the water is drawn; crossing is judged on the centre line. */
  width: number;
  /** Shallow places where a trail may cross after all. */
  fords: { x: number; y: number; radius: number }[];
}

export interface GameNode {
  id: number;
  x: number;
  y: number;
  kind: NodeKind;
  owner: number;
  count: number;
}

export interface Trail {
  id: number;
  /** Fractional production waiting to become a whole ant of the node's kind. */
  pending: number;
  owner: number;
  from: number;
  to: number;
  /** Precomputed so the tick never calls sqrt. */
  len: number;
  /** Wasp route: carries no supply and cannot be chewed. */
  air: boolean;
  /** Seconds of chewing already sunk into this trail. */
  chew: number;
}

export interface Packet {
  owner: number;
  unit: UnitType;
  amount: number;
  from: number;
  to: number;
  /** 0..1 along the straight line from -> to. */
  pos: number;
  air: boolean;
  /**
   * How many more full towers this unit may walk through before it gives up
   * and joins whatever garrison it is standing in. See TRANSIT_HOPS.
   */
  hops: number;
  /** Set when annihilated this tick; swept after collision resolution. */
  dead: boolean;
}

/**
 * A unit that reaches a tower with no room does not stop there -- it carries on
 * down one of that tower's own trails. This is how many towers it may cross
 * that way.
 *
 * It has to be finite. Without a limit a ring of full nodes passes the same ant
 * round for ever, and since every node keeps producing on top of that, the
 * board fills with units that will never change a number anywhere. Three is far
 * enough to cross your own territory to a front, and short enough that a loop
 * empties itself.
 */
export const TRANSIT_HOPS = 3;

export interface PlayerState {
  id: number;
  alive: boolean;
  /** Supply root. Everything downstream of it freezes when the chain breaks. */
  home: number;
  /** Trail being gnawed, or -1. While gnawing the player may do nothing else. */
  chewing: number;
  /** Tick from which this player may start gnawing again. */
  chewReadyAt: number;
}

/** A connection that was cut and cannot be redrawn yet. */
export interface Severed {
  owner: number;
  from: number;
  to: number;
  until: number;
}

export interface GameState {
  tick: number;
  /** Serializable PRNG cursor, so a snapshot restores the exact stream. */
  rng: number;
  nodes: GameNode[];
  trails: Trail[];
  packets: Packet[];
  players: PlayerState[];
  /** Recomputed every tick: node id -> supplied. */
  supplied: boolean[];
  /** Connections still healing from being gnawed through. */
  severed: Severed[];
  /** Water on this map. Fixed for the whole match. */
  rivers: River[];
  nextTrailId: number;
  over: boolean;
  winner: number;
}

export type Command =
  | { t: 'link'; p: number; from: number; to: number }
  | { t: 'unlink'; p: number; trail: number }
  | { t: 'chew'; p: number; trail: number };

/** Server -> client and client -> server wire messages. */
export type ClientMsg =
  | { t: 'hello'; name: string }
  | { t: 'create'; name: string; slots: number }
  /** Host only, in the lobby: put a bot on an empty seat, or clear it again. */
  | { t: 'bot'; slot: number; on: boolean }
  | { t: 'join'; code: string; name: string }
  | { t: 'ready' }
  | { t: 'cmd'; cmd: Command }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'room'; code: string; you: number; players: RoomPlayer[]; slots: number }
  | { t: 'start'; state: GameState; you: number; at: number }
  | { t: 'cmds'; tick: number; cmds: Command[] }
  | { t: 'sync'; state: GameState }
  | { t: 'over'; winner: number }
  | { t: 'error'; msg: string }
  | { t: 'pong' };

export interface RoomPlayer {
  slot: number;
  name: string;
  bot: boolean;
  connected: boolean;
}

/** Seats a room may have. Empty ones stay open for people until the host starts. */
export const MIN_SLOTS = 2;
export const MAX_SLOTS = 4;
