You are adding **GlassModal** from Beamish to this project.

> A sheet of glass over the page, on a native dialog so the browser handles the hard part. Navigation · component · MIT.
> https://beamish.ink/components/glass-modal

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `react@>=18`
- A native dialog opened with showModal(), so the top layer, the backdrop, the focus trap, the inert background, Escape and returning focus to the opener are all the browser's. There is no focus-trap library here and there should not be one
- showModal() does not stop the page behind from scrolling, which is the one thing it leaves you, so the component locks the body and puts it back on close
- The blur is backdrop-filter, which every current browser supports. The refraction is an SVG filter inside backdrop-filter, which only Chromium applies: Safari ignores it and Firefox parses the value, passes an @supports test and renders nothing
- A dialog is display:none when shut, so an opening transition has nothing to run between. It animates on a class either side of the frame and waits for animationend before calling close(), with a timer behind it because an interrupted animation never fires one
- Escape fires cancel rather than close, so that is what is intercepted. The default would skip the leaving animation and never tell the parent the dialog had gone
- prefers-reduced-transparency turns the sheet opaque and takes the specular with it. forced-colors falls back to a border, which is the one thing that mode keeps
- React 18+ or Vue 3. This one is a component, not an imperative effect.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/components/glass-modal/react.tsx`**

```tsx
/*
 * Pane: Beamish
 * https://beamish.ink/components/glass-modal
 *
 * A sheet of glass over the page, on a native <dialog>.
 *
 * showModal() is doing the hard part. The browser promotes the dialog into the
 * top layer, makes the rest of the document inert, traps focus, closes on
 * Escape and hands focus back to whatever opened it. There is no focus-trap
 * library here and there should not be one: every line of that is behaviour the
 * platform now gets right, including for the screen readers a hand-rolled trap
 * tends to miss.
 *
 * What is left is the glass, the light dismiss, and keeping the page behind it
 * from scrolling, which showModal() does not do.
 */

'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { attachRefraction } from './glass'
import './styles.css'

export type GlassModalProps = {
  open: boolean
  /** Called when the dialog asks to close: Escape, the button, or the backdrop. */
  onClose: () => void
  /** Names the dialog. Rendered as the heading and used as its accessible name. */
  title: string
  children?: ReactNode
  /** Blur of the page showing through, in pixels. */
  blur?: number
  /** How milky the sheet is, 0 to 1. This is the contrast control. */
  tint?: number
  /** Bend the backdrop as well as blurring it. Chromium only: see the recipe. */
  refract?: boolean
  /** How far the rim bends what is behind it, in pixels. */
  refraction?: number
  /** Close when the page behind is clicked. */
  lightDismiss?: boolean
  closeLabel?: string
  className?: string
}

export function Pane({
  open,
  onClose,
  title,
  children,
  blur = 18,
  tint = 0.72,
  refract = true,
  refraction = 22,
  lightDismiss = true,
  closeLabel = 'Close',
  className
}: GlassModalProps) {
  const dialog = useRef<HTMLDialogElement>(null)

  /*
   * Let the leaving animation run before the element goes display:none, which
   * is what close() does immediately. Nothing waits on this if the user has
   * asked for reduced motion, because the animation is then a hundredth of a
   * millisecond.
   */
  const dismiss = useCallback(() => {
    const el = dialog.current
    if (!el || !el.open) return
    el.classList.add('beamish-glass-modal--leaving')
    const done = () => {
      el.classList.remove('beamish-glass-modal--leaving')
      el.close()
    }
    el.addEventListener('animationend', done, { once: true })
    // A belt and braces timer: an interrupted animation never fires its end
    // event, and a dialog that will not shut is worse than one that shuts
    // abruptly.
    setTimeout(() => {
      if (el.classList.contains('beamish-glass-modal--leaving')) done()
    }, 400)
  }, [])

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) dismiss()
  }, [open, dismiss])

  /*
   * The page behind. showModal() makes the document inert but does not stop it
   * scrolling, so a wheel over the backdrop still moves whatever the dialog is
   * sitting on top of.
   */
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  useEffect(() => {
    const el = dialog.current
    if (!el || !open || !refract) return
    if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return
    return attachRefraction(el, refraction, 20)
  }, [open, refract, refraction])

  return (
    <dialog
      ref={dialog}
      className={['beamish-glass-modal', className].filter(Boolean).join(' ')}
      aria-labelledby="beamish-glass-modal-title"
      style={{ '--pane-blur': `${blur}px`, '--pane-tint': String(tint) } as React.CSSProperties}
      /* Escape fires cancel rather than close, and the default would skip the
         leaving animation and never tell the parent. */
      onCancel={event => {
        event.preventDefault()
        onClose()
      }}
      onClick={event => {
        if (!lightDismiss) return
        // The dialog's own box is the sheet; anything outside it inside the
        // element is the backdrop, which is where the click lands.
        const box = event.currentTarget.getBoundingClientRect()
        const outside =
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom
        if (outside) onClose()
      }}
    >
      <div className="beamish-glass-modal__head">
        <h2 className="beamish-glass-modal__title" id="beamish-glass-modal-title">
          {title}
        </h2>
        <button
          type="button"
          className="beamish-glass-modal__close"
          onClick={onClose}
          aria-label={closeLabel}
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div className="beamish-glass-modal__body">{children}</div>
    </dialog>
  )
}

