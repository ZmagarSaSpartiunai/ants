import { Rng } from './rng.js';
import { canLink, chewCost, distance, trailLoad } from './sim.js';
import {
  Command,
  DT,
  GameNode,
  GameState,
  KINDS,
  UNITS,
  LINK_SURGE,
  NEUTRAL,
  Trail,
} from './types.js';

export type BotLevel = 'easy' | 'normal' | 'hard';

interface LevelSpec {
  /** Seconds between decisions. A slow bot simply notices things later. */
  period: number;
  /** Chance of taking the best option instead of a random decent one. */
  focus: number;
  /** Willingness to spend a turn gnawing instead of attacking. */
  cutting: number;
  /** Fraction of a garrison it is willing to commit. */
  commit: number;
}

const LEVELS: Record<BotLevel, LevelSpec> = {
  easy: { period: 2.2, focus: 0.35, cutting: 0.1, commit: 0.55 },
  normal: { period: 1.3, focus: 0.7, cutting: 0.35, commit: 0.4 },
  hard: { period: 0.8, focus: 0.95, cutting: 0.6, commit: 0.3 },
};

interface Option {
  cmd: Command;
  score: number;
}

export class Bot {
  private readonly spec: LevelSpec;
  private readonly rng: Rng;
  private cooldown: number;

  constructor(
    public readonly player: number,
    level: BotLevel,
    seed: number,
  ) {
    this.spec = LEVELS[level];
    this.rng = new Rng((seed ^ (player * 0x9e3779b1)) >>> 0);
    // Staggered so four bots in one room do not all move on the same tick.
    this.cooldown = this.rng.range(0.2, this.spec.period);
  }

  think(s: GameState): Command[] {
    const me = s.players[this.player];
    if (!me || !me.alive || s.over) return [];

    this.cooldown -= DT;

    // While gnawing it can do nothing else, exactly like a human. It lets go
    // once the trail is gone or the target stopped being worth the exposure.
    if (me.chewing !== -1) {
      const t = s.trails.find((x) => x.id === me.chewing);
      if (!t) return [{ t: 'chew', p: this.player, trail: -1 }];
      if (this.underAttack(s) && this.rng.next() < 0.5) {
        return [{ t: 'chew', p: this.player, trail: -1 }];
      }

      return [];
    }

    if (this.cooldown > 0) return [];
    this.cooldown = this.spec.period * this.rng.range(0.75, 1.3);

    const options = [...this.linkOptions(s), ...this.cutOptions(s), ...this.pruneOptions(s)];
    if (!options.length) return [];
    options.sort((a, b) => b.score - a.score);

    const chosen =
      this.rng.next() < this.spec.focus
        ? options[0]
        : options[Math.min(options.length - 1, this.rng.int(3))];
    if (chosen.score <= 0) return [];

    return [chosen.cmd];
  }

  /** Something of mine is being shot at right now. */
  private underAttack(s: GameState): boolean {
    return s.packets.some((p) => p.owner !== this.player && s.nodes[p.to]?.owner === this.player);
  }

  private linkOptions(s: GameState): Option[] {
    const out: Option[] = [];
    const mine = s.nodes.filter((n) => n.owner === this.player);
    if (!mine.length) return out;

    for (const from of mine) {
      const spec = KINDS[from.kind];
      // A surge costs most of the garrison, so only spend one that is worth
      // spending -- and keep enough behind to survive the counterattack.
      if (from.count < spec.cap * (1 - this.spec.commit)) continue;
      const air = from.kind === 'hive';

      for (const to of s.nodes) {
        if (to.id === from.id) continue;
        if (!canLink(s, this.player, from.id, to.id)) continue;
        const d = distance(from, to);

        let score = this.targetValue(s, to, from);
        // Nothing forbids a long trail any more, but one is still a worse idea:
        // the column spends longer walking, and longer exposed to being cut.
        score -= d / 260;
        // A hive's one route is precious, so spend it on something far away
        // that nothing on the ground could have reached.
        if (air) score += 1.2 + d / 500;
        if (score > 0) out.push({ cmd: { t: 'link', p: this.player, from: from.id, to: to.id }, score });
      }
    }

    return out;
  }

