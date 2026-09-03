import { Food, FoodId } from './types.js';

/**
 * The whole balance of the game lives here and nowhere else.
 *
 * Each food is one clear trade a child can hold in their head. The melon covers
 * half a roof but costs two rounds of standing there digesting; the pepper is
 * the only thing the wind cannot push. That trade is the game -- the aiming is
 * just how you carry it out.
 */
export const FOOD_IDS: FoodId[] = ['seed', 'melon', 'pepper', 'icecream'];

export const FOODS: Record<FoodId, Food> = {
  seed: { id: 'seed', speed: 1.0, blast: 26, power: 18, drag: 1.0, bounces: 0, digest: 0 },
  melon: { id: 'melon', speed: 0.78, blast: 72, power: 46, drag: 1.4, bounces: 0, digest: 2 },
  pepper: { id: 'pepper', speed: 1.45, blast: 30, power: 34, drag: 0.0, bounces: 0, digest: 1 },
  icecream: { id: 'icecream', speed: 1.1, blast: 34, power: 22, drag: 0.8, bounces: 2, digest: 1 },
};

/**
 * @param id what the player picked, from anywhere -- including the wire
 * @return the food, or null when the id is not one of ours
 */
export function foodById(id: unknown): Food | null {
  if (typeof id !== 'string') return null;
  // Own properties only. A plain lookup answers 'constructor' and 'toString'
  // with something from Object.prototype, and the wire is where that string
  // comes from.
  if (!Object.prototype.hasOwnProperty.call(FOODS, id)) return null;

  return FOODS[id as FoodId];
}
