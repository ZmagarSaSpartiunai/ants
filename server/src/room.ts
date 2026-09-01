import { WebSocket } from 'ws';
import {
  applyCommand,
  Bot,
  BotLevel,
  Command,
  createGame,
  GameState,
  RoomPlayer,
  ServerMsg,
  step,
  TICK_HZ,
} from '@ants/shared';
import { recordMatch } from './db.js';

/** A full snapshot every five seconds: enough to heal a reconnect or any drift. */
const SYNC_EVERY = TICK_HZ * 5;
/** A lobby nobody joins is garbage after this long. */
const LOBBY_TIMEOUT_MS = 15 * 60000;
const MAX_NAME = 20;

interface Seat {
  slot: number;
  name: string;
  ws: WebSocket | null;
  bot: Bot | null;
  /** A seat played by the machine, whether declared up front or after a drop. */
  isBot: boolean;
}

export class Room {
  private readonly seats: Seat[] = [];
  private state: GameState | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private queued: Command[] = [];
  private seed = 0;
  private readonly created = Date.now();
  started = false;

  constructor(
    readonly code: string,
    readonly slots: number,
    readonly level: BotLevel,
    private readonly onEmpty: (room: Room) => void,
  ) {
    // Every seat starts open. A room that fills itself with bots on creation
    // cannot be joined by the friend it was created for -- which is exactly
    // what happened, and it reported itself as "room full".
    for (let i = 0; i < slots; i++) {
      this.seats.push({ slot: i, name: `#${i + 1}`, ws: null, bot: null, isBot: false });
    }
  }

  /** Host puts a bot on an empty seat, or takes it off to reopen the seat. */
  setBot(slot: number, on: boolean): void {
    if (this.started) return;
    const seat = this.seats[slot];
    if (!seat || seat.ws) return;
    seat.isBot = on;
    seat.name = on ? 'bot' : `#${slot + 1}`;
    this.announce();
  }

  get empty(): boolean {
    return !this.seats.some((s) => s.ws);
  }

  get stale(): boolean {
    return !this.started && Date.now() - this.created > LOBBY_TIMEOUT_MS;
  }

  /** Returns the assigned slot, or null when there is no seat left. */
  join(ws: WebSocket, name: string): number | null {
    const seat = this.seats.find((s) => !s.ws && !s.isBot);
    if (!seat) return null;
    seat.ws = ws;
    seat.name = sanitizeName(name) || `#${seat.slot + 1}`;
    this.announce();

    return seat.slot;
  }

  leave(ws: WebSocket): void {
    const seat = this.seats.find((s) => s.ws === ws);
    if (!seat) return;
    seat.ws = null;
    if (this.started) {
      // A dropped player is taken over by a bot rather than freezing the match
      // for everybody else.
      seat.isBot = true;
      seat.bot ??= new Bot(seat.slot, this.level, (this.seed + seat.slot * 7919) >>> 0);
    }
    if (this.empty) {
      this.stop();
      this.onEmpty(this);

      return;
    }
    this.announce();
  }

  isHost(ws: WebSocket): boolean {
    return this.seats.find((s) => s.ws)?.ws === ws;
  }

  slotOf(ws: WebSocket): number | null {
    return this.seats.find((s) => s.ws === ws)?.slot ?? null;
  }

  roster(): RoomPlayer[] {
    return this.seats.map((s) => ({
      slot: s.slot,
      name: s.name,
      bot: s.isBot,
      connected: !!s.ws,
    }));
  }

  announce(): void {
    for (const seat of this.seats) {
      if (!seat.ws) continue;
      this.sendTo(seat.ws, {
        t: 'room',
        code: this.code,
        you: seat.slot,
        players: this.roster(),
        slots: this.slots,
      });
    }
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.seed = (Math.random() * 0xfffff) >>> 0;
    this.state = createGame(this.seed, this.slots);
    for (const seat of this.seats) {
      if (seat.isBot || !seat.ws) {
        seat.isBot = true;
        seat.bot = new Bot(seat.slot, this.level, (this.seed + seat.slot * 7919) >>> 0);
      }
    }
    for (const seat of this.seats) {
      if (!seat.ws) continue;
      this.sendTo(seat.ws, { t: 'start', state: this.state, you: seat.slot, at: 0 });
    }
    this.timer = setInterval(() => this.tick(), 1000 / TICK_HZ);
  }

  /** Commands are never trusted: the slot comes from the socket, not the message. */
  submit(ws: WebSocket, cmd: Command): void {
    const slot = this.slotOf(ws);
    if (slot === null || !this.started) return;
    if (cmd.t !== 'link' && cmd.t !== 'unlink' && cmd.t !== 'chew') return;
    this.queued.push({ ...cmd, p: slot } as Command);
  }

  private tick(): void {
    const s = this.state;
    if (!s) return;

    for (const seat of this.seats) {
      if (!seat.bot) continue;
      for (const cmd of seat.bot.think(s)) this.queued.push(cmd);
    }

    // Only commands the rules actually accepted go on the wire. Clients replay
    // this exact list against the identical simulation, so nothing can drift.
    const applied: Command[] = [];
    for (const cmd of this.queued) {
      if (applyCommand(s, cmd)) applied.push(cmd);
    }
    this.queued.length = 0;

    const at = s.tick;
    step(s);
    this.broadcast({ t: 'cmds', tick: at, cmds: applied });

    if (s.tick % SYNC_EVERY === 0) this.broadcast({ t: 'sync', state: s });

    if (s.over) {
      this.broadcast({ t: 'over', winner: s.winner });
      this.save();
      this.stop();
    }
  }

  private save(): void {
    const s = this.state;
    if (!s) return;
    void recordMatch({
      code: this.code,
      seed: this.seed,
      slots: this.slots,
      bots: this.seats.filter((x) => x.isBot).length,
      winner: s.winner,
      ticks: s.tick,
      players: this.seats.map((seat) => ({
        slot: seat.slot,
        name: seat.name,
        bot: seat.isBot,
        nodes: s.nodes.filter((n) => n.owner === seat.slot).length,
      })),
    });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private broadcast(msg: ServerMsg): void {
    const data = JSON.stringify(msg);
    for (const seat of this.seats) {
      if (seat.ws && seat.ws.readyState === WebSocket.OPEN) seat.ws.send(data);
    }
  }

  private sendTo(ws: WebSocket, msg: ServerMsg): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }
}

/** Names are shown to other players, so strip control characters and markup. */
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return '';

  return raw
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, MAX_NAME);
}
