import { ClientMsg, ServerMsg } from '@ants/shared';

/**
 * Cloudflare drops an idle WebSocket after 100 seconds. A lobby is idle by
 * definition, so it has to breathe.
 */
const HEARTBEAT_MS = 30_000;

export type NetHandler = (msg: ServerMsg) => void;

export class Net {
  private ws: WebSocket | null = null;
  private beat: ReturnType<typeof setInterval> | null = null;
  private queue: ClientMsg[] = [];

  constructor(
    private readonly onMsg: NetHandler,
    private readonly onState: (open: boolean, reason?: string) => void,
  ) {}

  connect(): void {
    if (this.ws) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${proto}://${location.host}/ws`);
    } catch {
      this.onState(false, 'offline');

      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.onState(true);
      for (const m of this.queue.splice(0)) ws.send(JSON.stringify(m));
      this.beat = setInterval(() => this.send({ t: 'ping' }), HEARTBEAT_MS);
    };
    ws.onmessage = (ev) => {
      try {
        this.onMsg(JSON.parse(ev.data) as ServerMsg);
      } catch {
        // A malformed frame is the server's problem, not a reason to die.
      }
    };
    ws.onclose = () => {
      this.cleanup();
      this.onState(false, 'offline');
    };
    ws.onerror = () => {
      this.onState(false, 'offline');
    };
  }

  send(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));

      return;
    }
    // Buffer until the socket opens, so a click never silently vanishes.
    this.queue.push(msg);
    this.connect();
  }

  close(): void {
    this.cleanup();
    this.ws?.close();
    this.ws = null;
  }

  private cleanup(): void {
    if (this.beat) clearInterval(this.beat);
    this.beat = null;
  }

  get open(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
