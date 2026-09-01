// Everything is synthesised. No audio files: the game has to stay droppable on
// a portal as a self-contained folder.

let ctx: AudioContext | null = null;
let enabled = true;

export function setSound(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem('ants.sound', on ? '1' : '0');
  } catch {
    // Choice simply will not survive a reload in private mode.
  }
}

export function soundOn(): boolean {
  return enabled;
}

export function loadSound(): void {
  try {
    enabled = localStorage.getItem('ants.sound') !== '0';
  } catch {
    enabled = true;
  }
}

/** Browsers only allow audio after a gesture, so this is called from input. */
export function unlock(): void {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch {
    ctx = null;
  }
}

function blip(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number): void {
  if (!enabled || !ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sfx = {
  link: () => blip(320, 0.12, 'triangle', 0.06, 480),
  capture: () => blip(220, 0.3, 'sine', 0.11, 440),
  lost: () => blip(300, 0.35, 'sine', 0.1, 140),
  snap: () => blip(150, 0.22, 'sawtooth', 0.09, 60),
  clash: () => blip(90, 0.07, 'square', 0.035),
  win: () => {
    blip(440, 0.18, 'triangle', 0.1);
    setTimeout(() => blip(660, 0.28, 'triangle', 0.1), 130);
  },
  lose: () => blip(220, 0.55, 'sine', 0.1, 90),
};
