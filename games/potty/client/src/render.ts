import {
  AnimalId,
  ANIMALS,
  Drop,
  FIELD_H,
  FIELD_W,
  FLOOR_Y,
  POTTY_W,
  PottyState,
  SEATS,
  Splat,
} from '@potty/shared';

/**
 * Everything the child sees.
 *
 * Same lighting rule as the other games on the shelf: light from the top left,
 * short shadows down and right, round things squashed a little. For a player
 * who cannot read, the picture is the entire interface -- what is about to
 * happen has to be visible on the animal's face, and what just happened has to
 * be visible on the potty.
 *
 * The wall, the fence and the floor never change, so they are painted once into
 * an offscreen canvas and blitted.
 */

const TAU = Math.PI * 2;
const CONTOUR = 'rgba(58,40,32,0.8)';

/** Body, shade, and the one bright accent, per animal. */
const COAT: Record<AnimalId, [string, string, string]> = {
  cat: ['#b9bec6', '#7d838d', '#f2b8c6'],
  pig: ['#f2b1bd', '#cf8090', '#ffe0e6'],
  cow: ['#f4efe6', '#c9c0b2', '#3a3129'],
  bird: ['#f5cf5c', '#c9a032', '#e8863c'],
};

export interface Sparkle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  tint: string;
}

export interface Fly {
  x: number;
  y: number;
  home: { x: number; y: number };
  phase: number;
}

/** What the client is feeling, handed in each frame. */
export interface Look {
  time: number;
  /** Which seat is squirming and how far through, or null. */
  bracing: { seat: number; t: number } | null;
  /** How hard the potty is celebrating, 1 fading to 0. */
  gulp: number;
  /** The big number's pop, 1 fading to 0. */
  pop: number;
  sparkles: Sparkle[];
  flies: Fly[];
  /** Which way the potty is travelling, for the lean. */
  lean: number;
}

export class View {
  private readonly ctx: CanvasRenderingContext2D;
  private back: HTMLCanvasElement | null = null;
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

  toWorld(clientX: number): number {
    const rect = this.canvas.getBoundingClientRect();

    return (clientX - rect.left - this.offX) / this.scale;
  }

  draw(s: PottyState, look: Look): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    ctx.save();
    ctx.translate(this.offX, this.offY);
    ctx.scale(this.scale, this.scale);

    if (!this.back) this.back = bakeRoom();
    ctx.drawImage(this.back, 0, 0, FIELD_W, FIELD_H);

    for (const splat of s.splats) drawSplat(ctx, splat);
    for (const fly of look.flies) drawFly(ctx, fly, look.time);

    for (let i = 0; i < SEATS.length; i++) {
      const bracing = look.bracing && look.bracing.seat === i ? look.bracing.t : 0;
      drawAnimal(ctx, ANIMALS[i % ANIMALS.length], SEATS[i], bracing, look.time, i);
    }

    for (const drop of s.drops) drawDrop(ctx, drop, look.time);
    drawPotty(ctx, s.pottyX, look);
    for (const sp of look.sparkles) drawSparkle(ctx, sp);
    drawScore(ctx, s.caught, look.pop);

    ctx.restore();
  }
}

/**
 * The room, painted once.
 *
 * @return an offscreen canvas the size of the field
 */
