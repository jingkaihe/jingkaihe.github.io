// Parliament Hill, Hampstead Heath: a motif, and everything that belongs to it alone.
//
// The view south from the hill: the meadow falling away to the path at its
// foot; the running track, the playground and the paddling pool beyond; a belt
// of trees with the Lombardy poplars standing clear of it; and London along
// the horizon from the Shard to the BT Tower, under a sky that fills nearly
// half the picture.
//
// It is painted the way the Impressionists painted such a view: hardly an
// outline, the grass built from separate touches of yellow-green, blue-green,
// violet and rose, shadows that are cool rather than dark, and the far city
// dissolving into the air. buildScene() lays the view out as flat shapes on a
// small hidden canvas (the "reference") alongside a map of which surface is
// where, and lists the marks a painter would place by hand. After it come the
// kite and the birds and, last, the parliamentHill object the page paints from.
//
// Coordinates are in the 1200 x 800 scene space.

import { makeRng, mix, mul, scale, css, clamp, lerp, vary } from './util.js';
import { W, H, RS, idCss, makeCanvas, poly, rect, ellipse } from './sheet.js';
import { environment } from './climate.js';
import { drawStroke } from './brush.js';

const HALF = Math.PI / 2;
const HORIZON = 338;                          // where the far city meets the sky
const PATH_Y = 522;                           // the path along the foot of the meadow
const SUN = { x: 860, y: 128 };               // where the sun stands when fog lets it show

// How far off things are. The haze is reckoned from these, so they run well
// past 1: the city is miles away and should all but dissolve into the sky.
const Z = { far: 7, towers: 4.5, city: 3, block: 2.2, town: 1.3, trees: 0.8, poplar: 0.65, park: 0.5 };
const nearness = (y) => clamp((y - PATH_Y) / (H - PATH_Y), 0, 1);      // of a spot on the meadow: 0 at the path, 1 at our feet
const meadowZ = (y) => lerp(0.42, 0.03, nearness(y));
const tall = (y) => Math.max(9, 0.45 * (y - 500));                     // how tall a grown-up stands with their feet at y

// A height that changes along the picture: straight runs between [x, y] posts.
const along = (posts) => (x) => {
  for (let i = 1; i < posts.length; i++) {
    if (x <= posts[i][0] || i === posts.length - 1) {
      const a = posts[i - 1], b = posts[i];
      return lerp(a[1], b[1], clamp((x - a[0]) / (b[0] - a[0]), 0, 1));
    }
  }
};

// The skyline, left to right: [x, top, half width, tone from glass (0) to stone (1)].
const SHARD = { x: 61, top: 281 };
const SKYLINE = [
  [78, 322, 6, 0.4], [91, 327, 8, 0.7], [104, 331, 5, 0.3], [259, 312, 5, 0.6], [275, 315, 7, 0.1], [316, 319, 5, 0.5],
  [358, 330, 4, 0.4], [404, 327, 5, 0.6], [457, 329, 4, 0.5], [786, 331, 6, 0.6], [826, 330, 4, 0.3], [862, 323, 4, 0.2],
  [872, 320, 3.5, 0.5], [881, 326, 4, 0.2], [896, 332, 5, 0.6], [1012, 333, 5, 0.5]
];
const CRANES = [[120, 321, 1], [138, 326, -1], [990, 326, 1], [1044, 330, -1]];      // x, top, which way the jib points
const EYE = { x: 577, y: 332, r: 8 };                       // the London Eye, just clear of the trees
const BT = { x: 752, top: 292 };
const EUSTON = { x0: 686, x1: 711, top: 313 };              // the dark glass tower beside it
const BLOCK = { x0: 591, x1: 648, top: 270, foot: 392, floor: 6.6, side: 14 };      // the tower block that stands up over the poplars
const SLABS = [[206, 354, 35, 46], [361, 343, 35, 38]];     // two pale blocks of flats among the roofs
const HALL = { x0: 683, x1: 846, ridge: 388, eaves: 412, foot: 440 };      // the long dark roof right of the poplars
const TERRACE = { x0: 872, x1: 1138, eaves: 429, foot: 458 };
const POPLAR_BASE = 496;
const POPLARS = [[437, 324, 19], [472, 332, 16], [496, 330, 16], [530, 334, 17], [570, 349, 18], [629, 358, 15], [649, 350, 15], [671, 349, 17]];      // x, top, half width

// The top of each rank of trees, back to front, and of whatever stands in the park below them.
const backY = () => 411;
const midY = along([[0, 438], [430, 440], [520, 450], [700, 452], [860, 454], [900, 474], [1080, 474], [1130, 452], [1200, 448]]);
const frontY = along([[0, 474], [430, 476], [745, 480], [800, 492], [1080, 492], [1130, 478], [1200, 474]]);
const parkTop = along([[0, 478], [236, 478], [240, 489], [745, 487], [750, 500], [1140, 500], [1146, 483], [1200, 483]]);

// How wide a poplar is, f of the way down from its tip; and its outline,
// shifted and squeezed to give the lit side.
const poplarW = (p, f) => p[2] * (f < 0.6 ? Math.pow(Math.sin(f / 0.6 * HALF), 0.75) : 1 - 0.35 * Math.pow((f - 0.6) / 0.4, 2));
function poplarPath(p, shift, squeeze) {
  const pts = [], n = 12, h = POPLAR_BASE - p[1];
  for (let i = 0; i <= n; i++) pts.push(p[0] + shift + poplarW(p, i / n) * squeeze, p[1] + h * i / n);
  for (let i = n; i >= 0; i--) pts.push(p[0] + shift - poplarW(p, i / n) * squeeze, p[1] + h * i / n);
  return poly(pts);
}

// The running track, seen so obliquely that it is a long thin oval. k runs
// across it from the inside lane (0) to the outside (1).
const TRACK = { x: 62, y: 500, rx: 176, ry: 19 };
const lane = (k) => ({ y: TRACK.y - 3 * (1 - k), rx: TRACK.rx - 26 * (1 - k), ry: TRACK.ry - 9 * (1 - k) });
const FLOODS = [[22, 384], [184, 392], [201, 398]];         // floodlights: x, top
const HUTS = [[338, 493, 30, 21, 'hut'], [380, 496, 44, 18, 'hut'], [432, 501, 22, 14, 'shed'], [700, 493, 46, 25, 'shed'], [1146, 486, 60, 36, 'lodge']];
const PLAY = { x0: 461, x1: 745, ground: 516 };
const POOL = [751, 509, 922, 509, 930, 520, 745, 520];

// The trail worn down the meadow: [x, y, width]. Our feet are at the bottom.
const TRAIL = [[620, 526, 3], [632, 544, 4.5], [651, 574, 6.5], [678, 617, 9], [700, 650, 11], [722, 677, 13], [735, 700, 15], [772, 716, 18], [814, 729, 21], [846, 754, 27], [868, 806, 36]];
const FORK = [[836, 742, 12], [896, 768, 18], [938, 808, 28]];
const PUDDLES = [[703, 652, 9, 2.5], [778, 718, 15, 3.5], [851, 763, 20, 5]];
// Where the trail is at height y: [x, half width, direction].
function trailAt(y) {
  for (let i = 1; i < TRAIL.length; i++) {
    const a = TRAIL[i - 1], b = TRAIL[i];
    if (y <= b[1] || i === TRAIL.length - 1) {
      const t = clamp((y - a[1]) / (b[1] - a[1]), 0, 1);
      return [lerp(a[0], b[0], t), lerp(a[2], b[2], t) / 2, Math.atan2(b[1] - a[1], b[0] - a[0])];
    }
  }
}
const onTrail = (x, y) => { const t = trailAt(y); return y > PATH_Y + 3 && Math.abs(x - t[0]) < t[1] + 3; };

const SHRUBS = [{ x: 268, base: 706, cy: 672, rx: 40, ry: 27, z: 0.1 }, { x: 1182, base: 660, cy: 628, rx: 34, ry: 30, z: 0.16 }];
const CHILD = { x: 822, feet: 722, h: 70 };                 // the child going down the trail
const FLYER = { x: 530, feet: 662 };                        // whoever is flying the kite
FLYER.h = tall(FLYER.feet);
const HAND = { x: FLYER.x - 0.2 * FLYER.h, y: FLYER.feet - 0.98 * FLYER.h };      // the raised hand the line runs from

// Local colours, before any light falls on them.
const A = {
  glass: [0.42, 0.50, 0.64], concrete: [0.80, 0.78, 0.76], dark: [0.20, 0.25, 0.36], panel: [0.92, 0.91, 0.88], window: [0.32, 0.38, 0.52],
  town: [0.66, 0.60, 0.58], cream: [0.93, 0.87, 0.74], brick: [0.70, 0.42, 0.33], stock: [0.80, 0.68, 0.48], slate: [0.36, 0.36, 0.44],
  tile: [0.46, 0.36, 0.36], terracotta: [0.82, 0.52, 0.38], stone: [0.84, 0.76, 0.62], white: [0.96, 0.96, 0.94],
  track: [0.80, 0.34, 0.26], sand: [0.90, 0.82, 0.62], net: [0.44, 0.72, 0.56], pole: [0.80, 0.80, 0.82],
  hut: [0.24, 0.38, 0.32], shed: [0.46, 0.35, 0.30], lodge: [0.30, 0.27, 0.28], roofing: [0.72, 0.72, 0.74],
  timber: [0.78, 0.56, 0.32], bark: [0.76, 0.64, 0.46], rubber: [0.42, 0.64, 0.88], pool: [0.62, 0.84, 0.95], drained: [0.72, 0.80, 0.86],
  path: [0.84, 0.81, 0.76], earth: [0.80, 0.66, 0.48], trunk: [0.34, 0.27, 0.27], twig: [0.50, 0.42, 0.44],
  snow: [0.96, 0.97, 1.0], lamp: [1.0, 0.84, 0.50], red: [0.92, 0.22, 0.16], yellow: [0.98, 0.80, 0.22], blue: [0.24, 0.44, 0.76]
};
const MASONRY = [A.cream, A.brick, A.slate, A.white, A.terracotta, A.concrete, A.cream, A.brick, A.stock];
// What an Impressionist reaches for instead of a darker or a lighter green.
const SUNLIT = [1.0, 0.94, 0.42], COOL = [0.18, 0.46, 0.48], VIOLET = [0.40, 0.32, 0.66], ROSE = [0.97, 0.68, 0.58], SHADOW = [0.34, 0.34, 0.62];

