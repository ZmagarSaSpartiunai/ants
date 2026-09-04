import { Day, FoodId, Kid, Toy, ToyId } from '@nursery/shared';

/**
 * One room, seen through the morning.
 *
 * The same four children sit in the same four places all morning: at the table
 * for breakfast, in beds for the nap. A child of three follows a story far
 * better when the cast does not move about between scenes.
 */

export const W = 700;
export const H = 470;
const TAU = Math.PI * 2;
const INK = '#3a3129';

/** Where the four children are, and how big a target each makes. */
export const SEAT_AT = [
  { x: 128, y: 250 },
  { x: 288, y: 250 },
  { x: 448, y: 250 },
  { x: 608, y: 250 },
];
export const SEAT_R = 74;

/** The toy box, and the lamp switch. */
export const BOX = { x: 596, y: 396, r: 62 };
export const LAMP = { x: 350, y: 62, r: 52 };

const COAT: Record<string, [string, string, string]> = {
  cat: ['#b9bec6', '#7d838d', '#f2b8c6'],
  dog: ['#c98f5d', '#96633a', '#f0d0b0'],
  bunny: ['#f2eae0', '#cfc3b4', '#f2b8c6'],
  bear: ['#a9764a', '#7a5330', '#e0c39a'],
  pig: ['#f2b1bd', '#cf8090', '#ffe0e6'],
  frog: ['#7fc35a', '#4e8c36', '#e8f0c8'],
};

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

/**
 * The room, painted once into an offscreen canvas.
 *
 * Light from the top left, shadows down and right, the same rule the rest of
 * the shelf follows. A nursery also has to look like somewhere a child would
 * want to be, so it is full of things: bunting, a rug, a shelf, a window with
 * curtains. An empty room reads as a waiting room.
 *
 * @param ctx where to draw
 * @param dark whether the light is off
 */
