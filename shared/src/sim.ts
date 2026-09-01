import {
  CHEW_BASE,
  CHEW_DECAY,
  CHEW_MAX,
  CHEW_PER_UNIT,
  Command,
  DT,
  GameNode,
  GameState,
  KINDS,
  LINK_RANGE,
  MAX_TRAILS_PER_PLAYER,
  NEUTRAL,
  Packet,
  PACKET_INTERVAL,
  PlayerState,
  Trail,
  UNITS,
} from './types.js';
import { generateMap } from './maps.js';

export type SimEvent =
  | { t: 'capture'; node: number; by: number; lost: number }
  | { t: 'snap'; trail: number; by: number; x: number; y: number }
  | { t: 'clash'; x: number; y: number }
  | { t: 'eliminated'; p: number }
  | { t: 'over'; winner: number };

export function createGame(seed: number, playerCount: number): GameState {
  const { nodes, homes } = generateMap(seed, playerCount);
  const players: PlayerState[] = [];
  for (let i = 0; i < playerCount; i++) {
    players.push({ id: i, alive: true, home: homes[i], chewing: -1 });
  }

  return {
    tick: 0,
    rng: seed >>> 0,
    nodes,
    trails: [],
    packets: [],
    players,
    supplied: nodes.map(() => false),
    nextTrailId: 1,
    over: false,
    winner: NEUTRAL,
  };
}

export function cloneState(s: GameState): GameState {
  return {
    tick: s.tick,
    rng: s.rng,
    nodes: s.nodes.map((n) => ({ ...n })),
    trails: s.trails.map((t) => ({ ...t })),
    packets: s.packets.map((p) => ({ ...p })),
    players: s.players.map((p) => ({ ...p })),
    supplied: s.supplied.slice(),
    nextTrailId: s.nextTrailId,
    over: s.over,
    winner: s.winner,
  };
}

export function nodeById(s: GameState, id: number): GameNode | undefined {
  return s.nodes[id];
}

export function trailById(s: GameState, id: number): Trail | undefined {
  return s.trails.find((t) => t.id === id);
}

/** Units currently walking on a trail -- this is what "thickness" means. */
export function trailLoad(s: GameState, t: Trail): number {
  let load = 0;
  for (const p of s.packets) {
    if (!p.dead && p.from === t.from && p.to === t.to && p.owner === t.owner) load += p.amount;
  }
  return load;
}

export function chewCost(s: GameState, t: Trail): number {
  return Math.min(CHEW_MAX, CHEW_BASE + trailLoad(s, t) * CHEW_PER_UNIT);
}

export function distance(a: GameNode, b: GameNode): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function canLink(s: GameState, p: number, fromId: number, toId: number): boolean {
  if (s.over) return false;
  const player = s.players[p];
  if (!player || !player.alive) return false;
  // Gnawing takes both hands. This is the entire price of cutting a trail.
  if (player.chewing !== -1) return false;
  const from = s.nodes[fromId];
  const to = s.nodes[toId];
  if (!from || !to || from.id === to.id) return false;
  if (from.owner !== p) return false;
  if (s.trails.some((t) => t.owner === p && t.from === fromId && t.to === toId)) return false;
  if (s.trails.filter((t) => t.owner === p).length >= MAX_TRAILS_PER_PLAYER) return false;
  const air = from.kind === 'hive';
  if (!air && distance(from, to) > LINK_RANGE) return false;

  return true;
}

export function applyCommand(s: GameState, cmd: Command): boolean {
  const player = s.players[cmd.p];
  if (!player || !player.alive || s.over) return false;

  if (cmd.t === 'link') {
    if (!canLink(s, cmd.p, cmd.from, cmd.to)) return false;
    const from = s.nodes[cmd.from];
    const to = s.nodes[cmd.to];
    s.trails.push({
      id: s.nextTrailId++,
      owner: cmd.p,
      from: cmd.from,
      to: cmd.to,
      len: distance(from, to),
      air: from.kind === 'hive',
      chew: 0,
      pending: 0,
      emit: 0,
    });

    return true;
  }

  if (cmd.t === 'unlink') {
    if (player.chewing !== -1) return false;
    const i = s.trails.findIndex((t) => t.id === cmd.trail && t.owner === cmd.p);
    if (i < 0) return false;
    s.trails.splice(i, 1);

    return true;
  }

  if (cmd.t === 'chew') {
    if (cmd.trail === -1) {
      player.chewing = -1;

      return true;
    }
    const t = trailById(s, cmd.trail);
    // Air routes are immune: the counter to wasps is taking the hive itself.
    if (!t || t.owner === cmd.p || t.air) return false;
    player.chewing = t.id;

    return true;
  }

  return false;
}

