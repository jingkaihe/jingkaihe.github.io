// Wires the painting to the page: the season and weather choices, the label
// under the frame, and the frame loop that keeps painter and live layer going.

import { buildScene, SEASONS, WEATHERS, H } from './scene.js';
import { Painter, SETTLE } from './painter.js';
import { Live } from './live.js';

const EFFECT = { sunny: 'Sunlight', cloudy: 'Grey Weather', fog: 'Fog', rain: 'Rain' };
const SEEN = { sunny: 'in sunshine', cloudy: 'under cloud', fog: 'in fog', rain: 'in the rain' };
const WIDE = { x: 0, w: 1200 }, TALL = { x: 330, w: 640 };      // phones get an upright crop of the scene

const $ = (id) => document.getElementById(id);
const holder = $('painting'), form = $('controls'), pauseButton = $('pause');
const narrow = matchMedia('(max-width: 640px) and (orientation: portrait)');
const calm = matchMedia('(prefers-reduced-motion: reduce)');

const painter = new Painter($('paint')), live = new Live($('live'));
painter.onFront = (s) => live.addFront(s);
live.onLand = (s) => painter.stamp(s);

const newNumber = () => 10000 + Math.floor(Math.random() * 90000);
const seasonNow = () => ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'][new Date().getMonth()];

// The address keeps the picture: #autumn-rain-48213
function fromHash() {
  const parts = location.hash.slice(1).split('-');
  return {
    season: SEASONS.includes(parts[0]) ? parts[0] : seasonNow(),
    weather: WEATHERS.includes(parts[1]) ? parts[1] : 'sunny',
    seed: /^\d{5}$/.test(parts[2] || '') ? Number(parts[2]) : newNumber()
  };
}
const state = Object.assign({ paused: calm.matches, seen: true }, fromHash());
let view = null;

// Size the canvases to the frame. True if they changed enough to need repainting.
function fit() {
  const next = narrow.matches ? TALL : WIDE;
  const pw = Math.min(2400, Math.round(holder.clientWidth * Math.min(window.devicePixelRatio || 1, 2)));
  if (!pw) return false;
  if (next === view && Math.abs(pw - painter.canvas.width) / painter.canvas.width < 0.2) return false;
  view = next;
  const ph = Math.round(pw * H / view.w);
  painter.resize(pw, ph, view);
  live.resize(pw, ph, view);
  return true;
}

function label() {
  const season = state.season[0].toUpperCase() + state.season.slice(1);
  $('title').textContent = 'Eden Dock, ' + EFFECT[state.weather] + ', ' + season;
  $('number').textContent = 'No. ' + state.seed;
  holder.setAttribute('aria-label', 'A painting of Eden Dock at Canary Wharf in ' + state.season + ', ' + SEEN[state.weather] +
    ': a pale stone office block, the DLR bridge and a glass tower with pointed arches, reflected in the water.');
  for (const el of form.elements) if (el.type === 'radio') el.checked = state[el.name] === el.value;
  pauseButton.textContent = state.paused ? 'Resume' : 'Pause';
  pauseButton.setAttribute('aria-pressed', String(state.paused));
  history.replaceState(null, '', '#' + state.season + '-' + state.weather + '-' + state.seed);
}

// Start a picture, or rework the one on the canvas into the new season and weather.
function paint() {
  if (!view) return;
  const scene = buildScene(state.season, state.weather, state.seed, view);
  painter.absorb(live.front);
  painter.begin(scene);
  live.set(scene);
  if (state.paused) {                  // nothing may move: show it finished
    painter.advance(SETTLE + 2);
    live.still();
    live.tick(0);
  }
  label();
}

form.addEventListener('change', (e) => {
  if (e.target.name !== 'season' && e.target.name !== 'weather') return;
  state[e.target.name] = e.target.value;
  paint();
});
$('again').addEventListener('click', () => { state.seed = newNumber(); paint(); });
pauseButton.addEventListener('click', () => { state.paused = !state.paused; label(); });
window.addEventListener('hashchange', () => { Object.assign(state, fromHash()); paint(); });

let settle = 0;
new ResizeObserver(() => {
  clearTimeout(settle);
  settle = setTimeout(() => { if (fit()) paint(); }, 200);
}).observe(holder);
new IntersectionObserver((entries) => { state.seen = entries[0].isIntersecting; }).observe(holder);

let last = performance.now(), shown = -1, told = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!state.paused && state.seen) { painter.tick(dt); live.tick(dt); }
  if (painter.count !== shown && now - told > 250) {
    shown = painter.count; told = now;
    $('count').textContent = shown.toLocaleString('en-GB') + ' strokes';
  }
}

fit();
paint();
requestAnimationFrame(frame);
