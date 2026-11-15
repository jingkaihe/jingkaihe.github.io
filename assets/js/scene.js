// Eden Dock, Canary Wharf: the motif.
//
// buildScene() lays the view out as flat shapes on a small hidden canvas (the
// "reference"), alongside a map of which surface is where. The painter samples
// both to choose each stroke's colour and direction. It also lists the marks a
// painter would place by hand: mullions, arches, leaves, figures, lights and
// glints on the water.
//
// Coordinates are in a 1200 x 800 scene space. The composition follows the
// wide photograph (stone block, DLR bridge, glass tower) and borrows the
// stepped terrace, the birches and the arch reflections from the closer one.

import { makeRng, mix, mul, scale, css, clamp, lerp, vary } from './util.js';

export const W = 1200, H = 800;
export const RS = 0.6;                         // reference canvas scale
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const WEATHERS = ['sunny', 'cloudy', 'fog', 'rain'];

const HALF = Math.PI / 2;
const HORIZON = 440;
const VPL = { x: -278, y: HORIZON }, VPR = { x: 940, y: HORIZON };
const CORNER = { x: 434, y: 41 };              // top of the stone block's near corner
const STONE_X = 668;                           // right end of the stone block
export const TOWER_X = 700;                    // left edge of the glass tower
const ROWS = 11, COLS_L = 11, COLS_R = 13;
const BAY = 47, FLOOR = 58;
const ARCH_TOP = 362, ARCH_BASE = 458, ARCH_S = 72, ARCH_HW = 42;
const ARCHES = [1, 3, 5, 7, 9, 11].map((j) => TOWER_X + j * BAY);
const WATER_Y = 572, REFLECT = 0.62;
const SUN = { x: 150, y: 112 };

// The DLR viaduct. Distance along the track (s) maps to the picture through
// one-point perspective toward VPR; k is the scale at that distance. A train
// stands a little taller than the girder is deep (height, at the near edge);
// only its running gear is lost behind the edge of the deck (sunk).
export const TRACK = { D: 900, deck0: 352, girder0: 446, height: 104, sunk: 0.14, far: 2625 };
export const trackK = (s) => TRACK.D / (TRACK.D + s);
export const trackX = (s) => VPR.x * (1 - trackK(s));
export const trackS = (x) => TRACK.D * x / (VPR.x - x);      // inverse of trackX
const toVPR = (y0, x) => VPR.y + (y0 - VPR.y) * (VPR.x - x) / VPR.x;
export const deckY = (x) => toVPR(TRACK.deck0, x);
export const girderY = (x) => toVPR(TRACK.girder0, x);

export const waterY = (x) => 566 + 14 * x / W;
export const reflectY = (y) => (1 + REFLECT) * WATER_Y - REFLECT * y;
const lowDeckY = (x) => waterY(x) - 13;

const leftTop = (x) => CORNER.y + (CORNER.x - x) * 0.5607;
const rightTop = (x) => CORNER.y + (x - CORNER.x) * 0.7885;
const yL = (yc, x) => VPL.y + (yc - VPL.y) * (x - VPL.x) / (CORNER.x - VPL.x);
const yR = (yc, x) => VPR.y + (yc - VPR.y) * (VPR.x - x) / (VPR.x - CORNER.x);
const xL = (u) => VPL.x + (CORNER.x - VPL.x) / (1 + 1.608 * u);
const xR = (u) => VPR.x - (VPR.x - CORNER.x) / (1 + 0.860 * u);

const TIERS = [[640, 519, 525], [656, 533, 540], [674, 548, 556]];   // x start, tread top, tread bottom
const PLANTERS = [[700, 524, 62, 9], [905, 509, 58, 10], [1040, 539, 54, 9]];
const PALMS = [803, 895, 990, 1086, 1182];
const LAMPS = [262, 420, 566, 858, 1012, 1150];
const TOPIARY = [512, 541];
// Painted panels along the girder: [top from, top to, bottom from, bottom to, colour]
const MURAL = [
  [-300, 330, -300, 400, 'green'], [110, 185, 30, 105, 'pink'], [300, 372, 372, 444, 'pink'],
  [640, 1180, 900, 990, 'pale'], [1180, 1500, 990, 1300, 'slate'], [1500, 1800, 1380, 1700, 'green'],
  [2000, 2300, 2080, 2200, 'pale'], [2300, 2420, 2330, 2450, 'pink'], [2420, 2625, 2450, 2625, 'green']
];

// Local colours, before any light falls on them.
const A = {
  stone: [0.95, 0.90, 0.81], stoneCool: [0.84, 0.87, 0.93], window: [0.34, 0.42, 0.58], tan: [0.90, 0.68, 0.46],
  glass: [0.07, 0.12, 0.17], mint: [0.74, 0.88, 0.80], bronze: [0.50, 0.32, 0.20], bronzeHi: [0.92, 0.58, 0.30],
  interior: [0.20, 0.11, 0.14], maroon: [0.46, 0.22, 0.17], gold: [0.98, 0.78, 0.36], cream: [0.96, 0.88, 0.62],
  curtain: [0.80, 0.88, 0.82], awning: [0.98, 0.84, 0.44], white: [0.97, 0.97, 0.95], vine: [0.62, 0.44, 0.32],
  navy: [0.16, 0.18, 0.34], pink: [0.95, 0.48, 0.66], green: [0.16, 0.56, 0.36], pale: [0.82, 0.88, 0.94],
  slate: [0.62, 0.72, 0.84], steel: [0.12, 0.12, 0.20], rail: [0.20, 0.22, 0.32], railBlue: [0.22, 0.34, 0.70],
  concrete: [0.72, 0.70, 0.70], timberDark: [0.30, 0.23, 0.24], timber: [0.86, 0.76, 0.64], riser: [0.62, 0.46, 0.40],
  paving: [0.88, 0.84, 0.78], orange: [1.0, 0.46, 0.12], earth: [0.36, 0.28, 0.22], trunk: [0.36, 0.28, 0.28],
  birch: [0.96, 0.95, 0.90], snow: [0.96, 0.97, 1.0], lamp: [1.0, 0.84, 0.50], topiary: [0.30, 0.44, 0.24],
  red: [0.93, 0.20, 0.14]
};
const BUOYS = [{ x: 745, y: 668, col: A.white }, { x: 760, y: 686, col: A.red }];

const SEASON = {
  spring: {
    skyTop: [0.38, 0.62, 0.90], skyLow: [0.82, 0.90, 0.94], sun: [0.72, 0.65, 0.48], amb: [0.42, 0.49, 0.62], haze: 0.16,
    mist: [0.86, 0.89, 0.87], overcast: [0.80, 0.82, 0.84], sunDisc: [1.0, 0.88, 0.74],
    leafLit: [0.66, 0.84, 0.30], leafDark: [0.30, 0.62, 0.44], birchLit: [0.80, 0.90, 0.36], birchDark: [0.42, 0.68, 0.40],
    everLit: [0.46, 0.66, 0.30], everDark: [0.16, 0.42, 0.34], leafAlt: null,
    blossom: [[0.99, 0.80, 0.86], [1.0, 0.95, 0.95], [0.97, 0.62, 0.76]],
    flowers: [[1.0, 0.90, 0.35], [1.0, 1.0, 0.95], [0.98, 0.66, 0.78]],
    grass: [0.60, 0.78, 0.30], water: [0.07, 0.25, 0.26], canopy: 0.85, clouds: 4, crowd: 0.8, snow: 0, lights: 0, parasols: true
  },
  summer: {
    skyTop: [0.20, 0.44, 0.84], skyLow: [0.66, 0.82, 0.94], sun: [0.78, 0.66, 0.44], amb: [0.38, 0.45, 0.62], haze: 0.10,
    mist: [0.92, 0.88, 0.78], overcast: [0.78, 0.80, 0.84], sunDisc: [1.0, 0.82, 0.56],
    leafLit: [0.48, 0.72, 0.24], leafDark: [0.18, 0.50, 0.40], birchLit: [0.66, 0.82, 0.28], birchDark: [0.30, 0.58, 0.36],
    everLit: [0.44, 0.64, 0.28], everDark: [0.14, 0.40, 0.34], leafAlt: null, blossom: null,
    flowers: [[1.0, 1.0, 0.95], [0.72, 0.52, 0.90]],
    grass: [0.50, 0.70, 0.26], water: [0.05, 0.22, 0.23], canopy: 1, clouds: 2, crowd: 1, snow: 0, lights: 0, parasols: true
  },
  autumn: {
    skyTop: [0.34, 0.52, 0.80], skyLow: [0.92, 0.86, 0.76], sun: [0.82, 0.62, 0.36], amb: [0.40, 0.43, 0.58], haze: 0.20,
    mist: [0.93, 0.82, 0.68], overcast: [0.80, 0.79, 0.78], sunDisc: [1.0, 0.62, 0.38],
    leafLit: [1.0, 0.66, 0.16], leafDark: [0.74, 0.32, 0.22], birchLit: [1.0, 0.86, 0.24], birchDark: [0.80, 0.52, 0.18],
    everLit: [0.50, 0.60, 0.28], everDark: [0.18, 0.38, 0.30], leafAlt: [[1.0, 0.86, 0.24], [0.90, 0.30, 0.16], [0.62, 0.66, 0.26]], blossom: null,
    flowers: [[0.95, 0.50, 0.20], [0.80, 0.30, 0.20]],
    grass: [0.74, 0.66, 0.30], water: [0.10, 0.21, 0.19], canopy: 0.8, clouds: 3, crowd: 0.65, snow: 0, lights: 0.1, parasols: true
  },
  winter: {
    skyTop: [0.52, 0.64, 0.82], skyLow: [0.95, 0.88, 0.82], sun: [0.64, 0.54, 0.44], amb: [0.46, 0.52, 0.66], haze: 0.26,
    mist: [0.78, 0.80, 0.90], overcast: [0.80, 0.81, 0.86], sunDisc: [1.0, 0.72, 0.64],
    leafLit: [0.34, 0.50, 0.36], leafDark: [0.16, 0.34, 0.32], birchLit: [0.34, 0.50, 0.36], birchDark: [0.16, 0.34, 0.32],
    everLit: [0.38, 0.52, 0.38], everDark: [0.16, 0.32, 0.32], leafAlt: null, blossom: null, flowers: null,
    grass: [0.74, 0.68, 0.50], water: [0.10, 0.19, 0.25], canopy: 0, clouds: 2, crowd: 0.4, snow: 1, lights: 0.25, parasols: false
  }
};

