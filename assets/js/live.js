// Everything that moves over the painting: the DLR crossing the bridge, rain,
// and whatever is falling through the air (leaves, petals, snow). It lives on
// its own canvas above the painting and is redrawn each frame in the same
// brushwork. The few painted things that stand in front of the train (the
// bridge railing, the rim of the station canopy) are kept here too.

import { makeRng, mix, mul, clamp, lerp } from './util.js';
import { W, H, TRACK, MOUTH, trackK, trackX, trackS, deckY, waterY, reflectY } from './scene.js';
import { drawStroke } from './brush.js';

const HALF = Math.PI / 2;
const CAR = 700, GAP = 20, CARS = 2, TRAIN = CARS * CAR + (CARS - 1) * GAP;
const RAIN_ANGLE = HALF + 0.2;
const RAIN_DX = Math.cos(RAIN_ANGLE), RAIN_DY = Math.sin(RAIN_ANGLE);

// The train in its own space: u runs back from the nose along the track, v up
// from the rail (0) to the roof (1). Only what shows above the edge of the
// deck is modelled. Bands are strokes along the body, posts across it.
function buildTrain(R) {
  const parts = [];
  const band = (u0, u1, v, th, col, lit, extra) => parts.push(Object.assign({ u0, u1, v, th, col, lit, seed: R.seed() }, extra));
  const post = (u, v0, v1, wd, col, lit) => parts.push({ u0: u, u1: u, v0, v1, wd, col, lit, post: true, seed: R.seed() });
  // White cars with a green skirt, green doors and green ends.
  const whites = [[0.97, 0.97, 0.95], [0.92, 0.94, 0.95], [0.98, 0.96, 0.91]];
  const greens = [[0.02, 0.64, 0.52], [0.10, 0.72, 0.58], [0.0, 0.56, 0.50]];
  const glass = [[0.10, 0.13, 0.20], [0.15, 0.17, 0.27]];
  for (let car = 0; car < CARS; car++) {
    const o = car * (CAR + GAP), n = 12, seg = CAR / n;
    for (let i = 0; i < n; i++) {
      const u0 = o + i * seg, u1 = Math.min(o + CAR, u0 + seg * 1.06);
      band(u0, u1, 0.18, 0.09, [0.16, 0.15, 0.21], 0.2);
      band(u0, u1, 0.28, 0.13, R.pick(greens), 1, { mirror: true });
      band(u0, u1, 0.43, 0.19, R.pick(whites), 1, { mirror: true });
      band(u0, u1, 0.66, 0.28, R.pick(glass), 0.5, { mirror: true });
      band(u0, u1, 0.855, 0.12, R.pick(whites), 0.95, { mirror: true });
      band(u0, u1, 0.955, 0.09, [0.70, 0.73, 0.76], 1);
      band(u0 + seg * 0.16, u0 + seg * 0.84, 0.665, 0.19, null, 1, { pane: true });
    }
    for (const f of [0.13, 0.37, 0.63, 0.87]) post(o + CAR * f, 0.23, 0.89, 38, R.pick(greens), 1);
    for (const u of [o + 9, o + CAR - 9]) post(u, 0.2, 0.92, 20, [0.0, 0.50, 0.44], 0.8);
    for (const u of [o + 13, o + CAR - 13]) post(u, 0.54, 0.86, 12, [0.09, 0.10, 0.20], 0.4);
  }
  band(CAR, CAR + GAP, 0.5, 0.5, [0.12, 0.12, 0.18], 0.2);
  parts.push({ u0: 3, u1: 3, v: 0.3, dot: true, lamp: [1, 0.95, 0.75], seed: R.seed() });
  parts.push({ u0: TRAIN - 3, u1: TRAIN - 3, v: 0.3, dot: true, lamp: [1, 0.22, 0.16], seed: R.seed() });
  return parts;
}

