/**
 * Weather, derived rather than remembered.
 *
 * Wind is a pure function of (seed, round), not the next number out of a
 * running generator. A player whose phone dropped at round seven can work out
 * round seven's wind without replaying the six rounds before it, and two
 * clients can never fall a step out of phase with each other.
 *
 * A stateful generator would make both impossible, and mismatched weather is
 * exactly the kind of drift that never shows up in a log: everyone's aim is
 * simply slightly wrong, and only on some rounds.
 */

/**
 * @param seed the match seed
 * @param round which round
 * @return -1..1, negative blowing left
 */
export function windFor(seed: number, round: number): number {
  let h = (seed ^ Math.imul(round + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;

  return (h / 0xffffffff) * 2 - 1;
}
