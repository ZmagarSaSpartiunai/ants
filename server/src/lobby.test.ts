import test from 'node:test';
import assert from 'node:assert/strict';
import { Lobby, sanitizeName } from './lobby.js';

/** All the lobby ever needs of a socket is identity, so a bare object will do. */
function client(): object {
  return {};
}

test('a fresh lobby has every seat open', () => {
  const lobby = new Lobby<object>('ABCDEF', 3);

  assert.equal(lobby.seats.length, 3);
  assert.ok(lobby.seats.every((s) => !s.ws && !s.isBot));
});

test('a room that fills itself with bots cannot be joined by the friend it was made for', () => {
  // This is the bug the comment in room.ts records: seats must start open.
  const lobby = new Lobby<object>('ABCDEF', 2);
  lobby.join(client(), 'Ola');

  assert.notEqual(lobby.join(client(), 'Taras'), null);
});

test('the first seat to arrive is the host', () => {
  const lobby = new Lobby<object>('ABCDEF', 2);
  const a = client();
  const b = client();
  lobby.join(a, 'Ola');
  lobby.join(b, 'Taras');

  assert.equal(lobby.isHost(a), true);
  assert.equal(lobby.isHost(b), false);
});

test('a full lobby refuses the next arrival', () => {
  const lobby = new Lobby<object>('ABCDEF', 2);
  lobby.join(client(), 'Ola');
  lobby.join(client(), 'Taras');

  assert.equal(lobby.join(client(), 'third'), null);
});

test('when the host leaves, the next seat inherits the room', () => {
  const lobby = new Lobby<object>('ABCDEF', 2);
  const a = client();
  const b = client();
  lobby.join(a, 'Ola');
  lobby.join(b, 'Taras');
  lobby.release(a);

  assert.equal(lobby.isHost(b), true, 'the room must not be left with no host');
});

test('an unnamed seat is numbered, never left blank', () => {
  const lobby = new Lobby<object>('ABCDEF', 2);
  lobby.join(client(), '');

  assert.equal(lobby.roster()[0].name, '#1');
});

test('a bot may only take a seat nobody is sitting in', () => {
  const lobby = new Lobby<object>('ABCDEF', 2);
  const a = client();
  lobby.join(a, 'Ola');

  assert.equal(lobby.setBot(0, true), false, 'seat 0 is taken');
  assert.equal(lobby.setBot(1, true), true);
  assert.equal(lobby.join(client(), 'late'), null, 'the bot now holds that seat');
});

test('taking the bot off reopens the seat and restores its number', () => {
  const lobby = new Lobby<object>('ABCDEF', 2);
  lobby.setBot(1, true);
  lobby.setBot(1, false);

  assert.equal(lobby.roster()[1].name, '#2');
  assert.notEqual(lobby.join(client(), 'Taras'), null);
});

test('seats cannot be rearranged once the match is running', () => {
  const lobby = new Lobby<object>('ABCDEF', 2);
  lobby.started = true;

  assert.equal(lobby.setBot(1, true), false);
});

test('a lobby is empty only when every socket has gone', () => {
  const lobby = new Lobby<object>('ABCDEF', 2);
  const a = client();
  lobby.join(a, 'Ola');
  assert.equal(lobby.empty, false);

  lobby.release(a);
  assert.equal(lobby.empty, true);
});

test('a started room is never stale, however long it runs', () => {
  const lobby = new Lobby<object>('ABCDEF', 2);
  lobby.started = true;

  assert.equal(lobby.stale, false);
});

test('names are stripped of control characters and markup', () => {
  assert.equal(sanitizeName('<b>Ola</b>'), 'bOla/b');
  assert.equal(sanitizeName('  Taras  '), 'Taras');
  assert.equal(sanitizeName(42), '');
  assert.equal(sanitizeName('a'.repeat(50)).length, 20);
});
