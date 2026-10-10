You are building **Coil & Bias** from Beamish into this project.

> An invented audio hardware brand where one primitive, a panel of brushed aluminium with its legends cut into it, is every surface on the page. A whole page, MIT.
> https://beamish.ink/templates/coil-and-bias

This is a page, not a component. It is one HTML file, one stylesheet and one
entry script, built out of 10 pieces of the library, and the
brand on it is invented so that you can throw it away. Take the layout and the
wiring; replace the words, the colours and the pictures with the real ones.

Beamish is not a package and there is nothing to install from npm.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None.
- **Ground:** this page is built for a dark background. Its items are tuned for a near-black page; on paper it will look wrong.
- **One WebGL context.** Several of these items each want one, and the budget
  is one for the whole page, so the stage hands it between them as you scroll.
  That is already wired; do not mount two backdrops without it.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Fetch the page

| Save as | Fetch from |
| --- | --- |
| `index.html` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/templates/coil-and-bias/index.html |
| `styles.css` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/templates/coil-and-bias/styles.css |
| `entry.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/templates/coil-and-bias/entry.ts |
| `meta.json` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/templates/coil-and-bias/meta.json |

`entry.ts` imports the library by relative path and imports `meta.json` for the
colophon, which is why that file is in the list: without it the page does not
build. Keep that shape, or fix the imports when you move things.

## 2. Fetch what it is built from

| Item | Save as | Fetch from |
| --- | --- | --- |
| `TwelveColumn` | `grids/twelve-column/grid.css` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/grids/twelve-column/grid.css |
| `GlassNav` | `components/glass-nav/glass.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/components/glass-nav/glass.ts |
| `GlassNav` | `components/glass-nav/styles.css` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/components/glass-nav/styles.css |
| `AuroraCurtain` | `effects/aurora-curtain/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/aurora-curtain/core.ts |
| `LightShafts` | `effects/light-shafts/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/light-shafts/core.ts |
| `DustMotes` | `effects/dust-motes/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/dust-motes/core.ts |
| `SpotlightCard` | `effects/spotlight-card/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/spotlight-card/core.ts |
| `DecodeText` | `effects/decode-text/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/decode-text/core.ts |
| `CountUpNumber` | `effects/count-up-number/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/count-up-number/core.ts |
| `OdometerNumber` | `effects/odometer-number/core.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/effects/odometer-number/core.ts |
| `Stage` | `shared/stage.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/stage.ts |
| shared | `shared/runtime.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/runtime.ts |
| shared | `shared/ground.ts` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/ground.ts |
| shared | `shared/tokens.css` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/tokens.css |
| shared | `shared/fonts.css` | https://raw.githubusercontent.com/OscarBeamish/beamish.ink/{{PIN}}/shared/fonts.css |

Keep the paths. `entry.ts` imports `../../effects/<name>/core` and the page
links `../../shared/tokens.css`, so the tree has to mirror the repo or every
import has to be rewritten.

## 3. The ground is declared, not assumed

The page sets `<html data-ground="dark">`
and `tokens.css` has no fallback palette. Drop that attribute and the page
loses every colour it has, which is deliberate: a ground is a decision, and a
value you have to fill in cannot quietly be wrong.

## 4. What is on the page

- [TwelveColumn](https://beamish.ink/grids/twelve-column)
- [GlassNav](https://beamish.ink/components/glass-nav)
- [AuroraCurtain](https://beamish.ink/effects/aurora-curtain)
- [LightShafts](https://beamish.ink/effects/light-shafts)
- [DustMotes](https://beamish.ink/effects/dust-motes)
- [SpotlightCard](https://beamish.ink/effects/spotlight-card)
- [DecodeText](https://beamish.ink/effects/decode-text)
- [CountUpNumber](https://beamish.ink/effects/count-up-number)
- [OdometerNumber](https://beamish.ink/effects/odometer-number)
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
