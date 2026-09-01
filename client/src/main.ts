import './style.css';
import {
  applyCommand,
  Bot,
  BotLevel,
  Command,
  createGame,
  DT,
  GameState,
  NEUTRAL,
  RoomPlayer,
  ServerMsg,
  SimEvent,
  step,
} from '@ants/shared';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Net } from './net.js';
import { detectLang, LANGS, setLang, t } from './i18n.js';
import { loadSound, setSound, sfx, soundOn, unlock } from './audio.js';
import { playerColor } from './theme.js';

type Mode = 'solo' | 'online';
type Screen = 'game' | 'menu' | 'onlineMenu' | 'lobby' | 'over';

interface TickMsg {
  tick: number;
  cmds: Command[];
}

/** Ticks held back before simulating, to absorb network jitter. */
const BUFFER = 3;

export class App {
  private readonly canvas = document.createElement('canvas');
  private readonly overlay = document.createElement('div');
  private readonly hud = document.createElement('div');
  private readonly toast = document.createElement('div');
  private readonly legend = document.createElement('div');
  private readonly renderer: Renderer;
  private readonly input: Input;

  /** Read-only view for the development hook above. */
  debug() {
    return {
      screen: this.screen,
      mode: this.mode,
      you: this.youId,
      drag: this.input.drag,
      nodes: this.state?.nodes,
      trails: this.state?.trails,
      packets: this.state?.packets.length,
      supplied: this.state?.supplied,
      over: this.state?.over,
      tick: this.state?.tick,
      toWorld: (x: number, y: number) => this.renderer.toWorld(x, y),
      /** Advance without drawing -- lets a test drive a backgrounded tab. */
      pump: (seconds: number) => this.pump(seconds),
    };
  }

  private mode: Mode = 'solo';
  private screen: Screen = 'game';
  private state: GameState | null = null;
  private bots: Bot[] = [];
  private youId = 0;
  private acc = 0;
  private last = 0;
  private background: ReturnType<typeof setInterval> | null = null;

  private net: Net | null = null;
  private queue: TickMsg[] = [];
  private room = '';
  private roomPlayers: RoomPlayer[] = [];
  private roomSlots = 2;
  private isHost = false;
  private netError = '';
  private pending: { from: number; to: number; until: number }[] = [];

  private soloPlayers = 2;
  private soloLevel: BotLevel = 'normal';
  private wantSlots = 2;
  private wantBots = true;

  constructor(root: HTMLElement) {
    root.append(this.canvas, this.hud, this.legend, this.toast, this.overlay);
    this.legend.className = 'legend';
    this.hud.id = 'hud';
    this.toast.id = 'toast';
    this.overlay.id = 'overlay';
    this.overlay.hidden = true;

    this.renderer = new Renderer(this.canvas);
    this.input = new Input(this.renderer, {
      state: () => (this.screen === 'game' ? this.state : null),
      you: () => this.youId,
      send: (cmd) => this.sendCommand(cmd),
      hint: (key) => this.say(t(key)),
    });

    setLang(detectLang());
    loadSound();
    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('pointerdown', () => unlock(), { once: true });
    this.renderer.resize();
    this.drawLegend();

    // The game starts in gameplay, not in a menu: portals require it, and it is
    // also the only honest way to show what the game is.
    this.startSolo();
    this.watchVisibility();
    requestAnimationFrame(this.frame);
    setTimeout(() => this.say(t('hintLink')), 900);
  }

  // ---------------------------------------------------------------- game loop

  private frame = (now: number): void => {
    const dt = this.last ? Math.min(0.25, (now - this.last) / 1000) : 0;
    this.last = now;
    this.pump(dt);
    const now2 = performance.now();
    this.pending = this.pending.filter((p) => p.until > now2);

    if (this.state) {
      this.renderer.draw(
        this.state,
        this.youId,
        this.acc / DT,
        this.input.drag,
        dt,
        this.pending,
      );
      this.drawHud();
    }
    requestAnimationFrame(this.frame);
  };

