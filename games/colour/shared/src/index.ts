/**
 * «Розмальовка» -- what there is to colour and what to colour it with.
 *
 * The shapes themselves live in the client, because they are drawing. What is
 * here is everything that can be got wrong without a screen: the names that
 * get spoken, which parts a picture has, and when it is finished.
 *
 * The player cannot read. Every name here is said out loud instead, so a name
 * that is wrong is not a typo -- it is the game teaching a child the wrong
 * word.
 */

export interface Paint {
  id: string;
  /** Said out loud when the colour is chosen. */
  name: string;
  hex: string;
}

/**
 * Twelve, and no more: a palette a small finger can hit, and a set of names
 * worth learning. Every one is a colour a four-year-old is expected to know.
 */
export const PALETTE: Paint[] = [
  { id: 'red', name: 'червоний', hex: '#e0453c' },
  { id: 'orange', name: 'помаранчевий', hex: '#f08a2c' },
  { id: 'yellow', name: 'жовтий', hex: '#f7cf3f' },
  { id: 'green', name: 'зелений', hex: '#5eb84f' },
  { id: 'lightblue', name: 'блакитний', hex: '#52b6e8' },
  { id: 'blue', name: 'синій', hex: '#3559c7' },
  { id: 'purple', name: 'фіолетовий', hex: '#8a4f9d' },
  { id: 'pink', name: 'рожевий', hex: '#f08fb0' },
  { id: 'brown', name: 'коричневий', hex: '#96633a' },
  { id: 'grey', name: 'сірий', hex: '#9aa3ab' },
  { id: 'black', name: 'чорний', hex: '#3a3129' },
  { id: 'white', name: 'білий', hex: '#f7f4ee' },
];

export interface Picture {
  id: string;
  /** Said out loud when the picture opens. */
  title: string;
  /**
   * The parts that can be coloured, back to front.
   *
   * The order is the drawing order and also the order a tap is tested in,
   * backwards -- so a chimney listed before the roof is a chimney the roof
   * covers the bottom of, which is what a chimney looks like.
   */
  regions: readonly string[];
}

export const PICTURES: Picture[] = [
  { id: 'cat', title: 'котик', regions: ['хвіст', 'вушка', 'тіло', 'лапки', 'голова', 'бантик'] },
  { id: 'house', title: 'будиночок', regions: ['сонце', 'трава', 'стіни', 'труба', 'дах', 'двері', 'вікно'] },
  { id: 'flower', title: 'квітка', regions: ['стебло', 'листочки', 'пелюстки', 'серединка', 'горщик'] },
  { id: 'fish', title: 'рибка', regions: ['водорості', 'хвіст', 'тіло', 'плавець', 'бульбашки'] },
];

/** Which colour each part has been given, if any. */
export type Filled = Record<string, string | undefined>;

/**
 * @param picture the picture
 * @param filled what has been coloured so far
 * @return whether every part has a colour
 */
export function isDone(picture: Picture, filled: Filled): boolean {
  return picture.regions.every((r) => !!filled[r]);
}

/**
 * @param picture the picture
 * @param filled what has been coloured so far
 * @return how many parts are still white
 */
export function leftToDo(picture: Picture, filled: Filled): number {
  return picture.regions.filter((r) => !filled[r]).length;
}

/**
 * @param id the picture now open
 * @return the one after it, wrapping round for ever
 */
export function nextPicture(id: string): Picture {
  const at = PICTURES.findIndex((p) => p.id === id);

  return PICTURES[(at + 1) % PICTURES.length];
}

/**
 * @param id a paint id
 * @return the paint, or null when the id is not one of ours
 */
export function paintById(id: unknown): Paint | null {
  if (typeof id !== 'string') return null;

  return PALETTE.find((p) => p.id === id) ?? null;
}
