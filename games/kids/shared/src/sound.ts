import { findVoice, soundOn } from './speech.js';

/**
 * Small noises, made rather than loaded.
 *
 * Every one of these is a couple of oscillators, so a game ships no audio
 * files at all and still answers every tap with something. For a child that
 * answer is most of what makes a screen feel alive.
 */

let ctx: AudioContext | null = null;

/** Called from the first real tap, where the browser will allow it. */
export function unlock(): void {
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) ctx = new Ctor();
  }
  void ctx?.resume();
  findVoice();
}

/**
 * @param freq where the note sits, in hertz
 * @param seconds how long it rings
 * @param type the shape of it
 * @param gain how loud, 0..1
 * @param delay how long to wait first, in seconds
 */
export function tone(freq: number, seconds: number, type: OscillatorType, gain: number, delay = 0): void {
  if (!soundOn() || !ctx) return;
  const at = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  amp.gain.setValueAtTime(gain, at);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  osc.connect(amp).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + seconds);
}

/**
 * @param from where the slide starts
 * @param to where it ends
 * @param seconds how long it takes
 * @param type the shape of it
 * @param gain how loud, 0..1
 */
export function slide(from: number, to: number, seconds: number, type: OscillatorType, gain: number): void {
  if (!soundOn() || !ctx) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), ctx.currentTime + seconds);
  amp.gain.setValueAtTime(gain, ctx.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds);
  osc.connect(amp).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + seconds);
}

/** A soft answer to a tap that did something. */
export function blip(): void {
  tone(660, 0.1, 'sine', 0.16);
}

/** A tap that did nothing useful. Never harsh: nothing here is a punishment. */
export function nope(): void {
  tone(220, 0.12, 'triangle', 0.1);
}

/** Right. */
export function chime(): void {
  tone(880, 0.15, 'triangle', 0.18);
  tone(1319, 0.22, 'triangle', 0.16, 0.09);
}

/** Finished. */
export function fanfare(): void {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.24, 'triangle', 0.2, i * 0.11));
}
