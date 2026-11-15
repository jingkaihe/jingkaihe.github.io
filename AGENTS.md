# jingkaihe.github.io

Personal site: one page that paints Eden Dock (Canary Wharf) on a canvas, stroke by stroke, and keeps retouching it. Static files only, no build step; served by GitHub Pages (`.nojekyll`).

## Layout

- `index.html`: the name (which opens the postcard), the framed canvas, its title, the season and weather buttons and their icon sprite, and the postcard dialog (bio and links).
- `assets/site.css`: page styles. Light and dark follow the system setting.
- `assets/js/scene.js`: the motif. Draws a flat reference of the view plus a surface map on hidden canvases, and lists the hand-placed marks (structure, foliage, figures, lights, water). Season and weather palettes and the lighting model (`environment`) live here. Coordinates are a 1200 x 800 scene space.
- `assets/js/painter.js`: plans strokes from the reference, coarse to fine, schedules them, then retouches indefinitely.
- `assets/js/live.js`: the animated layer above the painting: the DLR train, rain, falling leaves, petals and snow, and the marks that must stay in front of the train.
- `assets/js/brush.js`: how a single stroke is drawn. `assets/js/util.js`: colour and random helpers.
- `assets/js/main.js`: wiring: buttons, URL hash (`#autumn-rain`), canvas sizing, frame loop.
- `assets/js/postcard.js`: the postcard dialog: opening and closing it, and its stamp (`assets/stamp.jpg`, painted in the same brushwork the first time the card opens).
- `assets/fonts/`: self-hosted Newsreader and DM Mono (OFL).

## Commands

- Preview: `python3 -m http.server 8765`, then open http://localhost:8765/ (that server lets the browser keep modules for a few minutes, so hard-reload after edits)
- Syntax-check a module: `cp assets/js/scene.js /tmp/scene.mjs && node --check /tmp/scene.mjs`

## Conventions

- Plain ES modules, no dependencies, no bundler.
- Colours are `[r, g, b]` in 0..1. Surfaces get their colour through `env.shade(albedo, lit, depth)` so every season and weather stays consistent.
- With `prefers-reduced-motion` the picture arrives finished and nothing moves.
- Commits: one line, signed off (`git commit -sm`).
