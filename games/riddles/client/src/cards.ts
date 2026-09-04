import { allCards, ANIMALS, CardId, COLOURS, SHAPES } from '@riddles/shared';

/**
 * Every card the game can put on the table, drawn to fill a 200x200 square.
 *
 * The animals are faces and not whole bodies: the card is small, the player is
 * three, and what a three-year-old recognises about a cow is the face.
 */

const TAU = Math.PI * 2;
const INK = '#3a3129';

/** Body, shade, and the one accent. */
const COAT: Record<string, [string, string, string]> = {
  cow: ['#f4efe6', '#cdc5b6', '#3a3129'],
  pig: ['#f2b1bd', '#cf8090', '#ffe0e6'],
  cat: ['#b9bec6', '#7d838d', '#f2b8c6'],
  dog: ['#c98f5d', '#96633a', '#3a3129'],
  duck: ['#f7d95c', '#c9a832', '#ef8b2c'],
  sheep: ['#f7f3ea', '#d6cfc2', '#5a5048'],
  frog: ['#7fc35a', '#4e8c36', '#e8f0c8'],
  hen: ['#f2efe6', '#cfc7b8', '#e0453c'],
};

function eyes(ctx: CanvasRenderingContext2D, dx: number, dy: number, r: number): void {
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(100 + sx * dx, dy, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(100 + sx * dx + 2, dy + 2, r * 0.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(100 + sx * dx, dy - 2, r * 0.2, 0, TAU);
    ctx.fill();
  }
}

/**
 * @param ctx where to draw, with the card's top left at 0,0 and 200 across
 * @param id which animal
 */
function face(ctx: CanvasRenderingContext2D, id: string): void {
  const coat = COAT[id];
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;

  // Ears and the like, behind the head.
  ctx.fillStyle = coat[1];
  if (id === 'cat') {
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(100 + sx * 26, 66);
      ctx.lineTo(100 + sx * 62, 20);
      ctx.lineTo(100 + sx * 68, 76);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (id === 'dog') {
    // Well clear of the head and hanging past the jaw: tucked in closer they
    // disappeared behind the face and the dog was a brown ball.
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(100 + sx * 82, 116, 24, 52, sx * 0.25, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  } else if (id === 'cow' || id === 'sheep') {
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(100 + sx * 74, 86, 26, 15, sx * 0.5, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    if (id === 'cow') {
      // Horns. Without them a cow is just a large animal with a patch on it.
      ctx.fillStyle = '#e8dcc0';
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(100 + sx * 40, 54);
        ctx.quadraticCurveTo(100 + sx * 76, 30, 100 + sx * 70, 8);
        ctx.quadraticCurveTo(100 + sx * 50, 24, 100 + sx * 26, 46);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = coat[1];
    }
  } else if (id === 'pig') {
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(100 + sx * 28, 62);
      ctx.quadraticCurveTo(100 + sx * 72, 26, 100 + sx * 68, 82);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (id === 'hen') {
    // Comb, which is the whole of what says hen.
    ctx.fillStyle = coat[2];
    ctx.beginPath();
    for (const dx of [-24, 0, 24]) ctx.arc(100 + dx, 44, 18, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // The head.
  const g = ctx.createRadialGradient(78, 82, 10, 100, 108, 90);
  g.addColorStop(0, coat[0]);
  g.addColorStop(1, coat[1]);
  ctx.fillStyle = g;
  ctx.beginPath();
  if (id === 'frog') ctx.ellipse(100, 116, 82, 66, 0, 0, TAU);
  else if (id === 'sheep') {
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * TAU;
      ctx.arc(100 + Math.cos(a) * 58, 106 + Math.sin(a) * 52, 24, 0, TAU);
    }
  } else ctx.ellipse(100, 108, 76, 72, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  if (id === 'cow') {
    ctx.fillStyle = coat[2];
    ctx.beginPath();
    ctx.ellipse(56, 78, 24, 18, -0.4, 0, TAU);
    ctx.fill();
  }
  if (id === 'sheep') {
    ctx.fillStyle = '#5a5048';
    ctx.beginPath();
    ctx.ellipse(100, 118, 46, 44, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  if (id === 'frog') {
    // Eyes on top, which is the only thing anybody draws about a frog.
    for (const sx of [-1, 1]) {
      ctx.fillStyle = coat[0];
      ctx.beginPath();
      ctx.arc(100 + sx * 44, 62, 30, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    eyes(ctx, 44, 62, 15);
  } else {
    eyes(ctx, id === 'sheep' ? 20 : 28, id === 'sheep' ? 110 : 96, id === 'sheep' ? 11 : 15);
  }

  // Muzzle, beak or bill.
  if (id === 'duck' || id === 'hen') {
    ctx.fillStyle = id === 'duck' ? coat[2] : '#e8a33c';
    ctx.beginPath();
    if (id === 'duck') ctx.ellipse(100, 142, 44, 22, 0, 0, TAU);
    else {
      ctx.moveTo(82, 132);
      ctx.lineTo(118, 132);
      ctx.lineTo(100, 158);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
  } else if (id === 'pig') {
    ctx.fillStyle = coat[2];
    ctx.beginPath();
    ctx.ellipse(100, 140, 34, 26, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(100 + sx * 12, 140, 5, 8, 0, 0, TAU);
      ctx.fill();
    }
  } else if (id === 'frog') {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(100, 116, 44, 0.35, Math.PI - 0.35);
    ctx.stroke();
  } else {
    ctx.fillStyle = id === 'cow' ? '#e8b0b8' : 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.ellipse(100, 140, id === 'cow' ? 40 : 30, id === 'cow' ? 28 : 22, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(100 + sx * 13, 136, 4.5, 6, 0, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(100, 146);
    ctx.quadraticCurveTo(100, 158, 88, 156);
    ctx.moveTo(100, 146);
    ctx.quadraticCurveTo(100, 158, 112, 156);
    ctx.stroke();
  }
}

function shape(ctx: CanvasRenderingContext2D, id: string): void {
  ctx.fillStyle = '#f2b429';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.beginPath();
  if (id === 'circle') ctx.arc(100, 104, 68, 0, TAU);
  else if (id === 'square') ctx.rect(36, 40, 128, 128);
  else if (id === 'triangle') {
    ctx.moveTo(100, 30);
    ctx.lineTo(174, 168);
    ctx.lineTo(26, 168);
    ctx.closePath();
  } else if (id === 'star') {
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const rr = i % 2 ? 32 : 74;
      const x = 100 + Math.cos(a) * rr;
      const y = 104 + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else {
    ctx.moveTo(100, 168);
    ctx.quadraticCurveTo(10, 108, 44, 58);
    ctx.quadraticCurveTo(80, 26, 100, 72);
    ctx.quadraticCurveTo(120, 26, 156, 58);
    ctx.quadraticCurveTo(190, 108, 100, 168);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
}

function apple(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = '#e0453c';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.5);
  ctx.bezierCurveTo(x - r * 1.4, y - r * 1.5, x - r * 1.35, y + r, x, y + r);
  ctx.bezierCurveTo(x + r * 1.35, y + r, x + r * 1.4, y - r * 1.5, x, y - r * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#6b4520';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.5);
  ctx.lineTo(x + 2, y - r * 1.15);
  ctx.stroke();
  ctx.fillStyle = '#5eb84f';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.55, y - r * 1.1, r * 0.42, r * 0.22, -0.5, 0, TAU);
  ctx.fill();
}

/**
 * @param ctx where to draw
 * @param n how many apples
 */
function apples(ctx: CanvasRenderingContext2D, n: number): void {
  // Laid out so the number can be seen without counting one by one, which is
  // how a child of four actually reads a small quantity.
  const spots: [number, number][][] = [
    [[100, 104]],
    [[62, 104], [138, 104]],
    [[100, 60], [62, 136], [138, 136]],
    [[62, 62], [138, 62], [62, 142], [138, 142]],
    [[58, 58], [142, 58], [100, 104], [58, 150], [142, 150]],
  ];
  const r = n <= 2 ? 34 : 26;
  for (const [x, y] of spots[n - 1]) apple(ctx, x, y, r);
}

export type Draw = (ctx: CanvasRenderingContext2D) => void;

const CARDS: Record<CardId, Draw> = {};
for (const a of ANIMALS) CARDS[`animal:${a.id}`] = (ctx) => face(ctx, a.id);
for (const c of COLOURS) {
  CARDS[`colour:${c.id}`] = (ctx) => {
    ctx.fillStyle = c.hex;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(100, 104, 70, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.ellipse(76, 76, 26, 16, -0.6, 0, TAU);
    ctx.fill();
  };
}
for (const s of SHAPES) CARDS[`shape:${s.id}`] = (ctx) => shape(ctx, s.id);
for (let n = 1; n <= 5; n++) CARDS[`count:${n}`] = (ctx) => apples(ctx, n);

/**
 * @param id which card
 * @return how to draw it
 */
export function drawerFor(id: CardId): Draw {
  const draw = CARDS[id];
  if (!draw) throw new Error(`nothing drawn for ${id}`);

  return draw;
}

/**
 * Checked at start-up rather than when a child taps a blank card: the
 * catalogue and the drawings are in different files and can drift apart.
 */
export function checkAll(): void {
  for (const id of allCards()) drawerFor(id);
}
