import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { BotLevel, ClientMsg } from '@ants/shared';
import { makeCode, normalizeCode } from './codes.js';
import { Room, sanitizeName } from './room.js';
import { closeDb, initDb } from './db.js';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';
/** Enough for this box; a real cap stops one prankster filling memory. */
const MAX_ROOMS = 500;
/** A client sending faster than this is not a player. */
const MAX_MSGS_PER_SEC = 40;

const rooms = new Map<string, Room>();
const membership = new WeakMap<WebSocket, Room>();
const budget = new WeakMap<WebSocket, { count: number; until: number }>();

function dropRoom(room: Room): void {
  room.stop();
  rooms.delete(room.code);
}

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function overBudget(ws: WebSocket): boolean {
  const now = Date.now();
  let b = budget.get(ws);
  if (!b || b.until < now) {
    b = { count: 0, until: now + 1000 };
    budget.set(ws, b);
  }
  b.count++;

  return b.count > MAX_MSGS_PER_SEC;
}

function handle(ws: WebSocket, msg: ClientMsg): void {
  if (msg.t === 'ping') {
    // Cloudflare kills a socket after 100 seconds of silence, so a lobby has
    // to breathe even when nothing is happening.
    send(ws, { t: 'pong' });

    return;
  }

  if (msg.t === 'create') {
    if (membership.has(ws)) return;
    if (rooms.size >= MAX_ROOMS) {
      send(ws, { t: 'error', msg: 'roomFull' });

      return;
    }
    const slots = Math.max(2, Math.min(4, Math.floor(Number(msg.slots) || 2)));
    const bots = Math.max(0, Math.min(slots - 1, Math.floor(Number(msg.bots) || 0)));
    const level: BotLevel = 'normal';
    const code = makeCode((c) => rooms.has(c));
    const room = new Room(code, slots, bots, level, dropRoom);
    rooms.set(code, room);
    room.join(ws, sanitizeName(msg.name));
    membership.set(ws, room);

    return;
  }

  if (msg.t === 'join') {
    if (membership.has(ws)) return;
    const code = normalizeCode(msg.code);
    const room = code ? rooms.get(code) : undefined;
    if (!room || room.started) {
      send(ws, { t: 'error', msg: 'noRoom' });

      return;
    }
    const slot = room.join(ws, sanitizeName(msg.name));
    if (slot === null) {
      send(ws, { t: 'error', msg: 'roomFull' });

      return;
    }
    membership.set(ws, room);

    return;
  }

  const room = membership.get(ws);
  if (!room) return;

  if (msg.t === 'ready') {
    // Only the first connected seat may start; everyone else is a guest.
    if (room.isHost(ws)) room.start();

    return;
  }

  if (msg.t === 'cmd') {
    room.submit(ws, msg.cmd);
  }
}

const http = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, uptime: process.uptime() }));

    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 16 * 1024 });

wss.on('connection', (ws: WebSocket) => {
  let alive = true;
  ws.on('pong', () => {
    alive = true;
  });
  const probe = setInterval(() => {
    // A socket that stops answering is gone even if TCP has not noticed.
    if (!alive) {
      ws.terminate();

      return;
    }
    alive = false;
    ws.ping();
  }, 25000);

  ws.on('message', (raw) => {
    if (overBudget(ws)) return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw)) as ClientMsg;
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;
    try {
      handle(ws, msg);
    } catch (err) {
      console.error('[ws] handler failed', (err as Error).message);
    }
  });

  ws.on('close', () => {
    clearInterval(probe);
    membership.get(ws)?.leave(ws);
    membership.delete(ws);
  });
  ws.on('error', () => ws.terminate());
});

// Lobbies that nobody ever joined would otherwise sit in memory for good.
setInterval(() => {
  for (const room of [...rooms.values()]) {
    if (room.stale || room.empty) dropRoom(room);
  }
}, 60000);

initDb();
http.listen(PORT, HOST, () => {
  console.log(`[ants] listening on ${HOST}:${PORT}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`[ants] ${sig}, shutting down`);
    for (const room of rooms.values()) room.stop();
    wss.close();
    http.close();
    void closeDb().finally(() => process.exit(0));
  });
}
