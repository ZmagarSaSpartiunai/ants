import { createGame, FIELD_W, FLOOR_Y, PottyState, step } from '@potty/shared';
import { Fly, Look, Sparkle, View } from './render.js';
import { fanfare, plop, say, setSound, soundOn, splat, unlock, warn } from './audio.js';
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
  bracing: null,
  gulp: 0,
  pop: 0,
  sparkles: [],
  flies: [],
  lean: 0,
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
        say(event.count);
        burst(state.pottyX, FLOOR_Y - 20, 14, '#ffe27a');
        if (event.count % 10 === 0) {
          fanfare();
          burst(FIELD_W / 2, 90, 26, '#9be8a6');
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
