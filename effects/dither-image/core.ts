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
