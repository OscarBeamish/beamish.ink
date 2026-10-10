You are building **Halide & Grain** from Beamish into this project.

> An invented photographic agency where one primitive, the frame of a negative, is every surface on the page. A whole page, MIT.
> https://beamish.ink/templates/halide-and-grain

This is a page, not a component. It is one HTML file, one stylesheet and one
entry script, built out of 9 pieces of the library, and the
brand on it is invented so that you can throw it away. Take the layout and the
wiring; replace the words, the colours and the pictures with the real ones.

Beamish is not a package and there is nothing to install from npm.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None.
- **Ground:** this page is built for a paper background. Its items are tuned for a light page; on black it will look wrong.
- **One WebGL context.** Several of these items each want one, and the budget
  is one for the whole page, so the stage hands it between them as you scroll.
  That is already wired; do not mount two backdrops without it.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch the page

| Save as | Fetch from |
| --- | --- |
| `index.html` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/templates/halide-and-grain/index.html |
| `styles.css` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/templates/halide-and-grain/styles.css |
| `entry.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/templates/halide-and-grain/entry.ts |
| `meta.json` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/templates/halide-and-grain/meta.json |

`entry.ts` imports the library by relative path and imports `meta.json` for the
colophon, which is why that file is in the list: without it the page does not
build. Keep that shape, or fix the imports when you move things.

## 2. Fetch what it is built from

| Item | Save as | Fetch from |
| --- | --- | --- |
| `TwelveColumn` | `grids/twelve-column/grid.css` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/grids/twelve-column/grid.css |
| `MarginaliaColumns` | `grids/marginalia-columns/grid.css` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/grids/marginalia-columns/grid.css |
| `HalftoneReveal` | `effects/halftone-reveal/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/halftone-reveal/core.ts |
| `ExpandingTiles` | `effects/expanding-tiles/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/expanding-tiles/core.ts |
| `ScrambleText` | `effects/scramble-text/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/scramble-text/core.ts |
| `CrosshairCursor` | `effects/crosshair-cursor/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/crosshair-cursor/core.ts |
| `CountUpNumber` | `effects/count-up-number/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/count-up-number/core.ts |
| `PaperGrain` | `effects/paper-grain/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/paper-grain/core.ts |
| `Stage` | `shared/stage.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/stage.ts |
| shared | `shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| shared | `shared/ground.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/ground.ts |
| shared | `shared/tokens.css` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/tokens.css |
| shared | `shared/fonts.css` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/fonts.css |

Keep the paths. `entry.ts` imports `../../effects/<name>/core` and the page
links `../../shared/tokens.css`, so the tree has to mirror the repo or every
import has to be rewritten.

## 3. The ground is declared, not assumed

The page sets `<html data-ground="paper">`
and `tokens.css` has no fallback palette. Drop that attribute and the page
loses every colour it has, which is deliberate: a ground is a decision, and a
value you have to fill in cannot quietly be wrong.

## 4. What is on the page

- [TwelveColumn](https://beamish.ink/grids/twelve-column)
- [MarginaliaColumns](https://beamish.ink/grids/marginalia-columns)
- [HalftoneReveal](https://beamish.ink/effects/halftone-reveal)
- [ExpandingTiles](https://beamish.ink/effects/expanding-tiles)
- [ScrambleText](https://beamish.ink/effects/scramble-text)
- [CrosshairCursor](https://beamish.ink/effects/crosshair-cursor)
- [CountUpNumber](https://beamish.ink/effects/count-up-number)
- [PaperGrain](https://beamish.ink/effects/paper-grain)
- Stage

The page writes that list into its own footer from `meta.json`, so if you drop
an item, drop it from `uses` too and the colophon follows.

## 5. Make it yours

The brand is invented. There is no such company, the copy is written for this
page and every figure on it is made up, so none of it is precious.

- Replace the words first. The layout was built around real sentences rather
  than lorem, which is why it holds, and it will hold around yours.
- The page's own stylesheet carries the brand: its type scale, its colours and
  its chrome. No class in it uses the `g-` prefix, so the line between the
  library and the page using it stays visible while you edit.
- The photographs are from Unsplash and credited in the repo. Swap them.
- Keep the pause control on anything ambient. WCAG 2.2.2 is Level A.