  private targetValue(s: GameState, to: GameNode, from: GameNode): number {
    const spec = KINDS[to.kind];
    const mySpec = KINDS[from.kind];
    let score = 0;

    if (to.owner === this.player) {
      // Reinforcing only makes sense towards something actually threatened.
      const incoming = s.packets
        .filter((p) => p.to === to.id && p.owner !== this.player)
        .reduce((a, p) => a + p.amount, 0);
      if (incoming <= 0) return -1;
      score = 1.5 + Math.min(3, incoming / 4);
      // A node cut off from home is dead weight; feeding it is throwing units away.
      if (!s.supplied[to.id]) score -= 1;

      return score;
    }

    // What an attack is worth now: the surge, plus whatever is already on its
    // way. A single trail no longer takes a defended node -- its trickle only
    // matches the defender's production -- so the bot has to pile on, exactly
    // as a player has to.
    const inbound = s.packets.reduce(
      (acc, p) => (p.to === to.id && p.owner === this.player ? acc + p.amount * UNITS[p.unit].power : acc),
      0,
    );
    const feeding = s.trails.filter((t) => t.to === to.id && t.owner === this.player).length;
    const attack = from.count * LINK_SURGE * UNITS[KINDS[from.kind].unit].power + inbound;
    score = attack > to.count ? 2.4 : 0.2 - (to.count - attack) / 14;
    // Concentration is the whole answer to a defended node, so reward joining
    // an assault already under way -- but not past the point of overkill.
    if (feeding > 0 && feeding < 3) score += 1.6;

    // Specials are worth more than plain nests: they are the map's variety.
    if (to.kind === 'den') score += 1.1;
    if (to.kind === 'hive') score += 1.6;
    score += spec.growth * 0.6;

    if (to.owner !== NEUTRAL) {
      score += 0.9;
      const enemy = s.players[to.owner];
      // Taking a home forces the enemy's supply to retreat -- worth a lot.
      if (enemy && enemy.home === to.id) score += 2.5;
      if (!s.supplied[to.id]) score += 1.2; // already starving: cheap to finish
    }

    // Beetles are slow, so sending them far is usually a mistake.
    if (mySpec.unit === 'beetle') score -= distance(from, to) / 400;

    return score;
  }

  private cutOptions(s: GameState): Option[] {
    const out: Option[] = [];
    if (this.rng.next() > this.spec.cutting) return out;

    for (const t of s.trails) {
      if (t.owner === this.player || t.air) continue;
      const load = trailLoad(s, t);
      const cost = chewCost(s, t);
      // Standing still for six seconds must buy something big.
      let score = this.arteryValue(s, t) + load * 0.3 - cost * 0.55;
      // Cutting what is aimed at me is worth more than cutting a far skirmish.
      if (s.nodes[t.to]?.owner === this.player) score += 1.8;
      if (score > 0) out.push({ cmd: { t: 'chew', p: this.player, trail: t.id }, score });
    }

    return out;
  }

  /** How much of the enemy network hangs off this one trail. */
  private arteryValue(s: GameState, t: Trail): number {
    const owner = t.owner;
    const reach = new Set<number>([t.to]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const other of s.trails) {
        if (other.owner !== owner || other.air) continue;
        if (reach.has(other.from) && !reach.has(other.to)) {
          reach.add(other.to);
          grew = true;
        }
      }
    }
    let value = 0;
    for (const id of reach) {
      const n = s.nodes[id];
      if (n && n.owner === owner) value += 0.8 + KINDS[n.kind].growth;
    }

    return value;
  }

  /**
   * Retire a trail that has stopped earning its slot. This is also how the bot
   * attacks repeatedly: a spent source is unhooked, refills, and the next link
   * fires a fresh surge. Holding a drained trail open forever only trickles.
   */
  private pruneOptions(s: GameState): Option[] {
    const out: Option[] = [];
    for (const t of s.trails) {
      if (t.owner !== this.player) continue;
      const to = s.nodes[t.to];
      const from = s.nodes[t.from];
      if (!to || !from) continue;
      let score = 0;
      // Feeding a node that is already overflowing wastes the whole output.
      if (to.owner === this.player && to.count >= KINDS[to.kind].cap * 1.2) score = 1.4;
      // A spent source: free the slot so it can surge again once it refills.
      if (from.count < KINDS[from.kind].cap * 0.3) score = Math.max(score, 1.1);
      if (score > 0) out.push({ cmd: { t: 'unlink', p: this.player, trail: t.id }, score });
    }

    return out;
  }
}
