import { NodeKind } from '@ants/shared';
import { alpha, mix, shade, SOIL_DARK, SOIL_LIGHT, SOIL_MID, tint, TILT } from './theme.js';

/**
 * The three buildings, drawn as objects sitting on the ground rather than as
 * discs on a plan: a squashed base, a body lit from the top left, and a shadow
 * falling down and right. Silhouette still carries the meaning -- a round
 * mound, a hard hexagonal burrow, a hanging paper cone -- because colour is
 * already spoken for by ownership.
 *
 * `owner` tints the earth of the structure itself, so a captured nest looks
 * taken over rather than merely outlined.
 */
export function drawStructure(
  ctx: CanvasRenderingContext2D,
  kind: NodeKind,
  r: number,
  color: string,
  owned: boolean,
  time: number,
): void {
  // Contact shadow on the grass.
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath();
  ctx.ellipse(r * 0.16, r * 0.3, r * 1.06, r * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();

  if (kind === 'nest') mound(ctx, r, color, owned);
  else if (kind === 'den') burrow(ctx, r, color, owned);
  else hive(ctx, r, color, owned, time);
}

function earth(color: string, owned: boolean, base: string): string {
  return owned ? mix(base, color, 0.34) : base;
}

function mound(ctx: CanvasRenderingContext2D, r: number, color: string, owned: boolean): void {
  const dark = earth(color, owned, SOIL_DARK);
  const mid = earth(color, owned, SOIL_MID);
  const light = earth(color, owned, SOIL_LIGHT);

  // Skirt of loose earth spreading onto the grass.
  ctx.fillStyle = alpha(dark, 0.85);
  ctx.beginPath();
  ctx.ellipse(0, r * 0.14, r * 1.1, r * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();

  // The mound itself: lit high on the left, dark at the foot.
  const g = ctx.createRadialGradient(-r * 0.38, -r * 0.45, r * 0.1, 0, 0, r * 1.05);
  g.addColorStop(0, tint(light, 0.25));
  g.addColorStop(0.5, mid);
  g.addColorStop(1, shade(dark, 0.8));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * TILT, 0, 0, Math.PI * 2);
  ctx.fill();

  // Terraces, the way a real ant hill is built up in rings.
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1.2;
  for (const k of [0.74, 0.5]) {
    ctx.beginPath();
    ctx.ellipse(0, -r * (1 - k) * 0.28, r * k, r * k * TILT, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // The entrance: a dark hole with a lip of thrown-up soil.
  ctx.fillStyle = shade(dark, 0.45);
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.06, r * 0.3, r * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = alpha(light, 0.6);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.09, r * 0.32, r * 0.22, 0, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();

  grains(ctx, r, light);
}

function burrow(ctx: CanvasRenderingContext2D, r: number, color: string, owned: boolean): void {
  const stone = earth(color, owned, '#4a4640');
  const lit = tint(stone, 0.34);

  const face = (scale: number, dy: number, fill: string): void => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const x = Math.cos(a) * r * scale;
      const y = Math.sin(a) * r * scale * TILT + dy;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  };

  // A slab of rock with a visible thickness: the side wall, then the top face.
  face(1, r * 0.16, shade(stone, 0.55));
  face(1, 0, stone);
  ctx.save();
  ctx.clip();
  const g = ctx.createLinearGradient(-r, -r, r * 0.4, r);
  g.addColorStop(0, alpha(lit, 0.85));
  g.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();

  // Cracks, so the stone is not a plain polygon.
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-r * 0.7, -r * 0.2);
  ctx.lineTo(-r * 0.2, r * 0.1);
  ctx.lineTo(r * 0.3, -r * 0.3);
  ctx.stroke();

  // The burrow mouth, dark and low.
  ctx.fillStyle = 'rgba(12,10,8,0.85)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.1, r * 0.42, r * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = alpha(lit, 0.45);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.08, r * 0.44, r * 0.28, 0, Math.PI * 0.1, Math.PI * 0.9);
  ctx.stroke();
}

function hive(
  ctx: CanvasRenderingContext2D,
  r: number,
  color: string,
  owned: boolean,
  time: number,
): void {
  const paper = earth(color, owned, '#a89274');
  const dark = shade(paper, 0.55);

  // Hanging paper nest: a teardrop built out of overlapping scallops.
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.15);
  ctx.quadraticCurveTo(r * 1.05, -r * 0.25, 0, r * 0.95);
  ctx.quadraticCurveTo(-r * 1.05, -r * 0.25, 0, -r * 1.15);
  ctx.fill();

  ctx.save();
  ctx.clip();
  for (let i = 0; i < 5; i++) {
    const y = -r * 0.95 + i * r * 0.44;
    ctx.fillStyle = i % 2 ? alpha(tint(paper, 0.22), 0.95) : alpha(paper, 0.95);
    ctx.beginPath();
    ctx.ellipse(0, y, r * 1.05, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Light from the top left across the whole cone.
  const g = ctx.createLinearGradient(-r, -r, r * 0.5, r);
  g.addColorStop(0, 'rgba(255,244,214,0.45)');
  g.addColorStop(0.6, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = g;
  ctx.fillRect(-r * 1.2, -r * 1.3, r * 2.4, r * 2.6);
  ctx.restore();

  // Mouth at the bottom, with a wasp or two hanging about it.
  ctx.fillStyle = 'rgba(14,11,8,0.9)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.72, r * 0.24, r * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = alpha(color, 0.9);
  for (let i = 0; i < 2; i++) {
    const t = time * (1.6 + i * 0.5) + i * 2.1;
    ctx.beginPath();
    ctx.ellipse(
      Math.cos(t) * r * 0.85,
      r * 0.5 + Math.sin(t * 1.3) * r * 0.3,
      1.7,
      1.1,
      t,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

/** Specks of thrown-up soil, so a mound has texture at close zoom. */
function grains(ctx: CanvasRenderingContext2D, r: number, light: string): void {
  ctx.fillStyle = alpha(light, 0.5);
  for (let i = 0; i < 14; i++) {
    // Fixed angles rather than random ones: the grains must not crawl about
    // between frames.
    const a = i * 2.3999;
    const d = r * (0.35 + ((i * 7) % 10) / 18);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d * TILT, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
}
