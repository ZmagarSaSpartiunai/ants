import { LEVELS } from '@ants/shared';

/**
 * What the player has done, kept in this browser.
 *
 * Every read and write is wrapped: private mode throws on the first touch of
 * localStorage, and a game that will not start because it could not save a
 * counter is a much worse bug than a lost counter.
 */
const KEY = 'ants.progress.v1';

export interface Stats {
  /** Matches finished, of any kind. */
  played: number;
  won: number;
  /** Nodes taken from somebody, and nodes lost to somebody. */
  taken: number;
  lost: number;
  /** Trails gnawed through, by you and against you. */
  cut: number;
  wasCut: number;
  /** Ants that reached a target under your colours. */
  delivered: number;
  /** Seconds spent in matches. */
  seconds: number;
  bestStreak: number;
  streak: number;
}

export interface Progress {
  stats: Stats;
  /** Level id -> best result. Absent means never finished. */
  levels: Record<number, { done: boolean; seconds: number }>;
}

function blank(): Progress {
  return {
    stats: {
      played: 0,
      won: 0,
      taken: 0,
      lost: 0,
      cut: 0,
      wasCut: 0,
      delivered: 0,
      seconds: 0,
      bestStreak: 0,
      streak: 0,
    },
    levels: {},
  };
}

let cache: Progress | null = null;

export function progress(): Progress {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Progress;
      // Merge over a blank, so a save from an older build is still usable.
      cache = { stats: { ...blank().stats, ...parsed.stats }, levels: parsed.levels ?? {} };

      return cache;
    }
  } catch {
    // Unreadable or unavailable: play on with a fresh sheet.
  }
  cache = blank();

  return cache;
}

export function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress()));
  } catch {
    // Nothing to do: the numbers simply will not outlive this session.
  }
}

export function resetProgress(): void {
  cache = blank();
  save();
}

/** The next level that is playable: one past the last one finished. */
export function unlockedUpTo(): number {
  const p = progress();
  let last = 0;
  for (const level of LEVELS) {
    if (p.levels[level.id]?.done) last = level.id;
  }

  return Math.min(LEVELS.length, last + 1);
}

export function isUnlocked(id: number): boolean {
  return id <= unlockedUpTo();
}

export function recordLevel(id: number, seconds: number): void {
  const p = progress();
  const before = p.levels[id];
  // Keep the best time, so replaying a level to beat it means something.
  if (!before || !before.done || seconds < before.seconds) {
    p.levels[id] = { done: true, seconds };
  }
  save();
}

export function recordMatch(won: boolean, seconds: number): void {
  const s = progress().stats;
  s.played++;
  s.seconds += seconds;
  if (won) {
    s.won++;
    s.streak++;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
  } else {
    s.streak = 0;
  }
  save();
}

/** Counters that tick during play; saved at the end rather than every event. */
export function bump(field: keyof Stats, by = 1): void {
  progress().stats[field] += by;
}
