# AGENTS.md

Working notes for anyone — human or agent — changing this repo.

## What this project is

An open-source collection of web effects and UI components whose **distribution
mechanism is a prompt**. The repo is the source of truth and the CDN, the site is
the catalogue, the prompt is the interface.

## What we are not building

No npm package. No shadcn registry, no `registry.json`, no CLI, no versioned
release pipeline. If you find yourself building distribution infrastructure,
stop and say so.

## Two tiers, two contracts

Do not unify them.

**Tier 1 — `effects/`.** Framework-free. Takes a DOM element, returns a handle:

```ts
export type EffectHandle = {
  start(): void
  stop(): void
  update(opts: Partial<Options>): void
  renderAtTime(t: number): void
  destroy(): void
}

export function createEffect(el: HTMLElement, opts?: Options): EffectHandle
```

`renderAtTime` is not optional. The recorder depends on it, and an effect that
cannot be driven by an external clock cannot be documented. It must be **pure in
`t`** — no integrating against the previous frame — or the loop will not be
seamless.

**Tier 2 — `components/`.** Ordinary React and Vue components. Semantics,
keyboard handling and focus management are the point here.

Components must feel like they came from the same studio as the effects: same
easing, same restraint, same type. A button that looks like it came from a
different library is a bug.

## The shared runtime

`shared/runtime.ts` owns everything identical across effects and easy to get
wrong: DPR capping at 2, `ResizeObserver`, `IntersectionObserver` pausing,
`visibilitychange`, the reduced-motion live listener, WebGL context loss and
restore, and teardown. An effect's `core.ts` contains drawing and nothing else.

Every prompt therefore fetches `shared/runtime.ts` alongside the core file. That
is deliberate: two small honest files beat one file with the same 200 lines
copy-pasted into it.

## Hard constraints

- **One live WebGL context at a time.** The browser budget is 16 contexts *or*
  16 × 1024 × 1024 pixels, whichever comes first, and the oldest context is
  forcibly lost past either. A 600×400 panel at 2× DPR is 960,000 pixels, so
  seventeen live demos exhaust it. The index page cannot host live demos.
- **Handle context loss.** `preventDefault()` on `webglcontextlost` or the
  context is unrecoverable; rebuild GPU resources on `webglcontextrestored`.
  Chromium restores a previously lost context when an active one is released, so
  this fires in ordinary use.
- **Pause control on every ambient effect.** WCAG 2.2.2 is Level A.
- **Nothing flashes more than three times per second.** WCAG 2.3.1, Level A.
  Check strobe-like shaders before shipping.
- **Effects are designed for warm paper, not black.** A default palette that only
  reads on a dark background is a bug, not a preference.

## meta.json is the source of truth

Prompts, docs pages, the site index and prop tables are all generated from
`meta.json` + `recipe.md`. Nothing is hand-maintained twice.

```
pnpm generate         # rebuild everything derived
pnpm generate:check   # fails if generated output is stale
```

The schema lives in `tools/schema/meta.ts` and is validated at build time.

## Tags are load-bearing

Every prompt on the live site pins its raw URLs to a git tag. Cutting a tag is
what makes new work reachable.

1. `pnpm generate` — writes prompts containing a `{{PIN}}` placeholder
2. Tag `v0.x.0`
3. The site build resolves `{{PIN}}` from `git describe --tags --abbrev=0`
4. Never point a prompt at `main`

**Never delete or move a published tag.** It breaks every prompt anyone has
already pasted. `CHANGELOG.md` is keyed to tags.

## Checklist for a new item

core → meta → recipe → demo → record → generate → **paste-test the prompt in a
scratch app**. The last step is not optional; the prompts are the product, and a
vague prompt is a bug of the same severity as a broken shader.

## Frameworks

Vanilla core. React and Vue wiring documented and included as thin reference
adapters. No Svelte. Astro needs nothing — it consumes the React or Vue files as
islands and the core works in a plain `<script>`; say so in the docs rather than
building for it.

Adapter files contain no effect logic. If one grows real logic, the abstraction
is wrong — stop and say so.

## Git

- Conventional commits, real messages. The history is part of the portfolio.
- Commit at every green state. Branch per item: `effect/foil`, `component/ember`.
- Merge by PR, squash on merge.
- Never force-push or rebase anything already pushed.
- No Claude Code attribution in commit messages or PR descriptions.

## Licence boundary

React Bits is **MIT + Commons Clause**, not MIT. Read their repo for structure and
ideas; never copy a file, a function or a shader out of it. Every implementation
here is written from scratch. Effect *concepts* are fair game — where one is
recognisably derived from a specific published demo, credit it in `meta.json`.

## Conventions

- Prose in British English. Code identifiers follow platform convention —
  `color` in CSS and WebGL uniforms, not `colour`. Do not mix the two.
- Mono is the default face. The display sans is for headings and real prose only.
- The accent orange is for actions only. Every other colour on a page comes from
  the effects themselves.
- Motion uses `--ease-66` and `--ease-out-expo`, and nothing else.
