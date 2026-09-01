// Two headless clients play a real room against a real server and replay its
// command stream through the same simulation the browser uses.
//
// This is the one test that can catch the failure the whole architecture is
// built to avoid: the two sides quietly computing different games. If lockstep
// holds, every client's fingerprint matches at every shared tick, and each of
// the server's own snapshots matches what the clients had already computed.
//
//   node tools/lockstep.mjs                        # against a local server
//   ANTS_URL=ws://127.0.0.1:18787/ants/ws node tools/lockstep.mjs
//   ANTS_URL=wss://host/ants/ws ANTS_COOKIE='ants_gate=...' node tools/lockstep.mjs
//
// Requires `npm run build` first: it imports the built simulation.

import { createRequire } from 'node:module';
import { applyCommand, canLink, step } from '../shared/dist/index.js';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const URL = process.env.ANTS_URL ?? 'ws://127.0.0.1:8787/ants/ws';
// Needed when the deployment sits behind the development password gate.
const COOKIE = process.env.ANTS_COOKIE ?? '';
const SECONDS = Number(process.env.ANTS_SECONDS ?? 20);

/** Everything that must agree, rounded so float noise is not mistaken for drift. */
function fingerprint(s) {
  return JSON.stringify([
    s.tick,
    s.nodes.map((n) => [n.owner, Math.round(n.count * 1e6)]),
    s.trails.map((t) => [t.id, t.owner, t.from, t.to, Math.round(t.chew * 1e6)]),
    s.packets.map((p) => [
      p.owner,
      p.from,
      p.to,
      Math.round(p.pos * 1e9),
      Math.round(p.amount * 1e6),
    ]),
  ]);
}

class Client {
  constructor(tag) {
    this.tag = tag;
    this.ws = new WebSocket(URL, COOKIE ? { headers: { cookie: COOKIE } } : undefined);
    this.state = null;
    this.you = -1;
    this.code = '';
    this.prints = new Map();
    this.syncMismatch = 0;
    this.acted = 0;
    this.ws.on('message', (raw) => this.onMsg(JSON.parse(String(raw))));
  }

  send(m) {
    this.ws.send(JSON.stringify(m));
  }

  onMsg(m) {
    if (m.t === 'room') {
      this.code = m.code;
      this.you = m.you;
    } else if (m.t === 'start') {
      this.state = m.state;
      this.you = m.you;
    } else if (m.t === 'cmds') {
      // Exactly what the browser does: apply, then step. Same code, same order.
      for (const c of m.cmds) applyCommand(this.state, c);
      step(this.state);
      this.prints.set(this.state.tick, fingerprint(this.state));
      this.maybeAct();
    } else if (m.t === 'sync') {
      const mine = this.prints.get(m.state.tick);
      if (mine && mine !== fingerprint(m.state)) this.syncMismatch++;
    } else if (m.t === 'over') {
      this.winner = m.winner;
    }
  }

  /** Play badly but legally, often enough to keep commands flowing. */
  maybeAct() {
    const s = this.state;
    if (!s || s.over || s.tick % 37 !== 0) return;
    for (const from of s.nodes.filter((n) => n.owner === this.you)) {
      for (const to of s.nodes) {
        if (to.owner !== this.you && canLink(s, this.you, from.id, to.id)) {
          this.send({ t: 'cmd', cmd: { t: 'link', p: this.you, from: from.id, to: to.id } });
          this.acted++;

          return;
        }
      }
    }
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const a = new Client('A');
await new Promise((r) => a.ws.once('open', r));
a.send({ t: 'create', name: 'Alpha', slots: 2, bots: 0 });
await wait(300);

const b = new Client('B');
await new Promise((r) => b.ws.once('open', r));
b.send({ t: 'join', code: a.code, name: 'Beta' });
await wait(300);

a.send({ t: 'ready' });
await wait(SECONDS * 1000);

const shared = [...a.prints.keys()].filter((k) => b.prints.has(k));
const diverged = shared.filter((k) => a.prints.get(k) !== b.prints.get(k)).length;

console.log(`сервер:        ${URL}`);
console.log(`код кімнати:   ${a.code}`);
console.log(`спільних тактів: ${shared.length}, розбіжностей між клієнтами: ${diverged}`);
console.log(`знімки сервера, що не збіглись: A=${a.syncMismatch} B=${b.syncMismatch}`);
console.log(`команд надіслано: A=${a.acted} B=${b.acted}`);
console.log(`такт A=${a.state?.tick} B=${b.state?.tick}, завершено: ${a.state?.over}`);

const ok = shared.length > 50 && diverged === 0 && a.syncMismatch === 0 && b.syncMismatch === 0;
console.log(ok ? 'РЕЗУЛЬТАТ: синхронно' : 'РЕЗУЛЬТАТ: РОЗСИНХРОН');
process.exit(ok ? 0 : 1);
