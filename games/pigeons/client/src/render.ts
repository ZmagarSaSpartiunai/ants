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
 * Light comes from the top left and shadows fall down and to the right, the
 * same rule the ants game follows. For a game aimed at children that is not
 * decoration: a bird that reads as a solid object on a solid ledge is a bird
 * whose position can be judged, and judging position is the whole game.
 *
 * The sky and the city never change, so they are painted once into an offscreen
 * canvas and blitted. Repainting them every frame cost two thirds of the frame
 * budget when that was first measured.
 */

const TAU = Math.PI * 2;

/**
 * The line that holds the bird together.
 *
 * Without it the shapes were only gradients meeting other gradients, and
 * against a pale sky the whole bird read as half transparent. A drawn animal
 * for children needs an edge.
 */
const CONTOUR = 'rgba(26,31,40,0.85)';

/** What the bird is shown eating, matching the buttons under the field. */
const FOOD_GLYPH: Record<FoodId, string> = {
  seed: '\u{1F33E}',
  melon: '\u{1F349}',
  pepper: '\u{1F336}',
  icecream: '\u{1F366}',
};

/** Where a splat stuck. It is drawn relative to whatever it landed on. */
export type Anchor =
  | { kind: 'prop'; id: number }
  | { kind: 'bird'; slot: number }
  | { kind: 'ground' };

export interface Decal {
  anchor: Anchor;
  /** World position for the ground, otherwise an offset from what it stuck to. */
  x: number;
  y: number;
  food: FoodId;
  born: number;
  seed: number;
  /** How far the drip below it has run, 0..1. */
  run: number;
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
  /** The arc being dragged out, deliberately cut short. */
  preview: Flight | null;
  /** How hard the throw would be, 0..1, while dragging. */
  power: number;
  /** Which way the throw points while dragging. */
  aimAngle: number;
  /** Flights being played back, and how far along they are. */
  flights: Flight[];
  flightAt: number;
  decals: Decal[];
  flecks: Fleck[];
  /** Health as the player sees it, which lags the truth until a shot lands. */
  shown: number[];
  /** Slot to how recently it was hit, 1 fading to 0. */
  flash: Map<number, number>;
  /** Slots knocked off, and how far they have fallen. */
  falling: Map<number, number>;
  /** How far a bird has been knocked back, and how it is tumbling. */
  recoil: Map<number, { x: number; y: number; spin: number }>;
  /** The bird is swallowing: 0 just started, 1 done. */
  chewing: { slot: number; food: FoodId; t: number } | null;
  /** A shot is loaded and sitting on the ledge, ready to be thrown. */
  loaded: FoodId | null;
  wind: number;
  time: number;
}

export const FOOD_TINT: Record<FoodId, [string, string]> = {
  seed: ['#a8763c', '#5f3d1c'],
  melon: ['#e0574f', '#7d2724'],
  pepper: ['#d9432f', '#6e1a11'],
  icecream: ['#f2e3d0', '#a98e73'],
};

const SEAT_TINT: [string, string][] = [
  ['#8494a4', '#3b4552'],
  ['#b08a83', '#57403c'],
  ['#8ba381', '#41553c'],
  ['#a091ac', '#4d4258'],
];

/**
 * How much of the arc the preview gives away.
 *
 * Showing the whole flight down to a marker on the landing point turned aiming
 * into reading an answer off the screen. You get the launch and the first bend
 * of the curve -- enough to learn what the wind is doing to you, not enough to
 * be told where it ends.
 */
const PREVIEW_STEPS = 62;

interface Leaf {
  x: number;
  y: number;
  spin: number;
  size: number;
  drift: number;
  tint: string;
}

