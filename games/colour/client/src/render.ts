import { Filled, paintById, Picture } from '@colour/shared';
import { artFor, H, Shape, W } from './pictures.js';

/**
 * Drawing the sheet, kept apart from the loop that drives it.
 *
 * A hidden browser tab is given no animation frames at all, so anything only
 * reachable from inside the loop cannot be looked at, and a drawing nobody can
 * look at cannot be judged. Everything here can be called on demand.
 */

export interface Sparkle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  tint: string;
}

const paths = new Map<string, Path2D>();

/**
 * @param pictureId which picture the part belongs to
 * @param region which part
 * @param build how to draw it
 * @return the path, built once and kept
 */
export function pathFor(pictureId: string, region: string, build: Shape): Path2D {
  const key = `${pictureId}/${region}`;
  let p = paths.get(key);
  if (!p) {
    p = new Path2D();
    build(p);
    paths.set(key, p);
  }

  return p;
}

/** How the world is laid into the canvas, so a tap can be turned back again. */
export interface Fit {
  scale: number;
  offX: number;
  offY: number;
  dpr: number;
  cssW: number;
  cssH: number;
}

/**
 * @param canvas the sheet
 * @return where the picture ended up inside it
 */
export function fitTo(canvas: HTMLCanvasElement): Fit | null {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const scale = Math.min(rect.width / W, rect.height / H);

  return {
    scale,
    offX: (rect.width - W * scale) / 2,
    offY: (rect.height - H * scale) / 2,
    dpr,
    cssW: rect.width,
    cssH: rect.height,
  };
}

/** Puts the canvas into world coordinates. */
export function place(ctx: CanvasRenderingContext2D, fit: Fit): void {
  ctx.setTransform(fit.dpr, 0, 0, fit.dpr, 0, 0);
  ctx.translate(fit.offX, fit.offY);
  ctx.scale(fit.scale, fit.scale);
}

/**
 * @param ctx the sheet's context, already in world coordinates
 * @param picture what is open
 * @param x where the finger landed, in device pixels
 * @param y where the finger landed, in device pixels
 * @return the part under it, or null
 */
export function hitRegion(
  ctx: CanvasRenderingContext2D,
  picture: Picture,
  x: number,
  y: number,
): string | null {
  const art = artFor(picture);
  // Front to back: a bow drawn over a head has to be found before the head.
  for (let i = picture.regions.length - 1; i >= 0; i--) {
    const region = picture.regions[i];
    if (ctx.isPointInPath(pathFor(picture.id, region, art.parts[region]), x, y)) return region;
  }

  return null;
}

export interface Touch {
  region: string;
  /** 1 just tapped, fading to 0. */
  t: number;
}

/**
 * @param ctx the sheet's context, already in world coordinates
 * @param picture what is open
 * @param filled which parts have a colour
 * @param touched the part that was just tapped, if any
 * @param sparkles the celebration, if any
 */
export function paintSheet(
  ctx: CanvasRenderingContext2D,
  picture: Picture,
  filled: Filled,
  touched: Touch | null,
  sparkles: Sparkle[],
): void {
  ctx.fillStyle = '#fdfaf2';
  ctx.fillRect(0, 0, W, H);

  const art = artFor(picture);
  for (const region of picture.regions) {
    const path = pathFor(picture.id, region, art.parts[region]);
    const chosen = filled[region];
    ctx.fillStyle = (chosen ? paintById(chosen)?.hex : undefined) ?? '#ffffff';
    ctx.fill(path);
    if (touched?.region === region && touched.t > 0) {
      // A flash where the finger landed, so a tap that put white on white
      // still answers. Nothing a child does here should feel ignored.
      ctx.save();
      ctx.globalAlpha = touched.t * 0.5;
      ctx.fillStyle = '#ffffff';
      ctx.fill(path);
      ctx.restore();
    }
  }

  // One outline pass over the lot, so the line art sits on top of every fill.
  ctx.strokeStyle = '#2f2822';
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  for (const region of picture.regions) {
    ctx.stroke(pathFor(picture.id, region, art.parts[region]));
  }
  art.details(ctx);

  for (const s of sparkles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, s.life));
    ctx.fillStyle = s.tint;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 5 + s.life * 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
