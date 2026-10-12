You are adding **DitherImage** from Beamish to this project.

> A photograph reduced to two tones by error diffusion, which is the kind of dither a shader cannot do. Surfaces · effect · MIT.
> https://beamish.ink/effects/dither-image

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- Every dithering effect on the web is an ordered dither: a fixed matrix of thresholds compared against the picture one pixel at a time. It is the only kind a fragment shader can do, because a fragment shader has to answer for one pixel without knowing anything about its neighbours
- Error diffusion is the other kind and the one that looks like something. Quantise a pixel, work out how much tone you threw away, hand that error to the pixels you have not reached yet. It is why a dithered Macintosh picture has grain that follows the subject instead of a crosshatch laid over it, and it is strictly sequential, so there is no way to put it on a GPU
- It runs on the CPU, and it does not run at the frame rate. Time is quantised to `rate` steps a second and the pass only runs when the step changes, so every other frame is one scaled drawImage. That is what lets the dots be fine: the pass costs four times as much each time the dot halves, so at sixty frames a second anything under about five pixels was unaffordable and the picture came out as big soft squares. It is still pure in t, because the step is a function of t alone
- Do not dither in linear light. A trap, and the first version here fell into it. The argument for linear is good as far as it goes: a half-and-half field of black and white dots averages in the eye to half the light, and light adds linearly. But a mid grey is 128, which is 0.50 encoded and 0.22 linear, so dithering in linear lays down 22 per cent white dots where the photograph says 50 per cent grey, and most of the frame goes solid. The flaw is that a photograph is not a scene: it has already been tone-mapped for a display, and undoing its encoding undoes the tone mapping with it. The quantity to preserve is the one the picture is stored in, which is why every implementation since 1976 works on the bytes as they come
- Atkinson throws a quarter of the error away. Floyd and Steinberg pass all of it over four neighbours; Atkinson passes six eighths over six, and the missing two eighths is not an oversight. Losing error pulls flat areas towards whichever tone they were nearest, so highlights go clean white and shadows go clean black, which is the whole reason the Macintosh look reads as contrasty rather than as a field of grey speckle
- Scan alternate rows backwards. Always going left to right drags the error one way, and in a smooth gradient that comes out as diagonal streaks running down and to the right. A serpentine scan cancels the drag, and the kernel is mirrored with it so a backwards row pushes its error the way it is travelling
- The source is sampled through a canvas the size of the grid, so the browser's own downscaler does the averaging. Taking one source pixel per dot aliases badly and a picture of foliage comes back as noise rather than as tone
- Scaled up with image smoothing off. With it on the browser interpolates the two tones back into the greys the dither existed to avoid, and the result is a slightly noisy photograph
- Animated error diffusion boils. The error propagates, so lifting the exposure by a hair flips one pixel, which changes what every pixel after it inherits, and whole runs of grain reorganise at once. At sixty frames a second that is television static; at eight it reads as grain, which is the other reason the rate is low
- A 2D canvas, so this is the one image item that costs nothing against the sixteen-million-pixel WebGL budget and can sit on a page beside a shader without competing with it
- The <img> stays in the document, hidden. Its alt text is the accessible version of the picture and a page whose script never runs still shows the photograph
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/dither-image/core.ts`**

```ts
/*
 * DitherImage: Beamish
 * https://beamish.ink/effects/dither-image
 *
 * A photograph reduced to two tones by error diffusion.
 *
 * WHY THIS IS NOT A SHADER
 *
 * Every dithering effect on the web is an ordered dither: a fixed matrix of
 * thresholds, usually Bayer's, compared against the picture one pixel at a
 * time. It is the only kind a fragment shader can do, because a fragment
 * shader has to answer for one pixel without knowing anything about its
 * neighbours.
 *
 * Error diffusion is the other kind and it is the one that looks like
 * something. Quantise a pixel, work out how much tone you threw away, and
 * hand that error to the pixels you have not reached yet. It is why a
 * dithered Macintosh picture has grain that follows the subject instead of a
 * crosshatch laid over it. And it is strictly sequential: every pixel depends
 * on the ones before it, so there is no way to write it per-pixel and no way
 * to put it on a GPU.
 *
 * So it runs on the CPU, and the thing that makes that affordable is that it
 * does not run at the frame rate. See the long note on `rate` further down:
 * the pass costs four times as much each time the dot halves, and running it
 * eight times a second instead of sixty is what lets the dots be fine enough
 * to be worth looking at. The first version of this ran every frame and had to
 * use a six-pixel dot to afford it, which came out as big soft squares with
 * the subject lost in them. The result is drawn once into a small
 * canvas and scaled up with smoothing off.
 *
 * THREE THINGS THAT ARE EASY TO GET WRONG
 *
 *   DO NOT DITHER IN LINEAR LIGHT. This one is a trap, and the first version
 *   here fell straight into it.
 *
 *   The argument for linear is good as far as it goes: a half-and-half field
 *   of black and white dots averages, in the eye, to half the light, and
 *   light adds linearly. So convert the picture out of its gamma encoding,
 *   dither there, and the dots reproduce the scene's actual luminance.
 *
 *   They do, and it comes out far too dark. A mid grey is 128, which is 0.50
 *   encoded and 0.22 linear, so dithering in linear lays down 22 per cent
 *   white dots where the photograph says 50 per cent grey. Most of a frame
 *   goes solid.
 *
 *   The flaw in the argument is that a photograph is not a scene. It has
 *   already been tone-mapped for a display, and the display's own gamma is
 *   what turns it back into light. Undoing that encoding and dithering
 *   underneath it undoes the tone mapping with it. The quantity to preserve
 *   is the one the picture is stored in, which is why every implementation
 *   since 1976 works on the bytes as they come and why this one does too.
 *
 *   ATKINSON THROWS A QUARTER OF THE ERROR AWAY. Floyd and Steinberg pass on
 *   all of it, over four neighbours. Atkinson passes six eighths over six, and
 *   the missing two eighths is not an oversight: losing error pulls flat areas
 *   towards whichever tone they were nearest, so highlights go clean white and
 *   shadows go clean black. That is the whole reason the Macintosh look reads
 *   as contrasty rather than as a field of grey speckle.
 *
 *   SCAN ALTERNATE ROWS BACKWARDS. Always scanning left to right drags the
 *   error one way, and in a smooth gradient that comes out as diagonal
 *   streaks running down and to the right. Reversing every other row, which
 *   is a serpentine or boustrophedon scan, cancels the drag. Turn `serpentine`
 *   off once on a sky and the streaks are not subtle.
 *
 * WHAT MOVES, AND WHY SLOWLY
 *
 * The exposure swells, a whole number of cycles over the period so the loop
 * closes. That is enough, and more than enough, because animated error
 * diffusion boils: the error propagates, so lifting the exposure by a hair
 * flips a pixel, which changes what every pixel after it inherits, and whole
 * runs of grain reorganise at once. Fast, it looks like static. Slow, it looks
 * like film grain on a plate that is breathing, which is the one kind of
 * motion this technique is any good at.
 *
 * NO WEBGL CONTEXT
 *
 * A 2D canvas, which means this is the one image item that costs nothing
 * against the sixteen-million-pixel budget and can sit on a page next to a
 * shader without competing with it.
 *
 * Pure in `t`. The grid is rebuilt from the source every frame, so nothing
 * carries over and the recorder can seek.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type DitherImageMode = 'atkinson' | 'floyd' | 'ordered'

export type DitherImageOptions = BaseOptions & {
  /** Size of one dot, in CSS pixels. This is the resolution of the whole thing. */
  dot: number
  /** Which dither. `ordered` is the shader kind, here to be compared against. */
  mode: DitherImageMode
  /** How many tones. 2 is one bit, which is the look. */
  levels: number
  /** The dark tone. */
  ink: string
  /** The light tone. */
  paper: string
  /** Multiplies the tone before quantising. */
  exposure: number
  /** Pushes tone away from the midpoint before quantising. */
  contrast: number
  /** How far the exposure swells over the period. 0 holds it still. */
  swell: number
  /** Seconds for one swell. The loop closes exactly on it. */
  period: number
  /** Scan alternate rows backwards, which cancels the error's drag. */
  serpentine: boolean
  /** How many times a second the dither is recomputed. */
  rate: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const ditherImageDefaults: DitherImageOptions = {
  dot: 3,
  mode: 'atkinson',
  levels: 2,
  ink: '#16141c',
  paper: '#f4f1e6',
  exposure: 1.05,
  contrast: 1.15,
  swell: 0.05,
  period: 4,
  serpentine: true,
  rate: 8,
  reducedMotionTime: 0,
  maxDpr: 2
}

