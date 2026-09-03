import {
  Bird,
  FIELD_H,
  FIELD_W,
  Flight,
  FoodId,
  GROUND_Y,
  MatchState,
  Prop,
  START_HP,
} from '@pigeons/shared';

/**
 * Everything the player sees.
 *
 * The look is the same one the ants game uses: light from the top left, shadows
 * cast down and to the right, and nothing flat that could be given volume
 * instead. For a game aimed at children that is not decoration -- a bird that
 * reads as a solid object on a solid ledge is a bird whose position you can
 * judge, and judging position is the whole game.
 *
 * The sky and the city never change, so they are painted once into an offscreen
 * canvas and blitted. Repainting them every frame cost two thirds of the frame
 * budget when this was first measured on the demo page.
 */

const TAU = Math.PI * 2;

export interface Splat {
  x: number;
  y: number;
  food: FoodId;
  born: number;
}

export interface Fleck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  tint: string;
}

/** What the player is doing right now, handed in each frame. */
export interface Hud {
  you: number;
  /** The arc being dragged out, flown through the real physics. */
  preview: Flight | null;
  /** Flights being played back, and how far along they are. */
  flights: Flight[];
  flightAt: number;
  splats: Splat[];
  flecks: Fleck[];
  /** Slot to how recently it was hit, 1 fading to 0. */
  flash: Map<number, number>;
  /** Slots knocked off, and how far they have fallen. */
  falling: Map<number, number>;
  wind: number;
  time: number;
}

const FOOD_TINT: Record<FoodId, [string, string]> = {
  seed: ['#a8763c', '#6b4620'],
  melon: ['#e0574f', '#8d2f2c'],
  pepper: ['#d9432f', '#7e1f14'],
  icecream: ['#f2e3d0', '#bda184'],
};

const SEAT_TINT: [string, string][] = [
  ['#7d8fa0', '#3d4855'],
  ['#a8837d', '#59403c'],
  ['#87a07d', '#41553c'],
  ['#9d8fa8', '#4d4258'],
];

