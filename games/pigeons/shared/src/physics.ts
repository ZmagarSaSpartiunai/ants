import { FOODS } from './food.js';
import {
  FIELD_W,
  GRAVITY,
  GROUND_Y,
  Prop,
  SHOT_DT,
  SHOT_MAX_T,
  Shot,
  THROW_SPEED,
  WIND_FORCE,
} from './types.js';

export interface Point {
  x: number;
  y: number;
}

/** Why a shot stopped. The client draws a different splat for each. */
export type Landing = 'prop' | 'ground' | 'away' | 'spent';

export interface Flight {
  /** Every integrated position, so the client can draw the arc it really flew. */
  points: Point[];
  end: Point;
  /** Which prop stopped it, if any. */
  hitProp: number | null;
  bounced: number;
  landing: Landing;
}

/**
 * @param prop the prop to test
 * @param p the point to test against it
 * @return whether the point is inside the prop's box
 */
function inside(prop: Prop, p: Point): boolean {
  return p.x >= prop.x && p.x <= prop.x + prop.w && p.y >= prop.y && p.y <= prop.y + prop.h;
}

/**
 * Flies one shot to wherever it stops.
 *
 * Pure: the same arguments always give the same flight, on any machine. That is
 * what lets a whole round travel as a few dozen bytes and still look identical
 * on four phones.
 *
 * @param from where the bird stands
 * @param shot what it threw and how
 * @param props the props that may stop it
 * @param wind -1..1, from windFor()
 * @return the whole flight
 */
export function flyShot(from: Point, shot: Shot, props: Prop[], wind: number): Flight {
  const food = FOODS[shot.food];
  const speed = THROW_SPEED * food.speed * Math.max(0, Math.min(1, shot.power));
  let x = from.x;
  let y = from.y;
  let vx = Math.cos(shot.angle) * speed;
  let vy = Math.sin(shot.angle) * speed;
  const points: Point[] = [{ x, y }];
  let bounced = 0;
  let hitProp: number | null = null;
  let landing: Landing = 'spent';

  for (let t = 0; t < SHOT_MAX_T; t += SHOT_DT) {
    vx += wind * food.drag * WIND_FORCE * SHOT_DT;
    vy += GRAVITY * SHOT_DT;
    x += vx * SHOT_DT;
    y += vy * SHOT_DT;
    points.push({ x, y });

    const struck = props.find((p) => p.intact && inside(p, { x, y }));
    if (struck) {
      if (bounced < food.bounces) {
        // Reflect off the face it came through and lose some speed to it, so a
        // bounce reaches behind cover without flying for ever.
        bounced++;
        vy = -Math.abs(vy) * 0.62;
        vx *= 0.82;
        y += vy * SHOT_DT;
        continue;
      }
      hitProp = struck.id;
      landing = 'prop';
      break;
    }
    if (y >= GROUND_Y) {
      landing = 'ground';
      break;
    }
    if (x < -80 || x > FIELD_W + 80) {
      landing = 'away';
      break;
    }
  }

  return { points, end: { x, y }, hitProp, bounced, landing };
}
