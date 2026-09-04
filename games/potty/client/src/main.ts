import { awakeSeats, createGame, FIELD_W, FLOOR_Y, PottyState, step, TOILET_X } from '@potty/shared';
import { Fly, Look, Sparkle, View } from './render.js';
import { chime, fanfare, flush, full, plop, say, setSound, soundOn, splat, unlock, warn } from './audio.js';
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
const playBtn = document.getElementById('play') as HTMLButtonElement;
const soundBtn = document.getElementById('sound') as HTMLButtonElement;

const view = new View(canvas);
let state: PottyState = createGame(Math.floor(Math.random() * 1e9));
let running = false;
let aim = FIELD_W / 2;
let lastX = aim;

const look: Look = {
  time: 0,
  bracing: [],
  gulp: 0,
  pop: 0,
  sparkles: [],
  flies: [],
  lean: 0,
  arrived: new Map(),
  starPop: 0,
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
      if (event.t === 'brace') warn();
      else if (event.t === 'catch') {
        look.gulp = 1;
        look.pop = 1;
        plop();
        // The number said out loud is how many are in the pot, one to four --
        // a count a child of three can follow and join in with. Counting the
        // running total to thirty-seven teaches nobody anything.
        say(event.held);
        burst(state.pottyX, FLOOR_Y - 30, 14, '#ffe27a');
      } else if (event.t === 'full') {
        full();
      } else if (event.t === 'overflow') {
        splat();
        burst(event.x, FLOOR_Y - 20, 10, '#a9713c');
      } else if (event.t === 'flush') {
        flush();
      } else if (event.t === 'star') {
        look.starPop = 1;
        chime();
        burst(TOILET_X, FLOOR_Y - 120, 20, '#ffd451');
      } else if (event.t === 'level') {
        fanfare();
        burst(FIELD_W / 2, 130, 30, '#9be8a6');
        // Whoever has just woken gets an entrance.
        for (const seat of awakeSeats(event.level)) {
          if (!look.arrived.has(seat) && !awakeSeats(event.level - 1).includes(seat)) {
            look.arrived.set(seat, 0);
          }
        }
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
        if (look.flies.length > 8) look.flies.shift();
      }
    }
  }

  look.bracing = state.bracing;
  look.gulp = Math.max(0, look.gulp - dt * 2.6);
  look.pop = Math.max(0, look.pop - dt * 3.2);
  look.starPop = Math.max(0, look.starPop - dt * 2);
  for (const [seat, t] of look.arrived) {
    const next = t + dt / 0.7;
    if (next >= 1) look.arrived.delete(seat);
    else look.arrived.set(seat, next);
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
