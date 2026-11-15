// The sheet every motif is laid out on: a 1200 x 800 scene space, the scale of
// the small hidden canvases its reference is drawn on, the colour code that
// marks which surface is where, and a few shape helpers.

export const W = 1200, H = 800;
export const RS = 0.6;                         // reference canvas scale

// A surface's number, as a colour on the surface map and back again.
export const idCss = (id) => 'rgb(' + id * 12 + ',' + (id * 53) % 256 + ',0)';
export function idAt(data, i) {
  const id = Math.round(data[i] / 12);
  return data[i] === id * 12 && data[i + 1] === (id * 53) % 256 && data[i + 3] === 255 ? id : 0;
}

export const makeCanvas = (w, h) => { const el = document.createElement('canvas'); el.width = w; el.height = h; return el; };
export const poly = (pts) => { const p = new Path2D(); p.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]); p.closePath(); return p; };
export const rect = (x, y, w, h) => { const p = new Path2D(); p.rect(x, y, w, h); return p; };
export const ellipse = (x, y, rx, ry) => { const p = new Path2D(); p.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); return p; };
