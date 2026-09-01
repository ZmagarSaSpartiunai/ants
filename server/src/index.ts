import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { BotLevel, ClientMsg, MAX_SLOTS, MIN_SLOTS } from '@ants/shared';
import { makeCode, normalizeCode } from './codes.js';
import { Room, sanitizeName } from './room.js';
import { closeDb, initDb } from './db.js';
import { gateEnabled, handleGate, hasPass } from './gate.js';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';
/** Enough for this box; a real cap stops one prankster filling memory. */
const MAX_ROOMS = 500;
/** A client sending faster than this is not a player. */
const MAX_MSGS_PER_SEC = 40;

/**
 * The game serves its own client. The box already runs a Caddy for the control
 * panel, but that site answers on a bare port and matches every Host, so a
 * second hostname pointed at it would serve the panel instead of the game.
 * One process, one port, and nothing to break next door.
 */
// Resolved against this file, not the working directory: the default has to
// hold whether the server is started from the repo root or from anywhere else.
const WEB_ROOT = resolve(
  process.env.WEB_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '../../client/dist'),
);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
};

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  // normalize collapses any ../ before it can escape the web root.
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(WEB_ROOT, rel);
  if (!file.startsWith(WEB_ROOT)) {
    res.writeHead(403).end();

    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(WEB_ROOT, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404).end('not built');

    return;
  }
  const ext = extname(file).toLowerCase();
  // Hashed asset names may be cached hard; index.html never may.
  const cache = ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable';
  res.writeHead(200, { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': cache });
  createReadStream(file).pipe(res);
}

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
    const slots = Math.max(MIN_SLOTS, Math.min(MAX_SLOTS, Math.floor(Number(msg.slots) || 2)));
    const level: BotLevel = 'normal';
    const code = makeCode((c) => rooms.has(c));
    const room = new Room(code, slots, level, dropRoom);
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

  if (msg.t === 'bot') {
    if (room.isHost(ws)) room.setBot(Math.floor(Number(msg.slot)), !!msg.on);

    return;
  }

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
  void handleGate(req, res).then((answered) => {
    if (answered) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();

      return;
    }
    serveStatic(req, res);
  });
});

const wss = new WebSocketServer({
  server: http,
  path: '/ws',
  maxPayload: 16 * 1024,
  // The gate has to cover the socket too, or the page is closed and the game
  // behind it is not.
  verifyClient: ({ req }, done) => done(hasPass(req)),
});

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
console.log(gateEnabled() ? '[gate] password required' : '[gate] open to everyone');
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
