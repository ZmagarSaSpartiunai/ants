import {
  Filled,
  isDone,
  nextPicture,
  paintById,
  PALETTE,
  Picture,
  PICTURES,
} from '@colour/shared';
import { blip, chime, fanfare, say, setSound, soundOn, unlock } from '@kids/common';
import { checkAll, H, W } from './pictures.js';
import { fitTo, hitRegion, paintSheet, place, Sparkle } from './render.js';
import './style.css';

/**
 * «Розмальовка».
 *
 * Pick a colour, tap a part. That is the whole game, and it is deliberately
 * the whole game: at three or four the pleasure is in choosing, not in being
 * told what is right. Nothing here can be done wrongly and nothing is scored.
 *
 * The names are spoken because the player cannot read them.
 */

const canvas = document.getElementById('sheet') as HTMLCanvasElement;
const paletteBox = document.getElementById('palette') as HTMLDivElement;
const titleBox = document.getElementById('title') as HTMLElement;
const nextBtn = document.getElementById('next') as HTMLButtonElement;
const clearBtn = document.getElementById('clear') as HTMLButtonElement;
const soundBtn = document.getElementById('sound') as HTMLButtonElement;
const ctx = canvas.getContext('2d')!;

checkAll();

const SAVE_KEY = 'colour.work';

let picture: Picture = PICTURES[0];
let filled: Filled = {};
let paint = PALETTE[0];
let celebrate = 0;
let sparkles: Sparkle[] = [];
/** Which part is flashing from a fresh tap, and how brightly. */
let touched: { region: string; t: number } | null = null;

// ------------------------------------------------------------------- storage

/** All the work, per picture, so a closed tab does not throw it away. */
function load(): Record<string, Filled> {
  try {
    const raw = localStorage.getItem(SAVE_KEY);

    return raw ? (JSON.parse(raw) as Record<string, Filled>) : {};
  } catch (e) {
    return {};
  }
}

function save(): void {
  try {
    const all = load();
    all[picture.id] = filled;
    localStorage.setItem(SAVE_KEY, JSON.stringify(all));
  } catch (e) {
    // Private browsing, or a full disk. The colouring still works.
  }
}

/**
 * @param next which picture to open
 * @param speakIt whether to say its name
 */
function open(next: Picture, speakIt: boolean): void {
  picture = next;
  const saved = load()[picture.id] ?? {};
  // Only parts this picture actually has: a saved file from an older version
  // could otherwise finish a picture with a part that is no longer in it.
  filled = {};
  for (const region of picture.regions) if (saved[region]) filled[region] = saved[region];
  celebrate = 0;
  sparkles = [];
  touched = null;
  titleBox.textContent = picture.title;
  if (speakIt) say(picture.title);
}

// ------------------------------------------------------------------- palette

const swatches = PALETTE.map((p) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'swatch';
  b.style.background = p.hex;
  b.title = p.name;
  b.setAttribute('aria-label', p.name);
  b.addEventListener('click', () => {
    unlock();
    paint = p;
    showPaint();
    say(p.name);
  });
  paletteBox.append(b);

  return [p.id, b] as const;
});

function showPaint(): void {
  for (const [id, b] of swatches) b.setAttribute('aria-pressed', String(id === paint.id));
}
showPaint();

// --------------------------------------------------------------------- input

canvas.addEventListener('pointerdown', (e) => {
  unlock();
  const region = hit(e.clientX, e.clientY);
  if (!region) return;
  const before = filled[region];
  filled[region] = paint.id;
  touched = { region, t: 1 };
  save();
  if (before !== paint.id) blip();
  if (isDone(picture, filled) && celebrate <= 0) {
    celebrate = 3;
    fanfare();
    say('Гарно!');
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 320;
      sparkles.push({
        x: W / 2,
        y: H / 2,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1,
        tint: PALETTE[Math.floor(Math.random() * PALETTE.length)].hex,
      });
    }
  }
});

nextBtn.addEventListener('click', () => {
  unlock();
  open(nextPicture(picture.id), true);
  chime();
});

clearBtn.addEventListener('click', () => {
  unlock();
  filled = {};
  celebrate = 0;
  save();
  blip();
});

soundBtn.addEventListener('click', () => {
  setSound(!soundOn());
  soundBtn.textContent = soundOn() ? '🔊' : '🔇';
});

// -------------------------------------------------------------------- canvas

let fit = fitTo(canvas);

/**
 * @param clientX where the finger landed
 * @param clientY where the finger landed
 * @return the part under it, or null
 */
function hit(clientX: number, clientY: number): string | null {
  // Worked out here and not taken from the last frame: a tap before the first
  // frame has run would otherwise land nowhere, and a tap that does nothing is
  // the one thing this game must never do.
  const now = fitTo(canvas);
  if (!now) return null;
  fit = now;
  const rect = canvas.getBoundingClientRect();
  place(ctx, now);

  return hitRegion(ctx, picture, (clientX - rect.left) * now.dpr, (clientY - rect.top) * now.dpr);
}

let last = performance.now();

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fit = fitTo(canvas);

  if (touched) {
    touched.t -= dt * 2.6;
    if (touched.t <= 0) touched = null;
  }
  if (celebrate > 0) celebrate -= dt;
  for (let i = sparkles.length - 1; i >= 0; i--) {
    const s = sparkles[i];
    s.vy += 420 * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt / 1.6;
    if (s.life <= 0) sparkles.splice(i, 1);
  }

  if (fit) {
    ctx.setTransform(fit.dpr, 0, 0, fit.dpr, 0, 0);
    ctx.clearRect(0, 0, fit.cssW, fit.cssH);
    place(ctx, fit);
    paintSheet(ctx, picture, filled, touched, sparkles);
  }

  requestAnimationFrame(frame);
}

open(PICTURES[0], false);
requestAnimationFrame(frame);
