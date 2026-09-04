import { Picture, PICTURES } from '@colour/shared';

/**
 * The shapes, which is to say the drawing.
 *
 * Each part is a closed path in a 700x520 field. They are built as paths and
 * not painted directly so the same shape can be filled, outlined and hit
 * tested -- a tap has to land in exactly the area the child can see.
 *
 * Parts are listed back to front: a tap is tested from the front backwards, so
 * a bow drawn over a head is found before the head under it.
 */

export const W = 700;
export const H = 520;

/** Builds one closed part. */
export type Shape = (p: Path2D) => void;

/** The fixed line art on top: eyes, whiskers, the things nobody colours in. */
export type Details = (ctx: CanvasRenderingContext2D) => void;

export interface Art {
  parts: Record<string, Shape>;
  details: Details;
}

const TAU = Math.PI * 2;

function petal(p: Path2D, cx: number, cy: number, angle: number, len: number, wide: number): void {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy;
  const ny = dx;
  p.moveTo(cx + dx * 22, cy + dy * 22);
  p.quadraticCurveTo(cx + dx * len * 0.55 + nx * wide, cy + dy * len * 0.55 + ny * wide, cx + dx * len, cy + dy * len);
  p.quadraticCurveTo(cx + dx * len * 0.55 - nx * wide, cy + dy * len * 0.55 - ny * wide, cx + dx * 22, cy + dy * 22);
  p.closePath();
}

const CAT: Art = {
  parts: {
    хвіст: (p) => {
      p.moveTo(470, 400);
      p.quadraticCurveTo(610, 400, 590, 280);
      p.quadraticCurveTo(586, 250, 556, 252);
      p.quadraticCurveTo(534, 256, 542, 292);
      p.quadraticCurveTo(556, 366, 470, 356);
      p.closePath();
    },
    вушка: (p) => {
      p.moveTo(268, 150);
      p.lineTo(238, 62);
      p.lineTo(322, 112);
      p.closePath();
      p.moveTo(432, 150);
      p.lineTo(462, 62);
      p.lineTo(378, 112);
      p.closePath();
    },
    тіло: (p) => {
      p.ellipse(350, 356, 132, 108, 0, 0, TAU);
    },
    лапки: (p) => {
      // Each shape starts its own subpath. Without the moveTo, a second arc
      // continues the first and the two paws end up joined by a straight line.
      p.moveTo(318, 448);
      p.ellipse(272, 448, 46, 26, 0, 0, TAU);
      p.moveTo(474, 448);
      p.ellipse(428, 448, 46, 26, 0, 0, TAU);
    },
    голова: (p) => {
      p.ellipse(350, 176, 116, 100, 0, 0, TAU);
    },
    бантик: (p) => {
      p.moveTo(350, 268);
      p.quadraticCurveTo(290, 232, 288, 282);
      p.quadraticCurveTo(292, 320, 350, 292);
      p.quadraticCurveTo(408, 320, 412, 282);
      p.quadraticCurveTo(410, 232, 350, 268);
      p.closePath();
    },
  },
  details: (ctx) => {
    ctx.fillStyle = '#2f2822';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(350 + sx * 44, 162, 13, 16, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(350 + sx * 44 - 5, 155, 4.5, 0, TAU);
      ctx.fill();
    }
    // Nose and mouth.
    ctx.fillStyle = '#e8899a';
    ctx.beginPath();
    ctx.moveTo(336, 208);
    ctx.lineTo(364, 208);
    ctx.lineTo(350, 224);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#2f2822';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(350, 224);
    ctx.lineTo(350, 236);
    ctx.moveTo(350, 236);
    ctx.quadraticCurveTo(330, 250, 318, 234);
    ctx.moveTo(350, 236);
    ctx.quadraticCurveTo(370, 250, 382, 234);
    ctx.stroke();
    // Whiskers.
    ctx.lineWidth = 3.4;
    for (const sx of [-1, 1]) {
      for (const dy of [-10, 2, 14]) {
        ctx.beginPath();
        ctx.moveTo(350 + sx * 40, 220 + dy * 0.5);
        ctx.quadraticCurveTo(350 + sx * 90, 214 + dy, 350 + sx * 128, 208 + dy * 1.4);
        ctx.stroke();
      }
    }
  },
};

const HOUSE: Art = {
  parts: {
    сонце: (p) => {
      p.arc(596, 96, 56, 0, TAU);
    },
    трава: (p) => {
      p.moveTo(0, 440);
      p.quadraticCurveTo(180, 414, 350, 434);
      p.quadraticCurveTo(530, 454, 700, 428);
      p.lineTo(700, 520);
      p.lineTo(0, 520);
      p.closePath();
    },
    стіни: (p) => {
      p.rect(150, 240, 340, 202);
    },
    дах: (p) => {
      p.moveTo(118, 246);
      p.lineTo(320, 108);
      p.lineTo(522, 246);
      p.closePath();
    },
    труба: (p) => {
      p.rect(414, 128, 46, 78);
    },
    двері: (p) => {
      p.moveTo(268, 442);
      p.lineTo(268, 356);
      p.quadraticCurveTo(320, 322, 372, 356);
      p.lineTo(372, 442);
      p.closePath();
    },
    вікно: (p) => {
      p.rect(180, 282, 78, 78);
      p.rect(382, 282, 78, 78);
    },
  },
  details: (ctx) => {
    ctx.strokeStyle = '#2f2822';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    // Window bars.
    for (const x of [180, 382]) {
      ctx.beginPath();
      ctx.moveTo(x + 39, 282);
      ctx.lineTo(x + 39, 360);
      ctx.moveTo(x, 321);
      ctx.lineTo(x + 78, 321);
      ctx.stroke();
    }
    // Door handle.
    ctx.beginPath();
    ctx.arc(354, 402, 7, 0, TAU);
    ctx.stroke();
    // Sun rays.
    ctx.lineWidth = 6;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.beginPath();
      ctx.moveTo(596 + Math.cos(a) * 66, 96 + Math.sin(a) * 66);
      ctx.lineTo(596 + Math.cos(a) * 88, 96 + Math.sin(a) * 88);
      ctx.stroke();
    }
  },
};

