// The seasons and the weather, and what each brings to any motif: the light
// and the air, the colour of the leaves, how busy it is outdoors, and what is
// falling from the sky.

import { mix, mul, scale, clamp } from './util.js';

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const WEATHERS = ['sunny', 'cloudy', 'fog', 'rain'];

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
