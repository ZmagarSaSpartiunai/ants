import { FIELD_H, FIELD_W, GameNode, KINDS, River, Rng } from '@ants/shared';

/**
 * The border of the meadow: trees, bushes, ferns, fallen logs.
 *
 * The playable ring of nodes never reaches the edge of the field, so the outer
 * band was bare green -- the board looked like it had been cut out of a bigger
 * picture. Filling that band with growth gives the meadow somewhere to end.
 *
 * Two rules keep decoration from becoming noise:
 *   1. Nothing is drawn where the game happens. Every candidate spot is
 *      rejected if it is near a node or in the water, and only spots inside the
 *      outer band are considered at all -- a trail can be dragged between any
 *      two nodes, so the middle of the field belongs to the game alone.
 *   2. It is baked once per map into an offscreen canvas. Per frame this layer
 *      costs exactly one blit, whatever grows in it.
 *
 * The layout is seeded from the map itself rather than from Math.random, so
 * everybody in a room sees the same trees and the same board.
 */

/** How far in from the edge growth may reach. Nodes sit well inside this. */
const BAND = 132;
/** Clear space kept around every node, beyond its own radius. */
const NODE_CLEAR = 58;

const BARK_DARK = '#3a2a1b';
const BARK_LIGHT = '#7a5a38';

interface Spot {
  x: number;
  y: number;
  /** Radius it occupies on the ground, used for spacing. */
  r: number;
  /** Whether it grows upward, and so has to be kept upright on screen. */
  standing: boolean;
  draw: (ctx: CanvasRenderingContext2D, rng: Rng) => void;
}

/**
 * `turned` is the board being shown a quarter turn round, as it is on a phone
 * held upright. Grass and mounds survive that rotation because they are round;
 * a tree does not -- rotate the board and the whole wood lies on its side. So
 * anything that grows out of the ground is baked pre-turned, and ends up
 * standing after the board's own rotation cancels it out.
 */
export function buildScenery(nodes: GameNode[], rivers: River[], turned: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = FIELD_W;
  c.height = FIELD_H;
  const ctx = c.getContext('2d')!;
  const rng = new Rng(seedFrom(nodes));

  const spots: Spot[] = [];
  const place = (
    r: number,
    reach: number,
    draw: (ctx: CanvasRenderingContext2D, rng: Rng) => void,
    standing = true,
    tries = 90,
  ): void => {
    for (let i = 0; i < tries; i++) {
      // "reach" lets a canopy hang past the edge of the field: a row of whole
      // trees standing to attention reads as a fence, a clipped one reads as
      // more meadow carrying on out of frame.
      const x = rng.range(-reach, FIELD_W + reach);
      const y = rng.range(-reach, FIELD_H + reach);
      if (!inBand(x, y)) continue;
      if (!clearOfNodes(x, y, r, nodes)) continue;
      if (!clearOfWater(x, y, r, rivers)) continue;
      if (spots.some((s) => Math.hypot(s.x - x, s.y - y) < (s.r + r) * 0.82)) continue;
      spots.push({ x, y, r, standing, draw });

      return;
    }
  };

  // Trees first and biggest: they are what the eye reads as the edge of the
  // world, and everything smaller is filler between them.
  for (let i = 0; i < 36; i++) {
    const scale = rng.range(0.78, 1.32);
    const warm = rng.next() < 0.16;
    const seed = rng.int(0xffffffff);
    place(30 * scale, 46, (g) => tree(g, new Rng(seed), scale, warm));
  }
  for (let i = 0; i < 30; i++) {
    const scale = rng.range(0.7, 1.25);
    const seed = rng.int(0xffffffff);
    place(20 * scale, 18, (g) => bush(g, new Rng(seed), scale));
  }
  for (let i = 0; i < 4; i++) {
    const seed = rng.int(0xffffffff);
    place(26, 10, (g) => log(g, new Rng(seed)), false);
  }
  for (let i = 0; i < 44; i++) {
    const seed = rng.int(0xffffffff);
    place(11, 6, (g) => fern(g, new Rng(seed)));
  }
  for (let i = 0; i < 32; i++) {
    const seed = rng.int(0xffffffff);
    place(7, 4, (g) => flowers(g, new Rng(seed)));
  }
  for (let i = 0; i < 12; i++) {
    const seed = rng.int(0xffffffff);
    place(6, 4, (g) => mushrooms(g, new Rng(seed)));
  }

  // Painter's order: whatever is lower on the field is nearer the viewer. In
  // portrait "lower on the screen" is a larger x, so the board's own rotation
  // decides which axis this sort runs along.
  spots.sort((a, b) => (turned ? a.x - b.x : a.y - b.y));
  for (const s of spots) {
    ctx.save();
    ctx.translate(s.x, s.y);
    if (turned && s.standing) ctx.rotate(Math.PI / 2);
    s.draw(ctx, rng);
    ctx.restore();
  }

  vignette(ctx);

  return c;
}

