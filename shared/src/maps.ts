import {
  FIELD_H,
  FIELD_W,
  GameNode,
  KINDS,
  NEUTRAL,
  NodeKind,
  Point,
  River,
} from './types.js';
import { Rng } from './rng.js';

export interface MapLayout {
  nodes: GameNode[];
  /** Home node id per player slot. */
  homes: number[];
  rivers: River[];
}

/**
 * Maps are rotationally symmetric: every player's opening is the same board
 * turned by 360/N degrees, so nobody starts with a better neighbourhood.
 *
 * Trigonometry is fine here because generation runs once, on the server, and
 * the resulting node list is shipped to clients as data -- it is never
 * recomputed per tick and never has to match across engines.
 */
export function generateMap(seed: number, players: number): MapLayout {
  const rng = new Rng(seed >>> 0);
  const cx = FIELD_W / 2;
  const cy = FIELD_H / 2;
  const nodes: GameNode[] = [];
  const homes: number[] = [];

  const add = (x: number, y: number, kind: NodeKind, owner: number, count: number): number => {
    const id = nodes.length;
    nodes.push({ id, x: Math.round(x), y: Math.round(y), kind, owner, count, relay: 0 });
    return id;
  };

  // One "wedge" is designed, then rotated per player. Radii are fractions of
  // each half-axis separately: using the smaller one for both packed every map
  // into a small disc in the middle and left a third of the screen empty.
  const radX = cx - 105;
  const radY = cy - 95;
  const step = (Math.PI * 2) / players;
  // A duel reads best across the long axis, so its spin barely wanders.
  const spin = players === 2 ? rng.range(-0.25, 0.25) : rng.range(0, Math.PI * 2);

  interface Slot { r: number; a: number; kind: NodeKind; garrison: number }

  // One of several shapes, so two matches in a row do not read as the same
  // board with the pieces moved. Whichever is picked, it is designed once as a
  // wedge and then turned for each player, so nobody starts with a better
  // neighbourhood.
  const wedge: Slot[] = [layoutFan, layoutSpoke, layoutRings, layoutCluster][rng.int(4)](rng, step);

  // Specials are what make two maps of the same shape play differently.
  const denCount = 1 + rng.int(2);
  for (let i = 0; i < denCount; i++) {
    wedge.push({
      r: rng.range(0.46, 0.8),
      a: step * (rng.next() < 0.5 ? rng.range(0.28, 0.46) : -rng.range(0.28, 0.46)),
      kind: 'den',
      garrison: Math.round(rng.range(16, 26)),
    });
  }
  if (rng.next() < 0.75) {
    wedge.push({
      r: rng.range(0.2, 0.5),
      a: step * rng.range(-0.4, 0.4),
      kind: 'hive',
      garrison: Math.round(rng.range(14, 24)),
    });
  }

  for (let p = 0; p < players; p++) {
    const base = spin + step * p;
    for (const s of wedge) {
      const ang = base + s.a;
      const isHome = s.r === 0.92;
      const id = add(
        cx + Math.cos(ang) * radX * s.r,
        cy + Math.sin(ang) * radY * s.r,
        s.kind,
        isHome ? p : NEUTRAL,
        isHome ? 30 : s.garrison,
      );
      if (isHome) homes[p] = id;
    }
  }

  // The centre is the prize: a fat neutral nest everyone can see.
  add(cx, cy, players === 2 ? 'hive' : 'nest', NEUTRAL, players === 2 ? 26 : 55);

  spread(nodes);
  const rivers = carveRiver(rng, players, nodes);

  return { nodes, homes, rivers };
}

/**
 * Water, laid down so that it is the same shape for everybody.
 *
 * For a duel that means a river down the middle between the two sides. For
 * three or four it means a ring around the centre, which is rotationally
 * symmetric by construction and puts the fat middle prize behind water.
 *
 * Fords are what make it a feature rather than a wall: they are the only way
 * across on foot, so they become the chokepoints the whole game is about.
 */