export class Live {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.R = makeRng((Math.random() * 4294967296) >>> 0);
    this.parts = buildTrain(this.R);
    this.train = { active: false, dir: 1, head: 0, wait: 7 };
    this.front = [];
    this.rain = [];
    this.rings = [];
    this.falls = [];
    this.debt = { rain: 0, ring: 0, fall: 0 };
    this.time = 0;
    this.dirty = false;
    this.onLand = null;         // called with a stroke when a leaf comes to rest
  }

  resize(pw, ph, view) {
    this.canvas.width = pw;
    this.canvas.height = ph;
    this.view = view;
    this.edge = trackS(view.x);        // where the track meets the left edge of the picture
    this.end = trackS(MOUTH.x1);       // and where it runs in under the station canopy
    this.dirty = true;
  }

  // Take on a new scene's light and weather. A train already on the bridge
  // carries on.
  set(scene) {
    const env = scene.env;
    this.scene = scene;
    this.env = env;
    this.front = [];
    this.rain = [];
    this.rings = [];
    this.falls = [];
    this.sources = scene.sources.filter((s) => s.x > this.view.x && s.x < this.view.x + this.view.w);
    const lit = env.lights > 0.3;
    for (const p of this.parts) {
      if (p.lamp) { p.c = p.lamp; p.glow = true; }
      else if (p.pane) { p.c = lit ? [1, 0.86, 0.54] : mix(env.skyLow, [0.14, 0.16, 0.32], 0.3); p.glow = lit; }
      else { p.c = mul(p.col, env.light(p.lit)); p.glow = false; }
    }
    this.rainLight = mix(env.skyLow, [1, 1, 1], 0.5);
    this.rainDark = mix(env.skyTop, [0.2, 0.24, 0.34], 0.5);
    if (!this.train.active) this.train.wait = Math.min(this.train.wait, 7);
    this.dirty = true;
  }

  addFront(s) {
    this.front.push(s);
    this.dirty = true;
  }

  // A fixed fall of rain, for when nothing is allowed to move.
  still() {
    if (!this.env || !this.env.wet) return;
    for (let i = 0; i < 380 * this.view.w / W; i++) {
      const s = this.streak();
      s.age = s.pull;
      this.rain.push(s);
    }
    this.dirty = true;
  }

  streak() {
    const R = this.R, v = this.view, light = R.chance(0.7);
    return {
      x: R.range(v.x - 20, v.x + v.w + 70), y: R.range(-70, H - 20), len: R.range(36, 92), w: R.range(1, 1.9),
      col: light ? this.rainLight : this.rainDark, alpha: light ? R.range(0.2, 0.42) : R.range(0.1, 0.2),
      age: 0, pull: R.range(0.09, 0.15), fade: R.range(0.2, 0.34)
    };
  }

  faller() {
    const R = this.R, v = this.view, env = this.env;
    if (env.falling === 'snow') {
      return {
        dot: true, x: R.range(v.x - 10, v.x + v.w + 70), y: -6, vx: R.range(-14, -4), vy: R.range(26, 44), sway: R.range(6, 14),
        freq: R.range(1.5, 3), phase: R.range(0, 6.28), rot: 0, spin: 0, size: R.range(2.2, 3.6), col: this.scene.snow,
        ground: R.range(505, H + 20), drift: 0
      };
    }
    if (!this.sources.length) return null;
    const src = R.pick(this.sources), a = R.range(0, 6.283), r = Math.sqrt(R()), gust = env.wet ? 1.5 : 1;
    const petal = env.falling === 'petal', afloat = R.chance(0.45);
    return {
      dot: petal, x: src.x + Math.cos(a) * r * src.rx, y: src.y + Math.sin(a) * r * src.ry * 0.9,
      vx: R.range(-20, -3) * gust, vy: R.range(22, 40) * gust, sway: R.range(12, 26), freq: R.range(2, 3.6), phase: R.range(0, 6.28),
      rot: R.range(0, 3.14), spin: R.range(-4, 4), size: petal ? R.range(2.4, 3.4) : R.range(4.5, 7), col: R.pick(src.cols),
      ground: afloat ? null : src.base + R.range(-3, 10), drift: afloat ? R.range(10, 150) : 0
    };
  }

  tick(dt) {
    const env = this.env, R = this.R, tr = this.train, v = this.view;
    if (!env) return;
    this.time += dt;
    let busy = this.dirty;

    if (tr.active) {
      tr.head += tr.dir * lerp(120, 70, clamp(tr.head / this.end, 0, 1)) * dt;      // slowing into the station
      const gone = tr.dir > 0 ? tr.head - TRAIN > this.end + 10 : tr.head + TRAIN < this.edge - 30;
      if (gone) { tr.active = false; tr.dir = -tr.dir; tr.wait = R.range(14, 28); }
      busy = true;
    } else if ((tr.wait -= dt) <= 0) {
      tr.active = true;
      tr.head = tr.dir > 0 ? this.edge - 20 : this.end + 10;
    }

    if (env.wet) {
      const share = v.w / W;
      this.debt.rain += 420 * share * dt;
      while (this.debt.rain >= 1) { this.debt.rain -= 1; this.rain.push(this.streak()); }
      this.debt.ring += 16 * share * dt;
      while (this.debt.ring >= 1) {
        this.debt.ring -= 1;
        const x = R.range(v.x, v.x + v.w), y = waterY(x) + 10 + R() * (H - waterY(x) - 10);
        if (!(Math.abs(x - 575) < 180 && y < 584)) this.rings.push({ x, y, r: R.range(6, 12), age: 0 });
      }
    }
    for (const s of this.rain) s.age += dt;
    for (const g of this.rings) g.age += dt;
    if (this.rain.length) { this.rain = this.rain.filter((s) => s.age < s.pull + 0.05 + s.fade); busy = true; }
    if (this.rings.length) { this.rings = this.rings.filter((g) => g.age < 0.7); busy = true; }

    if (env.falling) {
      this.debt.fall += env.fallRate * (env.falling === 'snow' ? v.w / W : 1) * dt;
      while (this.debt.fall >= 1) { this.debt.fall -= 1; const f = this.faller(); if (f) this.falls.push(f); }
    }
    if (this.falls.length) {
      const kept = [];
      for (const f of this.falls) {
        f.phase += f.freq * dt;
        f.x += (f.vx + Math.sin(f.phase) * f.sway) * dt;
        f.y += f.vy * dt;
        f.rot += f.spin * dt;
        const ground = f.ground === null ? waterY(f.x) + f.drift : f.ground;
        if (f.y < ground) { kept.push(f); continue; }
        // down: it becomes part of the painting (snow only settles on the quay)
        if (this.onLand && f.y < H && f.x > v.x && f.x < v.x + v.w && !(f.dot && f.vy > 25 && env.falling === 'snow' && f.y > waterY(f.x) - 4)) {
          this.onLand({ x: f.x, y: f.y, a: f.rot, len: f.dot ? 1 : f.size, w: f.dot ? f.size : f.size * 0.68, col: f.col, alpha: 0.92, round: f.dot, seed: R.seed() });
        }
      }
      this.falls = kept;
      busy = true;
    }

    if (busy) this.draw();
    this.dirty = false;
  }

  draw() {
    const ctx = this.ctx, v = this.view, k = this.canvas.width / v.w;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(k, 0, 0, k, -v.x * k, 0);
    if (this.train.active) this.drawTrain(ctx);
    for (const s of this.front) drawStroke(ctx, s);

    for (const f of this.falls) {
      drawStroke(ctx, { x: f.x, y: f.y, a: f.rot, len: f.dot ? 1 : f.size, w: f.dot ? f.size : f.size * 0.68, col: f.col, alpha: 0.95, round: f.dot, seed: 7 });
    }

    // rain: each streak is pulled like a stroke, then fades
    ctx.lineCap = 'round';
    for (const s of this.rain) {
      const p = Math.min(1, s.age / s.pull), out = s.age - s.pull - 0.05;
      const alpha = s.alpha * (out > 0 ? Math.max(0, 1 - out / s.fade) : 1);
      ctx.strokeStyle = 'rgba(' + Math.round(s.col[0] * 255) + ',' + Math.round(s.col[1] * 255) + ',' + Math.round(s.col[2] * 255) + ',' + alpha.toFixed(3) + ')';
      ctx.lineWidth = s.w;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + RAIN_DX * s.len * p, s.y + RAIN_DY * s.len * p);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    for (const g of this.rings) {
      const p = g.age / 0.7;
      ctx.strokeStyle = 'rgba(' + Math.round(this.rainLight[0] * 255) + ',' + Math.round(this.rainLight[1] * 255) + ',' + Math.round(this.rainLight[2] * 255) + ',' + (0.5 * (1 - p)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, g.r * (0.25 + 0.75 * p), g.r * (0.25 + 0.75 * p) * 0.34, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawTrain(ctx) {
    const tr = this.train, env = this.env, v = this.view, h = TRACK.height, water = this.scene.waterCol;
    const at = (s, up) => { const k = trackK(s), x = trackX(s); return [x, deckY(x) - (up - TRACK.sunk) * h * k, k]; };
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(v.x - 4, 0); ctx.lineTo(MOUTH.x1, 0); ctx.lineTo(MOUTH.x1, MOUTH.top);      // the far end runs in under the station canopy
    ctx.quadraticCurveTo(MOUTH.x0, MOUTH.top, MOUTH.x0, MOUTH.deck);
    ctx.lineTo(MOUTH.x0, H); ctx.lineTo(v.x - 4, H);
    ctx.closePath();
    ctx.clip();
    for (const p of this.parts) {
      let s0 = tr.dir > 0 ? tr.head - p.u1 : tr.head + p.u0;
      const s1 = tr.dir > 0 ? tr.head - p.u0 : tr.head + p.u1;
      if (s1 < -620 || s0 > TRACK.far + 30) continue;
      s0 = Math.max(s0, -620);
      const z = lerp(0.4, 0.62, clamp((s0 + s1) / 2 / TRACK.far, 0, 1));
      const stroke = { col: p.glow ? env.glow(p.c, z) : env.fogged(p.c, z), alpha: 0.95, seed: p.seed };
      if (p.post) {
        const a = at(s0, p.v0), b = at(s0, p.v1);
        stroke.x = a[0]; stroke.y = (a[1] + b[1]) / 2; stroke.a = HALF; stroke.len = a[1] - b[1]; stroke.w = p.wd * a[2];
      } else if (p.dot) {
        const a = at(s0, p.v);
        stroke.x = a[0]; stroke.y = a[1]; stroke.a = 0; stroke.len = 1; stroke.w = 13 * a[2]; stroke.round = true;
      } else {
        const a = at(s0, p.v), b = at(s1, p.v);
        stroke.x = (a[0] + b[0]) / 2; stroke.y = (a[1] + b[1]) / 2; stroke.a = Math.atan2(b[1] - a[1], b[0] - a[0]);
        stroke.len = Math.hypot(b[0] - a[0], b[1] - a[1]); stroke.w = p.th * h * (a[2] + b[2]) / 2;
      }
      if (stroke.x + stroke.len < v.x - 10) continue;
      drawStroke(ctx, stroke);
      if (p.mirror) {
        const ry = reflectY(stroke.y);
        if (ry > waterY(stroke.x) + 6 && ry < H + 4) {
          drawStroke(ctx, {
            x: stroke.x + Math.sin(this.time * 1.4 + ry * 0.21 + (p.seed % 7)) * 2.5, y: ry, a: 0,
            len: Math.max(7, stroke.len * 0.9), w: Math.max(1.6, stroke.w * 0.6), col: mix(stroke.col, water, 0.3), alpha: 0.5, seed: p.seed
          });
        }
      }
    }
    ctx.restore();
  }
}
