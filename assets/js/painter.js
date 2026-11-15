// The painter: turns a scene into brushstrokes and lays them down over time.
//
// A painting starts loose and tightens: a thin sketch, broad blocks of colour
// taken from a blurred reference, then smaller and smaller strokes placed
// where the reference has detail, with hand-placed accents in between. It is
// never declared finished: once the planned strokes are down the painter keeps
// retouching, a little more slowly as time goes on. Asked to start afresh over
// a picture, it first brushes that one off.

import { makeRng, clamp, vary, css } from './util.js';
import { W, H, RS, idAt } from './sheet.js';
import { drawStroke } from './brush.js';

const HALF = Math.PI / 2;

// Passes over the reference, coarse to fine. start/end are in seconds.
// keep = chance a grid cell gets a stroke; with gain, that chance instead
// follows how much the reference differs from its blurred self at that point.
const LAYERS = [
  { step: 30, w: 34, len: 76, alpha: 0.95, soft: true, start: 0.5, end: 1.9, wander: 1 },
  { step: 13.5, w: 14, len: 34, alpha: 0.9, keep: 0.92, start: 1.8, end: 4.4, wander: 1 },
  { step: 7.5, w: 6.5, len: 16, alpha: 0.92, base: 0.2, gain: 5, edges: true, start: 4.2, end: 7.2, wander: 0.9 },
  { step: 4.4, w: 3.2, len: 9, alpha: 0.94, base: 0, gain: 6, bias: 0.06, edges: true, guarded: true, start: 7.4, end: 16, wander: 0.8 }
];
const TOUCH = { w: 2.6, len: 7.5, alpha: 0.94, base: 0.02, gain: 6, bias: 0.05, edges: true, guarded: true, wander: 0.8 };

// When each group of hand-placed accents goes on.
const PHASES = {
  sketch: [0, 0.8], structure: [7, 9.6], front: [8.4, 10.6], foliage: [9, 11.5], water: [10.5, 13],
  figures: [11.5, 14], lights: [12.5, 14.5], weather: [13, 15.5], sign: [15.5, 16.2]
};
const ORDERED = { sketch: true, structure: true, sign: true };                 // painted in the order they were listed
const GUARDED = { structure: true, figures: true, lights: true, sign: true };  // fine strokes keep off these
const RETOUCHED = { structure: true, foliage: true, water: true, figures: true, lights: true, sign: true };
export const SETTLE = 16.5;      // seconds until the planned strokes are down
const WIPE = 1.7;                // seconds spent brushing an old picture off
const GROUND = [0.851, 0.8, 0.69];      // toned canvas
const CELL = 6;

function shuffle(list, R) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1)), t = list[i];
    list[i] = list[j]; list[j] = t;
  }
}

// Brushing a picture off: broad strokes of bare ground swept back and forth
// down the canvas, once thinly and once to finish. They are timed to end as
// the clock reaches 0, when the new picture's sketch begins.
function brushOff(view, R) {
  const list = [], rows = 12, gap = (H + 60) / rows, n = Math.ceil((view.w + 160) / 150);
  for (let pass = 0; pass < 2; pass++) {
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n, across = (r + pass) % 2 ? 1 - f : f;      // each row goes back the way the last one came
        list.push({
          x: view.x - 80 + (view.w + 160) * across + R.range(-20, 20), y: -30 + (r + 0.5) * gap + R.range(-12, 12),
          a: R.gauss() * 0.07 + (pass ? 0.05 : -0.05), len: R.range(210, 280), w: gap * R.range(1.35, 1.7),
          col: vary(GROUND, R, 0.012, 0.004, 0.006), alpha: pass ? 1.25 : 0.82, bend: R.range(-0.05, 0.05), seed: R.seed(),
          t: -WIPE + (WIPE - 0.15) * (pass * 0.4 + 0.6 * (r + f) / rows)
        });
      }
    }
  }
  return list;
}

function makeProbe(scene) {
  const rw = scene.rw, rh = scene.rh, rd = scene.refData, bw = scene.bw, bh = scene.bh, bd = scene.blurData, ids = scene.idData, regions = scene.regions;
  const fx = bw / W, fy = bh / H;
  const lum = (ix, iy) => { const i = (iy * rw + ix) * 4; return (0.3 * rd[i] + 0.59 * rd[i + 1] + 0.11 * rd[i + 2]) / 255; };
  const at = (x, y) => (clamp((y * RS) | 0, 0, rh - 1) * rw + clamp((x * RS) | 0, 0, rw - 1)) * 4;
  return {
    color(x, y, out) { const i = at(x, y); out[0] = rd[i] / 255; out[1] = rd[i + 1] / 255; out[2] = rd[i + 2] / 255; },
    soft(x, y, out) {
      const i = (clamp((y * fy) | 0, 0, bh - 1) * bw + clamp((x * fx) | 0, 0, bw - 1)) * 4;
      out[0] = bd[i] / 255; out[1] = bd[i + 1] / 255; out[2] = bd[i + 2] / 255;
    },
    region(x, y) { return regions[idAt(ids, at(x, y))] || regions[0]; },      // how the surface here likes to be brushed
    // Direction along the nearest edge in the reference, or null on flat ground.
    edge(x, y) {
      const ix = clamp(Math.round(x * RS), 1, rw - 2), iy = clamp(Math.round(y * RS), 1, rh - 2);
      const gx = lum(ix + 1, iy) - lum(ix - 1, iy), gy = lum(ix, iy + 1) - lum(ix, iy - 1);
      return Math.hypot(gx, gy) > 0.05 ? Math.atan2(gy, gx) + HALF : null;
    }
  };
}

