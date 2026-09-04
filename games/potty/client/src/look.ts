import { createGame, Level, PottyState, SEATS } from '@potty/shared';
import { Look, View } from './render.js';
import './style.css';

/**
 * A sheet of made-up states, side by side.
 *
 * Development only, and not part of the built game: Vite bundles index.html
 * and nothing else. It exists because the states worth looking at -- a band
 * half green and one strike from red, a potty with a cow's worth in it -- are
 * exactly the ones that take a minute of real play to reach, and a hidden
 * browser tab gets no animation frames to play with anyway.
 */

const CELL_W = 700;
const CELL_H = 394;
const COLS = 2;

const stage = document.createElement('canvas');
stage.style.cssText = `width:${CELL_W}px;height:${CELL_H}px;position:absolute;left:-9999px`;
document.body.append(stage);
const view = new View(stage);
view.resize();

/** Made-up mess on the glass, at a chosen moment of its life. */
function smearsAt(age: number, slid: number): Look['smears'] {
  const out: Look['smears'] = [];
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * Math.PI * 2 + 0.7;
    const d = 0.25 + ((i * 7) % 11) / 14;
    out.push({
      x: 320 + Math.cos(a) * d * 520,
      y: 118 + Math.sin(a) * d * 300 + 40,
      r: 52 - d * 26 + ((i * 5) % 13),
      seed: (i * 1.7) % 6.3,
      age,
      slid,
    });
  }

  return out;
}

function look(): Look {
  return {
    time: 1.2,
    gulp: 0,
    pop: 0,
    sparkles: [],
    flies: [],
    lean: 0,
    booms: new Map(),
    cheers: new Map(),
    arrivals: new Map(),
    smears: [],
  };
}

/** Each entry is a caption and something done to a fresh game. */
const SCENES: [string, (s: PottyState) => void, Level?, ((l: Look) => void)?][] = [
  ['початок: двоє, горщик порожній', () => undefined],
  [
    'смужка: зелене за впіймані, червоне за пропущені',
    (s) => {
      s.animals[1].pooped = 3;
      s.animals[2].pooped = 1;
      s.animals[2].strikes = 2;
      s.animals[2].urge = 1.1;
    },
  ],
  [
    'горщик наполовину, корова проситься — не влізе',
    (s) => {
      s.held = 6;
      s.pottyX = 300;
      const cow = s.animals.find((a) => a.size >= 10) ?? s.animals[1];
      cow.asleep = false;
      cow.urge = 2.6;
      cow.pooped = 2;
    },
  ],
  [
    'усі четверо, горщик повний, один щасливий і один при смерті',
    (s) => {
      for (const a of s.animals) a.asleep = false;
      s.held = s.rules.cap;
      s.pottyX = 640;
      s.animals[0].pooped = 5;
      s.animals[1].strikes = 2;
      s.animals[1].urge = 0.6;
      s.animals[3].pooped = 2;
      s.animals[2].alive = false;
      s.splats.push({ x: 200, y: 160, seed: 3 }, { x: 470, y: 240, seed: 5 });
    },
  ],
  [
    'вибух: щойно ляпнуло в екран',
    (s) => {
      for (const a of s.animals) a.asleep = false;
      s.animals[1].alive = false;
    },
    'hard',
    (l) => {
      l.smears.push(...smearsAt(0.1, 0));
    },
  ],
  [
    'вибух: за секунду — потекло',
    (s) => {
      for (const a of s.animals) a.asleep = false;
      s.animals[1].alive = false;
    },
    'hard',
    (l) => {
      l.smears.push(...smearsAt(1.6, 26));
    },
  ],
  [
    'легкий рівень: горщик на двадцять, троє за мету',
    (s) => {
      s.held = 12;
      s.pottyX = 360;
      s.animals[1].pooped = 2;
      s.animals[2].pooped = 1;
      s.animals[2].strikes = 1;
    },
    'easy',
  ],
  [
    'звичайний: горщик на чотирнадцять',
    (s) => {
      s.held = 9;
      s.pottyX = 360;
      s.animals[1].pooped = 3;
    },
    'normal',
  ],
];

const sheet = document.createElement('canvas');
sheet.width = COLS * CELL_W;
sheet.height = Math.ceil(SCENES.length / COLS) * CELL_H;
sheet.style.cssText = 'width:100%;max-width:1500px;display:block;margin:0 auto';
document.body.append(sheet);
const out = sheet.getContext('2d')!;
out.fillStyle = '#0d1116';
out.fillRect(0, 0, sheet.width, sheet.height);

SCENES.forEach(([caption, setup, level, dress], i) => {
  const state = createGame(11 + i, level ?? 'hard');
  setup(state);
  const l = look();
  dress?.(l);
  view.draw(state, l);
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  out.drawImage(stage, col * CELL_W, row * CELL_H, CELL_W, CELL_H);
  out.fillStyle = 'rgba(0,0,0,0.62)';
  out.fillRect(col * CELL_W, row * CELL_H, CELL_W, 24);
  out.fillStyle = '#ffd57a';
  out.font = 'bold 15px system-ui, sans-serif';
  out.fillText(caption, col * CELL_W + 8, row * CELL_H + 17);
});

document.title = `сцен: ${SCENES.length}`;