export function drawRoom(ctx: CanvasRenderingContext2D, dark: boolean): void {
  const floorY = 326;

  const wall = ctx.createLinearGradient(0, 0, W * 0.7, floorY);
  wall.addColorStop(0, dark ? '#33415c' : '#fbf1d8');
  wall.addColorStop(1, dark ? '#1d2739' : '#efdcb6');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, floorY);

  // A painted stripe with a wavy top, the way nurseries are painted.
  ctx.fillStyle = dark ? 'rgba(120,150,190,0.18)' : '#a8d8c0';
  ctx.beginPath();
  ctx.moveTo(0, 268);
  for (let x = 0; x <= W; x += 40) {
    ctx.quadraticCurveTo(x + 10, 258, x + 20, 268);
    ctx.quadraticCurveTo(x + 30, 278, x + 40, 268);
  }
  ctx.lineTo(W, floorY);
  ctx.lineTo(0, floorY);
  ctx.closePath();
  ctx.fill();

  windowWithCurtains(ctx, 30, 116, dark);
  wallShelf(ctx, 500, 196, dark);
  bunting(ctx, dark);

  // Floor: boards running away from us.
  ctx.fillStyle = dark ? '#25324a' : '#dcb684';
  ctx.fillRect(0, floorY, W, H - floorY);
  ctx.strokeStyle = dark ? 'rgba(140,170,210,0.12)' : 'rgba(140, 100, 50, 0.3)';
  ctx.lineWidth = 2;
  for (let i = -3; i <= 11; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 74, floorY);
    ctx.lineTo(i * 74 - 44, H);
    ctx.stroke();
  }
  for (const y of [floorY + 42, floorY + 96]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Skirting.
  ctx.fillStyle = dark ? '#3c4a68' : '#f6ead0';
  ctx.fillRect(0, floorY - 14, W, 14);
  ctx.fillStyle = dark ? 'rgba(10,16,28,0.4)' : 'rgba(150, 110, 60, 0.28)';
  ctx.fillRect(0, floorY - 3, W, 4);

  // A round rug. The first one was hot pink and the size of the floor, and it
  // pulled the eye off the children, who are the thing to be looked at.
  ctx.fillStyle = dark ? '#2c3a54' : '#e8c9a8';
  ctx.beginPath();
  ctx.ellipse(330, 414, 212, 46, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = dark ? '#36466a' : '#efb9a0';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.ellipse(330, 414, 168, 34, 0, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = dark ? '#3f5070' : '#f7ddc4';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(330, 414, 124, 24, 0, 0, TAU);
  ctx.stroke();
}

/**
 * @param ctx where to draw
 * @param x left edge
 * @param y top edge
 * @param dark whether the light is off
 */
function windowWithCurtains(ctx: CanvasRenderingContext2D, x: number, y: number, dark: boolean): void {
  const w = 130;
  const h = 104;
  const sky = ctx.createLinearGradient(x, y, x, y + h);
  if (dark) {
    sky.addColorStop(0, '#1a2440');
    sky.addColorStop(1, '#2c3a58');
  } else {
    sky.addColorStop(0, '#8fd0ee');
    sky.addColorStop(1, '#d6f0f6');
  }
  ctx.fillStyle = sky;
  round(ctx, x, y, w, h, 8);
  ctx.fill();

  ctx.save();
  round(ctx, x, y, w, h, 8);
  ctx.clip();
  if (dark) {
    // A moon and a couple of stars, since the light is off.
    ctx.fillStyle = '#f2eecf';
    ctx.beginPath();
    ctx.arc(x + 96, y + 30, 16, 0, TAU);
    ctx.fill();
    ctx.fillStyle = dark ? '#1a2440' : '#8fd0ee';
    ctx.beginPath();
    ctx.arc(x + 88, y + 25, 15, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const [sx, sy] of [[36, 28], [58, 54], [26, 62]] as [number, number][]) {
      ctx.beginPath();
      ctx.arc(x + sx, y + sy, 2.4, 0, TAU);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(x + 98, y + 28, 18, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#8dc86e';
    ctx.beginPath();
    ctx.ellipse(x + 34, y + 118, 70, 42, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle = dark ? '#8fa2c4' : '#ffffff';
  ctx.lineWidth = 9;
  round(ctx, x, y, w, h, 8);
  ctx.stroke();
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h);
  ctx.stroke();

  // Curtains, gathered at each side.
  ctx.fillStyle = dark ? '#4a5c80' : '#f2a8b8';
  for (const sx of [0, 1]) {
    const cx = x - 16 + sx * (w + 32);
    ctx.beginPath();
    ctx.moveTo(cx, y - 12);
    ctx.quadraticCurveTo(cx + (sx ? -30 : 30), y + 46, cx, y + h + 14);
    ctx.quadraticCurveTo(cx + (sx ? -10 : 10), y + 46, cx, y - 12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = dark ? '#5a6d92' : '#f7c6d0';
  round(ctx, x - 26, y - 18, w + 52, 12, 6);
  ctx.fill();
}

/**
 * A shelf with the things a nursery keeps out of reach.
 *
 * @param ctx where to draw
 * @param x left edge
 * @param y the shelf's line
 * @param dark whether the light is off
 */
function wallShelf(ctx: CanvasRenderingContext2D, x: number, y: number, dark: boolean): void {
  const books: [number, number, string][] = [
    [0, 34, '#e0453c'],
    [14, 42, '#f2b429'],
    [28, 30, '#5eb84f'],
    [42, 40, '#52b6e8'],
  ];
  for (const [dx, hh, tint] of books) {
    ctx.fillStyle = dark ? 'rgba(140,165,205,0.35)' : tint;
    round(ctx, x + dx, y - hh, 12, hh, 3);
    ctx.fill();
  }
  // A teddy sitting at the end of the shelf.
  ctx.fillStyle = dark ? 'rgba(140,165,205,0.35)' : '#a9764a';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x + 92 + sx * 13, y - 40, 8, 0, TAU);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x + 92, y - 24, 20, 0, TAU);
  ctx.fill();

  ctx.fillStyle = dark ? '#3c4a68' : '#c98a3a';
  round(ctx, x - 12, y, 140, 12, 4);
  ctx.fill();
  ctx.fillStyle = dark ? 'rgba(10,16,28,0.35)' : 'rgba(120, 80, 30, 0.25)';
  round(ctx, x - 8, y + 12, 132, 6, 3);
  ctx.fill();
}

/**
 * @param ctx where to draw
 * @param dark whether the light is off
 */
function bunting(ctx: CanvasRenderingContext2D, dark: boolean): void {
  ctx.strokeStyle = dark ? 'rgba(200,220,240,0.3)' : '#b08a52';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 74);
  ctx.quadraticCurveTo(W / 2, 106, W, 74);
  ctx.stroke();
  const flags = ['#e0453c', '#f2b429', '#5eb84f', '#52b6e8', '#8a4f9d', '#ef6f8a'];
  for (let i = 0; i < 12; i++) {
    const t = (i + 0.5) / 12;
    const x = t * W;
    const y = 74 + Math.sin(t * Math.PI) * 32;
    ctx.fillStyle = dark ? 'rgba(180,200,225,0.25)' : flags[i % flags.length];
    ctx.beginPath();
    ctx.moveTo(x - 15, y);
    ctx.lineTo(x + 15, y);
    ctx.lineTo(x, y + 30);
    ctx.closePath();
    ctx.fill();
    // A fold down one side of each flag.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.beginPath();
    ctx.moveTo(x + 3, y);
    ctx.lineTo(x + 15, y);
    ctx.lineTo(x, y + 30);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * The ceiling lamp. Tapping it is what ends the nap.
 *
 * @param ctx where to draw
 * @param dark whether it is already off
 * @param ready whether tapping it would work
 * @param time seconds
 */
export function drawLamp(ctx: CanvasRenderingContext2D, dark: boolean, ready: boolean, time: number): void {
  ctx.strokeStyle = dark ? 'rgba(200,220,240,0.4)' : '#8a6a3c';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(LAMP.x, 0);
  ctx.lineTo(LAMP.x, LAMP.y - 22);
  ctx.stroke();

  if (!dark) {
    const glow = ctx.createRadialGradient(LAMP.x, LAMP.y, 8, LAMP.x, LAMP.y, 150);
    glow.addColorStop(0, 'rgba(255,240,190,0.6)');
    glow.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(LAMP.x, LAMP.y, 150, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = dark ? '#6d7a90' : '#f2b429';
  ctx.beginPath();
  ctx.moveTo(LAMP.x - 54, LAMP.y + 16);
  ctx.quadraticCurveTo(LAMP.x, LAMP.y - 48, LAMP.x + 54, LAMP.y + 16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.stroke();
  // The bulb under the shade: it is what the tap is aimed at, so it has to be
  // a thing and not the underside of a triangle.
  ctx.fillStyle = dark ? '#5c6880' : '#fff4c4';
  ctx.beginPath();
  ctx.ellipse(LAMP.x, LAMP.y + 26, 20, 18, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  if (ready && !dark) {
    const pulse = 0.5 + Math.sin(time * 3.4) * 0.5;
    ctx.strokeStyle = `rgba(94,184,79,${0.35 + pulse * 0.45})`;
    ctx.lineWidth = 6;
    ctx.setLineDash([12, 9]);
    ctx.lineDashOffset = -time * 30;
    ctx.beginPath();
    ctx.arc(LAMP.x, LAMP.y, LAMP.r + pulse * 5, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** The table the four of them sit at, drawn in front of them. */
export function drawTable(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#d99b5a';
  round(ctx, 40, 316, 620, 34, 14);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  round(ctx, 40, 316, 620, 34, 14);
  ctx.stroke();
  ctx.fillStyle = '#b87c3f';
  round(ctx, 84, 350, 26, 76, 8);
  ctx.fill();
  round(ctx, 590, 350, 26, 76, 8);
  ctx.fill();
}

/**
 * @param ctx where to draw
 * @param kid whose bed
 * @param dark whether the light is off
 */
export function drawBed(ctx: CanvasRenderingContext2D, kid: Kid, dark: boolean): void {
  const s = SEAT_AT[kid.seat];
  ctx.fillStyle = dark ? '#4c5a74' : '#a8d8c0';
  round(ctx, s.x - 66, s.y + 24, 132, 36, 10);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  round(ctx, s.x - 66, s.y + 24, 132, 36, 10);
  ctx.stroke();
}

/**
 * The blanket, drawn after the children rather than before them.
 *
 * Under the child it was a coloured bar sticking out at the sides, which is
 * not what being tucked in looks like.
 *
 * @param ctx where to draw
 * @param kid whose blanket
 * @param dark whether the light is off
 */
export function drawBlanket(ctx: CanvasRenderingContext2D, kid: Kid, dark: boolean): void {
  if (!kid.tucked) return;
  const s = SEAT_AT[kid.seat];
  ctx.fillStyle = dark ? '#7286a8' : '#f0a8b8';
  round(ctx, s.x - 64, s.y + 46, 128, 44, 14);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  round(ctx, s.x - 64, s.y + 46, 128, 44, 14);
  ctx.stroke();
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.5)';
  round(ctx, s.x - 58, s.y + 52, 116, 12, 6);
  ctx.fill();
}

/**
 * One child.
 *
 * @param ctx where to draw
 * @param kid who
 * @param mood -1 waiting, 0 calm, 1 pleased
 * @param asleep whether it is under a blanket
 * @param dark whether the light is off
 * @param time seconds
 */
export function drawKid(
  ctx: CanvasRenderingContext2D,
  kid: Kid,
  mood: number,
  asleep: boolean,
  dark: boolean,
  time: number,
): void {
  const coat = COAT[kid.animal] ?? COAT.cat;
  const s = SEAT_AT[kid.seat];
  const breathe = Math.sin(time * 2 + kid.seat) * 2.4;

  ctx.save();
  ctx.translate(s.x, s.y + breathe + (asleep ? 26 : 0));
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;

  // Its shadow, down and to the right like every other shadow here. Without
  // one a child floats in front of the room instead of standing in it.
  if (!asleep) {
    ctx.fillStyle = 'rgba(90, 60, 20, 0.18)';
    ctx.beginPath();
    ctx.ellipse(8, 88, 52, 13, 0, 0, TAU);
    ctx.fill();
  }

  // Body.
  ctx.fillStyle = coat[1];
  ctx.beginPath();
  ctx.ellipse(0, 46, 46, 40, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Ears.
  ctx.fillStyle = coat[1];
  if (kid.animal === 'cat') {
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * 14, -30);
      ctx.lineTo(sx * 38, -66);
      ctx.lineTo(sx * 42, -22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (kid.animal === 'dog') {
    // Clear of the head. Tucked closer they vanished behind the face and the
    // dog was indistinguishable from the bear.
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * 52, 10, 16, 32, sx * 0.2, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  } else if (kid.animal === 'bunny') {
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * 16, -62, 11, 32, sx * 0.16, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  } else if (kid.animal === 'bear') {
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sx * 32, -32, 14, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  } else if (kid.animal === 'pig') {
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * 16, -30);
      ctx.quadraticCurveTo(sx * 42, -56, sx * 40, -14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  // Head.
  const head = ctx.createRadialGradient(-14, -18, 6, 0, 0, 52);
  head.addColorStop(0, coat[0]);
  head.addColorStop(1, coat[1]);
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.ellipse(0, 0, 46, 44, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // Rim light along the top left, from the lamp.
  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(0, 0, 40, 38, 0, Math.PI * 1.05, Math.PI * 1.62);
  ctx.stroke();
  ctx.restore();

  // Eyes: shut when asleep, otherwise looking at you.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  for (const sx of [-1, 1]) {
    if (asleep) {
      ctx.beginPath();
      ctx.moveTo(sx * 17 - 8, -4);
      ctx.quadraticCurveTo(sx * 17, -12, sx * 17 + 8, -4);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx * 17, -4, 11, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(sx * 17 + 2, -2, 5.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx * 17 - 2, -6, 2.4, 0, TAU);
      ctx.fill();
    }
  }

  // Muzzle.
  ctx.fillStyle = kid.animal === 'pig' ? coat[2] : 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(0, 18, kid.animal === 'pig' ? 20 : 17, kid.animal === 'pig' ? 15 : 13, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (asleep) {
    ctx.arc(0, 20, 8, 0, Math.PI);
  } else if (mood > 0) {
    ctx.arc(0, 16, 15, 0.3, Math.PI - 0.3);
  } else if (mood < 0) {
    // Waiting: an open, hopeful mouth.
    ctx.ellipse(0, 24, 9, 7, 0, 0, TAU);
  } else {
    ctx.moveTo(-9, 22);
    ctx.lineTo(9, 22);
  }
  ctx.stroke();

  if (asleep && dark) {
    // Three Zs, rising.
    ctx.fillStyle = 'rgba(220,232,250,0.85)';
    ctx.font = 'bold 20px system-ui, sans-serif';
    for (let i = 0; i < 3; i++) {
      const p = ((time * 0.5 + i * 0.33) % 1);
      ctx.globalAlpha = 1 - p;
      ctx.fillText('z', 34 + p * 18, -44 - p * 40);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

/**
 * The bubble over a child who has asked for something.
 *
 * @param ctx where to draw
 * @param kid who
 * @param time seconds
 */
export function drawWish(ctx: CanvasRenderingContext2D, kid: Kid, time: number): void {
  const s = SEAT_AT[kid.seat];
  const bob = Math.sin(time * 4 + kid.seat) * 2;
  ctx.save();
  ctx.translate(s.x + 44, s.y - 72 + bob);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-16, 24);
  ctx.lineTo(-8, 42);
  ctx.lineTo(2, 26);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.scale(0.5, 0.5);
  drawFood(ctx, kid.wants);
  ctx.restore();
  ctx.restore();
}

/**
 * A thing to eat, drawn around 0,0 at about 100 units across.
 *
 * @param ctx where to draw
 * @param id which food
 */
export function drawFood(ctx: CanvasRenderingContext2D, id: FoodId): void {
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  if (id === 'apple') {
    ctx.fillStyle = '#e0453c';
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.bezierCurveTo(-46, -50, -44, 34, 0, 36);
    ctx.bezierCurveTo(44, 34, 46, -50, 0, -16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#6b4520';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(3, -40);
    ctx.stroke();
    ctx.fillStyle = '#5eb84f';
    ctx.beginPath();
    ctx.ellipse(18, -38, 14, 7, -0.5, 0, TAU);
    ctx.fill();

    return;
  }
  if (id === 'milk') {
    ctx.fillStyle = '#f7f9fb';
    ctx.beginPath();
    ctx.moveTo(-26, -30);
    ctx.lineTo(26, -30);
    ctx.lineTo(20, 40);
    ctx.lineTo(-20, 40);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#cfe6f2';
    ctx.beginPath();
    ctx.ellipse(0, -30, 26, 8, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();

    return;
  }
  if (id === 'porridge') {
    ctx.fillStyle = '#f4f7fa';
    ctx.beginPath();
    ctx.ellipse(0, 6, 46, 30, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8c98a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 36, 18, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#b2915f';
    ctx.lineWidth = 3;
    ctx.stroke();

    return;
  }
  if (id === 'banana') {
    ctx.fillStyle = '#f7cf3f';
    ctx.beginPath();
    ctx.moveTo(-42, -16);
    ctx.quadraticCurveTo(-16, 44, 42, 20);
    ctx.quadraticCurveTo(6, 30, -26, -22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    return;
  }
  if (id === 'bread') {
    ctx.fillStyle = '#dda44f';
    ctx.beginPath();
    ctx.moveTo(-40, 10);
    ctx.quadraticCurveTo(-40, -34, 0, -34);
    ctx.quadraticCurveTo(40, -34, 40, 10);
    ctx.lineTo(34, 34);
    ctx.lineTo(-34, 34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    return;
  }
  // A berry.
  ctx.fillStyle = '#c8365a';
  for (const [dx, dy] of [[-14, 6], [14, 6], [0, -12]] as [number, number][]) {
    ctx.beginPath();
    ctx.arc(dx, dy, 19, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.strokeStyle = '#5eb84f';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.lineTo(6, -46);
  ctx.stroke();
}

/**
 * @param ctx where to draw
 * @param toy which toy, at its own place
 * @param time seconds
 */
export function drawToy(ctx: CanvasRenderingContext2D, toy: Toy, time: number): void {
  ctx.save();
  ctx.translate(toy.x, toy.y + Math.sin(time * 3 + toy.id) * 2);
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  toyShape(ctx, toy.kind);
  ctx.restore();
}

function toyShape(ctx: CanvasRenderingContext2D, kind: ToyId): void {
  if (kind === 'ball') {
    ctx.fillStyle = '#e0453c';
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-26, -4);
    ctx.quadraticCurveTo(0, -18, 26, -4);
    ctx.stroke();

    return;
  }
  if (kind === 'cube') {
    ctx.fillStyle = '#52b6e8';
    round(ctx, -24, -24, 48, 48, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    round(ctx, -12, -12, 24, 24, 5);
    ctx.fill();

    return;
  }
  if (kind === 'bear') {
    ctx.fillStyle = '#a9764a';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sx * 18, -20, 10, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 25, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e0c39a';
    ctx.beginPath();
    ctx.ellipse(0, 8, 12, 9, 0, 0, TAU);
    ctx.fill();

    return;
  }
  if (kind === 'car') {
    ctx.fillStyle = '#f2b429';
    round(ctx, -30, -14, 60, 24, 7);
    ctx.fill();
    ctx.stroke();
    round(ctx, -16, -30, 30, 18, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3a3129';
    for (const dx of [-16, 16]) {
      ctx.beginPath();
      ctx.arc(dx, 12, 9, 0, TAU);
      ctx.fill();
    }

    return;
  }
  ctx.fillStyle = '#f7cf3f';
  ctx.beginPath();
  ctx.ellipse(0, 6, 26, 18, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(16, -14, 14, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ef8b2c';
  ctx.beginPath();
  ctx.moveTo(28, -14);
  ctx.lineTo(42, -10);
  ctx.lineTo(28, -6);
  ctx.closePath();
  ctx.fill();
}

/**
 * The toy box, with how much is still to go in it.
 *
 * @param ctx where to draw
 * @param left how many toys are still on the floor
 * @param time seconds
 */
export function drawBox(ctx: CanvasRenderingContext2D, left: number, time: number): void {
  ctx.save();
  ctx.translate(BOX.x, BOX.y);
  ctx.fillStyle = '#c98a3a';
  round(ctx, -62, -34, 124, 74, 12);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  round(ctx, -62, -34, 124, 74, 12);
  ctx.stroke();
  ctx.fillStyle = '#e0a860';
  round(ctx, -62, -34, 124, 18, 9);
  ctx.fill();
  if (left === 0) {
    const pulse = 0.5 + Math.sin(time * 4) * 0.5;
    ctx.fillStyle = `rgba(94,184,79,${0.3 + pulse * 0.4})`;
    round(ctx, -62, -34, 124, 74, 12);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * @param d the morning
 * @param x where the finger landed, in world units
 * @param y where the finger landed, in world units
 * @return which child was tapped, or -1
 */
export function seatAt(d: Day, x: number, y: number): number {
  for (const kid of d.kids) {
    const s = SEAT_AT[kid.seat];
    if (Math.hypot(x - s.x, y - s.y) <= SEAT_R) return kid.seat;
  }

  return -1;
}

/**
 * @param d the morning
 * @param x where the finger landed, in world units
 * @param y where the finger landed, in world units
 * @return which toy was tapped, or -1
 */
export function toyAt(d: Day, x: number, y: number): number {
  // Front to back, so a toy lying over another is picked up first.
  for (let i = d.toys.length - 1; i >= 0; i--) {
    const t = d.toys[i];
    if (!t.away && Math.hypot(x - t.x, y - t.y) <= 42) return t.id;
  }

  return -1;
}
