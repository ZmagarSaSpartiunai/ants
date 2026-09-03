import {
  Bot,
  FOODS,
  FOOD_IDS,
  Flight,
  FoodId,
  MatchState,
  Shot,
  START_HP,
  canFire,
  createMatch,
  flyShot,
  resolveRound,
  windFor,
} from '@pigeons/shared';
import { Fleck, FOOD_TINT, Hud, Splat, View } from './render.js';
import './style.css';

/**
 * Голуби, one device, against the machine.
 *
 * Rounds are simultaneous: you and the bird opposite let go at the same moment
 * and both shots fly together. There is no clock on your turn -- with nobody
 * waiting on the other end of a wire there is nothing to hurry for, and a timer
 * would only punish a child for thinking. When the game grows a second phone
 * the clock arrives with it.
 */

/** Playback speed of a flight, in simulation steps per animation frame. */
const REPLAY_SPEED = 4;
/** A drag this long is a full-power throw. */
const FULL_DRAG = 150;
/** Below this a drag is a tap, not a throw. */
const MIN_DRAG = 14;

type Phase = 'aim' | 'fly' | 'settle' | 'over';

const YOU = 0;
const FOE = 1;

const LABEL: Record<FoodId, string> = {
  seed: 'зернятко',
  melon: 'кавун',
  pepper: 'перець',
  icecream: 'морозиво',
};
const ICON: Record<FoodId, string> = {
  seed: '🌾',
  melon: '🍉',
  pepper: '🌶️',
  icecream: '🍦',
};

