# Beamish

Web effects and interface components for AI coding agents.

Three.js scenes, WebGL shaders, text animations and interface components. There
is nothing to install. Browse [beamish.ink](https://beamish.ink), pick one, press
**Copy prompt**, and paste the result into Claude Code or Cursor. Your agent
fetches the source from this repo and writes it into your project.

## Why a prompt and not a package

A component library has to guess your build, your framework and your styling
system. It will be wrong about at least one of them.

A prompt does not guess. It hands your agent the real source file, every option
with the range that actually looks good, wiring for React, Vue and plain HTML,
and the three mistakes most likely to be made with that particular effect. Then
it stays out of the way while the agent adapts all of it to the project in front
of it.

Every prompt pins its URLs to a git tag, never to `main`. A prompt you pasted six
months ago still fetches the file it was written about.

## What's here

Two tiers with two contracts. They are not unified and will not be.

**`effects/`** is canvas and WebGL. A framework-free module that takes a DOM
element and returns a handle:

```ts
export type EffectHandle = {
  start(): void
  stop(): void
  update(opts: Partial<Options>): void
  renderAtTime(t: number): void  // deterministic: same t, same frame
  destroy(): void                // releases the WebGL context, RAF and listeners
}
```

**`components/`** is navs, buttons, menus and cursors. Ordinary React and Vue
components. Semantics, keyboard handling and focus management are the whole job
here, and an imperative handle is the wrong shape for any of them.

The two tiers share tokens, motion, `meta.json`, the prompt system and the
recorder. The runtime contract is the one thing they do not share.

## Built for paper

Every library in this space assumes a near-black canvas, and their effects come
apart the moment you put them on anything else. The background here is
`rgb(251, 250, 244)`, a warm off-white, and each effect is built to look right on
it.

Light on light is the harder problem. It is also the more useful one, because
most of the web is not black.

## Accessibility

Every ambient effect can be paused. WCAG 2.2.2 is Level A and covers anything
that moves on its own for more than five seconds, which describes every
background in this repo. `stop()` is on the handle for that reason, and every
demo panel surfaces it as a real button.

Nothing flashes more than three times a second, which is 2.3.1, also Level A.

`prefers-reduced-motion` is handled in the runtime with a live listener, so
changing the OS setting mid-session takes effect without a reload. Under reduced
motion an effect draws one composed frame instead of nothing at all.

One live WebGL context at a time. Browsers allow sixteen of them, or sixteen
million pixels, whichever runs out first. A 600×400 panel at 2× DPR is 960,000
pixels, so seventeen live demos on one page is enough to start losing them. That
is why the index page is video posters rather than the wall of running demos it
looks like.

## The name

*Beamish* is a real English adjective meaning shining brightly, first recorded in
1530 in John Palsgrave's French-English dictionary. It is also my surname.

## Licence

MIT. Use it in anything, commercial work included, with no strings.

Where an effect is recognisably derived from a specific published demo, the
credit sits in that effect's `meta.json` and on its page. Concepts are not
ownable. Attribution is still good manners.
