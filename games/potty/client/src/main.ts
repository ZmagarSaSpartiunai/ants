import { createGame, FIELD_W, FLOOR_Y, PottyState, SEATS, step, TOILET_X } from '@potty/shared';
import { Fly, Look, Sparkle, View } from './render.js';
import { boom, chime, fanfare, flush, full, groan, plop, say, sad, setSound, soundOn, splat, unlock, warn } from './audio.js';
import './style.css';

/**
 * «На горщик!» -- for a player of three to six.
 *
 * There is nothing to read and nothing to lose. The potty runs towards wherever
 * a finger is on the screen, not to where the finger grabbed it: small hands do
 * not aim well, and asking a four-year-old to hit a moving target with a drag
 * is asking them to stop playing.
 */

const canvas = document.getElementById('field') as HTMLCanvasElement;
const startPanel = document.getElementById('start') as HTMLDivElement;
const donePanel = document.getElementById('done') as HTMLDivElement;
const doneFace = document.getElementById('doneFace') as HTMLElement;
const doneTitle = document.getElementById('doneTitle') as HTMLElement;
const doneSub = document.getElementById('doneSub') as HTMLElement;
const playBtn = document.getElementById('play') as HTMLButtonElement;
const againBtn = document.getElementById('again') as HTMLButtonElement;
const soundBtn = document.getElementById('sound') as HTMLButtonElement;

const view = new View(canvas);
let state: PottyState = createGame(Math.floor(Math.random() * 1e9));
let running = false;
let aim = FIELD_W / 2;
let lastX = aim;

const look: Look = {
  time: 0,
  gulp: 0,
  pop: 0,
  sparkles: [],
  flies: [],
  lean: 0,
  booms: new Map(),
  cheers: new Map(),
  arrivals: new Map(),
};

function point(clientX: number): void {
  aim = view.toWorld(clientX);
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  point(e.clientX);
});
canvas.addEventListener('pointermove', (e) => {
  // Following a finger that is only hovering would move the potty on a desktop
  // with no click at all, which is right here: the potty follows attention.
  point(e.clientX);
});

playBtn.addEventListener('click', () => {
  unlock();
  startPanel.hidden = true;
  running = true;
});

againBtn.addEventListener('click', () => {
  state = createGame(Math.floor(Math.random() * 1e9));
  look.sparkles.length = 0;
  look.flies.length = 0;
  look.booms.clear();
  look.cheers.clear();
  look.arrivals.clear();
  donePanel.hidden = true;
  running = true;
});

/**
 * @param won whether anybody was saved
 * @param happy how many animals got their five
 */
function finish(won: boolean, happy: number): void {
  running = false;
  donePanel.hidden = false;
  doneFace.textContent = won ? (happy === 4 ? '🎉' : '🙂') : '💩';
  doneTitle.textContent = won ? (happy === 4 ? 'Усі задоволені!' : 'Майже!') : 'Ой-ой…';
  doneSub.textContent = won
    ? happy === 4
      ? 'Кожен сходив по п’ять разів.'
      : `Задоволених: ${happy} з 4. Наступного разу встигнеш до всіх.`
    : 'Ніхто не дочекався. Спробуй ще — стеж за червоними мордочками.';
  if (won && happy === 4) fanfare();
  else if (won) chime();
  else sad();
}

soundBtn.addEventListener('click', () => {
  setSound(!soundOn());
  soundBtn.textContent = soundOn() ? '🔊' : '🔇';
});

/**
 * @param x where it happened
 * @param y where it happened
 * @param n how many
 * @param tint what colour
 */
function burst(x: number, y: number, n: number, tint: string): void {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
    const sp = 60 + Math.random() * 170;
    look.sparkles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 1,
      tint,
    });
  }
}

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  look.time += dt;
  view.resize();

  if (running) {
    for (const event of step(state, dt, aim)) {
      if (event.t === 'urge') warn();
      else if (event.t === 'catch') {
        look.gulp = 1;
        look.pop = 1;
        plop();
        // The number said out loud is how many are in the pot, one to four --
        // a count a child of three can follow and join in with.
        say(event.held);
        burst(state.pottyX, FLOOR_Y - 30, 14, '#ffe27a');
      } else if (event.t === 'happy') {
        look.cheers.set(event.seat, 0);
        chime();
        burst(SEATS[event.seat].x, SEATS[event.seat].y - 30, 18, '#9be8a6');
      } else if (event.t === 'angry') {
        groan();
        burst(SEATS[event.seat].x, SEATS[event.seat].y, 8, '#ef6f7a');
      } else if (event.t === 'boom') {
        look.booms.set(event.seat, 0);
        boom();
        burst(SEATS[event.seat].x, SEATS[event.seat].y, 34, '#a9713c');
      } else if (event.t === 'full') {
        full();
      } else if (event.t === 'wake') {
        look.arrivals.set(event.seat, 0);
        chime();
      } else if (event.t === 'flush') {
        flush();
      } else if (event.t === 'over') {
        finish(event.won, event.happy);
      } else if (event.t === 'miss') {
        splat();
        burst(event.x, FLOOR_Y + 8, 8, '#a9713c');
        // A fly turns up to sit on it, which is the joke that makes a miss
        // worth watching instead of worth crying about.
        look.flies.push({
          x: event.x + (Math.random() - 0.5) * 200,
          y: FLOOR_Y - 60,
          home: { x: event.x, y: FLOOR_Y + 6 },
          phase: Math.random() * 6,
        });
        if (look.flies.length > 10) look.flies.shift();
      }
    }
  }

  look.gulp = Math.max(0, look.gulp - dt * 2.6);
  look.pop = Math.max(0, look.pop - dt * 3.2);
  for (const [seat, t] of look.booms) {
    if (t > 0.9) look.booms.delete(seat);
    else look.booms.set(seat, t + dt);
  }
  for (const [seat, t] of look.cheers) {
    const nextT = t + dt / 0.8;
    if (nextT >= 1) look.cheers.delete(seat);
    else look.cheers.set(seat, nextT);
  }
  for (const [seat, t] of look.arrivals) {
    const nextT = t + dt / 0.6;
    if (nextT >= 1) look.arrivals.delete(seat);
    else look.arrivals.set(seat, nextT);
  }
  // The lean is taken from how far the potty actually travelled, so it can
  // never disagree with the movement the eye is watching.
  const moved = (state.pottyX - lastX) / Math.max(dt, 1e-4);
  lastX = state.pottyX;
  look.lean += (Math.max(-1, Math.min(1, moved / 620)) - look.lean) * Math.min(1, dt * 9);

  for (let i = look.sparkles.length - 1; i >= 0; i--) {
    const sp = look.sparkles[i];
    sp.vy += 620 * dt;
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    sp.life -= dt / 0.8;
    if (sp.life <= 0) look.sparkles.splice(i, 1);
  }
  for (const fly of look.flies) {
    // Circles its splat rather than sitting on it: a still fly is a full stop.
    fly.phase += dt * 2.2;
    const wobble = Math.sin(fly.phase * 3.1) * 12;
    fly.x += (fly.home.x + Math.cos(fly.phase) * 26 - fly.x) * Math.min(1, dt * 3);
    fly.y += (fly.home.y - 14 + wobble - fly.y) * Math.min(1, dt * 3);
  }

  view.draw(state, look);
  requestAnimationFrame(frame);
}

let last = performance.now();
requestAnimationFrame(frame);

export { state };
