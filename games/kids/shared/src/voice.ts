/**
 * Choosing a voice, kept apart from the browser so it can be tested.
 *
 * This is the one piece of the speaking code with a decision in it, and the
 * decision matters: a Ukrainian sentence read by an English voice is not
 * merely accented, it is unintelligible to a four-year-old. Silence is better.
 */

/** Only what the choice depends on, so a test does not need a browser. */
export interface VoiceLike {
  lang: string;
  name: string;
  localService?: boolean;
}

/**
 * @param voices whatever the browser offers
 * @return the one to speak Ukrainian with, or null to stay silent
 */
export function pickVoice<T extends VoiceLike>(voices: T[]): T | null {
  const ua = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('uk'));
  if (!ua.length) return null;
  // A voice installed on the device keeps working with no network, which is
  // most of why a game like this is worth having offline at all.
  return ua.find((v) => v.localService) ?? ua[0];
}
