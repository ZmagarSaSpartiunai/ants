import { BotLevel } from './bot.js';
import { GameState, NEUTRAL } from './types.js';

/**
 * The campaign.
 *
 * Every level is a fixed seed, so the map is the same every time you come back
 * to it -- that is what makes it a level rather than another random skirmish.
 *
 * Levels have a **goal**, and not always "wipe everyone out". That is partly
 * for variety and partly because it has to be true: cutting supply is
 * deliberately an answer to a stronger opponent, so this game does not always
 * snowball into annihilation. Measured against bots, roughly half of even
 * matches never resolve at all. A level that could hang forever is not a level,
 * so most of them ask for a majority of the board instead.
 */
export type Goal =
  /** Be the last one standing. Used where the map is small enough to allow it. */
  | { t: 'wipe' }
  /** Hold this many nodes at once. The usual goal: it always terminates. */
  | { t: 'hold'; nodes: number }
  /** Take every rival's home. A decapitation, and it reads as one. */
  | { t: 'homes' };

export interface LevelDef {
  /** 1-based, and also its number on the map screen. */
  id: number;
  seed: number;
  players: number;
  bot: BotLevel;
  goal: Goal;
}

/**
 * Difficulty rises along three axes at once, and never all three at the same
 * step: more opponents, sharper bots, a harder thing to achieve. Rising them
 * together makes level five feel like a wall.
 */
export const LEVELS: LevelDef[] = buildLevels();

function buildLevels(): LevelDef[] {
  const out: LevelDef[] = [];
  const plan: [number, BotLevel, Goal][] = [
    [2, 'easy', { t: 'hold', nodes: 6 }],
    [2, 'easy', { t: 'hold', nodes: 8 }],
    [2, 'easy', { t: 'homes' }],
    [2, 'normal', { t: 'hold', nodes: 8 }],
    [3, 'easy', { t: 'hold', nodes: 8 }],
    [2, 'normal', { t: 'homes' }],
    [3, 'normal', { t: 'hold', nodes: 9 }],
    [2, 'hard', { t: 'hold', nodes: 9 }],
    [3, 'normal', { t: 'homes' }],
    [4, 'easy', { t: 'hold', nodes: 9 }],
    [2, 'hard', { t: 'wipe' }],
    [4, 'normal', { t: 'hold', nodes: 10 }],
    [3, 'hard', { t: 'homes' }],
    [4, 'normal', { t: 'homes' }],
    [3, 'hard', { t: 'hold', nodes: 11 }],
    [4, 'hard', { t: 'hold', nodes: 11 }],
    [4, 'hard', { t: 'homes' }],
    [4, 'hard', { t: 'hold', nodes: 12 }],
  ];
  plan.forEach(([players, bot, goal], i) => {
    // Seeds are spread out rather than sequential: neighbouring seeds can throw
    // up noticeably similar maps, and two levels in a row on the same board is
    // the fastest way to make a campaign feel lazy.
    out.push({ id: i + 1, seed: 1013 + i * 7717, players, bot, goal });
  });

  return out;
}

export function levelById(id: number): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}

export type LevelOutcome = 'playing' | 'won' | 'lost';

/**
 * Judged from outside the simulation on purpose: goals belong to the campaign,
 * and the rules of the game should not know a campaign exists.
 */
export function judge(s: GameState, goal: Goal, you: number): LevelOutcome {
  const me = s.players[you];
  if (!me || !me.alive) return 'lost';

  const mine = s.nodes.filter((n) => n.owner === you).length;
  const rivals = s.players.filter((p) => p.id !== you && p.alive);

  if (goal.t === 'wipe') {
    if (!rivals.length) return 'won';
  } else if (goal.t === 'hold') {
    if (mine >= goal.nodes || !rivals.length) return 'won';
  } else {
    // Every rival's home taken. A player whose home was captured retreats to
    // their biggest nest, so this asks for it to be taken faster than they can
    // fall back -- not merely touched once.
    if (!rivals.length) return 'won';
    if (rivals.every((p) => s.nodes[p.home]?.owner === you)) return 'won';
  }

  return 'playing';
}

/** What the goal asks for, as numbers a screen can put into a sentence. */
export function goalProgress(s: GameState, goal: Goal, you: number): { have: number; need: number } {
  if (goal.t === 'hold') {
    return { have: s.nodes.filter((n) => n.owner === you).length, need: goal.nodes };
  }
  const rivals = s.players.filter((p) => p.id !== you && p.alive);
  if (goal.t === 'homes') {
    const total = s.players.length - 1;

    return { have: total - rivals.filter((p) => s.nodes[p.home]?.owner !== you).length, need: total };
  }

  return { have: s.players.length - 1 - rivals.length, need: s.players.length - 1 };
}

export { NEUTRAL };
