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
- Paper is the house style, not a rule about what may be built. The site is warm
  paper and most of the library is designed for it, and for a long time that was
  read as a prohibition: anything that only worked on a dark canvas was recast
  or skipped, and a shelf of the most striking backdrops in the field went
  unbuilt because of it. That reading is wrong and has been retired.

  What stands is the weaker version, which is the one that was ever worth
  having: an effect has to say what it is for. A palette that reads only on
  black is fine if the item is honest about it, says so in its description and
  its recipe, carries defaults that look right on its own ground, and ships a
  demo plate that is not the site's paper. A palette that was *meant* for paper
  and does not read on it is still a bug.

  Each item declares its ground in `meta.json` as `ground`: `paper`, `dark`, or
  `either`. The field does not exist yet: it goes in with the first dark item,
  along with the panel and card work to put something other than paper behind a
  demo, and that is the first task of that piece rather than a later tidy-up.
  Either way, say which ground you are building for before you tune anything,
  because it is the decision the defaults hang off.
- A backdrop has to survive being ignored. Movement at the edge of vision pulls a
  reader off a headline, which is the one thing a background must not do, so an
  ambient effect wants a long period and a short distance: tens of seconds rather
  than a handful, and as little change of position as the idea allows. Period and
  distance are two different questions. Give an effect a control for each.
- Measure that rather than judging it. Mean absolute change per frame at 60Hz
  across the whole canvas, 0 to 255: the quiet items here sit between 0.01 and
  0.2, and anything past about 1 reads as something happening. Do not let the
  recorder choose the default. Three of these shipped with a five second period
  because that made a short preview video, which is the recorder setting the
  design.
- Phase multipliers in a looping effect have to be whole turns. Two items shipped
  with fractional ones, so the loop never closed and the video jumped once a
  cycle. `tools/tests/loop-closes.test.ts` checks this now; the schema cannot,
  because it can only see `record.duration`.

## Measuring without taking the machine down

Most of the work in this repo is measurement: frame costs, contrast ratios,
loop seams, motion budgets. All of it runs through Playwright against a local
server, and done carelessly it will exhaust the memory on the machine you are
working on. This happened repeatedly before these rules existed.

**Reduce in the page. Never return a framebuffer.** A 960x540 canvas is 2.07
million bytes. `Array.from(buf)` boxes that into a two-million-element JS
array, the protocol serialises it to JSON, and node parses it back into another
one, twice per comparison. Measured, same work, same canvas:

| | node peak RSS |
| --- | --- |
| framebuffer shipped out as an array, 3 comparisons | 1098 MB |
| same comparison reduced in the page, one number back | 97 MB |

So `readPixels` into a `Uint8Array` inside `page.evaluate`, do the arithmetic
there, and return the scalar. The same goes for pixel scans, contrast tiles and
histograms: the boundary is for answers, not for data.

**One server, stopped when the check is done.** Never leave a dev server, a
preview server or a harness running across a turn, and never have two up at
once. Each is a few hundred megabytes, they are invisible once started, and
they outlive the session that spawned them.

**Stopping the task does not stop the server.** This is the part that actually
does the damage on Windows. `pnpm preview` is npx spawning pnpm spawning pnpm
spawning astro, and killing the shell that started it leaves every one of those
running: six orphaned node processes holding 861 MB were measured after a
single tidy-looking session, every one of them from a task that had been
stopped. Kill the processes, not the task, and then look:

```powershell
Get-Process node, python -ErrorAction SilentlyContinue |
  Select-Object ProcessName, Id, @{n='MB';e={[math]::Round($_.WorkingSet64/1MB,0)}}
```

Nothing should come back. If something does, `Stop-Process -Force` it.

**Close the browser in `finally`.** A script that throws between `launch()` and
`close()` can leave a headless chromium and its GPU process behind, and a
WebGL page holds hundreds of megabytes.

**One heavy thing at a time.** A build, the test suite and a recording each
want a gigabyte or more. Running a recording in the background while building
is how an afternoon of small overlaps becomes a crash.

**Sweep before you finish.** `Get-Process node, python` and a count of chromium
processes whose command line contains `headless`. Both should be empty, and
they will not be unless you killed the processes rather than the tasks.

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

Write every implementation from scratch. Concepts are fair game. Where an effect
is recognisably derived from a specific published demo, credit it in `meta.json`
with the author's name and a link.

React Bits is MIT plus Commons Clause, not MIT. Read their repo for structure and
ideas. Never copy a file, a function or a shader from it. The Commons Clause
would travel with anything taken and attach itself to this library.

Codrops demos are plain MIT, so adapting them with the notice retained would be
legal. Do not. A file carrying a third-party copyright notice breaks the promise
every prompt makes, which is that this is the reader's code with nothing to
track.

## Conventions

- Write prose in British English. Use platform convention in code: `color` in CSS
  and WebGL uniforms, not `colour`.
- Use mono as the default face. Reserve the display sans for headings and prose.
- Use the accent orange for actions only.
- Use `--ease-66` and `--ease-out-expo`. Do not add a third easing.
- Follow `STYLE.md` for anything with words in it.
