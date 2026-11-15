// The postcard behind the name: opening and closing it, and its stamp, a
// photograph painted in the same brushwork as the picture the first time the
// card is turned over.

import { makeRng, vary, clamp } from './util.js';
import { drawStroke } from './brush.js';

const $ = (id) => document.getElementById(id);
const HALF = Math.PI / 2;
const GROUND = '#d9ccb0';                      // the same toned ground the painting starts from
const PASSES = [                               // grid step, stroke width, length, how far colour wanders
  [16, 16, 30, 0.035],
  [8, 7.5, 15, 0.028],
  [4, 3.4, 7.5, 0.02]
];

// Strokes for a small painting of img, coarse to fine. Each pass lays smaller
// dabs on a jittered grid, turned to run along any edge they sit on; the
// finest pass is kept mostly for where the photograph has detail.
function plan(img, w, h) {
  const ref = document.createElement('canvas');
  ref.width = w; ref.height = h;
  const c = ref.getContext('2d', { willReadFrequently: true });
  const fit = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  c.drawImage(img, (w - img.naturalWidth * fit) / 2, (h - img.naturalHeight * fit) / 2, img.naturalWidth * fit, img.naturalHeight * fit);
  const px = c.getImageData(0, 0, w, h).data, R = makeRng(1335938), strokes = [];
  const at = (x, y) => (clamp(Math.round(y), 0, h - 1) * w + clamp(Math.round(x), 0, w - 1)) * 4;
  const lum = (x, y) => { const i = at(x, y); return (0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]) / 255; };
  PASSES.forEach(([step, width, length, wander], n) => {
    const list = [];
    for (let gy = 0; gy < h + step; gy += step) for (let gx = 0; gx < w + step; gx += step) {
      const x = gx + (R() - 0.5) * step, y = gy + (R() - 0.5) * step;
      const dx = lum(x + 3, y) - lum(x - 3, y), dy = lum(x, y + 3) - lum(x, y - 3), edge = Math.hypot(dx, dy);
      if (n === PASSES.length - 1 && R() > 0.3 + edge * 7) continue;
      const i = at(x, y);
      list.push({
        x, y, a: edge > 0.06 ? Math.atan2(dy, dx) + HALF + R.gauss() * 0.15 : -0.5 + R.gauss() * 0.5,
        len: length * R.range(0.7, 1.3), w: width * R.range(0.8, 1.2),
        col: vary([px[i] / 255, px[i + 1] / 255, px[i + 2] / 255], R, wander, wander * 0.6, wander * 0.6),
        alpha: 0.94, bend: R.range(-0.12, 0.12), seed: R.seed()
      });
    }
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)), t = list[i]; list[i] = list[j]; list[j] = t; }
    strokes.push(...list);
  });
  return strokes;
}

// Lay the strokes down over about a second, or all at once if nothing may move.
function paint(ctx, strokes, still) {
  const each = still ? strokes.length : Math.ceil(strokes.length / 75);
  let i = 0;
  (function frame() {
    for (let n = each; n > 0 && i < strokes.length; n--) drawStroke(ctx, strokes[i++]);
    if (i < strokes.length) requestAnimationFrame(frame);
  })();
}

export function postcard() {
  const card = $('about'), name = $('about-open'), heading = $('about-name'), canvas = $('stamp'), ctx = canvas.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let painted = false;
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Opened by touch or mouse, nothing should be left looking focused: the name
  // lets go of focus first, so there is none to hand back when the card closes,
  // and the card's heading takes it rather than the x. Opened from the
  // keyboard, focus returns to the name afterwards.
  function open(byKey) {
    if (!byKey) name.blur();
    card.showModal();
    if (document.activeElement !== heading) heading.focus();
    if (painted) return;
    painted = true;
    const img = new Image();
    img.onload = () => paint(ctx, plan(img, canvas.width, canvas.height), still);
    img.src = 'assets/stamp.jpg';
  }

  // The name is plain text, so it gets the keys a button would have.
  name.addEventListener('click', () => open(false));
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(true); } });
  $('about-close').addEventListener('click', () => card.close());
  card.addEventListener('click', (e) => { if (e.target === card) card.close(); });      // a click on the wall beside the card
}
