/**
 * The catalogue. One entry per game, and it is the only place a game is
 * declared.
 *
 * Everything else reads from here: which folder answers an HTTP path, which
 * socket path exists, what the shelf shows, and whether a card is locked. That
 * is deliberate -- the previous shape spread those four facts across four
 * files, so adding a game meant remembering all four and finding out on the
 * server which one had been missed.
 *
 * To add a game: one entry here plus its folder. Nothing else.
 */

export type Tier = 'free' | 'paid';

/** How the game's files are laid out on disk. */
export type Kind =
  /** A built client: a folder with index.html and hashed assets. */
  | 'bundle'
  /** A single self-contained html file, like Luna. */
  | 'single'
  /** A shelf: a page listing other games, with no game of its own. */
  | 'shelf';

export interface Game {
  id: string;
  title: string;
  /** One line under the title on the shelf card. */
  blurb: string;
  /** Shown on the card. */
  icon: string;
  /** URL prefix, anchored, with no trailing slash. */
  path: string;
  kind: Kind;
  tier: Tier;
  /** Which shelf the card sits on; null means the root shelf. */
  shelf: string | null;
  /** Whether the game wants a socket mounted under its path. */
  multiplayer: boolean;
  /** Environment variable naming the folder, when it is not built in place. */
  rootEnv?: string;
  /** Card art, drawn in CSS so the shelf ships no images: [glow, top, bottom]. */
  cover: [string, string, string];
  /** The small pill on the card. */
  note: string;
}

export const GAMES: Game[] = [
  {
    id: 'ants',
    title: 'Мурашник',
    blurb: 'Захопи галявину. Стежку можна перегризти.',
    icon: '🐜',
    path: '/ants',
    kind: 'bundle',
    tier: 'free',
    shelf: null,
    multiplayer: true,
    cover: ['rgba(150, 200, 110, 0.38)', '#3f6a31', '#24401d'],
    note: 'грається',
  },
  {
    id: 'luna',
    title: 'Луна',
    blurb: 'Веди її крізь темряву.',
    icon: '🌙',
    path: '/luna',
    kind: 'single',
    tier: 'free',
    shelf: null,
    multiplayer: false,
    rootEnv: 'LUNA_ROOT',
    cover: ['rgba(196, 168, 232, 0.38)', '#241d33', '#100d18'],
    note: 'прототип',
  },
  {
    id: 'kaka',
    title: 'Какульки',
    blurb: 'Ціла полиця ігор про те саме.',
    icon: '💩',
    path: '/kaka',
    kind: 'shelf',
    tier: 'free',
    shelf: null,
    multiplayer: false,
    cover: ['rgba(214, 160, 92, 0.34)', '#5a4326', '#2e2113'],
    note: 'полиця',
  },
  {
    id: 'pigeons',
    title: 'Голуби',
    blurb: 'Обери, що з’їсти, і цілься. Вітер заважає.',
    icon: '🕊️',
    path: '/kaka/pigeons',
    kind: 'bundle',
    tier: 'free',
    shelf: 'kaka',
    multiplayer: true,
    cover: ['rgba(140, 190, 220, 0.34)', '#3d5a70', '#1d2b38'],
    note: 'у роботі',
  },
];

/**
 * Longest path first, so a game nested inside a shelf is found before the
 * shelf that contains it.
 */
const BY_DEPTH = [...GAMES].sort((a, b) => b.path.length - a.path.length);

/**
 * @param pathname the request path
 * @return the game that owns it, or null
 */
export function findGame(pathname: string): Game | null {
  for (const game of BY_DEPTH) {
    // Exact, or a real segment below it. Without the slash test '/antsomething'
    // would be served by '/ants'.
    if (pathname === game.path || pathname.startsWith(`${game.path}/`)) return game;
  }

  return null;
}

/**
 * @param game a multiplayer game
 * @return where its socket lives
 */
export function socketPath(game: Game): string {
  return `${game.path}/ws`;
}

/**
 * @param shelf the shelf id, or null for the root shelf
 * @return the cards that belong on it, in catalogue order
 */
export function shelfFor(shelf: string | null): Game[] {
  return GAMES.filter((g) => g.shelf === shelf);
}
