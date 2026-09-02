import './style.css';
import {
  applyCommand,
  Bot,
  BotLevel,
  Command,
  chewReadyIn,
  createGame,
  DT,
  GameState,
  goalProgress,
  judge,
  LevelDef,
  LEVELS,
  levelById,
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
import {
  bump,
  isUnlocked,
  playerName,
  progress,
  recordLevel,
  recordMatch,
  resetProgress,
  setPlayerName,
  unlockedUpTo,
} from './progress.js';

type Mode = 'solo' | 'online';
type Screen = 'game' | 'menu' | 'onlineMenu' | 'lobby' | 'over' | 'levels' | 'stats';

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
      severed: this.state?.severed,
      rivers: this.state?.rivers,
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
  /** Arrivals batched per node: one readable number beats a blizzard of +2s. */
  private deltas = new Map<number, { amount: number; hostile: boolean; by: number; at: number }>();

  private soloPlayers = 2;
  private soloLevel: BotLevel = 'normal';
  /** The campaign level being played, or null for a free skirmish. */
  private level: LevelDef | null = null;
  private startedAt = 0;
  private won = false;
  /** A bot match running behind the menu, purely as a living backdrop. */
  private demo = false;
  private wantSlots = 2;

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
    const fit = (): void => this.renderer.resize();
    window.addEventListener('resize', fit);
    // Rotating a phone fires this before the new size is settled on some
    // browsers, so re-fit once more on the next frame.
    window.addEventListener('orientationchange', () => {
      fit();
      requestAnimationFrame(fit);
    });
    window.addEventListener('pointerdown', () => unlock(), { once: true });
    this.renderer.resize();
    this.drawLegend();

    // The front door is the menu, with a bot match playing behind it so the
    // first thing anyone sees is the game itself in motion. `?play` skips
    // straight into a match -- that is the mode a portal build ships in, where
    // getting to gameplay in zero clicks is what they measure.
    if (new URLSearchParams(location.search).has('play')) {
      this.startSolo();
      setTimeout(() => this.say(t('hintLink')), 900);
    } else {
      this.startDemo();
    }
    this.watchVisibility();
    requestAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------------- game loop

  private frame = (now: number): void => {
    const dt = this.last ? Math.min(0.25, (now - this.last) / 1000) : 0;
    this.last = now;
    this.pump(dt);
    const now2 = performance.now();
    this.pending = this.pending.filter((p) => p.until > now2);
    this.flushDeltas();

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
    // Mode is asked first, and `demo` only after it. The other way round, a
    // demo flag left standing from the menu backdrop took over a real online
    // match: the local bots drove the board, the server's ticks were never
    // applied, and both players sat watching a game they could not touch.
    if (this.mode === 'online') {
      if (this.screen !== 'game' && this.screen !== 'over') return;
      this.advanceOnline(dt);

      return;
    }
    if (this.demo) {
      this.advanceSolo(dt);

      return;
    }
    if (this.screen !== 'game' && this.screen !== 'over') return;
    this.advanceSolo(dt);
    // Judged here rather than in the draw loop: a level has to be able to end
    // whether or not anybody is currently looking at it.
    this.checkGoal();
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
    if (!s) return;
    if (s.over && !this.demo) return;
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
        if (e.by === this.youId) {
          sfx.capture();
          bump('taken');
        } else if (e.lost === this.youId) {
          sfx.lost();
          bump('lost');
        }
      } else if (e.t === 'snap') {
        this.renderer.addEffect('snap', e.x, e.y, '#ffd98a');
        sfx.snap();
        if (e.by === this.youId) bump('cut');
        else if (s.trails.every((x) => x.id !== e.trail)) bump('wasCut');
      } else if (e.t === 'delta') {
        if (!e.hostile && e.by === this.youId) bump('delivered', Math.round(e.amount));
        const cur = this.deltas.get(e.node);
        if (cur && cur.hostile === e.hostile && cur.by === e.by) cur.amount += e.amount;
        else {
          if (cur) this.flushDelta(e.node, cur);
          this.deltas.set(e.node, { amount: e.amount, hostile: e.hostile, by: e.by, at: performance.now() });
        }
      } else if (e.t === 'clash') {
        this.renderer.addEffect('clash', e.x, e.y, '#ffffff');
        if (Math.random() < 0.25) sfx.clash();
      } else if (e.t === 'over') {
        if (this.demo) {
          this.startDemo(true);

          return;
        }
        if (this.mode === 'solo' && !this.level) recordMatch(e.winner === this.youId, s.tick / 20);
        this.finish(e.winner);
      }
    }
  }

  /** Batched arrivals become one floating number once the burst settles. */
  private flushDeltas(): void {
    const now = performance.now();
    for (const [node, d] of [...this.deltas]) {
      if (now - d.at < 450) continue;
      this.deltas.delete(node);
      this.flushDelta(node, d);
    }
  }

  private flushDelta(node: number, d: { amount: number; hostile: boolean; by: number }): void {
    const n = this.state?.nodes[node];
    if (!n) return;
    const value = Math.round(Math.abs(d.amount));
    if (value < 1) return;
    this.renderer.addFloat(
      n.x,
      n.y,
      (d.amount < 0 ? '\u2212' : '+') + value,
      d.hostile ? playerColor(d.by) : '#7fdc8a',
    );
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

  /**
   * Bots playing themselves behind the menu. Nobody is in control -- the input
   * layer is already inert while a panel is up -- so this is only scenery, and
   * it costs nothing that the game was not doing anyway.
   */
  private startDemo(keepScreen = false): void {
    this.level = null;
    this.demo = true;
    const seed = (Math.random() * 0xfffff) >>> 0;
    this.mode = 'solo';
    this.youId = 0;
    this.state = createGame(seed, 3);
    this.bots = this.state.players.map((p, i) => new Bot(i, 'normal', (seed + i * 7919) >>> 0));
    this.acc = 0;
    this.input.reset();
    // A backdrop match ending must not yank the player out of whatever screen
    // they were reading.
    if (!keepScreen) {
      this.screen = 'menu';
      this.render();
    }
  }

  private startSolo(): void {
    this.level = null;
    this.begin((Math.random() * 0xfffff) >>> 0, this.soloPlayers, this.soloLevel);
  }

  /** A campaign level: fixed seed, so the map is the same every time. */
  private startLevel(def: LevelDef): void {
    this.level = def;
    this.begin(def.seed, def.players, def.bot);
    this.say(this.goalText());
  }

  /**
   * Everything a match has to start from, whoever is driving it.
   *
   * It exists because the online path used to set only the half of this that
   * somebody remembered at the time, and the half it forgot included `demo`.
   * A match is a match: one place clears the board, and both ways in go
   * through it.
   *
   * `level` is deliberately not touched here -- who set it is the caller's
   * business, and startLevel sets it before calling.
   */
  private resetMatch(): void {
    this.demo = false;
    this.bots = [];
    this.queue = [];
    this.pending = [];
    this.won = false;
    this.startedAt = 0;
    this.acc = 0;
    this.screen = 'game';
    this.input.reset();
    this.hideOverlay();
  }

  private begin(seed: number, players: number, level: BotLevel): void {
    this.resetMatch();
    this.mode = 'solo';
    this.youId = 0;
    this.state = createGame(seed, players);
    for (let i = 1; i < players; i++) {
      this.bots.push(new Bot(i, level, (seed + i * 7919) >>> 0));
    }
  }

  /** The level's goal in one line, for the hint and the end screen. */
  private goalText(): string {
    const g = this.level?.goal;
    if (!g) return '';
    if (g.t === 'wipe') return t('goalWipe');
    if (g.t === 'homes') return t('goalHomes');

    return t('goalHold').replace('%n', String(g.nodes));
  }

  /**
   * A campaign level ends on its goal, not on annihilation. Half of even
   * matches never resolve by wiping somebody out -- cutting supply is meant to
   * be an answer to a stronger opponent -- so a level that asked for that could
   * simply hang.
   */
  private checkGoal(): void {
    const s = this.state;
    if (!s || !this.level || this.demo || this.screen !== 'game') return;
    const verdict = judge(s, this.level.goal, this.youId);
    if (verdict === 'playing') return;
    this.finishLevel(verdict === 'won');
  }

  private finishLevel(won: boolean): void {
    const s = this.state!;
    const seconds = s.tick / 20;
    this.won = won;
    if (won && this.level) recordLevel(this.level.id, seconds);
    recordMatch(won, seconds);
    this.input.reset();
    if (won) sfx.win();
    else sfx.lose();
    this.screen = 'over';
    this.showOver(won ? this.youId : NEUTRAL);
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
      this.resetMatch();
      this.mode = 'online';
      // A room has no campaign goal; only the server decides when it is over.
      this.level = null;
      this.state = msg.state;
      this.youId = msg.you;
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
        // In a room everybody has a name, including you: "You" against three
        // other people all called "You" tells nobody anything.
        const seat = this.roomPlayers.find((r) => r.slot === p.id);
        const name =
          this.mode === 'online'
            ? (seat?.bot ? t('bot') : seat?.name) ?? `#${p.id + 1}`
            : p.id === this.youId
              ? t('you')
              : t('bot');

        return `<div class="pip${p.alive ? '' : ' dead'}">
          <span class="dot" style="background:${playerColor(p.id)}"></span>
          <span>${escapeHtml(name)}</span>
          <b>${Math.round(strength[p.id])}</b>
        </div>`;
      })
      .join('');
    this.legend.hidden = false;
    // No clock and no trail counter: a match ends when someone has taken the
    // board, and the trail limit lives on each node as dots, where it can
    // actually be acted on.
    // Fullscreen matters most on a phone, where the browser chrome eats a
    // quarter of a board that is already small. iOS Safari has no such API, so
    // the button only appears where it would actually work.
    const canFull = !!document.documentElement.requestFullscreen;
    // The wait between bites belongs up here: it is invisible on the board, and
    // without it a held finger simply does nothing for no apparent reason.
    const wait = chewReadyIn(s, this.youId) / 20;
    const jaws = wait > 0 ? `<div class="pip urgent" title="${t('jaws')}">✂ ${wait.toFixed(1)}</div>` : '';
    const html =
      `<div class="pips">${pips}</div>` +
      jaws +
      `<button id="legendBtn" class="icon-btn" title="${t('legend')}">i</button>` +
      (canFull ? `<button id="fullBtn" class="icon-btn" title="${t('fullscreen')}">⛶</button>` : '') +
      `<button id="menuBtn">${t('menu')}</button>`;
    if (this.hud.innerHTML !== html) {
      this.hud.innerHTML = html;
      this.hud.querySelector('#menuBtn')!.addEventListener('click', () => {
        this.screen = 'menu';
        this.render();
      });
      this.hud.querySelector('#legendBtn')!.addEventListener('click', () => {
        this.legend.classList.toggle('open');
      });
      this.hud.querySelector('#fullBtn')?.addEventListener('click', () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen().catch(() => undefined);
      });
    }
  }

  private render(): void {
    if (this.screen === 'menu') this.showMenu();
    else if (this.screen === 'onlineMenu') this.showOnlineMenu();
    else if (this.screen === 'lobby') this.showLobby();
    else if (this.screen === 'levels') this.showLevels();
    else if (this.screen === 'stats') this.showStats();
  }

  /**
   * The campaign map. Locked levels are shown rather than hidden: seeing what
   * is ahead is most of why a progress screen is worth having.
   */
  private showLevels(): void {
    const p = progress();
    const next = unlockedUpTo();
    const cells = LEVELS.map((l) => {
      const done = p.levels[l.id]?.done;
      const open = isUnlocked(l.id);
      const mark = done ? '\u2713' : open ? String(l.id) : '\u{1F512}';
      const cls = done ? 'lvl done' : open ? 'lvl open' : 'lvl';

      return `<button class="${cls}" data-id="${l.id}"${open ? '' : ' disabled'}>${mark}</button>`;
    }).join('');
    const cur = levelById(next);
    const panel = this.panel(`
      <h2>${t('campaign')}</h2>
      <p class="sub">${cur ? this.describe(cur) : t('campaignDone')}</p>
      <div class="levels">${cells}</div>
      <div class="stack">
        <button class="primary" id="play">${t('level')} ${next}</button>
        <button id="back">${t('back')}</button>
      </div>
    `);
    panel.querySelector('.levels')!.addEventListener('click', (e) => {
      const id = Number((e.target as HTMLElement).dataset.id);
      const def = levelById(id);
      if (def && isUnlocked(id)) this.startLevel(def);
    });
    panel.querySelector('#play')!.addEventListener('click', () => {
      const def = levelById(next);
      if (def) this.startLevel(def);
    });
    panel.querySelector('#back')!.addEventListener('click', () => {
      this.screen = 'menu';
      this.render();
    });
  }

  /** One line saying what this level asks and who is on it. */
  private describe(l: LevelDef): string {
    const goal =
      l.goal.t === 'wipe'
        ? t('goalWipe')
        : l.goal.t === 'homes'
          ? t('goalHomes')
          : t('goalHold').replace('%n', String(l.goal.nodes));

    return `${t('level')} ${l.id} \u00b7 ${l.players} \u00b7 ${t(l.bot)} \u2014 ${goal}`;
  }

  private showStats(): void {
    const st = progress().stats;
    const done = LEVELS.filter((l) => progress().levels[l.id]?.done).length;
    const rate = st.played ? Math.round((st.won / st.played) * 100) : 0;
    const mins = Math.round(st.seconds / 60);
    const rows: [string, string][] = [
      [t('statMatches'), String(st.played)],
      [t('statWins'), `${st.won} (${rate}%)`],
      [t('statStreak'), String(st.bestStreak)],
      [t('statLevels'), `${done} / ${LEVELS.length}`],
      [t('statTaken'), String(st.taken)],
      [t('statLostNodes'), String(st.lost)],
      [t('statCut'), String(st.cut)],
      [t('statDelivered'), String(st.delivered)],
      [t('statTime'), `${mins} ${t('minutes')}`],
    ];
    const panel = this.panel(`
      <h2>${t('stats')}</h2>
      <ul class="stats">${rows
        .map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`)
        .join('')}</ul>
      <div class="stack">
        <button id="reset">${t('resetStats')}</button>
        <button id="back">${t('back')}</button>
      </div>
    `);
    panel.querySelector('#reset')!.addEventListener('click', () => {
      resetProgress();
      this.showStats();
    });
    panel.querySelector('#back')!.addEventListener('click', () => {
      this.screen = 'menu';
      this.render();
    });
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
      <h1>🐜 ${t('title')}</h1>
      <p class="sub">${t('tagline')}</p>
      <div class="row"><label>${t('players')}</label><div class="seg" id="pc">
        ${[2, 3, 4].map((n) => `<button data-n="${n}" aria-pressed="${n === this.soloPlayers}">${n}</button>`).join('')}
      </div></div>
      <div class="row"><label>${t('difficulty')}</label><div class="seg" id="lv">
        ${(['easy', 'normal', 'hard'] as BotLevel[])
          .map((l) => `<button data-l="${l}" aria-pressed="${l === this.soloLevel}">${t(l)}</button>`)
          .join('')}
      </div></div>
      <div class="stack">
        <button class="primary" id="campaign">${t('campaign')}</button>
        <button id="solo">${t('solo')}</button>
        <button id="online">${t('online')}</button>
        <button id="stats">${t('stats')}</button>
      </div>
      <div class="row" style="margin-top:16px">
        <label>${t('language')}</label><select id="lang">${langs}</select>
        <button id="snd">${t('sound')}: ${soundOn() ? '🔊' : '🔇'}</button>
      </div>
      <div class="stack">${
        // On the front door there is nothing to go back to, so the way out
        // leads to the shelf instead.
        this.demo
          ? `<a class="quit" href="/">${t('allGames')}</a>`
          : `<button id="close">${t('back')}</button>`
      }</div>
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
    p.querySelector('#campaign')!.addEventListener('click', () => {
      this.screen = 'levels';
      this.render();
    });
    p.querySelector('#stats')!.addEventListener('click', () => {
      this.screen = 'stats';
      this.render();
    });
    p.querySelector('#solo')!.addEventListener('click', () => this.startSolo());
    p.querySelector('#online')!.addEventListener('click', () => {
      this.screen = 'onlineMenu';
      this.ensureNet();
      this.render();
    });
    p.querySelector('#close')?.addEventListener('click', () => {
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
      <div class="row"><label>${t('yourName')}</label>
        <input type="text" id="nick" maxlength="16" class="nick"
               placeholder="${t('yourName')}" value="${escapeHtml(playerName())}"
               autocomplete="nickname" />
      </div>
      <div class="row"><label>${t('players')}</label><div class="seg" id="slots">
        ${[2, 3, 4].map((n) => `<button data-n="${n}" aria-pressed="${n === this.wantSlots}">${n}</button>`).join('')}
      </div></div>
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
    p.querySelector('#create')!.addEventListener('click', () => {
      this.netError = t('connecting');
      // Created empty on purpose: bots are added afterwards, from the lobby,
      // so the seats stay open for the people the room was made for.
      this.ensureNet().send({ t: 'create', name: this.nick(p), slots: this.wantSlots });
    });
    const code = p.querySelector('#code') as HTMLInputElement;
    p.querySelector('#join')!.addEventListener('click', () => {
      const value = code.value.trim().toUpperCase();
      if (value.length < 4) return;
      this.netError = t('connecting');
      this.ensureNet().send({ t: 'join', code: value, name: this.nick(p) });
    });
    p.querySelector('#back')!.addEventListener('click', () => {
      this.screen = 'menu';
      this.render();
    });
  }

  /** Whatever is typed in the name box, remembered for next time. */
  private nick(panel: HTMLElement): string {
    const field = panel.querySelector('#nick') as HTMLInputElement | null;
    const name = (field?.value ?? '').trim();
    if (name) setPlayerName(name);

    // Empty stays empty: the server numbers an unnamed seat "#2". Sending the
    // word "You" instead made everybody who had not typed a name literally
    // called "You" -- on the other player's screen as well as their own, which
    // is the one thing a name in a room has to avoid.
    return name;
  }

  private showLobby(): void {
    const list = this.roomPlayers
      .map((r) => {
        const label = r.connected ? escapeHtml(r.name) : r.bot ? t('bot') : t('openSeat');
        const isYou = r.slot === this.youId;
        // Only the host may seat a bot, and only on a seat nobody is sitting in.
        const action =
          this.isHost && !r.connected
            ? `<button class="seat" data-slot="${r.slot}" data-on="${r.bot ? '0' : '1'}">${
                r.bot ? '\u00d7' : '+ ' + t('bot')
              }</button>`
            : isYou
              ? `<b>${t('you')}</b>`
              : '';

        return `<li><span class="dot" style="background:${playerColor(r.slot)}"></span>
          <span${r.connected || r.bot ? '' : ' style="opacity:.55"'}>${label}</span>
          <span style="margin-left:auto">${action}</span></li>`;
      })
      .join('');
    const open = this.roomPlayers.filter((r) => !r.connected && !r.bot).length;
    const p = this.panel(`
      <h2>${t('code')}</h2>
      <div class="code" id="code">${this.room}</div>
      <p class="sub">${t('shareCode')}</p>
      <ul class="lobby-list">${list}</ul>
      <p class="sub">${open > 0 ? t('waiting') : t('allSeated')}</p>
      <div class="stack">
        ${this.isHost ? `<button class="primary" id="start">${t('start')}</button>` : ''}
        <p class="err">${escapeHtml(this.netError)}</p>
        <button id="back">${t('back')}</button>
      </div>
    `);

    for (const btn of p.querySelectorAll('.seat')) {
      btn.addEventListener('click', () => {
        const el = btn as HTMLElement;
        this.net?.send({ t: 'bot', slot: Number(el.dataset.slot), on: el.dataset.on === '1' });
      });
    }
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
    const level = this.level;
    const beatIt = level && this.won;
    const title = beatIt
      ? t('won')
      : level
        ? t('lost')
        : winner === this.youId
          ? t('won')
          : winner === NEUTRAL
            ? t('draw')
            : t('lost');
    const s = this.state;
    const rows = (s?.players ?? [])
      .map((pl) => {
        const own = s!.nodes.filter((n) => n.owner === pl.id);
        const name = pl.id === this.youId ? t('you') : this.mode === 'solo' ? t('bot')
          : (this.roomPlayers.find((r) => r.slot === pl.id)?.name ?? `#${pl.id + 1}`);

        return {
          nodes: own.length,
          ants: Math.round(own.reduce((a, n) => a + n.count, 0)),
          html: (win: boolean) => `<li><span class="dot" style="background:${playerColor(pl.id)}"></span>
            <span>${escapeHtml(name)}</span>
            <b style="margin-left:auto">${own.length}</b>
            <span style="opacity:.6">${Math.round(own.reduce((a, n) => a + n.count, 0))}</span>
            ${win ? ' \u25c0' : ''}</li>`,
        };
      })
      .sort((a, b) => b.nodes - a.nodes || b.ants - a.ants);
    const table = `<div class="row" style="gap:0;justify-content:flex-end;color:var(--muted);font-size:12px">
        <span style="margin-right:14px">${t('nodesLabel')}</span><span>${t('antsLabel')}</span></div>
      <ul class="lobby-list">${rows.map((r, i) => r.html(i === 0 && winner !== NEUTRAL)).join('')}</ul>`;
    const p = this.panel(`
      <h1>${title}</h1>
      <p class="sub">${level ? escapeHtml(this.goalText()) : t('hintSupply')}</p>
      ${table}
      <div class="stack">
        ${beatIt && levelById(level!.id + 1) ? `<button class="primary" id="next">${t('nextLevel')}</button>` : ''}
        <button class="${beatIt ? '' : 'primary'}" id="again">${level ? t('retry') : t('again')}</button>
        <button id="menu">${t('menu')}</button>
      </div>
    `);
    p.querySelector('#next')?.addEventListener('click', () => {
      const nxt = levelById(level!.id + 1);
      if (nxt) this.startLevel(nxt);
    });
    p.querySelector('#again')!.addEventListener('click', () => {
      if (level) this.startLevel(level);
      else this.startSolo();
    });
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
