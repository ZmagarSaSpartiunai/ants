import { pickVoice } from './voice.js';

/**
 * The speaking voice, shared by every game for small children.
 *
 * These players cannot read. Everything a screen would normally say in words
 * has to be said out loud instead, so this is not decoration -- it is the only
 * channel some of them have.
 *
 * Nothing here makes a sound until `unlock` has been called from inside a real
 * tap: browsers refuse audio a page starts by itself.
 */

let voice: SpeechSynthesisVoice | null = null;
let settled = false;
let on = true;

export function soundOn(): boolean {
  return on;
}

export function setSound(next: boolean): void {
  on = next;
  if (!next) window.speechSynthesis?.cancel();
}

/** Whether anything will actually be said if asked. */
export function canSpeak(): boolean {
  return !!voice;
}

/**
 * Finds a voice. Browsers hand the list over late, so this asks twice.
 */
export function findVoice(): void {
  const synth = window.speechSynthesis;
  if (!synth || settled) return;
  const choose = (): void => {
    const all = synth.getVoices();
    if (!all.length) return;
    voice = pickVoice(all);
    settled = true;
  };
  choose();
  if (!settled) synth.addEventListener('voiceschanged', choose, { once: true });
}

/**
 * @param text what to say, in Ukrainian
 * @param pitch how high, 1 being the voice's own
 */
export function say(text: string, pitch = 1.2): void {
  if (!on || !voice) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 0.95;
  u.pitch = pitch;
  synth.speak(u);
}
