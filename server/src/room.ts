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
import { Lobby } from './lobby.js';

/** A full snapshot every five seconds: enough to heal a reconnect or any drift. */
const SYNC_EVERY = TICK_HZ * 5;

/**
 * One match of Мурашник.
 *
 * The seats are not kept here: they live in a Lobby, which knows nothing about
 * ants and is shared with every other game on the host. What is left in this
 * file is only what makes this game this game -- the tick, the bots, and the
 * summary written when it ends.
 */
export class Room {
  private readonly lobby: Lobby<WebSocket>;
  /** Bots by slot; a seat with no bot is played by a person. */
  private readonly bots: (Bot | null)[];
  private state: GameState | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private queued: Command[] = [];
  private seed = 0;

  constructor(
    readonly code: string,
    readonly slots: number,
    readonly level: BotLevel,
    private readonly onEmpty: (room: Room) => void,
  ) {
    this.lobby = new Lobby<WebSocket>(code, slots);
    this.bots = Array.from({ length: slots }, () => null);
  }

  get started(): boolean {
    return this.lobby.started;
  }

  get finished(): boolean {
    return this.lobby.finished;
  }

  get empty(): boolean {
    return this.lobby.empty;
  }

  get stale(): boolean {
    return this.lobby.stale;
  }

  /** Host puts a bot on an empty seat, or takes it off to reopen the seat. */
  setBot(slot: number, on: boolean): void {
    if (this.lobby.setBot(slot, on)) this.announce();
  }

  /**
   * @param ws the arriving socket
   * @param name what the player typed, possibly empty
   * @return the assigned slot, or null when the room is full
   */
  join(ws: WebSocket, name: string): number | null {
    const slot = this.lobby.join(ws, name);
    if (slot !== null) this.announce();

    return slot;
  }

  leave(ws: WebSocket): void {
    const seat = this.lobby.release(ws);
    if (!seat) return;
    if (this.started) {
      // A dropped player is taken over by a bot rather than freezing the match
      // for everybody else.
      seat.isBot = true;
      this.bots[seat.slot] ??= new Bot(seat.slot, this.level, (this.seed + seat.slot * 7919) >>> 0);
    }
    if (this.empty) {
      this.stop();
      if (!this.finished) this.onEmpty(this);

      return;
    }
    this.announce();
  }

  isHost(ws: WebSocket): boolean {
    return this.lobby.isHost(ws);
  }

  slotOf(ws: WebSocket): number | null {
    return this.lobby.slotOf(ws);
  }

  roster(): RoomPlayer[] {
    return this.lobby.roster();
  }

  announce(): void {
    for (const seat of this.lobby.seats) {
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
    this.lobby.started = true;
    this.seed = (Math.random() * 0xfffff) >>> 0;
    this.state = createGame(this.seed, this.slots);
    for (const seat of this.lobby.seats) {
      if (seat.isBot || !seat.ws) {
        seat.isBot = true;
        this.bots[seat.slot] = new Bot(seat.slot, this.level, (this.seed + seat.slot * 7919) >>> 0);
      }
    }
    for (const seat of this.lobby.seats) {
      if (!seat.ws) continue;
      this.sendTo(seat.ws, { t: 'start', state: this.state, you: seat.slot, at: 0 });
    }
    this.timer = setInterval(() => this.tick(), 1000 / TICK_HZ);
  }

  /** Commands are never trusted: the slot comes from the socket, not the message. */
  submit(ws: WebSocket, cmd: Command): void {
    const slot = this.slotOf(ws);
    // Nothing drains the queue once the match is over, so anything accepted
    // after that would simply grow in memory until the socket closed.
    if (slot === null || !this.started || this.finished) return;
    if (cmd.t !== 'link' && cmd.t !== 'unlink' && cmd.t !== 'chew') return;
    this.queued.push({ ...cmd, p: slot } as Command);
  }

  private tick(): void {
    const s = this.state;
    if (!s) return;

    for (const bot of this.bots) {
      if (!bot) continue;
      for (const cmd of bot.think(s)) this.queued.push(cmd);
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
      // And let it go. A finished room used to sit in the table for good: its
      // seats still held sockets, so it never counted as empty, and `stale`
      // only ever looks at lobbies that never started. Enough finished matches
      // and no new room could be created at all.
      this.lobby.finished = true;
      this.onEmpty(this);
    }
  }

  private save(): void {
    const s = this.state;
    if (!s) return;
    void recordMatch({
      code: this.code,
      seed: this.seed,
      slots: this.slots,
      bots: this.lobby.seats.filter((x) => x.isBot).length,
      winner: s.winner,
      ticks: s.tick,
      players: this.lobby.seats.map((seat) => ({
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
    for (const seat of this.lobby.seats) {
      if (seat.ws && seat.ws.readyState === WebSocket.OPEN) seat.ws.send(data);
    }
  }

  private sendTo(ws: WebSocket, msg: ServerMsg): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }
}
