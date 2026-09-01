import { randomInt } from 'node:crypto';

/**
 * No 0/O and no 1/I/L: the code has to survive being read out loud over the
 * phone, which is the entire point of using a code instead of a link.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 6;

export function makeCode(taken: (code: string) => boolean): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = '';
    // Crypto RNG, not the game PRNG: a guessable room code is a way in.
    for (let i = 0; i < LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
    if (!taken(code)) return code;
  }

  throw new Error('room code space exhausted');
}

export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase();
  if (code.length !== LENGTH) return null;
  for (const ch of code) if (!ALPHABET.includes(ch)) return null;

  return code;
}
