import {
  FIELD_H,
  FIELD_W,
  GameNode,
  GameState,
  KINDS,
  NEUTRAL,
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
  kind: 'capture' | 'snap' | 'clash';
  x: number;
  y: number;
  color: string;
  life: number;
  max: number;
}

/** Trails run in both directions along one corridor, so each is nudged aside. */
const LANE_OFFSET = 7;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private grain: HTMLCanvasElement | null = null;
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
    const max = kind === 'capture' ? 0.7 : kind === 'snap' ? 0.9 : 0.4;
    this.effects.push({ kind, x, y, color, life: max, max });
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

    ctx.fillStyle = SOIL;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(this.ox, this.oy);
    ctx.scale(this.scale, this.scale);
    ctx.beginPath();
    ctx.rect(0, 0, FIELD_W, FIELD_H);
    ctx.clip();

    this.drawGround();
    for (const t of s.trails) this.drawTrail(s, t);
    for (const p of pending) this.drawPending(s, p.from, p.to);
    if (drag) this.drawDrag(s, drag);
    for (const p of s.packets) this.drawColumn(s, p, alphaTick);
    for (const n of s.nodes) this.drawNode(s, n, you);
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

  /** Perpendicular nudge so an A->B and a B->A trail stay separately readable. */
  private lane(a: GameNode, b: GameNode): { nx: number; ny: number } {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;

    return { nx: (-dy / len) * LANE_OFFSET, ny: (dx / len) * LANE_OFFSET };
  }

  private drawTrail(s: GameState, t: Trail): void {
    const ctx = this.ctx;
    const a = s.nodes[t.from];
    const b = s.nodes[t.to];
    if (!a || !b) return;
    const { nx, ny } = this.lane(a, b);
    const color = playerColor(t.owner);

    ctx.save();
    if (t.air) {
      // A flight path is drawn as a thin dotted arc: nothing to gnaw here.
      ctx.setLineDash([2, 10]);
      ctx.strokeStyle = alpha(color, 0.55);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x + nx, a.y + ny);
      ctx.lineTo(b.x + nx, b.y + ny);
      ctx.stroke();
      ctx.restore();

      return;
    }

    // Pheromone bed: a wide soft glow under a firm centre line.
    ctx.lineCap = 'round';
    ctx.strokeStyle = alpha(color, 0.13);
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.moveTo(a.x + nx, a.y + ny);
    ctx.lineTo(b.x + nx, b.y + ny);
    ctx.stroke();

    ctx.strokeStyle = alpha(color, 0.42);
    ctx.lineWidth = 2.5;
    ctx.stroke();
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
    ctx.strokeStyle = drag.valid ? alpha(playerColor(from.owner), 0.9) : 'rgba(224,90,61,0.55)';
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
    const { nx, ny } = p.air ? { nx: 0, ny: 0 } : this.lane(a, b);
    const cx = a.x + dx * pos + nx;
    const cy = a.y + dy * pos + ny;
    const color = playerColor(p.owner);

    const bodies = Math.max(1, Math.min(14, Math.round(p.amount * (p.unit === 'worker' ? 1.4 : 1))));
    const spread = 6 + bodies * 2.1;
    const size = p.unit === 'beetle' ? 3.4 : p.unit === 'wasp' ? 2.6 : 2.2;

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

  private drawNode(s: GameState, n: GameNode, you: number): void {
    const ctx = this.ctx;
    const spec = KINDS[n.kind];
    const color = playerColor(n.owner);
    const owned = n.owner !== NEUTRAL;
    const starving = owned && !s.supplied[n.id];
    const r = spec.radius;

    ctx.save();
    ctx.translate(n.x, n.y);

    // Mound: lit from above-left, so the board reads as ground, not as a chart.
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.15, 0, 0, r);
    g.addColorStop(0, shade(color, owned ? 0.62 : 0.5));
    g.addColorStop(1, shade(color, owned ? 0.22 : 0.18));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = owned ? 3 : 2;
    if (starving) {
      // Dashed rim is the single readable signal that supply is cut.
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = alpha(color, 0.5);
    } else {
      ctx.strokeStyle = owned ? color : alpha(NEUTRAL_COLOR, 0.8);
    }
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // A ring marks the player's supply root -- the thing worth defending.
    const home = s.players.find((p) => p.alive && p.home === n.id);
    if (home) {
      ctx.strokeStyle = alpha(playerColor(home.id), 0.55);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, r + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (n.owner === you) {
      ctx.strokeStyle = alpha('#ffffff', 0.22);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, r - 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    this.drawGlyph(n.kind, r, color, owned);

    ctx.fillStyle = owned ? '#fff' : '#d8d3c8';
    ctx.font = `600 ${Math.round(r * 0.82)}px "Segoe UI", Roboto, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = 4;
    ctx.fillText(String(Math.floor(n.count)), 0, 1);
    ctx.restore();
  }

  /** Each kind gets a silhouette, because colour alone cannot say "wasps". */
  private drawGlyph(kind: GameNode['kind'], r: number, color: string, owned: boolean): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = owned ? 0.5 : 0.38;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    if (kind === 'nest') {
      // Concentric mound rings.
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.42 + i * 0.22), 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (kind === 'den') {
      // Beetle carapace: a hard hexagon.
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        const x = Math.cos(a) * r * 0.72;
        const y = Math.sin(a) * r * 0.72;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    } else {
      // Paper comb: three small cells.
      for (const [dx, dy] of [[0, -r * 0.34], [-r * 0.32, r * 0.22], [r * 0.32, r * 0.22]]) {
        ctx.beginPath();
        ctx.arc(dx, dy, r * 0.26, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawChew(s: GameState, t: Trail): void {
    if (t.chew <= 0.02 || t.air) return;
    const ctx = this.ctx;
    const a = s.nodes[t.from];
    const b = s.nodes[t.to];
    if (!a || !b) return;
    const { nx, ny } = this.lane(a, b);
    const x = (a.x + b.x) / 2 + nx;
    const y = (a.y + b.y) / 2 + ny;
    // Cost is recomputed rather than sent: the client has the same rules.
    const load = s.packets.reduce(
      (acc, p) => (p.from === t.from && p.to === t.to && p.owner === t.owner ? acc + p.amount : acc),
      0,
    );
    const cost = Math.min(9, 1 + load * 0.22);
    const frac = Math.max(0, Math.min(1, t.chew / cost));

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(20,16,12,0.85)';
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#f0b429';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
    // Bite marks, growing as the trail gives way.
    ctx.strokeStyle = alpha('#f0b429', 0.8);
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
        ctx.fillStyle = alpha('#ffffff', k * 0.8);
        for (let j = 0; j < 5; j++) {
          const a = (Math.PI * 2 * j) / 5 + j * 1.7;
          const d = (1 - k) * 16;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 1.8 * k + 0.6, 0, Math.PI * 2);
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
