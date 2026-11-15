// One brushstroke: a few bristle tracks laid side by side. Each track gets its
// own length, tone and opacity, which leaves ragged ends and a streaked body;
// tracks on the side facing the light (upper left) are lifted slightly so the
// paint reads as having thickness.

const b255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

export function drawStroke(ctx, s) {
  const w = s.w, len = s.len;
  const dx = Math.cos(s.a), dy = Math.sin(s.a), nx = -dy, ny = dx;
  const n = s.round ? 1 : w > 22 ? 9 : w > 11 ? 7 : w > 5.5 ? 5 : w > 2.6 ? 3 : w > 1.5 ? 2 : 1;      // round = a single dot or line
  const bw = w / n;
  let h = (s.seed || 1) >>> 0;
  const rnd = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
  const relief = (nx * -0.55 + ny * -0.83) * 0.11;
  const bend = (s.bend || 0) * len;
  const r = s.col[0] * 255, g = s.col[1] * 255, b = s.col[2] * 255;
  const ragged = n > 1 ? (s.kept ? 0.06 : 0.3) : 0;      // a kept mark is part of a figure: its ends are all but square, so the parts meet
  ctx.lineCap = s.round || len < w * 1.6 ? 'round' : 'butt';
  ctx.lineWidth = n === 1 ? bw : bw * 1.45;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i + 0.5) / n - 0.5;
    const off = t * w;
    const a0 = -0.5 * len * (1 - ragged * rnd()), a1 = 0.5 * len * (1 - ragged * rnd());
    const sh = 255 * ((rnd() - 0.5) * 0.085 + t * relief);
    const alpha = s.alpha * (0.8 + 0.2 * rnd());
    ctx.strokeStyle = 'rgba(' + b255(r + sh) + ',' + b255(g + sh) + ',' + b255(b + sh) + ',' + alpha.toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(s.x + dx * a0 + nx * off, s.y + dy * a0 + ny * off);
    if (bend) {
      ctx.quadraticCurveTo(s.x + nx * (off + bend), s.y + ny * (off + bend), s.x + dx * a1 + nx * off, s.y + dy * a1 + ny * off);
    } else {
      ctx.lineTo(s.x + dx * a1 + nx * off, s.y + dy * a1 + ny * off);
    }
    ctx.stroke();
  }
}
