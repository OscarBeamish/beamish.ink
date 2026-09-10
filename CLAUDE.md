See [AGENTS.md](AGENTS.md) — it is the working contract for this repo and is kept
current. The points most often got wrong:

- **Two tiers, two contracts. Do not unify effects and components.**
- **No npm, no registry, no CLI. The prompt is the distribution.**
- **One live WebGL context at a time. The pixel budget is 16M, not 16 canvases.**
- **`renderAtTime(t)` must be pure in `t`.** The recorder depends on it.
- **Pause control on every ambient effect — WCAG 2.2.2 is Level A.**
- **Effects are designed for warm paper, not black.**
- **Commit at every green state. Branch per item. Never force-push.**
- **Tags are load-bearing — prompts pin to them. Never delete a published tag.**
- Raw URLs are pinned to a tag, never `main`.
- `meta.json` is the source of truth; run `pnpm generate` after touching it.
- New item: core → meta → recipe → demo → record → generate → paste-test.
- React and Vue only; Astro consumes those as islands.
- British English in prose, platform convention in code.
- No Claude Code attribution in commits.