export class View {
  private readonly ctx: CanvasRenderingContext2D;
  private sky: HTMLCanvasElement | null = null;
  /** World units per css pixel, and where the world sits in the canvas. */
  private scale = 1;
  private offX = 0;
  private offY = 0;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d unavailable');
    this.ctx = ctx;
  }

  /** Fits the world into the canvas, letterboxed, without ever stretching it. */
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(rect.width * this.dpr);
    const h = Math.round(rect.height * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.cssW = rect.width;
    this.cssH = rect.height;
    this.scale = Math.min(rect.width / FIELD_W, rect.height / FIELD_H);
    this.offX = (rect.width - FIELD_W * this.scale) / 2;
    this.offY = (rect.height - FIELD_H * this.scale) / 2;
  }

  /**
   * @param clientX page coordinate
   * @param clientY page coordinate
   * @return the same point in world units
   */
  toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();

    return {
      x: (clientX - rect.left - this.offX) / this.scale,
      y: (clientY - rect.top - this.offY) / this.scale,
    };
  }

  draw(s: MatchState, hud: Hud): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    ctx.save();
    ctx.translate(this.offX, this.offY);
    ctx.scale(this.scale, this.scale);

    if (!this.sky) this.sky = bakeSky();
    ctx.drawImage(this.sky, 0, 0, FIELD_W, FIELD_H);

    drawWind(ctx, hud.wind, hud.time);
    for (const prop of s.props) drawProp(ctx, prop);
    for (const splat of hud.splats) drawSplat(ctx, splat, hud.time);

    for (const bird of s.birds) {
      const fall = hud.falling.get(bird.slot) ?? 0;
      if (!bird.alive && fall <= 0) continue;
      drawBird(ctx, bird, s, hud, fall);
    }
    for (const bird of s.birds) {
      if (!bird.alive) continue;
      drawHealth(ctx, bird, bird.slot === hud.you);
    }

    if (hud.preview) drawGhostArc(ctx, hud.preview);
    for (const flight of hud.flights) drawFlight(ctx, flight, hud.flightAt);
    for (const fleck of hud.flecks) {
      ctx.globalAlpha = Math.max(0, Math.min(1, fleck.life));
      ctx.fillStyle = fleck.tint;
      ctx.beginPath();
      ctx.arc(fleck.x, fleck.y, fleck.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

/** The sky, the sun and the city never move, so they are painted once. */
function bakeSky(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = FIELD_W * 2;
  c.height = FIELD_H * 2;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.setTransform(2, 0, 0, 2, 0, 0);

  let g = ctx.createLinearGradient(0, 0, 0, FIELD_H);
  g.addColorStop(0, '#6ea3c4');
  g.addColorStop(0.46, '#b9c9c4');
  g.addColorStop(0.72, '#e6c98f');
  g.addColorStop(1, '#f0d9a6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);

  g = ctx.createRadialGradient(640, 150, 6, 640, 150, 150);
  g.addColorStop(0, 'rgba(255,244,208,0.95)');
  g.addColorStop(1, 'rgba(255,244,208,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(640, 150, 150, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fdf2c8';
  ctx.beginPath();
  ctx.arc(640, 150, 22, 0, TAU);
  ctx.fill();

  // Two ranks of rooftops: the far one hazy, the near one solid, so the
  // playfield reads as sitting in front of a city rather than on a poster.
  const far = [30, 96, 168, 250, 322, 400, 486, 560, 640, 720];
  ctx.fillStyle = 'rgba(120,140,158,0.34)';
  for (let i = 0; i < far.length; i++) {
    const h = 70 + ((i * 37) % 60);
    ctx.fillRect(far[i], GROUND_Y - h, 58, h);
  }
  const near = [0, 88, 190, 268, 372, 470, 556, 660, 742];
  for (let i = 0; i < near.length; i++) {
    const h = 44 + ((i * 53) % 42);
    const x = near[i];
    const top = GROUND_Y - h;
    const bg = ctx.createLinearGradient(x, top, x + 72, top + h);
    bg.addColorStop(0, '#8e9099');
    bg.addColorStop(1, '#5c6068');
    ctx.fillStyle = bg;
    ctx.fillRect(x, top, 72, h);
    ctx.fillStyle = 'rgba(255,246,214,0.42)';
    for (let r = 0; r < Math.floor(h / 22); r++) {
      for (let col = 0; col < 2; col++) {
        if ((i * 7 + r * 3 + col) % 3 === 0) continue;
        ctx.fillRect(x + 12 + col * 34, top + 10 + r * 22, 12, 12);
      }
    }
    // A lip along the top edge, lit from the left like everything else.
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x, top, 72, 3);
  }

  ctx.fillStyle = '#4b4f55';
  ctx.fillRect(0, GROUND_Y, FIELD_W, FIELD_H - GROUND_Y);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(0, GROUND_Y, FIELD_W, 3);

  return c;
}

function drawWind(ctx: CanvasRenderingContext2D, wind: number, time: number): void {
  const strength = Math.abs(wind);
  if (strength < 0.04) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.36)';
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const len = 16 + strength * 46;
    const y = 22 + i * 13;
    const drift = (time * wind * 90 + i * 137) % (FIELD_W + 200);
    const x = wind > 0 ? drift - 100 : FIELD_W + 100 - drift;
    ctx.lineWidth = 1.4 + strength * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len * Math.sign(wind), y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawProp(ctx: CanvasRenderingContext2D, prop: Prop): void {
  ctx.save();
  if (!prop.intact) {
    // Rubble: still there to look at, but it stops nothing, so it is drawn
    // slumped and dull rather than removed. A prop that vanishes leaves the
    // player wondering what the shot went through.
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = '#5a5148';
    ctx.beginPath();
    ctx.ellipse(prop.x + prop.w / 2, prop.y + prop.h, prop.w * 0.5, prop.h * 0.42, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    return;
  }

  // A post down to the street. Without it every ledge and awning floated, and
  // a player cannot judge the height of something that is not standing on
  // anything -- which is the one judgement this game asks for.
  const foot = prop.y + prop.h;
  if (foot < GROUND_Y - 8) {
    // Deliberately a thin pole, not a pillar. Only the prop's own box stops a
    // shot, so anything that looked solid here would be lying: the player
    // would aim around a wall that is not there.
    const mid = prop.x + prop.w / 2;
    const post = ctx.createLinearGradient(mid - 3, 0, mid + 3, 0);
    post.addColorStop(0, '#6d665c');
    post.addColorStop(0.4, '#484239');
    post.addColorStop(1, '#2f2a24');
    ctx.fillStyle = post;
    ctx.beginPath();
    ctx.moveTo(mid - 2.6, foot - 2);
    ctx.lineTo(mid + 2.6, foot - 2);
    ctx.lineTo(mid + 3.6, GROUND_Y);
    ctx.lineTo(mid - 3.6, GROUND_Y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(35,31,26,0.7)';
    ctx.beginPath();
    ctx.ellipse(mid, GROUND_Y, 8, 2.6, 0, 0, TAU);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(30,34,40,0.24)';
  ctx.beginPath();
  ctx.ellipse(prop.x + prop.w / 2 + 5, prop.y + prop.h + 4, prop.w * 0.52, 5, 0, 0, TAU);
  ctx.fill();

  const warm = prop.kind === 'awning';
  const g = ctx.createLinearGradient(prop.x, prop.y, prop.x + prop.w * 0.6, prop.y + prop.h);
  g.addColorStop(0, warm ? '#d0684f' : '#9c9287');
  g.addColorStop(1, warm ? '#7d3626' : '#5d564d');
  ctx.fillStyle = g;
  round(ctx, prop.x, prop.y, prop.w, prop.h, 4);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,248,232,0.34)';
  round(ctx, prop.x, prop.y, prop.w, 3, 2);
  ctx.fill();

  // Wear shows before a prop breaks, so a hit never feels like it did nothing.
  const worn = 1 - Math.max(0, Math.min(1, prop.hp / 150));
  if (worn > 0.05) {
    ctx.globalAlpha = worn * 0.5;
    ctx.fillStyle = '#2f2820';
    for (let i = 0; i < 5; i++) {
      const px = prop.x + ((i * 37) % prop.w);
      ctx.beginPath();
      ctx.arc(px, prop.y + prop.h * 0.6, 1.8, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawBird(
  ctx: CanvasRenderingContext2D,
  bird: Bird,
  s: MatchState,
  hud: Hud,
  fall: number,
): void {
  // Face whoever is closest: a bird looking at its target says who it is for.
  let facing = 1;
  let near = Infinity;
  for (const other of s.birds) {
    if (other.slot === bird.slot || !other.alive) continue;
    const d = Math.abs(other.x - bird.x);
    if (d < near) {
      near = d;
      facing = other.x >= bird.x ? 1 : -1;
    }
  }

  const bob = bird.alive ? Math.sin(hud.time * 2 + bird.slot * 1.7) * 1.6 : 0;
  const flash = hud.flash.get(bird.slot) ?? 0;
  const tint = SEAT_TINT[bird.slot % SEAT_TINT.length];

  ctx.save();
  ctx.translate(bird.x, bird.y + bob + fall * fall * 2.2);
  if (fall > 0) ctx.rotate(fall * 0.16);
  ctx.scale(facing, 1);

  ctx.fillStyle = 'rgba(25,30,36,0.28)';
  ctx.beginPath();
  ctx.ellipse(3, 16, 15, 4, 0, 0, TAU);
  ctx.fill();

  // Legs first: they belong behind the body.
  ctx.strokeStyle = '#c98a3a';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-3, 8);
  ctx.lineTo(-4, 15);
  ctx.moveTo(4, 8);
  ctx.lineTo(5, 15);
  ctx.stroke();

  // Tail, then body, then wing: each one lit from the top left.
  ctx.fillStyle = tint[1];
  ctx.beginPath();
  ctx.moveTo(-9, -2);
  ctx.quadraticCurveTo(-24, -4, -28, 3);
  ctx.quadraticCurveTo(-20, 8, -8, 5);
  ctx.closePath();
  ctx.fill();

  let g = ctx.createRadialGradient(-6, -8, 2, 0, 0, 24);
  g.addColorStop(0, tint[0]);
  g.addColorStop(1, tint[1]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 13, -0.1, 0, TAU);
  ctx.fill();

  g = ctx.createLinearGradient(-8, -6, 6, 10);
  g.addColorStop(0, tint[1]);
  g.addColorStop(1, 'rgba(20,24,30,0.5)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(1, 2, 12, 7, 0.16, 0, TAU);
  ctx.fill();

  // Head
  g = ctx.createRadialGradient(8, -14, 1, 11, -11, 13);
  g.addColorStop(0, '#c3d0da');
  g.addColorStop(1, tint[0]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(11, -11, 9.5, 0, TAU);
  ctx.fill();

  // The neck is where a pigeon is actually iridescent, so it gets the one
  // saturated colour on the whole bird.
  ctx.globalAlpha = 0.55;
  g = ctx.createLinearGradient(4, -6, 14, 2);
  g.addColorStop(0, '#3f9d7a');
  g.addColorStop(1, '#7a4f9d');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(7, -4, 6.5, 5, -0.3, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#e0a03c';
  ctx.beginPath();
  ctx.moveTo(19, -12);
  ctx.lineTo(27, -10);
  ctx.lineTo(19, -7.5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#1b2027';
  ctx.beginPath();
  ctx.arc(15, -13.5, 2.4, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(14.2, -14.3, 0.9, 0, TAU);
  ctx.fill();

  // Rim light along the lit edge, the same trick the ants game uses.
  ctx.strokeStyle = 'rgba(255,244,220,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(-1, -1.5, 18, 13, -0.1, Math.PI * 1.05, Math.PI * 1.85);
  ctx.stroke();

  if (flash > 0) {
    ctx.globalAlpha = flash * 0.7;
    ctx.fillStyle = '#fff0f0';
    ctx.beginPath();
    ctx.ellipse(0, 0, 21, 16, -0.1, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawHealth(ctx: CanvasRenderingContext2D, bird: Bird, mine: boolean): void {
  const w = 46;
  const x = bird.x - w / 2;
  const y = bird.y - 38;
  const part = Math.max(0, Math.min(1, bird.hp / START_HP));

  ctx.save();
  ctx.fillStyle = 'rgba(18,22,28,0.5)';
  round(ctx, x - 1.5, y - 1.5, w + 3, 9, 4.5);
  ctx.fill();

  const g = ctx.createLinearGradient(x, y, x, y + 6);
  const hot = part > 0.55 ? ['#8fd06a', '#4e9a3a'] : part > 0.28 ? ['#f0c246', '#b8862a'] : ['#ef6a52', '#a83322'];
  g.addColorStop(0, hot[0]);
  g.addColorStop(1, hot[1]);
  ctx.fillStyle = g;
  round(ctx, x, y, Math.max(3, w * part), 6, 3);
  ctx.fill();

  if (mine) {
    // One mark on the whole board says which bird is yours. Anything more and
    // a child has to be told; anything less and they have to guess.
    ctx.fillStyle = '#ffd96b';
    ctx.beginPath();
    ctx.moveTo(bird.x, y - 5);
    ctx.lineTo(bird.x - 5, y - 12);
    ctx.lineTo(bird.x + 5, y - 12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** The arc the player is dragging out, flown through the real physics. */
function drawGhostArc(ctx: CanvasRenderingContext2D, flight: Flight): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.setLineDash([2, 9]);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < flight.points.length; i += 3) {
    const p = flight.points[i];
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  const end = flight.end;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(end.x, end.y, 7, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawFlight(ctx: CanvasRenderingContext2D, flight: Flight, at: number): void {
  const i = Math.min(flight.points.length - 1, Math.floor(at));
  const p = flight.points[i];
  if (!p) return;

  // A short trail behind, so the eye can follow something moving this fast.
  ctx.save();
  ctx.strokeStyle = 'rgba(120,84,44,0.35)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let k = Math.max(0, i - 26); k <= i; k += 2) {
    const q = flight.points[k];
    if (k === Math.max(0, i - 26)) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  }
  ctx.stroke();

  ctx.translate(p.x, p.y);
  ctx.rotate(i * 0.09);
  ctx.fillStyle = 'rgba(25,30,36,0.2)';
  ctx.beginPath();
  ctx.arc(1.5, 1.5, 8, 0, TAU);
  ctx.fill();
  const g = ctx.createRadialGradient(-3, -4, 1, 0, 0, 10);
  g.addColorStop(0, '#b98a52');
  g.addColorStop(1, '#6b4620');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 6.5, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(1, -5, 5.4, 4.2, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawSplat(ctx: CanvasRenderingContext2D, splat: Splat, time: number): void {
  const age = time - splat.born;
  const grow = Math.min(1, age * 6);
  const tint = FOOD_TINT[splat.food];
  ctx.save();
  ctx.translate(splat.x, splat.y);
  ctx.globalAlpha = Math.max(0, 1 - age / 6);
  const g = ctx.createRadialGradient(-2, -2, 1, 0, 0, 16 * grow);
  g.addColorStop(0, tint[0]);
  g.addColorStop(1, tint[1]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, 15 * grow, 7 * grow, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-13 * grow, 3 * grow, 4.5 * grow, 2.2 * grow, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(14 * grow, -2 * grow, 3.6 * grow, 1.9 * grow, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Older phone browsers still trip over ctx.roundRect, so the path is drawn. */
function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.arcTo(x + w, y, x + w, y + rad, rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
  ctx.lineTo(x + rad, y + h);
  ctx.arcTo(x, y + h, x, y + h - rad, rad);
  ctx.lineTo(x, y + rad);
  ctx.arcTo(x, y, x + rad, y, rad);
  ctx.closePath();
}

export { FOOD_TINT };
