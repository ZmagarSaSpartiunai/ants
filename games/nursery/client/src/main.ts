import {
  Day,
  feed,
  FoodId,
  foodById,
  FOODS,
  leftOnFloor,
  lightsOut,
  MOMENT_DONE,
  MOMENT_TOLD,
  MOMENTS,
  momentDone,
  nextMoment,
  openDay,
  putAway,
  tuck,
} from '@nursery/shared';
import {
  blip,
  chime,
  fanfare,
  fitCanvas,
  nope,
  place,
  say,
  showDots,
  soundToggle,
  toWorld,
  unlock,
} from '@kids/common';
import {
  BOX,
  drawBed,
  drawBlanket,
  drawBox,
  drawFood,
  drawKid,
  drawLamp,
  drawRoom,
  drawTable,
  drawToy,
  drawWish,
  H,
  LAMP,
  seatAt,
  toyAt,
  W,
} from './art.js';
import './style.css';

/**
 * «У садочку».
 *
 * A morning in three moments, always in the same order: breakfast, tidying up,
 * a nap. The order is the game. A child of three is learning that a day has a
 * shape, and shuffling it for variety would teach the opposite.
 *
 * A wrong tap costs nothing but a shake of the head.
 */

const canvas = document.getElementById('room') as HTMLCanvasElement;
const shelf = document.getElementById('shelf') as HTMLDivElement;
const startPanel = document.getElementById('start') as HTMLDivElement;
const donePanel = document.getElementById('done') as HTMLDivElement;
const doneSub = document.getElementById('doneSub') as HTMLElement;
const dots = document.getElementById('dots') as HTMLDivElement;
const ctx = canvas.getContext('2d')!;

soundToggle(document.getElementById('sound') as HTMLButtonElement);

let day: Day = openDay(1);
let running = false;
let food: FoodId | null = null;
let time = 0;
/** Seconds left of celebrating a finished moment before the next begins. */
let cheering = 0;
let shake = 0;
let sparkles: { x: number; y: number; vx: number; vy: number; life: number; tint: string }[] = [];

// ------------------------------------------------------------------ the shelf

const buttons = FOODS.map((f) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'food';
  b.title = f.name;
  b.setAttribute('aria-label', f.name);
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = 120 * dpr;
  c.height = 120 * dpr;
  const cc = c.getContext('2d')!;
  cc.scale(dpr, dpr);
  cc.translate(60, 60);
  drawFood(cc, f.id);
  b.append(c);
  b.addEventListener('click', () => {
    unlock();
    food = f.id;
    showFood();
    say(f.name);
  });
  shelf.append(b);

  return [f.id, b] as const;
});

function showFood(): void {
  for (const [id, b] of buttons) b.setAttribute('aria-pressed', String(id === food));
}

/** The shelf is only any use at breakfast. */
function showShelf(): void {
  shelf.hidden = day.moment !== 'breakfast' || !running;
}

// ------------------------------------------------------------------ the day

function announce(): void {
  showDots(dots, MOMENTS.length, MOMENTS.indexOf(day.moment));
  showShelf();
  say(MOMENT_TOLD[day.moment]);
}

function burst(x: number, y: number, n: number, tint: string): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 220;
    sparkles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, tint });
  }
}

function checkMoment(): void {
  if (!momentDone(day) || cheering > 0) return;
  cheering = 2;
  chime();
  say(MOMENT_DONE[day.moment]);
  burst(W / 2, 220, 30, '#9be8a6');
}