export class View {
  private readonly ctx: CanvasRenderingContext2D;
  private sky: HTMLCanvasElement | null = null;
  private leaves: Leaf[] = [];
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
    this.seedLeaves();
  }

  private seedLeaves(): void {
    const tints = ['#c98a3a', '#b06a2c', '#8fa347', '#d8b054', '#a8562c'];
    for (let i = 0; i < 18; i++) {
      this.leaves.push({
        x: Math.random() * FIELD_W,
        y: 14 + Math.random() * (GROUND_Y - 40),
        spin: Math.random() * TAU,
        size: 3.4 + Math.random() * 3.6,
        drift: 0.55 + Math.random() * 0.9,
        tint: tints[i % tints.length],
      });
    }
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

  toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();

    return {
      x: (clientX - rect.left - this.offX) / this.scale,
      y: (clientY - rect.top - this.offY) / this.scale,
    };
  }

  /** Moves the drifting litter. Visual only, so plain Math.random is fine here. */
  private blow(wind: number, dt: number): void {
    for (const leaf of this.leaves) {
      leaf.x += wind * leaf.drift * 62 * dt;
      leaf.y += Math.sin(leaf.spin * 1.7) * 5 * dt + 5 * dt;
      leaf.spin += (0.6 + Math.abs(wind) * 2.6) * leaf.drift * dt;
      if (leaf.y > GROUND_Y - 6) leaf.y = 12;
      if (leaf.x < -14) leaf.x = FIELD_W + 12;
      if (leaf.x > FIELD_W + 14) leaf.x = -12;
    }
  }

  draw(s: MatchState, hud: Hud, dt: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    ctx.save();
    ctx.translate(this.offX, this.offY);
    ctx.scale(this.scale, this.scale);

    if (!this.sky) this.sky = bakeSky();
    ctx.drawImage(this.sky, 0, 0, FIELD_W, FIELD_H);

    this.blow(hud.wind, dt);
    for (const leaf of this.leaves) drawLeaf(ctx, leaf);

    for (const prop of s.props) drawProp(ctx, prop);
    for (const decal of hud.decals) {
      if (decal.anchor.kind === 'bird') continue;
      drawDecal(ctx, decal, s, hud.time);
    }

    for (const bird of s.birds) {
      const fall = hud.falling.get(bird.slot) ?? 0;
      if (!bird.alive && fall <= 0) continue;
      const windup = bird.slot === hud.you ? hud.power : 0;
      drawBird(ctx, bird, s, hud, fall, windup);
      if (hud.chewing && hud.chewing.slot === bird.slot) drawChew(ctx, bird, hud.chewing);
      if (bird.slot === hud.you && hud.loaded && hud.power === 0) drawLoaded(ctx, bird, hud.time);
    }
    for (const bird of s.birds) {
      if (!bird.alive) continue;
      drawHealth(ctx, bird, hud.shown[bird.slot] ?? bird.hp, bird.slot === hud.you);
    }

    if (hud.preview) drawGhostArc(ctx, hud.preview);
    if (hud.power > 0) drawPower(ctx, s.birds[hud.you], hud.power, hud.aimAngle);
    for (const flight of hud.flights) drawFlight(ctx, flight, hud.flightAt);

    for (const fleck of hud.flecks) {
      ctx.globalAlpha = Math.max(0, Math.min(1, fleck.life));
      ctx.fillStyle = fleck.tint;
      ctx.beginPath();
      ctx.arc(fleck.x, fleck.y, fleck.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawWindGauge(ctx, hud.wind);
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
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x, top, 72, 3);
  }

  ctx.fillStyle = '#4b4f55';
  ctx.fillRect(0, GROUND_Y, FIELD_W, FIELD_H - GROUND_Y);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(0, GROUND_Y, FIELD_W, 3);

  return c;
}

/**
 * The wind you can see.
 *
 * Litter blowing across the sky says which way and roughly how hard, the way it
 * does in Worms. The gauge says it exactly -- but the leaves are what a child
 * reads without being taught to.
 */
function drawLeaf(ctx: CanvasRenderingContext2D, leaf: Leaf): void {
  ctx.save();
  ctx.translate(leaf.x, leaf.y);
  ctx.rotate(leaf.spin);
  // Foreshortened as it tumbles, so it reads as a flat thing turning over.
  ctx.scale(1, Math.abs(Math.cos(leaf.spin * 1.3)) * 0.8 + 0.2);
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = leaf.tint;
  ctx.beginPath();
  ctx.moveTo(-leaf.size, 0);
  ctx.quadraticCurveTo(0, -leaf.size * 0.85, leaf.size, 0);
  ctx.quadraticCurveTo(0, leaf.size * 0.85, -leaf.size, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,42,20,0.5)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-leaf.size, 0);
  ctx.lineTo(leaf.size, 0);
  ctx.stroke();
  ctx.restore();
}

