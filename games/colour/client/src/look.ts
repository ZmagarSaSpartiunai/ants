import { PALETTE, PICTURES } from '@colour/shared';
import { H, W } from './pictures.js';
import { paintSheet } from './render.js';
import './style.css';

/**
 * Every picture, drawn twice: bare, as a child first meets it, and coloured
 * in, so both the line art and the fills can be judged.
 *
 * Development only, and not in the built game: Vite bundles index.html and
 * nothing else. It exists because a hidden tab gets no animation frames, so
 * the game's own loop draws nothing at all and there is nothing to look at.
 */

const COLS = 2;
const cell = document.createElement('canvas');
cell.width = W;
cell.height = H;
const cellCtx = cell.getContext('2d')!;

const sheet = document.createElement('canvas');
sheet.width = COLS * W;
sheet.height = Math.ceil((PICTURES.length * 2) / COLS) * H;
sheet.style.cssText = 'width:100%;max-width:1500px;display:block;margin:0 auto';
document.body.append(sheet);
const out = sheet.getContext('2d')!;
out.fillStyle = '#0d1116';
out.fillRect(0, 0, sheet.width, sheet.height);

const shots: [string, boolean][] = [];
for (const picture of PICTURES) shots.push([picture.id, false], [picture.id, true]);

shots.forEach(([id, coloured], i) => {
  const picture = PICTURES.find((p) => p.id === id)!;
  const filled: Record<string, string | undefined> = {};
  if (coloured) {
    picture.regions.forEach((r, n) => {
      filled[r] = PALETTE[(n * 3 + i) % PALETTE.length].id;
    });
  }
  cellCtx.setTransform(1, 0, 0, 1, 0, 0);
  cellCtx.clearRect(0, 0, W, H);
  paintSheet(cellCtx, picture, filled, null, []);

  const col = i % COLS;
  const row = Math.floor(i / COLS);
  out.drawImage(cell, col * W, row * H, W, H);
  out.fillStyle = 'rgba(0,0,0,0.62)';
  out.fillRect(col * W, row * H, W, 26);
  out.fillStyle = '#ffd57a';
  out.font = 'bold 16px system-ui, sans-serif';
  out.fillText(`${picture.title}${coloured ? ' — розмальований' : ' — контур'}`, col * W + 10, row * H + 18);
});

document.title = `малюнків: ${PICTURES.length}`;