const FLOWER: Art = {
  parts: {
    стебло: (p) => {
      p.moveTo(334, 252);
      p.quadraticCurveTo(322, 340, 340, 416);
      p.lineTo(370, 416);
      p.quadraticCurveTo(354, 340, 366, 252);
      p.closePath();
    },
    листочки: (p) => {
      p.moveTo(340, 310);
      p.quadraticCurveTo(240, 262, 214, 318);
      p.quadraticCurveTo(258, 366, 340, 330);
      p.closePath();
      p.moveTo(364, 350);
      p.quadraticCurveTo(464, 306, 490, 360);
      p.quadraticCurveTo(444, 404, 364, 370);
      p.closePath();
    },
    пелюстки: (p) => {
      for (let i = 0; i < 7; i++) petal(p, 350, 168, (i / 7) * TAU - Math.PI / 2, 128, 52);
    },
    серединка: (p) => {
      p.arc(350, 168, 46, 0, TAU);
    },
    горщик: (p) => {
      p.moveTo(258, 410);
      p.lineTo(442, 410);
      p.lineTo(414, 502);
      p.lineTo(286, 502);
      p.closePath();
    },
  },
  details: (ctx) => {
    ctx.fillStyle = '#2f2822';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(350 + sx * 16, 160, 6.5, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = '#2f2822';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(350, 176, 16, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(258, 428);
    ctx.lineTo(442, 428);
    ctx.stroke();
  },
};

const FISH: Art = {
  parts: {
    водорості: (p) => {
      for (const x of [96, 150, 604, 650]) {
        p.moveTo(x - 16, 520);
        p.quadraticCurveTo(x - 40, 420, x - 4, 336);
        p.quadraticCurveTo(x + 30, 420, x + 16, 520);
        p.closePath();
      }
    },
    хвіст: (p) => {
      p.moveTo(474, 268);
      p.quadraticCurveTo(576, 178, 610, 214);
      p.quadraticCurveTo(596, 268, 610, 322);
      p.quadraticCurveTo(576, 358, 474, 268);
      p.closePath();
    },
    тіло: (p) => {
      p.ellipse(320, 268, 172, 116, 0, 0, TAU);
    },
    плавець: (p) => {
      p.moveTo(300, 156);
      p.quadraticCurveTo(340, 78, 396, 116);
      p.quadraticCurveTo(390, 150, 380, 172);
      p.closePath();
      p.moveTo(300, 380);
      p.quadraticCurveTo(340, 454, 396, 418);
      p.quadraticCurveTo(390, 386, 380, 364);
      p.closePath();
    },
    бульбашки: (p) => {
      for (const [x, y, r] of [[178, 128, 26], [124, 74, 17], [214, 58, 12]] as [number, number, number][]) {
        p.moveTo(x + r, y);
        p.arc(x, y, r, 0, TAU);
      }
    },
  },
  details: (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(224, 236, 27, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#2f2822';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = '#2f2822';
    ctx.beginPath();
    ctx.arc(217, 238, 13, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(212, 232, 4.5, 0, TAU);
    ctx.fill();
    // Smile and gills.
    ctx.strokeStyle = '#2f2822';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(190, 296, 30, -0.4, 1.1);
    ctx.moveTo(294, 210);
    ctx.quadraticCurveTo(272, 268, 294, 326);
    ctx.stroke();
  },
};

const ART: Record<string, Art> = { cat: CAT, house: HOUSE, flower: FLOWER, fish: FISH };

/**
 * @param picture which picture
 * @return its shapes, checked against what the catalogue says it has
 */
export function artFor(picture: Picture): Art {
  const art = ART[picture.id];
  if (!art) throw new Error(`no drawing for ${picture.id}`);
  // The catalogue and the drawing are written in different files and can drift
  // apart. A part named but never drawn is one a child can never colour, and
  // the picture could then never be finished.
  for (const region of picture.regions) {
    if (!art.parts[region]) throw new Error(`${picture.id}: nothing drawn for "${region}"`);
  }
  for (const drawn of Object.keys(art.parts)) {
    if (!picture.regions.includes(drawn)) throw new Error(`${picture.id}: "${drawn}" is drawn but not listed`);
  }

  return art;
}

/** Every picture, checked at start-up rather than when a child taps it. */
export function checkAll(): void {
  for (const picture of PICTURES) artFor(picture);
}