const col = [0, 0, 0], soft = [0, 0, 0];

// One stroke of layer L at (x, y), or null if this spot is left alone.
function strokeAt(L, x, y, R, probe, guard, hush) {
  const reg = probe.region(x, y);
  let sx = x;
  if (reg.ripple) sx += reg.ripple(x, y);
  probe.color(sx, y, col);
  if (L.gain || L.soft) probe.soft(sx, y, soft);
  let keep = L.keep === undefined ? 1 : L.keep;
  if (L.gain) {
    const d = Math.abs(col[0] - soft[0]) + Math.abs(col[1] - soft[1]) + Math.abs(col[2] - soft[2]);
    keep = clamp(L.base + (d - (L.bias || 0)) * L.gain, 0, 1) * (reg.calm || 1);
  }
  if (R() > keep) return null;
  if (L.guarded && guard(x, y)) return null;
  let a = null;
  if (L.edges && !reg.ripple && !reg.loose && R() < 0.8) a = probe.edge(x, y);
  if (a === null) {
    a = reg.alt !== undefined && R() < reg.altP ? reg.alt : reg.angle(x, y);
    a += R.gauss() * reg.jit;
  } else {
    a += R.gauss() * 0.12;
  }
  const k = L.wander * hush * (R() < 0.12 ? (reg.calm ? 1.4 : 2.4) : 1);      // now and then a bolder note
  return {
    x, y, a, len: L.len * reg.len * R.range(0.7, 1.3), w: L.w * reg.w * R.range(0.8, 1.2),
    col: vary(L.soft ? soft : col, R, reg.dl * k, reg.dab * k, reg.temp * k),
    alpha: L.alpha, bend: R.range(-0.12, 0.12), seed: R.seed()
  };
}

