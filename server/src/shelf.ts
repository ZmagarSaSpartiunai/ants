import { AGE_BANDS, Game } from './registry.js';

/**
 * The shelf page, built from the catalogue.
 *
 * It is generated rather than kept as a file so that adding a game stays one
 * entry in the registry. A hand-written portal drifts: a game gets added, the
 * card is forgotten, and nobody notices until somebody looks for it.
 */

/** Titles and blurbs are ours, but generated markup is escaped on principle. */
function esc(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param game the card
 * @return the age as a parent reads it, with no invented upper bound
 */
function ageLabel(game: Game): string {
  const [from, to] = game.ages;

  return to >= 99 ? `${from}+` : `${from}–${to}`;
}

/**
 * @param game the card to draw
 * @return one card of markup
 */
function card(game: Game): string {
  const locked = game.tier === 'paid';
  const cover = `radial-gradient(circle at 28% 30%, ${game.cover[0]}, transparent 62%), linear-gradient(158deg, ${game.cover[1]}, ${game.cover[2]})`;
  const inner = `
      <div class="cover" style="background:${esc(cover)}">
        <span class="icon">${esc(game.icon)}</span>
        ${locked ? '<span class="lock">🔒</span>' : ''}
      </div>
      <div class="body">
        <h2>${esc(game.title)}</h2>
        <p>${esc(game.blurb)}</p>
        <span class="tag">${locked ? 'за підпискою' : esc(game.note)}</span>
        <span class="tag age">${esc(ageLabel(game))} р.</span>
      </div>`;

  // A locked card is deliberately not a link: there is nothing behind it yet,
  // and a dead link reads as a broken game rather than a closed door.
  // The band is decided in the browser from these two numbers: filtering on
  // the server would mean a round trip and a cache entry per band, for a page
  // whose whole content is already here.
  const age = `data-from="${game.ages[0]}" data-to="${game.ages[1]}"`;

  return locked
    ? `    <div class="game locked" ${age}>${inner}\n    </div>`
    : `    <a class="game" href="${esc(game.path)}/" ${age}>${inner}\n    </a>`;
}

/**
 * @param shelf the shelf's own title, or null for the root shelf
 * @param games the cards that belong on it
 * @return a complete html document
 */
export function renderShelf(shelf: string | null, games: Game[]): string {
  const title = shelf ?? 'Ігри';
  const back = shelf ? '<a class="back" href="/">← до всіх ігор</a>' : '';

  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#141a10">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ctext y='26' font-size='26'%3E%F0%9F%8E%AE%3C/text%3E%3C/svg%3E">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    background: #141a10;
    color: #ece5d8;
    font: 16px/1.5 "Segoe UI", Roboto, "Noto Sans", system-ui, -apple-system, sans-serif;
    -webkit-tap-highlight-color: transparent;
  }
  body {
    /* 100vh, not 100%: a percentage height on the body only measures its own
       content, so the background stopped halfway down the page. */
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: max(20px, env(safe-area-inset-top)) 16px 32px;
    background:
      radial-gradient(circle at 30% 12%, rgba(90, 140, 60, 0.2), transparent 55%),
      radial-gradient(circle at 78% 84%, rgba(240, 180, 41, 0.12), transparent 52%),
      #141a10;
  }
  main { width: min(760px, 100%); }
  .back {
    display: inline-block; margin-bottom: 14px; color: #9d9384;
    text-decoration: none; font-size: 14px;
  }
  .back:hover { color: #ffd57a; }
  h1 { margin: 0 0 6px; font-size: clamp(28px, 6vw, 40px); letter-spacing: 0.01em; }
  .sub { margin: 0 0 28px; color: #9d9384; }

  .shelf { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }

  .game {
    display: block;
    text-decoration: none;
    color: inherit;
    background: rgba(26, 30, 20, 0.9);
    border: 1px solid rgba(240, 180, 41, 0.2);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3), 0 12px 28px -14px rgba(0, 0, 0, 0.7);
    transition: transform 0.14s, border-color 0.14s, box-shadow 0.14s;
  }
  a.game:hover, a.game:focus-visible {
    transform: translateY(-3px);
    border-color: rgba(240, 180, 41, 0.55);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.35), 0 20px 42px -16px rgba(0, 0, 0, 0.8);
  }
  .game.locked { opacity: 0.62; }

  /* Each cover is drawn in CSS: no images to ship, nothing to load. */
  .cover { height: 132px; position: relative; }
  .cover .icon {
    position: absolute; inset: 0; display: grid; place-items: center; font-size: 54px;
    filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.55));
  }
  .cover .lock {
    position: absolute; right: 11px; top: 11px; font-size: 19px;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.7));
  }

  .body { padding: 15px 17px 18px; }
  .body h2 { margin: 0 0 4px; font-size: 19px; }
  .body p { margin: 0; color: #9d9384; font-size: 14px; }
  .tag {
    display: inline-block;
    margin-top: 11px;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 12px;
    background: rgba(240, 180, 41, 0.16);
    color: #ffd57a;
  }
  .tag.age { background: rgba(140, 190, 220, 0.16); color: #a9d3ea; margin-left: 6px; }

  .bands { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 20px; }
  .band {
    font: inherit; font-size: 14px; cursor: pointer;
    padding: 7px 14px; border-radius: 999px;
    color: #cfc6b6; background: rgba(26, 30, 20, 0.9);
    border: 1px solid rgba(240, 180, 41, 0.2);
    transition: color 0.14s, border-color 0.14s, background 0.14s;
  }
  .band:hover { border-color: rgba(240, 180, 41, 0.45); }
  .band.on { color: #141a10; background: #f0b429; border-color: #f0b429; }
  .game[hidden] { display: none; }
  .empty { color: #9d9384; }
  footer { margin-top: 26px; color: #6f6a60; font-size: 13px; }
  @media (prefers-reduced-motion: reduce) { .game { transition: none; } }
</style>
</head>
<body>
<main>
  ${back}
  <h1>${esc(title)}</h1>
  <p class="sub">Робочі збірки. Тут вони живуть, поки не поїдуть на портали.</p>

  <div class="bands" id="bands">
    <button class="band on" data-band="all">Усі</button>
${AGE_BANDS.map((b) => `    <button class="band" data-band="${esc(b.id)}" data-from="${b.from}" data-to="${b.to}">${esc(b.label)}</button>`).join('\n')}
  </div>

  <div class="shelf" id="shelf">
${games.map(card).join('\n')}
  </div>
  <p class="empty" id="empty" hidden>Для цього віку тут поки порожньо.</p>

  <footer>Усе працює і з телефона.</footer>
</main>
<script>
  // Without this script every card is visible, which is the right thing to
  // fail to: a filter that breaks must not hide the catalogue.
  (function () {
    var bands = document.getElementById('bands');
    var cards = [].slice.call(document.querySelectorAll('.game'));
    var empty = document.getElementById('empty');
    var KEY = 'games.band';

    function apply(id) {
      var chip = bands.querySelector('[data-band="' + id + '"]') || bands.firstElementChild;
      var from = +chip.dataset.from, to = +chip.dataset.to;
      var any = false;
      [].forEach.call(bands.children, function (b) { b.classList.toggle('on', b === chip); });
      cards.forEach(function (c) {
        // Overlap, the same rule the server uses.
        var show = chip.dataset.band === 'all' || (+c.dataset.from <= to && +c.dataset.to >= from);
        c.hidden = !show;
        if (show) any = true;
      });
      empty.hidden = any;
      try { localStorage.setItem(KEY, chip.dataset.band); } catch (e) { /* private mode */ }
    }

    bands.addEventListener('click', function (e) {
      var chip = e.target.closest('.band');
      if (chip) apply(chip.dataset.band);
    });
    var saved = 'all';
    try { saved = localStorage.getItem(KEY) || 'all'; } catch (e) { /* private mode */ }
    apply(saved);
  })();
</script>
</body>
</html>
`;
}
