import { FIELD_H, FIELD_W } from '@ants/shared';
import { GRASS_DEEP, GRASS_LIGHT, GRASS_MID, SOIL_DARK, SOIL_MID } from './theme.js';

/**
 * The meadow is painted once into an offscreen canvas and then blitted every
 * frame. Drawing forty thousand grass blades per frame would be absurd; drawing
 * them once costs a few milliseconds at startup and the board stops looking
 * like a diagram.
 *
 * All of this randomness is visual, so it uses Math.random deliberately -- game
 * randomness goes through the seeded generator in the simulation and must never
 * be mixed with decoration.
 */
export function buildMeadow(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = FIELD_W;
  c.height = FIELD_H;
  const ctx = c.getContext('2d')!;

  const base = ctx.createLinearGradient(0, 0, FIELD_W * 0.4, FIELD_H);
  base.addColorStop(0, GRASS_LIGHT);
  base.addColorStop(0.5, GRASS_MID);
  base.addColorStop(1, GRASS_DEEP);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);

  // Broad, gentle patches so the green is never flat. Kept faint on purpose:
  // strong blotches read as stains on the picture rather than as ground.
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * FIELD_W;
    const y = Math.random() * FIELD_H;
    const r = 70 + Math.random() * 170;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = Math.random() < 0.6;
    g.addColorStop(0, light ? 'rgba(126,168,84,0.13)' : 'rgba(28,50,22,0.13)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bare earth showing through here and there, small and soft-edged.
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * FIELD_W;
    const y = Math.random() * FIELD_H;
    const r = 18 + Math.random() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const soil = Math.random() < 0.5 ? SOIL_MID : SOIL_DARK;
    g.addColorStop(0, soil);
    g.addColorStop(0.6, soil);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.55 + Math.random() * 0.3), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  blades(ctx);
  clutter(ctx);

  // The vignette used to be baked in here. It lives in the scenery layer now,
  // on top of the trees, so that the growth around the edge falls into the
  // same shadow as the ground it stands on.

  return c;
}

function blades(ctx: CanvasRenderingContext2D): void {
  ctx.lineCap = 'round';
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * FIELD_W;
    const y = Math.random() * FIELD_H;
    const h = 4 + Math.random() * 9;
    const lean = (Math.random() - 0.5) * 6;
    const lit = Math.random();
    // All three tones stay green: a near-white blade reads as a scratch on the
    // canvas rather than as grass catching the light.
    ctx.strokeStyle = lit > 0.8 ? 'rgb(122,164,74)' : lit > 0.45 ? GRASS_LIGHT : GRASS_DEEP;
    ctx.globalAlpha = 0.16 + Math.random() * 0.24;
    ctx.lineWidth = Math.random() < 0.2 ? 1.4 : 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    // A slight curve reads as a blade; a straight line reads as a scratch.
    ctx.quadraticCurveTo(x + lean * 0.4, y - h * 0.6, x + lean, y - h);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function clutter(ctx: CanvasRenderingContext2D): void {
  // Pebbles, each with its own little shadow so the ground has depth.
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * FIELD_W;
    const y = Math.random() * FIELD_H;
    const r = 1.6 + Math.random() * 3.4;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x + r * 0.4, y + r * 0.5, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    const grey = 120 + Math.random() * 70;
    ctx.fillStyle = `rgb(${grey},${grey - 8},${grey - 22})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.72, Math.random(), 0, Math.PI * 2);
    ctx.fill();
  }

  // Wildflowers, scattered thinly over the whole meadow. Two or three pixels
  // across on purpose: enough to warm the green up, too small to be mistaken
  // for anything that belongs to a player.
  for (let i = 0; i < 150; i++) {
    const x = Math.random() * FIELD_W;
    const y = Math.random() * FIELD_H;
    const r = Math.random();
    ctx.fillStyle = r < 0.5 ? 'rgba(236,232,214,0.7)' : r < 0.82 ? 'rgba(228,196,110,0.65)' : 'rgba(196,168,220,0.6)';
    ctx.beginPath();
    ctx.arc(x, y, 1 + Math.random() * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  // A few fallen leaves.
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * FIELD_W;
    const y = Math.random() * FIELD_H;
    const len = 7 + Math.random() * 10;
    const a = Math.random() * Math.PI;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(1.5, 2, len, len * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(126,96,44,0.75)' : 'rgba(96,110,48,0.7)';
    ctx.beginPath();
    ctx.ellipse(0, 0, len, len * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,32,16,0.5)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-len, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * A strip of soft cloud shadow, drawn once and then slid across the board.
 *
 * A board that never changes brightness looks like a printed picture. Moving
 * the light is the cheapest way to make it look like a place: one blit per
 * frame, no per-pixel work, and it is deliberately faint -- the moment a
 * shadow is dark enough to change how a garrison reads, it is a bug and not a
 * mood.
 */
export const DAPPLE_W = FIELD_W;
export const DAPPLE_H = FIELD_H;

export function buildDapple(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = DAPPLE_W;
  c.height = DAPPLE_H;
  const ctx = c.getContext('2d')!;

  for (let i = 0; i < 11; i++) {
    const x = Math.random() * DAPPLE_W;
    const y = Math.random() * DAPPLE_H;
    const r = 130 + Math.random() * 260;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(10,26,10,0.5)');
    g.addColorStop(0.55, 'rgba(10,26,10,0.3)');
    g.addColorStop(1, 'rgba(10,26,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.5 + Math.random() * 0.4), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // The strip is slid horizontally and has to wrap, so the two vertical edges
  // must match: fade both of them out to nothing.
  ctx.globalCompositeOperation = 'destination-out';
  const fade = ctx.createLinearGradient(0, 0, DAPPLE_W, 0);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.14, 'rgba(0,0,0,0)');
  fade.addColorStop(0.86, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, DAPPLE_W, DAPPLE_H);

  return c;
}
