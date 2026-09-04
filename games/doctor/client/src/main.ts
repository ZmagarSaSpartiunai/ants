import {
  ailmentById,
  callNext,
  isOver,
  nextStep,
  openSurgery,
  patient,
  PATIENTS,
  ROUND,
  SpotId,
  Surgery,
  TOOLS,
  ToolId,
  use,
} from '@doctor/shared';
import { blip, chime, fanfare, nope, say, setSound, soundOn, unlock } from '@kids/common';
import { drawAilment, drawPatient, drawRoom, drawTool, hitSpot, H, SPOT_AT, W } from './art.js';
import './style.css';

/**
 * «Лікарня».
 *
 * Pick a thing off the tray, use it where it hurts. What is wrong is always
 * drawn on the patient, and the place that needs seeing to glows -- a child of
 * three can be asked to look and to aim, but not to work out an invisible
 * cause on their own.
 *
 * A wrong tap costs nothing. The patient shakes its head and that is all.
 */

const canvas = document.getElementById('room') as HTMLCanvasElement;
const trayBox = document.getElementById('tray') as HTMLDivElement;
const startPanel = document.getElementById('start') as HTMLDivElement;
const donePanel = document.getElementById('done') as HTMLDivElement;
const doneSub = document.getElementById('doneSub') as HTMLElement;
const playBtn = document.getElementById('play') as HTMLButtonElement;
const againBtn = document.getElementById('again') as HTMLButtonElement;
const soundBtn = document.getElementById('sound') as HTMLButtonElement;
const dots = document.getElementById('dots') as HTMLDivElement;
const ctx = canvas.getContext('2d')!;

let game: Surgery = openSurgery(1);
let running = false;
let tool: ToolId | null = null;
let time = 0;
/** How the patient is doing: -1 sore, 0 being seen to, 1 better. */
let mood = -1;
/** Seconds left of the patient waving goodbye before the next one comes in. */
let leaving = 0;
/** A wrong tap, shaking the patient. */
let shake = 0;
let hearts: { x: number; y: number; vy: number; life: number }[] = [];

// ---------------------------------------------------------------- the tray

const buttons = TOOLS.map((t) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tool';
  b.title = t.name;
  b.setAttribute('aria-label', t.name);
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = 120 * dpr;
  c.height = 120 * dpr;
  const cc = c.getContext('2d')!;
  cc.scale(dpr, dpr);
  drawTool(cc, t.id);
  b.append(c);
  b.addEventListener('click', () => {
    unlock();
    tool = t.id;
    showTool();
    say(t.name);
  });
  trayBox.append(b);

  return [t.id, b] as const;
});

function showTool(): void {
  for (const [id, b] of buttons) b.setAttribute('aria-pressed', String(id === tool));
}

function showDots(): void {
  dots.innerHTML = '';
  for (let i = 0; i < game.queue.length; i++) {
    const d = document.createElement('span');
    d.className = `dot${i < game.at ? ' done' : ''}${i === game.at ? ' now' : ''}`;
    dots.append(d);
  }
}

// --------------------------------------------------------------- the patient

function greet(): void {
  const visit = patient(game);
  if (!visit) return;
  const ailment = ailmentById(visit.ailment);
  const who = PATIENTS.find((p) => p.id === visit.animal);
  mood = -1;
  leaving = 0;
  showDots();
  if (ailment && who) say(`${who.name}. ${ailment.told}`);
}

canvas.addEventListener('pointerdown', (e) => {
  unlock();
  if (!running || leaving > 0) return;
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / W, rect.height / H);
  const x = (e.clientX - rect.left - (rect.width - W * scale) / 2) / scale;
  const y = (e.clientY - rect.top - (rect.height - H * scale) / 2) / scale;
  const spot = hitSpot(x, y);
  if (!spot) return;
  if (!tool) {
    // Nothing in hand. Say so rather than doing nothing at all.
    nope();
    say('Спершу візьми щось із полички');

    return;
  }
  apply(tool, spot);
});

/**
 * @param used what is in hand
 * @param spot where it was used
 */
function apply(used: ToolId, spot: SpotId): void {
  const outcome = use(game, used, spot);
  if (outcome === 'wrongTool' || outcome === 'wrongSpot') {
    nope();
    shake = 1;

    return;
  }
  if (outcome === 'idle') return;
  blip();
  mood = 0;
  if (outcome === 'cured') finishPatient();
}

