import {
  canLink,
  FIELD_H,
  FIELD_W,
  GameNode,
  GameState,
  KINDS,
  LINK_RANGE,
  NEUTRAL,
  NodeKind,
  Packet,
  Trail,
  UNITS,
} from '@ants/shared';
import { alpha, NEUTRAL_COLOR, playerColor, shade, SOIL, SOIL_LIGHT } from './theme.js';

export interface DragPreview {
  fromNode: number;
  x: number;
  y: number;
  valid: boolean;
}

export interface Effect {
  kind: 'capture' | 'snap' | 'clash' | 'float';
  x: number;
  y: number;
  color: string;
  life: number;
  max: number;
  text?: string;
}

/**
 * Only the pheromone bed is nudged aside, and barely. The marching columns stay
 * on the centre line: offsetting them put two opposing streams on separate
 * lanes, so they slid past each other on screen while the simulation was
 * actually fighting them. The corridor between two nodes is one corridor.
 */
const BED_OFFSET = 4;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private grain: HTMLCanvasElement | null = null;
  private time = 0;
  readonly effects: Effect[] = [];

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('canvas 2d unavailable');
    this.ctx = ctx;
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.scale = Math.min(w / FIELD_W, h / FIELD_H);
    this.ox = (w - FIELD_W * this.scale) / 2;
    this.oy = (h - FIELD_H * this.scale) / 2;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();

    return {
      x: (clientX - r.left - this.ox) / this.scale,
      y: (clientY - r.top - this.oy) / this.scale,
    };
  }

  addEffect(kind: Effect['kind'], x: number, y: number, color: string): void {
    const max = kind === 'capture' ? 0.7 : kind === 'snap' ? 0.9 : 0.5;
    this.effects.push({ kind, x, y, color, life: max, max });
  }

  /**
   * The number on a node moves for two different reasons -- it grows on its
   * own, and it jumps when a column lands. Without saying which, players read
   * the whole board as arbitrary.
   */
  addFloat(x: number, y: number, text: string, color: string): void {
    this.effects.push({ kind: 'float', x, y, color, life: 1.1, max: 1.1, text });
  }

  draw(
    s: GameState,
    you: number,
    alphaTick: number,
    drag: DragPreview | null,
    dt: number,
    pending: { from: number; to: number }[] = [],
  ): void {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.time += dt;

    ctx.fillStyle = SOIL;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(this.ox, this.oy);
    ctx.scale(this.scale, this.scale);
    ctx.beginPath();
    ctx.rect(0, 0, FIELD_W, FIELD_H);
    ctx.clip();

    this.drawGround();
    if (drag) this.drawReach(s, you, drag);
    for (const t of s.trails) this.drawTrail(s, t);
    for (const p of pending) this.drawPending(s, p.from, p.to);
    if (drag) this.drawDrag(s, drag);
    for (const p of s.packets) this.drawColumn(s, p, alphaTick);
    for (const n of s.nodes) this.drawNode(s, n, you, drag);
    for (const t of s.trails) this.drawChew(s, t);
    this.drawEffects(dt);

    ctx.restore();
  }

  private drawGround(): void {
    const ctx = this.ctx;
    if (!this.grain) this.grain = makeGrain();
    const g = ctx.createRadialGradient(
      FIELD_W / 2, FIELD_H / 2, 60,
      FIELD_W / 2, FIELD_H / 2, FIELD_W * 0.62,
    );
    g.addColorStop(0, SOIL_LIGHT);
    g.addColorStop(1, SOIL);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);

    const pattern = ctx.createPattern(this.grain, 'repeat');
    if (pattern) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, FIELD_W, FIELD_H);
      ctx.globalAlpha = 1;
    }
  }

  /**
   * The one thing a player cannot guess: how far a trail can be dug. Shown as
   * ground the moment a drag starts, because "nothing happened" on release is
   * indistinguishable from a broken control.
   */
  private drawReach(s: GameState, you: number, drag: DragPreview): void {
    const from = s.nodes[drag.fromNode];
    if (!from) return;
    const ctx = this.ctx;
    ctx.save();
    if (from.kind === 'hive') {
      // Wasps fly: the whole map is in range, and that is the point of a hive.
      ctx.fillStyle = alpha(playerColor(you), 0.05);
      ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    } else {
      ctx.beginPath();
      ctx.arc(from.x, from.y, LINK_RANGE, 0, Math.PI * 2);
      ctx.fillStyle = alpha(playerColor(you), 0.055);
      ctx.fill();
      ctx.setLineDash([6, 9]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = alpha(playerColor(you), 0.28);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawTrail(s: GameState, t: Trail): void {
    const ctx = this.ctx;
    const a = s.nodes[t.from];
    const b = s.nodes[t.to];
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * BED_OFFSET;
    const ny = (dx / len) * BED_OFFSET;
    const color = playerColor(t.owner);

    ctx.save();
    if (t.air) {
      // A flight path is a thin dotted line: there is nothing here to gnaw.
      ctx.setLineDash([2, 11]);
      ctx.lineCap = 'round';
      ctx.strokeStyle = alpha(color, 0.6);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(a.x + nx, a.y + ny);
      ctx.lineTo(b.x + nx, b.y + ny);
      ctx.stroke();
      ctx.restore();

      return;
    }

    ctx.lineCap = 'round';
    ctx.strokeStyle = alpha(color, 0.14);
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(a.x + nx, a.y + ny);
    ctx.lineTo(b.x + nx, b.y + ny);
    ctx.stroke();

    ctx.strokeStyle = alpha(color, 0.45);
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // An arrowhead near the far end: a trail is one-way, and that matters for
    // supply, so the direction has to be visible without watching the ants.
    const hx = a.x + dx * 0.72 + nx;
    const hy = a.y + dy * 0.72 + ny;
    const ux = dx / len;
    const uy = dy / len;
    ctx.fillStyle = alpha(color, 0.5);
    ctx.beginPath();
    ctx.moveTo(hx + ux * 7, hy + uy * 7);
    ctx.lineTo(hx - ux * 4 - uy * 5, hy - uy * 4 + ux * 5);
    ctx.lineTo(hx - ux * 4 + uy * 5, hy - uy * 4 - ux * 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawDrag(s: GameState, drag: DragPreview): void {
    const ctx = this.ctx;
    const from = s.nodes[drag.fromNode];
    if (!from) return;
    ctx.save();
    ctx.setLineDash([9, 7]);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = drag.valid ? alpha(playerColor(from.owner), 0.95) : 'rgba(224,90,61,0.5)';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(drag.x, drag.y);
    ctx.stroke();
    ctx.restore();
  }

  /** A command in flight to the server: shown at once so input feels instant. */
  private drawPending(s: GameState, from: number, to: number): void {
    const a = s.nodes[from];
    const b = s.nodes[to];
    if (!a || !b) return;
    if (s.trails.some((tr) => tr.from === from && tr.to === to)) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([4, 8]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = alpha(playerColor(a.owner), 0.4);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * A packet is a column, not one ant. The count is never sent over the wire --
   * the client turns throughput into a crowd here, procedurally.
   */
  private drawColumn(s: GameState, p: Packet, alphaTick: number): void {
    const ctx = this.ctx;
    const a = s.nodes[p.from];
    const b = s.nodes[p.to];
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // Interpolate between sim ticks so 20 Hz logic renders at display rate.
    const pos = Math.min(1, p.pos + (UNITS[p.unit].speed * alphaTick) / (len * 20));
    const ux = dx / len;
    const uy = dy / len;
    const cx = a.x + dx * pos;
    const cy = a.y + dy * pos;
    const color = playerColor(p.owner);

    const bodies = Math.max(1, Math.min(14, Math.round(p.amount * (p.unit === 'worker' ? 1.4 : 1))));
    const spread = 6 + bodies * 2.1;
    const size = p.unit === 'beetle' ? 3.6 : p.unit === 'wasp' ? 2.7 : 2.3;

    ctx.save();
    ctx.fillStyle = color;
    for (let i = 0; i < bodies; i++) {
      // Stable per-ant offsets: a hash, not Math.random, or the column would
      // boil from frame to frame instead of walking.
      const h1 = hash(i * 2654435761);
      const h2 = hash(i * 40503 + 7);
      const along = (i / Math.max(1, bodies - 1) - 0.5) * spread + (h1 - 0.5) * 4;
      const side = (h2 - 0.5) * (p.unit === 'wasp' ? 9 : 6);
      ctx.beginPath();
      ctx.ellipse(
        cx + ux * along + -uy * side,
        cy + uy * along + ux * side,
        size,
        size * 0.72,
        Math.atan2(uy, ux),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    if (p.unit === 'wasp') {
      ctx.strokeStyle = alpha(color, 0.35);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, spread * 0.7, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Each kind gets its own silhouette. Colour says who owns a node; only shape
   * can say what a node *is*, and a player has to know a hive on sight because
   * a hive is the one thing they cannot answer by cutting.
   */
  private nodePath(kind: NodeKind, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    if (kind === 'nest') {
      ctx.arc(0, 0, r, 0, Math.PI * 2);

      return;
    }
    if (kind === 'den') {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();

      return;
    }
    // Hive: a blunt triangle, unmistakable against circles and hexagons.
    const R = r * 1.12;
    for (let i = 0; i < 3; i++) {
      const a = (Math.PI * 2 * i) / 3 - Math.PI / 2;
      const x = Math.cos(a) * R;
      const y = Math.sin(a) * R;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  private drawNode(s: GameState, n: GameNode, you: number, drag: DragPreview | null): void {
    const ctx = this.ctx;
    const spec = KINDS[n.kind];
    const color = playerColor(n.owner);
    const owned = n.owner !== NEUTRAL;
    const starving = owned && !s.supplied[n.id];
    const r = spec.radius;

    // While dragging, every node says plainly whether it can be reached.
    let dim = false;
    let target = false;
    if (drag && n.id !== drag.fromNode) {
      target = canLink(s, you, drag.fromNode, n.id);
      dim = !target;
    }

    ctx.save();
    ctx.translate(n.x, n.y);
    if (dim) ctx.globalAlpha = 0.35;

    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.15, 0, 0, r);
    g.addColorStop(0, shade(color, owned ? 0.62 : 0.5));
    g.addColorStop(1, shade(color, owned ? 0.22 : 0.18));
    ctx.fillStyle = g;
    this.nodePath(n.kind, r);
    ctx.fill();

    ctx.lineWidth = owned ? 3 : 2;
    if (starving) {
      // Dashed rim is the one signal that this node has been cut off.
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = alpha(color, 0.5);
    } else {
      ctx.strokeStyle = owned ? color : alpha(NEUTRAL_COLOR, 0.85);
    }
    this.nodePath(n.kind, r);
    ctx.stroke();
    ctx.setLineDash([]);

    if (owned) this.drawFillRing(n, r, color, starving);

    // A ring marks a player's supply root -- the thing actually worth defending.
    const home = s.players.find((p) => p.alive && p.home === n.id);
    if (home) {
      ctx.strokeStyle = alpha(playerColor(home.id), 0.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, r + 11, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (target) {
      const pulse = 0.55 + 0.45 * Math.sin(this.time * 7);
      ctx.strokeStyle = alpha(playerColor(you), 0.35 + 0.45 * pulse);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, r + 7, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = owned ? '#fff' : '#ded8cc';
    ctx.font = `700 ${Math.round(r * 0.8)}px "Segoe UI", Roboto, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 5;
    ctx.fillText(String(Math.floor(n.count)), 0, n.kind === 'hive' ? r * 0.18 : 1);
    ctx.restore();
  }

  /**
   * How full a node is, as an arc around its rim. Without it the only evidence
   * of growth is a number ticking over, which players read as "nothing happens".
   */
  private drawFillRing(n: GameNode, r: number, color: string, starving: boolean): void {
    const ctx = this.ctx;
    const cap = KINDS[n.kind].cap;
    const frac = Math.max(0, Math.min(1, n.count / cap));
    if (frac <= 0.001) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = starving ? alpha(color, 0.3) : alpha('#ffffff', 0.42);
    ctx.beginPath();
    ctx.arc(0, 0, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
    // Overfilled by deliveries: growth stops at the cap, arrivals do not.
    if (n.count > cap) {
      ctx.strokeStyle = alpha(color, 0.85);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 8.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, (n.count - cap) / cap));
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawChew(s: GameState, t: Trail): void {
    if (t.chew <= 0.02 || t.air) return;
    const ctx = this.ctx;
    const a = s.nodes[t.from];
    const b = s.nodes[t.to];
    if (!a || !b) return;
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    // Cost is recomputed rather than sent: the client has the same rules.
    const load = s.packets.reduce(
      (acc, p) => (p.from === t.from && p.to === t.to && p.owner === t.owner ? acc + p.amount : acc),
      0,
    );
    const cost = Math.min(9, 1 + load * 0.22);
    const frac = Math.max(0, Math.min(1, t.chew / cost));

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(20,16,12,0.88)';
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#f0b429';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
    ctx.strokeStyle = alpha('#f0b429', 0.85);
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a2 = (Math.PI * 2 * i) / 3 + frac * 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a2) * 4, Math.sin(a2) * 4);
      ctx.lineTo(Math.cos(a2) * (5 + frac * 5), Math.sin(a2) * (5 + frac * 5));
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawEffects(dt: number): void {
    const ctx = this.ctx;
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= dt;
      if (e.life <= 0) {
        this.effects.splice(i, 1);
        continue;
      }
      const k = e.life / e.max;
      ctx.save();
      if (e.kind === 'float') {
        const rise = (1 - k) * 34;
        ctx.globalAlpha = Math.min(1, k * 2.2);
        ctx.translate(e.x, e.y - 34 - rise);
        ctx.font = '700 21px "Segoe UI", Roboto, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(12,10,8,0.9)';
        ctx.strokeText(e.text ?? '', 0, 0);
        ctx.fillStyle = e.color;
        ctx.fillText(e.text ?? '', 0, 0);
        ctx.restore();
        continue;
      }
      ctx.translate(e.x, e.y);
      if (e.kind === 'capture') {
        ctx.strokeStyle = alpha(e.color, k * 0.9);
        ctx.lineWidth = 3 * k + 1;
        ctx.beginPath();
        ctx.arc(0, 0, 26 + (1 - k) * 42, 0, Math.PI * 2);
        ctx.stroke();
      } else if (e.kind === 'snap') {
        // A broken trail should look torn, not merely deleted.
        ctx.strokeStyle = alpha('#ffd98a', k);
        ctx.lineWidth = 2.5;
        for (let j = 0; j < 6; j++) {
          const a = (Math.PI * 2 * j) / 6 + j;
          const d = (1 - k) * 34;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d);
          ctx.lineTo(Math.cos(a) * (d + 9), Math.sin(a) * (d + 9));
          ctx.stroke();
        }
      } else {
        // Two columns meeting is the payoff of digging into a defended lane, so
        // it gets a flash rather than a few quiet specks.
        ctx.fillStyle = alpha('#fff1c9', k * 0.5);
        ctx.beginPath();
        ctx.arc(0, 0, 5 + (1 - k) * 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = alpha('#ffffff', k * 0.95);
        for (let j = 0; j < 7; j++) {
          const a = (Math.PI * 2 * j) / 7 + j * 1.7;
          const d = (1 - k) * 22;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 2.2 * k + 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }
}

/** Cheap deterministic hash in 0..1 -- keeps ant positions from shimmering. */
function hash(n: number): number {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 2246822507);
  x = Math.imul(x ^ (x >>> 13), 3266489909);

  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** A speckled tile, so the ground has texture without shipping an image. */
function makeGrain(): HTMLCanvasElement {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.random() * 22;
    img.data[i * 4] = 40 + v;
    img.data[i * 4 + 1] = 34 + v;
    img.data[i * 4 + 2] = 26 + v;
    img.data[i * 4 + 3] = 16;
  }
  ctx.putImageData(img, 0, 0);

  return c;
}
