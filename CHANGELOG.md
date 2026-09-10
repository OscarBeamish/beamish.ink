# Changelog

Keyed to git tags. Every prompt on the live site pins to a tag, so this is the
record of what a given prompt was written about.

Published tags are never deleted or moved.

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
