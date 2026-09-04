import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { BotLevel, ClientMsg, MAX_SLOTS, MIN_SLOTS } from '@ants/shared';
import { makeCode, normalizeCode } from './codes.js';
import { Room } from './room.js';
import { sanitizeName } from './lobby.js';
import { closeDb, initDb } from './db.js';
import { gateEnabled, handleGate, hasPass } from './gate.js';
import { findGame, GAMES, Game, socketPath } from './registry.js';
import { renderShelf } from './shelf.js';
import { attachUpgrade, mountSocket } from './sockets.js';

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
 * door -- and now that one process carries a whole catalogue.
 *
 * Which paths exist is not decided here: it comes from the registry, so adding
 * a game is one entry there and nothing else.
 *
 * Roots are resolved against this file, not the working directory: the defaults
 * have to hold whether the server is started from the repo root or elsewhere.
 */
const here = dirname(fileURLToPath(import.meta.url));

/**
 * @param game the game to locate on disk
 * @return its folder, or null when it was never put there
 */
function rootFor(game: Game): string | null {
  if (game.rootEnv) {
    const set = process.env[game.rootEnv];

    return set ? resolve(set) : null;
  }
  const override = process.env[`${game.id.toUpperCase()}_WEB_ROOT`];
  if (override) return resolve(override);

  return resolve(join(here, `../../${game.id === 'ants' ? 'client' : `games/${game.id}/client`}/dist`));
}

/**
 * @param game the card to test
 * @return whether its files are on this box
 */
function available(game: Game): boolean {
  const root = rootFor(game);

  return !!root && existsSync(root);
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
  const game = findGame(url.pathname);

  // Nothing owns this path: draw the shelf. Every game sits on it -- one lobby,
  // no categories, so a game is never a click deeper than any other.
  if (!game) {
    // Only what is actually on this box. A card whose files were never deployed
    // would be a link straight into a 404, which reads as a broken game.
    const html = renderShelf(GAMES.filter(available));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    res.end(html);

    return;
  }

  const root = rootFor(game);
  if (!root || !existsSync(root)) {
    // A game in the catalogue whose files were never put on this box. Saying so
    // beats a blank 404 when a deploy only half happened.
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`${game.title}: не зібрано на цій машині`);

    return;
  }

  // normalize collapses any ../ before it can escape the web root.
  const rel = normalize(decodeURIComponent(url.pathname.slice(game.path.length) || '/'))
    .replace(/^(\.\.[/\\])+/, '');
  let file = join(root, rel);
  if (!file.startsWith(root)) {
    res.writeHead(403).end();

    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
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

function onAntsSocket(ws: WebSocket): void {
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
}

/**
 * Every multiplayer game in the catalogue gets its socket mounted here. A new
 * game adds its handler and nothing else: no second server, no second port.
 *
 * The gate covers the sockets too, or the page would be closed and the game
 * behind it wide open.
 */
const HANDLERS: Record<string, (ws: WebSocket) => void> = {
  ants: onAntsSocket,
};

for (const game of GAMES) {
  if (!game.multiplayer) continue;
  const handler = HANDLERS[game.id];
  if (!handler) continue;
  mountSocket(socketPath(game), handler);
  console.log(`[host] ${game.title}: ${socketPath(game)}`);
}
attachUpgrade(http, hasPass);

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
    http.close();
    void closeDb().finally(() => process.exit(0));
  });
}
