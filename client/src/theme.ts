/**
 * The board is a patch of ground seen from just above: light comes from the
 * top left, everything casts a short shadow down and right, and every round
 * thing is squashed a little vertically. Keeping those three rules consistent
 * is most of what makes a flat canvas read as a diorama.
 */
export const LIGHT_X = -0.38;
export const LIGHT_Y = -0.45;
/** How much circles are squashed to suggest a low camera. */
export const TILT = 0.82;

export const GRASS_DEEP = '#2f5226';
export const GRASS_MID = '#3f6a31';
export const GRASS_LIGHT = '#578540';
export const SOIL_DARK = '#3b2b1c';
export const SOIL_MID = '#5c432a';
export const SOIL_LIGHT = '#7d5f3d';

/** Player 0 is always the local player, so amber reads as "mine" everywhere. */
export const PLAYER_COLORS = ['#ffc23d', '#ef5a41', '#46b6e0', '#b47ce8'];
export const NEUTRAL_COLOR = '#9a9385';

export function playerColor(owner: number): string {
  return owner < 0 ? NEUTRAL_COLOR : PLAYER_COLORS[owner % PLAYER_COLORS.length];
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);

  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Same hue, pushed dark: the shaded underside of anything rounded. */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = channels(hex);

  return `rgb(${Math.round(r * amount)},${Math.round(g * amount)},${Math.round(b * amount)})`;
}

/** Same hue, pushed towards white: the lit side. */
export function tint(hex: string, amount: number): string {
  const [r, g, b] = channels(hex);
  const up = (c: number) => Math.round(c + (255 - c) * amount);

  return `rgb(${up(r)},${up(g)},${up(b)})`;
}

export function alpha(hex: string, a: number): string {
  const [r, g, b] = channels(hex);

  return `rgba(${r},${g},${b},${a})`;
}

/** Blend two hex colours; used for tinting soil towards an owner. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = channels(a);
  const [r2, g2, b2] = channels(b);
  const at = (x: number, y: number) => Math.round(x + (y - x) * t);

  return `rgb(${at(r1, r2)},${at(g1, g2)},${at(b1, b2)})`;
}