function carveRiver(rng: Rng, players: number, nodes: GameNode[]): River[] {
  // Roughly every other map. A river every time would stop being a feature of
  // the map and start being a feature of the game.
  if (rng.next() < 0.5) return [];
  const cx = FIELD_W / 2;
  const cy = FIELD_H / 2;
  const width = rng.range(26, 38);

  const river: River =
    players === 2
      ? straightRiver(rng, cx, cy, width)
      : ringRiver(rng, players, cx, cy, width);

  // Nothing may sit in the water: a node in a river is unreachable on foot
  // from either bank and reads as a bug.
  for (const n of nodes) {
    const clear = KINDS[n.kind].radius + width + 14;
    for (let guard = 0; guard < 30; guard++) {
      const near = nearestOnRiver(river, n.x, n.y);
      const dx = n.x - near.x;
      const dy = n.y - near.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= clear) break;
      const push = (clear - d) + 1;
      const ux = d < 0.001 ? 1 : dx / d;
      const uy = d < 0.001 ? 0 : dy / d;
      n.x = Math.round(Math.min(FIELD_W - 40, Math.max(40, n.x + ux * push)));
      n.y = Math.round(Math.min(FIELD_H - 40, Math.max(40, n.y + uy * push)));
    }
  }

  return [river];
}

function straightRiver(rng: Rng, cx: number, cy: number, width: number): River {
  // A wandering line down the middle, so it does not read as a drawn divider.
  const points: Point[] = [];
  const lean = rng.range(-70, 70);
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    points.push({
      x: Math.round(cx + lean * (t - 0.5) * 2 + Math.sin(t * 5.5 + rng.state * 0.001) * 38),
      y: Math.round(-40 + t * (FIELD_H + 80)),
    });
  }
  const fords = [];
  const count = rng.next() < 0.5 ? 1 : 2;
  for (let i = 0; i < count; i++) {
    const at = count === 1 ? rng.range(0.3, 0.7) : 0.25 + i * 0.5;
    const p = alongRiver(points, at);
    fords.push({ x: Math.round(p.x), y: Math.round(p.y), radius: Math.round(rng.range(58, 78)) });
  }

  return { points, width, fords };
}

function ringRiver(rng: Rng, players: number, cx: number, cy: number, width: number): River {
  const rx = Math.round(FIELD_W * rng.range(0.2, 0.26));
  const ry = Math.round(FIELD_H * rng.range(0.24, 0.31));
  const points: Point[] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const a = (Math.PI * 2 * i) / steps;
    points.push({ x: Math.round(cx + Math.cos(a) * rx), y: Math.round(cy + Math.sin(a) * ry) });
  }
  // One ford per player, so every wedge has its own way in to the middle.
  const fords = [];
  const spin = rng.range(0, Math.PI * 2);
  for (let i = 0; i < players; i++) {
    const a = spin + (Math.PI * 2 * i) / players;
    fords.push({
      x: Math.round(cx + Math.cos(a) * rx),
      y: Math.round(cy + Math.sin(a) * ry),
      radius: Math.round(rng.range(60, 80)),
    });
  }

  return { points, width, fords };
}

/** A point a given fraction of the way along a polyline. */
function alongRiver(points: Point[], t: number): Point {
  const span = (points.length - 1) * Math.max(0, Math.min(0.999, t));
  const i = Math.floor(span);
  const f = span - i;
  const a = points[i];
  const b = points[i + 1] ?? a;

  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

function nearestOnRiver(river: River, x: number, y: number): Point {
  let best = river.points[0];
  let bestD = Infinity;
  for (let i = 0; i + 1 < river.points.length; i++) {
    const p = nearestOnSegment(x, y, river.points[i], river.points[i + 1]);
    const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }

  return best;
}

function nearestOnSegment(px: number, py: number, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return a;
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));

  return { x: a.x + dx * t, y: a.y + dy * t };
}

