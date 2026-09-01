import { createHmac, timingSafeEqual } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';

/**
 * A shared-password gate for the development phase.
 *
 * This is not a login: there are no accounts, and everyone who is let in is
 * equally trusted. It exists so an unfinished game on a public hostname is not
 * simply open to the whole internet. When the game is ready to be public, unset
 * ANTS_PASSWORD and the gate disappears entirely.
 *
 * A captcha deliberately is not used here. Every real one is a third-party
 * script, which this project does not load, and it would not add much over a
 * decent password behind a rate limit. If a challenge page is wanted, the
 * hostname already sits behind Cloudflare, which can serve one with no code.
 */

const COOKIE = 'ants_gate';
const MESSAGE = 'ants-gate-v1';
/** Failed attempts allowed per address per window. */
const MAX_TRIES = 8;
const WINDOW_MS = 60_000;

const tries = new Map<string, { count: number; until: number }>();

export function gateEnabled(): boolean {
  return !!process.env.ANTS_PASSWORD;
}

/** Stable across restarts, and does not reveal the password if the cookie leaks. */
function tokenFor(password: string): string {
  return createHmac('sha256', password).update(MESSAGE).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;

  return timingSafeEqual(ba, bb);
}

export function clientAddress(req: IncomingMessage): string {
  // Behind the tunnel every connection arrives from loopback, so the real
  // address is whatever Cloudflare puts in the header.
  const forwarded = req.headers['cf-connecting-ip'] ?? req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;

  return (raw ?? req.socket.remoteAddress ?? 'unknown').split(',')[0].trim();
}

export function hasPass(req: IncomingMessage): boolean {
  const password = process.env.ANTS_PASSWORD;
  if (!password) return true;
  const raw = req.headers.cookie ?? '';
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== COOKIE) continue;
    if (safeEqual(rest.join('='), tokenFor(password))) return true;
  }

  return false;
}

function throttled(addr: string): boolean {
  const now = Date.now();
  const rec = tries.get(addr);
  if (!rec || rec.until < now) return false;

  return rec.count >= MAX_TRIES;
}

function countFailure(addr: string): void {
  const now = Date.now();
  const rec = tries.get(addr);
  if (!rec || rec.until < now) {
    tries.set(addr, { count: 1, until: now + WINDOW_MS });

    return;
  }
  rec.count++;
}

/** Handles the gate form. Returns true when the request was fully answered. */
export async function handleGate(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const password = process.env.ANTS_PASSWORD;
  if (!password) return false;

  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/gate' && req.method === 'POST') {
    const addr = clientAddress(req);
    if (throttled(addr)) {
      res.writeHead(429, { 'content-type': 'text/html; charset=utf-8' });
      res.end(page('Забагато спроб. Спробуй за хвилину.'));

      return true;
    }
    const body = await readBody(req);
    const given = new URLSearchParams(body).get('password') ?? '';
    if (!safeEqual(given, password)) {
      countFailure(addr);
      res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' });
      res.end(page('Пароль не підходить.'));

      return true;
    }
    res.writeHead(303, {
      location: '/',
      'set-cookie': `${COOKIE}=${tokenFor(password)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000`,
    });
    res.end();

    return true;
  }

  if (hasPass(req)) return false;

  res.writeHead(401, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(page());

  return true;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    // A password form has no business being large.
    if (size > 4096) break;
    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks).toString('utf8');
}

function page(error = ''): string {
  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#16130f">
<meta name="robots" content="noindex, nofollow">
<title>Мурашник</title>
<style>
  html,body{height:100%;margin:0;background:#16130f;color:#ece5d8;
    font:16px/1.5 "Segoe UI",Roboto,system-ui,sans-serif;display:grid;place-items:center}
  form{width:min(340px,calc(100vw - 32px));background:rgba(26,21,16,.94);
    border:1px solid rgba(240,180,41,.24);border-radius:16px;padding:24px;text-align:center}
  h1{margin:0 0 6px;font-size:24px}
  p{margin:0 0 18px;color:#9d9384;font-size:14px}
  input{width:100%;padding:12px;margin-bottom:12px;font:inherit;color:inherit;text-align:center;
    background:rgba(12,10,8,.8);border:1px solid rgba(240,180,41,.24);border-radius:10px}
  button{width:100%;padding:12px;font:inherit;font-weight:600;color:#211a10;background:#f0b429;
    border:0;border-radius:10px;cursor:pointer}
  .err{color:#ff9c7d;min-height:20px;font-size:14px;margin:0 0 8px}
</style>
</head>
<body>
  <form method="post" action="/gate">
    <h1>🐜 Мурашник</h1>
    <p>Гра ще в розробці. Введи пароль, щоб зайти.</p>
    <p class="err">${error}</p>
    <input type="password" name="password" autocomplete="current-password"
           autofocus placeholder="Пароль" aria-label="Пароль">
    <button type="submit">Увійти</button>
  </form>
</body>
</html>`;
}