  /**
   * Advancing the match is separate from drawing it. A hidden tab gets no
   * animation frames at all, and online that is not merely a paused picture:
   * the server keeps sending a tick every 50 ms, so the queue would pile up
   * unbounded and then replay as one lurch on return.
   */
  private pump(dt: number): void {
    if (this.screen !== 'game' && this.screen !== 'over') return;
    if (this.mode === 'solo') this.advanceSolo(dt);
    else this.advanceOnline(dt);
  }

  private watchVisibility(): void {
    const onHidden = (): void => {
      if (document.hidden) {
        // Solo genuinely pauses -- there is nobody to fall behind. Online has
        // to keep up with the server whether anyone is looking or not.
        if (this.background || this.mode !== 'online') return;
        this.background = setInterval(() => this.pump(DT), 1000 / 20);

        return;
      }
      if (this.background) clearInterval(this.background);
      this.background = null;
      // Frames resumed while this callback ran, so do not double-count time.
      this.last = 0;
    };
    document.addEventListener('visibilitychange', onHidden);
  }

  private advanceSolo(dt: number): void {
    const s = this.state;
    if (!s || s.over) return;
    this.acc += dt;
    let guard = 0;
    while (this.acc >= DT && guard++ < 8) {
      this.acc -= DT;
      for (const bot of this.bots) {
        for (const cmd of bot.think(s)) applyCommand(s, cmd);
      }
      this.handleEvents(step(s));
    }
  }

  /**
   * Online runs the identical simulation, driven by the server's tick stream
   * rather than by the local clock. Every tick carries its command list, so
   * both sides feed the same inputs into the same code and cannot drift.
   */
  private advanceOnline(dt: number): void {
    const s = this.state;
    if (!s) return;
    this.acc += dt;
    let guard = 0;
    // A long buffer means lag; burn it down rather than staying behind forever.
    const speed = this.queue.length > BUFFER + 6 ? 2 : 1;
    while (this.acc >= DT && this.queue.length > BUFFER && guard++ < 12) {
      this.acc -= DT / speed;
      const msg = this.queue.shift()!;
      for (const cmd of msg.cmds) applyCommand(s, cmd);
      this.handleEvents(step(s));
    }
    if (this.acc > DT * 4) this.acc = DT * 4;
  }

  private handleEvents(events: SimEvent[]): void {
    const s = this.state!;
    for (const e of events) {
      if (e.t === 'capture') {
        const n = s.nodes[e.node];
        this.renderer.addEffect('capture', n.x, n.y, playerColor(e.by));
        if (e.by === this.youId) sfx.capture();
        else if (e.lost === this.youId) sfx.lost();
      } else if (e.t === 'snap') {
        this.renderer.addEffect('snap', e.x, e.y, '#ffd98a');
        sfx.snap();
      } else if (e.t === 'clash') {
        this.renderer.addEffect('clash', e.x, e.y, '#ffffff');
        if (Math.random() < 0.25) sfx.clash();
      } else if (e.t === 'over') {
        this.finish(e.winner);
      }
    }
  }

  private finish(winner: number): void {
    this.input.reset();
    if (winner === this.youId) sfx.win();
    else sfx.lose();
    this.screen = 'over';
    this.showOver(winner);
  }

  // ------------------------------------------------------------------ actions

  private sendCommand(cmd: Command): void {
    unlock();
    if (this.mode === 'solo') {
      if (this.state && applyCommand(this.state, cmd) && cmd.t === 'link') sfx.link();

      return;
    }
    // Online commands take a round trip. Show the intent immediately, or the
    // control feels broken on a slow connection.
    if (cmd.t === 'link') {
      this.pending.push({ from: cmd.from, to: cmd.to, until: performance.now() + 700 });
      sfx.link();
    }
    this.net?.send({ t: 'cmd', cmd });
  }