export default Pane
```

**`src/beamish/components/glass-modal/glass.ts`**

```ts
/*
 * The glass itself, shared by the React and the Vue component so the two cannot
 * drift. Nothing here knows about either framework.
 *
 * One job: build the displacement map that bends what is behind the panel.
 */

/*
 * A normal map for a rounded rectangle, as a data URI.
 *
 * feDisplacementMap moves each pixel of the backdrop by
 * scale * (channel / 255 - 0.5), so a map that is flat grey displaces nothing
 * and the interesting part is entirely in how it departs from grey. What we
 * want is a lens: no displacement through the middle, and an outward push that
 * grows towards the edge, in the direction the edge faces.
 *
 * That direction is the gradient of the signed distance field, which for a
 * rounded rectangle has a closed form, so it is computed rather than painted
 * with gradients and guessed at. The push is weighted by how close the point is
 * to the edge, which is what makes it a bevel rather than a uniform stretch.
 */
export function makeLensMap(width: number, height: number, radius: number, thickness: number): string {
  const canvas = document.createElement('canvas')
  // A quarter scale is plenty. The map is a smooth field and feImage will
  // resample it; a full-size one costs four times the pixels for no difference.
  const w = Math.max(Math.round(width / 4), 1)
  const h = Math.max(Math.round(height / 4), 1)
  canvas.width = w
  canvas.height = h

  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const image = ctx.createImageData(w, h)
  const halfW = w / 2
  const halfH = h / 2
  const r = Math.min(radius / 4, Math.min(halfW, halfH))
  const edge = Math.max(thickness / 4, 1)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Signed distance to a rounded rectangle, negative inside.
      const qx = Math.abs(x + 0.5 - halfW) - (halfW - r)
      const qy = Math.abs(y + 0.5 - halfH) - (halfH - r)
      const ox = Math.max(qx, 0)
      const oy = Math.max(qy, 0)
      const dist = Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r

      // The outward direction. Inside the straight runs one of these is zero,
      // which is correct: a flat edge bends light one way only.
      const nx = qx > qy ? Math.sign(x + 0.5 - halfW) : 0
      const ny = qy >= qx ? Math.sign(y + 0.5 - halfH) : 0
      let dirX = ox !== 0 || oy !== 0 ? ox * Math.sign(x + 0.5 - halfW) : nx
      let dirY = ox !== 0 || oy !== 0 ? oy * Math.sign(y + 0.5 - halfH) : ny
      const len = Math.hypot(dirX, dirY) || 1
      dirX /= len
      dirY /= len

      // Nothing through the middle, everything at the rim.
      const bevel = Math.min(Math.max(1 + dist / edge, 0), 1)

      const i = (y * w + x) * 4
      image.data[i] = Math.round((dirX * bevel * 0.5 + 0.5) * 255)
      image.data[i + 1] = Math.round((dirY * bevel * 0.5 + 0.5) * 255)
      image.data[i + 2] = 0
      image.data[i + 3] = 255
    }
  }

  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL()
}

let filterSeq = 0

/**
 * Attach a backdrop refraction to an element, and return the teardown.
 *
 * Chromium only. Safari does not apply SVG filters in `backdrop-filter` at all,
 * and Firefox parses the value, passes an `@supports` test and then renders
 * nothing, so there is no feature query that tells the truth here. What every
 * browser does get is the blur and the edge, which is most of the effect.
 */