function finishPatient(): void {
  const visit = patient(game)!;
  const ailment = ailmentById(visit.ailment);
  mood = 1;
  leaving = 2.2;
  chime();
  if (ailment) say(ailment.cured);
  for (let i = 0; i < 14; i++) {
    hearts.push({
      x: 350 + (Math.random() - 0.5) * 220,
      y: 300 + (Math.random() - 0.5) * 120,
      vy: -40 - Math.random() * 70,
      life: 1,
    });
  }
}

function begin(): void {
  game = openSurgery(Math.floor(Math.random() * 1e9), ROUND);
  tool = null;
  hearts = [];
  shake = 0;
  showTool();
  startPanel.hidden = true;
  donePanel.hidden = true;
  running = true;
  greet();
}

function finishDay(): void {
  running = false;
  donePanel.hidden = false;
  fanfare();
  say('Усі здорові!');
  doneSub.textContent =
    game.clean === game.queue.length
      ? 'Усіх вилікував без жодної помилки!'
      : `Без помилок: ${game.clean} з ${game.queue.length}.`;
}

playBtn.addEventListener('click', () => {
  unlock();
  begin();
});
againBtn.addEventListener('click', () => {
  unlock();
  begin();
});
soundBtn.addEventListener('click', () => {
  setSound(!soundOn());
  soundBtn.textContent = soundOn() ? '🔊' : '🔇';
});

// ----------------------------------------------------------------- the loop

let sky: HTMLCanvasElement | null = null;
let last = performance.now();

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  if (shake > 0) shake = Math.max(0, shake - dt * 3);
  for (let i = hearts.length - 1; i >= 0; i--) {
    const h = hearts[i];
    h.y += h.vy * dt;
    h.life -= dt / 1.6;
    if (h.life <= 0) hearts.splice(i, 1);
  }
  if (leaving > 0) {
    leaving -= dt;
    if (leaving <= 0) {
      if (callNext(game)) greet();
      else finishDay();
    }
  }

  const rect = canvas.getBoundingClientRect();
  if (rect.width && rect.height) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round(rect.width * dpr);
    const ch = Math.round(rect.height * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const scale = Math.min(rect.width / W, rect.height / H);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.translate((rect.width - W * scale) / 2, (rect.height - H * scale) / 2);
    ctx.scale(scale, scale);

    if (!sky) {
      sky = document.createElement('canvas');
      sky.width = W;
      sky.height = H;
      drawRoom(sky.getContext('2d')!);
    }
    ctx.drawImage(sky, 0, 0, W, H);
    drawScene();
  }

  requestAnimationFrame(frame);
}

function drawScene(): void {
  const visit = patient(game);
  if (!visit) return;
  ctx.save();
  // A wrong tap shakes the patient, and nothing else happens at all.
  if (shake > 0) ctx.translate(Math.sin(shake * 40) * shake * 9, 0);
  const leavingBy = leaving > 0 ? Math.max(0, 1 - leaving / 2.2) : 0;
  ctx.translate(0, -leavingBy * leavingBy * 40);
  drawPatient(ctx, visit.animal, mood, time);
  drawAilment(ctx, visit.ailment, visit.done, time);
  ctx.restore();

  // The place waiting to be seen to, breathing so it cannot be missed.
  const step = nextStep(game);
  if (step && leaving <= 0) {
    const s = SPOT_AT[step.spot];
    const pulse = 0.5 + Math.sin(time * 3.4) * 0.5;
    ctx.save();
    ctx.strokeStyle = `rgba(94,184,79,${0.35 + pulse * 0.45})`;
    ctx.lineWidth = 6;
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -time * 30;
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.min(s.r, 74) + pulse * 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  for (const h of hearts) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, h.life);
    ctx.fillStyle = '#ef6f8a';
    ctx.translate(h.x, h.y);
    const k = 0.16 + h.life * 0.1;
    ctx.scale(k, k);
    ctx.beginPath();
    ctx.moveTo(60, 100);
    ctx.quadraticCurveTo(10, 62, 26, 34);
    ctx.quadraticCurveTo(46, 12, 60, 42);
    ctx.quadraticCurveTo(74, 12, 94, 34);
    ctx.quadraticCurveTo(110, 62, 60, 100);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

showTool();
showDots();
requestAnimationFrame(frame);