  private startSolo(): void {
    this.mode = 'solo';
    this.screen = 'game';
    this.youId = 0;
    this.queue = [];
    this.pending = [];
    const seed = (Math.random() * 0xfffff) >>> 0;
    this.state = createGame(seed, this.soloPlayers);
    this.bots = [];
    for (let i = 1; i < this.soloPlayers; i++) {
      this.bots.push(new Bot(i, this.soloLevel, (seed + i * 7919) >>> 0));
    }
    this.acc = 0;
    this.input.reset();
    this.hideOverlay();
  }

  private ensureNet(): Net {
    if (!this.net) {
      this.net = new Net(
        (msg) => this.onServer(msg),
        (open, reason) => {
          if (!open && reason === 'offline') {
            this.netError = t('offline');
            if (this.screen === 'onlineMenu' || this.screen === 'lobby') this.render();
          }
        },
      );
    }
    this.net.connect();

    return this.net;
  }

  private onServer(msg: ServerMsg): void {
    if (msg.t === 'room') {
      this.room = msg.code;
      this.youId = msg.you;
      this.roomPlayers = msg.players;
      this.roomSlots = msg.slots;
      this.isHost = msg.you === 0;
      this.netError = '';
      this.screen = 'lobby';
      this.render();
    } else if (msg.t === 'start') {
      this.mode = 'online';
      this.state = msg.state;
      this.youId = msg.you;
      this.queue = [];
      this.acc = 0;
      this.screen = 'game';
      this.input.reset();
      this.hideOverlay();
      this.say(t('hintChew'));
    } else if (msg.t === 'cmds') {
      this.queue.push({ tick: msg.tick, cmds: msg.cmds });
      // Ten seconds of backlog means this client is hopelessly behind; the next
      // snapshot will reseat it, so hoarding older ticks only wastes memory.
      if (this.queue.length > 200) this.queue.splice(0, this.queue.length - 200);
    } else if (msg.t === 'sync') {
      // Authoritative correction: covers a reconnect or any drift.
      this.state = msg.state;
      this.queue = [];
    } else if (msg.t === 'over') {
      if (this.screen !== 'over') this.finish(msg.winner);
    } else if (msg.t === 'error') {
      this.netError = t(msg.msg) || msg.msg;
      this.render();
    }
  }

  // ----------------------------------------------------------------------- ui

  /**
   * The three silhouettes, spelled out. Shape is the only thing that can say
   * what a node is -- colour is already spoken for by ownership -- so the key
   * has to be on screen rather than in a tutorial nobody reads.
   */
  private drawLegend(): void {
    const shapes = [
      ['nest', `<circle cx="11" cy="11" r="9" />`, t('legendNest')],
      ['den', `<polygon points="20,11 15.5,18.8 6.5,18.8 2,11 6.5,3.2 15.5,3.2" />`, t('legendDen')],
      ['hive', `<polygon points="11,1.5 20.2,17 1.8,17" />`, t('legendHive')],
    ];
    this.legend.innerHTML = shapes
      .map(
        ([, shape, label]) =>
          `<span class="lg"><svg viewBox="0 0 22 22" width="15" height="15" fill="none"
             stroke="currentColor" stroke-width="2">${shape}</svg>${label}</span>`,
      )
      .join('');
  }

  private say(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    clearTimeout((this.toast as any)._h);
    (this.toast as any)._h = setTimeout(() => this.toast.classList.remove('show'), 2600);
  }

  private hideOverlay(): void {
    this.overlay.hidden = true;
    this.overlay.innerHTML = '';
  }

