import { next } from './rng.js';
import {
  DROP_MAX_X,
  DROP_R,
  Event,
  FIELD_W,
  FLOOR_Y,
  FLUSH_TIME,
  GRAVITY,
  POTTY_CAP,
  POTTY_SPEED,
  POTTY_W,
  POUR_X,
  PottyState,
  SEATS,
  STARS_PER_LEVEL,
  TOILET_X,
  TOILET_W,
} from './types.js';

/** How long the animal squirms before anything falls. */
const BRACE = 0.9;
/** The most splats the floor will hold before the oldest is mopped away. */
const MAX_SPLATS = 24;
/** How far either side of its seat an animal can land one. */
const SPREAD = 150;
/** A full potty is heavy: this is the share of its speed that is left. */
const LOADED = 0.62;

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
 * How many animals are awake.
 *
 * A level brings one more, up to the fence being full. Something visibly new
 * arriving is the whole reason a level is worth finishing; a level that only
 * makes the same thing faster reads as the game getting meaner.
 *
 * @param level counting from one
 * @return how many seats are in play
 */
export function seatsFor(level: number): number {
  return Math.min(SEATS.length, level + 1);
}

/**
 * @param level counting from one
 * @return how many animals may be squirming at the same time
 */
export function maxBracing(level: number): number {
  return level >= 2 ? 2 : 1;
}

/**
 * Which seats wake first: the middle pair, then the edges.
 *
 * Waking them left to right left the whole right half of the fence empty for
 * the first minute, next to a toilet with nothing happening near it.
 */
const WAKE_ORDER = [1, 2, 0, 3];

/**
 * @param level counting from one
 * @return the seat numbers in play, which is not a range: see WAKE_ORDER
 */
export function awakeSeats(level: number): number[] {
  return WAKE_ORDER.slice(0, seatsFor(level));
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
    held: 0,
    stars: 0,
    level: 1,
    flushing: 0,
    until: 1.4,
    nextId: 1,
    bracing: [],
  };
}

/**
 * @param s the game
 * @param x where the splat lands
 */
function splatAt(s: PottyState, x: number, id: number): void {
  s.splats.push({ x, seed: id });
  // The floor holds only so much before the oldest is quietly mopped away.
  if (s.splats.length > MAX_SPLATS) s.splats.shift();
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

  if (s.flushing > 0) {
    // Walks the last stretch to the pouring spot instead of being teleported
    // there: snapping to the toilet made the potty jump sideways at the very
    // moment the child was watching it most closely.
    const gap = POUR_X - s.pottyX;
    s.pottyX += Math.sign(gap) * Math.min(POTTY_SPEED * dt, Math.abs(gap));
    s.flushing -= dt;
    if (s.flushing <= 0) {
      s.flushing = 0;
      s.held = 0;
      s.stars++;
      out.push({ t: 'star', stars: s.stars });
      if (s.stars >= STARS_PER_LEVEL) {
        s.stars = 0;
        s.level++;
        out.push({ t: 'level', level: s.level });
      }
    }
  } else {
    // The potty runs towards the finger instead of being under it. Tracking the
    // touch exactly would mean it is impossible to miss, and a game you cannot
    // lose at all is not one a child notices winning.
    const want = Math.max(POTTY_W / 2, Math.min(FIELD_W - POTTY_W / 2, aimX));
    const speed = POTTY_SPEED * (s.held >= POTTY_CAP ? LOADED : 1);
    const gap = want - s.pottyX;
    s.pottyX += Math.sign(gap) * Math.min(speed * dt, Math.abs(gap));

    if (s.held >= POTTY_CAP && Math.abs(s.pottyX - TOILET_X) <= TOILET_W / 2) {
      s.flushing = FLUSH_TIME;
      out.push({ t: 'flush' });
    }
  }

  for (let i = s.bracing.length - 1; i >= 0; i--) {
    const b = s.bracing[i];
    b.t += dt;
    if (b.t < BRACE) continue;
    const seat = SEATS[b.seat];
    // Not straight down the post every time. Four fixed landing spots mean the
    // potty only ever needs four positions, and the game stops being about
    // watching where it is going.
    const roll = next(s.seed);
    s.seed = roll.seed;
    const x = Math.min(DROP_MAX_X, seat.x + (roll.value - 0.5) * SPREAD);
    s.drops.push({ id: s.nextId++, x, y: seat.y + 18, vy: 0, seat: b.seat });
    out.push({ t: 'drop', seat: b.seat, x });
    s.bracing.splice(i, 1);
    s.until = gapFor(s.caught);
  }

  if (s.bracing.length < maxBracing(s.level)) {
    s.until -= dt;
    if (s.until <= 0) {
      const roll = next(s.seed);
      s.seed = roll.seed;
      // Pick among the awake seats, skipping any already squirming.
      const free = awakeSeats(s.level).filter((seat) => !s.bracing.some((b) => b.seat === seat));
      if (free.length) {
        const seat = free[Math.min(free.length - 1, Math.floor(roll.value * free.length))];
        s.bracing.push({ seat, t: 0 });
        out.push({ t: 'brace', seat });
      }
      s.until = gapFor(s.caught);
    }
  }

  for (let i = s.drops.length - 1; i >= 0; i--) {
    const d = s.drops[i];
    d.vy += GRAVITY * dt;
    d.y += d.vy * dt;

    // The mouth of the potty, not the whole pot: it has to be aimed at.
    const overMouth = Math.abs(d.x - s.pottyX) <= POTTY_W / 2 - DROP_R * 0.4;
    if (d.y >= FLOOR_Y - 26 && overMouth && s.flushing <= 0) {
      s.drops.splice(i, 1);
      if (s.held < POTTY_CAP) {
        s.held++;
        s.caught++;
        out.push({ t: 'catch', held: s.held });
        if (s.held >= POTTY_CAP) out.push({ t: 'full' });
      } else {
        // Bounces off a full pot. Funny, and it says what to do next without a
        // word of instruction.
        s.missed++;
        splatAt(s, d.x + (d.id % 2 ? 26 : -26), d.id);
        out.push({ t: 'overflow', x: d.x });
      }
    } else if (d.y >= FLOOR_Y) {
      s.drops.splice(i, 1);
      s.missed++;
      splatAt(s, d.x, d.id);
      out.push({ t: 'miss', x: d.x });
    }
  }

  return out;
}
