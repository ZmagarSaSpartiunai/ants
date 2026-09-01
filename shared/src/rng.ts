// mulberry32. The whole cursor is a single uint32, so a snapshot can carry the
// generator's position and a resynced client continues the identical stream.

export function nextRandom(state: number): [number, number] {
  let a = (state + 0x6d2b79f5) >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [a, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
}

/** Mutable cursor for setup code (map generation, bot jitter). */
export class Rng {
  constructor(public state: number) {}

  next(): number {
    const [s, v] = nextRandom(this.state);
    this.state = s;
    return v;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }

  pick<T>(items: T[]): T {
    return items[this.int(items.length)];
  }
}
