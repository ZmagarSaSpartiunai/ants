import { UnitType } from '@ants/shared';
import { alpha, shade, tint } from './theme.js';

/**
 * Bodies, not dots.
 *
 * These are drawn at four or five pixels across, so every stroke has to earn
 * its place: three segments and a suggestion of legs is enough for the eye to
 * call it an ant, and the silhouette is what tells worker from beetle from
 * wasp at a glance. The owner's colour goes on the back, where it is visible
 * against grass; the rest stays dark so a column reads as living things
 * crawling rather than as coloured pips sliding.
 *
 * `phase` is a walk cycle: legs and gait wobble with it. It is decoration and
 * comes from the clock, never from the simulation.
 */
/** Bodies are drawn at roughly life size for the board, then scaled to read. */
const SCALE = 1.7;

export function drawCreature(
  ctx: CanvasRenderingContext2D,
  unit: UnitType,
  x: number,
  y: number,
  angle: number,
  color: string,
  phase: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // Bodies are described at a natural size and then scaled up: at the size they
  // were first drawn they were legible only as specks.
  ctx.scale(SCALE, SCALE);
  if (unit === 'worker') ant(ctx, color, phase);
  else if (unit === 'beetle') beetle(ctx, color, phase);
  else wasp(ctx, color, phase);
  ctx.restore();
}

/** A short shadow below and right of everything, per the board's light. */
function shadow(ctx: CanvasRenderingContext2D, w: number, h: number, lift: number): void {
  ctx.fillStyle = `rgba(0,0,0,${0.34 - lift * 0.12})`;
  ctx.beginPath();
  ctx.ellipse(0.8 + lift * 2, 1.1 + lift * 3, w, h, 0, 0, Math.PI * 2);
  ctx.fill();
}

function legs(ctx: CanvasRenderingContext2D, spread: number, phase: number, dark: string): void {
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.7;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    // Opposite sides swing out of step, which is what makes it look like walking.
    const swing = Math.sin(phase + i * 1.9) * 1.1;
    const at = -1.4 + i * 1.5;
    ctx.beginPath();
    ctx.moveTo(at, 0);
    ctx.lineTo(at + swing, -spread);
    ctx.moveTo(at, 0);
    ctx.lineTo(at - swing, spread);
    ctx.stroke();
  }
}

function ant(ctx: CanvasRenderingContext2D, color: string, phase: number): void {
  const dark = shade(color, 0.3);
  shadow(ctx, 3, 1.6, 0);
  legs(ctx, 2.4, phase, dark);

  // Gaster, thorax, head -- the three lumps that say "ant".
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(-2.6, 0, 2.1, 1.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(-0.2, 0, 1.5, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(2, 0, 1.3, 1.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // A highlight on the back, so the body looks round rather than flat.
  ctx.fillStyle = alpha(tint(color, 0.5), 0.8);
  ctx.beginPath();
  ctx.ellipse(-2.7, -0.5, 1, 0.6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(2.8, -0.4);
  ctx.lineTo(4.2, -1.4);
  ctx.moveTo(2.8, 0.4);
  ctx.lineTo(4.2, 1.4);
  ctx.stroke();
}

function beetle(ctx: CanvasRenderingContext2D, color: string, phase: number): void {
  const dark = shade(color, 0.24);
  shadow(ctx, 4.4, 2.4, 0);
  legs(ctx, 3.2, phase * 0.7, dark);

  // One heavy armoured shell: wider and blunter than an ant at a glance.
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(-0.4, 0, 4.4, 3.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(-0.6, -0.3, 3.9, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // The split down the elytra, and a hard glint off the shell.
  ctx.strokeStyle = alpha(dark, 0.9);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-4.2, 0);
  ctx.lineTo(2.6, 0);
  ctx.stroke();
  ctx.fillStyle = alpha(tint(color, 0.65), 0.75);
  ctx.beginPath();
  ctx.ellipse(-1.6, -1.4, 1.6, 0.8, -0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(3.4, 0, 1.7, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Horns: the reason you do not want to meet one head on.
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(4.4, -0.9);
  ctx.lineTo(6.2, -2);
  ctx.moveTo(4.4, 0.9);
  ctx.lineTo(6.2, 2);
  ctx.stroke();
}

function wasp(ctx: CanvasRenderingContext2D, color: string, phase: number): void {
  const dark = shade(color, 0.26);
  // In the air, so the shadow sits further away and is fainter.
  shadow(ctx, 3.2, 1.5, 1);

  // Wings blur: two pale ellipses beating out of phase.
  const beat = 0.55 + Math.abs(Math.sin(phase * 3)) * 0.45;
  ctx.fillStyle = `rgba(232,244,255,${0.3 * beat})`;
  ctx.beginPath();
  ctx.ellipse(-0.5, -2.6 * beat, 3.4, 1.3, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-0.5, 2.6 * beat, 3.4, 1.3, 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(-2.4, 0, 2.4, 1.7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Stripes on the abdomen: the one marking everyone recognises.
  ctx.fillStyle = color;
  for (const at of [-3.2, -1.9]) {
    ctx.beginPath();
    ctx.ellipse(at, 0, 0.55, 1.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(0.4, 0, 1.5, 1.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(2.3, 0, 1.2, 1.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sting.
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-4.6, 0);
  ctx.lineTo(-6, 0);
  ctx.stroke();
}
