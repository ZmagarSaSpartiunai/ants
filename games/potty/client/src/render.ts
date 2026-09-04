import {
  Animal,
  AnimalId,
  Drop,
  FIELD_H,
  FIELD_W,
  FLOOR_Y,
  FLUSH_TIME,
  POTTY_CAP,
  POTTY_W,
  PottyState,
  Rules,
  SEATS,
  SIZE,
  Splat,
  STRIKES,
  TOILET_W,
  TOILET_X,
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
  hamster: ['#e8c48a', '#bd965e', '#f6dcc0'],
  bird: ['#f5cf5c', '#c9a032', '#e8863c'],
  cat: ['#b9bec6', '#7d838d', '#f2b8c6'],
  dog: ['#c98f5d', '#96633a', '#3a3129'],
  sheep: ['#f2eee6', '#cdc6bb', '#4a4038'],
  pig: ['#f2b1bd', '#cf8090', '#ffe0e6'],
  cow: ['#f4efe6', '#c9c0b2', '#3a3129'],
};

/**
 * How big the animal is drawn.
 *
 * A cow that makes ten times a hamster's should look like it. Tying the two
 * together means the child can guess what will fit before finding out.
 *
 * @param size how much it produces
 * @return a scale for the whole animal
 */
function bodyScale(size: number): number {
  return 0.74 + size * 0.04;
}

export interface Sparkle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  tint: string;
}

/**
 * One lump that hit the screen when an animal burst.
 *
 * It is not part of the game state: it belongs to the glass the player is
 * looking through, not to the yard. What lands on the actual ground is a plain
 * splat and is remembered by the rules; this is the mess on the lens, and it
 * runs off.
 */
export interface Smear {
  x: number;
  y: number;
  r: number;
  seed: number;
  /** Seconds since it landed. */
  age: number;
  /** How far down it has crept from where it hit. */
  slid: number;
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
  /** Seats that have just burst, and how long ago. */
  booms: Map<number, number>;
  /** Seats that have just arrived, 0 rising to 1. */
  arrivals: Map<number, number>;
  /** What a burst threw at the screen. */
  smears: Smear[];
  /** Seats that have just had their fifth, and how long ago. */
  cheers: Map<number, number>;
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

    drawToilet(ctx, s.held >= POTTY_CAP, s.flushing, look.time);

    for (const a of s.animals) {
      const boom = look.booms.get(a.seat);
      if (a.asleep) continue;
      const arriving = look.arrivals.get(a.seat);
      if (a.alive) drawAnimal(ctx, s.rules, SEATS[a.seat], a, look.time, look.cheers.get(a.seat), arriving);
      drawProgress(ctx, s.rules, SEATS[a.seat], a);
      if (a.alive && a.urge !== null) drawAsk(ctx, s.rules, SEATS[a.seat], a, look.time);
      if (boom !== undefined) drawBoom(ctx, SEATS[a.seat], boom);
    }

