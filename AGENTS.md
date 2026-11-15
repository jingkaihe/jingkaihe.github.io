# jingkaihe.github.io

Personal site: one page that paints Eden Dock (Canary Wharf) on a canvas, stroke by stroke, and keeps retouching it. Static files only, no build step; served by GitHub Pages (`.nojekyll`).

## Layout

- `index.html`: the name (which opens the postcard), the framed canvas, its title, the season and weather buttons and their icon sprite, and the postcard dialog (bio and links).
- `assets/site.css`: page styles. Light and dark follow the system setting.
- `assets/js/eden_dock.js`: Eden Dock, the one motif so far, and everything particular to it. `buildScene` draws a flat reference of the view plus a surface map on hidden canvases, and lists the hand-placed marks (structure, foliage, figures, lights, water). The file also says how each surface is brushed (`REGION`), holds the DLR train, and ends with the `edenDock` object the page paints from.
- `assets/js/climate.js`: the seasons and weathers, their palettes and the lighting model (`environment`). Shared by every motif.
- `assets/js/sheet.js`: the 1200 x 800 scene space every motif is laid out in, the surface map's colour code, shape helpers.
- `assets/js/painter.js`: plans strokes from the reference, coarse to fine, schedules them, then retouches indefinitely.
- `assets/js/live.js`: the animated layer above the painting: the motif's cast (at Eden Dock, the train), rain, falling leaves, petals and snow, and the marks that must stay in front of the cast.
- `assets/js/brush.js`: how a single stroke is drawn. `assets/js/util.js`: colour and random helpers.
- `assets/js/main.js`: wiring: buttons, URL hash (`#autumn-rain`), canvas sizing, frame loop.
- `assets/js/postcard.js`: the postcard dialog: opening and closing it, and its stamp (`assets/stamp.jpg`, painted in the same brushwork the first time the card opens).
- `assets/fonts/`: self-hosted Newsreader and DM Mono (OFL).

## Commands

- Preview: `python3 -m http.server 8765`, then open http://localhost:8765/ (that server lets the browser keep modules for a few minutes, so hard-reload after edits)
- Syntax-check a module: `cp assets/js/eden_dock.js /tmp/eden_dock.mjs && node --check /tmp/eden_dock.mjs`

## Another motif

A motif (a scene the page can paint) is one module like `eden_dock.js`. It exports an object with `title`, `place` and `sight` (for the title and the description read to screen readers), `wide` and `tall` (the crops), `build(season, weather, seed, view)` and `cast(R)` (its moving parts). `main.js` is the only file that names a motif. What `build` returns is read by `painter.js` and `live.js`: `env`, `groups` (named as in the painter's `PHASES`), `regions`, the reference, surface map and blurred reference as pixel data, `sources`, `arrive`, `water`, `snowLine` and `snow`.

## Conventions

- Plain ES modules, no dependencies, no bundler.
- Colours are `[r, g, b]` in 0..1. Surfaces get their colour through `env.shade(albedo, lit, depth)` so every season and weather stays consistent.
- With `prefers-reduced-motion` the picture arrives finished and nothing moves.
- Commits: one line, signed off (`git commit -sm`).
