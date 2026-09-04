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
  | 'single';

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
  /** Whether the game wants a socket mounted under its path. */
  multiplayer: boolean;
  /** Environment variable naming the folder, when it is not built in place. */
  rootEnv?: string;
  /**
   * Where to look when that variable is not set, relative to the repo root.
   *
   * Without it a game living outside the workspace simply vanished from the
   * shelf on any machine that happened not to export the variable, and a
   * forgotten variable looked exactly like files that were never deployed.
   */
  rootPath?: string;
  /** Card art, drawn in CSS so the shelf ships no images: [glow, top, bottom]. */
  cover: [string, string, string];
  /** The small pill on the card. */
  note: string;
  /** Whom the game is for, in whole years, inclusive at both ends. */
  ages: [number, number];
}

/** One filter chip on the shelf. */
export interface AgeBand {
  id: string;
  label: string;
  from: number;
  to: number;
}

/**
 * Three bands, because a parent picking for a child thinks in three groups:
 * before reading, reading, and old enough not to be called little any more.
 * They cover every year with no gap -- a game nobody's filter can reach looks
 * exactly like a game that failed to build.
 */
export const AGE_BANDS: AgeBand[] = [
  { id: 'tiny', label: 'Малюкам · до 6', from: 0, to: 5 },
  { id: 'kids', label: '6–9 років', from: 6, to: 9 },
  { id: 'big', label: '10 і старші', from: 10, to: 99 },
];

/**
 * Overlap, not containment: a game for 4..7 belongs on both the little shelf
 * and the school one, and a parent who cannot find it under either would
 * conclude it is missing.
 *
 * @param game the card
 * @param band the chosen filter
 * @return whether the card shows under it
 */
export function bandFits(game: Game, band: AgeBand): boolean {
  return game.ages[0] <= band.to && game.ages[1] >= band.from;
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
    multiplayer: true,
    cover: ['rgba(150, 200, 110, 0.38)', '#3f6a31', '#24401d'],
    note: 'грається',
    // Trails, supply and timing: younger than eight and the board is just colours.
    ages: [8, 99],
  },
  {
    id: 'luna',
    title: 'Луна',
    blurb: 'Веди її крізь темряву.',
    icon: '🌙',
    path: '/luna',
    kind: 'single',
    tier: 'free',
    multiplayer: false,
    rootEnv: 'LUNA_ROOT',
    // Its own checkout, beside this one.
    rootPath: '../luna/web',
    cover: ['rgba(196, 168, 232, 0.38)', '#241d33', '#100d18'],
    note: 'прототип',
    ages: [6, 99],
  },
  {
    id: 'doctor',
    title: 'Лікарня',
    blurb: 'Прийшов пацієнт. Візьми щось із полички і полікуй.',
    icon: '🩺',
    path: '/doctor',
    kind: 'bundle',
    tier: 'free',
    multiplayer: false,
    cover: ['rgba(127, 184, 201, 0.42)', '#4d8fa0', '#22454f'],
    note: 'малюкам',
    // What is wrong is always drawn on the patient, so looking is the lesson.
    ages: [2, 6],
  },
  {
    id: 'riddles',
    title: 'Хто це?',
    blurb: 'Слухай запитання і торкнись картинки. Читати не треба.',
    icon: '❓',
    path: '/riddles',
    kind: 'bundle',
    tier: 'free',
    multiplayer: false,
    cover: ['rgba(94, 184, 79, 0.4)', '#4e8c36', '#26461d'],
    note: 'малюкам',
    // Spoken questions, picture answers: nothing here needs reading.
    ages: [2, 6],
  },
  {
    id: 'colour',
    title: 'Розмальовка',
    blurb: 'Обери фарбу і торкнись. Кольори називає голос.',
    icon: '🎨',
    path: '/colour',
    kind: 'bundle',
    tier: 'free',
    multiplayer: false,
    cover: ['rgba(247, 207, 63, 0.4)', '#c98a3a', '#6d4a1f'],
    note: 'малюкам',
    // Nothing to read, nothing to lose, and no way to do it wrongly.
    ages: [2, 6],
  },
  {
    id: 'potty',
    title: 'На горщик!',
    blurb: 'Веди горщик і лови все, що падає. Рахуємо вголос.',
    icon: '🚽',
    path: '/potty',
    kind: 'bundle',
    tier: 'free',
    multiplayer: false,
    cover: ['rgba(143, 211, 232, 0.4)', '#2f86a8', '#17475c'],
    note: 'малюкам',
    // Nothing to read, nothing to lose, and the counting is the lesson.
    ages: [3, 6],
  },
  {
    id: 'pigeons',
    title: 'Голуби',
    blurb: 'Обери, що з’їсти, і цілься. Вітер заважає.',
    icon: '🕊️',
    path: '/pigeons',
    kind: 'bundle',
    tier: 'free',
    multiplayer: true,
    cover: ['rgba(140, 190, 220, 0.34)', '#3d5a70', '#1d2b38'],
    note: 'у роботі',
    ages: [6, 12],
  },
];

/**
 * @param pathname the request path
 * @return the game that owns it, or null
 */
export function findGame(pathname: string): Game | null {
  for (const game of GAMES) {
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
