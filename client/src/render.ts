import {
  blockedBy,
  canLink,
  crossesWater,
  FIELD_H,
  FIELD_W,
  GameNode,
  GameState,
  KINDS,
  NEUTRAL,
  outgoing,
  Packet,
  River,
  SPEED_FROM_STRENGTH,
  Trail,
  UNITS,
} from '@ants/shared';
import { alpha, mix, playerColor, shade, SOIL_LIGHT, SOIL_MID, TILT, tint } from './theme.js';
import { buildMeadow } from './ground.js';
import { drawCreature } from './creatures.js';
import { drawStructure } from './structures.js';

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
 * Only the worn track is nudged aside, and barely. The creatures themselves
 * stay on the centre line: offsetting them put two opposing streams on separate
 * lanes, so they slid past each other on screen while the simulation was
 * fighting them. The ground between two nodes is one corridor.
 */
const PATH_OFFSET = 4;

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private meadow: HTMLCanvasElement | null = null;
  /**
   * On a tall screen the board is turned a quarter turn so it runs along the
   * long side. Upright, a 3:2 field fills about a quarter of a phone; turned,
   * it fills most of it. The board has no inherent "up", so nothing is lost --
   * and it beats telling somebody to rotate their phone and leaving it at that.
   */
  private turned = false;
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
    this.turned = h > w * 1.05;
    if (this.turned) {
      this.scale = Math.min(w / FIELD_H, h / FIELD_W);
      this.ox = (w - FIELD_H * this.scale) / 2;
      this.oy = (h - FIELD_W * this.scale) / 2;
    } else {
      this.scale = Math.min(w / FIELD_W, h / FIELD_H);
      this.ox = (w - FIELD_W * this.scale) / 2;
      this.oy = (h - FIELD_H * this.scale) / 2;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * How many field units one screen pixel covers. Anything sized for a finger
   * has to be measured in screen pixels and converted through this: a margin
   * written in field units shrinks with the board, and on a phone the whole
   * board is a third of its desktop size.
   */
  get unitsPerPixel(): number {
    return 1 / this.scale;
  }

  toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const sx = clientX - r.left - this.ox;
    const sy = clientY - r.top - this.oy;
    // Exactly the inverse of the transform laid down in draw().
    if (this.turned) {
      return { x: FIELD_W - sy / this.scale, y: sx / this.scale };
    }

    return { x: sx / this.scale, y: sy / this.scale };
  }

  /**
   * Turns the local frame back to match the screen. Everything the player has
   * to *read* -- the garrison plate, a floating number, the little link dots --
   * has to sit upright and above the thing it belongs to, whichever way round
   * the board is. Only the board itself turns.
   */
  private upright(): void {
    if (this.turned) this.ctx.rotate(Math.PI / 2);
  }

  addEffect(kind: Effect['kind'], x: number, y: number, color: string): void {
    const max = kind === 'capture' ? 0.8 : kind === 'snap' ? 0.9 : 0.45;
    this.effects.push({ kind, x, y, color, life: max, max });
  }

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

    ctx.fillStyle = '#15200f';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(this.ox, this.oy);
    if (this.turned) {
      ctx.translate(0, FIELD_W * this.scale);
      ctx.rotate(-Math.PI / 2);
    }
    ctx.scale(this.scale, this.scale);
    ctx.beginPath();
    ctx.rect(0, 0, FIELD_W, FIELD_H);
    ctx.clip();

    if (!this.meadow) this.meadow = buildMeadow();
    ctx.drawImage(this.meadow, 0, 0);
    for (const river of s.rivers) this.drawRiver(river);

    if (drag) this.drawBlocker(s, you, drag);
    this.drawScars(s);
    for (const t of s.trails) this.drawTrack(s, t);
    for (const p of pending) this.drawPending(s, p.from, p.to);
    if (drag) this.drawDrag(s, drag);
    for (const p of s.packets) this.drawCreatureAt(s, p, alphaTick);
    // Painter's order: what is lower on the field is nearer, so it goes last.
    for (const n of [...s.nodes].sort((a, b) => a.y - b.y)) this.drawNode(s, n, you, drag);
    for (const t of s.trails) this.drawChew(s, t);
    this.drawEffects(dt);

    ctx.restore();
  }

  /**
   * Water, with its banks and its fords. The fords have to be unmistakable:
   * they are the only way across on foot, so they are where the whole map is
   * decided, and a player who cannot see them reads the river as a wall.
   */
  private drawRiver(river: River): void {
    const ctx = this.ctx;
    const line = (): void => {
      ctx.beginPath();
      ctx.moveTo(river.points[0].x, river.points[0].y);
      for (const p of river.points.slice(1)) ctx.lineTo(p.x, p.y);
    };

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Wet earth at the edges, then the water itself, then a moving glint.
    ctx.strokeStyle = 'rgba(48, 40, 24, 0.75)';
    ctx.lineWidth = river.width * 2 + 10;
    line();
    ctx.stroke();
    ctx.strokeStyle = '#24506b';
    ctx.lineWidth = river.width * 2;
    line();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(86, 158, 196, 0.55)';
    ctx.lineWidth = river.width * 1.15;
    line();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(190, 230, 250, 0.28)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([16, 26]);
    ctx.lineDashOffset = -this.time * 26;
    line();
    ctx.stroke();
    ctx.setLineDash([]);

    for (const f of river.fords) {
      // A shallow: pale sand and stepping stones, so it reads as walkable.
      const g = ctx.createRadialGradient(f.x, f.y, f.radius * 0.2, f.x, f.y, f.radius);
      g.addColorStop(0, 'rgba(196, 176, 122, 0.92)');
      g.addColorStop(0.65, 'rgba(150, 150, 110, 0.6)');
      g.addColorStop(1, 'rgba(120, 140, 120, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(120, 112, 96, 0.85)';
      for (let i = 0; i < 7; i++) {
        const a = i * 2.3999;
        const d = f.radius * (0.2 + ((i * 5) % 9) / 16);
        ctx.beginPath();
        ctx.ellipse(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, 4.5, 3, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /**
   * When a drag hovers somewhere it cannot reach, say why on the board: the
   * line stops at whatever is standing in it. A dimmed target only says "no".
   */
  private drawBlocker(s: GameState, you: number, drag: DragPreview): void {
    const from = s.nodes[drag.fromNode];
    if (!from || from.kind === 'hive') return;
    let over: GameNode | undefined;
    let best = Infinity;
    for (const n of s.nodes) {
      const d = Math.hypot(n.x - drag.x, n.y - drag.y);
      if (d < KINDS[n.kind].radius + 22 && d < best) {
        over = n;
        best = d;
      }
    }
    if (!over || over.id === from.id || canLink(s, you, from.id, over.id)) return;

    const ctx = this.ctx;
    // Water first: if the line would have to wade, that is the reason, and it
    // is marked where the crossing would be.
    const wet = crossesWater(s, from, over);
    if (wet) {
      ctx.save();
      ctx.setLineDash([5, 6]);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(255,120,90,0.65)';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(wet.x, wet.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(wet.x, wet.y, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(wet.x - 9, wet.y - 9);
      ctx.lineTo(wet.x + 9, wet.y + 9);
      ctx.moveTo(wet.x + 9, wet.y - 9);
      ctx.lineTo(wet.x - 9, wet.y + 9);
      ctx.stroke();
      ctx.restore();

      return;
    }

    const blocker = blockedBy(s, from.id, over.id);
    if (!blocker) return;
    const rr = KINDS[blocker.kind].radius + 8;
    ctx.save();
    ctx.setLineDash([5, 6]);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,120,90,0.65)';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(blocker.x, blocker.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(blocker.x, blocker.y, rr, rr * TILT, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Ground still torn up where a trail was bitten through. Shown because the
   * five seconds it costs are the reward for gnawing, and a rule nobody can see
   * feels like the game refusing them for no reason.
   */
  private drawScars(s: GameState): void {
    const ctx = this.ctx;
    for (const x of s.severed) {
      const a = s.nodes[x.from];
      const b = s.nodes[x.to];
      if (!a || !b) continue;
      const left = Math.max(0, (x.until - s.tick) / 100);
      ctx.save();
      ctx.setLineDash([6, 12]);
      ctx.lineCap = 'butt';
      ctx.lineWidth = 9;
      // Fades as the ground recovers, so the wait is legible without a number.
      ctx.strokeStyle = `rgba(38,24,14,${0.15 + 0.4 * left})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = alpha(playerColor(x.owner), 0.15 + 0.25 * left);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
  }

  /** A trail is a track worn into the grass, not a drawn line. */
  private drawTrack(s: GameState, t: Trail): void {
    const ctx = this.ctx;
    const a = s.nodes[t.from];
    const b = s.nodes[t.to];
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * PATH_OFFSET;
    const ny = (dx / len) * PATH_OFFSET;
    const color = playerColor(t.owner);

    ctx.save();
    ctx.lineCap = 'round';
    if (t.air) {
      // A flight leaves no track: a faint dotted line, and nothing to gnaw.
      ctx.setLineDash([2, 12]);
      ctx.strokeStyle = alpha(color, 0.55);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(a.x + nx, a.y + ny);
      ctx.lineTo(b.x + nx, b.y + ny);
      ctx.stroke();
      ctx.restore();

      return;
    }

    const line = (): void => {
      ctx.beginPath();
      ctx.moveTo(a.x + nx, a.y + ny);
      ctx.lineTo(b.x + nx, b.y + ny);
    };

    // Worn earth, but unmistakably somebody's. Whose trail is which matters
    // more than realism here: on a crowded board you have to read ownership
    // without following the ants along it.
    ctx.strokeStyle = alpha(shade(color, 0.22), 0.75);
    ctx.lineWidth = 15;
    line();
    ctx.stroke();
    ctx.strokeStyle = mix(SOIL_MID, color, 0.55);
    ctx.lineWidth = 11;
    line();
    ctx.stroke();
    ctx.strokeStyle = alpha(mix(SOIL_LIGHT, color, 0.62), 0.85);
    ctx.lineWidth = 6;
    line();
    ctx.stroke();
    ctx.strokeStyle = alpha(tint(color, 0.35), 0.7);
    ctx.lineWidth = 2.5;
    line();
    ctx.stroke();

    // An arrowhead: a trail is one way, and that decides where supply flows.
    const hx = a.x + dx * 0.7 + nx;
    const hy = a.y + dy * 0.7 + ny;
    const ux = dx / len;
    const uy = dy / len;
    ctx.fillStyle = alpha(tint(color, 0.3), 0.85);
    ctx.beginPath();
    ctx.moveTo(hx + ux * 8, hy + uy * 8);
    ctx.lineTo(hx - ux * 4 - uy * 5.5, hy - uy * 4 + ux * 5.5);
    ctx.lineTo(hx - ux * 4 + uy * 5.5, hy - uy * 4 - ux * 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawDrag(s: GameState, drag: DragPreview): void {
    const ctx = this.ctx;
    const from = s.nodes[drag.fromNode];
    if (!from) return;
    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = drag.valid
      ? alpha(tint(playerColor(from.owner), 0.25), 0.95)
      : 'rgba(240,110,80,0.6)';
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
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = alpha(playerColor(a.owner), 0.45);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  /** One packet is one creature, so one packet is drawn as one body. */
  private drawCreatureAt(s: GameState, p: Packet, alphaTick: number): void {
    const a = s.nodes[p.from];
    const b = s.nodes[p.to];
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // Interpolate between sim ticks so 20 Hz logic renders at display rate.
    const boost = UNITS[p.unit].flies
      ? 1
      : 1 + SPEED_FROM_STRENGTH * Math.min(1, a.count / KINDS[a.kind].cap);
    const pos = Math.min(1, p.pos + (UNITS[p.unit].speed * boost * alphaTick) / (len * 20));
    // A little sway off the line, so a file of ants is not a ruled row of dots.
    const wobble = Math.sin(p.pos * 34 + this.time * 4) * (p.air ? 2.8 : 1.6);

    drawCreature(
      this.ctx,
      p.unit,
      a.x + dx * pos + (-dy / len) * wobble,
      a.y + dy * pos + (dx / len) * wobble,
      Math.atan2(dy, dx),
      playerColor(p.owner),
      this.time * 11 + p.pos * 40,
    );
  }

  private drawNode(s: GameState, n: GameNode, you: number, drag: DragPreview | null): void {
    const ctx = this.ctx;
    const spec = KINDS[n.kind];
    const color = playerColor(n.owner);
    const owned = n.owner !== NEUTRAL;
    const starving = owned && !s.supplied[n.id];
    const r = spec.radius;

    let dim = false;
    let target = false;
    if (drag && n.id !== drag.fromNode) {
      target = canLink(s, you, drag.fromNode, n.id);
      dim = !target;
    }

    ctx.save();
    ctx.translate(n.x, n.y);
    if (dim) ctx.globalAlpha = 0.4;

    // The owner's glow on the ground under the structure.
    if (owned) {
      const g = ctx.createRadialGradient(0, r * 0.2, r * 0.4, 0, r * 0.2, r * 1.5);
      g.addColorStop(0, alpha(color, 0.3));
      g.addColorStop(1, alpha(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.2, r * 1.5, r, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    drawStructure(ctx, n.kind, r, color, owned, this.time);

    if (owned) {
      this.drawFillRing(n, r, color, starving);
      this.drawLinkSlots(s, n, r, color);
    }

    // A player's supply root: the thing actually worth defending.
    const home = s.players.find((p) => p.alive && p.home === n.id);
    if (home) {
      ctx.strokeStyle = alpha(tint(playerColor(home.id), 0.4), 0.7);
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.ellipse(0, r * 0.16, r * 1.28, r * 0.9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (target) {
      const pulse = 0.55 + 0.45 * Math.sin(this.time * 7);
      ctx.strokeStyle = alpha(tint(playerColor(you), 0.4), 0.35 + 0.5 * pulse);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.16, r * 1.18, r * 0.82, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    this.drawBadge(n, r, color, owned, starving);
    ctx.restore();
  }

  /** The garrison, on a plate above the structure, the way the genre does it. */
  private drawBadge(
    n: GameNode,
    r: number,
    color: string,
    owned: boolean,
    starving: boolean,
  ): void {
    const ctx = this.ctx;
    const text = String(Math.floor(n.count));
    const y = -r * (n.kind === 'hive' ? 1.55 : 1.2);
    ctx.save();
    this.upright();
    ctx.font = `700 ${Math.round(r * 0.6)}px "Segoe UI", Roboto, system-ui, sans-serif`;
    const w = Math.max(r * 0.9, ctx.measureText(text).width + r * 0.44);
    const h = r * 0.64;

    ctx.translate(0, y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(ctx, -w / 2 + 1.5, -h / 2 + 2.5, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = owned ? shade(color, 0.4) : 'rgba(48,44,38,0.94)';
    roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = starving
      ? 'rgba(255,255,255,0.35)'
      : owned
        ? tint(color, 0.35)
        : 'rgba(190,182,166,0.65)';
    ctx.lineWidth = 2;
    if (starving) ctx.setLineDash([4, 4]);
    roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 3;
    ctx.fillText(text, 0, 0.5);
    ctx.restore();
  }

  /**
   * How full a node is, as a gauge round its foot. Without it the only evidence
   * of growth is a number ticking over, which reads as nothing happening.
   */
  private drawFillRing(n: GameNode, r: number, color: string, starving: boolean): void {
    const ctx = this.ctx;
    const frac = Math.max(0, Math.min(1, n.count / KINDS[n.kind].cap));
    if (frac <= 0.001) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.22, r * 1.08, r * 0.7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = starving ? alpha(color, 0.45) : alpha(tint(color, 0.45), 0.95);
    ctx.beginPath();
    ctx.ellipse(0, r * 0.22, r * 1.08, r * 0.7, 0, Math.PI / 2, Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
    ctx.restore();
  }

  /** Trails this node can still feed, as dots under it. */
  private drawLinkSlots(s: GameState, n: GameNode, r: number, color: string): void {
    const ctx = this.ctx;
    const total = KINDS[n.kind].links;
    const used = outgoing(s, n.id);
    const gap = 9;
    const y = r * 1.02;
    ctx.save();
    this.upright();
    for (let i = 0; i < total; i++) {
      const x = (i - (total - 1) / 2) * gap;
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      if (i < used) {
        ctx.fillStyle = alpha(tint(color, 0.3), 0.95);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fill();
        ctx.strokeStyle = alpha(color, 0.6);
        ctx.lineWidth = 1.4;
      }
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
    const load = s.packets.reduce(
      (acc, p) => (p.from === t.from && p.to === t.to && p.owner === t.owner ? acc + p.amount : acc),
      0,
    );
    const cost = Math.min(9, 1 + load * 0.22);
    const frac = Math.max(0, Math.min(1, t.chew / cost));

    ctx.save();
    ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
    ctx.fillStyle = 'rgba(18,14,10,0.85)';
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ffc23d';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
    // Bite marks widening as the track gives way.
    ctx.strokeStyle = 'rgba(255,194,61,0.85)';
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 3; i++) {
      const a2 = (Math.PI * 2 * i) / 3 + frac * 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a2) * 4, Math.sin(a2) * 4);
      ctx.lineTo(Math.cos(a2) * (5 + frac * 6), Math.sin(a2) * (5 + frac * 6));
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
        const rise = (1 - k) * 36;
        ctx.globalAlpha = Math.min(1, k * 2.2);
        ctx.translate(e.x, e.y);
        this.upright();
        ctx.translate(0, -58 - rise);
        ctx.font = '800 22px "Segoe UI", Roboto, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4.5;
        ctx.strokeStyle = 'rgba(10,14,8,0.92)';
        ctx.strokeText(e.text ?? '', 0, 0);
        ctx.fillStyle = e.color;
        ctx.fillText(e.text ?? '', 0, 0);
        ctx.restore();
        continue;
      }
      ctx.translate(e.x, e.y);
      if (e.kind === 'capture') {
        // Dust thrown up as the nest changes hands.
        const rad = 26 + (1 - k) * 46;
        ctx.strokeStyle = alpha(e.color, k * 0.85);
        ctx.lineWidth = 3.5 * k + 1;
        ctx.beginPath();
        ctx.ellipse(0, 0, rad, rad * TILT, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(158,132,96,${k * 0.5})`;
        for (let j = 0; j < 8; j++) {
          const a = (Math.PI * 2 * j) / 8 + j;
          const d = (1 - k) * 44;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * d, Math.sin(a) * d * TILT, 5 * k + 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (e.kind === 'snap') {
        // Torn earth, not merely a deleted line.
        ctx.strokeStyle = `rgba(150,120,80,${k})`;
        ctx.lineWidth = 3;
        for (let j = 0; j < 7; j++) {
          const a = (Math.PI * 2 * j) / 7 + j;
          const d = (1 - k) * 36;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d * TILT);
          ctx.lineTo(Math.cos(a) * (d + 10), Math.sin(a) * (d + 10) * TILT);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = `rgba(255,241,201,${k * 0.55})`;
        ctx.beginPath();
        ctx.arc(0, 0, 4 + (1 - k) * 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${k * 0.95})`;
        for (let j = 0; j < 6; j++) {
          const a = (Math.PI * 2 * j) / 6 + j * 1.7;
          const d = (1 - k) * 18;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 1.9 * k + 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