/**
 * A node only grows while a chain of its owner's ground trails still reaches it
 * from that player's home. Air routes deliberately carry no supply -- wasps fly,
 * they do not build roads -- which is what keeps cutting worth doing.
 */
function recomputeSupply(s: GameState): void {
  s.supplied.length = s.nodes.length;
  s.supplied.fill(false);

  const out = new Map<number, Trail[]>();
  for (const t of s.trails) {
    if (t.air) continue;
    let list = out.get(t.from);
    if (!list) out.set(t.from, (list = []));
    list.push(t);
  }

  for (const player of s.players) {
    if (!player.alive) continue;
    const home = s.nodes[player.home];
    if (!home || home.owner !== player.id) continue;
    const queue = [home.id];
    s.supplied[home.id] = true;
    while (queue.length) {
      const id = queue.pop()!;
      for (const t of out.get(id) ?? []) {
        if (t.owner !== player.id) continue;
        const next = s.nodes[t.to];
        if (!next || next.owner !== player.id || s.supplied[next.id]) continue;
        s.supplied[next.id] = true;
        queue.push(next.id);
      }
    }
  }
}

function dropTrail(s: GameState, index: number): void {
  const t = s.trails[index];
  s.trails.splice(index, 1);
  for (const p of s.players) {
    if (p.chewing === t.id) p.chewing = -1;
  }
}

export function step(s: GameState): SimEvent[] {
  const events: SimEvent[] = [];
  if (s.over) return events;
  s.tick++;

  // Trails whose source stopped belonging to their owner are meaningless.
  for (let i = s.trails.length - 1; i >= 0; i--) {
    const from = s.nodes[s.trails[i].from];
    if (!from || from.owner !== s.trails[i].owner) dropTrail(s, i);
  }

  recomputeSupply(s);
  grow(s);
  chew(s, events);
  drain(s);
  move(s, events);
  clash(s, events);
  sweep(s);
  checkEnd(s, events);

  return events;
}

function grow(s: GameState): void {
  for (const n of s.nodes) {
    if (n.owner === NEUTRAL) continue;
    if (!s.supplied[n.id]) continue;
    const spec = KINDS[n.kind];
    if (n.count < spec.cap) n.count = Math.min(spec.cap, n.count + spec.growth * DT);
  }
}

function chew(s: GameState, events: SimEvent[]): void {
  const held = new Set<number>();
  for (const p of s.players) {
    if (!p.alive || p.chewing === -1) continue;
    held.add(p.chewing);
  }

  for (let i = s.trails.length - 1; i >= 0; i--) {
    const t = s.trails[i];
    if (!held.has(t.id)) {
      // Progress bleeds off, so a trail cannot be worn down in nibbles.
      if (t.chew > 0) t.chew = Math.max(0, t.chew - DT * CHEW_DECAY);
      continue;
    }
    t.chew += DT;
    if (t.chew < chewCost(s, t)) continue;

    const a = s.nodes[t.from];
    const b = s.nodes[t.to];
    const by = s.players.find((p) => p.chewing === t.id);
    events.push({
      t: 'snap',
      trail: t.id,
      by: by ? by.id : NEUTRAL,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    });
    dropTrail(s, i);
  }
}

function drain(s: GameState): void {
  // A node's total output is fixed, so extra trails split it rather than
  // multiply it. Otherwise spamming links would be free production.
  const outCount = new Map<number, number>();
  for (const t of s.trails) outCount.set(t.from, (outCount.get(t.from) ?? 0) + 1);

  for (const t of s.trails) {
    const from = s.nodes[t.from];
    const spec = KINDS[from.kind];
    const share = spec.drain / (outCount.get(t.from) ?? 1);
    const amount = Math.min(from.count, share * DT);
    if (amount > 0) {
      from.count -= amount;
      t.pending += amount;
    }
    t.emit += DT;
    if (t.emit >= PACKET_INTERVAL) {
      t.emit -= PACKET_INTERVAL;
      if (t.pending > 0.01) {
        s.packets.push({
          owner: t.owner,
          unit: spec.unit,
          amount: t.pending,
          from: t.from,
          to: t.to,
          pos: 0,
          air: t.air,
          dead: false,
        });
        t.pending = 0;
      }
    }
  }
}

