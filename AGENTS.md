# jingkaihe.github.io

Personal site: one page that paints a place (Eden Dock at Canary Wharf, or Parliament Hill on Hampstead Heath) on a canvas, stroke by stroke, and keeps retouching it. Static files only, no build step; served by GitHub Pages (`.nojekyll`).

## Layout

- `index.html`: the name (which opens the postcard), the framed canvas, its title, the place button (the place's name in words), the season and weather buttons and their icon sprite, and the postcard dialog (bio and links).
- `assets/site.css`: page styles. Light and dark follow the system setting.
- `assets/js/eden_dock.js`: Eden Dock, the first motif, and everything particular to it. `buildScene` draws a flat reference of the view plus a surface map on hidden canvases, and lists the hand-placed marks (structure, foliage, figures, lights, water). The file also says how each surface is brushed (`REGION`), holds the DLR train, and ends with the `edenDock` object the page paints from.
- `assets/js/parliament_hill.js`: Parliament Hill, the second motif, laid out the same way and painted as an Impressionist would: broken colour in the grass, cool shadows, a city lost in haze (the `Z` depths run well past 1). Its cast is a kite and passing birds. Ends with the `parliamentHill` object.
- `assets/js/climate.js`: the seasons and weathers, their palettes and the lighting model (`environment`). Shared by every motif.
- `assets/js/sheet.js`: the 1200 x 800 scene space every motif is laid out in, the surface map's colour code, shape helpers.
- `assets/js/painter.js`: plans strokes from the reference, coarse to fine, schedules them, then retouches indefinitely. Asked to begin afresh over a picture (a change of place), it brushes the old one off first.
- `assets/js/live.js`: the animated layer above the painting: the motif's cast (the train at Eden Dock; the kite and birds on Parliament Hill), rain, falling leaves, petals and snow, and the marks that must stay in front of the cast.
- `assets/js/brush.js`: how a single stroke is drawn. `assets/js/util.js`: colour and random helpers.
- `assets/js/main.js`: wiring: the motifs by name (`MOTIFS`), buttons, URL hash (`#parliament-hill/autumn-rain`; either half may be left out), canvas sizing, frame loop.
- `assets/js/wallpaper.js`: the cheat (up up down down left right left right B A, or those swipes on the painting and two taps). It paints the picture on the easel again, finished and still, at the size and shape of the screen the page is on, and downloads it as a JPEG.
- `assets/js/postcard.js`: the postcard dialog: opening and closing it, and its stamp (`assets/stamp.jpg`, painted in the same brushwork the first time the card opens).
- `assets/fonts/`: self-hosted Newsreader and DM Mono (OFL).

## Commands

- Preview: `python3 -m http.server 8765`, then open http://localhost:8765/ (that server lets the browser keep modules for a few minutes, so hard-reload after edits)
- Syntax-check a module: `cp assets/js/eden_dock.js /tmp/eden_dock.mjs && node --check /tmp/eden_dock.mjs`

## Another motif

A motif (a scene the page can paint) is one module like `eden_dock.js`. It exports an object with `title`, `place` and `sight` (for the title and the description read to screen readers), `wide` and `tall` (the crops), `trim` (for a wallpaper wider than 3:2, the share of the lost height taken from the top; the rest comes off the bottom), `build(season, weather, seed, view)` and `cast(R)` (its moving parts). `main.js` is the only file that names the motifs: import the new one and add it to `MOTIFS` under the name it goes by in the address; the place button reads its `title`. What `build` returns is read by `painter.js` and `live.js`: `env`, `groups` (named as in the painter's `PHASES`), `regions`, the reference, surface map and blurred reference as pixel data, `arrive`, `water`, `snowLine` and `snow`.

- `view` is `{ x, w }`, the columns of the scene shown. A wallpaper cut short adds `bottom`, the lowest row shown: put anything that belongs at the foot of the picture (the signature) at `(view.bottom || H)`.
- Keep each surface's `len` and `w` in `REGION` near 1 unless it is small: the first two passes are what cover the canvas, and short narrow strokes leave the toned ground showing through.
- A hand-placed mark with `kept: true` belongs to something built from marks that overlap in a set order (a figure near enough to have limbs). The painter lays kept marks last in their group, in the order listed, keeps fine strokes off their whole width, and does not retouch them one at a time; the brush squares off their ends, so let each part run in under the next and they join up.
- The painter retouches hand-placed marks for as long as the page is open, so a mark lying across something that must stay legible (a figure, the signature) will eventually be painted over it. `parliament_hill.js` lists such things in `boxes` and thins the marks under them so they are laid once and never retouched.
- Leaves and petals fall only from painted ones, and keep to the distance of the tree they leave. A foliage mark given `sheds` is one a leaf may come away from: the painter tells the live layer when it lays the mark, and the leaf starts there, in the mark's colour. `sheds` is how it comes down, one object per tree: `to(x)`, the height it falls to (the ground at the foot of its tree or, if something nearer hides that, the top of whatever does); `scale`, how big and so how quick it looks at that distance (1 if left out); `lost`, if it goes out of sight there instead of lying to be painted in; `afloat`, if the tree stands by water its leaves may be blown out onto. A leaf from a tree across the way must never land near us: give it a small `scale` and let it be `lost` at its tree's foot, as `parliament_hill.js` does for the trees beyond the park. Tag the marks themselves as they are listed (after any test for what hides them), never an area, so that nothing can fall from a tree not yet painted, from behind something nearer or from outside the frame.
- A member of the cast has `resize(view)`, `set(scene)`, `tick(dt)` and `draw(ctx, time)`; give it `still()` as well if it should appear when nothing is allowed to move.

## Conventions

- Plain ES modules, no dependencies, no bundler.
- Colours are `[r, g, b]` in 0..1. Surfaces get their colour through `env.shade(albedo, lit, depth)` so every season and weather stays consistent.
- With `prefers-reduced-motion` the picture arrives finished and nothing moves.
- Commits: one line, signed off (`git commit -sm`).