class Game {
  private readonly view: View;
  private state: MatchState;
  private bot: Bot;
  private seed = 0;
  private phase: Phase = 'aim';
  private food: FoodId = 'seed';
  private drag: { x: number; y: number } | null = null;
  private preview: Flight | null = null;
  private flights: Flight[] = [];
  private flightAt = 0;
  private pending: Shot[] = [];
  private splats: Splat[] = [];
  private flecks: Fleck[] = [];
  private flash = new Map<number, number>();
  private falling = new Map<number, number>();
  private time = 0;
  private settleFor = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ui: {
      foods: HTMLDivElement;
      status: HTMLDivElement;
      banner: HTMLDivElement;
      again: HTMLButtonElement;
    },
  ) {
    this.view = new View(canvas);
    this.state = createMatch(0, 2);
    this.bot = new Bot(FOE, 'normal', 0);
    this.buildFoodButtons();
    this.restart();

    addEventListener('resize', () => this.view.resize());
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', () => this.cancelDrag());
    ui.again.addEventListener('click', () => this.restart());
  }

  restart(): void {
    this.seed = (Math.random() * 0xfffff) >>> 0;
    this.state = createMatch(this.seed, 2);
    this.bot = new Bot(FOE, 'normal', (this.seed + 7919) >>> 0);
    this.phase = 'aim';
    this.food = 'seed';
    this.drag = null;
    this.preview = null;
    this.flights = [];
    this.pending = [];
    this.splats = [];
    this.flecks = [];
    this.flash.clear();
    this.falling.clear();
    this.ui.banner.hidden = true;
    this.view.resize();
    this.refresh();
  }

  private buildFoodButtons(): void {
    for (const id of FOOD_IDS) {
      const button = document.createElement('button');
      button.className = 'food';
      button.dataset.food = id;
      button.innerHTML =
        `<span class="glyph">${ICON[id]}</span>` +
        `<span class="name">${LABEL[id]}</span>` +
        `<span class="cost"></span>`;
      button.addEventListener('click', () => {
        this.food = id;
        this.refresh();
      });
      this.ui.foods.appendChild(button);
    }
  }

  /** Keeps the buttons and the line of text saying what is going on in step. */
  private refresh(): void {
    const me = this.state.birds[YOU];
    const mine = canFire(this.state, YOU);
    for (const el of Array.from(this.ui.foods.children) as HTMLButtonElement[]) {
      const id = el.dataset.food as FoodId;
      const cost = FOODS[id].digest;
      el.classList.toggle('on', id === this.food);
      el.disabled = !mine || this.phase !== 'aim';
      const label = el.querySelector('.cost') as HTMLElement;
      label.textContent = cost === 0 ? 'без паузи' : cost === 1 ? 'пропуск 1' : `пропуск ${cost}`;
    }

    const wind = windFor(this.state.seed, this.state.round);
    const arrow = Math.abs(wind) < 0.08 ? 'тихо' : wind > 0 ? '→'.repeat(gust(wind)) : '←'.repeat(gust(wind));
    if (this.phase === 'over') {
      this.ui.status.textContent = '';
    } else if (!mine && me.busy > 0) {
      this.ui.status.textContent = `Травиш ще ${me.busy}. Вітер ${arrow}`;
    } else if (this.phase === 'aim') {
      this.ui.status.textContent = `Тягни від свого голуба. Вітер ${arrow}`;
    } else {
      this.ui.status.textContent = `Вітер ${arrow}`;
    }
  }

  private onDown(e: PointerEvent): void {
    if (this.phase !== 'aim') return;
    this.canvas.setPointerCapture(e.pointerId);
    this.drag = this.view.toWorld(e.clientX, e.clientY);
    this.updatePreview(this.drag);
  }

  private onMove(e: PointerEvent): void {
    if (!this.drag) return;
    this.updatePreview(this.view.toWorld(e.clientX, e.clientY));
  }

  private onUp(e: PointerEvent): void {
    if (!this.drag) return;
    const at = this.view.toWorld(e.clientX, e.clientY);
    const shot = this.shotFrom(at);
    this.cancelDrag();
    if (shot) this.fire(shot);
  }

  private cancelDrag(): void {
    this.drag = null;
    this.preview = null;
  }

  /**
   * Drag away from the bird to throw: the further you pull, the harder it goes.
   * Pulling backwards like a slingshot was the other option and was rejected --
   * every child already knows how throwing works.
   *
   * @param at where the finger is now, in world units
   * @return the shot that would be fired, or null when the drag is too short
   */
  private shotFrom(at: { x: number; y: number }): Shot | null {
    const me = this.state.birds[YOU];
    const dx = at.x - me.x;
    const dy = at.y - me.y;
    const len = Math.hypot(dx, dy);
    if (len < MIN_DRAG) return null;

    return {
      slot: YOU,
      food: this.food,
      angle: Math.atan2(dy, dx),
      power: Math.min(1, len / FULL_DRAG),
    };
  }

  private updatePreview(at: { x: number; y: number }): void {
    const shot = this.shotFrom(at);
    if (!shot) {
      this.preview = null;

      return;
    }
    const me = this.state.birds[YOU];
    // Flown through the very same function the round will use, so what the
    // player is shown and what actually happens can never disagree.
    this.preview = flyShot(
      { x: me.x, y: me.y },
      shot,
      this.state.props,
      windFor(this.state.seed, this.state.round),
      this.state.birds.filter((b) => b.alive),
    );
  }

  private fire(mine: Shot): void {
    const theirs = this.bot.choose(this.state);
    this.pending = theirs ? [mine, theirs] : [mine];

    // The round is decided now, all at once, and only then played back. The
    // animation is a retelling of something already settled -- which is exactly
    // what the network will hand over when this game grows a second phone.
    const before = this.state.birds.map((b) => b.hp);
    const result = resolveRound(this.state, this.pending);
    this.flights = result.flights;
    this.flightAt = 0;
    this.phase = this.flights.length ? 'fly' : 'settle';
    this.settleFor = 0.5;
    this.damage = this.state.birds.map((b, i) => before[i] - b.hp);
    this.refresh();
  }

  private damage: number[] = [];

  /** Called once every flight has finished playing: this is where it lands. */
  private land(): void {
    for (const flight of this.flights) {
      const food = this.food;
      this.splats.push({ x: flight.end.x, y: flight.end.y, food, born: this.time });
      const tint = FOOD_TINT[food][0];
      for (let i = 0; i < 14; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
        const sp = 40 + Math.random() * 120;
        this.flecks.push({
          x: flight.end.x,
          y: flight.end.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          r: 1.4 + Math.random() * 2.4,
          life: 1,
          tint,
        });
      }
    }
    for (let i = 0; i < this.damage.length; i++) {
      if (this.damage[i] > 0.5) this.flash.set(i, 1);
    }
    for (const bird of this.state.birds) {
      if (!bird.alive && !this.falling.has(bird.slot)) this.falling.set(bird.slot, 0.001);
    }
    this.phase = 'settle';
    this.settleFor = 0.9;
  }

  private finish(): void {
    this.phase = 'over';
    const won = this.state.winner === YOU;
    const draw = this.state.winner === null;
    this.ui.banner.hidden = false;
    this.ui.banner.className = `banner ${won ? 'won' : draw ? 'draw' : 'lost'}`;
    const title = this.ui.banner.querySelector('.title') as HTMLElement;
    const sub = this.ui.banner.querySelector('.sub') as HTMLElement;
    title.textContent = draw ? 'Обидва впали!' : won ? 'Ти виграв!' : 'Тебе збили';
    sub.textContent = draw
      ? 'Ви поцілили одне в одного в одному раунді.'
      : won
        ? `Раундів: ${this.state.round}`
        : 'Спробуй кавун — він накриває більше.';
    this.refresh();
  }

  step(dt: number): void {
    this.time += dt;
    this.view.resize();

    for (const [slot, v] of this.flash) {
      const next = v - dt * 2.4;
      if (next <= 0) this.flash.delete(slot);
      else this.flash.set(slot, next);
    }
    for (const [slot, v] of this.falling) this.falling.set(slot, v + dt * 2.2);
    for (let i = this.flecks.length - 1; i >= 0; i--) {
      const f = this.flecks[i];
      f.vy += 900 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.life -= dt / 0.9;
      if (f.life <= 0) this.flecks.splice(i, 1);
    }
    this.splats = this.splats.filter((s) => this.time - s.born < 6);

    if (this.phase === 'fly') {
      this.flightAt += REPLAY_SPEED;
      const longest = Math.max(...this.flights.map((f) => f.points.length));
      if (this.flightAt >= longest) this.land();
    } else if (this.phase === 'settle') {
      this.settleFor -= dt;
      if (this.settleFor <= 0) {
        this.flights = [];
        if (this.state.over) this.finish();
        else {
          this.phase = 'aim';
          this.refresh();
        }
      }
    }

    const hud: Hud = {
      you: YOU,
      preview: this.preview,
      flights: this.phase === 'fly' ? this.flights : [],
      flightAt: this.flightAt,
      splats: this.splats,
      flecks: this.flecks,
      flash: this.flash,
      falling: this.falling,
      wind: windFor(this.state.seed, this.state.round),
      time: this.time,
    };
    this.view.draw(this.state, hud);
  }
}

/**
 * @param wind -1..1
 * @return how many arrows that deserves, 1 to 3
 */
function gust(wind: number): number {
  const s = Math.abs(wind);

  return s > 0.66 ? 3 : s > 0.33 ? 2 : 1;
}

const canvas = document.getElementById('field') as HTMLCanvasElement;
const game = new Game(canvas, {
  foods: document.getElementById('foods') as HTMLDivElement,
  status: document.getElementById('status') as HTMLDivElement,
  banner: document.getElementById('banner') as HTMLDivElement,
  again: document.getElementById('again') as HTMLButtonElement,
});

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.step(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

export { START_HP };
