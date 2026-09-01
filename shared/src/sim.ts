import {
  CAPTURE_FOOTHOLD,
  CHEW_BASE,
  CHEW_DECAY,
  CHEW_MAX,
  CHEW_PER_UNIT,
  Command,
  DT,
  GameNode,
  GameState,
  KINDS,
  NEUTRAL,
  Packet,
  PULSE_INTERVAL,
  PlayerState,
  TICK_HZ,
  SPEED_FROM_STRENGTH,
  SPEED_FULL_AT,
  Trail,
  UNITS,
  UNSUPPLIED_GROWTH,
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
 * A node standing between two others blocks the ground between them. Ants walk;
 * they cannot step over a nest that is in the way, so a chain has to go through
 * it. This is also what gives a supply line somewhere worth cutting.
 *
 * Distance is deliberately not a rule -- any two nodes with a clear line may be
 * joined however far apart they are.
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
  // How many trails a node can feed is the limit that runs out. Distance is
  // not a limit at all.
  if (outgoing(s, fromId) >= KINDS[from.kind].links) return false;
  // Wasps fly over whatever is on the ground; ants have to go through it.
  if (from.kind !== 'hive' && blockedBy(s, fromId, toId)) return false;

  return true;
}

/** Trails currently fed by a node, whoever owns them. */
export function outgoing(s: GameState, nodeId: number): number {
  let n = 0;
  for (const t of s.trails) if (t.from === nodeId) n++;

  return n;
}

export function linksFree(s: GameState, nodeId: number): number {
  const node = s.nodes[nodeId];
  if (!node) return 0;

  return Math.max(0, KINDS[node.kind].links - outgoing(s, nodeId));
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
    };
    s.trails.push(trail);
    // Let this node pulse on the next tick rather than waiting out its cycle:
    // a trail that does nothing for a second reads as a trail that failed.
    from.pulseAt = s.tick - Math.round(PULSE_INTERVAL * TICK_HZ);

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
  pulse(s);
  move(s, events);
  clash(s, events);
  sweep(s);
  checkEnd(s, events);

  return events;
}

/**
 * What this node actually produces per second right now. Everything else -- how
 * fast it fills, how much a trail may carry out of it -- is derived from this,
 * so a node can never export more than it makes and drain itself to nothing.
 */
export function growthRate(s: GameState, n: GameNode): number {
  if (n.owner === NEUTRAL) return 0;

  return KINDS[n.kind].growth * (s.supplied[n.id] ? 1 : UNSUPPLIED_GROWTH);
}

function grow(s: GameState): void {
  for (const n of s.nodes) {
    const rate = growthRate(s, n);
    if (rate <= 0) continue;
    const cap = KINDS[n.kind].cap;
    if (n.count < cap) n.count = Math.min(cap, n.count + rate * DT);
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

/** Units per second this node sends down its trails, garrison untouched. */
export function outputRate(s: GameState, n: GameNode): number {
  if (n.owner === NEUTRAL) return 0;
  const spec = KINDS[n.kind];
  const base = spec.outBase + n.count * spec.outPer;

  return base * (s.supplied[n.id] ? 1 : UNSUPPLIED_GROWTH);
}

/**
 * Send a column down each trail. The garrison is never touched here: what
 * leaves is production, plus anything that arrived while the node was already
 * full and had nowhere to go but onward.
 */
function pulse(s: GameState): void {
  const period = Math.round(PULSE_INTERVAL * TICK_HZ);
  const byNode = new Map<number, Trail[]>();
  for (const t of s.trails) {
    let list = byNode.get(t.from);
    if (!list) byNode.set(t.from, (list = []));
    list.push(t);
  }

  for (const n of s.nodes) {
    const trails = byNode.get(n.id);
    if (!trails) {
      // Nothing to pass overflow into, so it is simply lost.
      n.carry = 0;
      continue;
    }
    if (s.tick - n.pulseAt < period) continue;
    n.pulseAt = s.tick;
    const total = outputRate(s, n) * PULSE_INTERVAL + n.carry;
    n.carry = 0;
    if (total <= 0.01) continue;
    const each = total / trails.length;
    for (const t of trails) {
      s.packets.push({
        owner: t.owner,
        unit: KINDS[n.kind].unit,
        amount: each,
        from: t.from,
        to: t.to,
        pos: 0,
        air: t.air,
        dead: false,
      });
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
    // Columns out of a strong node move a little quicker -- capped low, so it
    // reads as momentum and not as another rule to learn.
    const boost = 1 + SPEED_FROM_STRENGTH * Math.min(1, from.count / SPEED_FULL_AT);
    p.pos += (UNITS[p.unit].speed * boost * DT) / len;
    if (p.pos >= 1) {
      p.dead = true;
      arrive(s, p, events);
    }
  }
}

function arrive(s: GameState, p: Packet, events: SimEvent[]): void {
  const node = s.nodes[p.to];
  if (node.owner === p.owner) {
    const cap = KINDS[node.kind].cap;
    const room = Math.max(0, cap - node.count);
    const taken = Math.min(room, p.amount);
    node.count += taken;
    // A full node forwards the rest down its own trails instead of wasting it.
    // This is what makes a chain of nests worth building.
    node.carry += p.amount - taken;
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
  // Clamped to the cap like any other arrival. Without this a big column
  // landing on a thin garrison installed itself as a garrison far past the
  // ceiling, and stacks ran into the thousands.
  const survivors = (damage - node.count) / power;
  const cap = KINDS[node.kind].cap;
  node.count = Math.min(cap, Math.max(CAPTURE_FOOTHOLD, survivors));
  node.carry += Math.max(0, survivors - cap);
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

}
