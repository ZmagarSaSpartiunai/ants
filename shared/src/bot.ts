import { Rng } from './rng.js';
import { canLink, chewCost, distance, outputRate, trailLoad } from './sim.js';

/** Seconds of streaming a bot weighs a target against. */
const ASSAULT_WINDOW = 20;
import {
  Command,
  DT,
  GameNode,
  GameState,
  KINDS,
  UNITS,
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
      // Output rises with the garrison, so even a small node contributes; it
      // just has to have something in it worth streaming.
      if (from.count < 5) continue;
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

    // An attack is a stream, not a single blow: what matters is how much this
    // node can deliver over the next few seconds, plus what is already walking.
    const inbound = s.packets.reduce(
      (acc, p) => (p.to === to.id && p.owner === this.player ? acc + p.amount * UNITS[p.unit].power : acc),
      0,
    );
    const feeding = s.trails.filter((t) => t.to === to.id && t.owner === this.player).length;
    const power = UNITS[KINDS[from.kind].unit].power;
    const attack = outputRate(s, from) * ASSAULT_WINDOW * power + inbound;
    // A ratio, not a threshold. Requiring a target to fall to this one node
    // alone made the bot stop attacking altogether once garrisons grew past
    // what a single stream could ever chew through, and matches never ended.
    score = 0.5 + Math.min(2.2, attack / Math.max(1, to.count));
    // Concentration is the whole answer to a defended node, so reward joining
    // an assault already under way -- but not past the point of overkill.
    if (feeding > 0 && feeding < 3) score += 1.8;

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
      // A full node with nowhere to forward to throws the whole stream away.
      const onward = s.trails.some((x) => x.from === to.id);
      if (to.owner === this.player && to.count >= KINDS[to.kind].cap && !onward) score = 1.4;
      // A source with nothing in it is barely producing; the slot is better spent.
      if (from.count < 3) score = Math.max(score, 0.9);
      if (score > 0) out.push({ cmd: { t: 'unlink', p: this.player, trail: t.id }, score });
    }

    return out;
  }
}
