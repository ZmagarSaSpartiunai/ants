import test from 'node:test';
import assert from 'node:assert/strict';
import { pickVoice, VoiceLike } from './voice.js';

const v = (lang: string, name: string, localService = false): VoiceLike => ({ lang, name, localService });

test('a Ukrainian voice is taken when there is one', () => {
  const chosen = pickVoice([v('en-GB', 'Daniel'), v('uk-UA', 'Lesya'), v('pl-PL', 'Ewa')]);

  assert.equal(chosen?.name, 'Lesya');
});

test('it stays silent rather than reading Ukrainian in English', () => {
  // Not merely accented: unintelligible to a four-year-old, and the number
  // being read aloud is the entire reason it is being read aloud.
  assert.equal(pickVoice([v('en-US', 'Alex'), v('de-DE', 'Anna')]), null);
});

test('an installed voice wins over one that needs the network', () => {
  const chosen = pickVoice([v('uk-UA', 'Cloud'), v('uk-UA', 'Installed', true)]);

  assert.equal(chosen?.name, 'Installed');
});

test('the tags browsers actually use are all recognised', () => {
  for (const tag of ['uk', 'uk-UA', 'uk_UA', 'UK-ua']) {
    assert.ok(pickVoice([v(tag, 'x')]), `${tag} was not recognised`);
  }
});

test('a language that merely starts with the same letters is not Ukrainian', () => {
  assert.equal(pickVoice([v('ur-PK', 'Urdu')]), null);
});

test('nothing on offer is answered with nothing', () => {
  assert.equal(pickVoice([]), null);
});
