/**
 * Sound, and the counting voice.
 *
 * Both need a tap before they will make any noise at all -- browsers refuse
 * audio a page starts on its own -- so nothing here is touched until the child
 * has pressed the button on the front screen.
 *
 * The voice is the teaching part: a child of three or four cannot read the
 * number on the screen, and hearing it said is the whole reason the number is
 * worth showing.
 */

const WORDS = [
  'нуль', 'один', 'два', 'три', 'чотири', 'пʼять', 'шість', 'сім', 'вісім', 'девʼять', 'десять',
];

let ctx: AudioContext | null = null;
let voice: SpeechSynthesisVoice | null = null;
let voiceReady = false;
let on = true;

export function soundOn(): boolean {
  return on;
}

export function setSound(next: boolean): void {
  on = next;
  if (!next) window.speechSynthesis?.cancel();
}

/** Called from the first tap, where the browser will allow it. */
export function unlock(): void {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) ctx = new Ctor();
  }
  void ctx?.resume();
  pickVoice();
}

function pickVoice(): void {
  const synth = window.speechSynthesis;
  if (!synth || voiceReady) return;
  const choose = (): void => {
    const all = synth.getVoices();
    // Ukrainian if the device has it; otherwise stay silent rather than read
    // Ukrainian words in an English accent, which a small child cannot parse.
    voice = all.find((v) => v.lang.toLowerCase().startsWith('uk')) ?? null;
    if (all.length) voiceReady = true;
  };
  choose();
  if (!voiceReady) synth.addEventListener('voiceschanged', choose, { once: true });
}

/**
 * @param n how many are in the potty now
 */
export function say(n: number): void {
  if (!on || !voice) return;
  const synth = window.speechSynthesis;
  const text = n <= 10 ? WORDS[n] : String(n);
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 0.95;
  u.pitch = 1.25;
  synth.speak(u);
}

/**
 * @param freq where the note sits
 * @param seconds how long it rings
 * @param type the shape of it
 * @param gain how loud, 0..1
 */
function tone(freq: number, seconds: number, type: OscillatorType, gain: number): void {
  if (!on || !ctx) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  amp.gain.setValueAtTime(gain, ctx.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds);
  osc.connect(amp).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + seconds);
}

/** A wet plop into the pot. */
export function plop(): void {
  if (!ctx) return;
  tone(420, 0.16, 'sine', 0.25);
  window.setTimeout(() => tone(700, 0.12, 'sine', 0.18), 60);
}

/** A flat slap on the floor. */
export function splat(): void {
  tone(120, 0.2, 'triangle', 0.2);
}

/** The animal announcing itself, so a child not looking still gets warned. */
export function warn(): void {
  tone(300, 0.1, 'square', 0.08);
}

/** The pot is full: two flat notes, so it reads as a problem, not a prize. */
export function full(): void {
  tone(330, 0.14, 'square', 0.1);
  window.setTimeout(() => tone(262, 0.2, 'square', 0.1), 130);
}

/** Water going down, faked with a note sliding under a hiss of high ones. */
export function flush(): void {
  if (!on || !ctx) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(520, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.9);
  amp.gain.setValueAtTime(0.12, ctx.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1);
  osc.connect(amp).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 1);
  for (let i = 0; i < 6; i++) {
    window.setTimeout(() => tone(900 + Math.random() * 700, 0.07, 'sine', 0.05), i * 130);
  }
}

/** One star earned. */
export function chime(): void {
  tone(880, 0.16, 'triangle', 0.18);
  window.setTimeout(() => tone(1319, 0.22, 'triangle', 0.16), 90);
}

/** A level finished. */
export function fanfare(): void {
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => window.setTimeout(() => tone(f, 0.22, 'triangle', 0.2), i * 110));
}