// Which surface a pixel belongs to, and how that surface likes to be brushed:
// angle = stroke direction, jit = angular scatter, len/w = size multipliers,
// dl/dab/temp = how far colour may wander in lightness, chroma and warmth,
// calm = share of small detail strokes it accepts (open sky wants few),
// loose = its dabs go their own way instead of following edges. Colour is
// allowed to wander further here than at Eden Dock: that is the broken colour.
const ID = { sky: 1, cloud: 2, far: 3, city: 4, block: 5, trees: 6, poplar: 7, park: 8, track: 9, path: 10, lea: 11, slope: 12, near: 13, earth: 14, pool: 15, snow: 16, shrub: 17 };
const REGION = [];
REGION[0] = { angle: () => 0, jit: 0.6, len: 0.8, w: 0.9, dl: 0.03, dab: 0.015, temp: 0.015 };
REGION[ID.sky] = { angle: (x, y) => -0.25 + 0.35 * Math.sin(x / 210 + y / 130), jit: 0.35, len: 1.2, w: 1.1, dl: 0.02, dab: 0.01, temp: 0.014, calm: 0.35 };
REGION[ID.cloud] = { angle: (x, y) => 0.25 * Math.sin(x / 80 + y / 40), jit: 0.6, len: 0.9, w: 1.1, dl: 0.026, dab: 0.008, temp: 0.018, calm: 0.6 };
REGION[ID.far] = { angle: () => HALF, alt: 0, altP: 0.4, jit: 0.15, len: 0.75, w: 0.9, dl: 0.02, dab: 0.012, temp: 0.018 };
REGION[ID.city] = { angle: () => 0, alt: HALF, altP: 0.3, jit: 0.2, len: 0.8, w: 0.9, dl: 0.035, dab: 0.02, temp: 0.03 };
REGION[ID.block] = { angle: () => 0, alt: HALF, altP: 0.3, jit: 0.08, len: 0.8, w: 0.8, dl: 0.03, dab: 0.014, temp: 0.024 };
REGION[ID.trees] = { angle: () => 0, jit: 1.6, len: 0.65, w: 0.95, dl: 0.045, dab: 0.026, temp: 0.028, loose: true };
REGION[ID.poplar] = { angle: () => -HALF, jit: 0.3, len: 0.8, w: 0.85, dl: 0.045, dab: 0.026, temp: 0.028, loose: true };
REGION[ID.park] = { angle: () => 0, alt: HALF, altP: 0.35, jit: 0.3, len: 0.8, w: 0.9, dl: 0.035, dab: 0.022, temp: 0.026 };
REGION[ID.track] = { angle: (x, y) => { const th = Math.atan2((y - TRACK.y) / TRACK.ry, (x - TRACK.x) / TRACK.rx); return Math.atan2(TRACK.ry * Math.cos(th), -TRACK.rx * Math.sin(th)); }, jit: 0.1, len: 1, w: 0.7, dl: 0.03, dab: 0.025, temp: 0.025 };
REGION[ID.path] = { angle: () => 0, jit: 0.06, len: 1.2, w: 0.6, dl: 0.03, dab: 0.012, temp: 0.022 };
REGION[ID.lea] = { angle: () => 0, jit: 0.25, len: 1.1, w: 0.9, dl: 0.03, dab: 0.016, temp: 0.022, loose: true };
REGION[ID.slope] = { angle: (x, y) => -0.7 + 0.4 * Math.sin(x / 150 + y / 70), alt: 0, altP: 0.4, jit: 0.45, len: 0.95, w: 0.95, dl: 0.034, dab: 0.019, temp: 0.025, loose: true };
REGION[ID.near] = { angle: (x) => -HALF - 0.2 + 0.15 * Math.sin(x / 120), alt: -0.3, altP: 0.25, jit: 0.3, len: 0.9, w: 0.95, dl: 0.038, dab: 0.022, temp: 0.028, loose: true };
REGION[ID.earth] = { angle: (x, y) => trailAt(y)[2], jit: 0.3, len: 0.7, w: 0.8, dl: 0.035, dab: 0.02, temp: 0.03, loose: true };
REGION[ID.pool] = { angle: () => 0, jit: 0.05, len: 1.1, w: 0.6, dl: 0.03, dab: 0.015, temp: 0.015 };
REGION[ID.snow] = { angle: (x, y) => 0.08 * Math.sin(x / 160 + y / 60), jit: 0.3, len: 1, w: 0.9, dl: 0.022, dab: 0.012, temp: 0.024 };
REGION[ID.shrub] = { angle: () => 0, jit: 1.6, len: 0.45, w: 0.8, dl: 0.05, dab: 0.035, temp: 0.035, loose: true };

