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
  /** Units per second while supplied. */
  growth: number;
  /** Growth stops here. Deliveries may still stack above it. */
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
 * A nest must visibly count up: at 2.2 a second the number on it changes every
 * 0.45 s, which is what makes growth readable at a glance. The first numbers
 * grew at 1.1 and the game looked completely static.
 *
 * There is deliberately no separate drain figure. A running trail exports
 * exactly what the node produces, so holding a trail open never empties the
 * node that owns it: its number only falls when somebody attacks it, or when
 * its supply is cut and there is no production left to export.
 *
 * An earlier version pulled several times faster than a node grew, and every
 * node a player touched drained itself to zero. Watching your own nest bleed
 * out with no enemy in sight reads as a broken game, and it was.
 *
 * Rerun `node tools/balance.mjs` after changing any rule -- these numbers only
 * hold for the rules they were measured against. Dropping the reach and
 * obstacle rule and the shared trail budget changed them completely: matches
 * went from routinely running out the clock to finishing on their own in about
 * a hundred seconds, none reaching the limit.
 */
export const KINDS: Record<NodeKind, KindSpec> = {
  nest: { unit: 'worker', growth: 3.2, cap: 24, links: 3, radius: 30 },
  den: { unit: 'beetle', growth: 0.75, cap: 10, links: 2, radius: 27 },
  hive: { unit: 'wasp', growth: 0.6, cap: 7, links: 1, radius: 25 },
};

export interface UnitSpec {
  /** Pixels per second along a trail. */
  speed: number;
  /** Multiplier when hitting an enemy node. */
  power: number;
  /**
   * Weight in a head-on clash. Two columns meet, each side's strength is
   * amount * toughness, the weaker column is wiped and the stronger keeps the
   * difference. A beetle at 4 therefore walks through three workers -- that is
   * "breaks through" expressed as a number instead of a special case.
   */
  toughness: number;
  /** Ignores trails entirely: flies straight, cannot be cut. */
  flies: boolean;
}

export const UNITS: Record<UnitType, UnitSpec> = {
  worker: { speed: 95, power: 1, toughness: 1, flies: false },
  beetle: { speed: 48, power: 2.2, toughness: 4, flies: false },
  wasp: { speed: 145, power: 1.5, toughness: 1, flies: true },
};

/** Seconds of holding before the thinnest possible trail snaps. */
export const CHEW_BASE = 1.0;
/** Extra seconds per unit currently in transit on the trail. */
export const CHEW_PER_UNIT = 0.22;
/** Cap so a monstrous artery stays cuttable within one engagement. */
export const CHEW_MAX = 9.0;

/**
 * A trail emits one column per this many seconds. Longer than it looks like it
 * should be, on purpose: at a quarter second the columns were half an ant each,
 * and a node sitting at zero changed hands several times a second. Fewer,
 * heavier columns are both calmer to watch and far less twitchy to own.
 */
export const PACKET_INTERVAL = 0.55;

/**
 * A freshly taken node starts with at least this much, even if the column that
 * took it barely survived. Without a foothold the next straggler from either
 * side flips it straight back, and contested nodes flicker instead of being
 * fought over.
 */
export const CAPTURE_FOOTHOLD = 1.5;

/**
 * Matches are timed, and that is a rule rather than a safety net. Cutting
 * supply is deliberately an answer to a stronger opponent, so this game does
 * not snowball into a wipe the way the genre usually does -- somebody can
 * almost always hold a corner. Whoever holds more of the board when the clock
 * runs out has won it: most nodes, then most ants.
 */
export const MATCH_LIMIT_TICKS = TICK_HZ * 180;

/**
 * A running trail carries this share of what its node produces. Deliberately
 * below 1: at exactly 1 an attacking trickle matched the defender's regrowth
 * exactly, so contested nodes sat pinned at zero and changed hands on every
 * single column -- two hundred captures a match, and no progress for anyone.
 *
 * Below 1 a node holding trails open still creeps upward, so nothing drains
 * itself, and taking a defended node needs more than one trail pointed at it.
 */
export const EXPORT_RATIO = 0.7;

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

/**
 * Opening a trail sends this share of the garrison at once. This surge is the
 * attack: the steady trickle afterwards is only the node's production, so
 * taking anything defended means committing a stack, not waiting.
 */
export const LINK_SURGE = 0.6;

/**
 * A node will not surge again this soon, or a player could tap a trail off and
 * on to pour out the whole garrison in a second.
 */
export const SURGE_COOLDOWN = TICK_HZ * 5;

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
  /** Tick of the last outgoing surge, so surges cannot be spammed. */
  surgeAt: number;
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
  /** Fractional carry so slow drains still emit whole packets. */
  pending: number;
  emit: number;
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
