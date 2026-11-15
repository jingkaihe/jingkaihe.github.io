// Small maths, colour and random helpers shared by the painting modules.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// Seeded generator (mulberry32) so a painting can be replayed from its number.
export function makeRng(seed) {
  let a = seed >>> 0;
  const r = function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
  r.pick = (list) => list[Math.floor(r() * list.length)];
  r.chance = (p) => r() < p;
  r.gauss = () => (r() + r() + r() - 1.5) * 2;
  r.seed = () => (r() * 4294967296) >>> 0;
  return r;
}

// Colours are [r, g, b] in 0..1.
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

const byte = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255));
export function css(c, alpha) {
  const body = byte(c[0]) + ',' + byte(c[1]) + ',' + byte(c[2]);
  return alpha === undefined ? 'rgb(' + body + ')' : 'rgba(' + body + ',' + alpha.toFixed(3) + ')';
}

const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const toGamma = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

export function toLab(c) {
  const r = toLinear(clamp(c[0], 0, 1)), g = toLinear(clamp(c[1], 0, 1)), b = toLinear(clamp(c[2], 0, 1));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  ];
}

export function fromLab(L, a, b) {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
  return [
    clamp(toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), 0, 1),
    clamp(toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), 0, 1),
    clamp(toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s), 0, 1)
  ];
}

// Broken colour: nudge lightness, chroma and the warm/cool balance of a colour
// so neighbouring strokes never quite match.
export function vary(c, rnd, dl, dab, dtemp) {
  const lab = toLab(c);
  const t = rnd.gauss() * (dtemp || 0);
  return fromLab(
    clamp(lab[0] + rnd.gauss() * dl, 0.04, 0.985),
    lab[1] + rnd.gauss() * dab + t * 0.35,
    lab[2] + rnd.gauss() * dab + t
  );
}
