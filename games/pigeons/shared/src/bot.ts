import { aimAt, speedOf } from './aim.js';
import { FOODS } from './food.js';
import { canFire } from './match.js';
import { windFor } from './rng.js';
import { Bird, FoodId, MatchState, Shot } from './types.js';

/**
 * The machine opponent.
 *
 * It plays the same game the child does: pick a food, pick an angle, live with
 * the wind. It is not allowed to cheat -- it aims with the same arithmetic and
 * misses by an amount its level decides. A bot that always hit would teach
 * nothing except that the game is unfair.
 */

export type BotLevel = 'easy' | 'normal' | 'sharp';

/** How wide the bot's aim wanders, in radians, before the wind is even felt. */
const SPREAD: Record<BotLevel, number> = {
  easy: 0.14,
  normal: 0.06,
  sharp: 0.02,
};

/** How much of the wind the bot bothers to correct for. */
const WIND_SENSE: Record<BotLevel, number> = {
  easy: 0,
  normal: 0.6,
  sharp: 1,
};

export class Bot {
  private tick = 0;

  constructor(
    readonly slot: number,
    private readonly level: BotLevel,
    private readonly seed: number,
  ) {}

  /**
   * Seeded and stateful, so two bots on the same seed play the same match and
   * one bot does not repeat itself round after round.
   *
   * @return a number in 0..1
   */
  private roll(): number {
    this.tick++;
    let h = (this.seed ^ Math.imul(this.tick, 0x9e3779b9)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;

    return h / 0xffffffff;
  }

  /**
   * @param s the match as it stands
   * @return the shot to fire, or null when this bird cannot or will not fire
   */
  choose(s: MatchState): Shot | null {
    if (!canFire(s, this.slot)) return null;
    const me = s.birds[this.slot];
    const target = this.pickTarget(s, me);
    if (!target) return null;

    const wind = windFor(s.seed, s.round);
    const food = this.pickFood(me, target, wind);
    const power = 0.72 + this.roll() * 0.28;
    const angle = aimAt(me, target, speedOf(food, power));
    // Out of reach at that power: lean on the throw rather than skip the round.
    if (angle === null) return this.desperate(me, target, food);

    // Lean into the wind by as much as this level understands, then wobble.
    const lean = -wind * WIND_SENSE[this.level] * FOODS[food].drag * 0.16;
    const wobble = (this.roll() - 0.5) * 2 * SPREAD[this.level];

    return { slot: this.slot, food, angle: angle + lean + wobble, power };
  }

  /**
   * @param s the match
   * @param me this bot's bird
   * @return the nearest bird still standing, or null when none is left
   */
  private pickTarget(s: MatchState, me: Bird): Bird | null {
    let best: Bird | null = null;
    let near = Infinity;
    for (const other of s.birds) {
      if (other.slot === me.slot || !other.alive) continue;
      const d = Math.hypot(other.x - me.x, other.y - me.y);
      if (d < near) {
        near = d;
        best = other;
      }
    }

    return best;
  }

  /**
   * @param me this bot's bird
   * @param target what it is aiming at
   * @param wind this round's wind
   * @return which food to eat
   */
  private pickFood(me: Bird, target: Bird, wind: number): FoodId {
    // A wounded bot stops being clever and reaches for the big one.
    if (me.hp < 40 && this.roll() < 0.6) return 'melon';
    // A strong crosswind makes the pepper the only honest answer.
    if (Math.abs(wind) > 0.55 && this.roll() < 0.7) return 'pepper';
    // Close in, the melon's blast is worth two rounds of standing still.
    if (Math.hypot(target.x - me.x, target.y - me.y) < 260 && this.roll() < 0.35) return 'melon';
    if (this.roll() < 0.2) return 'icecream';

    return 'seed';
  }

  /**
   * A throw that cannot reach still has to be a throw: a bot that stayed silent
   * would let a cornered player win by waiting.
   *
   * @param me this bot's bird
   * @param target what it is aiming at
   * @param food what it settled on
   * @return the best guess available
   */
  private desperate(me: Bird, target: Bird, food: FoodId): Shot {
    const toward = target.x >= me.x ? -Math.PI / 4 : -Math.PI + Math.PI / 4;

    return { slot: this.slot, food, angle: toward, power: 1 };
  }
}
