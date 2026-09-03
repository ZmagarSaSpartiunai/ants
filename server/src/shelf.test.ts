import test from 'node:test';
import assert from 'node:assert/strict';
import { renderShelf } from './shelf.js';
import { Game } from './registry.js';

function game(over: Partial<Game>): Game {
  return {
    id: 'demo', title: 'Демо', blurb: 'Опис.', icon: '🎮',
    path: '/demo', kind: 'bundle', tier: 'free', shelf: null,
    multiplayer: false, cover: ['rgba(0,0,0,0.2)', '#222', '#111'], note: 'тест',
    ...over,
  };
}

test('a free card links to the game', () => {
  const html = renderShelf(null, [game({})]);

  assert.match(html, /href="\/demo\/"/);
  // The word also appears in the stylesheet, so look at the card, not the page.
  assert.ok(!html.includes('class="game locked"'), 'a free game must not be drawn as locked');
  assert.ok(!html.includes('🔒'), 'a free game must not carry a lock');
});

test('a paid card is shown, locked, and does not link anywhere', () => {
  // Hiding it would sell nothing: the point is that the card is seen and wanted.
  const html = renderShelf(null, [game({ tier: 'paid' })]);

  assert.match(html, /class="game locked"/);
  assert.match(html, /підписк/i);
  assert.ok(!html.includes('href="/demo/"'), 'a locked card must not be a link');
});

test('markup in a title cannot escape into the page', () => {
  const html = renderShelf(null, [game({ title: '<script>alert(1)</script>' })]);

  assert.ok(!html.includes('<script>alert'), 'the title was not escaped');
  assert.match(html, /&lt;script&gt;/);
});

test('a nested shelf offers the way back; the root does not', () => {
  assert.match(renderShelf('Какульки', [game({})]), /href="\/"/);
  assert.ok(!renderShelf(null, [game({})]).includes('href="/"'));
});

test('the page is a complete document, not a fragment', () => {
  const html = renderShelf(null, [game({})]);

  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /<\/html>\s*$/);
});

test('an empty shelf still renders a page rather than blowing up', () => {
  assert.match(renderShelf('Порожня', []), /<\/html>/);
});
