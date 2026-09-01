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
  /** Units per second each outgoing trail pulls out of the node. */
  drain: number;
  radius: number;
}

export const KINDS: Record<NodeKind, KindSpec> = {
  nest: { unit: 'worker', growth: 1.1, cap: 40, drain: 7, radius: 26 },
  den: { unit: 'beetle', growth: 0.3, cap: 12, drain: 1.6, radius: 24 },
  hive: { unit: 'wasp', growth: 0.22, cap: 8, drain: 1.1, radius: 22 },
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

/** A trail emits one packet per this many seconds; packets are ant columns. */
export const PACKET_INTERVAL = 0.25;

/** Trails a single player may hold at once. Keeps the board readable. */
export const MAX_TRAILS_PER_PLAYER = 8;

/**
 * Ground trails are paths dug across the map, so they have a reach. Air routes
 * ignore this -- being able to strike anywhere is the whole point of a hive.
 */
export const LINK_RANGE = 480;

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
  | { t: 'create'; name: string; slots: number; bots: number }
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
