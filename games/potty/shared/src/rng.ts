/**
 * Seeded randomness, so a game can be replayed exactly in a test.
 *
 * The visual side of the client never draws from this: sparkles and wobbles
 * come from Math.random, or a child with effects turned down would consume a
 * different number of values and get a different game.
 */

/**
 * @param seed the state's seed
 * @return a number in 0..1 and the seed to carry on with
 */
export function next(seed: number): { value: number; seed: number } {
  let h = (seed + 0x6d2b79f5) >>> 0;
  h = Math.imul(h ^ (h >>> 15), h | 1) >>> 0;
  h = (h ^ (h + Math.imul(h ^ (h >>> 7), h | 61))) >>> 0;
  const out = (h ^ (h >>> 14)) >>> 0;

  return { value: out / 4294967296, seed: h };
}