function bakeRoom(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = FIELD_W;
  c.height = FIELD_H;
  const ctx = c.getContext('2d')!;

  const sky = ctx.createLinearGradient(0, 0, 0, FLOOR_Y);
  sky.addColorStop(0, '#bfe4f2');
  sky.addColorStop(0.62, '#e4f2df');
  sky.addColorStop(1, '#f6efd8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, FIELD_W, FLOOR_Y);

  // Sun, low and warm, in the corner the light comes from.
  const sun = ctx.createRadialGradient(120, 60, 8, 120, 60, 120);
  sun.addColorStop(0, 'rgba(255,246,196,0.95)');
  sun.addColorStop(1, 'rgba(255,246,196,0)');
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(120, 60, 120, 0, TAU);
  ctx.fill();

  // Hills, so the fence has something to stand against.
  for (const [cx, cy, r, tint] of [
    [180, 470, 250, '#a8cf88'],
    [520, 500, 300, '#93c377'],
    [760, 470, 220, '#a8cf88'],
  ] as [number, number, number, string][]) {
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
  }

  // A fence, not four sticks. Planks wide enough to read as timber, two rails
  // crossing all of them, and a cap on each where an animal sits: the first
  // draft put every animal on its own thin pole, which read as a circus.
  const RAILS = [252, 320];
  for (const y of RAILS) {
    ctx.fillStyle = '#b5844f';
    round(ctx, 0, y, FIELD_W, 17, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,200,0.42)';
    round(ctx, 0, y + 2, FIELD_W, 4, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(88,56,30,0.28)';
    round(ctx, 0, y + 12, FIELD_W, 5, 2);
    ctx.fill();
  }
  for (const seat of SEATS) {
    ctx.fillStyle = '#c08f5c';
    round(ctx, seat.x - 17, seat.y + 20, 34, FLOOR_Y - seat.y - 20, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,50,28,0.45)';
    ctx.lineWidth = 2;
    round(ctx, seat.x - 17, seat.y + 20, 34, FLOOR_Y - seat.y - 20, 5);
    ctx.stroke();
    // Grain, so a flat brown rectangle stops being a flat brown rectangle.
    ctx.strokeStyle = 'rgba(120,78,40,0.35)';
    ctx.lineWidth = 1.4;
    for (const dx of [-8, 2, 9]) {
      ctx.beginPath();
      ctx.moveTo(seat.x + dx, seat.y + 26);
      ctx.lineTo(seat.x + dx + 2, FLOOR_Y - 6);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(90,58,34,0.3)';
    round(ctx, seat.x + 9, seat.y + 20, 8, FLOOR_Y - seat.y - 20, 4);
    ctx.fill();

    // The cap it sits on.
    ctx.fillStyle = '#d5a06a';
    round(ctx, seat.x - 36, seat.y + 12, 72, 15, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,50,28,0.55)';
    ctx.lineWidth = 2.2;
    round(ctx, seat.x - 36, seat.y + 12, 72, 15, 6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,244,214,0.55)';
    round(ctx, seat.x - 34, seat.y + 14, 68, 4, 2);
    ctx.fill();
  }

  // Floor: tiles, because a plain slab gives a falling thing nothing to be
  // judged against.
  ctx.fillStyle = '#d9c6a4';
  ctx.fillRect(0, FLOOR_Y, FIELD_W, FIELD_H - FLOOR_Y);
  ctx.fillStyle = 'rgba(120,92,56,0.22)';
  ctx.fillRect(0, FLOOR_Y, FIELD_W, 5);
  ctx.strokeStyle = 'rgba(140,110,70,0.28)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= FIELD_W; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, FLOOR_Y + 5);
    ctx.lineTo(x - 14, FIELD_H);
    ctx.stroke();
  }

  return c;
}

/**
 * @param ctx where to draw
 * @param id which animal
 * @param seat where it sits
 * @param brace 0 when calm, rising while it squirms
 * @param time seconds, for idle motion
 * @param slot the seat number, so neighbours do not breathe in unison
 */
function drawAnimal(
  ctx: CanvasRenderingContext2D,
  id: AnimalId,
  seat: { x: number; y: number },
  brace: number,
  time: number,
  slot: number,
): void {
  const coat = COAT[id];
  // Squirming: it presses down, shivers, and the shiver gets faster.
  const push = brace > 0 ? Math.min(1, brace / 0.9) : 0;
  const shake = push > 0 ? Math.sin(time * (16 + push * 26)) * push * 2.4 : 0;
  const breathe = Math.sin(time * 1.6 + slot * 1.9) * 0.9;

  ctx.save();
  ctx.translate(seat.x + shake, seat.y + push * 4 + breathe);

  ctx.fillStyle = 'rgba(70,50,30,0.22)';
  ctx.beginPath();
  ctx.ellipse(4, 26, 26, 5, 0, 0, TAU);
  ctx.fill();

  // Squashed down as it braces, which is the only warning a child gets and so
  // has to be readable at a glance, from across a room, at speed.
  ctx.scale(1 + push * 0.16, 1 - push * 0.14);

  // Tail, behind everything.
  ctx.strokeStyle = coat[1];
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-22, 8);
  ctx.quadraticCurveTo(-40, 4 + Math.sin(time * 2 + slot) * 5, -38, -12);
  ctx.stroke();

  const body = ctx.createRadialGradient(-8, -10, 3, 0, 2, 34);
  body.addColorStop(0, coat[0]);
  body.addColorStop(1, coat[1]);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 4, 26, 22, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = CONTOUR;
  ctx.lineWidth = 2.4;
  ctx.stroke();

  // Feet dangling off the rail.
  ctx.strokeStyle = coat[1];
  ctx.lineWidth = 5;
  for (const fx of [-11, 11]) {
    ctx.beginPath();
    ctx.moveTo(fx, 20);
    ctx.lineTo(fx + Math.sin(time * 2.2 + fx + slot) * 2, 29);
    ctx.stroke();
  }

  drawHead(ctx, id, coat, push, time, slot);
  ctx.restore();
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  id: AnimalId,
  coat: [string, string, string],
  push: number,
  time: number,
  slot: number,
): void {
  ctx.save();
  ctx.translate(0, -18 - push * 2);

  // Ears first, so the head overlaps their base.
  ctx.fillStyle = coat[1];
  ctx.strokeStyle = CONTOUR;
  ctx.lineWidth = 2.2;
  if (id === 'cat') {
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * 7, -14);
      ctx.lineTo(sx * 17, -27);
      ctx.lineTo(sx * 19, -10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (id === 'cow') {
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * 20, -8, 9, 5, sx * 0.4, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#e8d9b4';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * 13, -19, 5, 4, sx * -0.5, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  } else if (id === 'pig') {
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * 8, -16);
      ctx.quadraticCurveTo(sx * 21, -26, sx * 20, -9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  const head = ctx.createRadialGradient(-6, -8, 2, 0, 0, 22);
  head.addColorStop(0, coat[0]);
  head.addColorStop(1, coat[1]);
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.ellipse(0, 0, 19, 17, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = CONTOUR;
  ctx.lineWidth = 2.4;
  ctx.stroke();

  if (id === 'cow') {
    // The one patch that says cow rather than white animal.
    ctx.fillStyle = coat[2];
    ctx.beginPath();
    ctx.ellipse(-11, -6, 7, 5.5, -0.4, 0, TAU);
    ctx.fill();
  }

  // Eyes: squeezed shut while bracing, which is the joke and also the warning.
  const shut = push > 0.45;
  ctx.strokeStyle = '#3a3129';
  ctx.lineWidth = 2.4;
  ctx.fillStyle = '#3a3129';
  for (const sx of [-1, 1]) {
    if (shut) {
      ctx.beginPath();
      ctx.moveTo(sx * 7 - 4, -3);
      ctx.quadraticCurveTo(sx * 7, -7, sx * 7 + 4, -3);
      ctx.stroke();
    } else {
      const blink = (time * 0.8 + slot * 1.3) % 4 > 3.9;
      ctx.beginPath();
      if (blink) ctx.ellipse(sx * 7, -3, 3.4, 0.6, 0, 0, TAU);
      else ctx.ellipse(sx * 7, -3, 3.4, 3.8, 0, 0, TAU);
      ctx.fill();
      if (!blink) {
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        ctx.arc(sx * 7 - 1.3, -4.6, 1.3, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#3a3129';
      }
    }
  }

  // Muzzle or beak.
  if (id === 'bird') {
    ctx.fillStyle = coat[2];
    ctx.beginPath();
    ctx.moveTo(-5, 5);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = CONTOUR;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  } else {
    ctx.fillStyle = id === 'pig' ? coat[2] : 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(0, 7, id === 'pig' ? 9 : 8, id === 'pig' ? 6.5 : 5.5, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = CONTOUR;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.fillStyle = 'rgba(58,40,32,0.7)';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * 3.2, 7, 1.5, 2.1, 0, 0, TAU);
      ctx.fill();
    }
  }

  // Cheeks go red as it strains. Nothing else says "any second now" so fast.
  if (push > 0.15) {
    ctx.globalAlpha = Math.min(0.85, push);
    ctx.fillStyle = '#ef6f7a';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * 14, 3, 5, 3.6, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawDrop(ctx: CanvasRenderingContext2D, drop: Drop, time: number): void {
  ctx.save();
  ctx.translate(drop.x, drop.y);
  // Stretched along the fall, which is how the eye tells fast from slow.
  const stretch = Math.min(0.4, drop.vy / 900);
  ctx.rotate(Math.sin(time * 6 + drop.id) * 0.12);
  ctx.scale(1 - stretch * 0.4, 1 + stretch);
  poo(ctx, 1);
  ctx.restore();
}

/**
 * The thing itself: three coils, a shine, and a face, because at this age a
 * thing with eyes is a friend and a thing without them is a mess.
 *
 * @param ctx where to draw
 * @param k overall size, 1 being normal
 */
function poo(ctx: CanvasRenderingContext2D, k: number): void {
  ctx.save();
  ctx.scale(k, k);
  const g = ctx.createLinearGradient(-8, -12, 8, 12);
  g.addColorStop(0, '#a9713c');
  g.addColorStop(1, '#5f3d1c');
  ctx.fillStyle = g;
  ctx.strokeStyle = 'rgba(48,30,14,0.85)';
  ctx.lineWidth = 1.8;
  for (const [cy, rx, ry] of [
    [7, 13, 6],
    [0, 10, 5.4],
    [-6, 6.6, 4.6],
  ] as [number, number, number][]) {
    ctx.beginPath();
    ctx.ellipse(0, cy, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,236,200,0.35)';
  ctx.beginPath();
  ctx.ellipse(-4, 4, 4, 2, -0.4, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#241608';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sx * 3, -6.5, 1.5, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawSplat(ctx: CanvasRenderingContext2D, splat: Splat): void {
  ctx.save();
  ctx.translate(splat.x, FLOOR_Y + 12);
  ctx.rotate((splat.seed % 7) * 0.3);
  ctx.fillStyle = '#7a4f24';
  ctx.beginPath();
  ctx.ellipse(0, 0, 17, 6.5, 0, 0, TAU);
  ctx.fill();
  for (const [dx, dy, r] of [
    [-14, 3, 4],
    [15, -2, 3.4],
    [4, 6, 2.6],
  ] as [number, number, number][]) {
    ctx.beginPath();
    ctx.ellipse(dx, dy, r, r * 0.6, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,236,200,0.2)';
  ctx.beginPath();
  ctx.ellipse(-5, -2, 6, 2, -0.3, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawFly(ctx: CanvasRenderingContext2D, fly: Fly, time: number): void {
  ctx.save();
  ctx.translate(fly.x, fly.y);
  ctx.fillStyle = '#2f2a26';
  ctx.beginPath();
  ctx.ellipse(0, 0, 3.4, 2.4, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(220,230,240,0.75)';
  ctx.lineWidth = 1;
  const flap = Math.sin(time * 40 + fly.phase) * 2;
  ctx.beginPath();
  ctx.moveTo(-1, -1);
  ctx.lineTo(-5, -3 + flap);
  ctx.moveTo(1, -1);
  ctx.lineTo(5, -3 - flap);
  ctx.stroke();
  ctx.restore();
}

function drawPotty(ctx: CanvasRenderingContext2D, x: number, look: Look): void {
  ctx.save();
  // Placed so the rim sits on the line the rules actually catch at. Drawn
  // lower, the pot swallowed things that visibly passed above it.
  ctx.translate(x, FLOOR_Y - 6);
  // Leans into the run and bounces when it swallows one.
  ctx.rotate(-look.lean * 0.16);
  const gulp = look.gulp;
  ctx.translate(0, -gulp * 6);
  ctx.scale(1 + gulp * 0.14, 1 - gulp * 0.12);

  const half = POTTY_W / 2;
  ctx.fillStyle = 'rgba(70,50,30,0.25)';
  ctx.beginPath();
  ctx.ellipse(4, 42, half, 8, 0, 0, TAU);
  ctx.fill();

  // Handle, behind the pot so it reads as sticking out of the far side.
  ctx.strokeStyle = '#2f86a8';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(-half - 2, 2, 15, Math.PI * 0.45, Math.PI * 1.55);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(20,60,78,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // The pot: deep, and narrower at the foot. Drawn as a shallow dish it read
  // as a washing-up bowl, which is not the thing this game is about.
  const body = ctx.createLinearGradient(-half, -20, half * 0.6, 42);
  body.addColorStop(0, '#9fdcef');
  body.addColorStop(0.55, '#4ea7c6');
  body.addColorStop(1, '#22698a');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-half, -18);
  ctx.quadraticCurveTo(-half + 3, 30, -half * 0.62, 40);
  ctx.lineTo(half * 0.62, 40);
  ctx.quadraticCurveTo(half - 3, 30, half, -18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,60,78,0.8)';
  ctx.lineWidth = 2.6;
  ctx.stroke();

  // The foot it stands on.
  ctx.fillStyle = '#1d5f78';
  round(ctx, -half * 0.66, 38, half * 1.32, 8, 4);
  ctx.fill();

  // The rim, drawn as a ring so the mouth reads as an opening to aim at.
  ctx.fillStyle = '#d5f2fb';
  ctx.beginPath();
  ctx.ellipse(0, -20, half, 11, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,60,78,0.8)';
  ctx.lineWidth = 2.6;
  ctx.stroke();
  const hole = ctx.createLinearGradient(0, -28, 0, -10);
  hole.addColorStop(0, '#0f4459');
  hole.addColorStop(1, '#1d6a86');
  ctx.fillStyle = hole;
  ctx.beginPath();
  ctx.ellipse(0, -19, half - 11, 7, 0, 0, TAU);
  ctx.fill();

  // A face, so the potty is somebody rather than a bucket.
  ctx.fillStyle = '#0f3f51';
  const squint = gulp > 0.3;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    if (squint) ctx.ellipse(sx * 15, 6, 4.6, 1.2, 0, 0, TAU);
    else ctx.ellipse(sx * 15, 6, 4.2, 4.8, 0, 0, TAU);
    ctx.fill();
    if (!squint) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(sx * 15 - 1.5, 4, 1.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#0f3f51';
    }
  }
  ctx.strokeStyle = '#0f3f51';
  ctx.lineWidth = 2.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (gulp > 0.05) ctx.arc(0, 15, 8, 0, Math.PI);
  else {
    ctx.moveTo(-8, 16);
    ctx.quadraticCurveTo(0, 23, 8, 16);
  }
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.ellipse(-half + 17, 6, 5, 16, 0.1, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawSparkle(ctx: CanvasRenderingContext2D, sp: Sparkle): void {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, sp.life));
  ctx.fillStyle = sp.tint;
  ctx.translate(sp.x, sp.y);
  ctx.rotate(sp.life * 4);
  star(ctx, 0, 0, 4 + sp.life * 3);
  ctx.restore();
}

function drawScore(ctx: CanvasRenderingContext2D, caught: number, pop: number): void {
  ctx.save();
  ctx.translate(FIELD_W / 2, 62);
  ctx.scale(1 + pop * 0.35, 1 + pop * 0.35);
  ctx.font = 'bold 62px system-ui, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 9;
  ctx.strokeStyle = 'rgba(58,40,32,0.85)';
  ctx.lineJoin = 'round';
  ctx.strokeText(String(caught), 0, 0);
  const g = ctx.createLinearGradient(0, -30, 0, 30);
  g.addColorStop(0, '#fff3c4');
  g.addColorStop(1, '#f2b429');
  ctx.fillStyle = g;
  ctx.fillText(String(caught), 0, 0);
  ctx.restore();
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 ? r * 0.44 : r;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
