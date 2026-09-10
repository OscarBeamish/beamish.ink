Read [AGENTS.md](AGENTS.md). It is the working contract for this repo and it is
kept current. Read [STYLE.md](STYLE.md) before writing any prose.

The rules most often broken:

- Two tiers, two contracts. Do not unify effects and components.
- No npm, no registry, no CLI. The prompt is the distribution.
- One live WebGL context at a time. The budget is 16 million pixels, not 16
  canvases.
- `renderAtTime(t)` must be pure in `t`. The recorder depends on it.
- Every ambient effect needs a pause control. WCAG 2.2.2 is Level A.
- Design effects for warm paper, not black.
- Commit at every green state. Branch per item. Never force-push.
- Prompts pin to tags. Never delete a published tag. Never point a prompt at
  `main`.
- `meta.json` is the source of truth. Run `pnpm generate` after touching it.
- New item: core, meta, recipe, demo, record, generate, paste-test.
- React and Vue only. Astro consumes those as islands.
- British English in prose. Platform convention in code.
- No em dashes anywhere. No Claude Code attribution in commits.
