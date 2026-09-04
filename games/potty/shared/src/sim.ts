import { next } from './rng.js';
import {
  Animal,
  DROP_R,
  Event,
  FIELD_W,
  FLOOR_Y,
  FLUSH_TIME,
  GOAL,
  GRAVITY,
  MAX_URGES,
  POTTY_CAP,
  POTTY_SPEED,
  POTTY_W,
  POUR_X,
  PottyState,
  SEATS,
  STRIKES,
  TOILET_W,
  TOILET_X,
  URGE_GAP,
  WAIT,
} from './types.js';

/** The most splats the floor will hold before the oldest is mopped away. */
const MAX_SPLATS = 40;
/** A full potty is heavy: this is the share of its speed that is left. */
const LOADED = 0.62;
/**
 * How exactly the potty has to be placed for an animal to let go.
 *
 * The mouth has to genuinely cover the spot, or the child would be given a
 * catch it could not see coming and could not repeat.
 */
const RELEASE_TOL = POTTY_W / 2 - DROP_R;
/** How much mess one burst animal leaves. */
const BURST_SPLATS = 9;

/**
 * @param s the game
 * @return how many animals have had their five
 */
export function happyCount(s: PottyState): number {
  return s.animals.filter((a) => a.pooped >= GOAL).length;
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
    animals: SEATS.map((_, seat) => ({ seat, pooped: 0, strikes: 0, alive: true, urge: null })),
    caught: 0,
    missed: 0,
    held: 0,
    flushing: 0,
    until: 1.2,
    nextId: 1,
    over: null,
  };
}

/**
 * @param s the game
 * @param x where the splat lands
 * @param id something to vary its shape by
 * @param y how high it stuck, or the floor when left out
 */
function splatAt(s: PottyState, x: number, id: number, y?: number): void {
  s.splats.push(y === undefined ? { x, seed: id } : { x, y, seed: id });
  // The floor holds only so much before the oldest is quietly mopped away.
  if (s.splats.length > MAX_SPLATS) s.splats.shift();
}

/**
 * @param s the game
 * @return a number in 0..1, advancing the seed
 */
function roll(s: PottyState): number {
  const r = next(s.seed);
  s.seed = r.seed;

  return r.value;
}

/**
 * @param a the animal
 * @return whether it still has something to do
 */
function busy(a: Animal): boolean {
  return a.alive && a.pooped < GOAL;
}

/**
 * The game is over once nobody is left with anything to do: everyone is either
 * happy or gone. Without this a half-saved game would run for ever with three
 * animals standing there having nothing left to ask for.
 *
 * @param s the game
 * @param out where to record the ending
 */
function checkOver(s: PottyState, out: Event[]): void {
  if (s.over) return;
  if (s.animals.some(busy)) return;
  const happy = happyCount(s);
  s.over = happy > 0 ? 'won' : 'lost';
  for (const a of s.animals) a.urge = null;
  out.push({ t: 'over', won: s.over === 'won', happy });
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
  if (s.over) return out;
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
    }
  } else {
    // The potty runs towards the finger instead of being under it. Tracking the
    // touch exactly would make placing it no work at all, and placing it is the
    // whole game.
    const want = Math.max(POTTY_W / 2, Math.min(FIELD_W - POTTY_W / 2, aimX));
    const speed = POTTY_SPEED * (s.held >= POTTY_CAP ? LOADED : 1);
    const gap = want - s.pottyX;
    s.pottyX += Math.sign(gap) * Math.min(speed * dt, Math.abs(gap));

    if (s.held >= POTTY_CAP && Math.abs(s.pottyX - TOILET_X) <= TOILET_W / 2) {
      s.flushing = FLUSH_TIME;
      out.push({ t: 'flush' });
    }
  }

  // ------------------------------------------------------------ the asking
  for (const a of s.animals) {
    if (a.urge === null) continue;
    const seat = SEATS[a.seat];
    const ready = s.flushing <= 0 && s.held < POTTY_CAP && Math.abs(s.pottyX - seat.x) <= RELEASE_TOL;
    if (ready) {
      a.urge = null;
      s.drops.push({ id: s.nextId++, x: seat.x, y: seat.y + 18, vy: 0, seat: a.seat });
      out.push({ t: 'drop', seat: a.seat, x: seat.x });
      continue;
    }
    a.urge -= dt;
    if (a.urge > 0) continue;

    // Nobody came.
    a.urge = null;
    a.strikes++;
    if (a.strikes >= STRIKES) {
      a.alive = false;
      out.push({ t: 'boom', seat: a.seat });
      // Up the walls and across the fence, not a neat line on the floor. It
      // went off; the mess should say so.
      for (let i = 0; i < BURST_SPLATS; i++) {
        splatAt(s, roll(s) * FIELD_W, s.nextId++, 70 + roll(s) * (FLOOR_Y - 40));
      }
    } else {
      out.push({ t: 'angry', seat: a.seat, strikes: a.strikes });
      // It goes anyway, on the floor. Holding it in would be a lesson nobody
      // wants taught.
      s.missed++;
      splatAt(s, seat.x + (roll(s) - 0.5) * 60, s.nextId++);
      out.push({ t: 'miss', x: seat.x });
    }
  }
  checkOver(s, out);
  if (s.over) return out;

  // Somebody new starts asking.
  const asking = s.animals.filter((a) => a.urge !== null).length;
  if (asking < MAX_URGES) {
    s.until -= dt;
    if (s.until <= 0) {
      const free = s.animals.filter((a) => busy(a) && a.urge === null);
      if (free.length) {
        const a = free[Math.min(free.length - 1, Math.floor(roll(s) * free.length))];
        a.urge = WAIT[Math.min(WAIT.length - 1, a.strikes)];
        out.push({ t: 'urge', seat: a.seat });
      }
      s.until = URGE_GAP;
    }
  }

  // ----------------------------------------------------------- what falls
  for (let i = s.drops.length - 1; i >= 0; i--) {
    const d = s.drops[i];
    d.vy += GRAVITY * dt;
    d.y += d.vy * dt;

    // The mouth of the potty, not the whole pot: it has to be held there.
    const overMouth = Math.abs(d.x - s.pottyX) <= POTTY_W / 2 - DROP_R * 0.4;
    if (d.y >= FLOOR_Y - 26 && overMouth && s.flushing <= 0) {
      s.drops.splice(i, 1);
      if (s.held < POTTY_CAP) {
        s.held++;
        s.caught++;
        const a = s.animals[d.seat];
        a.pooped++;
        out.push({ t: 'catch', held: s.held, seat: d.seat });
        if (a.pooped >= GOAL) out.push({ t: 'happy', seat: d.seat });
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
  checkOver(s, out);

  return out;
}
