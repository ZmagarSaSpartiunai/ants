import test from 'node:test';
import assert from 'node:assert/strict';
import { renderShelf } from './shelf.js';
import { AGE_BANDS, Game } from './registry.js';

function game(over: Partial<Game>): Game {
  return {
    id: 'demo', title: 'Демо', blurb: 'Опис.', icon: '🎮',
    path: '/demo', kind: 'bundle', tier: 'free',
    multiplayer: false, cover: ['rgba(0,0,0,0.2)', '#222', '#111'], note: 'тест',
    ages: [6, 9],
    ...over,
  };
}

test('a free card links to the game', () => {
  const html = renderShelf([game({})]);

  assert.match(html, /href="\/demo\/"/);
  // The word also appears in the stylesheet, so look at the card, not the page.
  assert.ok(!html.includes('class="game locked"'), 'a free game must not be drawn as locked');
  assert.ok(!html.includes('🔒'), 'a free game must not carry a lock');
});

test('a paid card is shown, locked, and does not link anywhere', () => {
  // Hiding it would sell nothing: the point is that the card is seen and wanted.
  const html = renderShelf([game({ tier: 'paid' })]);

  assert.match(html, /class="game locked"/);
  assert.match(html, /підписк/i);
  assert.ok(!html.includes('href="/demo/"'), 'a locked card must not be a link');
});

test('markup in a title cannot escape into the page', () => {
  const html = renderShelf([game({ title: '<script>alert(1)</script>' })]);

  assert.ok(!html.includes('<script>alert'), 'the title was not escaped');
  assert.match(html, /&lt;script&gt;/);
});

test('the page is a complete document, not a fragment', () => {
  const html = renderShelf([game({})]);

  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /<\/html>\s*$/);
});

test('an empty shelf still renders a page rather than blowing up', () => {
  assert.match(renderShelf([]), /<\/html>/);
});

test('the shelf offers a filter chip for every band, plus "all"', () => {
  const html = renderShelf([game({})]);

  for (const band of AGE_BANDS) assert.ok(html.includes(`data-band="${band.id}"`), `no chip for ${band.id}`);
  assert.match(html, /data-band="all"/);
});

test('a card carries its own age range, so filtering needs no round trip', () => {
  const html = renderShelf([game({ ages: [4, 7] })]);

  assert.match(html, /data-from="4"/);
  assert.match(html, /data-to="7"/);
  assert.ok(html.includes('4–7'), 'a parent should see the age on the card');
});

test('an open-ended game reads as "and older" rather than a made-up ceiling', () => {
  // "8-99" on a card is a number nobody meant; it is an absent upper bound.
  const html = renderShelf([game({ ages: [8, 99] })]);

  assert.ok(!html.includes('8–99'), 'the sentinel leaked onto the card');
  assert.match(html, /8\+/);
});