export function attachRefraction(el: HTMLElement, strength: number, radius: number): () => void {
  const id = `beamish-lens-${(filterSeq += 1)}`

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('aria-hidden', 'true')
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'
  svg.innerHTML =
    `<filter id="${id}" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feImage result="lens" preserveAspectRatio="none" />` +
    `<feDisplacementMap in="SourceGraphic" in2="lens" xChannelSelector="R" yChannelSelector="G" />` +
    `</filter>`
  document.body.append(svg)

  const feImage = svg.querySelector('feImage')!
  const feDisplacement = svg.querySelector('feDisplacementMap')!

  const draw = () => {
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return
    const map = makeLensMap(rect.width, rect.height, radius, Math.min(rect.height, 48))
    if (!map) return
    feImage.setAttribute('href', map)
    feImage.setAttribute('width', String(rect.width))
    feImage.setAttribute('height', String(rect.height))
    feDisplacement.setAttribute('scale', String(strength))
  }

  draw()
  const previous = el.style.filter
  el.style.setProperty('--pane-lens', `url(#${id})`)

  const observer = new ResizeObserver(draw)
  observer.observe(el)

  return () => {
    observer.disconnect()
    svg.remove()
    el.style.removeProperty('--pane-lens')
    el.style.filter = previous
  }
}
```

**`src/beamish/components/glass-modal/styles.css`**

```text
/*
 * Pane: Beamish
 *
 * Every custom property has a fallback, so the component looks right dropped
 * into a project that has never heard of Beamish tokens.
 *
 * A native <dialog> opened with showModal(), so the browser supplies the top
 * layer, the backdrop, the focus trap, the inert background, Escape, and
 * returning focus to whatever opened it. None of that is worth hand-rolling and
 * all of it is worth having.
 *
 * What is left to do is the glass: a blur of the page showing through, and the
 * edge that makes it read as a sheet rather than as a translucent div.
 */

.beamish-glass-modal {
  --pane-ink: var(--label-1, #26241f);
  --pane-quiet: var(--label-2, rgba(38, 36, 31, 0.68));
  --pane-accent: var(--accent, #c44400);
  --pane-ease: var(--ease-66, cubic-bezier(0.66, 0, 0.01, 1));

  --pane-blur: 18px;
  --pane-tint: 0.72;

  width: min(34rem, calc(100vw - 2.5rem));
  max-height: min(80vh, 44rem);
  margin: auto;
  padding: 0;
  border: 0;
  border-radius: 20px;
  overflow: hidden;
  color: var(--pane-ink);
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);

  background: rgba(255, 253, 247, var(--pane-tint));

  -webkit-backdrop-filter: var(--pane-lens, ) blur(var(--pane-blur)) saturate(170%);
  backdrop-filter: var(--pane-lens, ) blur(var(--pane-blur)) saturate(170%);

  /*
   * The specular first. A sheet of glass catches a hairline of light along its
   * top edge, and that one line is the difference between this and a panel with
   * some opacity on it. Then the rim, then the shadow that lifts it off.
   */
  box-shadow:
    inset 0 1.5px 0 rgba(255, 255, 255, 0.9),
    inset 0 0 0 1px rgba(255, 255, 255, 0.35),
    0 40px 80px -30px rgba(38, 36, 31, 0.5);
}

/*
 * The page behind, dimmed and pushed back. Keeping a little of it visible is
 * the point: a modal over a solid scrim is a card on a grey screen, and the
 * glass has nothing to be glass about.
 */
.beamish-glass-modal::backdrop {
  background: rgba(38, 36, 31, 0.32);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
}

.beamish-glass-modal__head {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.6rem 1.6rem 0.9rem;
}

.beamish-glass-modal__title {
  margin: 0;
  font-family: var(--font-display, ui-sans-serif, system-ui, sans-serif);
  font-size: 1.35rem;
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.beamish-glass-modal__close {
  margin-inline-start: auto;
  flex: none;
  width: 2rem;
  height: 2rem;
  display: grid;
  place-items: center;
  border: 1px solid rgba(38, 36, 31, 0.2);
  border-radius: 100px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.9rem;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.3s var(--pane-ease),
    border-color 0.3s var(--pane-ease);
}

.beamish-glass-modal__close:hover {
  background: rgba(38, 36, 31, 0.08);
  border-color: rgba(38, 36, 31, 0.4);
}

.beamish-glass-modal__body {
  padding: 0 1.6rem 1.6rem;
  overflow-y: auto;
  font-size: 0.9rem;
  line-height: 1.65;
  color: var(--pane-quiet);
}

.beamish-glass-modal__close:focus-visible {
  outline: 2px solid var(--pane-accent);
  outline-offset: 3px;
}

/*
 * Opening and closing. A dialog is display:none when shut, so a plain
 * transition has nothing to run between; the component adds and removes a
 * class either side of the frame and waits for the transition before calling
 * close(), which keeps it to properties every browser animates.
 */
.beamish-glass-modal[open] {
  animation: beamish-glass-modal-in 0.4s var(--pane-ease);
}

.beamish-glass-modal[open]::backdrop {
  animation: beamish-glass-modal-backdrop-in 0.4s var(--pane-ease);
}

.beamish-glass-modal--leaving {
  animation: beamish-glass-modal-out 0.25s var(--pane-ease) forwards;
}

.beamish-glass-modal--leaving::backdrop {
  animation: beamish-glass-modal-backdrop-in 0.25s var(--pane-ease) reverse forwards;
}

@keyframes beamish-glass-modal-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }
}