canvas.addEventListener('pointerdown', (e) => {
  unlock();
  if (!running || cheering > 0) return;
  const at = toWorld(canvas, W, H, e.clientX, e.clientY);
  if (!at) return;

  if (day.moment === 'breakfast') {
    const seat = seatAt(day, at.x, at.y);
    if (seat < 0) return;
    if (!food) {
      nope();
      say('Спершу візьми щось із полички');

      return;
    }
    const out = feed(day, seat, food);
    if (out === 'wrong') {
      nope();
      shake = 1;
    } else if (out === 'right') {
      blip();
      burst(day.kids[seat].seat * 160 + 128, 250, 10, '#ffe27a');
      checkMoment();
    }

    return;
  }

  if (day.moment === 'tidy') {
    const id = toyAt(day, at.x, at.y);
    if (id < 0) return;
    const toy = day.toys.find((t) => t.id === id)!;
    if (putAway(day, id) === 'right') {
      blip();
      burst(toy.x, toy.y, 8, '#f2b429');
      const left = leftOnFloor(day);
      // Counted down out loud: the number is the lesson, and there is nothing
      // else on screen for a child who cannot read to count.
      if (left > 0) say(String(left));
      checkMoment();
    }

    return;
  }

  // The nap.
  if (Math.hypot(at.x - LAMP.x, at.y - LAMP.y) <= LAMP.r) {
    const out = lightsOut(day);
    if (out === 'wrong') {
      nope();
      say('Ще не всі лягли');
    } else if (out === 'right') {
      blip();
      checkMoment();
    }

    return;
  }
  const seat = seatAt(day, at.x, at.y);
  if (seat >= 0 && tuck(day, seat) === 'right') {
    blip();
    checkMoment();
  }
});

function begin(): void {
  day = openDay(Math.floor(Math.random() * 1e9));
  food = null;
  sparkles = [];
  cheering = 0;
  shake = 0;
  running = true;
  showFood();
  startPanel.hidden = true;
  donePanel.hidden = true;
  announce();
}

function finish(): void {
  running = false;
  showShelf();
  donePanel.hidden = false;
  fanfare();
  say('Молодець! Усе встигли.');
  doneSub.textContent =
    day.slips === 0 ? 'Жодної помилки за весь ранок!' : `Помилок: ${day.slips}.`;
}

for (const id of ['play', 'again']) {
  (document.getElementById(id) as HTMLButtonElement).addEventListener('click', () => {
    unlock();
    begin();
  });
}

// ------------------------------------------------------------------ the loop

let last = performance.now();

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  if (shake > 0) shake = Math.max(0, shake - dt * 3);
  for (let i = sparkles.length - 1; i >= 0; i--) {
    const s = sparkles[i];
    s.vy += 380 * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt / 1.2;
    if (s.life <= 0) sparkles.splice(i, 1);
  }
  if (cheering > 0) {
    cheering -= dt;
    if (cheering <= 0) {
      if (nextMoment(day)) announce();
      else finish();
    }
  }

  const fit = fitCanvas(canvas, W, H);
  if (fit) {
    place(ctx, fit);
    draw();
  }
  requestAnimationFrame(frame);
}

function draw(): void {
  const dark = day.lightOff;
  drawRoom(ctx, dark);
  drawLamp(ctx, dark, day.moment === 'nap' && day.kids.every((k) => k.tucked), time);

  if (day.moment === 'nap') {
    for (const kid of day.kids) drawBed(ctx, kid, dark);
  }

  ctx.save();
  if (shake > 0) ctx.translate(Math.sin(shake * 40) * shake * 8, 0);
  for (const kid of day.kids) {
    const asleep = day.moment === 'nap' && kid.tucked;
    const mood = day.moment === 'breakfast' ? (kid.fed ? 1 : -1) : 0;
    drawKid(ctx, kid, mood, asleep, dark, time);
  }
  ctx.restore();

  if (day.moment === 'nap') {
    for (const kid of day.kids) drawBlanket(ctx, kid, dark);
  }
  if (day.moment === 'breakfast') {
    drawTable(ctx);
    for (const kid of day.kids) if (!kid.fed) drawWish(ctx, kid, time);
  }
  if (day.moment === 'tidy') {
    for (const toy of day.toys) if (!toy.away) drawToy(ctx, toy, time);
    drawBox(ctx, leftOnFloor(day), time);
  }

  for (const s of sparkles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, s.life);
    ctx.fillStyle = s.tint;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 4 + s.life * 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

showDots(dots, MOMENTS.length, 0);
showShelf();
requestAnimationFrame(frame);

export { foodById };
