import { RoomPlayer } from '@ants/shared';

/**
 * Seats, codes, host and roster -- everything a room needs before a game
 * starts, and nothing about any particular game.
 *
 * This half used to live inside Room, fused to the ants tick. A second game
 * needs the seats and not the tick, so the two are separated here. The lobby is
 * generic in its client type: the server hands it real sockets, tests hand it
 * bare objects, and the lobby never touches either beyond identity.
 */

/** A lobby nobody joins is garbage after this long. */
const LOBBY_TIMEOUT_MS = 15 * 60000;
const MAX_NAME = 20;

export interface Seat<C> {
  slot: number;
  name: string;
  ws: C | null;
  /** A seat played by the machine, whether declared up front or after a drop. */
  isBot: boolean;
}

export class Lobby<C> {
  readonly seats: Seat<C>[] = [];
  private readonly created = Date.now();
  started = false;
  /** Set once the match is over: the room is done and takes no more input. */
  finished = false;

  constructor(
    readonly code: string,
    readonly slots: number,
  ) {
    // Every seat starts open. A room that fills itself with bots on creation
    // cannot be joined by the friend it was created for -- which is exactly
    // what happened, and it reported itself as "room full".
    for (let i = 0; i < slots; i++) {
      this.seats.push({ slot: i, name: `#${i + 1}`, ws: null, isBot: false });
    }
  }

  /**
   * Host puts a bot on an empty seat, or takes it off to reopen the seat.
   *
   * @param slot which seat
   * @param on whether a bot should hold it
   * @return whether anything actually changed
   */
  setBot(slot: number, on: boolean): boolean {
    if (this.started) return false;
    const seat = this.seats[slot];
    if (!seat || seat.ws) return false;
    if (seat.isBot === on) return false;
    seat.isBot = on;
    seat.name = on ? 'bot' : `#${slot + 1}`;

    return true;
  }

  get empty(): boolean {
    return !this.seats.some((s) => s.ws);
  }

  get stale(): boolean {
    return !this.started && Date.now() - this.created > LOBBY_TIMEOUT_MS;
  }

  /**
   * @param ws the arriving client
   * @param name what the player typed, possibly empty
   * @return the assigned slot, or null when there is no seat left
   */
  join(ws: C, name: string): number | null {
    const seat = this.seats.find((s) => !s.ws && !s.isBot);
    if (!seat) return null;
    seat.ws = ws;
    seat.name = sanitizeName(name) || `#${seat.slot + 1}`;

    return seat.slot;
  }

  /**
   * Clears the seat's socket and hands the seat back, so the caller can decide
   * what a departure means for its own game.
   *
   * @param ws the leaving client
   * @return the seat it held, or null when it held none
   */
  release(ws: C): Seat<C> | null {
    const seat = this.seats.find((s) => s.ws === ws);
    if (!seat) return null;
    seat.ws = null;

    return seat;
  }

  isHost(ws: C): boolean {
    return this.seats.find((s) => s.ws)?.ws === ws;
  }

  slotOf(ws: C): number | null {
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
}

/** Names are shown to other players, so strip control characters and markup. */
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return '';

  return raw
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, MAX_NAME);
}