  private drawHud(): void {
    const s = this.state;
    if (!s) return;
    if (this.screen !== 'game' && this.screen !== 'over') {
      this.hud.innerHTML = '';
      this.legend.hidden = true;

      return;
    }
    const strength = s.players.map((p) =>
      s.nodes.reduce((acc, n) => (n.owner === p.id ? acc + n.count : acc), 0),
    );
    const pips = s.players
      .map((p) => {
        const name =
          p.id === this.youId
            ? t('you')
            : this.mode === 'solo'
              ? t('bot')
              : (this.roomPlayers.find((r) => r.slot === p.id)?.name ?? `#${p.id + 1}`);

        return `<div class="pip${p.alive ? '' : ' dead'}">
          <span class="dot" style="background:${playerColor(p.id)}"></span>
          <span>${escapeHtml(name)}</span>
          <b>${Math.round(strength[p.id])}</b>
        </div>`;
      })
      .join('');
    this.legend.hidden = false;
    const html = `<div class="pips">${pips}</div><button id="menuBtn">${t('menu')}</button>`;
    if (this.hud.innerHTML !== html) {
      this.hud.innerHTML = html;
      this.hud.querySelector('#menuBtn')!.addEventListener('click', () => {
        this.screen = 'menu';
        this.render();
      });
    }
  }

  private render(): void {
    if (this.screen === 'menu') this.showMenu();
    else if (this.screen === 'onlineMenu') this.showOnlineMenu();
    else if (this.screen === 'lobby') this.showLobby();
  }

  private panel(html: string): HTMLElement {
    this.overlay.hidden = false;
    this.overlay.innerHTML = `<div class="panel">${html}</div>`;

    return this.overlay.firstElementChild as HTMLElement;
  }

  private showMenu(): void {
    const langs = Object.entries(LANGS)
      .map(([code, l]) => `<option value="${code}">${l.name}</option>`)
      .join('');
    const p = this.panel(`
      <h1>🐜 ${t('menu')}</h1>
      <p class="sub">${t('hintSupply')}</p>
      <div class="row"><label>${t('players')}</label><div class="seg" id="pc">
        ${[2, 3, 4].map((n) => `<button data-n="${n}" aria-pressed="${n === this.soloPlayers}">${n}</button>`).join('')}
      </div></div>
      <div class="row"><label>${t('difficulty')}</label><div class="seg" id="lv">
        ${(['easy', 'normal', 'hard'] as BotLevel[])
          .map((l) => `<button data-l="${l}" aria-pressed="${l === this.soloLevel}">${t(l)}</button>`)
          .join('')}
      </div></div>
      <div class="stack">
        <button class="primary" id="solo">${t('solo')}</button>
        <button id="online">${t('online')}</button>
      </div>
      <div class="row" style="margin-top:16px">
        <label>${t('language')}</label><select id="lang">${langs}</select>
        <button id="snd">${t('sound')}: ${soundOn() ? '🔊' : '🔇'}</button>
      </div>
      <div class="stack"><button id="close">${t('back')}</button></div>
    `);

    p.querySelector('#pc')!.addEventListener('click', (e) => {
      const n = (e.target as HTMLElement).dataset.n;
      if (!n) return;
      this.soloPlayers = +n;
      this.showMenu();
    });
    p.querySelector('#lv')!.addEventListener('click', (e) => {
      const l = (e.target as HTMLElement).dataset.l as BotLevel;
      if (!l) return;
      this.soloLevel = l;
      this.showMenu();
    });
    p.querySelector('#solo')!.addEventListener('click', () => this.startSolo());
    p.querySelector('#online')!.addEventListener('click', () => {
      this.screen = 'onlineMenu';
      this.ensureNet();
      this.render();
    });
    p.querySelector('#close')!.addEventListener('click', () => {
      this.screen = this.state?.over ? 'over' : 'game';
      if (this.screen === 'over') this.showOver(this.state!.winner);
      else this.hideOverlay();
    });
    const sel = p.querySelector('#lang') as HTMLSelectElement;
    sel.value = document.documentElement.lang;
    sel.addEventListener('change', () => {
      setLang(sel.value);
      this.drawLegend();
      this.showMenu();
    });
    p.querySelector('#snd')!.addEventListener('click', () => {
      setSound(!soundOn());
      this.showMenu();
    });
  }