const TAU = Math.PI * 2
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/*
 * Bayer, 8x8, as the recursive construction rather than a table. Each step
 * takes the matrix so far and makes a matrix twice the size whose quadrants
 * are offset by a quarter of the range, which is what spreads the thresholds
 * as evenly as a power-of-two grid allows.
 */
function bayer(size: number): Float32Array {
  let m = [[0]]
  while (m.length < size) {
    const n = m.length
    const next: number[][] = Array.from({ length: n * 2 }, () => new Array<number>(n * 2).fill(0))
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = (m[y]![x] ?? 0) * 4
        next[y]![x] = v
        next[y]![x + n] = v + 2
        next[y + n]![x] = v + 3
        next[y + n]![x + n] = v + 1
      }
    }
    m = next
  }
  const out = new Float32Array(size * size)
  const total = size * size
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) out[y * size + x] = (m[y]![x] ?? 0) / total
  }
  return out
}

const BAYER_SIZE = 8
const BAYER = bayer(BAYER_SIZE)

/*
 * The kernels, as offsets and weights. Floyd and Steinberg pass sixteen
 * sixteenths over four neighbours; Atkinson passes six eighths over six, and
 * the two eighths it drops are what make the look.
 */
/*
 * Flat rather than an array of triples, read three at a time. The tuple
 * version destructured six times per cell, which at a quarter of a million
 * cells a second was most of the cost of the item.
 */
const FLOYD = new Float32Array([
  1, 0, 7 / 16,
  -1, 1, 3 / 16,
  0, 1, 5 / 16,
  1, 1, 1 / 16
])

const ATKINSON = new Float32Array([
  1, 0, 1 / 8,
  2, 0, 1 / 8,
  -1, 1, 1 / 8,
  0, 1, 1 / 8,
  1, 1, 1 / 8,
  0, 2, 1 / 8
])

