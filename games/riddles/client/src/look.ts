import { allCards } from '@riddles/shared';
import { drawerFor } from './cards.js';
import './style.css';

/**
 * Every card in the game on one sheet.
 *
 * Development only, and not in the built game: Vite bundles index.html and
 * nothing else. Twenty-odd drawings are easy to get subtly wrong and
 * impossible to check one round at a time.
 */

const SIZE = 200;
const COLS = 8;
const ids = allCards();

const cell = document.createElement('canvas');
cell.width = SIZE;
cell.height = SIZE;
const cellCtx = cell.getContext('2d')!;

const sheet = document.createElement('canvas');
sheet.width = COLS * SIZE;
sheet.height = Math.ceil(ids.length / COLS) * (SIZE + 22);
sheet.style.cssText = 'width:100%;max-width:1600px;display:block;margin:0 auto;background:#fff';
document.body.append(sheet);
const out = sheet.getContext('2d')!;
out.fillStyle = '#ffffff';
out.fillRect(0, 0, sheet.width, sheet.height);

ids.forEach((id, i) => {
  cellCtx.setTransform(1, 0, 0, 1, 0, 0);
  cellCtx.clearRect(0, 0, SIZE, SIZE);
  drawerFor(id)(cellCtx);
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  out.drawImage(cell, col * SIZE, row * (SIZE + 22));
  out.fillStyle = '#3a3129';
  out.font = 'bold 13px system-ui, sans-serif';
  out.fillText(id, col * SIZE + 6, row * (SIZE + 22) + SIZE + 15);
});

document.title = `карток: ${ids.length}`;
