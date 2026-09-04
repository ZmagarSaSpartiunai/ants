import { CardId, makeRound, Riddle } from '@riddles/shared';
import { chime, fanfare, nope, say, setSound, soundOn, unlock } from '@kids/common';
import { checkAll, drawerFor } from './cards.js';
import './style.css';

/**
 * «Хто це?»
 *
 * The question is spoken and never written. Three pictures; tap one. A wrong
 * tap costs nothing at all -- the card shakes its head and the question is
 * asked again -- because at this age being wrong in front of a screen is the
 * fastest way to stop wanting to play.
 */

const ROUND = 8;

const board = document.getElementById('board') as HTMLDivElement;
const startPanel = document.getElementById('start') as HTMLDivElement;
const donePanel = document.getElementById('done') as HTMLDivElement;
const doneSub = document.getElementById('doneSub') as HTMLElement;
const playBtn = document.getElementById('play') as HTMLButtonElement;
const againBtn = document.getElementById('again') as HTMLButtonElement;
const askBtn = document.getElementById('ask') as HTMLButtonElement;
const soundBtn = document.getElementById('sound') as HTMLButtonElement;
const dots = document.getElementById('dots') as HTMLDivElement;

checkAll();

let round: Riddle[] = [];
let at = 0;
let firstTry = 0;

/**
 * @param id which card
 * @return a canvas with it drawn on, ready to put on the board
 */
function cardCanvas(id: CardId): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = 200 * dpr;
  c.height = 200 * dpr;
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  drawerFor(id)(ctx);

  return c;
}

function showDots(): void {
  dots.innerHTML = '';
  for (let i = 0; i < round.length; i++) {
    const d = document.createElement('span');
    d.className = `dot${i < at ? ' done' : ''}${i === at ? ' now' : ''}`;
    dots.append(d);
  }
}

function ask(): void {
  const riddle = round[at];
  if (riddle) say(riddle.ask);
}

function show(): void {
  const riddle = round[at];
  board.innerHTML = '';
  for (const id of riddle.choices) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card';
    b.append(cardCanvas(id));
    b.addEventListener('click', () => choose(b, id));
    board.append(b);
  }
  showDots();
  ask();
}

/**
 * @param button the card that was tapped
 * @param id what is on it
 */
function choose(button: HTMLButtonElement, id: CardId): void {
  const riddle = round[at];
  if (!riddle || button.classList.contains('right')) return;
  if (id !== riddle.answer) {
    // Nothing is lost and nothing is counted. The card simply says no.
    nope();
    button.classList.remove('wrong');
    // Restarting the animation needs the class gone for a frame.
    void button.offsetWidth;
    button.classList.add('wrong');
    window.setTimeout(ask, 700);

    return;
  }
  if (!button.classList.contains('tried')) firstTry++;
  button.classList.add('right');
  chime();
  say(riddle.praise);
  board.querySelectorAll('.card').forEach((other) => {
    if (other !== button) other.classList.add('faded');
  });
  window.setTimeout(() => {
    at++;
    if (at >= round.length) finish();
    else show();
  }, 1200);
}

function finish(): void {
  donePanel.hidden = false;
  fanfare();
  say('Молодець!');
  doneSub.textContent =
    firstTry === round.length
      ? 'Усі відгадав з першого разу!'
      : `Відгадано з першого разу: ${firstTry} з ${round.length}.`;
}

function begin(): void {
  round = makeRound(Math.floor(Math.random() * 1e9), ROUND);
  at = 0;
  firstTry = 0;
  startPanel.hidden = true;
  donePanel.hidden = true;
  show();
}

playBtn.addEventListener('click', () => {
  unlock();
  begin();
});
againBtn.addEventListener('click', () => {
  unlock();
  begin();
});
askBtn.addEventListener('click', () => {
  unlock();
  ask();
});
soundBtn.addEventListener('click', () => {
  setSound(!soundOn());
  soundBtn.textContent = soundOn() ? '🔊' : '🔇';
});

// Marks a card as already tried, so a second guess does not count as the first.
board.addEventListener('pointerdown', (e) => {
  const card = (e.target as HTMLElement).closest('.card');
  if (card) card.classList.add('tried');
});