// Light and air for one season and weather. shade() gives the colour of a
// surface from its local colour, how much sun it catches (0..1) and how far
// away it is (0 near .. 1 far), so every variant stays consistent.
export function environment(season, weather) {
  const S = SEASON[season];
  const e = Object.assign({ season, weather }, S);
  e.sunny = weather === 'sunny';
  e.wet = 0;
  e.fogD = S.haze;
  e.fogC = mix(S.skyLow, [1, 1, 1], 0.25);
  if (weather === 'cloudy') {
    e.skyTop = mix(S.overcast, [0.50, 0.55, 0.66], 0.6);
    e.skyLow = mix(S.overcast, [1, 1, 1], 0.4);
    e.sun = scale(S.sun, 0.12);
    e.amb = mix(S.overcast, [0.92, 0.92, 0.94], 0.55);
    e.fogC = e.skyLow; e.fogD = 0.32;
    e.lights = S.lights + 0.25; e.crowd = S.crowd * 0.7;
  } else if (weather === 'fog') {
    e.skyTop = mix(S.mist, S.skyTop, 0.12);
    e.skyLow = S.mist;
    e.sun = scale(S.sun, 0.08);
    e.amb = mix([0.86, 0.86, 0.88], S.mist, 0.4);
    e.fogC = S.mist; e.fogD = 2.4;
    e.lights = S.lights + 0.6; e.crowd = S.crowd * 0.4;
  } else if (weather === 'rain') {
    e.skyTop = mix([0.38, 0.43, 0.54], S.overcast, 0.2);
    e.skyLow = mix([0.66, 0.70, 0.75], S.overcast, 0.3);
    e.sun = [0, 0, 0];
    e.amb = [0.70, 0.73, 0.80];
    e.fogC = [0.62, 0.67, 0.74]; e.fogD = 0.8;
    e.wet = 1; e.lights = S.lights + 0.6; e.crowd = S.crowd * 0.3; e.snow = S.snow * 0.4;
  }
  e.lights = clamp(e.lights, 0, 1);
  e.hush = weather === 'fog' ? 0.5 : 1;                    // fog mutes how far colours wander
  e.lum = (e.amb[0] + e.amb[1] + e.amb[2]) / 3 + (e.sun[0] + e.sun[1] + e.sun[2]) * 0.2;
  const fogT = (z) => 1 - Math.exp(-e.fogD * z);
  e.light = (lit) => [e.amb[0] + e.sun[0] * lit, e.amb[1] + e.sun[1] * lit, e.amb[2] + e.sun[2] * lit];
  e.shade = (albedo, lit, z) => mix(mul(albedo, e.light(lit)), e.fogC, fogT(z));
  e.fogged = (col, z) => mix(col, e.fogC, fogT(z));
  e.glow = (col, z) => mix(col, e.fogC, fogT(z) * 0.55);     // lamps carry further through fog

  // What drifts down through the air, and how often (per second).
  e.falling = { spring: 'petal', summer: weather === 'rain' ? 'leaf' : null, autumn: 'leaf', winter: weather === 'cloudy' ? 'snow' : null }[season];
  e.fallRate = e.falling === 'snow' ? 7
    : e.falling === 'petal' ? { sunny: 0.8, cloudy: 0.7, fog: 0.4, rain: 1.3 }[weather]
    : season === 'summer' ? 0.6 : { sunny: 1.4, cloudy: 1.8, fog: 0.9, rain: 3.2 }[weather];
  return e;
}

// Which surface a pixel belongs to, and how that surface likes to be brushed:
// angle = stroke direction, jit = angular scatter, len/w = size multipliers,
// dl/dab/temp = how far colour may wander in lightness, chroma and warmth,
// calm = share of small detail strokes it accepts (open sky wants few).
export const ID = { sky: 1, cloud: 2, stoneL: 3, stoneR: 4, tower: 5, arch: 6, bridge: 7, misc: 8, deck: 9, foliage: 10, water: 11, pier: 12, grass: 13, far: 14, snow: 15 };
export const REGION = [];
REGION[0] = { angle: () => 0, jit: 0.6, len: 0.8, w: 0.9, dl: 0.03, dab: 0.015, temp: 0.015 };
REGION[ID.sky] = { angle: (x, y) => -0.45 + 0.4 * Math.sin(x / 170 + y / 120), jit: 0.3, len: 1.35, w: 1.1, dl: 0.016, dab: 0.006, temp: 0.008, calm: 0.3 };
REGION[ID.cloud] = { angle: (x) => 0.15 * Math.sin(x / 90), jit: 0.5, len: 1.1, w: 1.1, dl: 0.022, dab: 0.006, temp: 0.01, calm: 0.5 };
REGION[ID.stoneL] = { angle: (x, y) => Math.atan2(y - VPL.y, x - VPL.x), alt: HALF, altP: 0.3, jit: 0.16, len: 1, w: 1, dl: 0.028, dab: 0.012, temp: 0.024 };
REGION[ID.stoneR] = { angle: (x, y) => Math.atan2(VPR.y - y, VPR.x - x), alt: HALF, altP: 0.3, jit: 0.16, len: 1, w: 1, dl: 0.028, dab: 0.012, temp: 0.026 };
REGION[ID.tower] = { angle: () => HALF, alt: 0, altP: 0.22, jit: 0.1, len: 1.1, w: 0.9, dl: 0.035, dab: 0.022, temp: 0.022 };
REGION[ID.arch] = { angle: () => HALF, jit: 0.45, len: 0.7, w: 0.9, dl: 0.03, dab: 0.02, temp: 0.022 };
REGION[ID.bridge] = { angle: (x, y) => Math.atan2(VPR.y - y, VPR.x - x), jit: 0.08, len: 1.1, w: 0.8, dl: 0.03, dab: 0.02, temp: 0.014 };
REGION[ID.misc] = { angle: () => 0, alt: HALF, altP: 0.4, jit: 0.3, len: 0.7, w: 0.85, dl: 0.03, dab: 0.018, temp: 0.02 };
REGION[ID.deck] = { angle: () => 0.02, jit: 0.07, len: 1.15, w: 0.75, dl: 0.03, dab: 0.014, temp: 0.024 };
REGION[ID.foliage] = { angle: () => 0, jit: 1.6, len: 0.45, w: 0.8, dl: 0.045, dab: 0.03, temp: 0.03 };
REGION[ID.water] = { angle: () => 0, jit: 0.05, len: 1.3, w: 0.62, dl: 0.035, dab: 0.02, temp: 0.018, ripple: true };
REGION[ID.pier] = { angle: () => HALF, jit: 0.12, len: 0.9, w: 0.9, dl: 0.03, dab: 0.018, temp: 0.02 };
REGION[ID.grass] = { angle: () => -HALF + 0.1, jit: 0.35, len: 0.4, w: 0.6, dl: 0.045, dab: 0.03, temp: 0.03 };
REGION[ID.far] = { angle: () => HALF, jit: 0.15, len: 0.9, w: 1, dl: 0.02, dab: 0.012, temp: 0.016 };
REGION[ID.snow] = { angle: () => 0, jit: 0.35, len: 0.8, w: 0.8, dl: 0.02, dab: 0.008, temp: 0.014 };

const idCss = (id) => 'rgb(' + id * 12 + ',' + (id * 53) % 256 + ',0)';
export function idAt(data, i) {
  const id = Math.round(data[i] / 12);
  return data[i] === id * 12 && data[i + 1] === (id * 53) % 256 && data[i + 3] === 255 ? id : 0;
}

const makeCanvas = (w, h) => { const el = document.createElement('canvas'); el.width = w; el.height = h; return el; };
const poly = (pts) => { const p = new Path2D(); p.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]); p.closePath(); return p; };
const rect = (x, y, w, h) => { const p = new Path2D(); p.rect(x, y, w, h); return p; };
const ellipse = (x, y, rx, ry) => { const p = new Path2D(); p.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); return p; };

// The tulip-shaped arches at the tower's foot: each side is an S-curve that
// leaves the apex vertically and lands vertically on the pier.
function archPath(cx) {
  const p = new Path2D(), t = ARCH_TOP, s = ARCH_S, hw = ARCH_HW;
  p.moveTo(cx, t);
  p.bezierCurveTo(cx, t + s * 0.5, cx + hw, t + s * 0.42, cx + hw, t + s);
  p.lineTo(cx + hw, ARCH_BASE); p.lineTo(cx - hw, ARCH_BASE); p.lineTo(cx - hw, t + s);
  p.bezierCurveTo(cx - hw, t + s * 0.42, cx, t + s * 0.5, cx, t);
  p.closePath();
  return p;
}
// Point and tangent angle on one side of an arch, t in 0..1 from the apex.
function archPoint(cx, side, t) {
  const hw = side * ARCH_HW, u = 1 - t;
  const px = [cx, cx, cx + hw, cx + hw], py = [ARCH_TOP, ARCH_TOP + ARCH_S * 0.5, ARCH_TOP + ARCH_S * 0.42, ARCH_TOP + ARCH_S];
  const at = (q) => u * u * u * q[0] + 3 * u * u * t * q[1] + 3 * u * t * t * q[2] + t * t * t * q[3];
  const d = (q) => 3 * u * u * (q[1] - q[0]) + 6 * u * t * (q[2] - q[1]) + 3 * t * t * (q[3] - q[2]);
  return [at(px), at(py), Math.atan2(d(py), d(px))];
}
const girderPoint = (s, v) => { const x = trackX(s); return [x, lerp(deckY(x), girderY(x), v)]; };

