export const SOIL = '#16130f';
export const SOIL_LIGHT = '#221c15';

/** Player 0 is always the local player, so amber reads as "mine" everywhere. */
export const PLAYER_COLORS = ['#f0b429', '#e05a3d', '#3fa7c9', '#a878d8'];
export const NEUTRAL_COLOR = '#6f6a60';

export function playerColor(owner: number): string {
  return owner < 0 ? NEUTRAL_COLOR : PLAYER_COLORS[owner % PLAYER_COLORS.length];
}

/** Same hue, pushed dark: used for the shaded underside of every mound. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * amount);
  const g = Math.round(((n >> 8) & 255) * amount);
  const b = Math.round((n & 255) * amount);

  return `rgb(${r},${g},${b})`;
}

export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);

  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