function drawWindGauge(ctx: CanvasRenderingContext2D, wind: number): void {
  const cx = FIELD_W / 2;
  const y = 15;
  const half = 62;
  ctx.save();
  ctx.fillStyle = 'rgba(16,22,28,0.34)';
  round(ctx, cx - half - 4, y - 6, (half + 4) * 2, 12, 6);
  ctx.fill();

  const w = Math.max(-1, Math.min(1, wind));
  const len = Math.abs(w) * half;
  if (len > 1) {
    const g = ctx.createLinearGradient(cx, 0, cx + Math.sign(w) * half, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, Math.abs(w) > 0.66 ? '#ef8a5c' : '#8fd0e0');
    ctx.fillStyle = g;
    round(ctx, w > 0 ? cx : cx - len, y - 3, len, 6, 3);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(cx - 0.9, y - 7, 1.8, 14);
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

  // Deliberately a thin pole, not a pillar. Only the prop's own box stops a
  // shot, so anything that looked solid here would be lying: the player would
  // aim around a wall that is not there.
  const foot = prop.y + prop.h;
  if (foot < GROUND_Y - 8) {
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
  windup: number,
): void {
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
  // Blinks are the cheapest thing that makes a drawn animal look alive.
  const blink = (hud.time * 0.7 + bird.slot * 2.3) % 4 > 3.88;

  const kick = hud.recoil.get(bird.slot);
  ctx.save();
  ctx.translate(bird.x + (kick?.x ?? 0), bird.y + bob + fall * fall * 2.2 + (kick?.y ?? 0));
  if (kick) ctx.rotate(kick.spin);
  if (fall > 0) ctx.rotate(fall * 0.16);
  ctx.scale(facing, 1);
  // Winding up: the bird leans back as the throw is pulled, so the force in
  // your finger shows on the bird itself and not only on a gauge.
  if (windup > 0) ctx.rotate(-windup * 0.3);

  ctx.fillStyle = 'rgba(25,30,36,0.28)';
  ctx.beginPath();
  ctx.ellipse(3, 16, 15, 4, 0, 0, TAU);
  ctx.fill();

  // Feet gripping the ledge: toes forward and one back, not two sticks.
  ctx.strokeStyle = '#c9803a';
  ctx.lineWidth = 2.1;
  ctx.lineCap = 'round';
  for (const legX of [-3, 4]) {
    ctx.beginPath();
    ctx.moveTo(legX, 7);
    ctx.lineTo(legX + 1, 14);
    ctx.moveTo(legX + 1, 14);
    ctx.lineTo(legX + 5, 15.5);
    ctx.moveTo(legX + 1, 14);
    ctx.lineTo(legX - 3, 15.5);
    ctx.stroke();
  }

  // Tail, with the feathers separated rather than one slab.
  ctx.fillStyle = tint[1];
  ctx.beginPath();
  ctx.moveTo(-9, -2);
  ctx.quadraticCurveTo(-24, -5, -30, 3);
  ctx.quadraticCurveTo(-20, 9, -8, 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = CONTOUR;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(20,24,30,0.45)';
  ctx.lineWidth = 0.9;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-11, i * 1.6);
    ctx.lineTo(-28, 1.4 + i * 2.4);
    ctx.stroke();
  }

  // The gradient has to reach the dark tone by the time it reaches the edge.
  // Run out to 25 on an 18-wide body and the rim never darkens, so the bird
  // had no edge at all and read as translucent.
  let g = ctx.createRadialGradient(-6, -9, 2, 0, 0, 19);
  g.addColorStop(0, tint[0]);
  g.addColorStop(1, tint[1]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 13, -0.1, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = CONTOUR;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Pale breast catching the light from the left.
  ctx.globalAlpha = 0.32;
  g = ctx.createRadialGradient(7, 3, 1, 8, 4, 9);
  g.addColorStop(0, '#e8e2d6');
  g.addColorStop(1, 'rgba(232,226,214,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(8, 4, 8, 6.5, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Folded wing: a plate, three primaries laid over it, and the two bars that
  // say pigeon rather than generic bird.
  g = ctx.createLinearGradient(-9, -7, 6, 10);
  g.addColorStop(0, tint[1]);
  g.addColorStop(1, 'rgba(20,24,30,0.55)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 1, 13, 8, 0.14, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(12,16,22,0.55)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-2 - i * 2.4, 3 + i * 0.6);
    ctx.quadraticCurveTo(-12 - i * 2, 5 + i, -17 - i * 2.6, 3.5 + i * 1.6);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(24,28,36,0.6)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-6, -2.5);
  ctx.lineTo(6, -1.2);
  ctx.moveTo(-7, 1.5);
  ctx.lineTo(5, 2.6);
  ctx.stroke();

  g = ctx.createRadialGradient(8, -15, 1, 11, -11, 14);
  g.addColorStop(0, '#cdd8e0');
  g.addColorStop(1, tint[0]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(11, -11.5, 9.6, 9, -0.1, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = CONTOUR;
  ctx.lineWidth = 2;
  ctx.stroke();

  // The neck is where a pigeon is actually iridescent, so it carries the one
  // saturated colour on the whole bird.
  ctx.globalAlpha = 0.6;
  g = ctx.createLinearGradient(3, -7, 15, 3);
  g.addColorStop(0, '#3f9d7a');
  g.addColorStop(0.55, '#5f7fb0');
  g.addColorStop(1, '#8a4f9d');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(7, -4, 7, 5.4, -0.3, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Beak, with the pale cere at its base.
  ctx.fillStyle = '#463c33';
  ctx.beginPath();
  ctx.moveTo(19, -13);
  ctx.quadraticCurveTo(27, -12, 28, -10.4);
  ctx.quadraticCurveTo(24, -8.6, 19, -9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e7e0d4';
  ctx.beginPath();
  ctx.ellipse(19.5, -13.4, 3, 2, -0.2, 0, TAU);
  ctx.fill();

  ctx.fillStyle = '#e8a838';
  ctx.beginPath();
  ctx.arc(14.6, -13.6, 3.1, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#171b21';
  ctx.beginPath();
  if (blink) ctx.ellipse(14.6, -13.6, 3.1, 0.5, 0, 0, TAU);
  else ctx.arc(14.9, -13.6, 1.9, 0, TAU);
  ctx.fill();
  if (!blink) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(14.1, -14.4, 0.8, 0, TAU);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(255,244,220,0.3)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(-1.5, -2, 17, 12, -0.1, Math.PI * 1.15, Math.PI * 1.7);
  ctx.stroke();

  // Whatever has been thrown at this bird stays on it for the rest of the match.
  // Smeared rather than stuck on: a round lump on a round bird looked like it
  // was wearing a hat, not like it had been hit.
  for (const decal of hud.decals) {
    if (decal.anchor.kind !== 'bird' || decal.anchor.slot !== bird.slot) continue;
    const pair = FOOD_TINT[decal.food];
    ctx.save();
    ctx.translate(decal.x, decal.y);
    ctx.rotate(0.25 + Math.sin(decal.seed) * 0.4);
    ctx.fillStyle = pair[1];
    ctx.beginPath();
    ctx.ellipse(0, 0, 7.5, 3.4, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-6, 1.4, 2.6, 1.5, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(6.6, -0.8, 2.1, 1.3, 0, 0, TAU);
    ctx.fill();
    // A run heading down the feathers.
    ctx.beginPath();
    ctx.moveTo(-1.6, 1.4);
    ctx.lineTo(1.6, 1.4);
    ctx.quadraticCurveTo(1.2, 6.4, 0, 7.4);
    ctx.quadraticCurveTo(-1.2, 6.4, -1.6, 1.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pair[0];
    ctx.beginPath();
    ctx.ellipse(-1.2, -1, 3.4, 1.5, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

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

function drawHealth(ctx: CanvasRenderingContext2D, bird: Bird, shown: number, mine: boolean): void {
  const w = 46;
  const x = bird.x - w / 2;
  const y = bird.y - 40;
  const part = Math.max(0, Math.min(1, shown / START_HP));
  const real = Math.max(0, Math.min(1, bird.hp / START_HP));

  ctx.save();
  ctx.fillStyle = 'rgba(18,22,28,0.5)';
  round(ctx, x - 1.5, y - 1.5, w + 3, 9, 4.5);
  ctx.fill();

  // Damage already dealt but not yet caught up with, drawn pale behind the bar
  // so a hit reads as a drain rather than a jump.
  if (real < part - 0.005) {
    ctx.fillStyle = 'rgba(255,150,120,0.55)';
    round(ctx, x, y, Math.max(2, w * part), 6, 3);
    ctx.fill();
  }

  const g = ctx.createLinearGradient(x, y, x, y + 6);
  const hot = part > 0.55 ? ['#8fd06a', '#4e9a3a'] : part > 0.28 ? ['#f0c246', '#b8862a'] : ['#ef6a52', '#a83322'];
  g.addColorStop(0, hot[0]);
  g.addColorStop(1, hot[1]);
  ctx.fillStyle = g;
  round(ctx, x, y, Math.max(3, w * Math.min(part, real)), 6, 3);
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

/** The first stretch of the arc only. See PREVIEW_STEPS for why. */
function drawGhostArc(ctx: CanvasRenderingContext2D, flight: Flight): void {
  const last = Math.min(flight.points.length - 1, PREVIEW_STEPS);
  if (last < 4) return;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  for (let i = 2; i <= last; i += 4) {
    const p = flight.points[i];
    // Fading out rather than stopping dead: a hard end would read as the
    // landing point, which is the very thing being withheld.
    ctx.globalAlpha = 0.75 * (1 - i / last) ** 1.4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.9, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * The throw gauge.
 *
 * Drag length already set the power, but nothing said so, and the player was
 * left guessing at how hard they had pulled. The arc sits on the bird, fills as
 * the pull grows, and turns hot at the top of the range.
 */
function drawPower(ctx: CanvasRenderingContext2D, bird: Bird, power: number, angle: number): void {
  if (!bird || !bird.alive) return;
  const r = 27;
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.lineCap = 'round';

  ctx.strokeStyle = 'rgba(12,18,24,0.4)';
  ctx.lineWidth = 5.5;
  ctx.beginPath();
  ctx.arc(0, 0, r, -TAU / 4, -TAU / 4 + TAU * 0.75);
  ctx.stroke();

  // Coloured by how hard the pull is, not by where the arc happens to be. A
  // gradient laid across the circle made a gentle throw look red simply
  // because the arc starts on the right.
  ctx.strokeStyle = power > 0.78 ? '#ef6a52' : power > 0.45 ? '#f0c246' : '#8fd06a';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.arc(0, 0, r, -TAU / 4, -TAU / 4 + TAU * 0.75 * power);
  ctx.stroke();

  // A stub pointing where the throw goes, so force and direction read together.
  ctx.rotate(angle);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(14 + 16 * power, 0);
  ctx.stroke();
  ctx.restore();
}

function drawFlight(ctx: CanvasRenderingContext2D, flight: Flight, at: number): void {
  const i = Math.min(flight.points.length - 1, Math.floor(at));
  const p = flight.points[i];
  if (!p) return;
  const prev = flight.points[Math.max(0, i - 2)];
  const heading = Math.atan2(p.y - prev.y, p.x - prev.x);
  const speed = Math.hypot(p.x - prev.x, p.y - prev.y);

  ctx.save();
  ctx.strokeStyle = 'rgba(110,76,40,0.3)';
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const from = Math.max(0, i - 26);
  for (let k = from; k <= i; k += 2) {
    const q = flight.points[k];
    if (k === from) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  }
  ctx.stroke();

  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(25,30,36,0.2)';
  ctx.beginPath();
  ctx.arc(1.5, 1.5, 8, 0, TAU);
  ctx.fill();

  ctx.rotate(heading + i * 0.16);
  // Drawn out along the direction of travel and squashed across it: the faster
  // it goes the more it stretches, which is what sells weight in a cartoon.
  const stretch = 1 + Math.min(0.55, speed * 0.045);
  ctx.scale(stretch, 1 / stretch);
  const g = ctx.createRadialGradient(-3, -4, 1, 0, 0, 10);
  g.addColorStop(0, '#c0925a');
  g.addColorStop(1, '#5f3d1c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 6.5, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(1, -5, 5.4, 4.2, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(1.6, -8.6, 3.1, 2.5, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** A splat, drawn wherever the thing it stuck to happens to be now. */
function drawDecal(ctx: CanvasRenderingContext2D, decal: Decal, s: MatchState, time: number): void {
  let bx = decal.x;
  let by = decal.y;
  if (decal.anchor.kind === 'prop') {
    const id = decal.anchor.id;
    const prop = s.props.find((p) => p.id === id);
    if (!prop) return;
    bx = prop.x + decal.x;
    by = prop.y + decal.y;
  }
  const tint = FOOD_TINT[decal.food];
  const grow = Math.min(1, (time - decal.born) * 7);

  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(decal.seed * 0.3);
  ctx.fillStyle = tint[1];
  ctx.beginPath();
  ctx.ellipse(0, 0, 14 * grow, 6.4 * grow, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-12 * grow, 2.6 * grow, 4.2 * grow, 2.1 * grow, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(13 * grow, -1.8 * grow, 3.4 * grow, 1.8 * grow, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = tint[0];
  ctx.beginPath();
  ctx.ellipse(-2.5, -1.8, 6 * grow, 2.6 * grow, 0, 0, TAU);
  ctx.fill();

  // A drip that keeps running for a moment after it lands.
  if (decal.run > 0.02) {
    ctx.fillStyle = tint[1];
    const drop = 3 + decal.run * 16;
    ctx.beginPath();
    ctx.moveTo(-2.6, 2);
    ctx.lineTo(2.6, 2);
    ctx.quadraticCurveTo(2, drop, 0, drop + 2.2);
    ctx.quadraticCurveTo(-2, drop, -2.6, 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, drop + 1.4, 2.3, 0, TAU);
    ctx.fill();
  }
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

/**
 * Eating, so the loop can be watched instead of explained.
 *
 * The food goes to the beak, the head tips back to swallow, and the belly
 * bulges on the way down. What comes out the other end is the shot.
 */
function drawChew(ctx: CanvasRenderingContext2D, bird: Bird, chew: { food: FoodId; t: number }): void {
  const glyph = FOOD_GLYPH[chew.food];
  const t = chew.t;
  ctx.save();
  ctx.translate(bird.x, bird.y);
  if (t < 0.55) {
    // Rising to the beak.
    const k = t / 0.55;
    const x = 26 - 12 * k;
    const y = 6 - 26 * k - Math.sin(k * Math.PI) * 9;
    ctx.font = '15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 1 - Math.max(0, (k - 0.82) / 0.18);
    ctx.fillText(glyph, x, y);
  } else {
    // Down it goes: a lump travelling from the throat to the belly.
    const k = (t - 0.55) / 0.45;
    ctx.fillStyle = 'rgba(30,36,44,0.35)';
    ctx.beginPath();
    ctx.ellipse(9 - 9 * k, -8 + 12 * k, 4.5 + k * 1.6, 3.6 + k * 1.4, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** The loaded shot, waiting on the ledge to be thrown. */
function drawLoaded(ctx: CanvasRenderingContext2D, bird: Bird, time: number): void {
  ctx.save();
  ctx.translate(bird.x - 20, bird.y + 12 + Math.sin(time * 3) * 0.8);
  ctx.fillStyle = 'rgba(25,30,36,0.25)';
  ctx.beginPath();
  ctx.ellipse(1, 6, 8, 2.4, 0, 0, TAU);
  ctx.fill();
  const g = ctx.createRadialGradient(-2, -3, 1, 0, 0, 9);
  g.addColorStop(0, '#c0925a');
  g.addColorStop(1, '#5f3d1c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 1, 7, 5, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0.8, -3.4, 4.6, 3.4, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(1.4, -6.6, 2.6, 2, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = CONTOUR;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.ellipse(0, 1, 7, 5, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}
