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
 * extra per ant standing in it. A nest at 150 pushes about 7.5 a second, one at
 * 20 about 1.7 -- so stacking a nest up is what makes it dangerous, while the
 * stack itself stays put as the wall an attacker has to break.
 *
 * Output has to be this high for a reason: there is no clock, so a match must
 * end on its own. A garrison is refilled by reinforcement exactly as fast as an
 * attacker empties it, so the only thing that can decide a front is bringing
 * more streams to bear than the defender can answer. Weaker output was measured
 * leaving three to eight matches in thirty running forever.
 *
 * Rerun `node tools/balance.mjs` after changing any rule -- these numbers only
 * hold for the rules they were measured against.
 */
export const KINDS: Record<NodeKind, KindSpec> = {
  nest: { unit: 'worker', growth: 0.34, cap: 150, outBase: 2.0, outPer: 0.9, links: 3, radius: 30 },
  den: { unit: 'beetle', growth: 0.16, cap: 120, outBase: 0.56, outPer: 0.225, links: 2, radius: 27 },
  hive: { unit: 'wasp', growth: 0.13, cap: 100, outBase: 0.5, outPer: 0.162, links: 1, radius: 25 },
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

export const UNITS: Record<UnitType, UnitSpec> = {
  worker: { speed: 52, power: 1, toughness: 1, flies: false },
  beetle: { speed: 30, power: 2, toughness: 2, flies: false },
  wasp: { speed: 78, power: 1, toughness: 1, flies: true },
};

/**
 * A column moves a little faster out of a strong node -- a third faster at
 * most, so it reads as momentum rather than as another rule to learn.
 */
export const SPEED_FROM_STRENGTH = 0.33;
export const SPEED_FULL_AT = 120;

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
 * Output is not fixed, though -- it grows with the garrison. That is what makes
 * stacking a nest up worth doing: a big nest is both a thick wall and a wide
 * stream, without the stream eating the wall.
 *
 * Columns leave in pulses rather than as a steady dribble, so an attack is
 * something you can watch land and a defender can see their number drop.
 */
export const PULSE_INTERVAL = 1.2;

/**
 * A freshly taken node starts with at least this much, even if the column that
 * took it barely survived. Without a foothold the next straggler from either
 * side flips it straight back, and contested nodes flicker instead of being
 * fought over.
 */
export const CAPTURE_FOOTHOLD = 1.5;

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

export interface GameNode {
  id: number;
  x: number;
  y: number;
  kind: NodeKind;
  owner: number;
  count: number;
  /** Tick of this node's last outgoing pulse. */
  pulseAt: number;
  /**
   * Arrivals that would have pushed the garrison past its cap. A full node
   * passes them straight on down its own trails instead of wasting them, which
   * is what makes a chain of nests worth building.
   */
  carry: number;
}

export interface Trail {
  id: number;
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
  /** Set when annihilated this tick; swept after collision resolution. */
  dead: boolean;
}

export interface PlayerState {
  id: number;
  alive: boolean;
  /** Supply root. Everything downstream of it freezes when the chain breaks. */
  home: number;
  /** Trail being gnawed, or -1. While gnawing the player may do nothing else. */
  chewing: number;
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
