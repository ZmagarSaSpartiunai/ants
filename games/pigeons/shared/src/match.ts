import { foodById, FOODS } from './food.js';
import { Flight, flyShot } from './physics.js';
import { windFor } from './rng.js';
import { Bird, MatchState, MAX_BIRDS, MIN_BIRDS, Prop, Shot, START_HP } from './types.js';

/** Where each bird perches, in seat order. */
const PERCHES: { x: number; y: number }[] = [
  { x: 150, y: 250 },
  { x: 650, y: 250 },
  { x: 268, y: 126 },
  { x: 532, y: 126 },
];

export interface RoundResult {
  /** The round that was just played, not the one coming next. */
  round: number;
  wind: number;
  /** One per shot that counted, in seat order. */
  flights: Flight[];
  /** Slots knocked out this round. In a tie there can be more than one. */
  downed: number[];
}

/**
 * @param seed the match seed, shared by every client
 * @param players how many birds
 * @return a fresh match
 */
export function createMatch(seed: number, players: number): MatchState {
  const count = Math.max(MIN_BIRDS, Math.min(MAX_BIRDS, Math.floor(players)));
  const birds: Bird[] = [];
  for (let i = 0; i < count; i++) {
    const perch = PERCHES[i];
    birds.push({ slot: i, x: perch.x, y: perch.y, hp: START_HP, busy: 0, alive: true });
  }
  const props: Prop[] = [
    { id: 1, x: 340, y: 212, w: 120, h: 24, kind: 'roof', hp: 70, intact: true },
    { id: 2, x: 286, y: 96, w: 64, h: 18, kind: 'awning', hp: 34, intact: true },
    { id: 3, x: 450, y: 96, w: 64, h: 18, kind: 'awning', hp: 34, intact: true },
    { id: 4, x: 388, y: 148, w: 24, h: 60, kind: 'chimney', hp: 50, intact: true },
  ];
  // A ledge under each bird. It is a real prop, not scenery: a bird drawn
  // standing on something a shot passes straight through reads as a bug, and
  // the ledge doubles as the cover you can hide a low shot behind. Tough on
  // purpose -- it is a perch, not a target.
  for (const bird of birds) {
    props.push({
      id: 10 + bird.slot,
      x: bird.x - 27,
      y: bird.y + 14,
      w: 54,
      h: 16,
      kind: 'roof',
      hp: 150,
      intact: true,
    });
  }

  return { seed, round: 0, birds, props, over: false, winner: null };
}

/**
 * Plays one round.
 *
 * Rounds are simultaneous: everybody threw at the same moment, so every shot
 * flies against the world as it stood at the start of the round, and all the
 * damage lands together at the end. That matters -- resolving shot by shot
 * would let slot 0 knock slot 1 out before slot 1's melon, already in the air,
 * was allowed to arrive. Two birds can and should be able to finish each other
 * off in the same round.
 *
 * @param s the match, changed in place
 * @param shots what each seat fired, in any order
 * @return what happened, for the client to play back
 */
export function resolveRound(s: MatchState, shots: Shot[]): RoundResult {
  const wind = windFor(s.seed, s.round);
  const flights: Flight[] = [];
  const hurt = new Map<number, number>();
  const propHurt = new Map<number, number>();
  const fired = new Set<number>();
  // Sorting by seat is what makes a round independent of who answered first.
  const ordered = [...shots].sort((a, b) => a.slot - b.slot);

  for (const shot of ordered) {
    const bird = s.birds[shot.slot];
    if (!bird || !bird.alive || bird.busy > 0) continue;
    const food = foodById(shot.food);
    if (!food) continue;
    if (fired.has(bird.slot)) continue;
    if (!Number.isFinite(shot.angle) || !Number.isFinite(shot.power)) continue;

    const alive = s.birds.filter((b) => b.alive);
    const flight = flyShot({ x: bird.x, y: bird.y }, shot, s.props, wind, alive);
    flights.push(flight);
    bird.busy = food.digest;
    fired.add(bird.slot);

    for (const other of s.birds) {
      if (!other.alive) continue;
      const dist = Math.hypot(other.x - flight.end.x, other.y - flight.end.y);
      if (dist > food.blast) continue;
      // Full damage at the centre, nothing at the rim.
      const dealt = food.power * (1 - dist / food.blast);
      hurt.set(other.slot, (hurt.get(other.slot) ?? 0) + dealt);
    }
    if (flight.hitProp !== null) {
      propHurt.set(flight.hitProp, (propHurt.get(flight.hitProp) ?? 0) + food.power);
    }
  }

  const downed: number[] = [];
  for (const [slot, dealt] of hurt) {
    const bird = s.birds[slot];
    bird.hp = Math.max(0, bird.hp - dealt);
    if (bird.hp === 0 && bird.alive) {
      bird.alive = false;
      downed.push(slot);
    }
  }
  for (const [id, dealt] of propHurt) {
    const prop = s.props.find((p) => p.id === id);
    if (!prop) continue;
    prop.hp -= dealt;
    if (prop.hp <= 0) prop.intact = false;
  }

  // Only a bird that actually fired keeps its timer. One whose shot was
  // ignored must still count down, or a player hammering the button while
  // digesting would stay busy for ever.
  for (const bird of s.birds) {
    if (bird.busy > 0 && !fired.has(bird.slot)) bird.busy--;
  }
  s.round++;

  const standing = s.birds.filter((b) => b.alive);
  if (standing.length <= 1) {
    s.over = true;
    s.winner = standing.length === 1 ? standing[0].slot : null;
  }
  downed.sort((a, b) => a - b);

  return { round: s.round - 1, wind, flights, downed };
}

/**
 * @param s the match
 * @param slot which seat
 * @return whether that bird may fire this round
 */
export function canFire(s: MatchState, slot: number): boolean {
  const bird = s.birds[slot];

  return !!bird && bird.alive && bird.busy === 0 && !s.over;
}

/** Re-exported so a client needs one import to draw the food buttons. */
export { FOODS };
