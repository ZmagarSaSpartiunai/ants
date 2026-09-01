import { FIELD_H, FIELD_W, GameNode, KINDS, NEUTRAL, NodeKind } from './types.js';
import { Rng } from './rng.js';

export interface MapLayout {
  nodes: GameNode[];
  /** Home node id per player slot. */
  homes: number[];
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
    nodes.push({ id, x: Math.round(x), y: Math.round(y), kind, owner, count, carry: 0 });
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
  const wedge: Slot[] = [];

  // The home nest sits on the rim.
  wedge.push({ r: 0.92, a: 0, kind: 'nest', garrison: 0 });
  // Two cheap nests flanking it: the first thing anyone takes.
  wedge.push({ r: 0.66, a: step * rng.range(0.18, 0.26), kind: 'nest', garrison: Math.round(rng.range(10, 18)) });
  wedge.push({ r: 0.66, a: -step * rng.range(0.18, 0.26), kind: 'nest', garrison: Math.round(rng.range(10, 18)) });
  // A contested nest halfway to the middle.
  wedge.push({ r: 0.40, a: step * rng.range(-0.12, 0.12), kind: 'nest', garrison: Math.round(rng.range(24, 40)) });

  // Specials are what makes two maps play differently, so they are rolled.
  const denCount = 1 + rng.int(2);
  for (let i = 0; i < denCount; i++) {
    wedge.push({
      r: rng.range(0.5, 0.78),
      a: step * (rng.next() < 0.5 ? rng.range(0.3, 0.46) : -rng.range(0.3, 0.46)),
      kind: 'den',
      garrison: Math.round(rng.range(16, 26)),
    });
  }
  if (rng.next() < 0.75) {
    wedge.push({
      r: rng.range(0.22, 0.5),
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

  return { nodes, homes };
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