function buildScene(season, weather, seed, view) {
  const env = environment(season, weather);
  const R = makeRng(seed);
  const rw = Math.round(W * RS), rh = Math.round(H * RS);
  const ref = makeCanvas(rw, rh), idMap = makeCanvas(rw, rh);
  const c = ref.getContext('2d', { willReadFrequently: true });
  const k = idMap.getContext('2d', { willReadFrequently: true });
  c.scale(RS, RS); k.scale(RS, RS);
  c.lineCap = k.lineCap = 'round';

  const S = (albedo, lit, z) => css(env.shade(albedo, lit, z));
  const V = (col, dl, dab, dt) => vary(col, R, (dl === undefined ? 0.035 : dl) * env.hush, (dab === undefined ? 0.02 : dab) * env.hush, (dt === undefined ? 0.02 : dt) * env.hush);
  const fill = (path, color, id, alpha) => {
    if (alpha !== undefined) c.globalAlpha = alpha;
    c.fillStyle = color; c.fill(path);
    c.globalAlpha = 1;
    if (id) { k.fillStyle = idCss(id); k.fill(path); }
  };
  const line = (pts, color, width, alpha, id) => {
    for (const g of id ? [c, k] : [c]) {
      g.globalAlpha = g === c && alpha !== undefined ? alpha : 1;
      g.strokeStyle = g === c ? color : idCss(id); g.lineWidth = width;
      g.beginPath(); g.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.stroke();
      g.globalAlpha = 1;
    }
  };

  const groups = { sketch: [], structure: [], front: [], foliage: [], water: [], figures: [], lights: [], weather: [], sign: [] };
  const dab = (group, x, y, a, len, w, col, alpha, extra) => {
    const s = { x, y, a, len, w, col, alpha: alpha === undefined ? 0.92 : alpha };
    if (extra) Object.assign(s, extra);
    groups[group].push(s);
  };

  const snowy = env.snow > 0.5, leafless = env.canopy === 0, cap = snowy ? A.snow : null;
  const flying = weather === 'sunny' || weather === 'cloudy';       // kite weather
  // Where the grass has dried out in summer; in spring the same drifts are in flower.
  const dry = { spring: mix(env.grass, [1.0, 0.92, 0.36], 0.45), summer: [0.92, 0.82, 0.52], autumn: [0.84, 0.64, 0.36], winter: [0.82, 0.74, 0.54] }[season];
  const lush = mix(env.grass, [0.12, 0.38, 0.22], 0.5);
  const pathA = snowy ? mix(A.path, A.snow, 0.6) : env.wet ? mix(scale(A.path, 0.6), env.skyLow, 0.3) : A.path;
  const earthA = snowy ? mix(A.earth, A.snow, 0.4) : env.wet ? mix(scale(A.earth, 0.55), env.skyLow, 0.2) : A.earth;
  const trackA = snowy ? mix(A.track, A.snow, 0.55) : env.wet ? scale(A.track, 0.8) : A.track;
  const poolA = season === 'winter' ? A.drained : A.pool;
  const SETS = { leaf: [env.leafLit, env.leafDark], birch: [env.birchLit, env.birchDark], ever: [env.everLit, env.everDark] };
  const poplarSet = season === 'autumn' ? SETS.birch : [mix(env.leafLit, env.everLit, 0.5), mix(env.leafDark, env.everDark, 0.6)];

  // ------------------------------------------------------------- what is where

  // Fair-weather clouds in three ranks: big overhead, small and flat towards the horizon.
  const clouds = [];
  if (env.sunny) {
    for (const [n, y0, y1, w0, w1, far] of [[env.clouds + 3, 262, 316, 70, 150, 0.85], [env.clouds + 2, 165, 245, 140, 250, 0.4], [env.clouds, 50, 138, 230, 380, 0]]) {
      for (let i = 0; i < n; i++) clouds.push({ x: (i + R.range(0.1, 0.9)) / n * (W + 160) - 80, y: R.range(y0, y1), w: R.range(w0, w1), far });
    }
  }

  // The city between the horizon and the trees: rows of roofs and walls, with trees among them.
  const blocks = [];
  for (let y = HORIZON + 18; y < 408; y += R.range(6.5, 9)) {
    const f = (y - HORIZON) / 70, z = lerp(Z.city + 0.6, Z.town, f);
    for (let x = R.range(-24, 0); x < W + 10; x += R.range(14, 34) * (0.7 + 0.5 * f)) {
      blocks.push({ x, y, w: R.range(11, 26) * (0.7 + 0.6 * f), h: R.range(4.5, 8) * (0.7 + 0.8 * f), z, tree: R.chance(0.3), col: R.pick(MASONRY), lit: R.range(0.45, 1), roof: R.chance(0.5) });
    }
  }

  // Three ranks of trees between the city and the park.
  const crowns = [];
  const plant = (step, cy, rx, ry, z, tier) => {
    for (let x = -20 + R.range(0, step); x < W + 20; x += step * R.range(0.7, 1.3)) {
      crowns.push({
        x, cy: cy(x) + R.range(-5, 5), rx: rx * R.range(0.8, 1.25), ry: ry * R.range(0.8, 1.2), z, tier,
        kind: R.chance(0.13) ? 'ever' : R.chance(0.22) ? 'birch' : 'leaf', blossom: R.chance(0.2), lit: R.range(0.7, 1)
      });
    }
  };
  plant(33, backY, 25, 19, Z.trees + 0.3, 0);
  plant(40, midY, 33, 25, Z.trees, 1);
  plant(46, frontY, 37, 27, Z.trees - 0.15, 2);
  const bare = (t) => leafless && t.kind !== 'ever';
  const inCrown = (x, y, from) => crowns.some((t) => t.tier >= from && (x - t.x) * (x - t.x) / (t.rx * t.rx) + (y - t.cy) * (y - t.cy) / (t.ry * t.ry) < 1);
  const inPoplar = (x, y) => POPLARS.some((p) => y > p[1] && y < POPLAR_BASE && Math.abs(x - p[0]) < poplarW(p, (y - p[1]) / (POPLAR_BASE - p[1])) + 2);
  // Is this spot behind the trees (those of rank "from" and nearer)?
  const hidden = (x, y, from) => y > midY(x) - 16 || inPoplar(x, y) || inCrown(x, y, from === undefined ? 1 : from);

  const houses = [];
  for (let x = TERRACE.x0; x < TERRACE.x1 - 10;) {
    const w = R.range(20, 27);
    houses.push({ x, w, ridge: 411 + R.range(-2, 2), wall: R.pick([A.cream, A.brick, A.brick, A.stock]), lit: R.range(0.5, 0.8) });
    x += w;
  }
  const frames = [];                                        // the playground's timber towers
  for (let x = PLAY.x0 + 10; x < 694; x += R.range(18, 34)) if (x < 604 || x > 690) frames.push({ x, w: R.range(8, 14), h: R.range(12, 24), roof: R.chance(0.7) });

  // Drifts of dry (in spring, flowering) grass and of lusher green across the meadow.
  const patches = [
    [300, 562, 340, 8, 'dry', 0.8], [960, 594, 270, 36, 'dry', 0.85], [1090, 556, 140, 10, 'dry', 0.7], [690, 546, 150, 6, 'dry', 0.6],
    [140, 612, 200, 11, 'dry', 0.5], [520, 640, 180, 12, 'dry', 0.35], [230, 742, 340, 60, 'lush', 0.7], [640, 782, 300, 44, 'lush', 0.6], [1060, 716, 190, 46, 'lush', 0.5]
  ].map((p) => ({ x: p[0], y: p[1], rx: p[2], ry: p[3], kind: p[4], a: p[5] }));
  for (let i = 0; i < 7; i++) patches.push({ x: R.range(0, W), y: R.range(560, 710), rx: R.range(60, 170), ry: R.range(5, 15), kind: R.chance(0.6) ? 'dry' : 'lush', a: R.range(0.25, 0.5) });
  // How dry and how lush the grass is at a spot, and so its local colour.
  const cover = (x, y) => {
    let d = 0, l = 0;
    for (const p of patches) {
      const u = (x - p.x) / p.rx, v = (y - p.y) / p.ry, q = u * u + v * v;
      if (q < 1) { if (p.kind === 'dry') d = Math.max(d, p.a * (1 - q * 0.5)); else l = Math.max(l, p.a * (1 - q * 0.5)); }
    }
    return [d, l];
  };
  const turf = (x, y) => {
    const cv = cover(x, y), n = nearness(y);
    return mix(mix(mix(mix(env.grass, dry, 0.3), mix(env.grass, lush, 0.5), n), dry, cv[0]), lush, cv[1]);
  };

  const leafSet = (t) => SETS[t.kind];
  function leafColor(t, l) {
    const set = leafSet(t);
    if (t.blossom && env.blossom && R.chance(0.6)) return V(env.shade(R.pick(env.blossom), 0.5 + 0.5 * l, t.z), 0.03, 0.015, 0.01);
    if (env.leafAlt && R.chance(0.22)) return V(env.shade(R.pick(env.leafAlt), 0.4 + 0.6 * l, t.z), 0.04, 0.03, 0.03);
    if (l > 0.66) return V(env.shade(R.chance(0.2) ? mix(set[0], SUNLIT, 0.3) : mix(set[0], set[1], 0.15), 0.95, t.z), 0.04, 0.025, 0.03);
    if (l < 0.38) return V(env.shade(mix(set[1], VIOLET, R.range(0, 0.3)), 0.14, t.z), 0.04, 0.025, 0.03);
    return V(env.shade(mix(set[0], set[1], 0.6), 0.45, t.z), 0.04, 0.025, 0.03);
  }

  // ---------------------------------------------------------------- reference

  function cloud(cl) {
    const h = cl.w * lerp(0.34, 0.2, cl.far), n = R.int(6, 9), zc = 1 + cl.far * 5;
    const lit = env.shade([1, 1, 1], 1, zc), shadow = env.shade([0.80, 0.80, 0.93], 0.4, zc), warm = env.shade([1, 0.95, 0.84], 1, zc);
    fill(ellipse(cl.x, cl.y - h * 0.1, cl.w * 0.5, h * 0.24), css(shadow), ID.cloud, 0.85);
    cl.puffs = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1) - 0.5, up = h * (1 - 2.6 * t * t) * R.range(0.6, 1);
      const px = cl.x + t * cl.w * 0.86, rx = cl.w * R.range(0.13, 0.2), ry = Math.max(h * 0.2, up * 0.55), py = cl.y - h * 0.16 - up * 0.5;
      fill(ellipse(px, py + ry * 0.35, rx, ry * 0.8), css(shadow), ID.cloud, 0.7);
      fill(ellipse(px, py, rx, ry * 0.85), css(lit), ID.cloud, 0.95);
      fill(ellipse(px + rx * 0.25, py - ry * 0.2, rx * 0.6, ry * 0.5), css(warm), 0, 0.8);
      cl.puffs.push([px, py, rx, ry]);
    }
  }

  function drawSky() {
    const g = c.createLinearGradient(0, 0, 0, HORIZON + 6);
    g.addColorStop(0, css(env.skyTop));
    g.addColorStop(0.55, css(mix(env.skyTop, env.skyLow, 0.6)));
    g.addColorStop(1, css(mix(env.skyLow, [1, 1, 1], 0.25)));
    fill(rect(-5, -5, W + 10, HORIZON + 30), g, ID.sky);
    if (env.sunny) {
      for (const cl of clouds) cloud(cl);
    } else if (weather !== 'fog') {
      const dark = mix(env.skyTop, [0.36, 0.38, 0.46], env.wet ? 0.35 : 0.18);
      const light = mix(env.skyLow, [1, 1, 1], env.wet ? 0.25 : 0.55);
      for (let i = 0; i < 46; i++) {
        const y = R.range(-20, HORIZON - 14), f = y / HORIZON;
        fill(ellipse(R.range(-80, W + 80), y, R.range(90, 240) * (1.1 - 0.5 * f), R.range(26, 64) * (1.1 - 0.7 * f)), css(mix(dark, light, R())), ID.cloud, 0.5);
      }
    } else {
      const g2 = c.createRadialGradient(SUN.x, SUN.y, 1, SUN.x, SUN.y, 96);
      g2.addColorStop(0, css(env.sunDisc, 0.96)); g2.addColorStop(0.13, css(env.sunDisc, 0.92));
      g2.addColorStop(0.2, css(env.sunDisc, 0.34)); g2.addColorStop(1, css(env.sunDisc, 0));
      c.fillStyle = g2; c.fillRect(SUN.x - 96, SUN.y - 96, 192, 192);
    }
  }

  // The far country, with hills to the right, and the towers that stand on it.
  function drawFar() {
    const land = [-5, HORIZON + 16];
    for (let x = -5; x <= W + 25; x += 30) land.push(x, HORIZON - 1 - (x > 860 ? 5 * Math.sin((x - 860) / 345 * Math.PI) : 0) + R.range(-1, 1));
    land.push(W + 25, HORIZON + 16);
    fill(poly(land), S([0.46, 0.54, 0.62], 0.6, Z.far + 3), ID.far);
    for (const t of SKYLINE) {
      const tone = mix(A.glass, A.concrete, t[3]);
      fill(rect(t[0] - t[2], t[1], t[2] * 2, HORIZON + 14 - t[1]), S(tone, 0.5, Z.far), ID.far);
      fill(rect(t[0] + t[2] * 0.2, t[1], t[2] * 0.8, HORIZON + 14 - t[1]), S(tone, 1.1, Z.far), 0, 0.7);      // the side the sun is on
    }
    fill(poly([SHARD.x, SHARD.top, SHARD.x + 8.5, HORIZON + 14, SHARD.x - 8.5, HORIZON + 14]), S(A.glass, 0.7, Z.far), ID.far);
    fill(ellipse(48, 335, 6.5, 6.5), S(A.concrete, 0.7, Z.far), ID.far);                                    // the dome of St Paul's
    const tz = Z.towers;
    fill(rect(BT.x - 2.8, BT.top + 8, 5.6, 60), S(A.glass, 0.6, tz), ID.far);
    fill(rect(BT.x - 5.5, BT.top + 10, 11, 20), S(mix(A.glass, A.concrete, 0.45), 0.75, tz), ID.far);
    fill(rect(BT.x - 3.8, BT.top + 2, 7.6, 7), S(A.glass, 0.6, tz), ID.far);
    line([BT.x, BT.top - 8, BT.x, BT.top + 2], S(A.glass, 0.5, tz), 1.4);
    fill(rect(EUSTON.x0, EUSTON.top, EUSTON.x1 - EUSTON.x0, 60), S(A.dark, 0.5, tz - 0.5), ID.far);
    fill(rect(EUSTON.x1 - 8, EUSTON.top, 8, 60), S(A.dark, 1.1, tz - 0.5), 0, 0.7);
  }

  function drawCity() {
    const g = c.createLinearGradient(0, HORIZON + 10, 0, 430);
    g.addColorStop(0, S(A.town, 0.7, Z.city + 1.2)); g.addColorStop(1, S(A.town, 0.55, Z.town));
    fill(rect(-5, HORIZON + 10, W + 10, 150), g, ID.city);
    for (const b of blocks) {
      if (b.tree) {
        fill(ellipse(b.x + b.w / 2, b.y - b.h * 0.4, b.w * 0.6, b.h * 0.8), S(leafless ? A.twig : mix(env.leafLit, env.leafDark, 1 - b.lit), 0.25 + 0.6 * b.lit, b.z), ID.city);
      } else {
        fill(rect(b.x, b.y - b.h, b.w, b.h + 1), S(b.col, b.lit, b.z), ID.city);
        if (b.roof) fill(rect(b.x - 0.5, b.y - b.h - 2, b.w + 1, 3), S(cap || A.slate, cap ? 0.9 : 0.4, b.z));
      }
    }
    for (const s of SLABS) {
      fill(rect(s[0], s[1], s[2], s[3]), S(A.panel, 0.6, Z.town + 0.5), ID.block);
      fill(rect(s[0] + s[2] - 9, s[1], 9, s[3]), S(A.cream, 1.05, Z.town + 0.5));
      for (let y = s[1] + 5; y < s[1] + s[3]; y += 6) line([s[0] + 2, y, s[0] + s[2] - 11, y], S(A.window, 0.4, Z.town + 0.5), 1.8, 0.7);
    }
    fill(rect(1159, HORIZON + 2, 14, 34), S(A.panel, 0.7, Z.block), ID.block);
    fill(rect(1063, 368, 145, 15), S(cap || A.slate, cap ? 0.9 : 0.4, Z.town + 0.2), ID.block);
    fill(rect(1063, 383, 145, 12), S(A.cream, 0.6, Z.town + 0.2), ID.block);
  }

  function drawBlock() {
    const z = Z.block, b = BLOCK;
    fill(rect(b.x0, b.top, b.x1 - b.x0, b.foot + 8 - b.top), S(A.panel, 0.6, z), ID.block);
    fill(rect(b.x1 - b.side, b.top, b.side, b.foot + 8 - b.top), S(A.cream, 1.05, z));                       // the side the sun is on
    for (let y = b.top + 3 + b.floor / 2; y < b.foot + 8; y += b.floor) line([b.x0 + 2, y, b.x1 - b.side - 2, y], S(A.window, 0.4, z), 2.2, 0.75);
    fill(rect(b.x0 + 16, b.top - 7, 20, 7), S(A.panel, 0.5, z), ID.block);
    line([b.x0 + 24, b.top - 16, b.x0 + 24, b.top - 7], S(A.window, 0.3, z), 1.2);
  }

  function drawCrown(t) {
    if (bare(t)) {
      fill(ellipse(t.x, t.cy, t.rx, t.ry), S(mix(A.twig, VIOLET, 0.15), 0.5, t.z), ID.trees, 0.55);
      line([t.x, t.cy + t.ry, t.x, t.cy - t.ry * 0.2], S(A.trunk, 0.3, t.z), 2.2, 0.8);
      return;
    }
    const set = leafSet(t), tint = t.blossom && env.blossom ? mix(env.blossom[0], set[0], 0.3) : null;
    fill(ellipse(t.x, t.cy, t.rx, t.ry), S(tint || mix(set[0], set[1], 0.65), 0.4 * t.lit, t.z), ID.trees);
    fill(ellipse(t.x + t.rx * 0.24, t.cy - t.ry * 0.34, t.rx * 0.62, t.ry * 0.5), S(tint || mix(set[0], set[1], 0.2), 0.85 * t.lit, t.z));
    fill(ellipse(t.x - t.rx * 0.3, t.cy + t.ry * 0.4, t.rx * 0.62, t.ry * 0.5), S(tint ? env.blossom[2] : mix(set[1], VIOLET, 0.2), 0.12, t.z), 0, 0.9);
  }
  const drawRank = (tier) => { for (const t of crowns) if (t.tier === tier) drawCrown(t); };

  // The shade under the trees, from the middle rank down to the park.
  function drawUnderwood() {
    const pts = [-5, PATH_Y];
    for (let x = -5; x <= W + 25; x += 20) pts.push(x, midY(x) - 16);
    pts.push(W + 25, PATH_Y);
    fill(poly(pts), leafless ? S(mix(A.twig, VIOLET, 0.2), 0.3, Z.trees) : S(mix(env.leafDark, VIOLET, 0.25), 0.18, Z.trees), ID.trees);
  }

  function drawHall() {
    const z = Z.town - 0.3, h = HALL;
    fill(rect(h.x0, h.eaves - 2, h.x1 - h.x0, h.foot - h.eaves + 2), S(A.stone, 0.45, z), ID.block);
    fill(poly([h.x0 - 4, h.eaves + 1, h.x0 + 6, h.ridge, h.x1 - 2, h.ridge, h.x1, h.eaves + 1]), S(cap || mix(A.slate, VIOLET, 0.15), cap ? 0.85 : 0.38, z), ID.block);
    fill(poly([h.x1 - 3, h.ridge + 4, h.x1 + 5, h.ridge - 4, h.x1 + 13, h.ridge + 4, h.x1 + 13, h.foot, h.x1 - 3, h.foot]), S(A.stone, 1.05, z), ID.block);      // the gable end, in the sun
    for (let x = h.x0 + 10; x < h.x1 - 8; x += 13) fill(rect(x, h.eaves + 6, 4, 11), S(A.window, 0.3, z), 0, 0.7);
  }

  function drawTerrace() {
    const z = Z.town - 0.4, t = TERRACE;
    for (const h of houses) {
      fill(rect(h.x, t.eaves - 1, h.w + 0.5, t.foot - t.eaves + 1), S(h.wall, h.lit, z), ID.block);
      fill(poly([h.x, t.eaves, h.x + 3, h.ridge, h.x + h.w - 3, h.ridge, h.x + h.w, t.eaves]), S(cap || A.tile, cap ? 0.9 : 0.45, z), ID.block);
      fill(rect(h.x + 1, h.ridge - 6, 4, 8), S(A.brick, 0.8, z));                                            // chimney stack
      fill(rect(h.x + h.w * 0.5 - 3, h.ridge + 6, 6, 5), S(A.cream, 0.9, z), 0, 0.8);                        // dormer
      for (const dx of [0.3, 0.7]) fill(rect(h.x + h.w * dx - 2, t.eaves + 6, 4, 6), S(A.window, 0.3, z), 0, 0.8);
    }
  }

  function drawPoplars() {
    for (const p of POPLARS) {
      if (leafless) {
        fill(poplarPath(p, 0, 0.8), S(mix(A.twig, VIOLET, 0.15), 0.45, Z.poplar), ID.poplar, 0.55);
        line([p[0], POPLAR_BASE, p[0], p[1] + 34], S(A.trunk, 0.3, Z.poplar), 2.5, 0.8);
        continue;
      }
      fill(poplarPath(p, 0, 1), S(mix(poplarSet[1], VIOLET, 0.2), 0.15, Z.poplar), ID.poplar);
      fill(poplarPath(p, p[2] * 0.12, 0.72), S(mix(poplarSet[0], poplarSet[1], 0.5), 0.6, Z.poplar));
      fill(poplarPath(p, p[2] * 0.4, 0.4), S(poplarSet[0], 1, Z.poplar));
    }
  }

  function drawPark() {
    const z = Z.park, white = S(A.snow, 1, z);
    fill(rect(-5, 498, W + 10, 26), S(mix(env.grass, lush, 0.3), 0.9, z), ID.park);                          // lawns
    if (env.snow > 0) fill(rect(-5, 498, W + 10, 26), white, ID.snow, env.snow * 0.85);

    // running track, its infield and long-jump pit, the hammer cage and the floodlights
    const inner = lane(0);
    fill(ellipse(TRACK.x, TRACK.y, TRACK.rx, TRACK.ry), S(trackA, 1, z), ID.track);
    fill(ellipse(TRACK.x, inner.y, inner.rx, inner.ry), S(env.grass, 1, z), ID.park);
    if (env.snow > 0) fill(ellipse(TRACK.x, inner.y, inner.rx, inner.ry), white, 0, env.snow * 0.85);
    fill(rect(44, 492, 150, 3), S(A.sand, 1, z), 0, 0.8);
    fill(rect(-5, 440, 62, 48), S(A.net, 0.8, z), 0, 0.45);
    for (const f of FLOODS) {
      line([f[0], f[1], f[0], 500], S(A.pole, 0.7, z), 1.6);
      fill(rect(f[0] - 4, f[1] - 3, 8, 4), S(A.white, 1, z));
    }

    // hedge and huts
    for (let x = 238; x < PLAY.x0; x += R.range(12, 20)) fill(ellipse(x, 507 + R.range(-3, 2), R.range(9, 15), R.range(6, 10)), S(R.chance(0.5) ? env.everLit : env.everDark, R.range(0.2, 0.9), z), ID.trees);

    // playground: bark underfoot, a patch of blue safety surface, timber towers
    fill(rect(PLAY.x0, 504, PLAY.x1 - PLAY.x0, 16), S(A.bark, 0.9, z), ID.park);
    fill(rect(613, 506, 76, 11), S(A.rubber, 1, z), ID.park);
    for (const f of frames) {
      fill(rect(f.x - f.w / 2, PLAY.ground - f.h, f.w, f.h), S(A.timber, 0.7, z), ID.park);
      if (f.roof) fill(poly([f.x - f.w / 2 - 2, PLAY.ground - f.h, f.x, PLAY.ground - f.h - 8, f.x + f.w / 2 + 2, PLAY.ground - f.h]), S(cap || A.terracotta, 0.9, z), ID.park);
    }
    for (const h of HUTS) {
      fill(rect(h[0], h[1], h[2], h[3]), S(A[h[4]], 0.5, z), ID.park);
      fill(rect(h[0] - 1, h[1] - 2, h[2] + 2, 3.5), S(cap || A.roofing, 0.9, z));
    }

    // paddling pool
    fill(poly(POOL), S(poolA, 1, z), ID.pool);
    line([POOL[0], POOL[1], POOL[2], POOL[3]], S(A.white, 0.9, z), 1.5, 0.8);

    fill(rect(-5, PATH_Y - 3, W + 10, 6.5), S(pathA, 1, z - 0.08), ID.path);
  }

  function drawMeadow() {
    const field = rect(-5, PATH_Y + 3, W + 10, H - PATH_Y + 5);
    const g = c.createLinearGradient(0, PATH_Y, 0, H);
    g.addColorStop(0, S(mix(env.grass, dry, 0.3), 1, meadowZ(PATH_Y)));
    g.addColorStop(0.4, S(env.grass, 1, meadowZ(632)));
    g.addColorStop(1, S(mix(env.grass, lush, 0.5), 0.9, 0.03));
    fill(field, g);
    for (const p of patches) fill(ellipse(p.x, p.y, p.rx, p.ry), S(p.kind === 'dry' ? dry : lush, p.kind === 'dry' ? 1 : 0.75, meadowZ(p.y)), 0, p.a * 0.85);
    if (env.snow > 0) {
      fill(field, S(A.snow, 0.95, 0.2), 0, env.snow * 0.88);
      for (const p of patches) if (p.kind === 'lush') fill(ellipse(p.x, p.y, p.rx, p.ry), S(mix(A.snow, [0.60, 0.68, 0.95], 0.5), 0.5, meadowZ(p.y)), 0, 0.5 * env.snow);      // blue hollows
    }
    k.fillStyle = idCss(snowy ? ID.snow : ID.lea); k.fill(field);
    if (!snowy) {
      k.fillStyle = idCss(ID.slope); k.fill(rect(-5, 585, W + 10, H));
      k.fillStyle = idCss(ID.near); k.fill(rect(-5, 680, W + 10, H));
    }

    // the trail, its shaded edge and, in the wet, its puddles
    for (const run of [TRAIL, FORK]) for (let i = 1; i < run.length; i++) {
      const a = run[i - 1], b = run[i];
      line([a[0] - a[2] / 2, a[1], b[0] - b[2] / 2, b[1]], S(mix(lush, VIOLET, 0.3), 0.25, meadowZ(b[1])), 2 + b[2] * 0.12, 0.6);
      line([a[0], a[1], b[0], b[1]], S(earthA, 1, meadowZ(b[1])), (a[2] + b[2]) / 2, 1, ID.earth);
    }
    if (env.wet) for (const p of PUDDLES) fill(ellipse(p[0], p[1], p[2], p[3]), css(mix(env.skyLow, env.shade(earthA, 1, 0.1), 0.25)), ID.pool);

    for (const s of SHRUBS) {
      if (env.sunny) fill(ellipse(s.x - s.rx * 0.9, s.base + 3, s.rx * 1.1, 5), S(mix(lush, SHADOW, 0.4), 0.2, s.z), 0, 0.55);
      for (const dx of [-0.25, 0, 0.3]) line([s.x + dx * 8, s.base, s.x + dx * s.rx * 1.4, s.cy], S(A.trunk, 0.3, s.z), 2);
      if (leafless) continue;
      fill(ellipse(s.x, s.cy, s.rx, s.ry), S(mix(env.leafLit, env.leafDark, 0.6), 0.45, s.z), ID.shrub, 0.8 * env.canopy);
      fill(ellipse(s.x + s.rx * 0.25, s.cy - s.ry * 0.3, s.rx * 0.6, s.ry * 0.5), S(env.leafLit, 1, s.z), 0, 0.8 * env.canopy);
    }
    // the shadow of a tree behind us, across the corner
    fill(poly([1080, H + 5, W + 5, 752, W + 5, H + 5]), S(mix(snowy ? A.snow : lush, SHADOW, 0.45), 0.15, 0.03), 0, env.sunny ? 0.7 : 0.25);
  }

  drawSky(); drawFar(); drawCity(); drawBlock(); drawRank(0); drawHall(); drawTerrace(); drawUnderwood(); drawRank(1);
  drawPoplars(); drawRank(2); drawPark(); drawMeadow();

  // ------------------------------------------------------------------ accents

  const T = (col, lit, z) => V(env.shade(col, lit, z), 0.03, 0.015, 0.02);
  // What stands among the trees, in front of the furthest rank of them.
  const amongTrees = [[HALL.x0 - 4, HALL.ridge - 4, HALL.x1 + 14, HALL.foot], [TERRACE.x0, 403, TERRACE.x1, TERRACE.foot]];
  const within = (list, x, y) => list.some((b) => x > b[0] && x < b[2] && y > b[1] && y < b[3]);
  // Whatever must stay in front of the marks around it: figures, mostly.
  // Marks that run under one are thinned at the end, so that the painter's
  // retouching cannot paint it out.
  const boxes = [];
  const under = (s, list) => {
    const dx = Math.cos(s.a) * s.len / 2, dy = Math.sin(s.a) * s.len / 2, m = s.w / 2;
    for (const b of list) for (const f of [-1, 0, 1]) {
      const x = s.x + dx * f, y = s.y + dy * f;
      if (x > b[0] - m && x < b[2] + m && y > b[1] - m && y < b[3] + m) return true;
    }
    return false;
  };

  function accSketch() {
    const ink = [0.30, 0.34, 0.52];
    const rule = (x0, y0, x1, y1) => {
      const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(d / 90)), a = Math.atan2(y1 - y0, x1 - x0);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        dab('sketch', lerp(x0, x1, t) + R.range(-1.5, 1.5), lerp(y0, y1, t) + R.range(-1.5, 1.5), a + R.range(-0.02, 0.02), d / n * 1.08, 2.2, V(ink, 0.03, 0.01, 0.01), 0.5);
      }
    };
    rule(0, HORIZON, W, HORIZON); rule(0, PATH_Y, W, PATH_Y);
    for (let x = 0; x < W; x += 120) rule(x, midY(x) - 30, x + 120, midY(x + 120) - 30);
    rule(BLOCK.x0, BLOCK.top, BLOCK.x0, BLOCK.foot); rule(BLOCK.x1, BLOCK.top, BLOCK.x1, 350); rule(BLOCK.x0, BLOCK.top, BLOCK.x1, BLOCK.top);
    rule(BT.x, BT.top, BT.x, HORIZON + 8); rule(SHARD.x - 8, HORIZON, SHARD.x, SHARD.top); rule(SHARD.x + 8, HORIZON, SHARD.x, SHARD.top);
    for (const p of POPLARS) for (const side of [-1, 1]) {
      const y = lerp(p[1], POPLAR_BASE, 0.55);
      rule(p[0] + side * p[2], y, p[0], p[1]); rule(p[0] + side * p[2], y, p[0] + side * p[2] * 0.8, POPLAR_BASE - 14);
    }
    rule(HALL.x0, HALL.ridge, HALL.x1, HALL.ridge);
    const outer = lane(1), at = (th) => [TRACK.x + outer.rx * Math.cos(th), outer.y + outer.ry * Math.sin(th)];
    for (let i = 0; i < 6; i++) { const a = at(i / 6 * 2.8), b = at((i + 1) / 6 * 2.8); rule(a[0], a[1], b[0], b[1]); }
    for (const run of [TRAIL, FORK]) for (let i = 1; i < run.length; i++) rule(run[i - 1][0], run[i - 1][1], run[i][0], run[i][1]);
    rule(CHILD.x, CHILD.feet, CHILD.x, CHILD.feet - CHILD.h);
  }

  function accStructure() {
    const zf = Z.far, zp = Z.park;

    // the far towers: an upright touch each, and a paler one down the sunny side
    for (const t of SKYLINE) {
      const h = HORIZON + 6 - t[1], col = mix(A.glass, A.concrete, t[3]);
      if (inPoplar(t[0], t[1] + h / 2)) continue;
      dab('structure', t[0], t[1] + h / 2, HALF, h, t[2] * 1.7, T(col, 0.55, zf), 0.85);
      dab('structure', t[0] + t[2] * 0.55, t[1] + h / 2 + 1, HALF, h - 2, t[2] * 0.6, T(col, 1.1, zf), 0.7);
    }
    for (const s of [[326, 30, 9], [303, 26, 5.5], [287, 14, 2.6]]) dab('structure', SHARD.x, s[0], HALF, s[1], s[2], T(A.glass, 0.75, zf), 0.88);
    dab('structure', SHARD.x + 2.5, 320, HALF + 0.1, 38, 2, T([0.9, 0.92, 0.98], 1.1, zf), 0.6);
    dab('structure', 48, 334.5, 0, 1, 11, T(A.concrete, 0.7, zf), 0.85, { round: true });
    for (const cr of CRANES) {
      const col = T(cr[0] < 600 ? A.red : A.concrete, 0.7, zf);
      dab('structure', cr[0], cr[1] + 9, HALF, 18, 1.1, col, 0.7);
      dab('structure', cr[0] + cr[2] * 6, cr[1] - 1, -0.2 * cr[2], 24, 1.1, col, 0.7);
    }
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2;
      dab('structure', EYE.x + Math.cos(a) * EYE.r, EYE.y + Math.sin(a) * EYE.r, a + HALF, 6, 1.1, T(A.white, 0.9, zf - 1), 0.7);
    }
    const zt = Z.towers, ex = (EUSTON.x0 + EUSTON.x1) / 2;
    dab('structure', BT.x, BT.top + 36, HALF, 50, 5, T(A.glass, 0.6, zt), 0.88);
    dab('structure', BT.x, BT.top + 20, HALF, 20, 10.5, T(mix(A.glass, A.concrete, 0.45), 0.75, zt), 0.9);      // the drum of dishes
    dab('structure', BT.x + 3.4, BT.top + 20, HALF, 18, 2.6, T(A.concrete, 1.15, zt), 0.7);
    dab('structure', BT.x, BT.top + 5.5, HALF, 7, 7, T(A.glass, 0.6, zt), 0.9);
    dab('structure', BT.x, BT.top - 3, HALF, 11, 1.3, T(A.glass, 0.5, zt), 0.8);
    dab('structure', ex - 4, EUSTON.top + 22, HALF, 44, 16, T(A.dark, 0.5, zt - 0.5), 0.9);
    dab('structure', EUSTON.x1 - 4, EUSTON.top + 22, HALF, 42, 7, T(A.dark, 1.2, zt - 0.5), 0.8);

    // roofs and walls of the city, wherever nothing stands in front of them
    const inFront = amongTrees.concat([[BLOCK.x0 - 5, BLOCK.top, BLOCK.x1 + 5, 420], [1061, 362, W + 9, 397], [1156, HORIZON, 1176, 376]], SLABS.map((s) => [s[0] - 3, s[1] - 3, s[0] + s[2] + 3, s[1] + s[3] + 20]));
    for (const b of blocks) {
      const x = b.x + b.w / 2, y = b.y - b.h / 2;
      if (b.tree || R.chance(0.3) || hidden(x, y + 3, 0) || within(inFront, x, y)) continue;
      dab('structure', x, y, R.range(-0.03, 0.03), b.w, b.h * 0.9, T(b.col, b.lit, b.z), 0.8);
      if (b.roof) dab('structure', x, b.y - b.h - 0.5, R.range(-0.03, 0.03), b.w + 1, 2.4, T(cap || A.slate, cap ? 0.9 : 0.4, b.z), 0.8);
    }
    for (const s of SLABS) {
      const zs = Z.town + 0.5, face = s[2] - 9;
      for (let y = s[1] + 2; y < s[1] + s[3] - 2 && !hidden(s[0] + face / 2, y + 4, 0); y += 6) {
        dab('structure', s[0] + face / 2, y, 0, face - 1, 3.2, T(A.panel, 0.62, zs), 0.88);
        dab('structure', s[0] + face / 2, y + 3, 0, face - 3, 1.7, T(A.window, 0.4, zs), 0.75);
      }
      dab('structure', s[0] + s[2] - 4.5, s[1] + s[3] * 0.38, HALF, s[3] * 0.7, 8, T(A.cream, 1.05, zs), 0.9);
    }
    dab('structure', 1166, HORIZON + 16, HALF, 28, 12, T(A.panel, 0.7, Z.block), 0.88);
    for (let x = 1078; x < W + 10; x += 30) dab('structure', x, 375.5, 0, 31, 13, T(cap || A.slate, cap ? 0.9 : 0.4, Z.town + 0.2), 0.88);

    // the tower block: a pale band and a dark one to every floor, as far as the poplars let them run
    const b = BLOCK, zb = Z.block;
    for (let y = b.top + 3; y < b.foot - 2; y += b.floor) {
      let xe = b.x0;
      while (xe < b.x1 - b.side - 1 && !hidden(xe + 2, y, 0)) xe += 2;
      if (xe - b.x0 < 9) continue;
      dab('structure', (b.x0 + xe) / 2, y, R.range(-0.01, 0.01), xe - b.x0 - 1, 3.6, T(A.panel, 0.62, zb), 0.9);
      dab('structure', (b.x0 + xe) / 2 + R.range(-1, 1), y + b.floor / 2, 0, xe - b.x0 - 4, 2, T(A.window, 0.4, zb), 0.8);
    }
    for (let y = b.top + 12; y < b.foot - 10; y += 22) {
      if (!hidden(b.x1 - 7, y + 9, 0) && !hidden(b.x1 - 7, y - 9, 0)) dab('structure', b.x1 - b.side / 2, y, HALF, 24, b.side - 2, T(A.cream, 1.05, zb), 0.9);      // warm against the cool face
    }
    dab('structure', b.x0 + 26, b.top - 3.5, 0, 20, 6.5, T(cap || A.panel, cap ? 0.95 : 0.5, zb), 0.9);
    dab('structure', b.x0 + 24, b.top - 12, HALF, 10, 1.2, T(A.window, 0.3, zb), 0.8);

    // the hall's long roof and sunlit gable, then the terrace: roofs, stacks, walls, windows
    const h = HALL, zh = Z.town - 0.3;
    for (let x = h.x0 + 18; x < h.x1 - 10; x += 29) {
      dab('structure', x, h.ridge + 7, 0, 31, 10, T(cap || mix(A.slate, VIOLET, 0.1), cap ? 0.9 : 0.45, zh), 0.9);
      if (!hidden(x + 6, h.ridge + 20)) dab('structure', x + 6, h.ridge + 18, 0, 31, 10, T(cap || mix(A.slate, VIOLET, 0.3), cap ? 0.7 : 0.3, zh), 0.9);
      if (!hidden(x, h.eaves + 16)) dab('structure', x, h.eaves + 12, 0, 28, 13, T(A.stone, 0.48, zh), 0.85);
    }
    for (let x = h.x0 + 12; x < h.x1 - 8; x += 13) if (!hidden(x, h.eaves + 15)) dab('structure', x, h.eaves + 11.5, HALF, 10, 3, T(A.window, 0.3, zh), 0.75);
    if (!hidden(h.x1 + 5, h.eaves + 10)) dab('structure', h.x1 + 5, h.eaves + 2, HALF, 42, 13, T(A.stone, 1.05, zh), 0.92);
    for (const side of [-1, 1]) dab('structure', h.x1 + 5 + side * 4.5, h.ridge + 0.5, side * 0.8, 12, 3, T(cap || A.slate, cap ? 0.9 : 0.5, zh), 0.9);
    const tr = TERRACE, zr = Z.town - 0.4;
    for (const hs of houses) {
      const x = hs.x + hs.w / 2;
      dab('structure', x, (hs.ridge + tr.eaves) / 2, R.range(-0.04, 0.04), hs.w - 1, tr.eaves - hs.ridge - 2, T(cap || A.tile, cap ? 0.9 : 0.45, zr), 0.9);
      dab('structure', hs.x + 3, hs.ridge - 2.5, HALF, 8, 3.4, T(A.brick, 0.8, zr), 0.9);
      if (hidden(x, tr.eaves + 16)) continue;
      dab('structure', x, tr.eaves + 11, HALF, 20, hs.w - 4, T(hs.wall, hs.lit, zr), 0.85);
      for (const dx of [0.3, 0.7]) dab('structure', hs.x + hs.w * dx, tr.eaves + 9, HALF, 6.5, 3.2, T(A.window, 0.3, zr), 0.8);
    }

    // running track: the lanes swept round the bend, the white lines between them, the sand pit
    for (const kk of [0.18, 0.5, 0.82]) {
      const l = lane(kk);
      for (let th = -HALF * 1.9; th < Math.PI;) {
        const sx = -l.rx * Math.sin(th), sy = l.ry * Math.cos(th), x = TRACK.x + l.rx * Math.cos(th);
        if (x > -20) dab('structure', x, l.y + l.ry * Math.sin(th), Math.atan2(sy, sx), 22, Math.sin(th) > 0 ? 4.4 : 2, T(trackA, 1, zp), 0.88);
        th += 19 / Math.hypot(sx, sy);
      }
    }
    for (const kk of [0.34, 0.66]) {
      const l = lane(kk);
      for (let th = 0.12; th < Math.PI * 0.96;) {
        const sx = -l.rx * Math.sin(th), sy = l.ry * Math.cos(th), x = TRACK.x + l.rx * Math.cos(th);
        if (x > -20) dab('structure', x, l.y + l.ry * Math.sin(th), Math.atan2(sy, sx), 15, 0.9, T(A.white, 1, zp), 0.6);
        th += 26 / Math.hypot(sx, sy);
      }
    }
    for (let x = 64; x < 190; x += 40) dab('structure', x, 493.5, 0, 42, 3, T(cap || A.sand, 1, zp), 0.8);
    // hammer cage and floodlights
    for (let x = 3; x < 56; x += 9) dab('structure', x, 464, HALF + R.range(-0.03, 0.03), 46, 5, T(A.net, 0.8, zp), 0.4);
    dab('structure', 57, 463, HALF, 50, 1.6, T(A.pole, 0.5, zp), 0.8);
    for (const f of FLOODS) {
      for (let y = f[1] + 13; y < 500; y += 25) dab('structure', f[0], y, HALF, 26, 1.7, T(A.pole, 0.75, zp), 0.85);
      dab('structure', f[0], f[1] - 1, 0, 9, 4, T(A.white, 1, zp), 0.95);
      boxes.push([f[0] - 1, f[1] - 3, f[0] + 1, 500]);
    }

    // huts, the playground's towers, swings and fence, the pool's rim
    for (const hut of HUTS) {
      dab('structure', hut[0] + hut[2] / 2, hut[1] + hut[3] / 2 + 1, 0, hut[2] - 2, hut[3] - 3, T(A[hut[4]], 0.5, zp), 0.9);
      dab('structure', hut[0] + hut[2] - 4, hut[1] + hut[3] / 2 + 1, HALF, hut[3] - 4, 6, T(A[hut[4]], 1.1, zp), 0.8);
      dab('structure', hut[0] + hut[2] / 2, hut[1] - 0.5, 0, hut[2] + 2, 3.2, T(cap || A.roofing, 0.9, zp), 0.92);
    }
    for (const f of frames) {
      const top = PLAY.ground - f.h;
      dab('structure', f.x - f.w * 0.2, top + f.h / 2, HALF, f.h, f.w * 0.55, T(A.timber, 0.45, zp), 0.92);
      dab('structure', f.x + f.w * 0.25, top + f.h / 2, HALF, f.h, f.w * 0.45, T(A.timber, 1, zp), 0.92);
      if (f.roof) for (const side of [-1, 1]) dab('structure', f.x + side * (f.w / 4 + 1), top - 4, side * 0.75, f.w * 0.75 + 4, 3.6, T(cap || A.terracotta, side > 0 ? 1 : 0.6, zp), 0.95);
      if (R.chance(0.6)) dab('structure', f.x + R.range(-9, 9), PLAY.ground - R.range(2, 7), R.range(-0.9, 0.9), R.range(6, 11), 2.4, T(R.pick([A.red, A.yellow, A.blue]), 1, zp), 0.95);      // a slide, a rope, a rail
    }
    for (const x of [634, 668]) {
      for (const side of [-1, 1]) dab('structure', x + side * 5, 508, HALF + side * 0.3, 17, 1.4, T(A.timber, 0.6, zp), 0.9);
      dab('structure', x, 500.5, 0, 13, 1.6, T(A.timber, 0.9, zp), 0.9);
    }
    for (let x = PLAY.x0 + 12; x < PLAY.x1; x += 24) dab('structure', x, 518, 0, 22, 1.2, T(A.trunk, 0.4, zp), 0.5);
    for (let x = POOL[0] + 14; x < POOL[2]; x += 28) dab('structure', x, POOL[1], 0, 28, 1.6, T(A.white, 0.95, zp), 0.8);

    // the path
    for (let x = -10; x < W + 10; x += R.range(34, 52)) dab('structure', x, PATH_Y + 0.3 + R.range(-0.6, 0.6), R.range(-0.01, 0.01), R.range(38, 56), 5, T(pathA, 1, zp - 0.08), 0.8);
  }

  function accFoliage() {
    // three ranks of trees: leaves in dabs of light, half-light and violet shade, or bare twigs
    for (const t of crowns) {
      const size = [0.75, 0.9, 1][t.tier];
      const shown = (x, y) => y < parkTop(x) - 3 && !(t.tier === 0 && within(amongTrees, x, y)) && !(t.tier < 2 && inPoplar(x, y));
      if (bare(t)) {
        if (shown(t.x, t.cy + t.ry * 0.9)) dab('foliage', t.x, t.cy + t.ry * 0.5, HALF + R.range(-0.06, 0.06), t.ry, 2.6 * size, V(env.shade(A.trunk, 0.3, t.z), 0.03, 0.012, 0.015), 0.85);
        for (let i = 0; i < 7; i++) {
          const a = -HALF + (i / 6 - 0.5) * 2.2 + R.range(-0.15, 0.15), r = R.range(0.5, 0.95);
          const x = t.x + Math.cos(a) * t.rx * r * 0.55, y = t.cy + t.ry * 0.3 + Math.sin(a) * t.ry * r * 0.6;
          if (!shown(x, y)) continue;
          dab('foliage', x, y, a, t.ry * r * 0.9, R.range(1.2, 1.9) * size, V(env.shade(mix(A.twig, VIOLET, 0.1), 0.45, t.z), 0.04, 0.02, 0.025), 0.75);
          if (snowy && R.chance(0.4)) dab('foliage', x, y - 1.3, a, t.ry * r * 0.5, 1.4, V(env.shade(A.snow, 1, t.z), 0.02, 0.006), 0.85);
        }
        continue;
      }
      const n = Math.round(t.rx * t.ry * 0.03);
      for (let i = 0; i < n; i++) {
        const ang = R.range(0, Math.PI * 2), rad = Math.sqrt(R()), ux = Math.cos(ang) * rad, uy = Math.sin(ang) * rad;
        const x = t.x + ux * t.rx, y = t.cy + uy * t.ry;
        if (!shown(x, y)) continue;
        const l = clamp(0.5 + 0.5 * (ux * 0.55 - uy * 0.8) + R.range(-0.25, 0.25), 0, 1) * t.lit;
        dab('foliage', x, y, R.range(0, Math.PI), R.range(5, 9) * size, R.range(3.4, 5.4) * size, leafColor(t, l), 0.92);
        if (snowy && uy < -0.5 && R.chance(0.5)) dab('foliage', x, y - 2, R.range(-0.3, 0.3), R.range(5, 9), 2.4, V(env.shade(A.snow, 1, t.z), 0.02, 0.006), 0.85);
      }
    }

    // the poplars: upright flicks, lit down the right-hand side
    for (const p of POPLARS) {
      const h = POPLAR_BASE - p[1];
      const shown = (x, y) => y < parkTop(x) - 3 && !inCrown(x, y, 2);
      if (leafless) {
        for (let y = POPLAR_BASE - 8; y > p[1] + 40; y -= 13) if (shown(p[0], y)) dab('foliage', p[0] + R.range(-0.6, 0.6), y, HALF + R.range(-0.04, 0.04), 15, 2.8, V(env.shade(A.trunk, 0.3, Z.poplar), 0.03, 0.012, 0.015), 0.85);
        for (let i = 0; i < 46; i++) {
          const f = R.range(0.04, 0.9), ux = R.range(-1, 1), x = p[0] + ux * poplarW(p, f) * 0.85, y = p[1] + f * h;
          if (!shown(x, y)) continue;
          dab('foliage', x, y, -HALF + ux * 0.32 + R.range(-0.1, 0.1), R.range(14, 24), R.range(1.1, 1.8), V(env.shade(mix(A.twig, VIOLET, 0.12), ux > 0 ? 0.65 : 0.35, Z.poplar), 0.04, 0.02, 0.025), 0.7);
          if (snowy && R.chance(0.25)) dab('foliage', x + 1, y, -HALF + ux * 0.32, R.range(6, 10), 1.3, V(env.shade(A.snow, 1, Z.poplar), 0.02, 0.006), 0.8);
        }
        continue;
      }
      const n = Math.round(h * p[2] * 0.045 * Math.max(0.7, env.canopy));
      for (let i = 0; i < n; i++) {
        const f = Math.pow(R(), 0.8) * 0.96 + 0.02, ux = R.range(-1, 1), x = p[0] + ux * poplarW(p, f) * 0.92, y = p[1] + f * h;
        if (!shown(x, y)) continue;
        const l = clamp(0.5 + 0.5 * ux + R.range(-0.25, 0.25), 0, 1), q = R();
        const col = env.leafAlt && q < 0.12 ? env.shade(R.pick(env.leafAlt), 0.4 + 0.6 * l, Z.poplar)
          : l > 0.62 ? env.shade(q < 0.4 ? mix(poplarSet[0], SUNLIT, 0.3) : poplarSet[0], 1.05, Z.poplar)
          : l < 0.36 ? env.shade(mix(poplarSet[1], VIOLET, R.range(0.1, 0.45)), 0.14, Z.poplar)
          : env.shade(mix(poplarSet[0], poplarSet[1], 0.5), 0.55, Z.poplar);
        dab('foliage', x, y, -HALF + ux * 0.3 + R.range(-0.15, 0.15), R.range(9, 15), R.range(3, 4.6), V(col, 0.045, 0.03, 0.035), 0.92);
      }
    }

    // hedge by the huts, and the lawns either side of the pool
    for (let x = 240; x < PLAY.x0 - 4; x += R.range(5, 8)) {
      if (HUTS.some((hut) => x > hut[0] - 4 && x < hut[0] + hut[2] + 4)) continue;
      const l = R();
      dab('foliage', x, 506 + R.range(-5, 3), R.range(0, Math.PI), R.range(5, 8), R.range(3.6, 5.2), V(env.shade(l > 0.5 ? env.everLit : env.everDark, l > 0.5 ? 1 : 0.15, Z.park), 0.05, 0.03, 0.03), 0.9);
      if (R.chance(0.4 * env.snow)) dab('foliage', x, 500, R.range(-0.2, 0.2), R.range(5, 9), 2.6, V(env.shade(A.snow, 1, Z.park), 0.02, 0.006), 0.9);
    }
    for (let i = 0; i < 70; i++) {
      const x = R.chance(0.75) ? R.range(934, 1140) : R.range(-5, 200), y = x > 900 ? R.range(503, 517) : R.range(489, 503), l = R();
      const col = snowy ? env.shade(mix(A.snow, SHADOW, l * 0.3), 1 - l * 0.4, Z.park) : env.shade(mix(mix(env.grass, dry, l > 0.6 ? 0.5 : 0), COOL, l < 0.25 ? 0.4 : 0), 0.6 + 0.4 * l, Z.park);
      dab('foliage', x, y, R.gauss() * 0.15, R.range(8, 16), R.range(2, 3), V(col, 0.04, 0.03, 0.035), 0.85);
    }

    // the saplings out on the meadow
    for (const s of SHRUBS) {
      for (const dx of [-0.25, 0, 0.3]) for (let i = 0; i < 3; i++) {
        const f = (i + 0.5) / 3, x0 = s.x + dx * 8, x1 = s.x + dx * s.rx * 1.4;
        dab('foliage', lerp(x0, x1, f), lerp(s.base, s.cy, f), Math.atan2(s.cy - s.base, x1 - x0), (s.base - s.cy) / 3 * 1.2, 2.2, V(env.shade(A.trunk, 0.3, s.z), 0.03, 0.012, 0.015), 0.9);
      }
      const t = { kind: 'leaf', blossom: s === SHRUBS[0], z: s.z };            // the nearer one is a hawthorn: may blossom
      if (leafless) {
        for (let i = 0; i < 16; i++) {
          const a = -HALF + R.range(-1.1, 1.1), r = R.range(0.4, 1);
          dab('foliage', s.x + Math.cos(a) * s.rx * r * 0.7, s.cy + s.ry * 0.4 + Math.sin(a) * s.ry * r * 0.8, a, s.ry * r * 0.8, R.range(1.1, 1.7), V(env.shade(A.twig, 0.4, s.z), 0.04, 0.02, 0.025), 0.8);
        }
      } else {
        for (let i = 0, n = Math.round(s.rx * s.ry * 0.07 * env.canopy); i < n; i++) {
          const ang = R.range(0, Math.PI * 2), rad = Math.sqrt(R()), ux = Math.cos(ang) * rad, uy = Math.sin(ang) * rad;
          dab('foliage', s.x + ux * s.rx, s.cy + uy * s.ry, R.range(0, Math.PI), R.range(5, 9), R.range(3.4, 5.2), leafColor(t, clamp(0.5 + 0.5 * (ux * 0.55 - uy * 0.8) + R.range(-0.25, 0.25), 0, 1)), 0.92);
        }
      }
      if (season === 'autumn') for (let i = 0; i < 16; i++) dab('foliage', s.x + R.gauss() * 34, s.base + R.range(-3, 10), R.range(0, Math.PI), R.range(4, 6), R.range(2.8, 3.8), leafColor(t, R()), 0.9);
    }

    accMeadow();
  }

  // The meadow: no two neighbouring touches the same. Sunlit yellow-green, the
  // green itself, blue-green shade, and now and then violet or rose.
  function accMeadow() {
    const x0 = view.x - 20, x1 = view.x + view.w + 20, share = view.w / W;
    const spot = (bias) => { const n = Math.pow(R(), bias), y = lerp(PATH_Y + 6, H + 6, n); return [R.range(x0, x1), y, n, meadowZ(y)]; };

    for (let i = 0, count = Math.round(1500 * share * (snowy ? 0.22 : 1)); i < count; i++) {
      const [x, y, n, z] = spot(0.8);
      if (onTrail(x, y)) continue;
      const base = snowy ? dry : turf(x, y), q = R(), size = lerp(0.4, 1.35, n), upright = snowy || R.chance(0.2 + 0.65 * n);
      // close in value, apart in hue: the light is in the yellow, the shade in the blue
      const col = q < 0.36 ? env.shade(mix(base, SUNLIT, 0.3), 1.05, z)
        : q < 0.7 ? env.shade(base, 0.9, z)
        : q < 0.9 ? env.shade(mix(base, COOL, 0.3), 0.7, z)
        : q < 0.95 ? env.shade(mix(base, VIOLET, 0.35), 0.75, z)
        : env.shade(mix(base, ROSE, 0.45), 1, z);
      dab('foliage', x, y, upright ? -HALF - 0.2 + R.gauss() * 0.2 : R.gauss() * 0.2, (upright ? R.range(9, 17) : R.range(10, 22)) * size, R.range(2.2, 3.6) * size, V(col, 0.04, 0.022, 0.028), 0.88);
    }

    // snow lying: warm where the light falls, blue and violet in the hollows
    if (env.snow > 0) {
      for (let i = 0, count = Math.round(760 * share * env.snow); i < count; i++) {
        const [x, y, n, z] = spot(0.8);
        if (onTrail(x, y)) continue;
        const q = R(), size = lerp(0.45, 1.3, n);
        const col = q < 0.5 ? env.shade(A.snow, 1, z) : q < 0.78 ? env.shade(mix(A.snow, [0.60, 0.68, 0.95], 0.5), 0.5, z) : q < 0.9 ? env.shade(mix(A.snow, VIOLET, 0.35), 0.6, z) : env.shade([1, 0.93, 0.84], 1, z);
        dab('foliage', x, y, R.gauss() * 0.12, R.range(14, 34) * size, R.range(3, 5.5) * size, V(col, 0.02, 0.01, 0.016), 0.8 * env.snow);
      }
    }

    // flowers: buttercups and daisies in spring, clover in summer, seed heads in autumn
    if (env.flowers && !snowy) {
      for (let i = 0, count = Math.round({ spring: 560, summer: 170, autumn: 90 }[season] * share); i < count; i++) {
        const [x, y, n, z] = spot(0.75);
        if (onTrail(x, y) || (season === 'spring' && R() > 0.3 + cover(x, y)[0])) continue;
        dab('foliage', x, y, 0, 1, R.range(2.2, 3.3) * lerp(0.55, 1.5, n), V(env.shade(R.pick(env.flowers), 1, z), 0.03, 0.03), 0.95, { round: true });
      }
    }
    if (season === 'autumn') {
      const fallen = env.leafAlt.concat([env.leafLit, env.birchLit]);
      for (let i = 0; i < 150 * share; i++) {
        const x = R.range(x0, x1), y = PATH_Y + 5 + Math.pow(R(), 2) * 90, size = 0.7 + nearness(y);
        dab('foliage', x, y, R.range(0, Math.PI), R.range(3, 5) * size, R.range(2.2, 3.2) * size, V(env.shade(R.pick(fallen), 0.9, meadowZ(y)), 0.04, 0.03, 0.03), 0.9);
      }
    }

    // the trail: pale earth with rose in it, and the grass's shade along its edge
    for (const run of [TRAIL, FORK]) for (let i = 1; i < run.length; i++) {
      const a = run[i - 1], b = run[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      for (let j = 0, m = Math.ceil(d / 8); j < m; j++) {
        const f = (j + R()) / m, x = lerp(a[0], b[0], f), y = lerp(a[1], b[1], f), wd = lerp(a[2], b[2], f), z = meadowZ(y);
        for (let e = 0; e < Math.max(1, Math.round(wd / 6)); e++) {
          const col = R.chance(0.25) ? mix(earthA, ROSE, 0.4) : R.chance(0.3) ? mix(earthA, VIOLET, 0.3) : earthA;
          dab('foliage', x + R.range(-0.38, 0.38) * wd, y + R.range(-2, 2), ang + R.gauss() * 0.35, R.range(6, 11) * (0.5 + wd / 22), R.range(2.2, 3.6) * (0.5 + wd / 24), V(env.shade(col, R.range(0.8, 1.05), z), 0.035, 0.02, 0.03), 0.9);
        }
        if (R.chance(0.7)) dab('foliage', x - wd * 0.55, y, ang + R.gauss() * 0.2, R.range(6, 12) * (0.5 + wd / 22), 1.6 + wd * 0.1, V(env.shade(mix(lush, VIOLET, 0.3), 0.22, z), 0.04, 0.03, 0.03), 0.8);
      }
    }

    // tall grass at our feet, and the tree's shadow across the corner
    for (let i = 0; i < 150 * share; i++) {
      const x = R.range(x0, x1), y = R.range(754, H + 8), l = R();
      if (onTrail(x, y - 10)) continue;
      const col = snowy ? env.shade(dry, 0.5 + 0.5 * l, 0.03) : l > 0.45 ? env.shade(mix(turf(x, y), SUNLIT, 0.35), 1.05, 0.03) : env.shade(mix(lush, l < 0.12 ? VIOLET : COOL, 0.3), 0.5, 0.03);
      if (!snowy || R.chance(0.35)) dab('foliage', x, y, -HALF - 0.24 + R.gauss() * 0.11, R.range(18, 34), R.range(2.4, 3.6), V(col, 0.04, 0.025, 0.03), 0.85);
    }
    for (let i = 0; i < 46; i++) {
      const x = R.range(1084, W + 8), top = H + 5 - (x - 1080) / 125 * 53, y = lerp(top + 3, H + 6, R());
      dab('foliage', x, y, -0.4 + R.gauss() * 0.3, R.range(14, 26), R.range(4, 6.5), V(env.shade(mix(snowy ? A.snow : lush, SHADOW, R.range(0.3, 0.6)), 0.15, 0.03), 0.04, 0.03, 0.03), env.sunny ? 0.75 : 0.3);
    }
  }

  // People are three or four dabs each: legs, coat, head, and a shadow or a
  // wet reflection at their feet.
  const warm = [[0.97, 0.97, 0.94], [0.58, 0.74, 0.93], [0.94, 0.48, 0.54], [0.90, 0.22, 0.18], [0.98, 0.86, 0.42], [0.22, 0.28, 0.52], [0.15, 0.15, 0.19], [0.48, 0.72, 0.58], [0.96, 0.72, 0.78]];
  const cold = [[0.13, 0.13, 0.17], [0.21, 0.23, 0.34], [0.38, 0.25, 0.21], [0.64, 0.48, 0.32], [0.48, 0.11, 0.15], [0.26, 0.32, 0.30], [0.52, 0.52, 0.57]];
  const wardrobe = season === 'winter' ? cold : season === 'autumn' ? cold.concat(warm.slice(3, 7)) : season === 'spring' ? warm.concat(cold.slice(0, 3)) : warm;
  const skins = [[0.96, 0.80, 0.68], [0.84, 0.64, 0.50], [0.58, 0.40, 0.30], [0.24, 0.17, 0.15]];
  const brollies = [[0.10, 0.10, 0.14], [0.10, 0.10, 0.14], [0.78, 0.13, 0.15], [0.96, 0.80, 0.22], [0.16, 0.32, 0.62], [0.92, 0.92, 0.94]];

  function person(x, feet, h, z, seated) {
    const lit = env.sunny ? R.range(0.75, 1) : 0.7;
    const cloth = V(env.shade(R.pick(wardrobe), lit, z), 0.03, 0.02, 0.02);
    const legs = V(env.shade(R.pick(cold), lit * 0.8, z), 0.03, 0.02, 0.02);
    const head = V(env.shade(R.pick(skins), lit, z), 0.03, 0.015, 0.02);
    boxes.push([x - h * 0.3, feet - h * (seated ? 0.7 : 1.3), x + h * 0.3, feet + 1]);
    if (env.sunny) dab('figures', x - h * 0.4, feet + 0.6, 0.1, h * 0.75, h * 0.15, V(env.shade(SHADOW, 0, z), 0.03, 0.02), 0.45);
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

  // Someone near enough to have limbs: two legs in mid-stride, arms, hair,
  // perhaps a rucksack. face is the way they are heading (-1 left, 1 right);
  // reach is a point one hand is raised to. Their marks lie over one another
  // in a set order, so they are kept: the painter lays them as listed, leaves
  // them clear, and does not go over them one at a time.
  function figure(x, feet, h, z, look) {
    const lit = env.sunny ? 0.95 : 0.7, d = look.face;
    const P = (col, l) => V(env.shade(col, lit * (l || 1), z), 0.03, 0.02, 0.02);
    const part = (px, py, a, len, w, col, extra) => dab('figures', px, py, a, len, w, col, 0.96, Object.assign({ kept: true }, extra));
    boxes.push([x - h * 0.24, feet - h * 1.02, x + h * 0.24, feet + 2]);
    if (env.sunny) dab('figures', x - h * 0.42, feet + 1, 0.12, h * 0.8, h * 0.13, V(env.shade(SHADOW, 0, z), 0.03, 0.02), 0.5);
    if (env.wet) dab('figures', x, feet + h * 0.3, HALF, h * 0.5, h * 0.2, P(look.top), 0.22);
    for (const side of [-1, 1]) {
      part(x + side * d * h * 0.06, feet - h * 0.2, HALF - side * 0.13, h * 0.4, h * 0.085, P(look.legs, side < 0 ? 0.8 : 1));
      part(x + side * d * h * 0.085 + d * h * 0.02, feet - h * 0.012, 0, h * 0.1, h * 0.05, P(look.shoes));
    }
    if (look.shorts) part(x, feet - h * 0.43, 0, h * 0.19, h * 0.15, P(look.shorts));
    part(x - d * h * 0.1, feet - h * 0.6, HALF + d * 0.2, h * 0.25, h * 0.055, P(look.arms || look.top, 0.85));      // the arm swinging back
    part(x, feet - h * 0.63, HALF, h * 0.3, h * 0.23, P(look.top));
    if (look.pack) part(x - d * h * 0.07, feet - h * 0.64, HALF, h * 0.24, h * 0.15, P(look.pack, 0.8));
    if (look.reach) {
      const sx = x + d * h * 0.07, sy = feet - h * 0.74, rx = look.reach.x, ry = look.reach.y;
      part((sx + rx) / 2, (sy + ry) / 2, Math.atan2(ry - sy, rx - sx), Math.hypot(rx - sx, ry - sy), h * 0.055, P(look.arms || look.top));
      boxes.push([Math.min(sx, rx) - 2, ry - 2, Math.max(sx, rx) + 2, sy]);
    } else {
      part(x + d * h * 0.11, feet - h * 0.59, HALF - d * 0.22, h * 0.25, h * 0.055, P(look.arms || look.top));
    }
    part(x, feet - h * 0.86, 0, 1, h * 0.165, P(look.skin), { round: true });
    part(x - d * h * 0.012, feet - h * 0.9, 0, h * 0.07, h * 0.11, P(look.hair));
    if (look.hat) part(x, feet - h * 0.945, 0, h * 0.13, h * 0.075, P(look.hat));
  }

  // Whoever comes along the path.
  const walker = () => person(R.range(view.x + 8, view.x + view.w - 8), PATH_Y + 1.5 + R.range(-1, 1), tall(PATH_Y + 2) * R.range(0.9, 1.12), Z.park - 0.08, false);

  function accFigures() {
    const idle = !env.wet && !snowy;                         // weather to sit about in
    for (let i = 0, n = Math.round(20 * env.crowd); i < n; i++) {        // the party at the foot of the meadow
      const x = 222 + R.gauss() * 46, y = PATH_Y + 8 + R.range(0, 14);
      person(x, y, tall(y) * R.range(0.8, 1), meadowZ(y), idle && R.chance(0.3));
    }
    for (let i = 0, n = Math.round(10 * env.crowd) + 2; i < n; i++) walker();
    for (let i = 0, n = Math.round(4 * env.crowd); i < n; i++) person(R.range(4, 205), 513 + R.range(-2.5, 2.5), 10.5, Z.park, false);      // on the track
    for (let i = 0, n = Math.round(9 * env.crowd); i < n; i++) person(R.range(PLAY.x0 + 8, PLAY.x1 - 6), 518 + R.range(-2, 1), R.range(7.5, 9.5), Z.park, false);
    if (idle && season !== 'autumn') for (let i = 0, n = Math.round(7 * env.crowd); i < n; i++) person(R.range(766, 912), 517 + R.range(-2.5, 2), R.range(7, 9), Z.park, false);      // paddling

    // the child going down the trail, dressed for the day
    const skin = skins[1], dark = [0.13, 0.13, 0.17];
    const look = env.wet ? { top: A.yellow, legs: [0.21, 0.23, 0.34], shoes: A.red, hat: A.yellow }
      : season === 'summer' ? { top: dark, legs: skin, shorts: A.blue, arms: skin, shoes: dark }
      : season === 'winter' ? { top: [0.20, 0.30, 0.56], legs: dark, shoes: dark, hat: A.red }
      : { top: A.red, legs: [0.21, 0.23, 0.34], shoes: dark };
    figure(CHILD.x, CHILD.feet, CHILD.h, meadowZ(CHILD.feet), Object.assign({ skin, hair: [0.12, 0.10, 0.10], pack: [0.20, 0.20, 0.25], face: -1 }, look));

    // and, in kite weather, whoever holds the line
    if (flying) {
      figure(FLYER.x, FLYER.feet, FLYER.h, meadowZ(FLYER.feet), {
        top: season === 'winter' ? [0.48, 0.11, 0.15] : A.white, legs: [0.21, 0.23, 0.34], shoes: dark, skin: skins[0], hair: [0.36, 0.24, 0.16],
        arms: season === 'summer' ? skins[0] : null, face: -1, reach: HAND
      });
    }
  }

  function accLights() {
    const L = env.lights;
    const point = (x, y, size, col, zz) => {
      if (L > 0.3) dab('lights', x, y, 0, 1, size * 3, V(env.glow(col, zz), 0.03, 0.02), 0.14 + 0.14 * L, { round: true });
      dab('lights', x, y, 0, 1, size, V(env.glow(col, zz), 0.03, 0.02), 0.9, { round: true });
    };
    if (weather === 'fog') {
      for (const size of [66, 46, 32]) dab('lights', SUN.x, SUN.y, 0, 1, size, V(env.sunDisc, 0.01, 0.01), 0.1, { round: true });
      dab('lights', SUN.x, SUN.y, 0, 1, 23, V(env.sunDisc, 0.01, 0.01), 0.92, { round: true });
    }
    if (L <= 0.2) return;
    for (const f of FLOODS) point(f[0], f[1] - 1, 5, [1, 0.97, 0.86], Z.park);
    // windows coming on across the city and up the tower block, and the red lamps on the tall ones
    for (let i = 0; i < 110 * L; i++) {
      const x = R.range(view.x, view.x + view.w), y = R.range(HORIZON + 8, 404);
      if (!hidden(x, y, 0) && !within(amongTrees, x, y)) point(x, y, R.range(1.8, 2.8), mix(A.lamp, [1, 0.72, 0.42], R()), lerp(Z.city, Z.town, (y - HORIZON) / 66));
    }
    for (let y = BLOCK.top + 3 + BLOCK.floor / 2; y < BLOCK.foot - 4; y += BLOCK.floor) for (let x = BLOCK.x0 + 5; x < BLOCK.x1 - BLOCK.side - 3; x += 6) {
      if (R.chance(L * 0.3) && !hidden(x, y, 0)) dab('lights', x, y, 0, 4.5, 2.2, V(env.glow(A.lamp, Z.block), 0.04, 0.03), 0.9);
    }
    for (const t of SKYLINE) if (R.chance(L * 0.6)) point(t[0], t[1] + 1, 1.8, A.red, Z.far);
    point(SHARD.x, SHARD.top + 2, 2, A.red, Z.far); point(BT.x, BT.top - 7, 2, A.red, Z.towers); point(BLOCK.x0 + 24, BLOCK.top - 16, 2, A.red, Z.block);
  }

  function accWater() {
    // the paddling pool: the sky lying in it
    if (season !== 'winter') for (let x = POOL[0] + 6; x < POOL[2] - 2; x += R.range(12, 20)) {
      dab('water', x, R.range(511.5, 518), 0, R.range(12, 22), R.range(1.6, 2.6), V(env.shade(R.chance(0.35) ? [1, 1, 1] : mix(poolA, env.skyTop, 0.3), 1, Z.park), 0.03, 0.015, 0.02), 0.8);
    }
    if (!env.wet) return;
    const sheen = mix(env.skyLow, [1, 1, 1], 0.25);
    for (const p of PUDDLES) for (let i = 0; i < 4; i++) dab('water', p[0] + R.range(-0.6, 0.6) * p[2], p[1] + R.range(-0.5, 0.5) * p[3], R.range(-0.05, 0.05), p[2] * R.range(0.5, 0.9), R.range(1.6, 2.6), V(sheen, 0.02, 0.01), 0.7);
    for (let x = view.x; x < view.x + view.w; x += R.range(30, 70)) dab('water', x, PATH_Y + R.range(-1.5, 1.5), 0, R.range(14, 30), 1.4, V(sheen, 0.02, 0.01), 0.5);
  }

  function accWeather() {
    if (weather !== 'fog') return;
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

  accSketch(); accStructure(); accFigures(); accFoliage(); accLights(); accWater(); accWeather(); accSign();

  // Marks that run under a figure go on thinly, and so only once: the painter
  // retouches none but full-bodied marks. For a latecomer, the marks already
  // down are simply never gone over again.
  const settled = ['structure', 'foliage', 'water'];
  for (const name of settled) for (const s of groups[name]) if (s.alpha >= 0.6 && under(s, boxes)) s.alpha = 0.58;
  const arrive = () => {
    const from = groups.figures.length, seen = boxes.length;
    walker();
    const fresh = boxes.slice(seen);
    for (const name of settled) for (const s of groups[name]) if (s.alpha > 0 && under(s, fresh)) s.alpha = 0;
    return groups.figures.splice(from);
  };

  // Where falling leaves and petals come from: the nearest rank of trees, the
  // poplars, and the saplings on the meadow.
  const sources = [];
  if (env.falling === 'leaf' || env.falling === 'petal') {
    const petal = env.falling === 'petal';
    const from = (t, x, y, rx, ry, base) => {
      if (petal && !t.blossom) return;
      const cols = petal ? env.blossom.map((b) => env.shade(b, 1, t.z)) : [leafColor(t, 0.9), leafColor(t, 0.5), leafColor(t, 0.2), leafColor(t, 0.7)];
      sources.push({ x, y, rx, ry, base, cols });
    };
    for (const t of crowns) if (t.tier === 2 && !bare(t)) from(t, t.x, t.cy, t.rx, t.ry, PATH_Y + 2);
    if (!leafless) {
      for (const p of POPLARS) from({ kind: 'birch', z: Z.poplar }, p[0], lerp(p[1], POPLAR_BASE, 0.45), p[2], (POPLAR_BASE - p[1]) * 0.42, PATH_Y + 2);
      for (const s of SHRUBS) from({ kind: 'leaf', blossom: s === SHRUBS[0], z: s.z }, s.x, s.cy, s.rx, s.ry, s.base);
    }
  }

  const small = makeCanvas(Math.round(rw / 6), Math.round(rh / 6));
  const sc = small.getContext('2d', { willReadFrequently: true });
  sc.imageSmoothingQuality = 'high';
  sc.drawImage(ref, 0, 0, small.width, small.height);

  return {
    env, view, seed, ref, idMap, groups, sources, arrive, flying,
    regions: REGION,
    // No open water up here, so no rain rings. top is where the meadow begins:
    // a leaf caught by the wind comes down somewhere below it.
    water: { top: () => PATH_Y, open: () => false },
    snowLine: 480,                                                 // the park: snow settles from here down
    rw, rh, refData: c.getImageData(0, 0, rw, rh).data, idData: k.getImageData(0, 0, rw, rh).data,
    bw: small.width, bh: small.height, blurData: sc.getImageData(0, 0, small.width, small.height).data,
    snow: env.shade(A.snow, 1, 0.3)
  };
}

// ------------------------------------------------------------------- the kite

const KITE = { x: 418, y: 150, h: 30, w: 23 };              // where it flies, and its size

// A kite over the hill whenever the weather allows: a diamond with a tail of
// bows, on a line from the flyer's raised hand. It is one of the cast: the
// live layer tells it when the frame or the light changes, moves it on each
// frame and draws it.
class Kite {
  constructor(R) {
    this.R = R;
    this.up = false;            // whether the scene has someone flying it
    this.lift = 0;              // 0 in the hand .. 1 at the top of its line
    this.wait = 0;
    this.shown = false;
    this.phase = R.range(0, 6.28);
    this.seeds = Array.from({ length: 12 }, () => R.seed());
  }

  resize(view) {
    this.view = view;
  }

  // Take on a new scene's light. A kite already up stays up; one being
  // launched waits until its flyer has been painted in.
  set(scene) {
    const env = this.env = scene.env;
    if (scene.flying && !this.up && this.lift === 0) this.wait = 16.5;
    this.up = scene.flying;
    const lit = (col, l) => env.fogged(mul(col, env.light(l)), 0.4);
    this.cols = {
      red: lit(A.red, 1), redShade: lit(A.red, 0.35), gold: lit([1.0, 0.74, 0.16], 1), goldShade: lit([1.0, 0.74, 0.16], 0.45),
      bows: [lit(A.white, 1), lit(A.red, 1), lit([1.0, 0.74, 0.16], 1)], line: mix(env.skyLow, [0.14, 0.16, 0.28], 0.6)
    };
  }

  // For a picture in which nothing moves: up already, or not at all.
  still() {
    this.lift = this.up ? 1 : 0;
    this.wait = 0;
  }

  // Let line out, or wind it in. True while there is a kite to draw.
  tick(dt) {
    if (!this.up) this.lift = Math.max(0, this.lift - dt / 3);
    else if (this.wait > 0) this.wait -= dt;
    else this.lift = Math.min(1, this.lift + dt / 7);
    const seen = this.lift > 0 || this.shown;         // one more frame once it is down, to clear it away
    this.shown = this.lift > 0;
    return seen;
  }

  draw(ctx, time) {
    if (!(this.lift > 0)) return;
    const e = this.lift * this.lift * (3 - 2 * this.lift), gust = this.env.weather === 'cloudy' ? 1.35 : 1, t = time + this.phase, cols = this.cols;
    const x = lerp(HAND.x - 5, KITE.x + (54 * Math.sin(t * 0.41) + 15 * Math.sin(t * 1.13 + 1.3)) * gust, e);
    const y = lerp(HAND.y - 16, KITE.y + (20 * Math.sin(t * 0.83 + 0.5) + 7 * Math.sin(t * 1.9)) * gust, e);

    // the line, bellying a little below a straight run to the kite
    const dx = x - HAND.x, dy = y - HAND.y, run = Math.hypot(dx, dy) || 1, sag = run * 0.075;
    const bx = HAND.x + dx / 2 + dy / run * sag, by = HAND.y + dy / 2 - dx / run * sag;
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = css(cols.line, 0.6);
    ctx.beginPath();
    ctx.moveTo(HAND.x, HAND.y);
    ctx.quadraticCurveTo(bx, by, x, y);
    ctx.stroke();

    // the kite: nose away from the flyer, rocking; four panels, the pair on the sunny side in gold
    const a = Math.atan2(y - by, x - bx) + 0.22 * Math.sin(t * 1.7), ux = Math.cos(a), uy = Math.sin(a), k = lerp(0.7, 1, e);
    const h = KITE.h * k, w = KITE.w * k;
    const at = (along, across) => [x + ux * along * h - uy * across * w, y + uy * along * h + ux * across * w];
    const nose = at(0.4, 0), tail = at(-0.6, 0), cross = at(0.1, 0);
    const panel = (tip, end, col, width, seed) => {
      drawStroke(ctx, {
        x: (tip[0] + end[0] + cross[0]) / 3, y: (tip[1] + end[1] + cross[1]) / 3, a: Math.atan2(end[1] - tip[1], end[0] - tip[0]),
        len: Math.hypot(end[0] - tip[0], end[1] - tip[1]) * 0.9, w: width, col, alpha: 0.95, seed
      });
    };
    for (const side of [-1, 1]) {
      const wing = at(0.1, side * 0.5), sunny = wing[0] > x;
      panel(wing, tail, sunny ? cols.goldShade : cols.redShade, w * 0.34, this.seeds[side + 1]);
      panel(nose, wing, sunny ? cols.gold : cols.red, h * 0.2, this.seeds[side + 2]);
    }

    // its tail: a thread streaming down the wind, with bows along it
    const gx = -ux * 0.5 - 0.3, gy = -uy * 0.5 + 0.8, g = Math.hypot(gx, gy);
    const knot = (i) => {
      const d = i * 9 * k, sway = Math.sin(t * 3.2 - i * 0.8) * (1 + i * 0.9);
      return [tail[0] + (gx * d - gy * sway) / g, tail[1] + (gy * d + gx * sway) / g];
    };
    ctx.beginPath();
    ctx.moveTo(tail[0], tail[1]);
    for (let i = 1; i <= 6; i++) { const p = knot(i); ctx.lineTo(p[0], p[1]); }
    ctx.stroke();
    for (let i = 1; i <= 6; i++) {
      const p = knot(i);
      drawStroke(ctx, { x: p[0], y: p[1], a: Math.atan2(gy, gx) + HALF + 0.6 * Math.sin(t * 3.2 - i * 0.8), len: 5.5 * k, w: 2.6 * k, col: cols.bows[i % 3], alpha: 0.95, seed: this.seeds[4 + i] });
    }
  }
}

// ------------------------------------------------------------------ the birds

// A few birds crossing the sky together, every so often. Each is two strokes,
// its wings, beating.
class Birds {
  constructor(R) {
    this.R = R;
    this.flock = [];
    this.active = false;
    this.wait = R.range(4, 9);
  }

  resize(view) {
    this.view = view;
  }

  set(scene) {
    const env = this.env = scene.env;
    this.col = env.fogged(mul([0.21, 0.20, 0.27], env.light(0.4)), 0.5);
  }

  // Send a flock off from one side of the picture; or, given a place across
  // it (0..1), set them down there in mid-flight.
  launch(across) {
    const R = this.R, v = this.view, dir = R.chance(0.5) ? 1 : -1, size = R.range(0.8, 1.5);      // some flocks nearer than others
    const x = across === undefined ? (dir > 0 ? v.x - 30 : v.x + v.w + 30) : v.x + v.w * across, y = R.range(70, 290);
    this.dir = dir;
    this.speed = R.range(46, 78) * size;
    this.climb = R.range(-7, 5);
    this.flock = [];
    for (let i = 0, n = R.int(3, 7); i < n; i++) {
      const rank = Math.ceil(i / 2);                     // a loose V behind the leader
      this.flock.push({
        x: x - dir * rank * R.range(18, 36) * size, y: y + (i % 2 ? 1 : -1) * rank * R.range(6, 13) * size, size: size * R.range(0.85, 1.15),
        beat: R.range(5.5, 8), phase: R.range(0, 6.28), seed: R.seed()
      });
    }
    this.active = true;
  }

  // For a picture in which nothing moves: a flock caught part of the way across.
  still() {
    this.launch(this.R.range(0.3, 0.7));
  }

  // Fly on. True while they are in the picture and need redrawing.
  tick(dt) {
    if (!this.active) {
      if ((this.wait -= dt) > 0) return false;
      this.launch();
    }
    const v = this.view;
    let seen = false;
    for (const b of this.flock) {
      b.x += this.dir * this.speed * dt;
      b.y += this.climb * dt;
      b.phase += b.beat * dt;
      if (b.x > v.x - 60 && b.x < v.x + v.w + 60) seen = true;
    }
    if (!seen) { this.active = false; this.wait = this.R.range(9, 22); }
    return true;
  }

  draw(ctx) {
    if (!this.active) return;
    for (const b of this.flock) {
      const rise = 0.2 + 0.55 * Math.sin(b.phase), span = 10 * b.size, y = b.y - rise * 2 * b.size;      // the body dips as the wings come up
      for (const side of [-1, 1]) {
        drawStroke(ctx, {
          x: b.x + side * Math.cos(rise) * span / 2, y: y - Math.sin(rise) * span / 2, a: -side * rise, len: span, w: 2 * b.size,
          col: this.col, alpha: 0.9, round: true, bend: -0.2, seed: b.seed
        });
      }
    }
  }
}

// What the page needs in order to paint this place.
export const parliamentHill = {
  title: 'Parliament Hill',
  place: 'Parliament Hill on Hampstead Heath',
  sight: 'a meadow falling away to a row of poplars, with London along the horizon from the Shard to the BT Tower under a wide sky',
  wide: { x: 0, w: 1200 },              // the part of the scene space shown: all of it,
  tall: { x: 330, w: 640 },             // or an upright crop for phones
  build: buildScene,                    // (season, weather, seed, view) gives the scene the painter and live layer work from
  cast: (R) => [new Birds(R), new Kite(R)]      // what moves across it
};
