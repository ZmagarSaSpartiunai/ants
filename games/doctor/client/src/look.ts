import { AILMENTS, PATIENTS, TOOLS } from '@doctor/shared';
import { drawAilment, drawPatient, drawRoom, drawTool, H, W } from './art.js';
import './style.css';

/**
 * Every patient and every complaint, drawn side by side.
 *
 * Development only, and not in the built game. Six animals crossed with seven
 * complaints is more than anybody can check one visit at a time, and a mark
 * drawn in the wrong place is invisible until a child taps at nothing.
 */

const cell = document.createElement('canvas');
cell.width = W;
cell.height = H;
const cellCtx = cell.getContext('2d')!;

const shots: [string, string, number][] = [];
for (const a of AILMENTS) {
  const who = PATIENTS[shots.length % PATIENTS.length].id;
  shots.push([who, a.id, 0]);
  if (a.steps.length > 1) shots.push([who, a.id, a.steps.length - 1]);
}
// And the rest of the cast, so every animal is looked at. The bound is taken
// first: read from the array it is pushing into, the loop never ends.
const soFar = shots.length;
for (let i = 0; i < PATIENTS.length; i++) {
  shots.push([PATIENTS[(soFar + i) % PATIENTS.length].id, 'sad', 1]);
}

// Half size: a sheet of nineteen full-size rooms is seven million pixels and
// the browser stops answering long enough to look like a crash.
const COLS = 4;
const CW = Math.round(W / 2);
const CH = Math.round(H / 2);
const sheet = document.createElement('canvas');
sheet.width = COLS * CW;
sheet.height = Math.ceil(shots.length / COLS) * CH;
sheet.style.cssText = 'width:100%;max-width:1700px;display:block;margin:0 auto';
document.body.append(sheet);
const out = sheet.getContext('2d')!;

shots.forEach(([animal, ailment, done], i) => {
  cellCtx.setTransform(1, 0, 0, 1, 0, 0);
  drawRoom(cellCtx);
  drawPatient(cellCtx, animal, done > 0 ? 0 : -1, 1.1);
  drawAilment(cellCtx, ailment, done, 1.1);
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  out.drawImage(cell, col * CW, row * CH, CW, CH);
  out.fillStyle = 'rgba(0,0,0,0.62)';
  out.fillRect(col * CW, row * CH, CW, 20);
  out.fillStyle = '#ffd57a';
  out.font = 'bold 13px system-ui, sans-serif';
  out.fillText(`${animal} — ${ailment}${done ? ` (крок ${done + 1})` : ''}`, col * CW + 7, row * CH + 15);
});

// The tray, underneath.
const tray = document.createElement('canvas');
tray.width = TOOLS.length * 120;
tray.height = 140;
tray.style.cssText = 'width:100%;max-width:1700px;display:block;margin:0 auto;background:#fff';
document.body.append(tray);
const tctx = tray.getContext('2d')!;
tctx.fillStyle = '#ffffff';
tctx.fillRect(0, 0, tray.width, tray.height);
TOOLS.forEach((t, i) => {
  tctx.save();
  tctx.translate(i * 120, 0);
  drawTool(tctx, t.id);
  tctx.fillStyle = '#3a3129';
  tctx.font = 'bold 13px system-ui, sans-serif';
  tctx.fillText(t.name, 6, 134);
  tctx.restore();
});

document.title = `сцен: ${shots.length}`;