function rgb(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map(c => c + c)
          .join('')
      : h
  const n = Number.parseInt(full.slice(0, 6) || '000000', 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

class DitherImageSurface implements Surface<DitherImageOptions> {
  private ctx: CanvasRenderingContext2D | null = null
  private canvas: HTMLCanvasElement | null = null
  private image: HTMLImageElement | null = null
  private size = { width: 1, height: 1, pixelWidth: 1, pixelHeight: 1 }

  /*
   * The small canvas the dither is written into, and the one the source is
   * sampled through. Two, not one: the source sample is only redone when the
   * grid changes, and overwriting it every frame would mean a drawImage and a
   * getImageData per frame for a result that has not changed.
   */
  private plate: HTMLCanvasElement | null = null
  private plateCtx: CanvasRenderingContext2D | null = null
  private out: ImageData | null = null

  /** Linear luminance of the source, at grid resolution. */
  private lum = new Float32Array(0)
  /** The working copy the error is accumulated into. */
  private buf = new Float32Array(0)
  private grid = { w: 0, h: 0 }
  private sampledFor = ''
  /** What the plate currently holds, so a frame that would redraw it skips. */
  private platedFor = ''

  setup(ctx: { canvas: HTMLCanvasElement | null; host: HTMLElement }): void {
    if (!ctx.canvas) throw new Error('DitherImage needs a canvas')
    const context = ctx.canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('DitherImage needs a 2D context')
    this.canvas = ctx.canvas
    this.ctx = context

    /*
     * The first <img> in the host, hidden from sight and left in the document.
     * The alt text and the loading behaviour stay whatever was written, and a
     * page whose script never runs still shows the picture.
     */
    const image = ctx.host.querySelector('img')
    if (image) {
      this.image = image
      image.style.visibility = 'hidden'
      if (!(image.complete && image.naturalWidth > 0)) {
        image.addEventListener(
          'load',
          () => {
            this.sampledFor = ''
          },
          { once: true }
        )
      }
    }
  }

  resize(size: {
    width: number
    height: number
    pixelWidth: number
    pixelHeight: number
  }): void {
    this.size = size
    this.sampledFor = ''
  }

  /*
   * The source, reduced to a grid of linear luminances. Done through a canvas
   * the size of the grid, so the browser's own downscaler does the averaging:
   * sampling one source pixel per dot instead would alias badly, and a picture
   * of foliage would come back as noise rather than as tone.
   */
  private sample(opts: DitherImageOptions): void {
    const dot = Math.max(1, opts.dot)
    const w = Math.max(1, Math.round(this.size.width / dot))
    const h = Math.max(1, Math.round(this.size.height / dot))
    const key = `${w}x${h}`
    if (key === this.sampledFor) return

    this.grid = { w, h }
    this.platedFor = ''
    this.lum = new Float32Array(w * h)
    this.buf = new Float32Array(w * h)

    if (!this.plate) {
      this.plate = document.createElement('canvas')
      this.plateCtx = this.plate.getContext('2d', { alpha: false, willReadFrequently: true })
    }
    const plate = this.plate
    const plateCtx = this.plateCtx
    if (!plate || !plateCtx) return
    plate.width = w
    plate.height = h
    this.out = plateCtx.createImageData(w, h)

    const image = this.image
    if (image && image.complete && image.naturalWidth > 0) {
      /* Cover: the picture fills the grid rather than stretching to it. */
      const sourceAspect = image.naturalWidth / image.naturalHeight
      const gridAspect = w / h
      const cropW = sourceAspect > gridAspect ? image.naturalHeight * gridAspect : image.naturalWidth
      const cropH = sourceAspect > gridAspect ? image.naturalHeight : image.naturalWidth / gridAspect
      plateCtx.drawImage(
        image,
        (image.naturalWidth - cropW) / 2,
        (image.naturalHeight - cropH) / 2,
        cropW,
        cropH,
        0,
        0,
        w,
        h
      )
      const data = plateCtx.getImageData(0, 0, w, h).data
      for (let i = 0; i < w * h; i++) {
        /*
         * Rec. 709 weights on the channels as they come, which gives luma
         * rather than luminance. A mean of the three instead makes red and
         * blue far too light, and on a face that is the difference between
         * skin and a mask.
         */
        const r = (data[i * 4] ?? 0) / 255
        const g = (data[i * 4 + 1] ?? 0) / 255
        const b = (data[i * 4 + 2] ?? 0) / 255
        this.lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b
      }
    } else {
      /* No picture yet: a flat midtone, so the grid is visible rather than
         blank and a missing image reads as a missing image. */
      this.lum.fill(0.5)
    }

    this.sampledFor = key
  }

  render(t: number, opts: DitherImageOptions): void {
    const ctx = this.ctx
    const canvas = this.canvas
    if (!ctx || !canvas) return
    this.sample(opts)

    const { w, h } = this.grid
    const out = this.out
    const plate = this.plate
    const plateCtx = this.plateCtx
    if (!out || !plate || !plateCtx || w < 1 || h < 1) return

    /*
     * THE DITHER DOES NOT RUN AT THE FRAME RATE
     *
     * Time is quantised to `rate` steps a second and the pass only runs when
     * the step changes; every other frame redraws the plate it already has,
     * which is one scaled drawImage.
     *
     * Three things come out of that, and the first one is the reason:
     *
     *   The dots can be as fine as they should be. The whole pass costs four
     *   times as much each time the dot halves, so at the frame rate anything
     *   under about five pixels was unaffordable and the picture came out as
     *   big soft squares. Eight passes a second instead of sixty is near
     *   enough an eighth of the work, and a three-pixel dot costs less than a
     *   six-pixel one used to.
     *
     *   It is what a one-bit display did. A Macintosh did not re-dither its
     *   screen sixty times a second; the bitmap sat there until something
     *   changed it.
     *
     *   And the boil stops being static. Error diffusion reorganises whole
     *   runs of grain for a hair of exposure, so at sixty frames a second it
     *   is noise. At eight it reads as grain.
     *
     * Still pure in `t`: the step is a function of `t` alone, so the recorder
     * seeks to the same frame every time.
     */
    const rate = Math.max(opts.rate, 0.1)
    const step = Math.floor(t * rate) / rate
    const key = [
      step,
      this.grid.w,
      this.grid.h,
      opts.mode,
      opts.levels,
      opts.ink,
      opts.paper,
      opts.exposure,
      opts.contrast,
      opts.swell,
      opts.period,
      opts.serpentine
    ].join('|')

    if (key === this.platedFor) {
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(plate, 0, 0, w, h, 0, 0, canvas.width, canvas.height)
      return
    }
    this.platedFor = key

    /*
     * The swell, a whole number of cycles over the period so the last frame is
     * the first frame. Error diffusion boils when it moves, so this is kept
     * small and slow on purpose.
     */
    const swell = 1 + opts.swell * Math.sin((TAU * step) / Math.max(opts.period, 0.001))
    const exposure = Math.max(opts.exposure, 0) * swell
    const contrast = Math.max(opts.contrast, 0)

    const buf = this.buf
    for (let i = 0; i < w * h; i++) {
      const v = (this.lum[i] ?? 0) * exposure
      buf[i] = clamp01((v - 0.5) * contrast + 0.5)
    }

    const levels = Math.max(2, Math.round(opts.levels))
    const steps = levels - 1
    const kernel = opts.mode === 'floyd' ? FLOYD : ATKINSON
    const diffuse = opts.mode !== 'ordered'
    const serpentine = opts.serpentine && diffuse

    const [ir, ig, ib] = rgb(opts.ink)
    const [pr, pg, pb] = rgb(opts.paper)

    /*
     * The output is written a word at a time through a 32-bit view rather than
     * four bytes at a time. Little-endian, so the channels run the other way
     * round from how they read: this is alpha, blue, green, red.
     *
     * For one bit there are only two possible words, so they are worked out
     * once and chosen between. That is the common case and it is the whole
     * reason this is worth doing.
     */
    const words = new Uint32Array(out.data.buffer)
    const inkWord = (255 << 24) | (ib << 16) | (ig << 8) | ir
    const paperWord = (255 << 24) | (pb << 16) | (pg << 8) | pr
    const oneBit = levels === 2

    for (let y = 0; y < h; y++) {
      const backwards = serpentine && (y & 1) === 1
      for (let k = 0; k < w; k++) {
        const x = backwards ? w - 1 - k : k
        const at = y * w + x
        /*
         * Not clamped. The accumulated value goes outside 0 to 1 constantly,
         * and the amount by which it does is error that still has to go
         * somewhere: clamping here instead of at the quantisation step throws
         * it away, which quietly lifts the blacks and dulls the whites. It is
         * a real variant and it is not this one.
         */
        const want = buf[at]!
        const level = want < 0 ? 0 : want > 1 ? 1 : want

        let q: number
        if (diffuse) {
          q = Math.round(level * steps) / steps
          const error = want - q
          for (let e = 0; e < kernel.length; e += 3) {
            /* Mirrored with the scan, so a serpentine row pushes its error the
               way it is travelling rather than back over ground it has done. */
            const nx = x + (backwards ? -kernel[e]! : kernel[e]!)
            const ny = y + kernel[e + 1]!
            if (nx < 0 || nx >= w || ny >= h) continue
            const to = ny * w + nx
            buf[to] = buf[to]! + error * kernel[e + 2]!
          }
        } else {
          /* The shader kind, for comparison: a fixed threshold matrix and no
             error anywhere. Note how it sits over the picture rather than in
             it. */
          const threshold = BAYER[(y % BAYER_SIZE) * BAYER_SIZE + (x % BAYER_SIZE)]!
          q = Math.floor(level * steps + threshold) / steps
          if (q < 0) q = 0
          else if (q > 1) q = 1
        }

        if (oneBit) {
          words[at] = q < 0.5 ? inkWord : paperWord
        } else {
          const r = (ir + (pr - ir) * q) | 0
          const g = (ig + (pg - ig) * q) | 0
          const b = (ib + (pb - ib) * q) | 0
          words[at] = (255 << 24) | (b << 16) | (g << 8) | r
        }
      }
    }

    plateCtx.putImageData(out, 0, 0)

    /*
     * Scaled up with smoothing off, so a dot is a square with hard edges. With
     * smoothing on the whole point is lost: the browser interpolates the two
     * tones back into the greys the dither existed to avoid, and the result is
     * a slightly noisy photograph.
     */
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(plate, 0, 0, w, h, 0, 0, canvas.width, canvas.height)
  }

  teardown(): void {
    if (this.image) this.image.style.visibility = ''
    this.ctx = null
    this.canvas = null
    this.image = null
    this.plate = null
    this.plateCtx = null
    this.out = null
    this.lum = new Float32Array(0)
    this.buf = new Float32Array(0)
    this.sampledFor = ''
  }
}

/**
 * Mount DitherImage into `el`. The element must contain an `<img>`, which stays
 * in the document: its alt text is the accessible version of the picture.
 *
 * ```ts
 * const plate = createDitherImage(document.querySelector('#plate')!)
 * plate.start()
 * // …later
 * plate.destroy()
 * ```
 */
export function createDitherImage(
  el: HTMLElement,
  opts: Partial<DitherImageOptions> = {}
): EffectHandle {
  return mount<DitherImageOptions>(el, opts, {
    defaults: ditherImageDefaults,
    create: () => new DitherImageSurface()
  })
}

export default createDitherImage
```

**`src/beamish/shared/runtime.ts`**

```ts
/*
 * Beamish effect runtime.
 *
 * Every tier-1 effect is a thin `Surface` plugged into `mount()`. The host owns
 * everything that is the same for all of them and easy to get wrong: DPR capping,
 * resize, pausing offscreen, pausing on tab hide, reduced motion, WebGL context
 * loss and restore, and full teardown.
 *
 * An effect's core.ts should contain drawing, and nothing else.
 */

import { resolveAutoGrounds } from './ground'

export type EffectHandle = {
  start(): void
  stop(): void
  update(opts: Record<string, unknown>): void
  /** Deterministic: the same `t` must always yield the same frame. */
  renderAtTime(t: number): void
  /** Release the WebGL context, RAF and every listener. */
  destroy(): void
}

export type Size = {
  /** CSS pixels. */
  width: number
  height: number
  /** Device pixels, DPR already capped. Use these for the drawing buffer. */
  pixelWidth: number
  pixelHeight: number
  dpr: number
}

export type Pointer = {
  /**
   * 0 to 1 across the element, origin top-left. Centre until first move.
   *
   * Under `pointerScope: 'window'` this is not clamped: 1.4 means the cursor is
   * 40% of the element's width past its right edge. An effect that reaches
   * beyond its own box needs to know how far.
   */
  x: number
  y: number
  /** False until the pointer has entered, so effects can idle sensibly. */
  active: boolean
}

/** One sample of a scripted cursor path. `t` is seconds; x/y are 0 to 1. */
export type PointerKey = { t: number; x: number; y: number }

/**
 * One scripted press. `t` is seconds from the start of the loop; x/y are 0 to 1
 * across the element.
 *
 * A path can say where the cursor is at any moment, but a press is an instant
 * rather than a position, so it needs its own list. An effect that answers to
 * clicks reads this alongside whatever real presses it has seen, which is what
 * lets the recorder produce a take with clicks in it without anything having
 * been clicked.
 */
export type PressKey = { t: number; x: number; y: number }

export type Scroll = {
  /**
   * How far the host has travelled through the viewport. 0 when its top edge is
   * level with the bottom of the viewport, 1 when its bottom edge is level with
   * the top. Outside that range the element is off screen.
   */
  progress: number
  /**
   * Signed rate of change of `progress`, in units per second, already smoothed.
   * Negative is scrolling back up.
   *
   * This is the interesting one. Position tells an effect where it is; velocity
   * tells it how hard it was thrown, which is what anything physical has to know.
   */
  velocity: number
  /** False until the page has actually been scrolled. */
  active: boolean
}

/** One sample of a scripted scroll path. `t` is seconds; progress is 0 to 1. */
export type ScrollKey = { t: number; progress: number }

export type SurfaceContext = {
  /** The element the effect was mounted into. */
  host: HTMLElement
  /**
   * The generated canvas, or null for a `kind: 'dom'` effect. A text treatment
   * has nothing to draw into and should not be handed a canvas it will not use.
   */
  canvas: HTMLCanvasElement | null
  size: Size
}

/**
 * The per-effect half. `setup` runs on mount and again after the GPU hands the
 * context back, so it must be safe to call more than once.
 */
export interface Surface<O> {
  setup(ctx: SurfaceContext): void
  resize(size: Size): void
  /**
   * Draw one frame. `t` is absolute seconds from the start of the loop.
   *
   * Must be pure in `t`. Do not integrate against the previous frame, or the
   * recorder cannot produce a clean loop and `renderAtTime` breaks.
   */
  render(t: number, opts: O, pointer: Pointer, scroll: Scroll): void
  teardown(): void
  /** Return the GL context if there is one, so the host can release it. */
  context?(): WebGLRenderingContext | WebGL2RenderingContext | null
}

export type BaseOptions = {
  /**
   * Scripted cursor path. When set, the live pointer is ignored and the pointer
   * is sampled from this path at the current time, which is what makes
   * pointer-driven effects deterministic for the recorder.
   */
  pointerPath?: PointerKey[]
  /** Seconds the scripted path takes to run once before repeating. */
  pointerPathDuration?: number
  /**
   * Scripted presses, for effects that answer to a click. Each is a time and a
   * point, and an effect treats them exactly as it treats a real press that
   * happened at that moment, so a recorded take and a live page agree.
   *
   * Unlike `pointerPath`, this does not replace the live input: a scripted press
   * and a real one are the same kind of event, and an effect that ignored the
   * cursor while a script was running would be dead on the page.
   */
  pressPath?: PressKey[]
  /**
   * Scripted scroll path. When set, the real scroll position is ignored and both
   * progress and velocity are read from this path at the current time.
   *
   * Velocity is the slope of the segment rather than a difference against the
   * last frame, so it is a function of `t` alone. That is the whole point: an
   * effect driven by a real scrollbar cannot be replayed, and the recorder needs
   * frame 90 to look the same every time it asks for it.
   */
  scrollPath?: ScrollKey[]
  /** Seconds the scripted scroll path takes to run once before repeating. */
  scrollPathDuration?: number
  /** Frame shown when the user prefers reduced motion. Pick one that composes. */
  reducedMotionTime?: number
  /** Cap on device pixel ratio. Above 2 the cost is real and the gain is not. */
  maxDpr?: number
  /** Set false to opt out of pausing when scrolled offscreen. */
  pauseWhenOffscreen?: boolean
  /**
   * Where the pointer is read from.
   *
   * `element` fires only while the cursor is over the host and reports 0 to 1.
   * `window` follows the cursor everywhere and reports element-relative
   * coordinates that go outside 0 to 1, which is what an effect needs if it
   * reacts to a cursor that has not arrived yet.
   */
  pointerScope?: 'element' | 'window'
}

export type MountConfig<O> = {
  /** Merged over on every `update()`. */
  defaults: O
  create(): Surface<O>
  /**
   * `canvas` generates a canvas filling the host and watches it for context
   * loss. `dom` generates nothing and hands the host element straight to the
   * surface, which is what a text or layout effect wants.
   */
  kind?: 'canvas' | 'dom'
  /** Extra classes for the generated canvas. Ignored when kind is 'dom'. */
  canvasClass?: string
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** Linear sample of a scripted path, wrapping at `duration` so it loops. */
export const samplePointerPath = (keys: PointerKey[], t: number, duration: number): Pointer => {
  if (keys.length === 0) return { x: 0.5, y: 0.5, active: false }
  const first = keys[0]!
  if (keys.length === 1) return { x: first.x, y: first.y, active: true }

  const span = duration > 0 ? duration : keys[keys.length - 1]!.t
  const local = span > 0 ? ((t % span) + span) % span : 0

  let a = first
  let b = keys[keys.length - 1]!
  for (let i = 0; i < keys.length - 1; i++) {
    const lo = keys[i]!
    const hi = keys[i + 1]!
    if (local >= lo.t && local <= hi.t) {
      a = lo
      b = hi
      break
    }
  }

  const gap = b.t - a.t
  const k = gap > 0 ? clamp01((local - a.t) / gap) : 0
  // Smoothstep between keys: a linear cursor reads as a machine, which is what
  // it is, but it looks wrong next to eased motion.
  const e = k * k * (3 - 2 * k)
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, active: true }
}

/**
 * Linear sample of a scripted scroll path, wrapping at `duration` so it loops.
 *
 * Velocity comes out of the same smoothstep by differentiating it rather than by
 * comparing against the previous frame, which is what keeps the whole thing a
 * function of `t`. The derivative of the smoothstep is 6k(1-k), so velocity is
 * zero at each key and peaks halfway between: the scroll eases in and out of
 * every stop by construction.
 */
export const sampleScrollPath = (keys: ScrollKey[], t: number, duration: number): Scroll => {
  if (keys.length === 0) return { progress: 0, velocity: 0, active: false }
  const first = keys[0]!
  if (keys.length === 1) return { progress: first.progress, velocity: 0, active: true }

  const span = duration > 0 ? duration : keys[keys.length - 1]!.t
  const local = span > 0 ? ((t % span) + span) % span : 0

  let a = first
  let b = keys[keys.length - 1]!
  for (let i = 0; i < keys.length - 1; i++) {
    const lo = keys[i]!
    const hi = keys[i + 1]!
    if (local >= lo.t && local <= hi.t) {
      a = lo
      b = hi
      break
    }
  }

  const gap = b.t - a.t
  const k = gap > 0 ? clamp01((local - a.t) / gap) : 0
  const e = k * k * (3 - 2 * k)
  const delta = b.progress - a.progress
  return {
    progress: a.progress + delta * e,
    velocity: gap > 0 ? (delta * 6 * k * (1 - k)) / gap : 0,
    active: true
  }
}

export function mount<O extends BaseOptions>(
  el: HTMLElement,
  userOpts: Partial<O> | undefined,
  config: MountConfig<O>
): EffectHandle {
  /*
   * `auto` in a colour option means take it from the page. Resolved here, at
   * the one point that has both the host element and the merged options, so no
   * item has to reach into the DOM from inside its own render loop.
   */
  let opts: O = resolveAutoGrounds(el, { ...config.defaults, ...(userOpts ?? {}) })

  const kind = config.kind ?? 'canvas'

  let canvas: HTMLCanvasElement | null = null
  if (kind === 'canvas') {
    canvas = document.createElement('canvas')
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    /*
     * Its own compositor layer, so the page cannot resample it.
     *
     * A canvas whose box lands on a half pixel has to be resampled to the
     * device grid, and which way it snaps is the compositor's business rather
     * than ours. Snapping one way on one frame and the other way on the next
     * moves the whole picture by a pixel, which is a flicker between two
     * positions that leaves no trace anywhere: the drawing buffer is perfect,
     * the clock is smooth, the box never changes and every number comes back
     * clean. It was reported on a canvas sitting at x = 683.5, and the same
     * effect at x = 123.5 on another machine was steady.
     *
     * translateZ(0) rather than will-change, because will-change is a hint
     * the browser is free to drop and this needs to be a promise. The cost is
     * one layer per live effect, and there is only ever one.
     */
    canvas.style.transform = 'translateZ(0)'
    canvas.style.backfaceVisibility = 'hidden'
    /*
     * Hidden until the first frame is in it.
     *
     * A WebGL canvas with `alpha: false` starts opaque black, and it is in the
     * document from the moment it is created, so between that and the first
     * draw the browser has a black rectangle to paint. On a warm cache that is
     * one frame and it reads as a flash; on a cold one the gap is longer.
     *
     * visibility rather than display, because display: none gives the element
     * no size and the first measure would come back zero.
     */
    canvas.style.visibility = 'hidden'
    if (config.canvasClass) canvas.className = config.canvasClass
    el.appendChild(canvas)
  }

  let surface: Surface<O> | null = null
  let size: Size = measure()
  let raf = 0
  let running = false
  let destroyed = false
  let contextLost = false

  // Wall-clock is accumulated rather than read, so stopping and starting does not
  // jump the animation and the loop stays reproducible.
  let elapsed = 0
  let lastStamp = 0

  const pointer: Pointer = { x: 0.5, y: 0.5, active: false }
  const scroll: Scroll = { progress: 0, velocity: 0, active: false }

  /*
   * Scroll is sampled once per frame, in the loop, rather than on the scroll
   * event.
   *
   * The event is the obvious place and it is the wrong one. Measured on a real
   * wheel scroll, scroll events arrive at about 6Hz while the effect renders at
   * 60, so a value taken on the event is reused for up to five frames running
   * and the effect moves in visible steps. Decaying it between events does not
   * fix that; it just turns the steps into a sawtooth.
   *
   * Reading the rect every frame costs about 20 microseconds, measured, which
   * is a tenth of a percent of a frame. It is a read with no write in front of
   * it, so it forces no layout.
   *
   * This is the one piece of state in the runtime that is not a function of
   * `t`, which is why `scrollPath` exists to replace it wholesale for the
   * recorder.
   */
  let scrollStarted = false
  let scrollSeeded = false

  /*
   * Half-life of the velocity smoothing. A per-frame difference is noisy enough
   * that handing it straight to a shader looks like chatter, and frame times
   * are not uniform. 70ms is short enough to feel attached to the input and
   * long enough to hide that jitter.
   */
  const VELOCITY_HALF_LIFE = 0.07

  function sampleScroll(dt: number) {
    const rect = el.getBoundingClientRect()
    const viewport = window.innerHeight || 1
    /*
     * 0 when the top edge is level with the bottom of the viewport, 1 when the
     * bottom edge is level with the top. Measured against the element's own
     * height plus the viewport, so a tall hero and a short strip both travel
     * the full range, which is what makes the number worth handing to an
     * effect at all.
     */
    const span = viewport + rect.height
    const next = span > 0 ? clamp01((viewport - rect.top) / span) : 0

    if (!scrollSeeded) {
      // Nothing to difference against on the first frame, and seeding it with a
      // zero gap would read as an infinite velocity.
      scroll.progress = next
      scrollSeeded = true
      return
    }

    if (dt > 0) {
      const instant = (next - scroll.progress) / dt
      const k = 1 - Math.pow(0.5, dt / VELOCITY_HALF_LIFE)
      scroll.velocity += (instant - scroll.velocity) * k
      if (Math.abs(scroll.velocity) < 1e-4) scroll.velocity = 0
    }

    if (next !== scroll.progress) scrollStarted = true
    scroll.progress = next
    scroll.active = scrollStarted
  }

  const motionQuery =
    typeof matchMedia === 'function' ? matchMedia(REDUCED_MOTION_QUERY) : null
  let reduced = motionQuery?.matches ?? false

  function measure(): Size {
    const rect = el.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect.width))
    const height = Math.max(1, Math.round(rect.height))
    const cap = opts.maxDpr ?? 2
    const dpr = Math.min(window.devicePixelRatio || 1, cap)
    return {
      width,
      height,
      pixelWidth: Math.max(1, Math.round(width * dpr)),
      pixelHeight: Math.max(1, Math.round(height * dpr)),
      dpr
    }
  }

  function applySize() {
    size = measure()
    if (canvas) {
      if (canvas.width !== size.pixelWidth) canvas.width = size.pixelWidth
      if (canvas.height !== size.pixelHeight) canvas.height = size.pixelHeight
    }
    surface?.resize(size)
  }

  function pointerAt(t: number): Pointer {
    const path = opts.pointerPath
    if (path && path.length > 0) {
      return samplePointerPath(path, t, opts.pointerPathDuration ?? 0)
    }
    return pointer
  }

  function scrollAt(t: number): Scroll {
    const path = opts.scrollPath
    if (path && path.length > 0) {
      return sampleScrollPath(path, t, opts.scrollPathDuration ?? 0)
    }
    return scroll
  }

  function draw(t: number) {
    if (!surface || contextLost) return
    surface.render(t, opts, pointerAt(t), scrollAt(t))
    // There is something in the canvas now, so it can be shown. Cheap: a style
    // write that is already the current value does not invalidate anything.
    if (canvas && canvas.style.visibility === 'hidden') canvas.style.visibility = ''
  }

  function tick(stamp: number) {
    if (!running) return
    /*
     * Clamped at both ends.
     *
     * The top end is the tab-switch spike this always guarded against. The
     * bottom end is that a rAF timestamp is the moment the frame began, which
     * can be EARLIER than the performance.now() start() took a moment before:
     * the subtraction is then negative, Math.min keeps it, and the effect's
     * clock runs backwards. Measured on WindField, elapsed began at -0.1088
     * and four frames were rendered at a negative t before it climbed past
     * zero. A shader handed a smaller t than last frame draws an earlier
     * picture, which is a visible jump backwards on every start, and start
     * runs again every time the panel scrolls into view or the tab is
     * returned to.
     */
    const dt = Math.min(Math.max(stamp - lastStamp, 0), 100) / 1000
    elapsed += dt
    lastStamp = stamp
    sampleScroll(dt)
    draw(elapsed)
    raf = requestAnimationFrame(tick)
  }

  function ensureSurface() {
    if (surface || destroyed) return
    surface = config.create()
    surface.setup({ host: el, canvas, size })
    surface.resize(size)
  }

  function start() {
    if (destroyed || running || contextLost) return
    ensureSurface()
    if (reduced) {
      // WCAG 2.3.3: no loop at all. Still show a composed frame rather than a
      // blank panel. See reducedMotionTime.
      draw(opts.reducedMotionTime ?? 0)
      return
    }
    running = true
    lastStamp = performance.now()
    raf = requestAnimationFrame(tick)
  }

  function stop() {
    running = false
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    /*
     * Velocity is sampled in the loop, so a paused effect would otherwise keep
     * whatever it was last handed. Resuming after being scrolled past would
     * then show one frame of a flick that happened seconds ago.
     */
    scroll.velocity = 0
  }

  // --- context loss ------------------------------------------------------
  // Chromium hands a lost context back when an active one is released, so this
  // path fires in ordinary use, not only on a GPU crash.

  const onLost = (event: Event) => {
    event.preventDefault() // without this the context is not recoverable
    contextLost = true
    stop()
    surface?.teardown()
    surface = null
  }

  const onRestored = () => {
    contextLost = false
    if (destroyed) return
    ensureSurface()
    applySize()
    if (visible) start()
  }

  // Only a canvas can lose a GL context. A DOM effect has nothing to listen for.
  canvas?.addEventListener('webglcontextlost', onLost as EventListener, false)
  canvas?.addEventListener('webglcontextrestored', onRestored, false)

  // --- pointer -----------------------------------------------------------

  const windowScope = opts.pointerScope === 'window'

  const onPointerMove = (event: PointerEvent) => {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    // Window scope reports unclamped coordinates on purpose. An effect that
    // reaches past its own edge has to know how far past, and clamping would
    // pin it to the border instead.
    pointer.x = windowScope ? x : clamp01(x)
    pointer.y = windowScope ? y : clamp01(y)
    pointer.active = true
  }

  const onPointerLeave = () => {
    pointer.active = false
  }

  const pointerTarget: EventTarget = windowScope ? window : el
  pointerTarget.addEventListener('pointermove', onPointerMove as EventListener)
  // Only element scope has a leave: the window one is never left.
  if (!windowScope) el.addEventListener('pointerleave', onPointerLeave)

  // --- scroll ------------------------------------------------------------

  /*
   * No scroll listener. The position is read in the frame loop above, which is
   * both smoother and one fewer thing to remove on teardown. An effect that is
   * not running does not need a scroll position, because nothing is drawing it.
   */

  // --- visibility and viewport -------------------------------------------

  let visible = true
  let wantedByUser = false

  const resizeObserver = new ResizeObserver(() => {
    if (destroyed) return
    applySize()
    /*
     * Always redraw, not only when stopped.
     *
     * Assigning canvas.width or canvas.height resets the drawing buffer, and a
     * WebGL buffer resets to opaque black. Leaving that for the next animation
     * frame means one black frame every time the element changes size, and
     * since the observer fires once on its first observation, that was a black
     * flash on every mount: the canvas showed its first drawn frame, the
     * observer cleared it, and the page painted the hole before the next tick
     * filled it.
     */
    draw(reduced ? opts.reducedMotionTime ?? 0 : elapsed)
  })
  resizeObserver.observe(el)

  const intersectionObserver =
    opts.pauseWhenOffscreen === false
      ? null
      : new IntersectionObserver(
          entries => {
            const entry = entries[entries.length - 1]
            if (!entry) return
            visible = entry.isIntersecting
            if (visible) {
              if (wantedByUser) start()
            } else {
              stop()
            }
          },
          { threshold: 0 }
        )
  /*
   * The gate watches the element's parent, not the element.
   *
   * Watching the element deadlocks any effect that clips or moves its own host.
   * A reveal starts with its host clipped to nothing, the observer reports that
   * as not intersecting, the runtime stops the loop, and the clip therefore
   * never advances off the host: blank for ever, with the replay button unable
   * to escape it because `visible` can never become true again. The gate's
   * input must not be geometry the effect controls.
   *
   * The parent is laid out by the page rather than by the effect, so it breaks
   * the cycle. It is usually a little larger, which means an effect can start a
   * frame or two before it is strictly on screen. That is the cheaper mistake.
   */
  intersectionObserver?.observe(el.parentElement ?? el)

  const onVisibilityChange = () => {
    if (document.hidden) stop()
    else if (wantedByUser && visible) start()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  // Live listener, not a one-time read, so toggling the OS setting mid-session
  // takes effect without a reload.
  const onMotionChange = (event: MediaQueryListEvent) => {
    reduced = event.matches
    if (reduced) {
      stop()
      ensureSurface()
      draw(opts.reducedMotionTime ?? 0)
    } else if (wantedByUser && visible) {
      start()
    }
  }
  motionQuery?.addEventListener('change', onMotionChange)

  // --- handle ------------------------------------------------------------

  const handle: EffectHandle = {
    start() {
      wantedByUser = true
      if (visible && !document.hidden) start()
    },
    stop() {
      wantedByUser = false
      stop()
    },
    update(next) {
      opts = resolveAutoGrounds(el, { ...opts, ...(next as Partial<O>) })
      applySize()
      if (!running) draw(reduced ? opts.reducedMotionTime ?? 0 : elapsed)
    },
    renderAtTime(t) {
      if (destroyed) return
      ensureSurface()
      elapsed = t
      draw(t)
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      stop()

      motionQuery?.removeEventListener('change', onMotionChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      intersectionObserver?.disconnect()
      resizeObserver.disconnect()
      pointerTarget.removeEventListener('pointermove', onPointerMove as EventListener)
      el.removeEventListener('pointerleave', onPointerLeave)
      canvas?.removeEventListener('webglcontextlost', onLost as EventListener)
      canvas?.removeEventListener('webglcontextrestored', onRestored)

      const gl = surface?.context?.() ?? null
      surface?.teardown()
      surface = null

      // Hand the context back now rather than waiting for GC. The browser budget
      // is 16 contexts or 16M pixels, whichever comes first, and a page that
      // navigates between demos will hit it otherwise.
      gl?.getExtension('WEBGL_lose_context')?.loseContext()

      canvas?.remove()
    }
  }

  return handle
}
```

## 2. What it is

DitherImage reduces a photograph to two tones by **error diffusion**, which is
the kind of dither a shader cannot do.

Every dithering effect on the web is an *ordered* dither: a fixed matrix of
thresholds, usually Bayer's, compared against the picture one pixel at a time.
That is not a stylistic choice, it is the only kind a fragment shader can do. A
fragment shader has to answer for one pixel without knowing anything about its
neighbours, and ordered dithering is the only dither with that property.

Error diffusion is the other kind, and it is the one that looks like something.
Quantise a pixel, work out how much tone you threw away, and hand that error to
the pixels you have not reached yet. The grain then **follows the subject**
rather than lying across it as a crosshatch. It is also strictly sequential:
every pixel depends on the ones before it, so there is no way to write it
per-pixel and no way to put it on a GPU.

Switch `mode` to `ordered` once. The difference is not subtle and it is the
whole argument for this item existing.

## 3. Wire it in

**Plain HTML.** The element must contain an `<img>`. It stays in the document,
hidden once the picture has been sampled, so a browser that never runs the
script shows the photograph and a screen reader still reads the alt text.

```html
<div id="plate" style="position: relative; height: 70vh">
  <img src="/plate.jpg" alt="A grass headland falling away to the sea" />
</div>

<script type="module">
  import { createDitherImage } from './beamish/effects/dither-image/core.js'

  const plate = createDitherImage(document.querySelector('#plate'))
  plate.start()
</script>
```

Take the image out of the flow (`position: absolute; inset: 0`). Left in it,
the canvas the effect appends is pushed a full element height down the page,
where it draws perfectly and is never seen. That is worth saying because it
looks like the effect has failed rather than like a layout problem.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createDitherImage } from '@/beamish/effects/dither-image/core'

export function Plate({ src, alt }: { src: string; alt: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const plate = createDitherImage(host.current, { dot: 4 })
    plate.start()
    return () => plate.destroy()
  }, [src])

  return (
    <div ref={host} style={{ position: 'relative' }}>
      <img src={src} alt={alt} style={{ position: 'absolute', inset: 0 }} />
    </div>
  )
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createDitherImage } from '@/beamish/effects/dither-image/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let plate: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  plate = createDitherImage(host.value)
  plate.start()
})

onBeforeUnmount(() => plate?.destroy())
</script>

<template>
  <div ref="host" class="plate">
    <img src="/plate.jpg" alt="A grass headland falling away to the sea" />
  </div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and works
from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `dot` | number | `3` | 2 to 20 px (looks right between 2 and 5) | Size of one dot, in CSS pixels. The resolution of the whole thing, and the first version of this item had it at 6, which is wrong: at 6 the picture is big soft squares and the subject is mush. At 3 it is a legible one-bit photograph, which is the point. The pass costs four times as much each time this halves, which is why it only runs `rate` times a second rather than every frame: 4.8ms at 3, and 12.6ms at 2, which is a dropped frame every time it runs. |
| `mode` | enum | `atkinson` | `atkinson` · `floyd` · `ordered` | Which dither. `atkinson` throws away a quarter of the error, which cleans the highlights and the shadows and is the Macintosh look. `floyd` keeps all of it, which holds more midtone and reads greyer and flatter. `ordered` is the Bayer matrix, the only kind a shader can do, and it is here to be switched to once: notice that it sits over the picture rather than in it. |
| `levels` | number | `2` | 2 to 8 (looks right between 2 and 4) | How many tones. 2 is one bit and it is the whole point. Past about 4 there is enough tone that the dither stops doing any work and you have a posterised photograph, which is a different and much less interesting thing. |
| `ink` | color | `#16141c` | any CSS hex | The dark tone. A soft near-black rather than a true one: a screen printed in true black against true white reads as a screenshot of a bitmap rather than as something on a page. |
| `paper` | color | `#f4f1e6` | any CSS hex | The light tone. Set this and the ink the other way round for the terminal version, which is green on black and which everybody else ships. |
| `exposure` | number | `1.05` | 0.2 to 3 (looks right between 0.8 and 1.6) | Multiplies the tone before quantising. The main tone control. It works on the picture as stored rather than on reconstructed light, which is deliberate and is explained in the notes, and it means this behaves like an ordinary brightness rather than like a stop of exposure. |
| `contrast` | number | `1.15` | 0.2 to 4 (looks right between 0.9 and 1.8) | Pushes tone away from the midpoint before quantising. A photograph with a narrow range gives a picture that is all one grain size, and this is what opens it out. Past about 2.5 the midtones are gone and you have a stencil. |
| `swell` | number | `0.05` | 0 to 0.5 (looks right between 0.03 and 0.12) | How far the exposure swells over the period. Small. Animated error diffusion boils, because the error propagates and one flipped pixel changes everything downstream of it, so whole runs of grain reorganise at once. At 0.3 it is static. At 0 it holds still and the item draws one frame and stops. |
| `period` | number | `4` | 2 to 60 s (looks right between 8 and 24) | Seconds for one swell. The loop closes exactly on it. Long, for the same reason the swell is small: slow, the boil reads as film grain on a plate that is breathing, which is the one kind of motion this technique is any good at. |
| `serpentine` | boolean | `true` | `true` · `false` | Scan alternate rows backwards. Always going left to right drags the error one way and a smooth gradient comes out with diagonal streaks running down and to the right. Turn it off once on a sky: the streaks are not subtle, and they are the reason this option exists rather than being hard-coded. |
| `rate` | number | `8` | 0.5 to 60 hz (looks right between 5 and 12) | How many times a second the dither is recomputed. Every other frame redraws the plate it already has, which is one scaled drawImage and costs nothing. This is the option that lets the dots be fine, because the pass is expensive and running it eight times a second instead of sixty is near enough an eighth of the work. It is also what a one-bit display did: a Macintosh did not re-dither its screen sixty times a second, the bitmap sat there until something changed it. And it is what stops the boil reading as television static. |
| `reducedMotionTime` | number | `0` | 0 to 60 s | The single frame shown when the user prefers reduced motion. Any time works here: the swell is the only thing that moves and the picture is the point, so this is just a choice of exposure. |
| `maxDpr` | number | `2` | 1 to 3 | Device pixel ratio ceiling. It changes how crisply a dot's edges land on the display, not how many dots there are: the grid is measured in CSS pixels so the picture is the same picture on any screen. |

## 5. So it runs on the CPU, and not at the frame rate

The look is coarse anyway. A Macintosh screen was 512 by 342 for the entire
desktop. But coarse does not mean *big*: the first version of this item shipped
with a six-pixel dot and it was mush, big soft squares with the subject lost in
them. A three-pixel dot is a legible one-bit photograph, which is the point.

The reason it shipped wrong is worth stating, because it is the kind of mistake
that is easy to make and hard to notice. The pass costs four times as much each
time the dot halves, and at sixty frames a second a three-pixel dot was
unaffordable. So the dot got coarser to fit the budget, which is solving the
wrong problem.

**The fix is that the dither does not run at the frame rate.** Time is
quantised to `rate` steps a second and the pass only runs when the step
changes. Every other frame redraws the plate it already has, which is one
scaled `drawImage` and costs 0.003ms. Three things come out of that:

- **The dots can be as fine as they should be.** Eight passes a second instead
  of sixty is near enough an eighth of the work, so a three-pixel dot now costs
  less than a six-pixel one used to.
- **It is what a one-bit display did.** A Macintosh did not re-dither its screen
  sixty times a second. The bitmap sat there until something changed it.
- **The boil stops being static.** See below.

It is still pure in `t`, because the step is a function of `t` alone, so the
recorder seeks to the same frame every time.

Measured in the page at 1280 by 720: the pass is 12.6ms at `dot: 2`, 4.8 at 3,
2.7 at 4, 1.2 at 6. At `dot: 2` that is a dropped frame every time it runs,
which is why 3 is the default and 2 is the edge rather than the aim.

## 6. The three things everybody gets wrong

**Do not dither in linear light.** This is a trap, and the first version of
this item fell straight into it.

The argument for linear is good as far as it goes. A half-and-half field of
black and white dots averages, in the eye, to half the light, and light adds
linearly. So convert the picture out of its gamma encoding, dither there, and
the dots reproduce the scene's actual luminance.

They do, and it comes out far too dark. A mid grey is 128, which is 0.50
encoded and 0.22 linear, so dithering in linear lays down 22 per cent white
dots where the photograph says 50 per cent grey. Most of the frame goes solid,
and the first render here had two thirds of the picture as flat ink.

The flaw in the argument is that **a photograph is not a scene**. It has
already been tone-mapped for a display, and the display's own gamma is what
turns it back into light. Undoing that encoding and dithering underneath it
undoes the tone mapping with it. The quantity to preserve is the one the
picture is stored in, which is why every implementation since 1976 works on the
bytes as they come, and why this one does too.

**Atkinson throws a quarter of the error away.** Floyd and Steinberg pass all of
it, over four neighbours. Atkinson passes six eighths over six, and the missing
two eighths is not an oversight. Losing error pulls flat areas towards whichever
tone they were nearest, so highlights go clean white and shadows go clean black.
That is the whole reason the Macintosh look reads as contrasty rather than as a
field of grey speckle. Switch to `floyd` and the picture holds more midtone and
goes noticeably greyer and flatter.

**Scan alternate rows backwards.** Always going left to right drags the error
one way, and in a smooth gradient that comes out as diagonal streaks running
down and to the right. A serpentine scan cancels the drag. The kernel has to be
mirrored with it, so a backwards row pushes its error the way it is travelling
rather than back over ground it has already covered.

Turn `serpentine` off once, on a sky. The streaks are not subtle, and that is
why it is an option rather than hard-coded.

## 7. What moves, and why slowly

The exposure swells, a whole number of cycles over the period, so the loop
closes.

That is enough and more than enough, because **animated error diffusion boils**.
The error propagates, so lifting the exposure by a hair flips one pixel, which
changes what every pixel after it inherits, and whole runs of grain reorganise
at once. Fast, it looks like television static. Slow, it looks like film grain
on a plate that is breathing, which is the one kind of motion this technique is
any good at.

`rate` is the other half of it. At sixty passes a second the boil is television
static; at eight it reads as grain. Lower the rate and raise the swell for
something that looks like a plate being developed, but keep both modest: this
technique has one good kind of motion and it is subtle.

`swell: 0` holds it still, and then the item draws one frame and stops.

## 8. No WebGL context

This is a 2D canvas. It is the one image item here that costs nothing against
the sixteen-million-pixel budget, so it can sit on a page beside a shader
without competing with it for the one live context.

## 9. Two details in the sampling

**The source goes through a canvas the size of the grid**, so the browser's own
downscaler does the averaging. Taking one source pixel per dot instead aliases
badly: a picture of foliage comes back as noise rather than as tone, and no
amount of tuning the dither recovers it.

**Image smoothing is off for the scale-up.** With it on, the browser
interpolates the two tones back into the greys the dither existed to avoid, and
you get a slightly noisy photograph instead of a one-bit picture.

## 10. Choosing a picture

One with real tone in it: a long soft gradient somewhere, a sky, a wall in
raking light, skin.

Error diffusion is about tone, and a gradient is both where the grain organises
itself into something that follows the subject and where every mistake shows.
The diagonal streaking is invisible on foliage and unmissable on a sky, and so
is the shadow crush you get from dithering in gamma-encoded light.

## 11. Accessibility. Do not skip this

The alt text on the `<img>` is the accessible version of the picture and it is
left exactly as written. Write it as you would for the photograph, because that
is what the reader is being told about. There is nothing in the canvas for
assistive technology, by design.

Under reduced motion the loop never starts and one frame is drawn, the one at
`reducedMotionTime`. Which frame hardly matters: the swell is the only thing
that moves, so it is a choice of exposure and nothing else.

## 12. Cleanup and SSR

`destroy()` cancels the RAF, disconnects the observers, removes every listener
and puts the image's visibility back. There is no WebGL context to release,
because this item never takes one.

The photograph renders on the server as an ordinary `<img>`, which is the whole
fallback: if the script never runs, the page shows the picture.

## 13. The three mistakes most likely to be made here

1. **Converting to linear light first.** It is the physically principled thing
   to do and it is wrong, because the picture has already been tone-mapped. It
   comes out far too dark and it looks like an exposure problem, which sends
   you to the exposure control instead of to the cause.

2. **Shipping an ordered dither and calling it a dither.** It is the only kind a
   shader can do, and it lies across the picture rather than in it.

3. **Scanning every row the same way.** The error drags, and a smooth sky comes
   out with diagonal streaks in it.

4. **Forgetting to mirror the kernel on a backwards row.** The scan reverses and
   the error keeps being pushed right, so the serpentine makes the streaking
   worse rather than better.

5. **Leaving image smoothing on.** The two tones are interpolated back into
   greys and the whole thing is for nothing.

6. **Animating it quickly.** Error diffusion boils, and at speed it is
   television static.

7. **Running it at device resolution.** One dot per pixel is thirty times the
   work, and it does not look like a dither any more because the dots are below
   the size at which you can see them.

---

Concept credit: Error diffusion and its kernels are from the printing and computer-graphics literature: Floyd and Steinberg's 1976 paper, and Bill Atkinson's variant written for the Macintosh. The observation that it cannot be a fragment shader, and what to do about that, are this item's own, by Robert Floyd and Louis Steinberg, https://en.wikipedia.org/wiki/Floyd%E2%80%93Steinberg_dithering.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