/**
 * Baked on top of the growth rather than under it, so the trees at the edge
 * fall into shadow with the ground they stand on and the middle of the board
 * stays the brightest thing on screen.
 */
function vignette(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createRadialGradient(
    FIELD_W / 2, FIELD_H / 2, FIELD_H * 0.3,
    FIELD_W / 2, FIELD_H / 2, FIELD_W * 0.72,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(6,14,4,0.42)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
}

/** Same map, same trees, on every machine in the room. */
function seedFrom(nodes: GameNode[]): number {
  let h = 0x811c9dc5;
  for (const n of nodes) {
    h = Math.imul(h ^ n.x, 0x01000193) >>> 0;
    h = Math.imul(h ^ n.y, 0x01000193) >>> 0;
  }

  return h >>> 0;
}

function inBand(x: number, y: number): boolean {
  return Math.min(x, FIELD_W - x, y, FIELD_H - y) < BAND;
}

function clearOfNodes(x: number, y: number, r: number, nodes: GameNode[]): boolean {
  for (const n of nodes) {
    if (Math.hypot(n.x - x, n.y - y) < KINDS[n.kind].radius + NODE_CLEAR + r) return false;
  }

  return true;
}

function clearOfWater(x: number, y: number, r: number, rivers: River[]): boolean {
  for (const river of rivers) {
    for (let i = 1; i < river.points.length; i++) {
      if (distToSegment(x, y, river.points[i - 1], river.points[i]) < river.width + r + 14) {
        return false;
      }
    }
  }

  return true;
}

function distToSegment(x: number, y: number, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len));

  return Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
}

/**
 * A soft blob of shadow on the grass. Everything that stands up gets one, and
 * they all fall the same way -- down and to the right -- which is most of what
 * sells a flat canvas as a scene with a sun in it.
 */
