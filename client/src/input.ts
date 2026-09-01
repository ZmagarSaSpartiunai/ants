import { canLink, Command, GameState, KINDS, LINK_RANGE, NEUTRAL } from '@ants/shared';
import { DragPreview, Renderer } from './render.js';

/** Fingers are wide: node hits get a generous margin, trails a fat corridor. */
const NODE_MARGIN = 14;
const TRAIL_MARGIN = 16;

export interface InputHost {
  state(): GameState | null;
  you(): number;
  send(cmd: Command): void;
  hint(key: string): void;
}

export class Input {
  drag: DragPreview | null = null;
  private pointer = -1;
  private chewing = false;
  private downTrail = -1;
  private moved = false;

  constructor(
    private readonly r: Renderer,
    private readonly host: InputHost,
  ) {
    const c = r.canvas;
    c.addEventListener('pointerdown', this.onDown);
    c.addEventListener('pointermove', this.onMove);
    c.addEventListener('pointerup', this.onUp);
    c.addEventListener('pointercancel', this.onUp);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onDown = (e: PointerEvent): void => {
    const s = this.host.state();
    if (!s || s.over || this.pointer !== -1) return;
    e.preventDefault();
    this.r.canvas.setPointerCapture(e.pointerId);
    this.pointer = e.pointerId;
    this.moved = false;

    const w = this.r.toWorld(e.clientX, e.clientY);
    const node = hitNode(s, w.x, w.y);
    if (node && node.owner === this.host.you()) {
      this.drag = { fromNode: node.id, x: w.x, y: w.y, valid: false };

      return;
    }

    const trail = hitTrail(s, w.x, w.y);
    if (!trail) return;
    this.downTrail = trail.id;
    if (trail.owner !== this.host.you() && !trail.air) {
      // Gnawing starts on touch and lasts exactly as long as the finger stays.
      this.chewing = true;
      this.host.send({ t: 'chew', p: this.host.you(), trail: trail.id });
    }
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointer) return;
    const s = this.host.state();
    if (!s) return;
    const w = this.r.toWorld(e.clientX, e.clientY);
    this.moved = true;
    if (!this.drag) return;
    const target = hitNode(s, w.x, w.y);
    this.drag.x = w.x;
    this.drag.y = w.y;
    this.drag.valid = !!target && canLink(s, this.host.you(), this.drag.fromNode, target.id);
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointer) return;
    this.pointer = -1;
    const s = this.host.state();

    if (this.chewing) {
      this.chewing = false;
      this.downTrail = -1;
      this.host.send({ t: 'chew', p: this.host.you(), trail: -1 });

      return;
    }

    if (this.downTrail !== -1 && !this.moved && s) {
      // A tap on your own trail retires it; enemy trails are handled by chewing.
      const t = s.trails.find((x) => x.id === this.downTrail);
      if (t && t.owner === this.host.you()) {
        this.host.send({ t: 'unlink', p: this.host.you(), trail: t.id });
      }
      this.downTrail = -1;

      return;
    }
    this.downTrail = -1;

    const drag = this.drag;
    this.drag = null;
    if (!drag || !s) return;
    const w = this.r.toWorld(e.clientX, e.clientY);
    const target = hitNode(s, w.x, w.y);
    if (!target || target.id === drag.fromNode) return;
    if (canLink(s, this.host.you(), drag.fromNode, target.id)) {
      this.host.send({ t: 'link', p: this.host.you(), from: drag.fromNode, to: target.id });

      return;
    }
    // Say why nothing happened; silence reads as a broken control.
    const me = s.players[this.host.you()];
    if (me && me.chewing !== -1) this.host.hint('hintChew');
    else if (s.nodes[drag.fromNode].kind !== 'hive' && farther(s, drag.fromNode, target.id)) {
      this.host.hint('hintLink');
    }
  };

  /** Called when a match ends or restarts so a held finger cannot leak state. */
  reset(): void {
    this.drag = null;
    this.pointer = -1;
    this.chewing = false;
    this.downTrail = -1;
  }
}

function farther(s: GameState, from: number, to: number): boolean {
  const a = s.nodes[from];
  const b = s.nodes[to];

  return Math.hypot(b.x - a.x, b.y - a.y) > LINK_RANGE;
}

export function hitNode(s: GameState, x: number, y: number) {
  let best: (typeof s.nodes)[number] | null = null;
  let bestD = Infinity;
  for (const n of s.nodes) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d < KINDS[n.kind].radius + NODE_MARGIN && d < bestD) {
      best = n;
      bestD = d;
    }
  }

  return best;
}

export function hitTrail(s: GameState, x: number, y: number) {
  let best: (typeof s.trails)[number] | null = null;
  let bestD = Infinity;
  for (const t of s.trails) {
    const a = s.nodes[t.from];
    const b = s.nodes[t.to];
    if (!a || !b) continue;
    const d = pointToSegment(x, y, a.x, a.y, b.x, b.y);
    if (d < TRAIL_MARGIN && d < bestD) {
      best = t;
      bestD = d;
    }
  }

  return best;
}

function pointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));

  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export { NEUTRAL };