  private showOnlineMenu(): void {
    const p = this.panel(`
      <h2>${t('online')}</h2>
      <p class="sub">${t('hintChew')}</p>
      <div class="row"><label>${t('players')}</label><div class="seg" id="slots">
        ${[2, 3, 4].map((n) => `<button data-n="${n}" aria-pressed="${n === this.wantSlots}">${n}</button>`).join('')}
      </div></div>
      <div class="row"><label>${t('bots')}</label>
        <button id="botToggle" aria-pressed="${this.wantBots}">${this.wantBots ? '✓' : '—'}</button>
      </div>
      <div class="stack">
        <button class="primary" id="create">${t('create')}</button>
        <input type="text" id="code" maxlength="6" placeholder="${t('code')}" autocomplete="off" />
        <button id="join">${t('join')}</button>
        <p class="err">${escapeHtml(this.netError)}</p>
        <button id="back">${t('back')}</button>
      </div>
    `);

    p.querySelector('#slots')!.addEventListener('click', (e) => {
      const n = (e.target as HTMLElement).dataset.n;
      if (!n) return;
      this.wantSlots = +n;
      this.showOnlineMenu();
    });
    p.querySelector('#botToggle')!.addEventListener('click', () => {
      this.wantBots = !this.wantBots;
      this.showOnlineMenu();
    });
    p.querySelector('#create')!.addEventListener('click', () => {
      this.netError = t('connecting');
      this.ensureNet().send({
        t: 'create',
        name: t('you'),
        slots: this.wantSlots,
        bots: this.wantBots ? this.wantSlots - 1 : 0,
      });
    });
    const code = p.querySelector('#code') as HTMLInputElement;
    p.querySelector('#join')!.addEventListener('click', () => {
      const value = code.value.trim().toUpperCase();
      if (value.length < 4) return;
      this.netError = t('connecting');
      this.ensureNet().send({ t: 'join', code: value, name: t('you') });
    });
    p.querySelector('#back')!.addEventListener('click', () => {
      this.screen = 'menu';
      this.render();
    });
  }

  private showLobby(): void {
    const list = this.roomPlayers
      .map(
        (r) => `<li><span class="dot" style="background:${playerColor(r.slot)}"></span>
          <span>${escapeHtml(r.bot ? t('bot') : r.name)}</span>
          ${r.slot === this.youId ? `<b style="margin-left:auto">${t('you')}</b>` : ''}</li>`,
      )
      .join('');
    const filled = this.roomPlayers.filter((r) => r.connected || r.bot).length;
    const p = this.panel(`
      <h2>${t('code')}</h2>
      <div class="code" id="code">${this.room}</div>
      <ul class="lobby-list">${list}</ul>
      <p class="sub">${filled}/${this.roomSlots} — ${t('waiting')}</p>
      <div class="stack">
        ${this.isHost ? `<button class="primary" id="start">${t('start')}</button>` : ''}
        <p class="err">${escapeHtml(this.netError)}</p>
        <button id="back">${t('back')}</button>
      </div>
    `);

    p.querySelector('#code')!.addEventListener('click', () => {
      navigator.clipboard?.writeText(this.room).then(
        () => this.say(t('copied')),
        () => undefined,
      );
    });
    p.querySelector('#start')?.addEventListener('click', () => this.net?.send({ t: 'ready' }));
    p.querySelector('#back')!.addEventListener('click', () => {
      this.net?.close();
      this.net = null;
      this.screen = 'menu';
      this.render();
    });
  }

  private showOver(winner: number): void {
    const title = winner === this.youId ? t('won') : winner === NEUTRAL ? t('draw') : t('lost');
    const p = this.panel(`
      <h1>${title}</h1>
      <p class="sub">${t('hintSupply')}</p>
      <div class="stack">
        <button class="primary" id="again">${t('again')}</button>
        <button id="menu">${t('menu')}</button>
      </div>
    `);
    p.querySelector('#again')!.addEventListener('click', () => this.startSolo());
    p.querySelector('#menu')!.addEventListener('click', () => {
      this.screen = 'menu';
      this.render();
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

const app = new App(document.getElementById('app')!);

// Development-only hook. The game is driven by pointer events on a canvas, so
// there is no DOM to assert against: a test bot needs a way to read the state
// it just poked. Stripped from production builds by the bundler.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__dbg = app;
}