/** The original shape: a home on the rim, two flanks, one contested nest. */
function layoutFan(rng: Rng, step: number): { r: number; a: number; kind: NodeKind; garrison: number }[] {
  return [
    { r: 0.92, a: 0, kind: 'nest', garrison: 0 },
    { r: 0.66, a: step * rng.range(0.18, 0.26), kind: 'nest', garrison: Math.round(rng.range(10, 18)) },
    { r: 0.66, a: -step * rng.range(0.18, 0.26), kind: 'nest', garrison: Math.round(rng.range(10, 18)) },
    { r: 0.4, a: step * rng.range(-0.12, 0.12), kind: 'nest', garrison: Math.round(rng.range(24, 40)) },
  ];
}

/** A straight run from the rim to the middle: a corridor to fight along. */
function layoutSpoke(rng: Rng, step: number): { r: number; a: number; kind: NodeKind; garrison: number }[] {
  const drift = rng.range(-0.06, 0.06);
  const out: { r: number; a: number; kind: NodeKind; garrison: number }[] = [
    { r: 0.92, a: 0, kind: 'nest', garrison: 0 },
  ];
  for (let i = 1; i <= 3; i++) {
    out.push({
      r: 0.92 - i * 0.2,
      a: step * drift * i,
      kind: 'nest',
      garrison: Math.round(rng.range(10, 20) + i * 5),
    });
  }
  out.push({ r: 0.72, a: step * rng.range(0.3, 0.42), kind: 'nest', garrison: Math.round(rng.range(12, 20)) });

  return out;
}

/** Two concentric rings: lots of sideways neighbours, few straight lines. */
function layoutRings(rng: Rng, step: number): { r: number; a: number; kind: NodeKind; garrison: number }[] {
  const out: { r: number; a: number; kind: NodeKind; garrison: number }[] = [
    { r: 0.92, a: 0, kind: 'nest', garrison: 0 },
  ];
  for (const [ring, count] of [[0.68, 2], [0.38, 2]] as [number, number][]) {
    for (let i = 0; i < count; i++) {
      const spread = step * (0.5 - 1 / (count + 1) * (i + 1)) * 0.9;
      out.push({
        r: ring + rng.range(-0.04, 0.04),
        a: spread,
        kind: 'nest',
        garrison: Math.round(rng.range(12, 22) + (1 - ring) * 20),
      });
    }
  }

  return out;
}

/** A tight home cluster, then a long gap to a fat prize near the middle. */
function layoutCluster(rng: Rng, step: number): { r: number; a: number; kind: NodeKind; garrison: number }[] {
  const out: { r: number; a: number; kind: NodeKind; garrison: number }[] = [
    { r: 0.92, a: 0, kind: 'nest', garrison: 0 },
  ];
  for (let i = 0; i < 3; i++) {
    out.push({
      r: rng.range(0.72, 0.86),
      a: step * rng.range(-0.34, 0.34),
      kind: 'nest',
      garrison: Math.round(rng.range(8, 16)),
    });
  }
  out.push({ r: rng.range(0.3, 0.4), a: step * rng.range(-0.1, 0.1), kind: 'nest', garrison: Math.round(rng.range(34, 52)) });

  return out;
}

/**
 * Nudges nodes apart so two rotated wedges never overlap near the centre.
 * Overlapping nodes are unclickable, which reads as a broken game.
 */
function spread(nodes: GameNode[]): void {
  const pad = 24;
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const min = KINDS[a.kind].radius + KINDS[b.kind].radius + pad;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.sqrt(dx * dx + dy * dy);
        if (d >= min) continue;
        if (d < 0.001) {
          dx = 1;
          dy = 0;
          d = 1;
        }
        const push = (min - d) / 2;
        const ux = (dx / d) * push;
        const uy = (dy / d) * push;
        a.x -= ux;
        a.y -= uy;
        b.x += ux;
        b.y += uy;
        moved = true;
      }
    }
    for (const n of nodes) {
      const r = KINDS[n.kind].radius + 12;
      n.x = Math.min(FIELD_W - r, Math.max(r, n.x));
      n.y = Math.min(FIELD_H - r, Math.max(r, n.y));
    }
    if (!moved) break;
  }
  for (const n of nodes) {
    n.x = Math.round(n.x);
    n.y = Math.round(n.y);
  }
}