@keyframes beamish-glass-modal-out {
  to {
    opacity: 0;
    transform: translateY(8px) scale(0.99);
  }
}

@keyframes beamish-glass-modal-backdrop-in {
  from {
    opacity: 0;
  }
}

/*
 * Reduced transparency is a real system setting and a modal is exactly what it
 * exists for: this one sits over whatever somebody was reading. Opaque, and the
 * specular goes with it, because a highlight on something that is not
 * transparent is a lie about the material.
 */
@media (prefers-reduced-transparency: reduce) {
  .beamish-glass-modal {
    background: rgb(255, 253, 247);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    --pane-lens: ;
    box-shadow: 0 40px 80px -30px rgba(38, 36, 31, 0.5);
  }

  .beamish-glass-modal::backdrop {
    background: rgba(38, 36, 31, 0.6);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}

@media (forced-colors: active) {
  .beamish-glass-modal {
    border: 1px solid CanvasText;
    background: Canvas;
  }
}

@media (prefers-reduced-motion: reduce) {
  .beamish-glass-modal[open],
  .beamish-glass-modal[open]::backdrop,
  .beamish-glass-modal--leaving,
  .beamish-glass-modal--leaving::backdrop {
    animation-duration: 0.01ms;
  }
}
```

## 2. What it is

A sheet of glass over the page, on a native `<dialog>`.

`showModal()` is doing the hard part and it is worth saying what that covers,
because it is most of what a modal is: the browser promotes the dialog into the
top layer, makes the rest of the document inert so nothing behind it is
focusable or reachable by a screen reader, traps focus inside, closes on Escape,
and hands focus back to whatever opened it.

There is no focus-trap library here and there should not be one. Every line of
that behaviour is something the platform now gets right, including for the
screen readers a hand-rolled trap tends to miss.

What is left is the glass, the light dismiss, and stopping the page behind from
scrolling, which `showModal()` does not do.

## 3. Wire it in

The component is controlled. It does not own whether it is open, because the
thing that opened it usually needs to know.

```tsx
import { useState } from 'react'
import { Pane } from '@/beamish/components/glass-modal/react'

export function Example() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>

      <Pane open={open} onClose={() => setOpen(false)} title="A dialog title">
        <p>Whatever the dialog is for.</p>
      </Pane>
    </>
  )
}
```

**Vue.** Same shape, with an event instead of a callback.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Pane } from '@/beamish/components/glass-modal/vue'

const open = ref(false)
</script>

<template>
  <button type="button" @click="open = true">Open</button>

  <Pane :open="open" title="A dialog title" @close="open = false">
    <p>Whatever the dialog is for.</p>
  </Pane>
</template>
```

**Astro.** `client:load`, or `client:visible` if the trigger is below the fold.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `blur` | number | `18` | 0 to 40 | Blur of the page showing through. Past about 24 the page behind stops being recognisable, and a modal whose backdrop is unrecognisable may as well be opaque. |
| `tint` | number | `0.72` | 0 to 1 | How milky the sheet is. This is the contrast control and a modal needs more of it than a nav does, because a modal carries body copy rather than three words of navigation. |
| `refract` | boolean | `true` | `true` · `false` | Bend the backdrop as well as blurring it. Chromium only. Everywhere else you get the blur and the edge, which is most of the effect, and nothing looks broken. |
| `refraction` | number | `22` | 0 to 60 | How far the rim bends what is behind it, in pixels. A modal can take more of this than a nav because its edge is further from the text. |
| `lightDismiss` | boolean | `true` | `true` · `false` | Close when the page behind is clicked. Leave it on unless the dialog is asking something that should not be dismissed by accident, in which case the question is whether it should be a dialog at all. |

## 5. Cleanup and SSR

Both components restore `body` overflow and remove the filter when the dialog
closes or they unmount. `window` is only touched inside effects, so they render
on a server without complaining.

## 7. The three mistakes most likely to be made here

1. **Reaching for a focus-trap library.** `showModal()` already does it, better,
   and the library will fight it. If focus is escaping, the dialog was opened
   with `show()` rather than `showModal()`.

2. **Putting it over a flat background.** There is nothing to blur and nothing
   to bend, so the sheet reads as a slightly dirty card. Glass wants something
   behind it.

3. **Forgetting that the page behind still scrolls.** `showModal()` makes the
   document inert but not unscrollable, so a wheel over the backdrop still moves
   what the dialog is sitting on. This component locks it; a hand-rolled one
   usually does not.

4. **Leaving `tint` low because it looks better.** It does look better, right up
   until somebody has to read a paragraph through it.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
