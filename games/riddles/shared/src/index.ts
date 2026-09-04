/**
 * «Хто це?» -- riddles for a player who cannot read a word.
 *
 * Every question is spoken and every answer is a picture. That is not a
 * concession: at three or four, listening and pointing is the whole of what a
 * child can do on a screen, and it happens to be exactly how they learn the
 * words in the first place.
 *
 * Nothing here draws anything. What is here is the questions, the answers, and
 * the shuffling -- all of which can be wrong without a screen to show it.
 */

export type Kind = 'animal' | 'colour' | 'shape' | 'count';

/** A card that can appear as a choice. Its id says what to draw. */
export type CardId = string;

export interface Animal {
  id: string;
  name: string;
  /** What it says, spelled the way it is said aloud. */
  says: string;
}

export const ANIMALS: Animal[] = [
  { id: 'cow', name: 'корова', says: 'му-у' },
  { id: 'pig', name: 'свинка', says: 'хрю-хрю' },
  { id: 'cat', name: 'котик', says: 'няв' },
  { id: 'dog', name: 'песик', says: 'гав-гав' },
  { id: 'duck', name: 'качечка', says: 'кря-кря' },
  { id: 'sheep', name: 'вівця', says: 'бе-е' },
  { id: 'frog', name: 'жабка', says: 'ква-ква' },
  { id: 'hen', name: 'курочка', says: 'ко-ко' },
];

export interface Colour {
  id: string;
  name: string;
  hex: string;
}

export const COLOURS: Colour[] = [
  { id: 'red', name: 'червоний', hex: '#e0453c' },
  { id: 'yellow', name: 'жовтий', hex: '#f7cf3f' },
  { id: 'green', name: 'зелений', hex: '#5eb84f' },
  { id: 'blue', name: 'синій', hex: '#3559c7' },
  { id: 'orange', name: 'помаранчевий', hex: '#f08a2c' },
  { id: 'purple', name: 'фіолетовий', hex: '#8a4f9d' },
];

export interface Shape {
  id: string;
  name: string;
}

export const SHAPES: Shape[] = [
  { id: 'circle', name: 'коло' },
  { id: 'square', name: 'квадрат' },
  { id: 'triangle', name: 'трикутник' },
  { id: 'star', name: 'зірочку' },
  { id: 'heart', name: 'серденько' },
];

/** How high the counting goes. Five is as far as this age counts reliably. */
export const MAX_COUNT = 5;

export const COUNT_WORD = ['нуль', 'одне', 'два', 'три', 'чотири', 'пʼять'];

export interface Riddle {
  kind: Kind;
  /** Said out loud, and never shown. */
  ask: string;
  /** Said out loud when it is answered, so the word lands with the picture. */
  praise: string;
  answer: CardId;
  choices: CardId[];
}

/** How many cards a question offers. Three fits a small screen and a small head. */
export const CHOICES = 3;

/**
 * @param seed the round's seed
 * @return a number in 0..1 and the seed to carry on with
 */
function next(seed: number): { value: number; seed: number } {
  let h = (seed + 0x6d2b79f5) >>> 0;
  h = Math.imul(h ^ (h >>> 15), h | 1) >>> 0;
  h = (h ^ (h + Math.imul(h ^ (h >>> 7), h | 61))) >>> 0;

  return { value: ((h ^ (h >>> 14)) >>> 0) / 4294967296, seed: h };
}

class Rng {
  constructor(private seed: number) {}

  roll(): number {
    const r = next(this.seed);
    this.seed = r.seed;

    return r.value;
  }

  /**
   * @param list to draw from
   * @param n how many, all different
   * @return that many, in a random order
   */
  take<T>(list: T[], n: number): T[] {
    const pool = [...list];
    const out: T[] = [];
    while (out.length < n && pool.length) {
      out.push(...pool.splice(Math.floor(this.roll() * pool.length), 1));
    }

    return out;
  }
}

/**
 * @param rng the round's generator
 * @param kind which sort of question
 * @return one riddle
 */
function riddleOf(rng: Rng, kind: Kind): Riddle {
  if (kind === 'animal') {
    const [right, ...rest] = rng.take(ANIMALS, CHOICES);

    return {
      kind,
      ask: `Хто каже ${right.says}?`,
      praise: `Так, ${right.name}!`,
      answer: `animal:${right.id}`,
      choices: rng.take([right, ...rest], CHOICES).map((a) => `animal:${a.id}`),
    };
  }
  if (kind === 'colour') {
    const [right, ...rest] = rng.take(COLOURS, CHOICES);

    return {
      kind,
      ask: `Де ${right.name}?`,
      praise: `Так, ${right.name}!`,
      answer: `colour:${right.id}`,
      choices: rng.take([right, ...rest], CHOICES).map((c) => `colour:${c.id}`),
    };
  }
  if (kind === 'shape') {
    const [right, ...rest] = rng.take(SHAPES, CHOICES);

    return {
      kind,
      ask: `Знайди ${right.name}`,
      praise: 'Так!',
      answer: `shape:${right.id}`,
      choices: rng.take([right, ...rest], CHOICES).map((s) => `shape:${s.id}`),
    };
  }
  const numbers = rng.take([1, 2, 3, 4, 5].slice(0, MAX_COUNT), CHOICES);
  const right = numbers[0];

  return {
    kind,
    ask: `Де ${COUNT_WORD[right]} ${right === 1 ? 'яблучко' : 'яблучка'}?`,
    praise: `Так, ${COUNT_WORD[right]}!`,
    answer: `count:${right}`,
    choices: rng.take(numbers, CHOICES).map((n) => `count:${n}`),
  };
}

export const KINDS: Kind[] = ['animal', 'colour', 'shape', 'count'];

/**
 * A round, with the kinds dealt round-robin rather than at random.
 *
 * Left to chance a round can be four colour questions running, and a child who
 * has just met the game decides it is a game about colours and loses interest
 * when it turns out not to be.
 *
 * @param seed anything; the same seed makes the same round
 * @param count how many questions
 * @return the questions, in order
 */
export function makeRound(seed: number, count: number): Riddle[] {
  const rng = new Rng(seed >>> 0);
  const order = rng.take(KINDS, KINDS.length);
  const out: Riddle[] = [];
  for (let i = 0; i < count; i++) out.push(riddleOf(rng, order[i % order.length]));

  return out;
}

/** Every card the client has to be able to draw. */
export function allCards(): CardId[] {
  return [
    ...ANIMALS.map((a) => `animal:${a.id}`),
    ...COLOURS.map((c) => `colour:${c.id}`),
    ...SHAPES.map((s) => `shape:${s.id}`),
    ...Array.from({ length: MAX_COUNT }, (_, i) => `count:${i + 1}`),
  ];
}
