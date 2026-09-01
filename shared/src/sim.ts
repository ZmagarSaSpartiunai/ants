import {
  CAPTURE_FOOTHOLD,
  CHEW_BASE,
  CHEW_DECAY,
  CHEW_MAX,
  CHEW_PER_UNIT,
  Command,
  DT,
  EXPORT_RATIO,
  GameNode,
  GameState,
  KINDS,
  LINK_RANGE,
  LINK_SURGE,
  MATCH_LIMIT_TICKS,
  MAX_TRAILS_PER_PLAYER,
  NEUTRAL,
  Packet,
  PACKET_INTERVAL,
  PlayerState,
  SURGE_COOLDOWN,
  Trail,
  UNITS,
} from './types.js';
import { generateMap } from './maps.js';

/** How close two opposing columns have to get before they are fighting. */
const CLASH_RADIUS = 17;

export type SimEvent =
  | { t: 'capture'; node: number; by: number; lost: number }
  /** A column landed: how many arrived, and whether they arrived as enemies. */
  | { t: 'delta'; node: number; amount: number; hostile: boolean; by: number }
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

/** Distance from a point to a segment: used to test what a trail runs over. */
function pointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + dx * t;
  const qy = ay + dy * t;

  return Math.sqrt((px - qx) * (px - qx) + (py - qy) * (py - qy));
}

/**
 * A node standing between two others blocks the ground between them. Without
 * this a trail was drawn straight over anything in the way, as if the node
 * were not there -- and the whole point of a map is that its layout decides
 * what you can reach. Now a chain has to actually go through the node, which
 * is also what gives cutting a chain something to cut.
 */
export function blockedBy(s: GameState, fromId: number, toId: number): GameNode | undefined {
  const a = s.nodes[fromId];
  const b = s.nodes[toId];
  for (const n of s.nodes) {
    if (n.id === fromId || n.id === toId) continue;
    if (pointToSegment(n.x, n.y, a.x, a.y, b.x, b.y) < KINDS[n.kind].radius + 8) return n;
  }

  return undefined;
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
  if (air) return true;
  if (distance(from, to) > LINK_RANGE) return false;
  // Wasps fly over anything; ants have to walk around, or rather through.
  if (blockedBy(s, fromId, toId)) return false;

  return true;
}

