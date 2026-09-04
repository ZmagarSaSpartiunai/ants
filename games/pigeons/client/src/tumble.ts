/**
 * A bird knocked off its perch, and how it gets back.
 *
 * Purely how it looks: the bird's real position never moves, so the rules and
 * every replay stay exactly as they were. The next round is held until every
 * bird is home again, so no shot is ever fired at a bird that is not where the
 * simulation says it is.
 *
 * It lives apart from the game loop because an animation that cannot be run on
 * its own cannot be looked at: a hidden browser tab gets no animation frames,
 * so the only way to judge this is to step it by hand.
 */

/** Strides per second while walking home. */
export const WALK_CYCLE = 3.4;
/** How fast a knocked-off bird waddles home, in world units per second. */
export const WALK_SPEED = 190;
const GRAVITY = 900;

export interface Tumble {
  /**
   * Seven beats, not two. Landing straight into a walk was the thing that read
   * as clumsy: a body arriving on stone with no impact, and standing up with no
   * effort, is a sprite being moved rather than an animal falling over.
   */
  phase: 'fall' | 'sprawl' | 'rise' | 'walk' | 'crouch' | 'hop' | 'land';
  /** Offset from the perch, in world units. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  spinV: number;
  /** Seconds spent in the current phase. */
  t: number;
  /** Which way it was thrown, so it gets up facing the right way. */
  dir: number;
  /** Squash: positive is flattened, negative stretched. Spring-driven. */
  sq: number;
  sqV: number;
}

/**
 * @param dirX which way the blast pushed, -1 or 1
 * @param dirY how much of the push was upward, -1..1
 * @param push how hard, in world units
 * @return a bird just leaving its perch
 */
export function startTumble(dirX: number, dirY: number, push: number): Tumble {
  const dir = dirX >= 0 ? 1 : -1;

  return {
    phase: 'fall',
    x: 0,
    y: 0,
    vx: dirX * push * 3.4,
    vy: dirY * push * 2 - 110,
    spin: 0,
    spinV: dir * 9,
    t: 0,
    dir,
    // Yanked, so it leaves the ledge stretched and settles as it flies.
    sq: -0.22,
    sqV: 0,
  };
}

/**
 * One frame of the fall.
 *
 * @param k the bird's state, advanced in place
 * @param dt seconds
 * @param drop how far the pavement is below this bird's own perch
 * @param dust called where the bird strikes something, with how much grit
 * @return false once the bird is home and the entry can be dropped
 */
export function stepTumble(
  k: Tumble,
  dt: number,
  drop: number,
  dust: (offsetX: number, offsetY: number, n: number) => void,
): boolean {
  k.t += dt;
  // Squash rings out on a spring in every phase. Setting it and clearing it
  // per phase gave a flat pop; a spring overshoots on the way back, which is
  // the part the eye reads as weight.
  k.sqV += (-k.sq * 300 - k.sqV * 14) * dt;
  k.sq += k.sqV * dt;

  if (k.phase === 'fall') {
    k.vy += GRAVITY * dt;
    k.x += k.vx * dt;
    k.y += k.vy * dt;
    k.spin += k.spinV * dt;
    if (k.y >= drop) {
      k.y = drop;
      k.phase = 'sprawl';
      k.t = 0;
      // On its back, feet in the air. A quarter turn left it nose-down and
      // balanced on its head, which reads as a glitch rather than as a bird
      // that has been knocked over.
      k.spin = k.dir * Math.PI * 0.92;
      k.sq = 0.44;
      k.sqV = 0;
      dust(k.x, drop, 12);
    }
  } else if (k.phase === 'sprawl') {
    // Slides to a stop instead of arriving and freezing.
    k.x += k.vx * dt;
    k.vx *= Math.max(0, 1 - dt * 7);
    if (k.t > 0.45) {
      k.phase = 'rise';
      k.t = 0;
    }
  } else if (k.phase === 'rise') {
    // Getting up costs something. The body rocks upright over a third of a
    // second and tips a little past vertical before settling.
    const p = Math.min(1, k.t / 0.42);
    const ease = p * p * (3 - 2 * p);
    // Rolls back the way it came and tips a little past upright before settling.
    k.spin = k.dir * (Math.PI * 0.92 * (1 - ease) - 0.14 * Math.sin(p * Math.PI));
    if (p >= 1) {
      k.phase = 'walk';
      k.t = 0;
      k.spin = 0;
      k.vx = 0;
    }
  } else if (k.phase === 'walk') {
    // Leans into the walk and slows into the spot. One constant speed with a
    // hard stop is the clearest tell of an animation nobody timed.
    const away = Math.abs(k.x);
    const want = Math.sign(-k.x) * WALK_SPEED * Math.min(1, away / 26);
    k.vx += (want - k.vx) * Math.min(1, dt * 7);
    k.x += k.vx * dt;
    if (away < 1.4 && Math.abs(k.vx) < 16) {
      k.x = 0;
      k.vx = 0;
      k.phase = 'crouch';
      k.t = 0;
      // Anticipation: the dip before the jump is one impulse, and the spring
      // carries it back up through neutral into the stretch.
      k.sq = 0.36;
      k.sqV = 0;
    }
  } else if (k.phase === 'crouch') {
    if (k.t > 0.16) {
      k.phase = 'hop';
      k.t = 0;
      k.sq = -0.3;
      k.sqV = 0;
      // Just enough to clear the ledge and land on it.
      k.vy = -Math.sqrt(2 * GRAVITY * (drop + 34));
    }
  } else if (k.phase === 'hop') {
    k.vy += GRAVITY * dt;
    k.y += k.vy * dt;
    if (k.y <= 0) {
      k.y = 0;
      k.phase = 'land';
      k.t = 0;
      k.sq = 0.3;
      k.sqV = 0;
      dust(0, 0, 5);
    }
  } else if (k.t > 0.24) {
    // The landing is allowed to settle before the round is let go.
    return false;
  }

  return true;
}

/**
 * How a pigeon's head moves, which is the one thing everybody recognises.
 *
 * It is not a sine. The head is thrust forward fast and then held still in the
 * world while the body walks on underneath, so relative to the body it drifts
 * back at walking speed and snaps forward again. A sine here reads as a bobbing
 * cork; this reads as a pigeon.
 *
 * @param cycle position in the stride, counted in whole strides
 * @return how far forward the head sits, in world units
 */
export function headThrust(cycle: number): number {
  const p = cycle - Math.floor(cycle);

  return p < 0.22 ? (p / 0.22) * 3.6 : 3.6 * (1 - (p - 0.22) / 0.78);
}
