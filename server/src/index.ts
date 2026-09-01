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
 * This process is the games host, not just the ants server.
 *
 * The box already runs a Caddy for the control panel, but that site answers on
 * a bare port and matches every Host, so a second hostname pointed at it would
 * serve the panel instead. One process, one port, and nothing to break next
 * door -- and now that one process carries a small shelf of games.
 *
 *   /          the shelf
 *   /ants/     this game's client
 *   /ants/ws   this game's socket
 *   /luna/     a self-contained single file, if it has been put there
 *
 * Roots are resolved against this file, not the working directory: the defaults
 * have to hold whether the server is started from the repo root or elsewhere.
 */
const here = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(process.env.WEB_ROOT ?? join(here, '../../client/dist'));
const PORTAL_ROOT = resolve(process.env.PORTAL_ROOT ?? join(here, '../../portal'));
const LUNA_ROOT = process.env.LUNA_ROOT ? resolve(process.env.LUNA_ROOT) : null;

/** Which folder answers for this path, and what to strip off the front. */
function route(pathname: string): { root: string; rel: string } {
  if (pathname === '/ants' || pathname.startsWith('/ants/')) {
    return { root: WEB_ROOT, rel: pathname.slice(5) || '/' };
  }
  if (LUNA_ROOT && (pathname === '/luna' || pathname.startsWith('/luna/'))) {
    return { root: LUNA_ROOT, rel: pathname.slice(5) || '/' };
  }

  return { root: PORTAL_ROOT, rel: pathname };
}

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
  const target = route(url.pathname);
  // normalize collapses any ../ before it can escape the web root.
  const rel = normalize(decodeURIComponent(target.rel)).replace(/^(\.\.[/\\])+/, '');
  let file = join(target.root, rel);
  if (!file.startsWith(target.root)) {
    res.writeHead(403).end();

    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(target.root, 'index.html');
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
  path: '/ants/ws',
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
