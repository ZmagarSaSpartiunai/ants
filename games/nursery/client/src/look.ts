import { Day, leftOnFloor, openDay } from '@nursery/shared';
import {
  drawBed,
  drawBlanket,
  drawBox,
  drawKid,
  drawLamp,
  drawRoom,
  drawTable,
  drawToy,
  drawWish,
  H,
  W,
} from './art.js';
import './style.css';

/**
 * The morning, moment by moment, on one sheet.
 *
 * Development only, and not in the built game. Three scenes with the same cast
 * in them are exactly the sort of thing that looks right one at a time and
 * wrong side by side.
 */

const cell = document.createElement('canvas');
cell.width = W;
cell.height = H;
const c = cell.getContext('2d')!;

/** Each entry is a caption and something done to a fresh morning. */
const SCENES: [string, (d: Day) => void][] = [
  ['сніданок: усі просять', () => undefined],
  [
    'сніданок: двоє вже поїли',
    (d) => {
      d.kids[0].fed = true;
      d.kids[2].fed = true;
    },
  ],
  [
    'прибирання: усе на підлозі',
    (d) => {
      d.moment = 'tidy';
    },
  ],
  [
    'прибирання: лишилось двоє',
    (d) => {
      d.moment = 'tidy';
      for (const t of d.toys.slice(0, 4)) t.away = true;
    },
  ],
  [
    'тиха година: ще ніхто не ліг',
    (d) => {
      d.moment = 'nap';
    },
  ],
  [
    'тиха година: усі сплять, світло вимкнено',
    (d) => {
      d.moment = 'nap';
      for (const k of d.kids) k.tucked = true;
      d.lightOff = true;
    },
  ],
];

const COLS = 2;
const sheet = document.createElement('canvas');
sheet.width = COLS * W;
sheet.height = Math.ceil(SCENES.length / COLS) * H;
sheet.style.cssText = 'width:100%;max-width:1500px;display:block;margin:0 auto';
document.body.append(sheet);
const out = sheet.getContext('2d')!;

SCENES.forEach(([caption, setup], i) => {
  const day = openDay(11 + i);
  setup(day);
  c.setTransform(1, 0, 0, 1, 0, 0);
  const dark = day.lightOff;
  drawRoom(c, dark);
  drawLamp(c, dark, day.moment === 'nap' && day.kids.every((k) => k.tucked), 1.1);
  if (day.moment === 'nap') for (const kid of day.kids) drawBed(c, kid, dark);
  for (const kid of day.kids) {
    const asleep = day.moment === 'nap' && kid.tucked;
    const mood = day.moment === 'breakfast' ? (kid.fed ? 1 : -1) : 0;
    drawKid(c, kid, mood, asleep, dark, 1.1);
  }
  if (day.moment === 'nap') {
    for (const kid of day.kids) drawBlanket(c, kid, dark);
  }
  if (day.moment === 'breakfast') {
    drawTable(c);
    for (const kid of day.kids) if (!kid.fed) drawWish(c, kid, 1.1);
  }
  if (day.moment === 'tidy') {
    for (const toy of day.toys) if (!toy.away) drawToy(c, toy, 1.1);
    drawBox(c, leftOnFloor(day), 1.1);
  }

  const col = i % COLS;
  const row = Math.floor(i / COLS);
  out.drawImage(cell, col * W, row * H);
  out.fillStyle = 'rgba(0,0,0,0.62)';
  out.fillRect(col * W, row * H, W, 24);
  out.fillStyle = '#ffd57a';
  out.font = 'bold 15px system-ui, sans-serif';
  out.fillText(caption, col * W + 9, row * H + 17);
});

document.title = `сцен: ${SCENES.length}`;