function move(s: GameState, events: SimEvent[]): void {
  for (const p of s.packets) {
    if (p.dead) continue;
    const from = s.nodes[p.from];
    const to = s.nodes[p.to];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    p.pos += (UNITS[p.unit].speed * DT) / len;
    if (p.pos >= 1) {
      p.dead = true;
      arrive(s, p, events);
    }
  }
}

function arrive(s: GameState, p: Packet, events: SimEvent[]): void {
  const node = s.nodes[p.to];
  if (node.owner === p.owner) {
    // Deliveries may stack above the cap; only growth stops there.
    node.count += p.amount;

    return;
  }

  const power = UNITS[p.unit].power;
  const damage = p.amount * power;
  if (damage <= node.count) {
    node.count -= damage;

    return;
  }

  const lost = node.owner;
  node.owner = p.owner;
  node.count = (damage - node.count) / power;
  events.push({ t: 'capture', node: node.id, by: p.owner, lost });
  onCapture(s, node, lost, events);
}

function onCapture(s: GameState, node: GameNode, lost: number, events: SimEvent[]): void {
  // Trails leaving a node you no longer own die with the node.
  for (let i = s.trails.length - 1; i >= 0; i--) {
    if (s.trails[i].from === node.id && s.trails[i].owner !== node.owner) dropTrail(s, i);
  }
  if (lost === NEUTRAL) return;

  const player = s.players[lost];
  if (!player || !player.alive) return;
  if (player.home !== node.id) return;

  // Losing the home does not end you: supply retreats to your biggest nest.
  // A casual 4-player match should not park someone out in the first minute.
  let best: GameNode | undefined;
  for (const n of s.nodes) {
    if (n.owner !== lost) continue;
    if (!best || n.count > best.count) best = n;
  }
  if (best) {
    player.home = best.id;

    return;
  }
  player.alive = false;
  player.chewing = -1;
  for (let i = s.trails.length - 1; i >= 0; i--) {
    if (s.trails[i].owner === lost) dropTrail(s, i);
  }
  events.push({ t: 'eliminated', p: lost });
}

/**
 * Two columns walking the same line in opposite directions meet head-on. The
 * pair is keyed by the unordered node pair, so it does not matter who dug which
 * trail -- the ground between two nodes is one corridor.
 */
function clash(s: GameState, events: SimEvent[]): void {
  const lanes = new Map<number, Packet[]>();
  for (const p of s.packets) {
    if (p.dead || p.air) continue;
    const lo = Math.min(p.from, p.to);
    const hi = Math.max(p.from, p.to);
    const key = lo * 100000 + hi;
    let list = lanes.get(key);
    if (!list) lanes.set(key, (list = []));
    list.push(p);
  }

  for (const list of lanes.values()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead || a.dead) continue;
        if (a.owner === b.owner) continue;
        if (a.from === b.from) continue; // same direction, no head-on
        // Both are measured from their own origin, so they have met once the
        // two fractions cover the whole corridor.
        if (a.pos + b.pos < 1) continue;

        const sa = a.amount * UNITS[a.unit].toughness;
        const sb = b.amount * UNITS[b.unit].toughness;
        const from = s.nodes[a.from];
        const to = s.nodes[a.to];
        events.push({
          t: 'clash',
          x: from.x + (to.x - from.x) * a.pos,
          y: from.y + (to.y - from.y) * a.pos,
        });
        if (sa > sb) {
          a.amount = (sa - sb) / UNITS[a.unit].toughness;
          b.dead = true;
        } else if (sb > sa) {
          b.amount = (sb - sa) / UNITS[b.unit].toughness;
          a.dead = true;
        } else {
          a.dead = true;
          b.dead = true;
        }
      }
    }
  }
}

function sweep(s: GameState): void {
  if (s.packets.some((p) => p.dead)) s.packets = s.packets.filter((p) => !p.dead);
}

function checkEnd(s: GameState, events: SimEvent[]): void {
  for (const player of s.players) {
    if (!player.alive) continue;
    const owns = s.nodes.some((n) => n.owner === player.id);
    const inFlight = s.packets.some((p) => !p.dead && p.owner === player.id);
    if (owns || inFlight) continue;
    player.alive = false;
    player.chewing = -1;
    events.push({ t: 'eliminated', p: player.id });
  }

  const alive = s.players.filter((p) => p.alive);
  if (alive.length <= 1 && s.players.length > 1) {
    s.over = true;
    s.winner = alive.length === 1 ? alive[0].id : NEUTRAL;
    events.push({ t: 'over', winner: s.winner });
  }
}