    for (const drop of s.drops) drawDrop(ctx, drop, s.animals[drop.seat].size, look.time);
    drawPotty(ctx, s, look);
    drawGauge(ctx, s);
    if (s.flushing > 0) drawPour(ctx, s, look.time);
    for (const sp of look.sparkles) drawSparkle(ctx, sp);
    if (s.held > 0 && s.flushing <= 0) drawScore(ctx, s.held, look.pop);
    for (const smear of look.smears) drawSmear(ctx, smear);

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
  rules: Rules,
  seat: { x: number; y: number },
  a: Animal,
  time: number,
  cheer?: number,
  arriving?: number,
): void {
  const id = a.id;
  const coat = COAT[id];
  const slot = a.seat;
  // How desperate it is: nothing at all until it asks, then rising as its own
  // clock runs down. The child's only warning is this, so it has to be legible
  // from across a room -- and it has to grow, not merely be on.
  const wait = rules.wait[Math.min(rules.wait.length - 1, a.strikes)];
  const push = a.urge === null ? 0 : Math.max(0, Math.min(1, 1 - a.urge / wait));
  const shake = push > 0 ? Math.sin(time * (16 + push * 34)) * push * 3.2 : 0;
  const breathe = Math.sin(time * 1.6 + slot * 1.9) * 0.9;

  ctx.save();
  ctx.translate(seat.x + shake, seat.y + push * 4 + breathe);
  if (arriving !== undefined && arriving < 1) {
    // Drops onto its post and overshoots: an animal that simply appears is a
    // change the child finds already made rather than something that happened.
    const ease = 1 - Math.pow(1 - arriving, 3);
    ctx.translate(0, -120 * (1 - ease));
    const squash = 1 + Math.sin(arriving * Math.PI * 2.4) * 0.2 * (1 - arriving);
    ctx.scale(squash, 2 - squash);
  }
  ctx.scale(bodyScale(a.size), bodyScale(a.size));
  if (cheer !== undefined && cheer < 1) {
    // Its fifth: it hops. A goal reached with no reaction is not a goal.
    ctx.translate(0, -Math.abs(Math.sin(cheer * Math.PI * 2)) * 16);
  }

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
  if (id === 'sheep') {
    // A ring of bumps instead of an outline: fleece, in one shape.
    ctx.beginPath();
    for (let i = 0; i <= 11; i++) {
      const ang = (i / 11) * TAU;
      ctx.arc(Math.cos(ang) * 22, 4 + Math.sin(ang) * 18, 8, 0, TAU);
    }
    ctx.fill();
    ctx.strokeStyle = CONTOUR;
    ctx.lineWidth = 2.2;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(0, 4, 26, 22, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = CONTOUR;
    ctx.lineWidth = 2.4;
    ctx.stroke();
  }

  // Feet dangling off the rail.
  ctx.strokeStyle = coat[1];
  ctx.lineWidth = 5;
  for (const fx of [-11, 11]) {
    ctx.beginPath();
    ctx.moveTo(fx, 20);
    ctx.lineTo(fx + Math.sin(time * 2.2 + fx + slot) * 2, 29);
    ctx.stroke();
  }

  drawHead(ctx, id, coat, push, time, slot, a.strikes > 0);
  ctx.restore();
}

/**
 * The band over each animal: green for what it has managed, red for what it
 * has been denied.
 *
 * Both counts on one bar, growing towards each other. A child scanning the
 * fence has to be able to see in one glance who is nearly done and who is one
 * failure from bursting -- and those are opposite ends of the same bar, so
 * they belong on the same bar.
 *
 * @param ctx where to draw
 * @param seat where the animal sits
 * @param a the animal
 */
function drawProgress(
  ctx: CanvasRenderingContext2D,
  rules: Rules,
  seat: { x: number; y: number },
  a: Animal,
): void {
  const goal = rules.goal;
  const w = 74;
  const h = 11;
  const x = seat.x - w / 2;
  const y = seat.y - 50;
  const dead = !a.alive;

  ctx.save();
  round(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = dead ? 'rgba(80,64,54,0.45)' : 'rgba(255,255,255,0.8)';
  ctx.fill();

  if (!dead) {
    // Green from the left: how many times it has been.
    const got = (a.pooped / goal) * w;
    if (got > 0) {
      ctx.save();
      round(ctx, x, y, w, h, h / 2);
      ctx.clip();
      ctx.fillStyle = '#5eb84f';
      ctx.fillRect(x, y, got, h);
      ctx.restore();
    }
    // Red from the right: how close it is to bursting. It pulses on the last
    // one, because that is the animal the child has to drop everything for.
    const bad = (a.strikes / STRIKES) * w;
    if (bad > 0) {
      ctx.save();
      round(ctx, x, y, w, h, h / 2);
      ctx.clip();
      ctx.fillStyle = a.strikes >= STRIKES - 1 ? '#ff4a3d' : '#e4574d';
      ctx.fillRect(x + w - bad, y, bad, h);
      ctx.restore();
    }
  }

  ctx.strokeStyle = 'rgba(58,40,32,0.6)';
  ctx.lineWidth = 2;
  round(ctx, x, y, w, h, h / 2);
  ctx.stroke();

  // The five notches, so the green is countable and not just a length.
  ctx.strokeStyle = 'rgba(58,40,32,0.28)';
  ctx.lineWidth = 1.2;
  for (let i = 1; i < goal; i++) {
    ctx.beginPath();
    ctx.moveTo(x + (i * w) / goal, y + 2);
    ctx.lineTo(x + (i * w) / goal, y + h - 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The bubble over whoever is asking: who, and how long is left.
 *
 * The squirming alone was not enough. It grows as the clock runs down, so at
 * the start of an urge -- exactly when there is still time to get there -- an
 * animal that is asking looks almost like one that is not. This says it from
 * the first instant, without a word to read.
 *
 * @param ctx where to draw
 * @param seat where the animal sits
 * @param a the animal
 * @param time seconds, for the nudge
 */
function drawAsk(
  ctx: CanvasRenderingContext2D,
  rules: Rules,
  seat: { x: number; y: number },
  a: Animal,
  time: number,
): void {
  const wait = rules.wait[Math.min(rules.wait.length - 1, a.strikes)];
  const left = Math.max(0, Math.min(1, (a.urge ?? 0) / wait));
  const bob = Math.sin(time * 5) * 2;
  ctx.save();
  ctx.translate(seat.x, seat.y - 78 + bob);

  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.strokeStyle = 'rgba(58,40,32,0.75)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // The little tail pointing at whoever is asking.
  ctx.beginPath();
  ctx.moveTo(-6, 14);
  ctx.lineTo(0, 24);
  ctx.lineTo(6, 14);
  ctx.closePath();
  ctx.fill();

  // The clock, draining anticlockwise from the top and reddening as it goes.
  ctx.strokeStyle = left > 0.55 ? '#7bc86c' : left > 0.28 ? '#f2b429' : '#e4574d';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, 22, -Math.PI / 2, -Math.PI / 2 + left * TAU);
  ctx.stroke();

  ctx.save();
  // Drawn at this animal's own size, so a cow's bubble warns you it needs an
  // empty potty before it has even let go.
  ctx.scale(0.6, 0.6);
  poo(ctx, pooScale(a.size));
  ctx.restore();
  ctx.restore();
}

/**
 * @param ctx where to draw
 * @param seat where the animal was
 * @param t seconds since it burst
 */
function drawBoom(ctx: CanvasRenderingContext2D, seat: { x: number; y: number }, t: number): void {
  const p = Math.min(1, t / 0.75);
  ctx.save();
  ctx.translate(seat.x, seat.y);
  ctx.globalAlpha = 1 - p;
  // A ring going out, and smoke going up: something happened here and it is over.
  ctx.strokeStyle = '#8a5a2c';
  ctx.lineWidth = 7 * (1 - p);
  ctx.beginPath();
  ctx.arc(0, 0, 14 + p * 70, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = 'rgba(120,96,74,0.55)';
  for (let i = 0; i < 6; i++) {
    const a = (i * TAU) / 6 + p;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * (18 + p * 40), Math.sin(a) * (14 + p * 30) - p * 26, 11 * (1 - p * 0.5), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  id: AnimalId,
  coat: [string, string, string],
  push: number,
  time: number,
  slot: number,
  cross: boolean,
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
  } else if (id === 'hamster') {
    // Round ears set high and wide: the whole animal is meant to read as small.
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * 13, -15, 7, 7, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  } else if (id === 'dog') {
    // Ears hanging down past the jaw, which is most of what says dog.
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * 12, -12);
      ctx.quadraticCurveTo(sx * 25, -6, sx * 21, 12);
      ctx.quadraticCurveTo(sx * 14, 8, sx * 12, -6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (id === 'sheep') {
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * 19, -6, 8, 4.5, sx * 0.5, 0, TAU);
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
  if (id === 'sheep') {
    // A dark face inside the fleece, or it is a white blob with eyes.
    ctx.fillStyle = coat[2];
    ctx.beginPath();
    ctx.ellipse(0, 1, 15, 14, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = CONTOUR;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Eyes: squeezed shut while bracing, which is the joke and also the warning.
  const shut = push > 0.45;
  const ink = id === 'sheep' ? '#f2eee6' : '#3a3129';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2.4;
  ctx.fillStyle = ink;
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
        ctx.fillStyle = id === 'sheep' ? 'rgba(60,52,44,0.9)' : 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        ctx.arc(sx * 7 - 1.3, -4.6, 1.3, 0, TAU);
        ctx.fill();
        ctx.fillStyle = ink;
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
    ctx.fillStyle = id === 'pig' ? coat[2] : id === 'sheep' ? 'rgba(242,238,230,0.6)' : 'rgba(255,255,255,0.55)';
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
  // Once it has been left waiting even once, the whole face stays flushed --
  // that is the standing warning that this one is running out of chances.
  const heat = cross ? Math.max(0.55, push) : push;
  if (heat > 0.15) {
    ctx.globalAlpha = Math.min(0.85, heat);
    ctx.fillStyle = '#ef6f7a';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * 14, 3, 5, 3.6, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (cross) {
    // Cross eyebrows, so the warning survives a colour-blind eye and a bad screen.
    ctx.strokeStyle = '#8c2f38';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * 3, -10);
      ctx.lineTo(sx * 12, -13.5);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawDrop(ctx: CanvasRenderingContext2D, drop: Drop, size: number, time: number): void {
  ctx.save();
  ctx.translate(drop.x, drop.y);
  // Stretched along the fall, which is how the eye tells fast from slow.
  const stretch = Math.min(0.4, drop.vy / 900);
  ctx.rotate(Math.sin(time * 6 + drop.id) * 0.12);
  ctx.scale(1 - stretch * 0.4, 1 + stretch);
  poo(ctx, pooScale(size));
  ctx.restore();
}

/**
 * @param size how much the animal produces
 * @return how big to draw one of them
 */
export function pooScale(size: number): number {
  return 0.42 + size * 0.083;
}

/**
 * How full the potty is, in the same units the animals produce.
 *
 * Ten cells, countable, sitting over the potty and travelling with it. The
 * heap over the rim says roughly; this says exactly, and exactly is what a
 * child needs to work out whether the cow will fit.
 *
 * @param ctx where to draw
 * @param s the game
 */
function drawGauge(ctx: CanvasRenderingContext2D, s: PottyState): void {
  const cells = s.rules.cap;
  // The easy potty holds twice as much, so the cells get thinner rather than
  // the dial growing until it is wider than the yard.
  const w = cells > 14 ? 6 : cells > 10 ? 8 : 9;
  const gap = 2;
  const total = cells * w + (cells - 1) * gap;
  // Right above the pot and travelling with it. Higher up it read as a piece
  // of furniture rather than as this potty's own dial.
  const x = Math.max(8, Math.min(FIELD_W - total - 8, s.pottyX - total / 2));
  const y = FLOOR_Y - 84;

  ctx.save();
  ctx.fillStyle = 'rgba(20,50,64,0.35)';
  round(ctx, x - 5, y - 4, total + 10, 20, 7);
  ctx.fill();
  for (let i = 0; i < cells; i++) {
    const filled = i < s.held;
    round(ctx, x + i * (w + gap), y, w, 12, 3);
    ctx.fillStyle = filled ? '#a9713c' : 'rgba(255,255,255,0.75)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,50,64,0.55)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
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
  ctx.translate(splat.x, splat.y ?? FLOOR_Y + 12);
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

function drawPotty(ctx: CanvasRenderingContext2D, st: PottyState, look: Look): void {
  const x = st.pottyX;
  const full = st.held >= POTTY_CAP;
  // Leans over the bowl, holds there while it pours, and rights itself.
  // A single sine threw it almost upside down and then whipped it back, which
  // read as the potty being dropped rather than emptied.
  const flush = st.flushing > 0 ? 1 - st.flushing / FLUSH_TIME : 0;
  const pour = flush <= 0 ? 0 : flush < 0.28 ? flush / 0.28 : flush < 0.74 ? 1 : Math.max(0, 1 - (flush - 0.74) / 0.26);
  const tip = pour * 0.72;
  ctx.save();
  // Placed so the rim sits on the line the rules actually catch at. Drawn
  // lower, the pot swallowed things that visibly passed above it.
  ctx.translate(x, FLOOR_Y - 6 - tip * 15);
  // Leans into the run and bounces when it swallows one.
  ctx.rotate(-look.lean * 0.16 + tip);
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
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(-half + 3, 14, 11, Math.PI * 0.5, Math.PI * 1.5);
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
  // Three faces, and they are the instructions: pleased, then wide-eyed and
  // full, then relieved. Nothing here is written down, so the pot has to say it.
  const squint = gulp > 0.3 || flush > 0.1;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    if (squint) ctx.ellipse(sx * 15, 6, 4.6, 1.2, 0, 0, TAU);
    else if (full) ctx.ellipse(sx * 15, 5, 5.4, 6.2, 0, 0, TAU);
    else ctx.ellipse(sx * 15, 6, 4.2, 4.8, 0, 0, TAU);
    ctx.fill();
    if (!squint) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(sx * 15 - 1.5, full ? 2.6 : 4, full ? 1.8 : 1.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#0f3f51';
    }
  }
  ctx.strokeStyle = '#0f3f51';
  ctx.lineWidth = 2.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (gulp > 0.05 || flush > 0.1) ctx.arc(0, 15, 8, 0, Math.PI);
  else if (full) {
    // A flat, worried mouth: it cannot take another one and it knows it.
    ctx.moveTo(-8, 18);
    ctx.lineTo(8, 18);
  } else {
    ctx.moveTo(-8, 16);
    ctx.quadraticCurveTo(0, 23, 8, 16);
  }
  ctx.stroke();

  // What is in it, heaped above the rim. A level hidden inside an opaque pot
  // is a number the child cannot see, and this game has no numbers to read.
  // Pours out over the middle of the lean rather than blinking away.
  const emptied = flush <= 0 ? 0 : Math.max(0, Math.min(1, (flush - 0.26) / 0.34));
  const shown = st.held * (1 - emptied);
  // A heap, not a stack: two on the bottom row, then the rest on top of them.
  // Piled straight up they overlapped into one brown lump and the child could
  // not see how many were in there.
  const HEAP: [number, number][] = [[-17, -22], [17, -24], [-7, -38], [9, -40]];
  for (let i = 0; i < Math.ceil(shown); i++) {
    const scale = Math.min(1, shown - i) * 0.5;
    const [hx, hy] = HEAP[i % HEAP.length];
    ctx.save();
    ctx.translate(hx, hy);
    ctx.scale(scale, scale);
    poo(ctx, 1);
    ctx.restore();
  }

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.ellipse(-half + 17, 6, 5, 16, 0.1, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * What comes out of the tipped potty on its way into the bowl.
 *
 * Drawn upright in the world rather than inside the potty's own tipped frame:
 * what is falling does not lean just because the thing it fell out of does.
 *
 * @param ctx where to draw
 * @param st the game
 * @param time seconds, for the tumble
 */
function drawPour(ctx: CanvasRenderingContext2D, st: PottyState, time: number): void {
  const flush = 1 - st.flushing / FLUSH_TIME;
  if (flush < 0.24 || flush > 0.72) return;
  const p = (flush - 0.24) / 0.48;
  const from = { x: st.pottyX + 34, y: FLOOR_Y - 40 };
  const to = { x: TOILET_X, y: FLOOR_Y - 48 };
  for (let i = 0; i < st.held; i++) {
    // Staggered, so it is a stream and not a single lump changing address.
    const q = p * 1.6 - i * 0.2;
    if (q <= 0 || q >= 1) continue;
    ctx.save();
    ctx.translate(from.x + (to.x - from.x) * q, from.y + (to.y - from.y) * q - Math.sin(q * Math.PI) * 26);
    ctx.rotate(time * 5 + i);
    ctx.scale(0.5, 0.5);
    poo(ctx, 1);
    ctx.restore();
  }
}

/**
 * The toilet the potty is emptied into.
 *
 * @param ctx where to draw
 * @param wanted whether the potty is full and should come here
 * @param flushing seconds left of the flush, or zero
 * @param time seconds, for the beckoning arrow
 */
function drawToilet(
  ctx: CanvasRenderingContext2D,
  wanted: boolean,
  flushing: number,
  time: number,
): void {
  ctx.save();
  ctx.translate(TOILET_X, FLOOR_Y);

  ctx.fillStyle = 'rgba(70,50,30,0.25)';
  ctx.beginPath();
  ctx.ellipse(4, 34, TOILET_W * 0.52, 8, 0, 0, TAU);
  ctx.fill();

  // Cistern behind, then the bowl in front of it.
  ctx.fillStyle = '#e8eef2';
  round(ctx, -TOILET_W / 2 + 6, -96, TOILET_W - 12, 46, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,110,124,0.75)';
  ctx.lineWidth = 2.4;
  round(ctx, -TOILET_W / 2 + 6, -96, TOILET_W - 12, 46, 8);
  ctx.stroke();
  // The handle, pressed down while it flushes.
  ctx.fillStyle = '#9fb3c0';
  round(ctx, TOILET_W / 2 - 16, -88 + (flushing > 0 ? 5 : 0), 12, 7, 3);
  ctx.fill();

  const bowl = ctx.createLinearGradient(-TOILET_W / 2, -50, TOILET_W / 2, 34);
  bowl.addColorStop(0, '#ffffff');
  bowl.addColorStop(1, '#b9c8d2');
  ctx.fillStyle = bowl;
  ctx.beginPath();
  ctx.moveTo(-TOILET_W / 2, -50);
  ctx.quadraticCurveTo(-TOILET_W / 2 + 8, 20, -20, 32);
  ctx.lineTo(20, 32);
  ctx.quadraticCurveTo(TOILET_W / 2 - 8, 20, TOILET_W / 2, -50);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,110,124,0.75)';
  ctx.stroke();

  // The rim and the water in it.
  ctx.fillStyle = '#f4f8fa';
  ctx.beginPath();
  ctx.ellipse(0, -50, TOILET_W / 2, 13, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  const swirl = flushing > 0 ? Math.sin(time * 26) * 3 : 0;
  ctx.fillStyle = flushing > 0 ? '#6fc6e8' : '#8fd3e8';
  ctx.beginPath();
  ctx.ellipse(swirl, -49, TOILET_W / 2 - 11, 8, 0, 0, TAU);
  ctx.fill();
  if (flushing > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a = time * 9 + (i * TAU) / 3;
      ctx.beginPath();
      ctx.ellipse(0, -49, 8 + i * 6, 3 + i * 2, a, 0, Math.PI * 1.4);
      ctx.stroke();
    }
  }

  // While the potty is full, the toilet asks for it. A four-year-old is not
  // going to work out on their own that the pot has to be carried anywhere.
  if (wanted && flushing <= 0) {
    const bounce = Math.abs(Math.sin(time * 3.4)) * 9;
    ctx.fillStyle = '#f2b429';
    ctx.strokeStyle = 'rgba(58,40,32,0.75)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, -110 - bounce + 24);
    ctx.lineTo(-13, -110 - bounce);
    ctx.lineTo(-6, -110 - bounce);
    ctx.lineTo(-6, -110 - bounce - 16);
    ctx.lineTo(6, -110 - bounce - 16);
    ctx.lineTo(6, -110 - bounce);
    ctx.lineTo(13, -110 - bounce);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A hit on the glass the player is looking through.
 *
 * A splat is not a blob. What makes one read as thrown rather than placed is
 * the outline: an off-centre body with arms shooting out of it, a few droplets
 * that flew further than the rest, and a run starting underneath. Drawn as a
 * neat lumpy circle it read as a piece of poo hanging in mid-air.
 *
 * World coordinates like everything else, so it letterboxes with the picture
 * instead of floating over the black bars.
 *
 * @param ctx where to draw
 * @param sm the smear
 */
function drawSmear(ctx: CanvasRenderingContext2D, sm: Smear): void {
  // Lands hard and spreads, then settles: something thrown at glass flattens
  // on impact, it does not arrive at its final shape.
  const hit = Math.min(1, sm.age / 0.14);
  const r = sm.r * (0.35 + 0.65 * hit);
  const spread = 1 + (1 - hit) * 0.55;
  const fade = Math.max(0, Math.min(1, (FIELD_H + 60 - (sm.y + sm.slid)) / 70));
  // A pseudo-random but stable wobble, so each smear keeps its own shape.
  const wob = (i: number): number => (Math.sin(sm.seed * 12.9898 + i * 78.233) + 1) / 2;

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(sm.x, sm.y + sm.slid);

  // The run below, which is what says "sliding down glass" and not "stuck on".
  const run = Math.min(sm.r * 5, Math.max(0, sm.age - 0.35) * 34);
  if (run > 3) {
    const g = ctx.createLinearGradient(0, 0, 0, run + r * 0.4);
    g.addColorStop(0, '#6b4520');
    g.addColorStop(1, 'rgba(95,61,28,0.2)');
    ctx.fillStyle = g;
    for (const [off, wide] of [[-r * 0.18, 0.3], [r * 0.22, 0.22]] as [number, number][]) {
      const len = run * (0.6 + wob(off) * 0.6);
      ctx.beginPath();
      ctx.moveTo(off - r * wide, 0);
      ctx.lineTo(off + r * wide, 0);
      ctx.quadraticCurveTo(off + r * wide * 0.5, len, off, len + r * 0.28);
      ctx.quadraticCurveTo(off - r * wide * 0.5, len, off - r * wide, 0);
      ctx.closePath();
      ctx.fill();
      // The drop about to let go of the end of the run.
      ctx.beginPath();
      ctx.ellipse(off, len + r * 0.3, r * 0.14, r * 0.2, 0, 0, TAU);
      ctx.fill();
    }
  }

  ctx.rotate(sm.seed);
  ctx.scale(spread, 1 / spread);

  const blob = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.15);
  blob.addColorStop(0, '#b07c44');
  blob.addColorStop(0.7, '#7a4f24');
  blob.addColorStop(1, '#4e3116');
  ctx.fillStyle = blob;

  // Arms, drawn first so the body covers where they join it.
  const arms = 5 + Math.floor(wob(1) * 4);
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * TAU + wob(i) * 0.8;
    const len = r * (0.9 + wob(i + 30) * 1.3);
    const halfWidth = r * (0.1 + wob(i + 60) * 0.13);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(-sin * halfWidth, cos * halfWidth);
    ctx.quadraticCurveTo(cos * len * 0.6, sin * len * 0.6, cos * len, sin * len);
    ctx.quadraticCurveTo(cos * len * 0.6, sin * len * 0.6, sin * halfWidth, -cos * halfWidth);
    ctx.closePath();
    ctx.fill();
    // A bead at the tip, and one that flew clear of the rest.
    ctx.beginPath();
    ctx.arc(cos * len, sin * len, halfWidth * 0.8, 0, TAU);
    ctx.fill();
    if (wob(i + 90) > 0.55) {
      const far = len * (1.35 + wob(i + 120) * 0.5);
      ctx.beginPath();
      ctx.arc(cos * far, sin * far, r * (0.07 + wob(i + 150) * 0.08), 0, TAU);
      ctx.fill();
    }
  }

  // The body: an outline whose radius wanders, not a circle.
  ctx.beginPath();
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * TAU;
    const rad = r * (0.66 + wob(i + 7) * 0.42);
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  // Wet highlight, top left, the same rule as everything else in this game.
  ctx.globalAlpha = fade * 0.42;
  ctx.fillStyle = '#f2ddbe';
  ctx.beginPath();
  ctx.ellipse(-r * 0.28, -r * 0.3, r * 0.3, r * 0.16, -0.5, 0, TAU);
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
