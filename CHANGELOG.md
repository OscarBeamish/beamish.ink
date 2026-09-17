# Changelog

Keyed to git tags. Every prompt on the live site pins to a tag, so this is the
record of what a given prompt was written about.

Published tags are never deleted or moved.

## v0.5.0, 17 September 2026

Sixteen items, and the runtime learned to read the scroll.

### Added

- Spool (surfaces): a scroll-run slideshow on a paper web that bows as it
  accelerates. WebGL2, no dependency. At rest it draws an undistorted
  photograph; the whole effect is a function of scroll velocity, so a reader who
  has stopped scrolling is not looking at an effect at all.
- `Scroll` in the shared runtime, with `scrollPath` and `scrollPathDuration` to
  override it. Velocity comes from the path's own slope rather than a difference
  against the last frame, so a scroll-driven effect stays a function of `t` and
  can still be recorded. Same contract as `pointerPath`.
- `tools/serve.ts`: a static server over the repo root, used by the recorder and
  the leak test.

### Changed

- `Surface.render` takes a fourth argument. Existing effects are untouched: a
  three-parameter implementation still satisfies the interface.

### Fixed

- The recorder and the leak test opened demo pages as `file://` URLs. Every file
  is its own opaque origin there, so `texImage2D` throws on the first image an
  effect tries to sample and no textured effect could be recorded at all. Both
  now serve over HTTP on an OS-assigned port.

## v0.4.0, 17 September 2026

Fifteen items.

### Added

- Vellum (backdrops): a drifting stack of translucent paper, three.js. The
  sheets multiply rather than composite, which is order-independent, so the
  whole pile is one InstancedMesh with no transparency sorting to get wrong.
  Nothing in it can be brighter than the paper, which is a real constraint of
  the blend and not a limitation worth hiding.

## v0.3.1, 17 September 2026

### Fixed

- Overprint, Foil and Sundial ship React and Vue adapters, and their prompts
  never mentioned them. The three oldest items predate the adapter convention
  and were never backfilled, so pasting one into a React project got you the
  core and a recipe telling you to import an adapter that was never fetched.
  Found by walking every raw URL on the live site and noticing those three
  listed two files where every other item listed four.

## v0.3.0, 17 September 2026

Two items, and the pin stops being something a human has to remember.

### Added

- Guilloche (backdrops): engine-turned line work. Three rosettes with coprime
  whole-number lobe counts, drawn as line fields and multiplied over paper.
- Plate (surfaces): a contact sheet that opens into a lightbox. Tier 2, React
  and Vue. Arrow keys, swipe, neighbour preload, and autoplay that is off by
  default and carries a pause control whenever it is not.
- `pnpm verify:pin`: fetches every file every prompt asks for, at the pin, and
  fails on anything that is not a 200. This is the check that was missing.

### Changed

- The pin now comes from the `version` field in `package.json` rather than from
  `git describe` plus a hand-set `BEAMISH_PIN` in the Cloudflare dashboard.
  Delete that variable if it is still set. Releasing is bump, commit, tag, push,
  with no step in another system.

### Fixed

- The generator matched shader blocks on a bare `
`, so on any shader saved
  with Windows line endings the replacement silently did nothing and the core
  kept whatever shader was inlined before it. Guilloche shipped Overprint's
  shader and the generator reported success. It now tolerates `
` and throws
  when a file has shader markers that none of them matched.
- `pnpm review` reported below-the-fold lazy images as broken.

### Known

- `v0.1.0` and `v0.2.0` are both missing items that their prompts reference, so
  the live site served 404ing prompts for anything added after the tag it was
  pinned to. Neither tag is moved or deleted; `v0.3.0` contains everything.

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