export function applyCommand(s: GameState, cmd: Command): boolean {
  const player = s.players[cmd.p];
  if (!player || !player.alive || s.over) return false;

  if (cmd.t === 'link') {
    if (!canLink(s, cmd.p, cmd.from, cmd.to)) return false;
    const from = s.nodes[cmd.from];
    const to = s.nodes[cmd.to];
    const trail: Trail = {
      id: s.nextTrailId++,
      owner: cmd.p,
      from: cmd.from,
      to: cmd.to,
      len: distance(from, to),
      air: from.kind === 'hive',
      chew: 0,
      pending: 0,
      emit: 0,
    };
    // The surge is the attack. Afterwards the trail only carries production,
    // so committing a stack is a decision, not something that happens to you.
    if (s.tick - from.surgeAt >= SURGE_COOLDOWN) {
      const surge = from.count * LINK_SURGE;
      if (surge > 0.01) {
        from.count -= surge;
        trail.pending += surge;
        from.surgeAt = s.tick;
      }
    }
    s.trails.push(trail);

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
  // A node exports a little less than it produces, split across its trails, so
  // it still creeps upward while feeding them. The only things that lower a
  // number are an enemy column and a cut supply line.
  const outCount = new Map<number, number>();
  for (const t of s.trails) outCount.set(t.from, (outCount.get(t.from) ?? 0) + 1);

  for (const t of s.trails) {
    const from = s.nodes[t.from];
    const spec = KINDS[from.kind];
    const share = (spec.growth * EXPORT_RATIO) / (outCount.get(t.from) ?? 1);
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
    events.push({ t: 'delta', node: node.id, amount: p.amount, hostile: false, by: p.owner });

    return;
  }

  const power = UNITS[p.unit].power;
  const damage = p.amount * power;
  events.push({ t: 'delta', node: node.id, amount: -damage, hostile: true, by: p.owner });
  if (damage <= node.count) {
    node.count -= damage;

    return;
  }

  const lost = node.owner;
  node.owner = p.owner;
  node.count = Math.max(CAPTURE_FOOTHOLD, (damage - node.count) / power);
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
 * Columns of different owners fight wherever they actually meet on the ground.
 *
 * This used to key off the pair of nodes a trail ran between, which meant two
 * streams only fought when they walked the exact same corridor in opposite
 * directions. Everywhere else -- crossing lanes, converging attacks on one
 * node -- the ants walked straight through each other, which is the opposite
 * of what anyone watching expects. Meeting is a fact about position.
 *
 * Air columns are exempt: wasps fly over everything, and being unstoppable in
 * the open is what a hive buys.
 */
function clash(s: GameState, events: SimEvent[]): void {
  const cell = CLASH_RADIUS * 2;
  // A uniform grid keeps this near-linear; packets number in the hundreds.
  const grid = new Map<number, number[]>();
  const px: number[] = [];
  const py: number[] = [];

  for (let i = 0; i < s.packets.length; i++) {
    const p = s.packets[i];
    if (p.dead || p.air) continue;
    const from = s.nodes[p.from];
    const to = s.nodes[p.to];
    px[i] = from.x + (to.x - from.x) * p.pos;
    py[i] = from.y + (to.y - from.y) * p.pos;

    const cx = Math.floor(px[i] / cell);
    const cy = Math.floor(py[i] / cell);
    // Compare only against packets already placed, and walk neighbouring cells
    // in a fixed order, so the outcome never depends on iteration accidents.
    for (let dx = -1; dx <= 1 && !p.dead; dx++) {
      for (let dy = -1; dy <= 1 && !p.dead; dy++) {
        const bucket = grid.get((cx + dx) * 100000 + (cy + dy));
        if (!bucket) continue;
        for (const j of bucket) {
          const q = s.packets[j];
          if (q.dead || q.owner === p.owner) continue;
          const ddx = px[i] - px[j];
          const ddy = py[i] - py[j];
          if (ddx * ddx + ddy * ddy > CLASH_RADIUS * CLASH_RADIUS) continue;

          const sp = p.amount * UNITS[p.unit].toughness;
          const sq = q.amount * UNITS[q.unit].toughness;
          events.push({ t: 'clash', x: (px[i] + px[j]) / 2, y: (py[i] + py[j]) / 2 });
          if (sp > sq) {
            p.amount = (sp - sq) / UNITS[p.unit].toughness;
            q.dead = true;
          } else if (sq > sp) {
            q.amount = (sq - sp) / UNITS[q.unit].toughness;
            p.dead = true;
          } else {
            p.dead = true;
            q.dead = true;
          }
          if (p.dead) break;
        }
      }
    }
    if (p.dead) continue;
    const key = cx * 100000 + cy;
    let bucket = grid.get(key);
    if (!bucket) grid.set(key, (bucket = []));
    bucket.push(i);
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

    return;
  }

  if (s.tick >= MATCH_LIMIT_TICKS) {
    s.over = true;
    s.winner = leader(s, alive);
    events.push({ t: 'over', winner: s.winner });
  }
}

/** Who is ahead on the board: nodes first, ants only to break a tie. */
function leader(s: GameState, alive: PlayerState[]): number {
  let best = NEUTRAL;
  let bestNodes = -1;
  let bestForce = -1;
  for (const p of alive) {
    let nodes = 0;
    let force = 0;
    for (const n of s.nodes) {
      if (n.owner !== p.id) continue;
      nodes++;
      force += n.count;
    }
    if (nodes > bestNodes || (nodes === bestNodes && force > bestForce)) {
      // An exact tie leaves the previous leader in place, which is why the
      // comparison is strict: a drawn match reports NEUTRAL.
      if (nodes === bestNodes && force === bestForce) {
        best = NEUTRAL;
        continue;
      }
      best = p.id;
      bestNodes = nodes;
      bestForce = force;
    }
  }

  return best;
}
