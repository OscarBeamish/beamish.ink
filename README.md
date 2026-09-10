# Beamish

**beamish**, *adj.* — shining brightly; radiant.

First recorded in 1530, in John Palsgrave's *Lesclarcissement de la langue
francoyse*, the earliest French–English dictionary, glossing the French *radieux*
as "Beamysshe as the sonne is". Three centuries later Lewis Carroll used it in
*Jabberwocky* — "Come to my arms, my beamish boy!" — and may well have thought he
had coined it. He had not; he had found it.

It is also my surname. A library of light and glow effects named after a
five-hundred-year-old word for radiance seemed too good to leave alone.

---

Beamish is an open-source collection of creative web effects — Three.js scenes,
WebGL shaders, canvas and CSS motion — plus a small set of UI components in the
same visual family.

**There is nothing to install.** Browse [beamish.ink](https://beamish.ink), watch
a video of an effect, press **Get prompt**, and paste the result into Claude Code,
Cursor or whatever agent you use. It fetches the source from this repo and wires
it into your stack. No package, no CLI, no framework lock-in.

## Why a prompt and not a package

A component library has to guess your build, your framework, your styling system
and your bundler, and it is wrong about at least one of them. A prompt does not
guess: it hands your agent the real source file, the full option surface with
sensible ranges, wiring for React, Vue and plain HTML, and the three mistakes
most likely to be made — then gets out of the way while the agent adapts it to
the project actually in front of it.

Every prompt is pinned to a git tag, never to `main`, so a prompt you pasted six
months ago still fetches the file it was written about.

## What's here

Two tiers, two contracts, deliberately not unified.

**`effects/`** — canvas and WebGL. Framework-free modules that take a DOM element
and return an imperative handle:

```ts
export type EffectHandle = {
  start(): void
  stop(): void
  update(opts: Partial<Options>): void
  renderAtTime(t: number): void  // deterministic — same t, same frame
  destroy(): void                // releases the WebGL context, RAF and listeners
}
```

**`components/`** — navs, buttons, menus, cursors. Ordinary React and Vue
components, because semantics, keyboard handling and focus management matter here
and an imperative handle is the wrong shape for them.

They share tokens, motion, `meta.json`, the prompt system and the recorder. They
do not share a runtime contract.

## Designed for paper

Nearly every library in this space assumes a near-black canvas, and their effects
fall apart the moment you put them on anything else. Beamish is built the other
way round: the default palette is warm paper — `rgb(251, 250, 244)` — and every
effect is designed to look right on it. Light on light is the harder problem and
the more useful one, because most of the web is not black.

## Accessibility

Not a chore, and not an afterthought.

- Every ambient effect can be paused. WCAG 2.2.2 *Pause, Stop, Hide* is Level A,
  and it describes every background effect in this repo — `stop()` exists on the
  handle for exactly this reason, and every demo panel surfaces it as a control.
- Nothing flashes more than three times a second. WCAG 2.3.1, also Level A.
- `prefers-reduced-motion` is handled in the runtime, with a **live listener** so
  toggling the OS setting mid-session takes effect. Under reduced motion an
  effect degrades to a still frame that still looks composed, not to nothing.
- One live WebGL context at a time. The browser budget is sixteen contexts *or*
  sixteen million pixels, whichever comes first, so the index page uses video
  posters — that is a correctness constraint, not an optimisation.

## Licence

MIT. Use it in anything, including commercial work, with no strings.

Where an effect is recognisably derived from a specific published demo, the
credit is in that effect's `meta.json` and on its page. Concepts are not ownable;
attribution is still good manners.
