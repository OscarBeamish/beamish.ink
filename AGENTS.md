# AGENTS.md

Rules for changing this repo. Written for agents. Follow them literally.

## What this project is

A collection of web effects and interface components whose distribution mechanism
is a prompt. The repo is the source of truth and the CDN. The site is the
catalogue. The prompt is the interface.

## What not to build

Do not add an npm package, a shadcn registry, a `registry.json`, a CLI, or a
release pipeline. If a task starts to require distribution infrastructure, stop
and say so.

## Two tiers, two contracts

Do not unify them.

Tier 1 lives in `effects/`. It is framework-free. It takes a DOM element and
returns a handle:

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

`renderAtTime` is required. The recorder depends on it. It must be pure in `t`.
Do not integrate against the previous frame. An effect that integrates cannot
produce a loop without a visible join.

Tier 2 lives in `components/`. These are ordinary React and Vue components.
Semantics, keyboard handling and focus management are the requirement here.

Match the effects visually. Use the same easings, the same type, the same
restraint. A component that looks like it came from another library is a bug.

## The shared runtime

`shared/runtime.ts` owns the behaviour that is identical across effects: DPR
capped at 2, `ResizeObserver`, `IntersectionObserver` pausing, `visibilitychange`,
the reduced-motion live listener, WebGL context loss and restore, and teardown.

Put drawing in `core.ts`. Put nothing else there.

Every prompt fetches `shared/runtime.ts` alongside the core file. Two files is
the intended cost. Do not inline the runtime into each effect.

## Hard constraints

- One live WebGL context at a time. Browsers allow 16 contexts or 16,777,216
  pixels, whichever runs out first, and force-lose the oldest past either. A
  600×400 panel at 2× DPR is 960,000 pixels. The index page must not host live
  demos.
- Call `preventDefault()` on `webglcontextlost` or the context cannot be
  recovered. Rebuild GPU resources on `webglcontextrestored`. Chromium restores a
  lost context when an active one is released, so this path runs in normal use.
- Give every ambient effect a pause control. WCAG 2.2.2 is Level A.
- Keep flashing below three times per second. WCAG 2.3.1 is Level A. Check any
  strobe-like shader before shipping it.
- Design every effect for warm paper. A default palette that only reads on a dark
  background is a bug.

## meta.json is the source of truth

Prompts, docs pages, the site index and prop tables are generated from
`meta.json` and `recipe.md`. Do not maintain anything twice.

```
pnpm generate         # rebuild everything derived
pnpm generate:check   # fail if generated output is stale
```

The schema is `tools/schema/meta.ts`. It runs at build time.

Option defaults appear in both `meta.json` and the item's `core.ts`. `pnpm
generate` fails if the two disagree. Change `meta.json` first.

## Tags

Every prompt pins its raw URLs to a git tag. Cutting a tag is what makes new work
reachable.

1. Run `pnpm generate`. It writes `{{PIN}}` into the prompts.
2. Tag `v0.x.0`.
3. Build the site. It resolves `{{PIN}}` from `git describe --tags --abbrev=0`.
4. Never point a prompt at `main`.

Never delete or move a published tag. It breaks every prompt already pasted. Keep
`CHANGELOG.md` keyed to tags.

## Adding an item

Work in this order: `core.ts`, `meta.json`, `recipe.md`, `demo.html`, record,
generate, then paste-test the prompt in a scratch app.

Do not skip the paste-test. A vague prompt is as serious a defect as a broken
shader.

## Frameworks

Write the core as vanilla TypeScript. Include thin React and Vue adapters.
Do not add Svelte. Do not build anything for Astro. Astro consumes the React or
Vue files as islands and the core works in a plain `<script>`. Document that
instead.

Adapters must contain no effect logic. If an adapter needs real logic, the
abstraction is wrong. Stop and say so.

## Git

- Use conventional commits. Write real messages.
- Commit at every green state.
- Branch per item: `effect/foil`, `component/ember`.
- Merge by PR. Squash on merge.
- Never force-push. Never rebase anything already pushed.
- Never add Claude Code attribution to a commit message or PR description.

## Licence boundary

React Bits is MIT plus Commons Clause, not MIT. Read their repo for structure and
ideas. Never copy a file, a function or a shader from it. Write every
implementation here from scratch.

Effect concepts are fair game. Where an effect is recognisably derived from a
specific published demo, credit it in `meta.json`.

## Conventions

- Write prose in British English. Use platform convention in code: `color` in CSS
  and WebGL uniforms, not `colour`.
- Use mono as the default face. Reserve the display sans for headings and prose.
- Use the accent orange for actions only.
- Use `--ease-66` and `--ease-out-expo`. Do not add a third easing.
- Follow `STYLE.md` for anything with words in it.