export class Painter {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.blank = true;
    this.scene = null;
    this.queue = [];
    this.cursor = 0;
    this.clock = 0;
    this.onFront = null;        // strokes that belong in front of the train are handed over
    this.onSource = null;       // told of each mark a leaf may fall from, as it is laid
  }

  // The sheet's size in pixels and the part of the scene it shows. A new size
  // is a new sheet; on the same one, whatever is painted stays.
  resize(pw, ph, view) {
    this.view = view;
    if (pw === this.canvas.width && ph === this.canvas.height) return;
    this.canvas.width = pw;
    this.canvas.height = ph;
    this.blank = true;
  }

  // Before reworking a picture, fold in the marks the live layer was holding.
  absorb(strokes) {
    if (this.blank) return;
    this.aim();
    for (const s of strokes) drawStroke(this.ctx, s);
  }

  // Plan a picture. A blank sheet gets one from the sketch up; a painted one
  // is reworked into the new scene, unless this is to be begun afresh, when
  // the old picture is brushed off and the new one started from its sketch.
  begin(scene, afresh) {
    const R = this.R = makeRng(scene.seed ^ 0x51ed270b), view = this.view, ctx = this.ctx;
    const wipe = afresh && !this.blank, fresh = this.blank || wipe;
    this.blank = false;
    this.scene = scene;
    this.probe = makeProbe(scene);
    if (fresh && !wipe) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = css(GROUND);
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // A coarse grid remembering where hand-placed marks sit: along the middle
    // of each, or, for a mark that is to be kept, across its whole width.
    const gw = Math.ceil(W / CELL), gh = Math.ceil(H / CELL), grid = new Uint8Array(gw * gh);
    this.mark = (s) => {
      const len = s.kept && s.round ? Math.max(s.len, s.w) : s.len;      // a kept dot is as long as it is wide
      const dx = Math.cos(s.a), dy = Math.sin(s.a), n = Math.max(1, Math.ceil(len / CELL));
      const rows = s.kept ? Math.ceil(s.w / CELL) + 1 : 1;
      for (let j = 0; j < rows; j++) {
        const off = rows === 1 ? 0 : (j / (rows - 1) - 0.5) * s.w;
        for (let i = 0; i <= n; i++) {
          const t = (i / n - 0.5) * len, gx = ((s.x + dx * t - dy * off) / CELL) | 0, gy = ((s.y + dy * t + dx * off) / CELL) | 0;
          if (gx >= 0 && gy >= 0 && gx < gw && gy < gh) grid[gy * gw + gx] = 1;
        }
      }
    };
    this.guard = (x, y) => {
      const gx = (x / CELL) | 0, gy = (y / CELL) | 0;
      return gx >= 0 && gy >= 0 && gx < gw && gy < gh && grid[gy * gw + gx] === 1;
    };

    const queue = [];
    const inView = (s) => s.x > view.x - 60 && s.x < view.x + view.w + 60;
    const spread = (list, start, end) => {
      for (let i = 0; i < list.length; i++) { list[i].t = start + (end - start) * (i + R()) / list.length; queue.push(list[i]); }
    };

    this.pool = [];
    this.landed = [];
    for (const name in PHASES) {
      if (name === 'sketch' && !fresh) continue;
      let list = scene.groups[name].filter(inView);
      for (const s of list) {
        s.seed = R.seed();
        if (name === 'front') s.front = true;
        if (GUARDED[name]) this.mark(s);
        // thin glazes would build up if repeated; a kept mark is one of several
        // laid over each other in order, which going over singly would undo
        if (RETOUCHED[name] && s.alpha >= 0.6 && !s.kept) this.pool.push(s);
      }
      if (!ORDERED[name]) {      // in any order, but for the kept marks, which follow as they were listed
        const kept = list.filter((s) => s.kept);
        list = list.filter((s) => !s.kept);
        shuffle(list, R);
        list = list.concat(kept);
      }
      spread(list, PHASES[name][0], PHASES[name][1]);
    }
    for (const L of LAYERS) {
      const list = [];
      for (let gy = -L.step / 2; gy < H + L.step; gy += L.step) {
        for (let gx = view.x - L.step; gx < view.x + view.w + L.step; gx += L.step) {
          const s = strokeAt(L, gx + R() * L.step, gy + R() * L.step, R, this.probe, this.guard, scene.env.hush);
          if (s) { s.key = s.y / H * 0.55 + R() * 0.45; list.push(s); }      // roughly top to bottom
        }
      }
      list.sort((a, b) => a.key - b.key);
      spread(list, L.start, L.end);
    }
    if (wipe) for (const s of brushOff(view, R)) queue.push(s);
    queue.sort((a, b) => a.t - b.t);

    this.queue = queue;
    this.cursor = 0;
    this.clock = wipe ? -WIPE : fresh ? 0 : 0.5;       // reworking an existing picture skips the sketch
    this.debt = 0;
    this.guests = 0;
    this.nextGuest = SETTLE + 5;
  }

  aim() {
    const k = this.canvas.width / this.view.w;
    this.ctx.setTransform(k, 0, 0, k, -this.view.x * k, 0);
  }

  put(s) {
    if (s.front) { if (this.onFront) this.onFront(s); } else drawStroke(this.ctx, s);
  }

  // Advance by dt seconds. Unless unhurried, stop after about 10ms of drawing
  // and let the clock wait, so a slow device paints slower rather than stalls.
  tick(dt, unhurried) {
    if (!this.scene) return;
    const q = this.queue, began = performance.now();
    this.clock += dt;
    this.aim();
    let n = 0;
    while (this.cursor < q.length && q[this.cursor].t <= this.clock) {
      const s = q[this.cursor++];
      this.put(s);
      if (s.sheds !== undefined && this.onSource) this.onSource(s);
      if (!unhurried && (++n & 63) === 0 && performance.now() - began > 10) { this.clock = s.t; break; }
    }
    if (this.cursor < q.length) return;

    const since = Math.max(0, this.clock - SETTLE);
    this.debt += (22 + 70 * Math.exp(-since / 30)) * dt;
    while (this.debt >= 1) {
      this.debt -= 1;
      const s = this.retouch();
      if (s) this.put(s);
    }
    if (this.clock > this.nextGuest && this.guests < 14) {
      this.guests++;
      this.nextGuest = this.clock + this.R.range(5, 10);
      for (const s of this.scene.arrive()) {
        if (s.x < this.view.x || s.x > this.view.x + this.view.w) continue;
        s.seed = this.R.seed();
        this.mark(s); this.pool.push(s); this.put(s);
      }
    }
  }

  // Jump ahead without animating (reduced motion, or to catch up).
  advance(seconds) {
    for (let t = 0; t < seconds; t += 0.05) this.tick(0.05, true);
  }

  // Either go over a hand-placed mark again, or add a small stroke somewhere
  // the reference still has more to say.
  retouch() {
    const R = this.R, view = this.view, marks = this.pool.length + this.landed.length;
    if (marks && R() < 0.45) {
      const i = Math.floor(R() * marks), s = i < this.pool.length ? this.pool[i] : this.landed[i - this.pool.length];
      const h = this.scene.env.hush;
      return Object.assign({}, s, { x: s.x + R.range(-0.6, 0.6), y: s.y + R.range(-0.6, 0.6), col: vary(s.col, R, 0.02 * h, 0.01 * h, 0.012 * h), seed: R.seed() });
    }
    for (let i = 0; i < 14; i++) {
      const s = strokeAt(TOUCH, view.x + R() * view.w, R() * H, R, this.probe, this.guard, this.scene.env.hush);
      if (s) return s;
    }
    return null;
  }

  // A mark arriving from outside the plan: a leaf that has just landed.
  stamp(s) {
    if (!this.scene) return;
    this.aim();
    this.put(s);
    if (this.landed.length < 160) this.landed.push(s);
    else this.landed[Math.floor(this.R() * 160)] = s;
  }
}
