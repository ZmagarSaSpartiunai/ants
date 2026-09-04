import { SpotId, ToolId } from '@doctor/shared';

/**
 * The surgery, the patient and the tray.
 *
 * Every animal sits in the same place and is the same size, so a sore paw is
 * always in the same corner of the screen. A child of three learns where to
 * look once; moving it about for the sake of variety would make them learn it
 * again with every patient.
 */

export const W = 700;
export const H = 480;
const TAU = Math.PI * 2;
const INK = '#3a3129';

/** Where each place is, and how big a target it makes. */
export const SPOT_AT: Record<SpotId, { x: number; y: number; r: number }> = {
  forehead: { x: 350, y: 116, r: 52 },
  mouth: { x: 350, y: 196, r: 46 },
  chest: { x: 350, y: 306, r: 58 },
  paw: { x: 250, y: 430, r: 52 },
  dirt1: { x: 276, y: 300, r: 40 },
  dirt2: { x: 424, y: 336, r: 40 },
  dirt3: { x: 356, y: 246, r: 36 },
  // Tested last: it covers the whole patient, so a hug lands wherever it is
  // aimed. Any earlier and it would swallow every other place.
  body: { x: 350, y: 280, r: 200 },
};

const ORDER: SpotId[] = ['forehead', 'mouth', 'dirt3', 'dirt1', 'chest', 'dirt2', 'paw', 'body'];

/**
 * @param x where the finger landed, in world units
 * @param y where the finger landed, in world units
 * @return the place under it, or null
 */
export function hitSpot(x: number, y: number): SpotId | null {
  for (const id of ORDER) {
    const s = SPOT_AT[id];
    if (Math.hypot(x - s.x, y - s.y) <= s.r) return id;
  }

  return null;
}

const COAT: Record<string, [string, string, string]> = {
  cat: ['#b9bec6', '#7d838d', '#f2b8c6'],
  dog: ['#c98f5d', '#96633a', '#3a3129'],
  bunny: ['#f2eae0', '#cfc3b4', '#f2b8c6'],
  bear: ['#a9764a', '#7a5330', '#e0c39a'],
  pig: ['#f2b1bd', '#cf8090', '#ffe0e6'],
  frog: ['#7fc35a', '#4e8c36', '#e8f0c8'],
};

/**
 * The room behind everything, painted once into an offscreen canvas.
 *
 * Light comes from the top left and every shadow falls down and to the right,
 * the same rule the rest of the shelf follows. For a game aimed at children
 * that is not decoration: it is what makes a flat canvas read as a room with
 * things standing in it rather than as shapes lying on a background.
 */
