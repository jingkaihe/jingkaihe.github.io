// The cheat: up up down down left right left right B A, or on a touch screen
// the same swipes across the painting and two taps. It paints the picture on
// the easel over again at the size of the screen the page is on, and hands it
// over as a wallpaper.
//
// The wallpaper is the picture a visitor who would rather nothing moved sees:
// the same place, season, weather and painting (the seed), finished, with the
// cast holding still. A screen narrower than the scene gets an upright crop of
// it, about where the phone crop is; one wider gets all of it across, cut
// short above and below as the motif's trim says, with the signature brought
// up to the new bottom edge.

import { H, makeCanvas } from './sheet.js';
import { Painter, SETTLE } from './painter.js';
import { Live } from './live.js';
import { makeRng, clamp, lerp } from './util.js';

const KEYS = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const SWIPES = KEYS.slice(0, 8).concat('tap', 'tap');
const LONGEST = 7680;      // pixels along the longer side, at most: 8K, well inside what browsers allow a canvas
const QUALITY = 0.95;

const breathe = () => new Promise((done) => requestAnimationFrame(() => setTimeout(done)));

// Listen for the code, from the keyboard anywhere on the page, or as swipes
// and taps on the surface.
function listen(surface, then) {
  const heard = [];
  const hear = (step) => {
    heard.push(step);
    if (heard.length > KEYS.length) heard.shift();
    if (KEYS.every((s, i) => s === heard[i]) || SWIPES.every((s, i) => s === heard[i])) { heard.length = 0; then(); }
  };
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    hear(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  });
  let x0 = 0, y0 = 0, one = false;
  surface.addEventListener('touchstart', (e) => {
    one = e.touches.length === 1;
    if (one) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }
  }, { passive: true });
  surface.addEventListener('touchend', (e) => {
    if (!one) return;
    one = false;
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0, d = Math.max(Math.abs(dx), Math.abs(dy));
    if (d < 12) hear('tap');
    else if (d > 30) hear(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp'));
  }, { passive: true });
}

// The screen the page is on, in its own pixels, and how many of them to a CSS pixel.
function screenSize() {
  const sw = screen.width || innerWidth, sh = screen.height || innerHeight;
  const dpr = window.devicePixelRatio || 1, k = dpr / Math.max(1, Math.max(sw, sh) * dpr / LONGEST);
  return { w: Math.round(sw * k), h: Math.round(sh * k), k };
}

// The part of the scene a w x h picture shows, and how far down the scene it starts.
function compose(motif, w, h) {
  const wide = motif.wide, tall = motif.tall, across = H * w / h;      // scene units across, were all of its height kept
  if (across >= wide.w) {
    const rows = wide.w * h / w, top = (H - rows) * (motif.trim === undefined ? 0.5 : motif.trim);
    return { view: { x: wide.x, w: wide.w, bottom: top + rows }, top };
  }
  const t = clamp((across - tall.w) / (wide.w - tall.w), 0, 1), mid = lerp(tall.x + tall.w / 2, wide.x + wide.w / 2, t);
  return { view: { x: clamp(mid - across / 2, wide.x, wide.x + wide.w - across), w: across }, top: 0 };
}

// The canvas's weave and tooth, as the page lays them over the painting
// (.canvas::after), at k pixels to the CSS pixel.
function weave(g, w, h, k) {
  const n = 219, tile = makeCanvas(n, n), c = tile.getContext('2d'), px = c.createImageData(n, n), R = makeRng(0x7ea5e);
  for (let i = 0; i < px.data.length; i += 4) {
    px.data[i] = px.data[i + 1] = px.data[i + 2] = 188;
    px.data[i + 3] = clamp(0.35 + (R() + R() - 1) * 0.45, 0, 1) * 255;
  }
  c.putImageData(px, 0, 0);
  c.fillStyle = 'rgba(255, 255, 255, 0.045)';
  for (let x = 0; x < n; x += 3) c.fillRect(x, 0, 1, n);
  c.fillStyle = 'rgba(0, 0, 0, 0.05)';
  for (let y = n - 1; y >= 0; y -= 3) c.fillRect(0, y, n, 1);
  g.save();
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = 0.55;
  g.scale(k, k);
  g.fillStyle = g.createPattern(tile, 'repeat');
  g.fillRect(0, 0, w / k, h / k);
  g.restore();
}

// Paint the picture afresh on a w x h sheet, finished, as reduced motion would show it.
async function paint(motif, choice, w, h, k) {
  const { view, top } = compose(motif, w, h), ph = Math.round(w * H / view.w);
  const painter = new Painter(makeCanvas(1, 1)), live = new Live(makeCanvas(1, 1));
  painter.onFront = (s) => live.addFront(s);
  live.stage(motif.cast);
  painter.resize(w, ph, view);
  live.resize(w, ph, view);
  const scene = motif.build(choice.season, choice.weather, choice.seed, view);
  painter.begin(scene, false);
  live.set(scene);
  for (let t = 0, n = 0; t < SETTLE + 2; t += 0.05) {      // as painter.advance(), but letting the page breathe
    painter.tick(0.05, true);
    if (++n % 6 === 0) await breathe();
  }
  live.still();
  live.tick(0);
  const out = makeCanvas(w, h), g = out.getContext('2d'), dy = -Math.round(top * w / view.w);
  g.drawImage(painter.canvas, 0, dy);
  g.drawImage(live.canvas, 0, dy);
  weave(g, w, h, k);
  painter.canvas.width = live.canvas.width = 0;      // big canvases are heavy: let go of them now
  return out;
}

function save(canvas, name) {
  return new Promise((done, fail) => canvas.toBlob((blob) => {
    if (!blob) { fail(new Error('the picture could not be encoded')); return; }
    const a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    done();
  }, 'image/jpeg', QUALITY));
}

// Listen for the cheat. easel() says what is being painted: the motif, and the
// place, season, weather and seed it is painted with.
export function wallpaper(surface, easel) {
  const notice = document.getElementById('notice');
  let busy = false, hide = 0;
  const say = (text, linger) => {
    clearTimeout(hide);
    notice.textContent = text;
    notice.classList.add('shown');
    if (linger) hide = setTimeout(() => notice.classList.remove('shown'), linger);
  };
  listen(surface, async () => {
    if (busy) return;
    busy = true;
    const choice = easel(), { w, h, k } = screenSize();
    say('Painting a wallpaper, ' + w + ' \u00d7 ' + h + '\u2026');
    try {
      await breathe();
      const canvas = await paint(choice.motif, choice, w, h, k);
      await save(canvas, [choice.place, choice.season, choice.weather, w + 'x' + h].join('-') + '.jpg');
      canvas.width = 0;
      say('Wallpaper painted', 2500);
    } catch (e) {
      console.error(e);
      say('The wallpaper could not be painted', 4000);
    }
    busy = false;
  });
}
