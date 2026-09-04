import { next } from './rng.js';
import {
  DROP_R,
  Event,
  FIELD_W,
  FLOOR_Y,
  GRAVITY,
  POTTY_SPEED,
  POTTY_W,
  PottyState,
  SEATS,
} from './types.js';

/** How long the animal squirms before anything falls. */
const BRACE = 0.9;
/** How far either side of its seat an animal can land one. */
const SPREAD = 150;
/** The most splats the floor will hold before the oldest is mopped away. */
const MAX_SPLATS = 24;

/**
 * How long between one animal and the next.
 *
 * It shortens with every catch and then stops. A game for a four-year-old that
 * keeps getting harder eventually stops being a game; this one gets livelier
 * and then stays there.
 *
 * @param caught how many have gone in the potty so far
 * @return seconds until the next animal starts
 */
export function gapFor(caught: number): number {
  return Math.max(1.1, 2.6 - caught * 0.045);
}

/**
 * @param seed anything; the same seed plays the same game
 * @return a game about to start
 */
export function createGame(seed: number): PottyState {
  return {
    seed: seed >>> 0,
    time: 0,
    pottyX: FIELD_W / 2,
    drops: [],
    splats: [],
    caught: 0,
    missed: 0,
    until: 1.4,
    nextId: 1,
    bracing: null,
  };
}

/**
 * One frame.
 *
 * @param s the game, advanced in place
 * @param dt seconds
 * @param aimX where the player is pointing, in world units
 * @return what happened, for the client to react to
 */
export function step(s: PottyState, dt: number, aimX: number): Event[] {
  const out: Event[] = [];
  s.time += dt;

  // The potty runs towards the finger instead of being under it. Tracking the
  // touch exactly would mean it is impossible to miss, and a game you cannot
  // lose at all is not one a child notices winning.
  const want = Math.max(POTTY_W / 2, Math.min(FIELD_W - POTTY_W / 2, aimX));
  const move = POTTY_SPEED * dt;
  const gap = want - s.pottyX;
  s.pottyX += Math.sign(gap) * Math.min(move, Math.abs(gap));

  if (s.bracing) {
    s.bracing.t += dt;
    if (s.bracing.t >= BRACE) {
      const seat = SEATS[s.bracing.seat];
      // Not straight down the post every time. Four fixed landing spots mean
      // the potty only ever needs four positions, and the game stops being
      // about watching where it is going.
      const roll = next(s.seed);
      s.seed = roll.seed;
      const x = seat.x + (roll.value - 0.5) * SPREAD;
      s.drops.push({ id: s.nextId++, x, y: seat.y + 18, vy: 0, seat: s.bracing.seat });
      out.push({ t: 'drop', seat: s.bracing.seat, x });
      s.bracing = null;
      s.until = gapFor(s.caught);
    }
  } else {
    s.until -= dt;
    if (s.until <= 0) {
      const roll = next(s.seed);
      s.seed = roll.seed;
      const seat = Math.min(SEATS.length - 1, Math.floor(roll.value * SEATS.length));
      s.bracing = { seat, t: 0 };
      out.push({ t: 'brace', seat });
    }
  }

  for (let i = s.drops.length - 1; i >= 0; i--) {
    const d = s.drops[i];
    d.vy += GRAVITY * dt;
    d.y += d.vy * dt;
    // The mouth of the potty, not the whole pot: it has to be aimed at.
    const overMouth = Math.abs(d.x - s.pottyX) <= POTTY_W / 2 - DROP_R * 0.4;
    if (d.y >= FLOOR_Y - 26 && overMouth) {
      s.drops.splice(i, 1);
      s.caught++;
      out.push({ t: 'catch', count: s.caught });
    } else if (d.y >= FLOOR_Y) {
      s.drops.splice(i, 1);
      s.missed++;
      s.splats.push({ x: d.x, seed: d.id });
      // The floor holds only so much before the oldest is quietly mopped away.
      if (s.splats.length > MAX_SPLATS) s.splats.shift();
      out.push({ t: 'miss', x: d.x });
    }
  }

  return out;
}