export function drawRoom(ctx: CanvasRenderingContext2D): void {
  const floorY = 352;

  // Wall, warm at the top left where the light is.
  const wall = ctx.createLinearGradient(0, 0, W * 0.7, floorY);
  wall.addColorStop(0, '#eaf6f7');
  wall.addColorStop(1, '#cfe3e6');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, floorY);

  // Floor, receding: the boards converge a little, so there is a room.
  ctx.fillStyle = '#d8c3a0';
  ctx.fillRect(0, floorY, W, H - floorY);
  ctx.strokeStyle = 'rgba(140, 110, 74, 0.3)';
  ctx.lineWidth = 2;
  for (let i = -3; i <= 10; i++) {
    const x = i * 82;
    ctx.beginPath();
    ctx.moveTo(x, floorY);
    ctx.lineTo(x - 46, H);
    ctx.stroke();
  }
  for (const [y, a] of [[floorY + 34, 0.22], [floorY + 84, 0.16]] as [number, number][]) {
    ctx.strokeStyle = `rgba(140, 110, 74, ${a})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Skirting, which is most of what tells the eye where the wall stops.
  ctx.fillStyle = '#f4fbfb';
  ctx.fillRect(0, floorY - 16, W, 16);
  ctx.fillStyle = 'rgba(90, 120, 126, 0.35)';
  ctx.fillRect(0, floorY - 3, W, 5);

  // A rug under the couch. Blue, it read as a puddle on the floor.
  ctx.fillStyle = '#e0b878';
  ctx.beginPath();
  ctx.ellipse(350, 430, 268, 58, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#c99a56';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.ellipse(350, 430, 232, 46, 0, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 244, 220, 0.5)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(350, 430, 206, 38, 0, 0, TAU);
  ctx.stroke();

  window_(ctx, 46, 44);
  cabinet(ctx, 556, 176);
  chart(ctx, 226, 40);
  plant(ctx, 116, 300);
  couch(ctx);
}

/**
 * A window with something behind it, because a blue rectangle is a poster.
 *
 * @param ctx where to draw
 * @param x left edge
 * @param y top edge
 */
function window_(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const w = 148;
  const h = 118;
  const sky = ctx.createLinearGradient(x, y, x, y + h);
  sky.addColorStop(0, '#8fd0ee');
  sky.addColorStop(1, '#d6f0f6');
  ctx.fillStyle = sky;
  round(ctx, x, y, w, h, 8);
  ctx.fill();
  // A hill and a sun, so there is an outside.
  ctx.save();
  round(ctx, x, y, w, h, 8);
  ctx.clip();
  ctx.fillStyle = '#ffe9a8';
  ctx.beginPath();
  ctx.arc(x + 112, y + 30, 20, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#8dc86e';
  ctx.beginPath();
  ctx.ellipse(x + 40, y + 132, 78, 46, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#7bb85e';
  ctx.beginPath();
  ctx.ellipse(x + 128, y + 138, 62, 40, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 10;
  round(ctx, x, y, w, h, 8);
  ctx.stroke();
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h);
  ctx.moveTo(x, y + h / 2);
  ctx.lineTo(x + w, y + h / 2);
  ctx.stroke();
  // Sill, with its shadow underneath.
  ctx.fillStyle = '#ffffff';
  round(ctx, x - 12, y + h, w + 24, 12, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(70, 100, 108, 0.2)';
  round(ctx, x - 8, y + h + 12, w + 20, 7, 4);
  ctx.fill();
}

/**
 * The cabinet the medicine comes out of.
 *
 * @param ctx where to draw
 * @param x left edge
 * @param y top edge
 */
function cabinet(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = 'rgba(60, 90, 96, 0.18)';
  round(ctx, x + 6, y + 8, 112, 168, 10);
  ctx.fill();
  ctx.fillStyle = '#f6fbfb';
  round(ctx, x, y, 112, 168, 10);
  ctx.fill();
  ctx.strokeStyle = '#a9c6cb';
  ctx.lineWidth = 4;
  round(ctx, x, y, 112, 168, 10);
  ctx.stroke();

  // Two shelves of jars.
  for (const [row, jars] of [[0, ['#ef8b8b', '#8fd0ee', '#f2cf6a']], [1, ['#a7dba0', '#c9a6e0']]] as [number, string[]][]) {
    const shelfY = y + 62 + row * 62;
    ctx.fillStyle = '#dceaec';
    ctx.fillRect(x + 8, shelfY, 96, 6);
    jars.forEach((tint, i) => {
      const jx = x + 22 + i * 30;
      ctx.fillStyle = tint;
      round(ctx, jx - 11, shelfY - 34, 22, 34, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(60, 90, 96, 0.5)';
      ctx.lineWidth = 2.5;
      round(ctx, jx - 11, shelfY - 34, 22, 34, 5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      round(ctx, jx - 7, shelfY - 30, 6, 20, 3);
      ctx.fill();
    });
  }

  // A red cross on the door, which every child already reads.
  ctx.fillStyle = '#e0453c';
  round(ctx, x + 46, y + 12, 20, 34, 5);
  ctx.fill();
  round(ctx, x + 39, y + 19, 34, 20, 5);
  ctx.fill();
}

/**
 * The height chart on the wall. It is only scenery, but a room with nothing on
 * the walls is a stage set.
 *
 * @param ctx where to draw
 * @param x centre
 * @param y top
 */
function chart(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#fdfaf0';
  round(ctx, x - 16, y, 32, 250, 6);
  ctx.fill();
  ctx.strokeStyle = '#c9b48c';
  ctx.lineWidth = 3;
  round(ctx, x - 16, y, 32, 250, 6);
  ctx.stroke();
  ctx.strokeStyle = '#c9b48c';
  ctx.lineWidth = 2.5;
  for (let i = 1; i < 13; i++) {
    const ty = y + i * 19;
    ctx.beginPath();
    ctx.moveTo(x - 16, ty);
    ctx.lineTo(x - (i % 2 ? 4 : 2), ty);
    ctx.stroke();
  }
}

/**
 * @param ctx where to draw
 * @param x the pot's centre
 * @param y the pot's top
 */
function plant(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#5fa34a';
  for (const [dx, dy, r, rot] of [
    [-34, -46, 30, -0.7],
    [0, -66, 26, 0],
    [34, -44, 28, 0.7],
    [-18, -18, 24, -0.4],
    [20, -16, 24, 0.4],
  ] as [number, number, number, number][]) {
    ctx.save();
    ctx.translate(x + dx, y + dy);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.52, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(40, 90, 40, 0.25)';
  ctx.beginPath();
  ctx.ellipse(x + 6, y + 78, 46, 12, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#d98f5a';
  ctx.beginPath();
  ctx.moveTo(x - 34, y);
  ctx.lineTo(x + 34, y);
  ctx.lineTo(x + 26, y + 74);
  ctx.lineTo(x - 26, y + 74);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 226, 190, 0.45)';
  ctx.beginPath();
  ctx.moveTo(x - 30, y + 8);
  ctx.lineTo(x - 16, y + 8);
  ctx.lineTo(x - 20, y + 68);
  ctx.lineTo(x - 26, y + 68);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c07a45';
  round(ctx, x - 38, y - 8, 76, 16, 5);
  ctx.fill();
}

/** The couch the patient sits on, with legs and a paper roll. */
function couch(ctx: CanvasRenderingContext2D): void {
  // Its shadow on the floor first.
  ctx.fillStyle = 'rgba(90, 70, 40, 0.22)';
  ctx.beginPath();
  ctx.ellipse(362, 468, 232, 26, 0, 0, TAU);
  ctx.fill();

  // Legs.
  ctx.fillStyle = '#4d7f8c';
  round(ctx, 176, 448, 30, 34, 6);
  ctx.fill();
  round(ctx, 494, 448, 30, 34, 6);
  ctx.fill();

  // The padded top.
  const pad = ctx.createLinearGradient(0, 384, 0, 452);
  pad.addColorStop(0, '#a8dbe6');
  pad.addColorStop(1, '#6ba9b8');
  ctx.fillStyle = pad;
  round(ctx, 130, 384, 440, 68, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40, 80, 90, 0.55)';
  ctx.lineWidth = 4;
  round(ctx, 130, 384, 440, 68, 18);
  ctx.stroke();
  // Light along the top edge, shadow along the bottom.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  round(ctx, 142, 390, 416, 12, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(30, 70, 80, 0.18)';
  round(ctx, 142, 436, 416, 10, 5);
  ctx.fill();
  // The paper roll along it.
  ctx.fillStyle = '#fdfaf2';
  round(ctx, 196, 380, 310, 16, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40, 80, 90, 0.35)';
  ctx.lineWidth = 2.5;
  round(ctx, 196, 380, 310, 16, 6);
  ctx.stroke();
}

/**
 * The patient, sitting up.
 *
 * @param ctx where to draw
 * @param animal which one
 * @param mood -1 sore, 0 patient, 1 better
 * @param time seconds, for breathing
 */
export function drawPatient(
  ctx: CanvasRenderingContext2D,
  animal: string,
  mood: number,
  time: number,
): void {
  const coat = COAT[animal] ?? COAT.cat;
  const breathe = Math.sin(time * 2) * 3;

  ctx.save();
  ctx.translate(0, breathe);
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;

  // Its shadow on the couch, so it is sitting on something rather than in
  // front of it. Offset down and right, like every other shadow here.
  ctx.fillStyle = 'rgba(30, 70, 80, 0.22)';
  ctx.beginPath();
  ctx.ellipse(362, 430, 150, 22, 0, 0, TAU);
  ctx.fill();

  // Feet, below the body rather than behind it. Tucked in at the old height
  // the belly covered them, and the sore paw -- the thing the child has to aim
  // at -- was a sliver poking out of the side.
  ctx.fillStyle = coat[1];
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(350 + sx * 100, 430, 48, 33, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = coat[2];
    ctx.beginPath();
    ctx.ellipse(350 + sx * 100, 432, 27, 17, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = coat[1];
  }

  // Ears, behind the head.
  ctx.fillStyle = coat[1];
  if (animal === 'cat') {
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(350 + sx * 30, 78);
      ctx.lineTo(350 + sx * 74, 20);
      ctx.lineTo(350 + sx * 82, 92);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (animal === 'dog') {
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(350 + sx * 96, 152, 26, 58, sx * 0.22, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  } else if (animal === 'bunny') {
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(350 + sx * 34, 20, 22, 62, sx * 0.16, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  } else if (animal === 'bear' || animal === 'pig') {
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      if (animal === 'bear') ctx.ellipse(350 + sx * 68, 72, 26, 26, 0, 0, TAU);
      else {
        ctx.moveTo(350 + sx * 34, 74);
        ctx.quadraticCurveTo(350 + sx * 84, 30, 350 + sx * 80, 98);
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
    }
  }

  // Body.
  const bodyFill = ctx.createRadialGradient(300, 250, 20, 350, 320, 170);
  bodyFill.addColorStop(0, coat[0]);
  bodyFill.addColorStop(1, coat[1]);
  ctx.fillStyle = bodyFill;
  ctx.beginPath();
  ctx.ellipse(350, 310, 122, 108, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = coat[2];
  ctx.beginPath();
  ctx.ellipse(350, 326, 70, 66, 0, 0, TAU);
  ctx.fill();
  // A light along the top left of the belly and a shadow under it: the same
  // lamp that lights the room lights the animal.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.beginPath();
  ctx.ellipse(316, 274, 52, 26, -0.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(40, 30, 20, 0.12)';
  ctx.beginPath();
  ctx.ellipse(392, 386, 74, 24, 0.2, 0, TAU);
  ctx.fill();

  // Arms.
  ctx.fillStyle = coat[1];
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(350 + sx * 118, 300, 30, 52, sx * 0.3, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // Head.
  const headFill = ctx.createRadialGradient(316, 108, 12, 350, 150, 110);
  headFill.addColorStop(0, coat[0]);
  headFill.addColorStop(1, coat[1]);
  ctx.fillStyle = headFill;
  ctx.beginPath();
  if (animal === 'frog') ctx.ellipse(350, 158, 106, 86, 0, 0, TAU);
  else ctx.ellipse(350, 152, 96, 92, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // Rim light along the top left of the head.
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.ellipse(350, 152, 88, 84, 0, Math.PI * 1.05, Math.PI * 1.62);
  ctx.stroke();
  ctx.restore();

  if (animal === 'frog') {
    for (const sx of [-1, 1]) {
      ctx.fillStyle = coat[0];
      ctx.beginPath();
      ctx.arc(350 + sx * 54, 94, 34, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Eyes. They close a little when it hurts and open wide when it is over.
  const eyeY = animal === 'frog' ? 94 : 140;
  const eyeX = animal === 'frog' ? 54 : 36;
  const squint = mood < 0 ? 0.45 : 1;
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(350 + sx * eyeX, eyeY, 20, 20 * squint, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(350 + sx * eyeX + 3, eyeY + 2, 9, 9 * squint, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(350 + sx * eyeX - 2, eyeY - 4, 3.6, 0, TAU);
    ctx.fill();
  }

  // Muzzle and mouth.
  ctx.fillStyle = animal === 'pig' ? coat[2] : 'rgba(255,255,255,0.62)';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  if (animal !== 'frog') {
    ctx.beginPath();
    ctx.ellipse(350, 196, animal === 'pig' ? 44 : 38, animal === 'pig' ? 32 : 28, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = INK;
  if (animal === 'pig') {
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(350 + sx * 15, 196, 6, 9, 0, 0, TAU);
      ctx.fill();
    }
  } else if (animal !== 'frog') {
    ctx.beginPath();
    ctx.ellipse(350, 182, 11, 8, 0, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (mood > 0) ctx.arc(350, 196, 32, 0.35, Math.PI - 0.35);
  else if (mood < 0) ctx.arc(350, 232, 30, Math.PI + 0.45, -0.45);
  else {
    ctx.moveTo(330, 212);
    ctx.lineTo(370, 212);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * What is wrong, drawn where it is wrong.
 *
 * @param ctx where to draw
 * @param ailment which complaint
 * @param done how many steps have already been dealt with
 * @param time seconds
 */
export function drawAilment(
  ctx: CanvasRenderingContext2D,
  ailment: string,
  done: number,
  time: number,
): void {
  const breathe = Math.sin(time * 2) * 3;
  ctx.save();
  ctx.translate(0, breathe);
  ctx.lineCap = 'round';

  if (ailment === 'scratch' || ailment === 'thorn') {
    const paw = SPOT_AT.paw;
    if (ailment === 'thorn' && done === 0) {
      ctx.strokeStyle = '#5a4126';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(paw.x - 4, paw.y - 34);
      ctx.lineTo(paw.x + 6, paw.y + 6);
      ctx.stroke();
    }
    if ((ailment === 'scratch' && done === 0) || (ailment === 'thorn' && done <= 1)) {
      ctx.strokeStyle = '#d63a30';
      ctx.lineWidth = 5;
      for (const dy of [-8, 4]) {
        ctx.beginPath();
        ctx.moveTo(paw.x - 24, paw.y + dy);
        ctx.lineTo(paw.x + 22, paw.y + dy + 6);
        ctx.stroke();
      }
    } else {
      plaster(ctx, paw.x, paw.y);
    }
  }

  if (ailment === 'dirt') {
    const spots: [SpotId, number][] = [['dirt1', 0], ['dirt2', 1], ['dirt3', 2]];
    for (const [id, n] of spots) {
      if (done > n) continue;
      const s = SPOT_AT[id];
      // Outlined and light: a plain brown blob vanished on a brown animal, and
      // the one thing this game asks is that you can see what is wrong.
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        ctx.moveTo(s.x + Math.cos(a) * 16 + 14, s.y + Math.sin(a) * 13);
        ctx.arc(s.x + Math.cos(a) * 16, s.y + Math.sin(a) * 13, 14, 0, TAU);
      }
      ctx.fillStyle = '#8a6a3c';
      ctx.fill();
      ctx.strokeStyle = '#4a3418';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = '#5f4522';
      for (const [dx, dy] of [[-10, -4], [8, 6], [0, -12]] as [number, number][]) {
        ctx.beginPath();
        ctx.arc(s.x + dx, s.y + dy, 4.5, 0, TAU);
        ctx.fill();
      }
    }
  }

  if (ailment === 'fever' && done === 0) {
    const f = SPOT_AT.forehead;
    ctx.fillStyle = 'rgba(224,69,60,0.45)';
    ctx.beginPath();
    ctx.ellipse(f.x, f.y, 56, 32, 0, 0, TAU);
    ctx.fill();
    // Steam, because a hot forehead has to look hot.
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 5;
    for (const dx of [-34, 0, 34]) {
      ctx.beginPath();
      ctx.moveTo(f.x + dx, f.y - 46);
      ctx.quadraticCurveTo(f.x + dx + 12, f.y - 66 + Math.sin(time * 4 + dx) * 4, f.x + dx, f.y - 86);
      ctx.stroke();
    }
  }

  if (ailment === 'tooth' && done === 0) {
    ctx.fillStyle = 'rgba(224,69,60,0.4)';
    ctx.beginPath();
    ctx.ellipse(430, 196, 40, 34, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.5;
    round(ctx, 336, 206, 28, 26, 5);
    ctx.fill();
    ctx.stroke();
  }

  if (ailment === 'cough' && done === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 3; i++) {
      const p = ((time * 0.9 + i * 0.33) % 1);
      ctx.globalAlpha = 1 - p;
      ctx.beginPath();
      ctx.arc(470 + p * 90, 210 - p * 40, 12 + p * 18, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (ailment === 'sad' && done === 0) {
    ctx.fillStyle = '#6fc6e8';
    for (const sx of [-1, 1]) {
      const drop = ((time * 0.7 + (sx > 0 ? 0.4 : 0)) % 1);
      ctx.beginPath();
      ctx.ellipse(350 + sx * 36, 168 + drop * 70, 8, 12, 0, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** A plaster, which is also what gets left behind once a paw is mended. */
function plaster(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.35);
  ctx.fillStyle = '#e8c79a';
  ctx.strokeStyle = '#b2915f';
  ctx.lineWidth = 3;
  round(ctx, -34, -13, 68, 26, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f4e2c6';
  round(ctx, -13, -10, 26, 20, 5);
  ctx.fill();
  ctx.fillStyle = '#c8a878';
  for (const dx of [-24, 20]) {
    for (const dy of [-5, 3]) {
      ctx.beginPath();
      ctx.arc(dx, dy, 2.4, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * A tool, drawn to fill a 120x120 square with its middle at 60,60.
 *
 * @param ctx where to draw
 * @param id which tool
 */
export function drawTool(ctx: CanvasRenderingContext2D, id: ToolId): void {
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  if (id === 'plaster') {
    ctx.save();
    ctx.translate(60, 60);
    ctx.scale(1.2, 1.2);
    plaster(ctx, 0, 0);
    ctx.restore();

    return;
  }
  if (id === 'sponge') {
    ctx.fillStyle = '#f2d05c';
    round(ctx, 16, 34, 88, 52, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(180,140,40,0.5)';
    for (const [x, y] of [[36, 52], [62, 68], [84, 48], [50, 74]] as [number, number][]) {
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, TAU);
      ctx.fill();
    }

    return;
  }
  if (id === 'thermometer') {
    ctx.fillStyle = '#f4f7fa';
    round(ctx, 52, 14, 16, 82, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e0453c';
    ctx.beginPath();
    ctx.arc(60, 96, 15, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e0453c';
    round(ctx, 56, 62, 8, 34, 4);
    ctx.fill();

    return;
  }
  if (id === 'syrup') {
    ctx.fillStyle = '#d67ab0';
    round(ctx, 30, 40, 60, 62, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f4dff0';
    round(ctx, 38, 62, 44, 26, 6);
    ctx.fill();
    ctx.fillStyle = '#9a5c86';
    round(ctx, 46, 16, 28, 26, 6);
    ctx.fill();
    ctx.stroke();

    return;
  }
  if (id === 'brush') {
    ctx.fillStyle = '#52b6e8';
    round(ctx, 46, 40, 18, 66, 9);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f4f7fa';
    round(ctx, 36, 14, 38, 30, 8);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#cfd8de';
    ctx.lineWidth = 3;
    for (const x of [44, 55, 66]) {
      ctx.beginPath();
      ctx.moveTo(x, 16);
      ctx.lineTo(x, 42);
      ctx.stroke();
    }

    return;
  }
  if (id === 'tweezers') {
    ctx.strokeStyle = '#9aa3ab';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(44, 14);
    ctx.quadraticCurveTo(40, 70, 52, 104);
    ctx.moveTo(76, 14);
    ctx.quadraticCurveTo(80, 70, 68, 104);
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(44, 14);
    ctx.lineTo(76, 14);
    ctx.stroke();

    return;
  }
  if (id === 'stethoscope') {
    ctx.strokeStyle = '#3559c7';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(30, 18);
    ctx.quadraticCurveTo(26, 70, 58, 78);
    ctx.moveTo(90, 18);
    ctx.quadraticCurveTo(94, 70, 62, 78);
    ctx.stroke();
    ctx.fillStyle = '#9aa3ab';
    ctx.beginPath();
    ctx.arc(60, 92, 20, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.stroke();

    return;
  }
  // A heart, for a hug.
  ctx.fillStyle = '#ef6f8a';
  ctx.beginPath();
  ctx.moveTo(60, 100);
  ctx.quadraticCurveTo(10, 62, 26, 34);
  ctx.quadraticCurveTo(46, 12, 60, 42);
  ctx.quadraticCurveTo(74, 12, 94, 34);
  ctx.quadraticCurveTo(110, 62, 60, 100);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
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
