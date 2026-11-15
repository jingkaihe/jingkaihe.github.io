// Everything that moves over the painting: the motif's own cast (at Eden Dock,
// the DLR crossing the bridge; on Parliament Hill, a kite and passing birds),
// rain, and whatever is falling through the air (leaves, petals, snow). It
// lives on its own canvas above the painting and is redrawn each frame in the
// same brushwork. The few painted things that stand in front of the cast (the
// bridge railing, say) are kept here too.
//
// A leaf or a petal never comes out of thin air. It leaves a painted one: the
// painter passes on each mark that can shed as it lays it, and what falls
// starts there, in that mark's colour and at its angle. Nor does it leave the
// distance its tree stands at. The mark's sheds says how it comes down: to(x),
// the height it falls to; scale, how small and slow it looks from here; lost,
// if it goes out of sight there instead of landing; afloat, if the wind may
// carry it out onto the water.

import { makeRng, mix } from './util.js';
import { W, H } from './sheet.js';
import { drawStroke } from './brush.js';

const HALF = Math.PI / 2;
const RAIN_ANGLE = HALF + 0.2;
const RAIN_DX = Math.cos(RAIN_ANGLE), RAIN_DY = Math.sin(RAIN_ANGLE);

export class Live {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.R = makeRng((Math.random() * 4294967296) >>> 0);
    this.cast = [];
    this.front = [];
    this.rain = [];
    this.rings = [];
    this.falls = [];
    this.sources = [];          // the painted leaves and flowers one may fall from
    this.debt = { rain: 0, ring: 0, fall: 0 };
    this.time = 0;
    this.dirty = false;
    this.onLand = null;         // called with a stroke when a leaf comes to rest
  }

  // Put a motif's moving parts on, in place of whatever was there. cast(R)
  // makes them, given this layer's dice. Each has resize(view), set(scene),
  // tick(dt), which is true while it needs redrawing, and draw(ctx, time);
  // one that should appear in a picture where nothing moves has still() too.
  stage(cast) {
    this.cast = cast(this.R);
    if (this.view) for (const a of this.cast) a.resize(this.view);
    this.dirty = true;
  }

  resize(pw, ph, view) {
    this.canvas.width = pw;
    this.canvas.height = ph;
    this.view = view;
    for (const a of this.cast) a.resize(view);
    this.dirty = true;
  }

  // Take on a new scene's light and weather. The cast carries on where it was.
  set(scene) {
    const env = scene.env;
    this.scene = scene;
    this.env = env;
    this.front = [];
    this.rain = [];
    this.rings = [];
    this.falls = [];
    this.sources = [];          // none until the new picture's leaves are painted
    for (const a of this.cast) a.set(scene);
    this.rainLight = mix(env.skyLow, [1, 1, 1], 0.5);
    this.rainDark = mix(env.skyTop, [0.2, 0.24, 0.34], 0.5);
    this.dirty = true;
  }

  addFront(s) {
    this.front.push(s);
    this.dirty = true;
  }

  // A mark that sheds is on the canvas: from now on a leaf may fall from it.
  addSource(s) {
    if (s.x > this.view.x && s.x < this.view.x + this.view.w) this.sources.push(s);
  }

  // For when nothing is allowed to move: the cast hold a pose, and the rain
  // is a fixed fall of streaks.
  still() {
    for (const a of this.cast) if (a.still) a.still();
    this.dirty = true;
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
        ground: R.range(this.scene.snowLine, H + 20)
      };
    }
    if (!this.sources.length) return null;
    const src = R.pick(this.sources), fall = src.sheds, k = fall.scale || 1, gust = (env.wet ? 1.5 : 1) * k;
    if (src.alpha < 0.6) return null;      // thinned or put out by its motif: something stands in front of it
    const petal = env.falling === 'petal', afloat = !!fall.afloat && R.chance(0.45);
    return {
      dot: petal, x: src.x, y: src.y,
      vx: R.range(-20, -3) * gust, vy: R.range(22, 40) * gust, sway: R.range(12, 26) * k, freq: R.range(2, 3.6), phase: R.range(0, 6.28),
      rot: src.a, spin: R.range(-4, 4), size: (petal ? R.range(2.4, 3.4) : R.range(4.5, 7)) * k, col: src.col,
      // where it stops: out on the water, or where its tree says, give or take a little if it is to lie there
      floor: afloat ? this.scene.water.top : fall.to, drop: afloat ? R.range(10, 150) : fall.lost ? 0 : R.range(-3, 10) * k, lost: !!fall.lost
    };
  }

  tick(dt) {
    const env = this.env, R = this.R, v = this.view;
    if (!env) return;
    const water = this.scene.water;
    this.time += dt;
    let busy = this.dirty;

    for (const a of this.cast) if (a.tick(dt)) busy = true;

    if (env.wet) {
      const share = v.w / W;
      this.debt.rain += 420 * share * dt;
      while (this.debt.rain >= 1) { this.debt.rain -= 1; this.rain.push(this.streak()); }
      this.debt.ring += 16 * share * dt;
      while (this.debt.ring >= 1) {
        this.debt.ring -= 1;
        const x = R.range(v.x, v.x + v.w), y = water.top(x) + 10 + R() * (H - water.top(x) - 10);
        if (water.open(x, y)) this.rings.push({ x, y, r: R.range(6, 12), age: 0 });
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
        const ground = f.floor ? f.floor(f.x) + f.drop : f.ground;      // a leaf's is for its tree to say; a snowflake has its own
        if (f.y < ground) { kept.push(f); continue; }
        // down: it becomes part of the painting, unless it has gone out of sight (and snow only settles on dry ground)
        if (this.onLand && !f.lost && f.y < H && f.x > v.x && f.x < v.x + v.w && !(f.dot && f.vy > 25 && env.falling === 'snow' && f.y > water.top(f.x) - 4)) {
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
    for (const a of this.cast) a.draw(ctx, this.time);
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
}
