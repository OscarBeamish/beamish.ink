# Changelog

Keyed to git tags. Every prompt on the live site pins to a tag, so this is the
record of what a given prompt was written about.

Published tags are never deleted or moved.

## v0.2.0, 17 September 2026

Seven more items, a review step, and a defect in a shipped prompt.

### Added

- Effects: Sort and Tally (type), Riser (reveals), Tilt (surfaces), Swell and
  Magnet (pointer), Contour (backdrops). Twelve items across six categories.
- `pnpm review`: loads every page at 390, 768 and 1440, screenshots each, and
  checks console errors, dead requests, sideways scroll, unloaded images,
  metadata, em dashes in visible text, and headings that wrap badly. It has
  found eight real problems since it existed.
- `pnpm check`: typecheck, generate:check, test, build, review, in that order.
- The runtime takes `kind: 'dom'` for effects with nothing to draw into, and
  `pointerScope: 'window'` for effects that react to a cursor before it arrives.
- `STYLE.md`, `BACKLOG.md` (all 171 React Bits items plus eight from Codrops,
  mapped and credited), `AUDIT.md` and `DEPLOY.md`.

### Fixed

- **Shadow softness did nothing.** Sundial shipped a documented `softness`
  option that three ignored: `shadow.radius` is only read by the `PCF` branch,
  and the renderer was set to `PCFSoft`. Both three.js items now use
  `PCFShadowMap` and Swell gained the same control.
- **Every prompt URL pointed at a repo that does not exist.** They fetched from
  `oscarbeamish/beamish`; the repo is `OscarBeamish/beamish.ink`. All twelve
  would have 404'd on the day it went public.
- Replay did nothing on a finished one-shot, because `start()` never rewound.
- Item pages are a 70ch reading column with the demo breaking out, rather than
  full-bleed prose at 1400px.

### Changed

- The site says what it is on the first line instead of opening with a 1530
  etymology. `/about` became `/how-it-works`.
- Prose across the repo follows `STYLE.md`. 251 em dashes removed.
- Dev runs on port 4488, review on 4489, because Astro's 4321 collides with
  every other Astro project and its auto-increment hides which is which.

## v0.1.0, 10 September 2026

The first tag, and the first pin a prompt can point at. The repo is still
private. Nothing here has been published.

### Added

- Shared runtime (`shared/runtime.ts`): DPR capped at 2, pausing when offscreen
  or when the tab is hidden, a live reduced-motion listener, WebGL context loss
  and restore, and teardown that hands the context back rather than waiting for
  garbage collection.
- Design tokens (`shared/tokens.css`), lifted from oscarbeamish.dev.
- `meta.json` schema with build-time validation (`tools/schema/meta.ts`). It
  rejects a record duration that is not a whole number of loops, which is the
  kind of thing nobody notices until it is on the homepage.
- Prompt generator (`tools/generate/`). Shader sources are synced into the
  published `core.ts` from `shaders/`, and option defaults are checked for drift
  between `meta.json` and the code.
- Deterministic recorder (`tools/recorder/`). Effects are driven through
  `renderAtTime`. Components have their CSS transitions paused and scrubbed
  through the Web Animations API.
- Effects: Overprint, Sundial, Foil.
- Components: Contents, Ember.
- The site.
- One test: mount and destroy each effect 50 times, then prove the browser still
  hands out a WebGL context.
