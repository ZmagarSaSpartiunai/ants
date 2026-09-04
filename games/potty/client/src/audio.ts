import { say as speak, slide, tone } from '@kids/common';

/**
 * The noises this game makes, on top of the shared voice and tone generator.
 *
 * The counting is the teaching part: a child of three or four cannot read the
 * number on the screen, and hearing it said is the whole reason the number is
 * worth showing.
 */

const WORDS = [
  'нуль', 'один', 'два', 'три', 'чотири', 'пʼять', 'шість', 'сім', 'вісім', 'девʼять', 'десять',
];

export { setSound, soundOn } from '@kids/common';
export { unlock } from '@kids/common';
export { chime, fanfare } from '@kids/common';

/**
 * @param n how full the potty is now
 */
export function say(n: number): void {
  speak(n < WORDS.length ? WORDS[n] : String(n));
}

/** A wet plop into the pot. */
export function plop(): void {
  tone(420, 0.16, 'sine', 0.25);
  tone(700, 0.12, 'sine', 0.18, 0.06);
}

/** A flat slap on the floor. */
export function splat(): void {
  tone(120, 0.2, 'triangle', 0.2);
}

/** An animal announcing itself, so a child not looking still gets warned. */
export function warn(): void {
  tone(300, 0.1, 'square', 0.08);
}

/** The pot is full: two flat notes, so it reads as a problem, not a prize. */
export function full(): void {
  tone(330, 0.14, 'square', 0.1);
  tone(262, 0.2, 'square', 0.1, 0.13);
}

/** Water going down, faked with a note sliding under a hiss of high ones. */
export function flush(): void {
  slide(520, 120, 0.95, 'sawtooth', 0.12);
  for (let i = 0; i < 6; i++) tone(900 + Math.random() * 700, 0.07, 'sine', 0.05, i * 0.13);
}

/** Somebody was left waiting: a short, unhappy slide downwards. */
export function groan(): void {
  slide(300, 150, 0.38, 'sawtooth', 0.1);
}

/** One animal has burst. Low, short and blunt. */
export function boom(): void {
  tone(90, 0.35, 'sawtooth', 0.22);
  tone(60, 0.3, 'triangle', 0.16, 0.07);
}

/** Everybody burst. */
export function sad(): void {
  [440, 392, 330, 262].forEach((f, i) => tone(f, 0.35, 'triangle', 0.16, i * 0.19));
}