function groundShadow(ctx: CanvasRenderingContext2D, dx: number, dy: number, rx: number, ry: number, a: number): void {
  const g = ctx.createRadialGradient(dx, dy, 0, dx, dy, Math.max(rx, ry));
  g.addColorStop(0, `rgba(12,22,8,${a})`);
  g.addColorStop(0.62, `rgba(12,22,8,${a * 0.72})`);
  g.addColorStop(1, 'rgba(12,22,8,0)');
  ctx.save();
  ctx.translate(dx, dy);
  ctx.scale(1, ry / rx);
  ctx.translate(-dx, -dy);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(dx, dy, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * The origin is where the trunk meets the ground, so a tree is placed by its
 * foot and grows up the screen -- which is what puts its canopy between the
 * player and nothing, and never between the player and a node.
 */
function tree(ctx: CanvasRenderingContext2D, rng: Rng, scale: number, warm: boolean): void {
  const h = rng.range(40, 54) * scale;
  const cr = rng.range(30, 38) * scale;
  const trunkW = 5.2 * scale;

  groundShadow(ctx, cr * 0.42, h * 0.1 + cr * 0.3, cr * 1.06, cr * 0.5, 0.36);

  // Trunk, slightly wider at the root, leaning a touch off vertical.
  const lean = rng.range(-0.1, 0.1);
  const topX = lean * h;
  const bark = ctx.createLinearGradient(-trunkW, 0, trunkW, 0);
  bark.addColorStop(0, BARK_LIGHT);
  bark.addColorStop(0.45, '#5b422a');
  bark.addColorStop(1, BARK_DARK);
  ctx.fillStyle = bark;
  ctx.beginPath();
  ctx.moveTo(-trunkW * 1.5, 2);
  ctx.quadraticCurveTo(-trunkW * 0.8, -h * 0.5, topX - trunkW * 0.5, -h);
  ctx.lineTo(topX + trunkW * 0.5, -h);
  ctx.quadraticCurveTo(trunkW * 0.8, -h * 0.5, trunkW * 1.5, 2);
  ctx.closePath();
  ctx.fill();

  // Two boughs reaching into the canopy, so the crown looks held up.
  ctx.strokeStyle = '#4a3522';
  ctx.lineCap = 'round';
  for (const dir of [-1, 1]) {
    ctx.lineWidth = 2.4 * scale;
    ctx.beginPath();
    ctx.moveTo(topX * 0.6, -h * 0.62);
    ctx.quadraticCurveTo(dir * cr * 0.3, -h * 0.85, dir * cr * 0.5, -h - cr * 0.1);
    ctx.stroke();
  }

  const crownY = -h - cr * 0.35;
  // Every tree gets its own tone. A treeline in one flat green reads as a
  // stencil; a few degrees of drift between neighbours reads as a wood.
  // Kept inside a narrow band of greens on purpose: an earlier pass let the
  // cool end drift towards teal and those trees read as something else growing
  // on the map rather than as the wood behind it.
  const cool = rng.range(-1, 1);
  const deep = warm ? '#5a4a1c' : cool < -0.35 ? '#1a3319' : '#24421c';
  const midTone = warm ? '#8a6d24' : cool < -0.35 ? '#2f5626' : cool > 0.45 ? '#4a7529' : '#3d6b2b';
  const litTone = warm ? '#c39a3a' : cool < -0.35 ? '#568739' : cool > 0.45 ? '#87ab42' : '#6f9c44';

  // The crown is a handful of overlapping lobes rather than one circle: a
  // circle of green reads as a bush seen from directly above, lobes read as
  // leaves catching the light at different angles.
  const lobes = 6 + rng.int(3);
  const blobs: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + rng.range(-0.25, 0.25);
    const d = cr * rng.range(0.34, 0.6);
    blobs.push({
      x: Math.cos(a) * d,
      y: crownY + Math.sin(a) * d * 0.72,
      r: cr * rng.range(0.44, 0.62),
    });
  }
  blobs.push({ x: 0, y: crownY, r: cr * 0.78 });

  // Underside first, as one dark mass, then the lit lobes on top of it.
  ctx.fillStyle = deep;
  for (const b of blobs) {
    ctx.beginPath();
    ctx.ellipse(b.x + cr * 0.06, b.y + cr * 0.12, b.r, b.r * 0.94, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const b of blobs) {
    const g = ctx.createRadialGradient(
      b.x - b.r * 0.42, b.y - b.r * 0.5, b.r * 0.1,
      b.x, b.y, b.r * 1.05,
    );
    g.addColorStop(0, litTone);
    g.addColorStop(0.55, midTone);
    g.addColorStop(1, deep);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(b.x, b.y, b.r, b.r * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Leaf speckle, kept to the lit shoulder of the crown.
  for (let i = 0; i < 26; i++) {
    const b = blobs[rng.int(blobs.length)];
    const a = rng.range(Math.PI * 0.9, Math.PI * 1.85);
    const d = b.r * rng.range(0.2, 0.85);
    ctx.fillStyle = rng.next() < 0.5 ? litTone : midTone;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(
      b.x + Math.cos(a) * d, b.y + Math.sin(a) * d,
      1.5 * scale, 1.1 * scale, a, 0, Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Grass and litter piled where the trunk meets the ground.
  ctx.fillStyle = 'rgba(38,58,26,0.6)';
  ctx.beginPath();
  ctx.ellipse(0, 1, trunkW * 2.4, trunkW * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
}

function bush(ctx: CanvasRenderingContext2D, rng: Rng, scale: number): void {
  const r = rng.range(13, 20) * scale;
  groundShadow(ctx, r * 0.4, r * 0.42, r * 1.05, r * 0.44, 0.3);

  const lobes = 4 + rng.int(3);
  const flower = rng.next() < 0.3;
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2;
    const x = Math.cos(a) * r * 0.5;
    const y = -r * 0.45 + Math.sin(a) * r * 0.32;
    const rr = r * rng.range(0.5, 0.72);
    const g = ctx.createRadialGradient(x - rr * 0.4, y - rr * 0.5, rr * 0.1, x, y, rr);
    g.addColorStop(0, '#71a049');
    g.addColorStop(0.6, '#3d6b2c');
    g.addColorStop(1, '#22401b');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rr, rr * 0.86, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (flower) {
    // A flowering shrub, for a spot of colour that is nobody's player colour.
    ctx.fillStyle = rng.next() < 0.5 ? 'rgba(232,236,240,0.9)' : 'rgba(214,176,232,0.9)';
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.arc(rng.range(-r * 0.7, r * 0.7), -r * 0.5 + rng.range(-r * 0.4, r * 0.35), 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function log(ctx: CanvasRenderingContext2D, rng: Rng): void {
  const len = rng.range(26, 40);
  const rad = rng.range(6, 8.5);
  const a = rng.range(0, Math.PI);
  ctx.save();
  ctx.rotate(a);
  groundShadow(ctx, 3, rad * 0.9, len * 1.05, rad * 0.9, 0.32);

  const g = ctx.createLinearGradient(0, -rad, 0, rad);
  g.addColorStop(0, BARK_LIGHT);
  g.addColorStop(0.5, '#5a4128');
  g.addColorStop(1, BARK_DARK);
  ctx.fillStyle = g;
  ctx.beginPath();
  // Hand-rolled rather than roundRect: that call is recent enough that some
  // phone browsers still in use would throw on it, and this layer must never
  // be the reason a board fails to draw.
  ctx.moveTo(-len, -rad);
  ctx.lineTo(len, -rad);
  ctx.arc(len, 0, rad, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(-len, rad);
  ctx.arc(-len, 0, rad, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fill();

  // The sawn end, facing the light, with rings.
  ctx.fillStyle = '#8a6a44';
  ctx.beginPath();
  ctx.ellipse(-len, 0, rad * 0.5, rad, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,42,24,0.7)';
  ctx.lineWidth = 0.8;
  for (let i = 1; i <= 2; i++) {
    ctx.beginPath();
    ctx.ellipse(-len, 0, rad * 0.5 * (i / 3), rad * (i / 3), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Bark grain.
  ctx.strokeStyle = 'rgba(40,28,16,0.35)';
  for (let i = 0; i < 5; i++) {
    const y = rng.range(-rad * 0.6, rad * 0.7);
    ctx.beginPath();
    ctx.moveTo(-len * rng.range(0.2, 0.8), y);
    ctx.lineTo(len * rng.range(0.2, 0.8), y + rng.range(-1, 1));
    ctx.stroke();
  }
  // Moss on the shaded side.
  ctx.fillStyle = 'rgba(96,132,58,0.5)';
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.ellipse(rng.range(-len * 0.9, len * 0.9), rad * rng.range(0.3, 0.8), rng.range(2, 5), 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function fern(ctx: CanvasRenderingContext2D, rng: Rng): void {
  const n = 5 + rng.int(4);
  groundShadow(ctx, 3, 2.5, 10, 4, 0.24);
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + rng.range(-1, 1);
    const len = rng.range(9, 17);
    const tipX = Math.cos(a) * len;
    const tipY = Math.sin(a) * len * 0.9;
    ctx.strokeStyle = i % 3 === 0 ? '#6d9a41' : '#325a25';
    ctx.lineWidth = rng.range(1.2, 2.2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(tipX * 0.4, tipY * 0.9, tipX, tipY);
    ctx.stroke();
  }
}

function flowers(ctx: CanvasRenderingContext2D, rng: Rng): void {
  const petal = ['#f2f0e4', '#ffd873', '#d9b0ea', '#f09a9a'][rng.int(4)];
  const n = 3 + rng.int(4);
  for (let i = 0; i < n; i++) {
    const x = rng.range(-8, 8);
    const y = rng.range(-6, 6);
    ctx.strokeStyle = 'rgba(46,80,32,0.8)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y + 5);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = petal;
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * 1.5, y + Math.sin(a) * 1.3, 1.3, 1.1, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#c9922f';
    ctx.beginPath();
    ctx.arc(x, y, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
}

function mushrooms(ctx: CanvasRenderingContext2D, rng: Rng): void {
  const red = rng.next() < 0.4;
  const n = 2 + rng.int(3);
  for (let i = 0; i < n; i++) {
    const x = rng.range(-7, 7);
    const y = rng.range(-4, 4);
    const r = rng.range(2.4, 4);
    groundShadow(ctx, x + r * 0.5, y + r * 0.4, r * 1.2, r * 0.5, 0.28);
    ctx.fillStyle = '#e2d8c0';
    ctx.fillRect(x - r * 0.22, y - r * 0.7, r * 0.44, r * 0.9);
    const g = ctx.createLinearGradient(x - r, y - r, x + r, y);
    g.addColorStop(0, red ? '#e4644a' : '#c9a878');
    g.addColorStop(1, red ? '#9c3423' : '#8a6d46');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y - r * 0.7, r, r * 0.7, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    if (red) {
      ctx.fillStyle = 'rgba(245,240,228,0.9)';
      for (let d = 0; d < 3; d++) {
        ctx.beginPath();
        ctx.arc(x + rng.range(-r * 0.6, r * 0.6), y - r * 0.9 + rng.range(-r * 0.2, r * 0.2), 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
