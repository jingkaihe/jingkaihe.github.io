// Wires the painting to the page: the place, season and weather buttons, the
// title under the frame, the postcard behind the name, and the frame loop that
// keeps painter and live layer going.

import { edenDock } from './eden_dock.js';
import { parliamentHill } from './parliament_hill.js';
import { SEASONS, WEATHERS } from './climate.js';
import { H } from './sheet.js';
import { Painter, SETTLE } from './painter.js';
import { Live } from './live.js';
import { postcard } from './postcard.js';

// The motifs the page can paint, under the names they go by in the address. The first is the one shown unasked.
const MOTIFS = { 'eden-dock': edenDock, 'parliament-hill': parliamentHill };
const PLACES = Object.keys(MOTIFS);
const CHOICES = { place: PLACES, season: SEASONS, weather: WEATHERS };
const EFFECT = { sunny: 'Sunlight', cloudy: 'Grey Weather', fog: 'Fog', rain: 'Rain' };
const SEEN = { sunny: 'in sunshine', cloudy: 'under cloud', fog: 'in fog', rain: 'in the rain' };

const $ = (id) => document.getElementById(id);
const holder = $('painting'), buttons = $('conditions').querySelectorAll('button');
const narrow = matchMedia('(max-width: 640px) and (orientation: portrait)');

const painter = new Painter($('paint')), live = new Live($('live'));
painter.onFront = (s) => live.addFront(s);
live.onLand = (s) => painter.stamp(s);

const seasonNow = () => ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'][new Date().getMonth()];

// The address keeps the choice: #parliament-hill/autumn-rain (either half may be left out)
function fromHash() {
  const hash = location.hash.slice(1), cut = hash.indexOf('/');
  const place = cut < 0 ? (PLACES.includes(hash) ? hash : '') : hash.slice(0, cut);
  const parts = (cut < 0 && place ? '' : hash.slice(cut + 1)).split('-');
  return {
    place: PLACES.includes(place) ? place : PLACES[0],
    season: SEASONS.includes(parts[0]) ? parts[0] : seasonNow(),
    weather: WEATHERS.includes(parts[1]) ? parts[1] : 'sunny'
  };
}
const state = Object.assign({
  seed: Math.floor(Math.random() * 4294967296),                          // a different picture every visit
  still: matchMedia('(prefers-reduced-motion: reduce)').matches,         // then nothing moves: the picture arrives finished
  seen: true
}, fromHash());
let motif = null, view = null;      // what is on the easel, and the part of it in the frame

// What a click on the place, season or weather button moves on to.
function after(name) {
  const list = CHOICES[name];
  return list[(list.indexOf(state[name]) + 1) % list.length];
}
const said = (name, value) => (name === 'place' ? MOTIFS[value].title : value);      // a choice, as the buttons put it

// Size the canvases to the frame. True if they changed enough to need repainting.
function fit() {
  const next = narrow.matches ? motif.tall : motif.wide;      // phones get an upright crop of the scene
  let pw = Math.min(2400, Math.round(holder.clientWidth * Math.min(window.devicePixelRatio || 1, 2)));
  if (!pw) return false;
  const close = Math.abs(pw - painter.canvas.width) / painter.canvas.width < 0.2;
  if (next === view && close) return false;
  if (close) pw = painter.canvas.width;      // near enough: the same sheet will do, as when only the place has changed
  view = next;
  const ph = Math.round(pw * H / view.w);
  painter.resize(pw, ph, view);
  live.resize(pw, ph, view);
  return true;
}

// Put the chosen place on the easel, with its own cast. True if it was not there already.
function hang() {
  if (motif === MOTIFS[state.place]) return false;
  motif = MOTIFS[state.place];
  live.stage(motif.cast);
  view = null;
  fit();
  return true;
}

// Start a picture, or rework the one on the canvas into the new season and
// weather. A new place is not a rework: the old picture is brushed off and
// the new one begun from its sketch.
function paint() {
  const moved = hang();
  if (!view) return;
  const scene = motif.build(state.season, state.weather, state.seed, view);
  painter.absorb(live.front);
  painter.begin(scene, moved);
  live.set(scene);
  if (state.still) {
    painter.advance(SETTLE + 2);
    live.still();
    live.tick(0);
  }
  const season = state.season[0].toUpperCase() + state.season.slice(1);
  $('title').textContent = motif.title + ', ' + EFFECT[state.weather] + ', ' + season;
  holder.setAttribute('aria-label', 'A painting of ' + motif.place + ' in ' + state.season + ', ' + SEEN[state.weather] + ': ' + motif.sight + '.');
  for (const b of buttons) {
    b.querySelector('use').setAttribute('href', '#i-' + state[b.name]);
    b.title = b.name[0].toUpperCase() + b.name.slice(1) + ': ' + said(b.name, state[b.name]);
    b.setAttribute('aria-label', b.title + '. Switch to ' + said(b.name, after(b.name)) + '.');
  }
  history.replaceState(null, '', '#' + state.place + '/' + state.season + '-' + state.weather);
}

for (const b of buttons) b.addEventListener('click', () => { state[b.name] = after(b.name); paint(); });
window.addEventListener('hashchange', () => { Object.assign(state, fromHash()); paint(); });

postcard();

let settle = 0;
new ResizeObserver(() => {
  clearTimeout(settle);
  settle = setTimeout(() => { if (fit()) paint(); }, 200);
}).observe(holder);
new IntersectionObserver((entries) => { state.seen = entries[0].isIntersecting; }).observe(holder);

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!state.still && state.seen) { painter.tick(dt); live.tick(dt); }
}

paint();
requestAnimationFrame(frame);
