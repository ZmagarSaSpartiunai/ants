import { GRAVITY, THROW_SPEED } from './types.js';
import { Point } from './physics.js';
import { FOODS } from './food.js';
import { FoodId } from './types.js';

/**
 * Working out which way to throw.
 *
 * This is the arithmetic behind a bot's aim. It is deliberately not used for
 * the player's aim: the arc a person sees is flown through the real physics, so
 * what the preview shows and what the shot does can never disagree.
 */

/**
 * Solves for the angle that drops a shot on a point, ignoring wind.
 *
 * Throw high or throw flat -- both reach the same spot. The lofted one is
 * returned: it clears whatever stands in between, which is usually the point.
 *
 * @param from where the bird stands
 * @param to where the shot should land
 * @param speed muzzle speed, already multiplied by food and power
 * @return the angle in radians, or null when the throw cannot reach
 */
export function aimAt(from: Point, to: Point, speed: number): number | null {
  if (speed <= 0) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  // Straight overhead: there is no arc to solve, only up or down.
  if (Math.abs(dx) < 1e-6) return dy < 0 ? -Math.PI / 2 : Math.PI / 2;

  // Solve for one side and mirror, so the quadrant never has to be guessed.
  const flip = dx < 0;
  const reach = Math.abs(dx);
  const k = (GRAVITY * reach * reach) / (2 * speed * speed);
  const disc = reach * reach - 4 * k * (k - dy);
  if (disc < 0) return null;

  // The steeper of the two roots: it arcs over what is in the way.
  const u = (-reach - Math.sqrt(disc)) / (2 * k);
  const angle = Math.atan(u);

  return flip ? Math.PI - angle : angle;
}

/**
 * @param food which food is being thrown
 * @param power 0..1 of a full throw
 * @return the muzzle speed that combination produces
 */
export function speedOf(food: FoodId, power: number): number {
  return THROW_SPEED * FOODS[food].speed * Math.max(0, Math.min(1, power));
}
