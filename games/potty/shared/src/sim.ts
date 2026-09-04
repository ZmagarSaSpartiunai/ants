import { next } from './rng.js';
import {
  Animal,
  AnimalId,
  BIG,
  DROP_R,
  Event,
  FIELD_W,
  FLOOR_Y,
  FLUSH_TIME,
  GRAVITY,
  Level,
  POTTY_SPEED,
  POTTY_W,
  POUR_X,
  PottyState,
  MIDDLING,
  RULES,
  SEATS,
  SIZE,
  SMALL,
  START_AWAKE,
  STRIKES,
  TOILET_W,
  TOILET_X,
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
 * @param list to pick from
 * @param value a number in 0..1
 * @return one of them
 */
function pick<T>(list: T[], value: number): T {
  return list[Math.min(list.length - 1, Math.floor(value * list.length))];
}

/**
 * Two small, one middling, one big, then shuffled into the seats.
 *
 * A straight shuffle can deal a cow, a pig and a sheep together, and then the
 * potty is full after every single animal and the game is a queue at the
 * toilet rather than a game.
 *
 * @param seed the game seed
 * @return four animals and the seed to carry on with
 */
export function castFor(seed: number): { cast: AnimalId[]; seed: number } {
  let s = seed;
  const roll = (): number => {
    const r = next(s);
    s = r.seed;

    return r.value;
  };
  const small = [...SMALL];
  const first = pick(small, roll());
  small.splice(small.indexOf(first), 1);
  const cast = [first, pick(small, roll()), pick(MIDDLING, roll()), pick(BIG, roll())];
  // Fisher-Yates, so the big one is not always on the right-hand post.
  for (let i = cast.length - 1; i > 0; i--) {
    const j = Math.floor(roll() * (i + 1));
    [cast[i], cast[j]] = [cast[j], cast[i]];
  }

  return { cast, seed: s };
}

/**
 * @param s the game
 * @return how many animals have had their five
 */
export function happyCount(s: PottyState): number {
  return s.animals.filter((a) => a.pooped >= s.rules.goal).length;
}

/**
 * @param seed anything; the same seed plays the same game
 * @param level which difficulty to play
 * @return a game about to start
 */
export function createGame(seed: number, level: Level = 'easy'): PottyState {
  const { cast, seed: after } = castFor(seed >>> 0);

  return {
    seed: after,
    level,
    rules: RULES[level],
    time: 0,
    pottyX: FIELD_W / 2,
    drops: [],
    splats: [],
    animals: SEATS.map((_, seat) => ({
      seat,
      id: cast[seat],
      size: SIZE[cast[seat]],
      // Only the middle pair to begin with. The others arrive as a reward for
      // emptying the potty, which is more welcome than four at once.
      asleep: seat !== 1 && seat !== 2,
      pooped: 0,
      strikes: 0,
      alive: true,
      urge: null,
    })),
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
 * @param s the game
 * @param a the animal
 * @return whether it still has something to do
 *
 * A drop still in the air counts. Without that the animal was free again the
 * instant it let go, could be asked a second time before the first had landed,
 * and finished the game having been six times instead of five.
 */
function busy(s: PottyState, a: Animal): boolean {
  if (!a.alive || a.asleep) return false;
  if (s.drops.some((d) => d.seat === a.seat)) return true;

  return a.pooped < s.rules.goal;
}

/**
 * @param s the game
 * @param a the animal
 * @return whether what it would produce still fits
 */
export function fits(s: PottyState, a: Animal): boolean {
  return s.held + a.size <= s.rules.cap;
}

/**
 * @param s the game
 * @return whether somebody is asking who will not fit in what is left
 */
export function jammed(s: PottyState): boolean {
  return s.animals.some((a) => a.urge !== null && !fits(s, a));
}

/**
 * Brings the next animal onto the fence.
 *
 * @param s the game
 * @param out where to record it
 * @return whether anybody was woken
 */
function wakeNext(s: PottyState, out: Event[]): boolean {
  const a = s.animals.find((x) => x.asleep && x.alive);
  if (!a) return false;
  a.asleep = false;
  out.push({ t: 'wake', seat: a.seat });

  return true;
}

/**
 * One more failure for this animal, with everything that follows from it.
 *
 * @param s the game
 * @param a the animal
 * @param out where to record it
 */
function strike(s: PottyState, a: Animal, out: Event[]): void {
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

    return;
  }
  out.push({ t: 'angry', seat: a.seat, strikes: a.strikes });
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
  if (s.animals.some((a) => busy(s, a))) return;
  // Nobody left to help, but somebody has not arrived yet. Waiting for a flush
  // that can never come would leave the game running with an empty fence.
  if (wakeNext(s, out)) return;
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
      // Emptying it is what brings the next animal along: an arrival that has
      // been earned lands better than four animals there from the start.
      wakeNext(s, out);
    }
  } else {
    // The potty runs towards the finger instead of being under it. Tracking the
    // touch exactly would make placing it no work at all, and placing it is the
    // whole game.
    const want = Math.max(POTTY_W / 2, Math.min(FIELD_W - POTTY_W / 2, aimX));
    // Heavier the fuller it is, rather than in one step at the top: the child
    // should feel it filling, not discover it at the last piece.
    const speed = POTTY_SPEED * (1 - (1 - LOADED) * (s.held / s.rules.cap));
    const gap = want - s.pottyX;
    s.pottyX += Math.sign(gap) * Math.min(speed * dt, Math.abs(gap));

    // Anything in it can be emptied. Waiting for it to be exactly full would
    // strand a player whose next animal is a cow and whose pot is half used.
    if (s.held > 0 && Math.abs(s.pottyX - TOILET_X) <= TOILET_W / 2) {
      s.flushing = FLUSH_TIME;
      out.push({ t: 'flush' });
    }
  }

  // ------------------------------------------------------------ the asking
  for (const a of s.animals) {
    if (a.urge === null) continue;
    const seat = SEATS[a.seat];
    const ready = s.flushing <= 0 && fits(s, a) && Math.abs(s.pottyX - seat.x) <= RELEASE_TOL;
    if (ready) {
      a.urge = null;
      s.drops.push({ id: s.nextId++, x: seat.x, y: seat.y + 18, vy: 0, seat: a.seat });
      out.push({ t: 'drop', seat: a.seat, x: seat.x });
      continue;
    }
    a.urge -= dt;
    if (a.urge > 0) continue;

    // Nobody came.
    const before = a.strikes;
    strike(s, a, out);
    if (a.strikes > before && a.alive) {
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
  if (asking < s.rules.maxUrges) {
    s.until -= dt;
    if (s.until <= 0) {
      // Nobody is asked while their last one is still in the air: counted on
      // landing, an animal asked twice in that gap finished on six of five.
      const free = s.animals.filter(
        (a) =>
          busy(s, a) &&
          a.urge === null &&
          a.pooped < s.rules.goal &&
          !s.drops.some((d) => d.seat === a.seat),
      );
      if (free.length) {
        const a = free[Math.min(free.length - 1, Math.floor(roll(s) * free.length))];
        const wait = s.rules.wait;
        a.urge = wait[Math.min(wait.length - 1, a.strikes)];
        out.push({ t: 'urge', seat: a.seat });
      }
      s.until = s.rules.urgeGap;
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
      const a = s.animals[d.seat];
      s.held = Math.min(s.rules.cap, s.held + a.size);
      s.caught++;
      a.pooped++;
      out.push({ t: 'catch', held: s.held, seat: d.seat });
      if (a.pooped >= s.rules.goal) out.push({ t: 'happy', seat: d.seat });
      if (jammed(s) || s.held >= s.rules.cap) out.push({ t: 'full' });
    } else if (d.y >= FLOOR_Y) {
      s.drops.splice(i, 1);
      s.missed++;
      splatAt(s, d.x, d.id);
      out.push({ t: 'miss', x: d.x });
      // Driving off after making somebody go is the same failure as never
      // turning up. Without this the potty could pull away every time, and the
      // animal would go again and again with nothing ever counted against it.
      strike(s, s.animals[d.seat], out);
    }
  }
  checkOver(s, out);

  return out;
}
