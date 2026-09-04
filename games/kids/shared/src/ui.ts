import { setSound, soundOn } from './speech.js';

/**
 * The shape every game for small children turned out to have.
 *
 * A canvas letterboxed into whatever screen it lands on, a row of dots saying
 * how far through we are, and a sound button. By the fourth game these were
 * four copies that had already started to differ, which is how the copy that
 * is subtly wrong stops being noticed.
 */

/** How the world was laid into the canvas, so a tap can be turned back again. */
export interface Fit {
  scale: number;
  offX: number;
  offY: number;
  dpr: number;
  cssW: number;
  cssH: number;
}

/**
 * Sizes the canvas to its box and works out where the world sits inside it.
 *
 * @param canvas the canvas
 * @param worldW how wide the game thinks it is
 * @param worldH how tall the game thinks it is
 * @return the placement, or null while the page has no size yet
 */
export function fitCanvas(canvas: HTMLCanvasElement, worldW: number, worldH: number): Fit | null {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const scale = Math.min(rect.width / worldW, rect.height / worldH);

  return {
    scale,
    offX: (rect.width - worldW * scale) / 2,
    offY: (rect.height - worldH * scale) / 2,
    dpr,
    cssW: rect.width,
    cssH: rect.height,
  };
}

/**
 * Clears the canvas and puts it into world coordinates.
 *
 * @param ctx the context
 * @param fit where the world sits
 */
export function place(ctx: CanvasRenderingContext2D, fit: Fit): void {
  ctx.setTransform(fit.dpr, 0, 0, fit.dpr, 0, 0);
  ctx.clearRect(0, 0, fit.cssW, fit.cssH);
  ctx.translate(fit.offX, fit.offY);
  ctx.scale(fit.scale, fit.scale);
}

/**
 * Where a tap landed, in world units.
 *
 * Worked out from the canvas rather than from the last frame: a tap before the
 * first frame has run would otherwise land nowhere, and a tap that does
 * nothing is the one thing a game for a three-year-old must never do.
 *
 * @param canvas the canvas
 * @param worldW how wide the game thinks it is
 * @param worldH how tall the game thinks it is
 * @param clientX the tap
 * @param clientY the tap
 * @return the point in world units, or null while the page has no size yet
 */
export function toWorld(
  canvas: HTMLCanvasElement,
  worldW: number,
  worldH: number,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const scale = Math.min(rect.width / worldW, rect.height / worldH);

  return {
    x: (clientX - rect.left - (rect.width - worldW * scale) / 2) / scale,
    y: (clientY - rect.top - (rect.height - worldH * scale) / 2) / scale,
  };
}

/**
 * The row of dots. Nothing to read: how many are left is a length.
 *
 * @param box where they go
 * @param total how many there are altogether
 * @param at how many are behind us
 */
export function showDots(box: HTMLElement, total: number, at: number): void {
  box.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const d = document.createElement('span');
    d.className = `dot${i < at ? ' done' : ''}${i === at ? ' now' : ''}`;
    box.append(d);
  }
}

/**
 * Wires the sound button, which every one of these games has in the corner.
 *
 * @param button the button
 */
export function soundToggle(button: HTMLButtonElement): void {
  button.textContent = soundOn() ? '🔊' : '🔇';
  button.addEventListener('click', () => {
    setSound(!soundOn());
    button.textContent = soundOn() ? '🔊' : '🔇';
  });
}
