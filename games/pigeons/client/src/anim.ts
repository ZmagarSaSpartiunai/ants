import { createMatch, GROUND_Y } from '@pigeons/shared';
import { Hud, View } from './render.js';
import { startTumble, stepTumble, Tumble } from './tumble.js';
import './style.css';

/**
 * A contact sheet of the knock-down animation.
 *
 * Development only, and it is not part of the built game: Vite bundles
 * index.html and nothing else, so this page exists on `npm run dev:pigeons`
 * and nowhere else.
 *
 * It exists because a hidden browser tab is given no animation frames at all,
 * which makes an animation impossible to watch and therefore impossible to
 * judge. Here the clock is a variable, so every beat can be laid out side by
 * side and looked at.
 */

const STEP = 1 / 60;
const q = new URLSearchParams(location.search);
/** Seconds between the frames laid out on the sheet. */
const SAMPLE = Number(q.get('sample') ?? 0.09);
const COLS = Number(q.get('cols') ?? 6);
const CELL_W = 300;
const CELL_H = 150;
/** The world drawn full width, so the crop below has pixels to work with. */
const STAGE_W = 1200;
const STAGE_H = 540;
/** How wide a slice of the world each cell shows, in world units. */
const WINDOW_W = Number(q.get('window') ?? 800);

const stage = document.createElement('canvas');
stage.style.cssText = `width:${STAGE_W}px;height:${STAGE_H}px;position:absolute;left:-9999px`;
document.body.append(stage);
const view = new View(stage);
view.resize();

const state = createMatch(7, 2);
const hud: Hud = {
  you: 0,
  preview: null,
  power: 0,
  aimAngle: 0,
  flights: [],
  flightAt: 0,
  decals: [],
  flecks: [],
  shown: state.birds.map((b) => b.hp),
  flash: new Map(),
  falling: new Map(),
  tumble: new Map<number, Tumble>(),
  chewing: null,
  loaded: null,
  wind: 0.3,
  time: 0,
};

const knock = startTumble(-0.8, -0.4, 40);
hud.tumble.set(0, knock);
const drop = GROUND_Y - 14 - state.birds[0].y;

// Run it once to find out how long the whole thing takes, so the sheet is
// sized to the animation rather than the animation cropped to the sheet.
const shots: { t: number; phase: string }[] = [];
{
  const probe: Tumble = { ...knock };
  let t = 0;
  let next = 0;
  while (stepTumble(probe, STEP, drop, () => undefined) && t < 12) {
    if (t >= next) {
      shots.push({ t, phase: probe.phase });
      next += SAMPLE;
    }
    t += STEP;
  }
}

const rows = Math.ceil(shots.length / COLS);
const sheet = document.createElement('canvas');
sheet.width = COLS * CELL_W;
sheet.height = rows * CELL_H;
sheet.style.cssText = 'width:100%;max-width:1800px;display:block;margin:0 auto';
document.body.append(sheet);
const out = sheet.getContext('2d')!;
out.fillStyle = '#0d1116';
out.fillRect(0, 0, sheet.width, sheet.height);

let t = 0;
let taken = 0;
let next = 0;
while (taken < shots.length && t < 12) {
  hud.time = t;
  view.draw(state, hud, STEP);
  if (t >= next) {
    const col = taken % COLS;
    const row = Math.floor(taken / COLS);
    // Crop around the bird so a close beat can actually be judged; the default
    // window is the whole field, which is the shot for reading the timing.
    const px = STAGE_W / 800;
    const windowH = (WINDOW_W * CELL_H) / CELL_W;
    const cx = (state.birds[0].x + knock.x) * px;
    const cy = (state.birds[0].y + knock.y) * px;
    const sw = WINDOW_W * px;
    const sh = windowH * px;
    out.drawImage(
      stage,
      Math.max(0, Math.min(STAGE_W - sw, cx - sw / 2)),
      Math.max(0, Math.min(STAGE_H - sh, cy - sh / 2)),
      sw,
      sh,
      col * CELL_W,
      row * CELL_H,
      CELL_W,
      CELL_H,
    );
    out.fillStyle = 'rgba(0,0,0,0.55)';
    out.fillRect(col * CELL_W, row * CELL_H, 96, 18);
    out.fillStyle = '#ffd57a';
    out.font = '12px system-ui, sans-serif';
    out.fillText(`${t.toFixed(2)}s ${shots[taken].phase}`, col * CELL_W + 5, row * CELL_H + 13);
    taken++;
    next += SAMPLE;
  }
  if (!stepTumble(knock, STEP, drop, () => undefined)) break;
  t += STEP;
}

document.title = `кадрів: ${taken}, тривалість ${t.toFixed(2)}s`;
