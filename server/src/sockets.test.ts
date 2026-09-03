import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, Server } from 'node:http';
import { WebSocket } from 'ws';
import { attachUpgrade, mountSocket, resetSockets } from './sockets.js';

/** A throwaway server on a free port, torn down by the caller. */
async function listen(allowed: () => boolean = () => true): Promise<{ port: number; http: Server }> {
  const http = createServer((_req, res) => res.writeHead(404).end());
  attachUpgrade(http, allowed);
  const port = await new Promise<number>((done) => {
    http.listen(0, '127.0.0.1', () => {
      const addr = http.address();
      done(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });

  return { port, http };
}

function opened(url: string): Promise<WebSocket> {
  return new Promise((done, fail) => {
    const ws = new WebSocket(url);
    ws.on('open', () => done(ws));
    ws.on('error', fail);
  });
}

test('each mounted path gets its own connections', async () => {
  resetSockets();
  const seen: string[] = [];
  mountSocket('/ants/ws', () => seen.push('ants'));
  mountSocket('/kaka/pigeons/ws', () => seen.push('pigeons'));
  const { port, http } = await listen();

  (await opened(`ws://127.0.0.1:${port}/ants/ws`)).close();
  (await opened(`ws://127.0.0.1:${port}/kaka/pigeons/ws`)).close();

  assert.deepEqual(seen, ['ants', 'pigeons']);
  http.close();
});

test('a query string does not hide the path from the router', async () => {
  resetSockets();
  const seen: string[] = [];
  mountSocket('/ants/ws', () => seen.push('ants'));
  const { port, http } = await listen();

  (await opened(`ws://127.0.0.1:${port}/ants/ws?name=%D0%9E%D0%BB%D1%8F`)).close();

  assert.deepEqual(seen, ['ants']);
  http.close();
});

test('an unmounted path is refused, not left hanging', async () => {
  resetSockets();
  const { port, http } = await listen();

  await assert.rejects(() => opened(`ws://127.0.0.1:${port}/nope`));
  http.close();
});

test('a socket the gate refuses never reaches a handler', async () => {
  resetSockets();
  const seen: string[] = [];
  mountSocket('/guarded/ws', () => seen.push('let in'));
  const { port, http } = await listen(() => false);

  await assert.rejects(() => opened(`ws://127.0.0.1:${port}/guarded/ws`));

  assert.deepEqual(seen, [], 'the gate must run before the handler');
  http.close();
});
