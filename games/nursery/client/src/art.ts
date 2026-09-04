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
 * @param ctx where to draw
 * @param dark whether the light is off
 */
export function drawRoom(ctx: CanvasRenderingContext2D, dark: boolean): void {
  const wall = ctx.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0, dark ? '#2c3a52' : '#f6e6c8');
  wall.addColorStop(1, dark ? '#1d2739' : '#fbf3e2');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, H);

  // A stripe of colour along the wall, the way nurseries are painted.
  ctx.fillStyle = dark ? 'rgba(120,150,190,0.18)' : '#a8d8c0';
  ctx.fillRect(0, 300, W, 26);
  ctx.fillStyle = dark ? '#25324a' : '#e2cfa8';
  ctx.fillRect(0, 326, W, H - 326);

  // Bunting, because a nursery has bunting.
  ctx.strokeStyle = dark ? 'rgba(200,220,240,0.3)' : '#c9a26a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 104);
  ctx.quadraticCurveTo(W / 2, 132, W, 104);
  ctx.stroke();
  const flags = ['#e0453c', '#f2b429', '#5eb84f', '#52b6e8', '#8a4f9d', '#ef6f8a'];
  for (let i = 0; i < 12; i++) {
    const t = (i + 0.5) / 12;
    const x = t * W;
    const y = 104 + Math.sin(t * Math.PI) * 28;
    ctx.fillStyle = dark ? 'rgba(180,200,225,0.25)' : flags[i % flags.length];
    ctx.beginPath();
    ctx.moveTo(x - 15, y);
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