export function buildScene(season, weather, seed, view) {
  const env = environment(season, weather);
  const R = makeRng(seed);
  const rw = Math.round(W * RS), rh = Math.round(H * RS);
  const ref = makeCanvas(rw, rh), idMap = makeCanvas(rw, rh);
  const c = ref.getContext('2d', { willReadFrequently: true });
  const k = idMap.getContext('2d', { willReadFrequently: true });
  c.scale(RS, RS); k.scale(RS, RS);
  c.lineCap = 'round';

  const S = (albedo, lit, z) => css(env.shade(albedo, lit, z));
  const V = (col, dl, dab, dt) => vary(col, R, (dl === undefined ? 0.035 : dl) * env.hush, (dab === undefined ? 0.02 : dab) * env.hush, (dt === undefined ? 0.02 : dt) * env.hush);
  const fill = (path, color, id, alpha) => {
    if (alpha !== undefined) c.globalAlpha = alpha;
    c.fillStyle = color; c.fill(path);
    c.globalAlpha = 1;
    if (id) { k.fillStyle = idCss(id); k.fill(path); }
  };
  const line = (pts, color, width, alpha) => {
    c.globalAlpha = alpha === undefined ? 1 : alpha;
    c.strokeStyle = color; c.lineWidth = width;
    c.beginPath(); c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.stroke();
    c.globalAlpha = 1;
  };

  const groups = { sketch: [], structure: [], front: [], foliage: [], water: [], figures: [], lights: [], weather: [], sign: [] };
  const dab = (group, x, y, a, len, w, col, alpha, extra) => {
    const s = { x, y, a, len, w, col, alpha: alpha === undefined ? 0.92 : alpha };
    if (extra) Object.assign(s, extra);
    groups[group].push(s);
  };

  const deckA = env.wet ? mix(scale(A.timber, 0.62), env.skyLow, 0.25) : A.timber;
  const paveA = env.wet ? mix(scale(A.paving, 0.6), env.skyLow, 0.3) : A.paving;
  const waterCol = env.shade(env.water, 0.55, 0.08);

  const trees = [
    { x: 628, base: 520, cy: 446, rx: 39, ry: 62, kind: 'birch', z: 0.5, airy: 0.92, lean: -3, front: true },
    { x: 216, base: 512, cy: 478, rx: 24, ry: 24, kind: 'leaf', z: 0.5, airy: 1, lean: 2, lit: 0.35, blossom: true },
    { x: 486, base: 508, cy: 483, rx: 16, ry: 17, kind: 'leaf', z: 0.5, airy: 1, lean: 0, blossom: true },
    { x: 731, base: 524, cy: 491, rx: 27, ry: 24, kind: 'leaf', z: 0.36, airy: 1, lean: 1, blossom: true },
    { x: 934, base: 512, cy: 481, rx: 26, ry: 24, kind: 'leaf', z: 0.36, airy: 1, lean: -1, blossom: true },
    { x: 1018, base: 520, cy: 489, rx: 20, ry: 20, kind: 'leaf', z: 0.36, airy: 1, lean: 1, blossom: true },
    { x: 1070, base: 560, cy: 432, rx: 30, ry: 52, kind: 'birch', z: 0.3, airy: 0.66, lean: 4 },
    { x: 1110, base: 556, cy: 398, rx: 38, ry: 64, kind: 'birch', z: 0.3, airy: 0.66, lean: -3 },
    { x: 1150, base: 562, cy: 424, rx: 34, ry: 56, kind: 'birch', z: 0.3, airy: 0.66, lean: 3 },
    { x: 1186, base: 566, cy: 446, rx: 28, ry: 46, kind: 'birch', z: 0.3, airy: 0.66, lean: 5 }
  ];
  const leafSet = (t) => (t.kind === 'birch' ? [env.birchLit, env.birchDark] : [env.leafLit, env.leafDark]);
  function leafColor(t, l) {
    const set = leafSet(t);
    if (t.blossom && env.blossom && R.chance(0.6)) return V(env.shade(R.pick(env.blossom), 0.5 + 0.5 * l, t.z), 0.03, 0.015, 0.01);
    if (env.leafAlt && R.chance(0.22)) return V(env.shade(R.pick(env.leafAlt), 0.4 + 0.6 * l, t.z), 0.04, 0.03, 0.03);
    if (l > 0.62) return V(env.shade(set[0], 1, t.z), 0.04, 0.03, 0.03);
    if (l < 0.34) return V(env.shade(set[1], 0.12, t.z), 0.04, 0.03, 0.03);
    return V(env.shade(mix(set[0], set[1], 0.5), 0.55, t.z), 0.04, 0.03, 0.03);
  }
  // Bare winter branches, as line segments [x0, y0, x1, y1, width].
  function branches(t) {
    const segs = [], top = t.cy + t.ry * 0.25;
    segs.push([t.x, t.base, t.x + t.lean, top, 3]);
    for (let i = 0; i < 6; i++) {
      const a = -HALF + (i / 5 - 0.5) * 1.9 + R.range(-0.12, 0.12);
      const y0 = lerp(t.base - (t.base - top) * 0.45, top, R());
      const x0 = t.x + t.lean * ((t.base - y0) / (t.base - top));
      const len = t.ry * R.range(0.55, 0.95);
      const x1 = x0 + Math.cos(a) * len * (t.rx / t.ry) * 1.2, y1 = y0 + Math.sin(a) * len;
      segs.push([x0, y0, x1, y1, 1.8]);
      for (let j = 0; j < 2; j++) {
        const f = R.range(0.35, 0.8), a2 = a + R.range(-0.7, 0.7), l2 = len * R.range(0.3, 0.5);
        const bx = lerp(x0, x1, f), by = lerp(y0, y1, f);
        segs.push([bx, by, bx + Math.cos(a2) * l2 * 0.8, by + Math.sin(a2) * l2, 1.1]);
      }
    }
    return segs;
  }
  if (env.canopy === 0) for (const t of trees) t.segs = branches(t);

  // ---------------------------------------------------------------- reference

  function cloud(cx, cy, w, lit, shadow, alpha) {
    const h = w * 0.3, n = R.int(5, 8);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1) - 0.5;
      const px = cx + t * w * 0.85, py = cy - (0.25 - t * t) * h * 1.3 + R.range(-0.1, 0.1) * h;
      const rx = w * R.range(0.15, 0.24), ry = h * R.range(0.4, 0.62);
      fill(ellipse(px, py + ry * 0.4, rx, ry * 0.75), css(shadow), ID.cloud, alpha * 0.8);
      fill(ellipse(px, py, rx, ry * 0.8), css(lit), ID.cloud, alpha);
    }
  }

  function drawSky() {
    const g = c.createLinearGradient(0, 0, 0, HORIZON + 30);
    g.addColorStop(0, css(env.skyTop));
    g.addColorStop(0.6, css(mix(env.skyTop, env.skyLow, 0.62)));
    g.addColorStop(1, css(env.skyLow));
    fill(rect(-5, -5, W + 10, 560), g, ID.sky);
    if (env.sunny) {
      const lit = env.shade([1, 1, 1], 1, 0.5), shadow = env.shade([0.78, 0.82, 0.93], 0.25, 0.5);
      for (let i = 0; i < env.clouds; i++) cloud(R.range(-20, 650), R.range(24, 190), R.range(110, 230), lit, shadow, 0.9);
    } else if (env.weather !== 'fog') {
      const dark = mix(env.skyTop, [0.36, 0.38, 0.46], env.wet ? 0.35 : 0.18);
      const light = mix(env.skyLow, [1, 1, 1], env.wet ? 0.25 : 0.55);
      for (let i = 0; i < 26; i++) {
        fill(ellipse(R.range(-80, 760), R.range(-20, 330), R.range(90, 230), R.range(26, 64)), css(mix(dark, light, R())), ID.cloud, 0.5);
      }
    } else {
      const g2 = c.createRadialGradient(SUN.x, SUN.y, 1, SUN.x, SUN.y, 96);
      g2.addColorStop(0, css(env.sunDisc, 0.96)); g2.addColorStop(0.13, css(env.sunDisc, 0.92));
      g2.addColorStop(0.2, css(env.sunDisc, 0.34)); g2.addColorStop(1, css(env.sunDisc, 0));
      c.fillStyle = g2; c.fillRect(SUN.x - 96, SUN.y - 96, 192, 192);
    }
  }

  function drawStone() {
    const z = 0.72;
    fill(poly([STONE_X - 2, 268, TOWER_X + 2, 271, TOWER_X + 2, 525, STONE_X - 2, 525]), S(A.tan, 0.8, 0.9), ID.far);
    for (let y = 284; y < 420; y += 14) line([STONE_X + 4, y, TOWER_X - 2, y], S(A.window, 0.3, 0.9), 4, 0.5);

    fill(poly([-5, leftTop(-5), CORNER.x, CORNER.y, CORNER.x, 525, -5, 525]), S(mix(A.stoneCool, env.skyLow, 0.2), 0.5, z), ID.stoneL);
    fill(poly([CORNER.x, CORNER.y, STONE_X, rightTop(STONE_X), STONE_X, 525, CORNER.x, 525]), S(A.stone, 0.9, z), ID.stoneR);
    const glazing = S(mix(A.window, env.skyLow, 0.4), 0.55, z), pane = S(A.window, 0.35, z);
    for (let j = 0; j < COLS_L; j++) {
      const xa = xL((j + 0.2) / COLS_L), xb = xL((j + 0.8) / COLS_L);
      for (let i = 0; i < ROWS; i++) {
        const ya = 63 + i * 34, yb = ya + 24;
        fill(poly([xa, yL(ya, xa), xb, yL(ya, xb), xb, yL(yb, xb), xa, yL(yb, xa)]), glazing, 0, 0.5);
      }
    }
    for (let j = 0; j < COLS_R; j++) {
      const xa = xR((j + 0.28) / COLS_R), xb = xR((j + 0.72) / COLS_R);
      for (let i = 0; i < ROWS; i++) {
        const ya = 67 + i * 34, yb = ya + 15;
        fill(poly([xa, yR(ya, xa), xb, yR(ya, xb), xb, yR(yb, xb), xa, yR(yb, xa)]), pane, 0, 0.8);
      }
    }
    const edge = [-5, leftTop(-5), CORNER.x, CORNER.y, STONE_X, rightTop(STONE_X)];
    line(edge.map((v, i) => (i % 2 ? v + 8 : v)), S(A.stoneCool, 0, z), 6, 0.55);
    line(edge, S(A.stone, 1, z), 8);
    line([CORNER.x, CORNER.y, CORNER.x, 440], S(A.stone, 1, z), 2.5, 0.7);
  }

  function drawTower() {
    const z = 0.46;
    const skyMid = mix(env.skyTop, env.skyLow, 0.5), dark = scale(A.glass, env.lum);
    const g = c.createLinearGradient(0, 0, 0, 520);
    g.addColorStop(0, css(env.fogged(mix(dark, skyMid, 0.42), z)));
    g.addColorStop(1, css(env.fogged(mix(dark, env.skyLow, 0.16), z)));
    fill(rect(TOWER_X, -5, W - TOWER_X + 5, 530), g, ID.tower);
    const tints = [[0.10, 0.36, 0.38], [0.22, 0.20, 0.44], [0.10, 0.22, 0.44], skyMid, env.skyLow];
    for (let j = 0; j < 11; j++) for (let f = 0; f < 7; f++) {
      c.globalAlpha = R.range(0.06, 0.32);
      c.fillStyle = css(env.fogged(scale(R.pick(tints), Math.min(1, env.lum)), z));
      c.fillRect(TOWER_X + j * BAY + 2, ARCH_TOP - (f + 1) * FLOOR + 5, BAY - 4, FLOOR - 9);
    }
    c.globalAlpha = 0.26; c.fillStyle = css(env.fogged(env.skyLow, z));
    c.fillRect(TOWER_X, -5, 44, ARCH_TOP + 5);
    c.globalAlpha = 1;

    for (let f = 0; f < 7; f++) {
      const y = ARCH_TOP - f * FLOOR;
      fill(rect(TOWER_X, y - 4, W - TOWER_X, 8), S(A.mint, 0.7, z), 0, 0.85);
      if (f === 0) continue;
      for (let j = 3; j < 7; j++) {                     // balconies with planters and trailing vines
        const x = TOWER_X + j * BAY;
        fill(rect(x + 3, y - 9, BAY - 6, 11), S(A.white, 0.95, z));
        for (let n = 0; n < 3; n++) fill(ellipse(x + R.range(9, BAY - 9), y - 12 - R.range(0, 3), R.range(6, 10), R.range(3.5, 6)), S(R.chance(0.5) ? env.everLit : env.everDark, R.range(0.3, 1), z));
        for (let n = 0; n < 2; n++) { const vx = x + R.range(6, BAY - 6); line([vx, y + 2, vx + R.range(-3, 3), y + R.range(14, 40)], S(A.vine, 0.6, z), 1.4, 0.8); }
      }
    }
    // pale spandrel glass around the arch heads sets the dark openings off
    fill(rect(TOWER_X, ARCH_TOP - 4, W - TOWER_X + 5, ARCH_S + 6), S(A.mint, 0.6, z), 0, 0.55);
    for (let j = 0; j <= 11; j++) {
      const x = TOWER_X + j * BAY;
      fill(rect(x - 2.5, -5, 5, (j % 2 ? ARCH_TOP : ARCH_BASE) + 5), S(A.bronze, 0.5, z));
      line([x + BAY / 2, 0, x + BAY / 2, ARCH_TOP - 4], S(A.bronze, 0.3, z), 1.3, 0.5);
    }
    for (const cx of ARCHES) {
      const p = archPath(cx);
      const ig = c.createLinearGradient(0, ARCH_TOP, 0, ARCH_BASE);
      ig.addColorStop(0, css(env.fogged(scale(A.interior, 0.8 * env.lum), z)));
      ig.addColorStop(1, css(env.fogged(mix(scale(A.interior, env.lum), A.lamp, 0.12 + 0.25 * env.lights), z)));
      fill(p, ig, ID.arch);
      c.save(); c.clip(p);
      if (cx === ARCHES[0]) fill(rect(cx - 27, 402, 54, 56), S(A.cream, 0.5, z));
      else for (const side of [-1, 1]) fill(rect(cx + side * 31 - 5.5, 410, 11, 48), S(A.curtain, 0.3, z), 0, 0.8);
      for (const dx of [-15, 13]) fill(ellipse(cx + dx, 438, 4, 3.5), css(env.glow(A.lamp, z)), 0, 0.5 + 0.5 * env.lights);
      c.restore();
      c.strokeStyle = S(A.bronze, 0.55, z); c.lineWidth = 5; c.stroke(p);
    }
    fill(rect(TOWER_X, ARCH_BASE, W - TOWER_X + 5, 15), S(A.maroon, 0.55, z));
    fill(rect(TOWER_X, ARCH_BASE + 12, W - TOWER_X + 5, 2), S(A.gold, 0.9, z));
    fill(rect(TOWER_X, ARCH_BASE + 15, W - TOWER_X + 5, 36), css(env.fogged(scale([0.16, 0.17, 0.21], env.lum), z)), ID.misc);
    for (let j = 0; j < 11; j++) {
      if (R.chance(0.55)) fill(rect(TOWER_X + j * BAY + R.range(6, 26), 478, 10, 26), R.chance(env.lights) ? css(env.glow(A.lamp, z)) : S(A.curtain, 0.3, z), 0, 0.7);
    }
    fill(poly([712, 473, 790, 473, 795, 489, 707, 489]), S(A.awning, 1, z));
  }

  function drawBridge() {
    const z = 0.7;
    // the stone block's ground floor, glimpsed under the bridge
    fill(poly([0, girderY(0), STONE_X, girderY(STONE_X), STONE_X, girderY(STONE_X) + 8, 0, girderY(0) + 30]), S(A.stoneCool, 0, z), 0, 0.75);
    for (let x = 212; x < STONE_X - 20; x += 42) {
      fill(rect(x, 464, 25, 40), S([0.48, 0.52, 0.62], 0.1, z), ID.misc, 0.85);
      if (R.chance(0.6)) fill(rect(x - 3, 460, 31, 6), S(A.white, 0.9, z));
    }
    fill(poly([-5, girderY(-5), 198, girderY(198), 198, 536, -5, 530]), S([0.44, 0.46, 0.60], 0.05, 0.55), ID.misc);
    fill(rect(204, 497, 384, 9), S(mix(env.everLit, env.everDark, 0.5), 0.6, 0.5), ID.foliage);
    if (env.parasols) for (let i = 0; i < 6; i++) {
      const px = 228 + i * 31;
      fill(poly([px - 17, 487, px, 475, px + 17, 487]), S(A.orange, 1, 0.55));
      line([px, 487, px, 500], S(A.trunk, 0.2, 0.55), 1.2);
    }

    const g = c.createLinearGradient(0, 0, TOWER_X, 0);
    g.addColorStop(0, S(A.navy, 0.45, 0.4)); g.addColorStop(1, S(A.navy, 0.45, 0.62));
    fill(poly([-5, deckY(-5), TOWER_X, deckY(TOWER_X), TOWER_X, girderY(TOWER_X), -5, girderY(-5)]), g, ID.bridge);
    for (const m of MURAL) {
      const zs = lerp(0.4, 0.62, clamp((m[0] + m[1]) / 2 / TRACK.far, 0, 1));
      fill(poly([].concat(girderPoint(m[0], 0.1), girderPoint(m[1], 0.1), girderPoint(m[3], 0.88), girderPoint(m[2], 0.88))), S(A[m[4]], 0.6, zs));
    }
    line([-5, deckY(-5), TOWER_X, deckY(TOWER_X)], S(A.steel, 0.25, 0.5), 4);
    line([-5, girderY(-5), TOWER_X, girderY(TOWER_X)], S(A.steel, 0.1, 0.5), 5);

    for (const p of [[30, 78], [104, 148]]) {
      const pg = c.createLinearGradient(p[0], 0, p[1], 0);
      pg.addColorStop(0, S(A.concrete, 0.05, 0.34)); pg.addColorStop(1, S(A.concrete, 0.6, 0.34));
      fill(rect(p[0], girderY(p[0]) - 1, p[1] - p[0], 540 - girderY(p[0])), pg, ID.pier);
    }
    fill(poly([-5, 528, 196, 534, 196, 576, -5, 574]), S(A.timberDark, 0.12, 0.3), ID.pier);
    line([-5, 529, 196, 535], S(A.riser, 0.8, 0.3), 3);
  }

  function drawQuay() {
    fill(poly([196, 505, W + 5, 505, W + 5, 519, 196, 519]), S(paveA, 1, 0.4), ID.deck);
    line([196, 504, W + 5, 504], S(A.steel, 0.3, 0.4), 1.5, 0.7);
    fill(poly([196, 519, 660, 519, 660, lowDeckY(660), 196, lowDeckY(196)]), S(A.timberDark, 0.2, 0.36), ID.pier);
    line([196, 532, 650, 532], S(A.riser, 0.6, 0.36), 2.5, 0.8);
    TIERS.forEach((t, i) => {
      const below = i < 2 ? [TIERS[i + 1][1], TIERS[i + 1][1]] : [lowDeckY(W + 5), lowDeckY(t[0])];
      fill(poly([t[0], t[2], W + 5, t[2], W + 5, below[0], t[0], below[1]]), S(A.riser, 0.12, 0.32), ID.deck);
      fill(poly([t[0], t[1], W + 5, t[1], W + 5, t[2], t[0], t[2]]), S(deckA, 1, 0.32), ID.deck);
    });
    fill(poly([196, lowDeckY(196), W + 5, lowDeckY(W + 5), W + 5, waterY(W + 5) - 2, 196, waterY(196) - 2]), S(deckA, 1, 0.28), ID.deck);
    fill(poly([196, waterY(196) - 2, W + 5, waterY(W + 5) - 2, W + 5, waterY(W + 5) + 2, 196, waterY(196) + 2]), S(A.timberDark, 0.1, 0.28), ID.pier);
    for (const p of PLANTERS) {
      fill(rect(p[0], p[1], p[2], p[3]), S(A.riser, 0.5, 0.33), ID.deck);
      for (let n = 0; n < 4; n++) fill(ellipse(p[0] + R.range(6, p[2] - 6), p[1] - R.range(1, 5), R.range(7, 12), R.range(4, 7)), S(R.chance(0.5) ? env.everLit : env.everDark, R.range(0.2, 1), 0.33), ID.foliage);
    }
  }

  function drawTrees() {
    for (const t of trees) {
      const birch = t.kind === 'birch';
      line([t.x, t.base, t.x + t.lean, t.cy], birch ? S(A.birch, 0.85, t.z) : S(A.trunk, 0.3, t.z), birch ? 3 : 2.4);
      if (env.canopy > 0) {
        const set = leafSet(t), lit = t.lit === undefined ? 1 : t.lit, cx = t.x + t.lean, a = t.airy * env.canopy;
        const tint = t.blossom && env.blossom ? mix(env.blossom[0], set[0], 0.25) : null;
        fill(ellipse(cx, t.cy, t.rx, t.ry), S(tint || mix(set[0], set[1], 0.5), 0.55 * lit, t.z), ID.foliage, a);
        fill(ellipse(cx + t.rx * 0.25, t.cy - t.ry * 0.25, t.rx * 0.68, t.ry * 0.62), S(tint || set[0], lit, t.z), 0, a);
        fill(ellipse(cx - t.rx * 0.3, t.cy + t.ry * 0.38, t.rx * 0.58, t.ry * 0.46), S(tint ? env.blossom[2] : set[1], 0.12, t.z), 0, a * 0.9);
      } else {
        for (const s of t.segs) line([s[0], s[1], s[2], s[3]], S(birch ? [0.62, 0.56, 0.56] : A.trunk, 0.4, t.z), s[4], 0.8);
      }
    }
    fill(rect(704, 497, W - 704 + 5, 10), S(mix(env.everLit, env.everDark, 0.55), 0.6, 0.42), ID.foliage);
    for (const px of PALMS) {
      line([px, 506, px, 488], S(A.trunk, 0.3, 0.42), 2);
      fill(ellipse(px, 484, 12, 8), S(env.everDark, 0.2, 0.42), ID.foliage);
      fill(ellipse(px + 3, 481, 7, 4.5), S(env.everLit, 1, 0.42));
    }
  }

  const tufts = [];
  for (let i = 0; i < 15; i++) tufts.push([420 + i * 22 + R.range(-6, 6), 560 - R.range(0, 3), R.range(7, 13), R.range(4, 7), R()]);
  function drawIsland() {
    fill(ellipse(575, 570, 172, 7), S(A.earth, 0.3, 0.24), ID.grass);
    fill(ellipse(575, 565, 166, 7.5), S(env.grass, 1, 0.24), ID.grass);
    for (const t of tufts) fill(ellipse(t[0], t[1], t[2], t[3]), S(mix(env.grass, env.everDark, t[4] * 0.6), 0.4 + 0.6 * t[4], 0.24), ID.grass);
    if (env.snow > 0) fill(ellipse(575, 563, 160, 5.5), S(A.snow, 1, 0.24), ID.snow, env.snow * 0.9);
    for (const fx of TOPIARY) {
      fill(rect(fx - 3.5, 546, 7, 15), S(A.topiary, 0.6, 0.24), ID.foliage);
      fill(ellipse(fx, 543, 4, 4), S(A.topiary, 0.8, 0.24), ID.foliage);
    }
  }

  function drawSnow() {
    if (!(env.snow > 0)) return;
    const a = env.snow, white = S(A.snow, 1, 0.32);
    TIERS.forEach((t) => fill(poly([t[0], t[1], W + 5, t[1], W + 5, t[2] - 1, t[0], t[2] - 1]), white, ID.snow, a * 0.9));
    fill(poly([196, lowDeckY(196), W + 5, lowDeckY(W + 5), W + 5, waterY(W + 5) - 4, 196, waterY(196) - 4]), white, ID.snow, a * 0.85);
    fill(poly([196, 506, W + 5, 506, W + 5, 518, 196, 518]), white, ID.snow, a * 0.6);
    line([-5, deckY(-5) - 1, TOWER_X, deckY(TOWER_X) - 1], S(A.snow, 1, 0.5), 3.5, a);
    line([-5, leftTop(-5) - 4, CORNER.x, CORNER.y - 4, STONE_X, rightTop(STONE_X) - 4], S(A.snow, 1, 0.7), 4, a);
    line([-5, 528, 196, 534], white, 3.5, a);
    line([TOWER_X, ARCH_BASE, W, ARCH_BASE], S(A.snow, 0.6, 0.46), 2, a * 0.8);
    line([708, 473, 794, 473], white, 3, a);
    for (const p of PLANTERS) fill(ellipse(p[0] + p[2] / 2, p[1] - 5, p[2] / 2 - 4, 4), white, ID.snow, a * 0.85);
    for (const px of PALMS) fill(ellipse(px, 480, 9, 3), white, 0, a * 0.8);
    fill(rect(704, 496, W - 704 + 5, 4), white, 0, a * 0.6);
    fill(rect(204, 496, 384, 4), S(A.snow, 0.6, 0.5), 0, a * 0.6);
  }

  function drawLamps() {
    for (const x of LAMPS) {
      line([x, 506, x, 487], S(A.steel, 0.2, 0.4), 1.6);
      if (env.lights > 0.2) {
        const glow = env.glow(A.lamp, 0.4), g = c.createRadialGradient(x, 485, 0.5, x, 485, 6 + 16 * env.lights);
        g.addColorStop(0, css(glow, 0.95)); g.addColorStop(0.25, css(glow, 0.5 * env.lights)); g.addColorStop(1, css(glow, 0));
        c.fillStyle = g; c.fillRect(x - 24, 461, 48, 48);
      } else {
        fill(ellipse(x, 485, 2.4, 2.4), S(A.white, 0.9, 0.4));
      }
    }
  }

  // Everything above the waterline, flipped and squashed into the dock, then
  // sunk under a wash of the water's own colour.
  function drawWater() {
    const snap = makeCanvas(rw, rh);
    snap.getContext('2d').drawImage(ref, 0, 0);
    const wp = poly([-5, 574, 196, 576, 196, waterY(196), W + 5, waterY(W + 5), W + 5, H + 5, -5, H + 5]);
    c.save();
    c.clip(wp);
    c.setTransform(RS, 0, 0, -RS * REFLECT, 0, RS * (1 + REFLECT) * WATER_Y);
    c.drawImage(snap, 0, 0, W, H);
    c.restore();
    const g = c.createLinearGradient(0, 560, 0, H);
    g.addColorStop(0, css(waterCol, 0.38)); g.addColorStop(1, css(waterCol, 0.58));
    fill(wp, g, ID.water);
  }

  function drawBuoys() {
    for (const b of BUOYS) {
      fill(ellipse(b.x, b.y + 11, 6.5, 5), css(mix(env.shade(b.col, 0.4, 0.1), waterCol, 0.5)), 0, 0.8);
      fill(ellipse(b.x, b.y, 7.5, 7), S(b.col, 1, 0.1), ID.misc);
      fill(ellipse(b.x - 1.5, b.y + 2.8, 6, 3.8), S(b.col, 0.1, 0.1), 0, 0.7);
    }
  }

  drawSky(); drawStone(); drawTower(); drawBridge(); drawQuay(); drawTrees(); drawIsland(); drawSnow(); drawLamps();
  drawWater(); drawIsland(); drawBuoys();

  // ------------------------------------------------------------------ accents

  function accSketch() {
    const ink = [0.30, 0.34, 0.52];
    const rule = (x0, y0, x1, y1) => {
      const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(d / 90)), a = Math.atan2(y1 - y0, x1 - x0);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        dab('sketch', lerp(x0, x1, t) + R.range(-1.5, 1.5), lerp(y0, y1, t) + R.range(-1.5, 1.5), a + R.range(-0.02, 0.02), d / n * 1.08, 2.2, V(ink, 0.03, 0.01, 0.01), 0.5);
      }
    };
    rule(0, leftTop(0), CORNER.x, CORNER.y); rule(CORNER.x, CORNER.y, STONE_X, rightTop(STONE_X)); rule(CORNER.x, CORNER.y, CORNER.x, 440);
    rule(TOWER_X, 0, TOWER_X, 520);
    rule(0, deckY(0), TOWER_X, deckY(TOWER_X)); rule(0, girderY(0), TOWER_X, girderY(TOWER_X));
    rule(30, 446, 30, 540); rule(148, 446, 148, 540); rule(0, 575, 196, 576);
    rule(196, 505, W, 505); rule(196, waterY(196), W, waterY(W)); rule(TOWER_X, ARCH_BASE, W, ARCH_BASE);
    for (let j = 0; j <= 10; j += 2) rule(TOWER_X + j * BAY, 0, TOWER_X + j * BAY, ARCH_BASE);
    for (const cx of ARCHES) for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      const p = archPoint(cx, side, (i + 0.5) / 4);
      dab('sketch', p[0], p[1], p[2], 22, 2, V(ink, 0.03, 0.01, 0.01), 0.5);
    }
    rule(410, 563, 740, 566);
  }

  function accStructure() {
    const zt = 0.46, zs = 0.72;
    const bronze = (hi) => V(hi ? env.shade(A.bronzeHi, 0.95, zt) : env.shade(A.bronze, 0.35, zt), 0.04, 0.02, 0.025);
    const cap = env.snow > 0.5 ? A.snow : null;

    // stone block: window rhythm, cornice, the lit corner
    for (let j = 0; j < COLS_R; j++) {
      const xm = xR((j + 0.5) / COLS_R), f = (VPR.x - xm) / (VPR.x - CORNER.x);
      const wd = xR((j + 0.72) / COLS_R) - xR((j + 0.28) / COLS_R);
      for (let i = 0; i < ROWS; i++) {
        const y = yR(74.5 + i * 34, xm);
        if (y > deckY(xm) - 5) continue;
        const col = R.chance(env.lights * 0.4) ? V(env.glow(A.lamp, zs), 0.03, 0.02) : V(env.shade(A.window, 0.35, zs), 0.05, 0.02, 0.03);
        dab('structure', xm, y, Math.atan2(VPR.y - y, VPR.x - xm), wd * 1.05, 13 * f, col, 0.86);
      }
    }
    for (let j = 0; j < COLS_L; j++) {
      const xm = xL((j + 0.5) / COLS_L), f = (xm - VPL.x) / (CORNER.x - VPL.x);
      const wd = xL((j + 0.2) / COLS_L) - xL((j + 0.8) / COLS_L);
      for (let i = 0; i < ROWS; i++) {
        const y = yL(75 + i * 34, xm);
        if (y > deckY(xm) - 8) continue;
        dab('structure', xm, y, HALF, 22 * f, wd * 0.8, V(env.shade(mix(A.window, env.skyLow, 0.4), 0.55, zs), 0.03, 0.012, 0.02), 0.5);
      }
    }
    const cornice = (x, top, angle) => {
      dab('structure', x, top(x) - 1, angle, 34, 6, V(env.shade(cap || A.stone, 1, zs), 0.02, 0.01, 0.02), 0.9);
      dab('structure', x, top(x) + 7, angle, 32, 3.6, V(env.shade(A.stoneCool, 0, zs), 0.03, 0.02, 0.02), 0.6);
    };
    for (let x = 19; x < CORNER.x - 6; x += 30) cornice(x, leftTop, -0.511);
    for (let x = CORNER.x + 18; x < STONE_X - 6; x += 28) cornice(x, rightTop, 0.668);
    for (let y = 62; y < 340; y += 30) dab('structure', CORNER.x, y, HALF, 26, 2.6, V(env.shade(A.stone, 1, zs), 0.02, 0.01, 0.02), 0.7);

    // tower: sky caught in the glass, spandrels, balcony planters
    for (let f = 1; f < 7; f++) for (let j = 0; j < 11; j++) {
      const x = TOWER_X + j * BAY + BAY / 2, y = ARCH_TOP - f * FLOOR;
      if (env.sunny && R.chance(0.3)) dab('structure', x + R.range(-8, 8), y + FLOOR / 2 + R.range(-6, 6), HALF, R.range(26, 42), R.range(7, 12), V(env.fogged(mix(env.skyLow, [1, 1, 1], 0.2), zt), 0.03, 0.02, 0.02), 0.32);
      if (j >= 3 && j < 7) {
        dab('structure', x, y - 3.5, R.range(-0.02, 0.02), 36, 8, V(env.shade(cap || A.white, 0.95, zt), 0.02, 0.008, 0.012), 0.92);
        for (let n = 0; n < 4; n++) dab('foliage', x + R.range(-16, 16), y - 10 - R.range(0, 4), R.range(0, Math.PI), R.range(5, 8), R.range(3.5, 5), V(env.shade(R.chance(0.5) ? env.everLit : env.everDark, R.range(0.3, 1), zt), 0.05, 0.03, 0.03), 0.9);
        for (let n = 0; n < 2; n++) dab('foliage', x + R.range(-16, 16), y + R.range(10, 22), HALF + R.range(-0.12, 0.12), R.range(14, 34), 1.5, V(env.shade(A.vine, 0.6, zt), 0.05, 0.02, 0.02), 0.7);
      } else if (R.chance(0.82)) {
        dab('structure', x + R.range(-2, 2), y + R.range(-1, 1), R.range(-0.03, 0.03), R.range(28, 38), R.range(5, 7), V(env.shade(A.mint, 0.75, zt), 0.04, 0.02, 0.02), 0.82);
      }
    }
    // mullions, then the arches they flare into
    for (let j = 0; j <= 10; j++) {
      const x = TOWER_X + j * BAY, end = j % 2 ? ARCH_TOP - 6 : ARCH_BASE - 4;
      for (let y = R.range(4, 16); y < end; y += R.range(24, 33)) {
        dab('structure', x + R.range(-0.8, 0.8), y, HALF + R.range(-0.03, 0.03), R.range(19, 27), R.range(2.8, 3.8), bronze(R.chance(0.36)), 0.9);
      }
    }
    for (const cx of ARCHES) {
      if (cx === ARCHES[0]) {
        for (let n = 0; n < 5; n++) dab('structure', cx - 20 + n * 10, 432 + R.range(-3, 3), HALF, R.range(38, 48), 9, V(env.shade(A.cream, 0.5, zt), 0.04, 0.02, 0.03), 0.85);
      } else {
        for (const side of [-1, 1]) dab('structure', cx + side * 31, 434, HALF, 44, 7, V(env.shade(A.curtain, 0.3, zt), 0.04, 0.02, 0.02), 0.7);
      }
      for (const side of [-1, 1]) for (let i = 0; i < 8; i++) {
        const p = archPoint(cx, side, (i + 0.5) / 8);
        dab('structure', p[0], p[1], p[2], 14.5, R.range(3.6, 4.8), bronze(R.chance(side > 0 ? 0.62 : 0.22)), 0.95);
      }
    }
    for (let j = 0; j <= 10; j += 2) for (const side of [-1, 1]) for (let n = 0; n < 3; n++) {
      dab('structure', TOWER_X + j * BAY + side * R.range(5, 24 - n * 6), ARCH_TOP + 8 + n * 14 + R.range(-3, 3), HALF + R.range(-0.1, 0.1), R.range(13, 19), R.range(5, 7.5), V(env.shade(A.mint, R.range(0.5, 0.9), zt), 0.04, 0.02, 0.025), 0.6);
    }
    for (let x = TOWER_X + 20; x < W; x += 40) dab('structure', x, ARCH_BASE + 6, 0, 38, 9, V(env.shade(A.maroon, 0.55, zt), 0.03, 0.02, 0.02), 0.9);
    for (let x = TOWER_X + 18; x < W; x += 36) dab('structure', x, ARCH_BASE + 13, 0, R.range(20, 32), 1.8, V(env.shade(A.gold, 0.9, zt), 0.03, 0.02), 0.85);
    for (const ax of [731, 770]) dab('structure', ax, 481, 0.01, 44, 11, V(env.shade(cap || A.awning, ax < 750 ? 1 : 0.85, zt), 0.03, 0.02, 0.02), 0.95);

    // bridge: flanges and the railing. The top flange and railing stand in
    // front of the train, so they go on the live layer.
    for (let s = -40; s < TRACK.far; s += 86) {
      const xa = trackX(s), xb = trackX(s + 80), kk = trackK(s + 40), zb = lerp(0.4, 0.62, clamp(s / TRACK.far, 0, 1));
      const along = (group, ya, yb, w, col) => dab(group, (xa + xb) / 2, (ya + yb) / 2, Math.atan2(yb - ya, xb - xa), Math.hypot(xb - xa, yb - ya), w, col, 0.9);
      along('structure', girderY(xa), girderY(xb), 4.5 * kk + 1, V(env.shade(A.steel, 0.1, zb), 0.03, 0.02));
      along('front', deckY(xa) + 1.5 * kk, deckY(xb) + 1.5 * kk, 4 * kk + 1, V(env.shade(cap || A.steel, cap ? 1 : 0.3, zb), 0.03, 0.02));
      along('front', deckY(xa) - 30 * kk, deckY(xb) - 30 * kk, 1.6 * kk + 0.5, V(env.shade(A.rail, 0.5, zb), 0.03, 0.02));
      along('front', deckY(xa) - 15 * kk, deckY(xb) - 15 * kk, 1.1 * kk + 0.4, V(env.shade(A.rail, 0.5, zb), 0.03, 0.02));
      for (const ps of [s, s + 43]) {
        const px = trackX(ps), pk = trackK(ps);
        dab('front', px, deckY(px) - 15 * pk, HALF, 30 * pk, 2.4 * pk + 0.6, V(env.shade(A.railBlue, 0.8, zb), 0.04, 0.03), 0.92);
      }
    }

    // quay: terrace treads, piles, piers, parasols, lamp posts
    TIERS.forEach((t) => {
      for (let x = t[0] + 20; x < W; x += R.range(40, 60)) {
        dab('structure', x, (t[1] + t[2]) / 2, 0.005, R.range(40, 58), t[2] - t[1] - 1, V(env.shade(cap || deckA, 1, 0.32), 0.03, 0.012, 0.02), 0.75);
        if (R.chance(0.6)) dab('structure', x + 10, t[2] + 1.5, 0.005, R.range(30, 50), 2.2, V(env.shade(A.timberDark, 0.1, 0.32), 0.03, 0.02), 0.6);
      }
    });
    for (let x = 204; x < 652; x += R.range(15, 21)) dab('structure', x, 541, HALF, R.range(24, 34), 3.4, V(env.shade(A.timberDark, R.range(0.05, 0.4), 0.36), 0.04, 0.02, 0.02), 0.8);
    for (let x = 6; x < 192; x += R.range(12, 16)) dab('structure', x, 553, HALF, R.range(32, 40), 4, V(env.shade(A.timberDark, R.range(0.05, 0.3), 0.3), 0.04, 0.02, 0.02), 0.85);
    for (const p of [[30, 78], [104, 148]]) for (let y = 456; y < 530; y += 22) dab('structure', p[1] - 7, y, HALF, 24, 7, V(env.shade(A.concrete, 0.7, 0.34), 0.03, 0.012, 0.02), 0.6);
    if (env.parasols) for (let i = 0; i < 6; i++) {
      const px = 228 + i * 31;
      dab('structure', px - 8, 481.5, -0.6, 19, 6.5, V(env.shade(A.orange, 1, 0.55), 0.03, 0.03, 0.02), 0.95);
      dab('structure', px + 8, 481.5, 0.6, 19, 6.5, V(env.shade(A.orange, 0.7, 0.55), 0.03, 0.03, 0.02), 0.95);
    }
    for (const x of LAMPS) dab('structure', x, 496, HALF, 20, 1.8, V(env.shade(A.steel, 0.2, 0.4), 0.03, 0.02), 0.85);
  }

  function accFoliage() {
    for (const t of trees) {
      const group = t.front ? 'front' : 'foliage', cx = t.x + t.lean, birch = t.kind === 'birch';
      for (let y = t.base - 4; y > t.cy; y -= 11) {
        const f = (t.base - y) / (t.base - t.cy);
        dab('foliage', t.x + t.lean * f + R.range(-0.5, 0.5), y, HALF + R.range(-0.05, 0.05), 13, birch ? 3.2 : 2.6, V(env.shade(birch ? A.birch : A.trunk, birch ? 0.85 : 0.3, t.z), 0.03, 0.012, 0.015), 0.92);
        if (birch && R.chance(0.45)) dab('foliage', t.x + t.lean * f, y + R.range(-4, 4), 0, 3.4, 1.5, V(env.shade(A.trunk, 0.2, t.z), 0.03, 0.01), 0.8);
      }
      if (env.canopy > 0) {
        const n = Math.round(t.rx * t.ry * 0.085 * t.airy * env.canopy);
        for (let i = 0; i < n; i++) {
          const ang = R.range(0, Math.PI * 2), rad = Math.sqrt(R());
          const ux = Math.cos(ang) * rad, uy = Math.sin(ang) * rad;
          const l = clamp(0.5 + 0.5 * (ux * 0.6 - uy * 0.8) + R.range(-0.25, 0.25), 0, 1) * (t.lit === undefined ? 1 : 0.5 + t.lit * 0.5);
          dab(group, cx + ux * t.rx, t.cy + uy * t.ry, R.range(0, Math.PI), R.range(5, 9), R.range(3.4, 5.4), leafColor(t, l), 0.92);
        }
      } else {
        for (const s of t.segs) {
          const d = Math.hypot(s[2] - s[0], s[3] - s[1]), n = Math.max(1, Math.round(d / 12)), a = Math.atan2(s[3] - s[1], s[2] - s[0]);
          for (let i = 0; i < n; i++) {
            const f = (i + 0.5) / n, bx = lerp(s[0], s[2], f), by = lerp(s[1], s[3], f);
            dab(group, bx, by, a + R.range(-0.08, 0.08), d / n * 1.15, s[4], V(env.shade(birch ? [0.62, 0.56, 0.56] : A.trunk, 0.4, t.z), 0.04, 0.015, 0.02), 0.85);
            if (env.snow > 0.5 && R.chance(0.3)) dab(group, bx, by - 1.2, a, d / n * 0.7, 1.4, V(env.shade(A.snow, 1, t.z), 0.02, 0.006), 0.85);
          }
        }
      }
      if (env.season === 'autumn') for (let i = 0; i < 14; i++) dab('foliage', t.x + R.gauss() * 34, t.base + R.range(-3, 9), R.range(0, Math.PI), R.range(3, 5), R.range(2.4, 3.4), leafColor(t, R()), 0.9);
    }

    const shrubs = (x0, x1, y, z, step) => {
      for (let x = x0; x < x1; x += step * R.range(0.7, 1.3)) {
        const l = R();
        dab('foliage', x, y + R.range(-3, 3), R.range(0, Math.PI), R.range(5, 8), R.range(3.6, 5.2), V(env.shade(l > 0.5 ? env.everLit : env.everDark, l > 0.5 ? 1 : 0.15, z), 0.05, 0.03, 0.03), 0.9);
        if (env.flowers && R.chance(0.2)) dab('foliage', x + R.range(-3, 3), y - R.range(1, 5), 0, 1, R.range(2.6, 3.6), V(env.shade(R.pick(env.flowers), 1, z), 0.03, 0.03), 0.95, { round: true });
        if (R.chance(0.45 * env.snow)) dab('foliage', x, y - 4.5, R.range(-0.2, 0.2), R.range(5, 9), 2.6, V(env.shade(A.snow, 1, z), 0.02, 0.006), 0.9);
      }
    };
    shrubs(706, W, 501, 0.42, 6.5); shrubs(206, 586, 501, 0.5, 7);
    for (const p of PLANTERS) shrubs(p[0] + 4, p[0] + p[2] - 4, p[1] - 4, 0.33, 5);
    for (const px of PALMS) for (let i = 0; i < 8; i++) {
      const a = -Math.PI + 0.25 + (i / 7) * (Math.PI - 0.5);
      dab('foliage', px + Math.cos(a) * 6, 487 + Math.sin(a) * 6, a, 12, 2.3, V(env.shade(i > 3 ? env.everLit : env.everDark, i > 3 ? 1 : 0.2, 0.42), 0.05, 0.03, 0.03), 0.9);
    }

    // the floating island: grasses, flowers and the two moss figures
    const onIsland = () => clamp(575 + R.gauss() * 78, 414, 738);
    for (let i = 0; i < 170; i++) {
      const l = R();
      dab('foliage', onIsland(), 561 + R.range(-3.5, 3.5), -HALF + R.range(-0.4, 0.4), R.range(7, 15), R.range(1.7, 2.6), V(env.shade(mix(env.grass, env.everDark, l * 0.5), 1 - l * 0.7, 0.24), 0.06, 0.035, 0.04), 0.9);
    }
    if (env.flowers) for (let i = 0; i < 34; i++) dab('foliage', onIsland(), 558 + R.range(-5, 4), 0, 1, R.range(2.4, 3.4), V(env.shade(R.pick(env.flowers), 1, 0.24), 0.03, 0.03), 0.95, { round: true });
    if (env.snow > 0) for (let i = 0; i < 30; i++) dab('foliage', onIsland(), 564 + R.range(-2, 3), R.range(-0.1, 0.1), R.range(8, 18), 3, V(env.shade(A.snow, 1, 0.24), 0.02, 0.006, 0.01), 0.85 * env.snow);
    for (const fx of TOPIARY) {
      dab('foliage', fx, 553.5, HALF, 13, 6.5, V(env.shade(A.topiary, 0.5, 0.24), 0.04, 0.025, 0.03), 0.95);
      dab('foliage', fx + 1.2, 552, HALF, 9, 2.4, V(env.shade(A.topiary, 1.1, 0.24), 0.04, 0.025, 0.03), 0.8);
      dab('foliage', fx, 543.5, 0, 1, 7, V(env.shade(A.topiary, 0.7, 0.24), 0.04, 0.025, 0.03), 0.95, { round: true });
      if (env.snow > 0.5) dab('foliage', fx, 540.5, 0, 4, 2.4, V(env.shade(A.snow, 1, 0.24), 0.02, 0.006), 0.9);
    }
  }

  // People are three or four dabs each: legs, coat, head, and a shadow or a
  // wet reflection at their feet.
  const warm = [[0.97, 0.97, 0.94], [0.58, 0.74, 0.93], [0.94, 0.48, 0.54], [0.90, 0.22, 0.18], [0.98, 0.86, 0.42], [0.22, 0.28, 0.52], [0.15, 0.15, 0.19], [0.48, 0.72, 0.58], [0.96, 0.72, 0.78]];
  const cold = [[0.13, 0.13, 0.17], [0.21, 0.23, 0.34], [0.38, 0.25, 0.21], [0.64, 0.48, 0.32], [0.48, 0.11, 0.15], [0.26, 0.32, 0.30], [0.52, 0.52, 0.57]];
  const wardrobe = env.season === 'winter' ? cold : env.season === 'autumn' ? cold.concat(warm.slice(3, 7)) : env.season === 'spring' ? warm.concat(cold.slice(0, 3)) : warm;
  const skins = [[0.96, 0.80, 0.68], [0.84, 0.64, 0.50], [0.58, 0.40, 0.30], [0.24, 0.17, 0.15]];
  const brollies = [[0.10, 0.10, 0.14], [0.10, 0.10, 0.14], [0.78, 0.13, 0.15], [0.96, 0.80, 0.22], [0.16, 0.32, 0.62], [0.92, 0.92, 0.94]];

  function person(x, feet, h, z, seated) {
    const lit = env.sunny ? R.range(0.75, 1) : 0.7;
    const cloth = V(env.shade(R.pick(wardrobe), lit, z), 0.03, 0.02, 0.02);
    const legs = V(env.shade(R.pick(cold), lit * 0.8, z), 0.03, 0.02, 0.02);
    const head = V(env.shade(R.pick(skins), lit, z), 0.03, 0.015, 0.02);
    if (env.sunny) dab('figures', x - h * 0.4, feet + 0.6, 0.1, h * 0.75, h * 0.15, V(env.shade([0.36, 0.38, 0.60], 0, z), 0.03, 0.02), 0.45);
    if (env.wet && !seated) dab('figures', x, feet + h * 0.42, HALF, h * 0.7, h * 0.22, cloth, 0.26);
    if (seated) {
      const dir = R.chance(0.5) ? 1 : -1;
      dab('figures', x + dir * h * 0.16, feet - h * 0.08, 0, h * 0.4, h * 0.17, legs, 0.95);
      dab('figures', x, feet - h * 0.3, HALF, h * 0.36, h * 0.3, cloth, 0.95);
      dab('figures', x, feet - h * 0.56, 0, 1, h * 0.2, head, 0.97, { round: true });
    } else {
      dab('figures', x, feet - h * 0.22, HALF + R.range(-0.08, 0.08), h * 0.44, h * 0.19, legs, 0.95);
      dab('figures', x, feet - h * 0.6, HALF, h * 0.4, h * 0.28, cloth, 0.95);
      dab('figures', x, feet - h * 0.89, 0, 1, h * 0.19, head, 0.97, { round: true });
      if (env.wet) dab('figures', x, feet - h * 1.1, 0, h * 0.85, h * 0.28, V(env.shade(R.pick(brollies), 0.9, z), 0.03, 0.02), 0.96, { bend: -0.2 });
    }
  }
  const walker = () => {
    if (R.chance(0.66)) person(R.range(208, W - 12), 516.5 + R.range(-1.5, 1.5), R.range(18.5, 21), 0.4, false);
    else { const x = R.range(214, W - 14); person(x, lowDeckY(x) + 7, R.range(22, 25.5), 0.28, false); }
  };

  function accFigures() {
    const rows = [[526, 648], [541, 664], [557, 682]];
    let seated = env.wet ? 0 : Math.round(46 * env.crowd * (env.snow > 0.5 ? 0.25 : 1));
    while (seated > 0) {
      const row = R.pick(rows), g = Math.min(seated, R.int(1, 4));
      let x = R.range(row[1], W - 50);
      for (let i = 0; i < g; i++) { person(x, row[0] + R.range(-0.8, 0.8), R.range(19, 21.5), 0.32, true); x += R.range(8.5, 12); }
      seated -= g;
    }
    const walkers = Math.round((env.wet ? 30 : 24) * env.crowd) + 3;
    for (let i = 0; i < walkers; i++) walker();
    if (env.parasols) for (let i = 0; i < Math.round(14 * env.crowd); i++) person(R.range(212, 398), 503, 12.5, 0.55, R.chance(0.6));
  }

  function accLights() {
    const z = 0.46, L = env.lights;
    const point = (x, y, size, col, zz) => {
      if (L > 0.3) dab('lights', x, y, 0, 1, size * 3, V(env.glow(col, zz), 0.03, 0.02), 0.14 + 0.14 * L, { round: true });
      dab('lights', x, y, 0, 1, size, V(env.glow(col, zz), 0.03, 0.02), 0.9, { round: true });
    };
    for (const cx of ARCHES) {
      const n = 2 + Math.round(4 * L);
      for (let i = 0; i < n; i++) point(cx + R.range(-28, 28), R.range(420, 450), R.range(3.2, 4.8), R.chance(0.5) ? A.lamp : [1, 0.93, 0.72], z);
    }
    if (env.weather === 'fog') {
      for (const size of [66, 46, 32]) dab('lights', SUN.x, SUN.y, 0, 1, size, V(env.sunDisc, 0.01, 0.01), 0.1, { round: true });
      dab('lights', SUN.x, SUN.y, 0, 1, 23, V(env.sunDisc, 0.01, 0.01), 0.92, { round: true });
    }
    if (L > 0.2) {
      for (const x of LAMPS) point(x, 485, 4.4, A.lamp, 0.4);
      for (let f = 1; f < 7; f++) for (let j = 0; j < 11; j++) {
        if (R.chance(L * 0.22)) dab('lights', TOWER_X + j * BAY + BAY / 2 + R.range(-4, 4), ARCH_TOP - f * FLOOR + FLOOR / 2 + R.range(-4, 4), HALF, R.range(20, 30), R.range(11, 16), V(env.glow(mix(A.lamp, [1, 0.72, 0.42], R()), z), 0.04, 0.03), 0.5);
      }
      for (let x = 214; x < STONE_X - 16; x += R.range(24, 40)) point(x, 470 + R.range(-3, 3), R.range(3, 4.5), A.lamp, 0.6);
    }
  }

  function accWater() {
    const zt = 0.46;
    const inWater = (x, y) => y > (x < 196 ? 580 : waterY(x) + 5) && !(Math.abs(x - 575) < 178 && y < 581);
    const near = (y) => clamp((y - 570) / 230, 0, 1);

    // reflected mullions wriggle on the ripples
    for (let j = 0; j <= 10; j++) {
      const x = TOWER_X + j * BAY;
      let i = 0;
      for (let y = reflectY(j % 2 ? ARCH_TOP : ARCH_BASE) + 5; y < H - 3; y += R.range(8, 10.5), i++) {
        dab('water', x + (i % 2 ? 2.4 : -2.4) + R.range(-1.2, 1.2), y, HALF + (i % 2 ? 0.55 : -0.55), 11.5, R.range(2.2, 3.2), V(mix(env.shade(R.chance(0.4) ? A.bronzeHi : A.bronze, 0.7, zt), waterCol, 0.4), 0.04, 0.02, 0.02), 0.6);
      }
    }
    for (const cx of ARCHES) {
      for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
        const p = archPoint(cx, side, (i + 0.5) / 6);
        dab('water', p[0] + R.range(-2.5, 2.5), reflectY(p[1]), Math.atan2(-REFLECT * Math.sin(p[2]), Math.cos(p[2])) * 0.6, 10, 2.6, V(mix(env.shade(A.bronzeHi, 0.7, zt), waterCol, 0.4), 0.04, 0.02, 0.02), 0.55);
      }
      const n = 3 + Math.round(5 * env.lights);
      for (let i = 0; i < n; i++) dab('water', cx + R.range(-24, 24), reflectY(R.range(418, 452)) + R.range(-2, 2), 0, R.range(7, 15), R.range(1.8, 2.8), V(mix(env.glow(A.lamp, zt), waterCol, 0.35), 0.04, 0.03), 0.5 + 0.25 * env.lights);
    }

    // dark troughs, then the light the ripples catch
    const scatter = (count, make) => {
      for (let i = 0; i < count; i++) {
        const x = R.range(view.x, view.x + view.w), y = lerp(580, H, Math.pow(R(), 0.8));
        if (inWater(x, y)) make(x, y, near(y));
      }
    };
    scatter(150, (x, y, n) => dab('water', x, y, R.range(-0.04, 0.04), R.range(14, 30) * (0.6 + n), R.range(2, 3.4) * (0.6 + 0.6 * n), V(mix(scale(waterCol, 0.62), [0.16, 0.12, 0.30], R() * 0.4), 0.04, 0.025, 0.02), 0.42));
    const sheen = mix(env.skyLow, [1, 1, 1], env.sunny ? 0.6 : 0.25), skyMid = mix(env.skyTop, env.skyLow, 0.5);
    scatter({ sunny: 140, cloudy: 80, fog: 50, rain: 40 }[env.weather], (x, y, n) => dab('water', x, y, R.range(-0.04, 0.04), R.range(6, 20) * (0.5 + n), R.range(1.5, 2.8) * (0.6 + 0.6 * n), V(mix(skyMid, sheen, Math.sqrt(R())), 0.03, 0.015, 0.02), R.range(0.4, 0.8) * (env.sunny ? 1 : 0.7)));

    for (const b of BUOYS) {
      dab('water', b.x, b.y - 0.5, 0, 1, 15, V(env.shade(b.col, 1, 0.1), 0.02, 0.012), 0.97, { round: true });
      dab('water', b.x - 1.5, b.y + 3.2, 0.05, 9, 5, V(env.shade(b.col, 0.1, 0.1), 0.03, 0.02), 0.75);
      dab('water', b.x + 2.5, b.y - 3.5, 0.3, 4, 2.6, V(env.shade([1, 1, 1], 1, 0.1), 0.01, 0.005), 0.8);
      for (let i = 0; i < 4; i++) dab('water', b.x + (i % 2 ? 2 : -2), b.y + 10 + i * 4, 0, 9 - i, 2.4, V(mix(env.shade(b.col, 0.6, 0.1), waterCol, 0.35 + i * 0.1), 0.03, 0.02), 0.6);
    }

    const afloat = (count, make) => {
      for (let i = 0; i < count; i++) {
        const x = R.range(view.x, view.x + view.w), y = waterY(x) + 6 + Math.pow(R(), 2) * 150;
        if (inWater(x, y)) make(x, y);
      }
    };
    if (env.season === 'autumn') {
      const leaves = env.leafAlt.concat([env.leafLit, env.leafDark, env.birchLit]);
      afloat(90, (x, y) => dab('water', x, y, R.range(0, Math.PI), R.range(3.5, 6), R.range(2.6, 3.8), V(env.shade(R.pick(leaves), 0.9, 0.12), 0.04, 0.03, 0.03), 0.92));
    }
    if (env.season === 'spring') afloat(50, (x, y) => dab('water', x, y, 0, 1, R.range(2.4, 3.2), V(env.shade(R.pick(env.blossom), 0.9, 0.12), 0.03, 0.015), 0.9, { round: true }));
    if (env.snow > 0.5) afloat(45, (x, y) => dab('water', x, y, R.range(-0.05, 0.05), R.range(14, 30), R.range(2.4, 4), V(env.shade(A.snow, 0.8, 0.12), 0.02, 0.01), 0.3));
    if (env.wet) afloat(45, (x, y) => dab('water', x, y + 30, 0, R.range(8, 14), 1.2, V(sheen, 0.02, 0.01), 0.4, { bend: R.chance(0.5) ? 0.3 : -0.3 }));
    if (env.weather === 'fog') {
      for (let i = 0; i < 30; i++) {
        const f = i / 29;
        dab('water', SUN.x + R.gauss() * (5 + 12 * f), lerp(586, 792, f) + R.range(-3, 3), R.range(-0.05, 0.05), R.range(8, 14) + 16 * f, R.range(2.2, 3.6), V(mix(env.sunDisc, waterCol, 0.25), 0.03, 0.03), 0.6);
      }
    }
  }

  function accWeather() {
    if (env.weather !== 'fog') return;
    for (let i = 0; i < 150; i++) {
      dab('weather', R.range(view.x - 40, view.x + view.w + 40), Math.pow(R(), 1.3) * 620, R.range(-0.14, 0.14), R.range(110, 220), R.range(26, 46), V(env.fogC, 0.015, 0.006, 0.008), R.range(0.04, 0.09));
    }
  }

  function accSign() {
    const x = view.x + view.w - 58, y = H - 30, ink = env.fogged([0.84, 0.20, 0.13], 0.05);
    const mark = (dx, dy, a, len) => dab('sign', x + dx, y + dy, a, len, 2.3, V(ink, 0.02, 0.01), 0.9, { round: true });
    mark(8, -8, 0, 12); mark(9, 0, HALF + 0.06, 17); mark(5, 6.8, 0.41, 8.5);
    mark(22, 0, HALF + 0.06, 17); mark(33, 0, HALF + 0.06, 17); mark(27.5, 0, -0.12, 11);
  }

  accSketch(); accStructure(); accFoliage(); accFigures(); accLights(); accWater(); accWeather(); accSign();

  // Where falling leaves and petals come from.
  const sources = [];
  if (env.falling === 'leaf' || env.falling === 'petal') {
    for (const t of trees) {
      if (env.canopy === 0 || (env.falling === 'petal' && !t.blossom)) continue;
      const cols = env.falling === 'petal' ? env.blossom.map((b) => env.shade(b, 1, t.z)) : [leafColor(t, 0.9), leafColor(t, 0.5), leafColor(t, 0.2), leafColor(t, 0.7)];
      sources.push({ x: t.x + t.lean, y: t.cy, rx: t.rx, ry: t.ry, base: t.base, cols });
    }
  }

  // A latecomer strolling in, for the painter to add once the picture has settled.
  const arrive = () => { const from = groups.figures.length; walker(); return groups.figures.splice(from); };

  const small = makeCanvas(Math.round(rw / 6), Math.round(rh / 6));
  const sc = small.getContext('2d', { willReadFrequently: true });
  sc.imageSmoothingQuality = 'high';
  sc.drawImage(ref, 0, 0, small.width, small.height);

  return {
    env, view, seed, ref, idMap, groups, sources, arrive, waterCol,
    rw, rh, refData: c.getImageData(0, 0, rw, rh).data, idData: k.getImageData(0, 0, rw, rh).data,
    bw: small.width, bh: small.height, blurData: sc.getImageData(0, 0, small.width, small.height).data,
    snow: env.shade(A.snow, 1, 0.3)
  };
}
