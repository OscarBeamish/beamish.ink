# Changelog

Keyed to git tags. Every prompt on the live site pins to a tag, so this is the
record of what a given prompt was written about.

Published tags are never deleted or moved.

## Unreleased

### Added

- Shared runtime (`shared/runtime.ts`): DPR capping, offscreen and tab-hide
  pausing, reduced-motion live listener, WebGL context loss and restore, teardown.
- Design tokens (`shared/tokens.css`), lifted from oscarbeamish.dev.
- `meta.json` schema and build-time validation (`tools/schema/meta.ts`).
- Prompt generator (`tools/generate/`).
- Deterministic recorder (`tools/recorder/`).
- Effects: Overprint, Sundial, Foil.
- Components: Contents, Ember.
- The site.
