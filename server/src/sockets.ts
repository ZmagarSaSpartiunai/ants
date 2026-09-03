import { IncomingMessage, Server } from 'node:http';
import { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';

/**
 * One WebSocket server, many games.
 *
 * `ws` can bind itself to a single `path`, which was enough while the box ran
 * one game. Every further game needs its own path, so the upgrade is taken over
 * here and dispatched by pathname. A game plugs itself in with one call to
 * mountSocket and needs to know nothing about the ones next door.
 */
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
const routes = new Map<string, (ws: WebSocket, req: IncomingMessage) => void>();

/**
 * @param path exact pathname, e.g. '/kaka/pigeons/ws'
 * @param onConnect called once per accepted socket
 * @return void
 */
export function mountSocket(path: string, onConnect: (ws: WebSocket, req: IncomingMessage) => void): void {
  routes.set(path, onConnect);
}

/** Only tests need this: the routing table is global for the life of the process. */
export function resetSockets(): void {
  routes.clear();
}

/**
 * @param http the server whose upgrades to take over
 * @param allowed decides whether a request may open a socket at all
 * @return void
 */
export function attachUpgrade(http: Server, allowed: (req: IncomingMessage) => boolean): void {
  http.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    // A query string is part of the URL but never part of the route: clients
    // are free to hang parameters off it.
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    const onConnect = routes.get(path);
    // An unknown or refused path is closed outright. A half-open upgrade holds
    // the socket until the kernel gives up on it.
    if (!onConnect || !allowed(req)) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();

      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnect(ws, req));
  });
}
