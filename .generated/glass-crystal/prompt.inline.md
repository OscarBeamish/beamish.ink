You are adding **GlassCrystal** from Beamish to this project.

> A cut solid of glass turning in front of the page, refracting what is behind it. Backdrops · effect · MIT.
> https://beamish.ink/effects/glass-crystal

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.163.0`
- WebGL2. There is no WebGL1 fallback
- Transmission renders the scene behind the object into a buffer and refracts that buffer, so what you see through the solid is really what is behind it. It is not a blur, a frosted overlay or a rainbow texture, and none of those three can be made to bend a straight line the way this does.
- dispersion arrived in three 0.163. On an older copy the property is simply ignored: the glass still works and the colour at the edges disappears, with no error to tell you why, which is why the peer range starts there rather than at 0.160 like the rest of the three.js items.
- The environment is built at runtime rather than loaded. Transmission has to have something to reflect or the glass returns a grey blob, and the usual answer is an HDR file, which is a megabyte of asset and a network request for an effect that is otherwise two files. Four emissive planes are rendered into a cube and prefiltered through PMREMGenerator instead: a key, a fill opposite it, a soft top and a dark floor, which is a lighting setup rather than a photograph of a room.
- Tone mapping is on, which is unusual in this library. Transmission plus a specular off a bright environment goes well past 1 on the highlights, and without a curve those clip to flat white discs that read as holes punched in the glass rather than as light on it.
- Flat shading at detail 0 is what makes it read as cut rather than blown, and it needs per-face normals, which three only computes on a non-indexed geometry.
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/glass-crystal/core.ts`**

```ts
/*
 * GlassCrystal: Beamish
 * https://beamish.ink/effects/glass-crystal
 *
 * A solid of glass turning slowly in front of the page.
 *
 * Real transmission rather than a fake. `MeshPhysicalMaterial` with
 * `transmission` renders the scene behind the object into a buffer and refracts
 * it, so what you see through the crystal is actually what is behind it, bent.
 * `dispersion` splits that by wavelength, which is where the colour at the
 * edges comes from: there is no rainbow texture anywhere in here.
 *
 * Two things that are easy to get wrong and both are about what is behind it.
 *
 * Transmission needs an environment map or the glass has nothing to reflect and
 * comes back as a grey blob. This one is built rather than loaded: a handful of
 * emissive planes are rendered into a cube and run through PMREMGenerator, so
 * there is no HDR file to ship and nothing to wait for.
 *
 * And refraction needs something to refract. Glass over a flat colour has
 * nothing to bend and reads as a smudge, which is the same thing that makes
 * glass in a flat interface fall flat. So there is a ruled sheet behind the
 * crystal: a bend is only visible as the displacement of something straight,
 * and a rule is the cheapest straight thing there is. Put your own content
 * behind it instead and it will bend that.
 *
 * Exactly periodic. One turn and one rise per `period`, so `renderAtTime` is
 * pure in `t` and the recorder gets a loop that closes.
 */

import * as THREE from 'three'
import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type GlassCrystalOptions = BaseOptions & {
  /** The page behind the glass. */
  paper: string
  /** The tint the glass leaves on what passes through it. */
  glass: string
  /** The warm light. One of two the environment is built from. */
  key: string
  /** The cool light, opposite it. */
  fill: string
  /** Faces. 0 is twenty flat ones, higher rounds it off. */
  detail: number
  /** How large the solid is in the frame. */
  size: number
  /** How much glass the light has to travel through. */
  thickness: number
  /** Refractive index. 1.0 is air, 1.5 is window glass, 2.4 is diamond. */
  ior: number
  /** How far the colours separate at the edges. */
  dispersion: number
  /** Frosting. 0 is polished. */
  roughness: number
  /** Thin-film colour on the surface, the way oil on water goes. */
  iridescence: number
  /** Rules across the sheet behind the glass. This is what the bending shows. */
  rules: number
  /** How dark those rules are. */
  ruleWeight: number
  /** How far it rises and falls over a period. */
  drift: number
  /** Seconds for one turn. Exactly periodic over this. */
  period: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const glassCrystalDefaults: GlassCrystalOptions = {
  paper: '#fbfaf4',
  glass: '#f4f7fb',
  key: '#ffd9a8',
  fill: '#bcd4ff',
  detail: 0,
  size: 1.5,
  thickness: 1.1,
  ior: 1.46,
  dispersion: 1.6,
  roughness: 0.04,
  iridescence: 0.3,
  rules: 16,
  ruleWeight: 0.45,
  drift: 0.12,
  period: 44,
  reducedMotionTime: 7
}

const TAU = Math.PI * 2

class GlassCrystalSurface implements Surface<GlassCrystalOptions> {
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private crystal: THREE.Mesh | null = null
  private material: THREE.MeshPhysicalMaterial | null = null
  private backdrop: THREE.Mesh | null = null
  private backdropMaterial: THREE.ShaderMaterial | null = null
  private pmrem: THREE.PMREMGenerator | null = null
  private environment: THREE.Texture | null = null
  private builtFor = ''
  private colour = new THREE.Color()

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('Crystal needs a canvas')

    const renderer = new THREE.WebGLRenderer({
      canvas: ctx.canvas,
      antialias: true,
      alpha: false,
      // The recorder reads pixels back after the draw, and without this the
      // buffer may already have been cleared.
      preserveDrawingBuffer: true,
      powerPreference: 'low-power'
    })
    // The runtime owns sizing and has already capped DPR.
    renderer.setPixelRatio(1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    /*
     * Tone mapping on, which is unusual for this library. Transmission plus a
     * specular off a bright environment goes well past 1 on the highlights, and
     * without a curve those clip to flat white discs that read as holes in the
     * glass rather than as light on it.
     */
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
    camera.position.set(0, 0, 9)

    /*
     * The sheet behind. Refraction needs something to refract, and this is the
     * part the effect lives or dies on.
     *
     * It used to be a wash and one hairline rule, and the result measured as a
     * luminance range of 2 out of 255 inside the solid: a grey lump on a pale
     * page. Not because the glass was wrong. Turning transmission off made the
     * solid MORE varied, not less, which is the proof that it was refracting
     * correctly and that what it was refracting had nothing in it. A bend is
     * only visible as the displacement of something straight.
     *
     * So the sheet is ruled, like a page. Rules are the one pattern that makes
     * refraction legible, because a straight line is where the eye can read a
     * few pixels of displacement, and they are already the house vernacular
     * rather than a texture borrowed to fill the gap.
     */
    const backdropMaterial = new THREE.ShaderMaterial({
      uniforms: {
        u_paper: { value: new THREE.Color('#fbfaf4') },
        u_warm: { value: new THREE.Color('#ffd9a8') },
        u_rules: { value: 16 },
        u_weight: { value: 0.45 }
      },
      vertexShader: /* glsl */ `
        varying vec2 v_uv;
        void main() {
          v_uv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 u_paper;
        uniform vec3 u_warm;
        uniform float u_rules;
        uniform float u_weight;
        varying vec2 v_uv;
        void main() {
          // A soft wash from one corner, so the sheet is not flat either.
          float wash = smoothstep(1.3, -0.2, v_uv.x + v_uv.y);
          vec3 col = mix(u_paper, mix(u_paper, u_warm, 0.55), wash * 0.5);

          /*
           * Ruled, and antialiased against the rule spacing rather than against
           * a fixed width. The sheet is scaled to cover the frame at its own
           * depth, so a width in UV is a different width in pixels on every
           * viewport; fwidth is the only measure that holds. Without it the
           * rules alias into a moire the moment the frame is not 16:9, and
           * through a refracting solid that moire is what you would see.
           */
          float band = v_uv.y * u_rules;
          float f = fract(band);
          float d = min(f, 1.0 - f);
          float aa = fwidth(band) * 1.5;
          float rule = 1.0 - smoothstep(0.0, aa, d - 0.018);
          col = mix(col, col * (1.0 - u_weight), rule);

          // One heavier rule, so the sheet has a horizon as well as a rhythm.
          float spine = smoothstep(0.0, fwidth(v_uv.y) * 2.5, 0.0015 - abs(v_uv.y - 0.5));
          col = mix(col, col * (1.0 - u_weight * 2.2), spine);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      depthWrite: false
    })
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), backdropMaterial)
    backdrop.position.z = -6
    scene.add(backdrop)

    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.backdrop = backdrop
    this.backdropMaterial = backdropMaterial
    this.pmrem = new THREE.PMREMGenerator(renderer)
    this.pmrem.compileEquirectangularShader()
  }

  /*
   * The environment, built rather than loaded.
   *
   * Transmission has to have something to reflect or the glass is a grey blob,
   * and the usual answer is an HDR file, which is a megabyte of asset and a
   * network request for an effect that is otherwise two files. These are four
   * emissive planes in a scene of their own, rendered into a cube and
   * prefiltered: a key, a fill opposite it, a soft top and a dark floor, which
   * is a lighting setup rather than a photograph of a room.
   */
  private buildEnvironment(opts: GlassCrystalOptions): void {
    const renderer = this.renderer
    const scene = this.scene
    const pmrem = this.pmrem
    if (!renderer || !scene || !pmrem) return

    const key = `${opts.key}|${opts.fill}|${opts.paper}`
    if (key === this.builtFor) return
    this.builtFor = key

    const room = new THREE.Scene()
    const panel = (colour: string, intensity: number, w: number, h: number, pos: THREE.Vector3) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(colour).multiplyScalar(intensity) })
      )
      mesh.position.copy(pos)
      mesh.lookAt(0, 0, 0)
      room.add(mesh)
    }

    room.background = new THREE.Color(opts.paper)
    panel(opts.key, 4.2, 9, 5, new THREE.Vector3(-6, 1.5, 3))
    panel(opts.fill, 2.4, 8, 5, new THREE.Vector3(6, -1, 2.5))
    panel('#ffffff', 2.0, 10, 3, new THREE.Vector3(0, 6, 1))
    panel('#241f1a', 1.0, 10, 4, new THREE.Vector3(0, -5, 1))

    const built = pmrem.fromScene(room, 0.04)
    this.environment?.dispose()
    this.environment = built.texture
    scene.environment = built.texture

    room.traverse(node => {
      if (node instanceof THREE.Mesh) {
        node.geometry.dispose()
        ;(node.material as THREE.Material).dispose()
      }
    })
    room.clear()
  }

  private buildCrystal(opts: GlassCrystalOptions): void {
    const scene = this.scene
    if (!scene) return

    const detail = Math.max(0, Math.round(opts.detail))
    if (this.crystal && this.crystal.userData['detail'] === detail) return

    if (this.crystal) {
      this.crystal.geometry.dispose()
      scene.remove(this.crystal)
    }

    const geometry = new THREE.IcosahedronGeometry(1, detail)
    /*
     * Flat shading at detail 0, which is what makes it read as cut rather than
     * blown. The normals have to be recomputed per face for that, and three
     * only does it when the geometry is not indexed.
     */
    if (detail === 0) geometry.computeVertexNormals()

    const material =
      this.material ??
      new THREE.MeshPhysicalMaterial({
        transmission: 1,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        // The glass is not a solid colour, it is what it leaves on the light
        // that passes through. attenuation is the honest place for that.
        attenuationDistance: 6
      })

    const crystal = new THREE.Mesh(geometry, material)
    crystal.userData['detail'] = detail
    scene.add(crystal)

    this.crystal = crystal
    this.material = material
  }

  resize(size: { pixelWidth: number; pixelHeight: number; dpr: number }): void {
    const renderer = this.renderer
    const camera = this.camera
    if (!renderer || !camera) return
    renderer.setSize(size.pixelWidth, size.pixelHeight, false)
    camera.aspect = size.pixelWidth / Math.max(size.pixelHeight, 1)
    camera.updateProjectionMatrix()

    /*
     * The sheet is sized to fill the frame at its own depth, so it covers the
     * view whatever shape the element is. Worked out from the camera rather
     * than guessed at, which is the only way it stays covered on a tall phone.
     */
    if (this.backdrop) {
      const distance = this.backdrop.position.z - camera.position.z
      const height = 2 * Math.tan((camera.fov * Math.PI) / 360) * Math.abs(distance)
      this.backdrop.scale.set(height * camera.aspect, height, 1)
    }
  }

  render(t: number, opts: GlassCrystalOptions): void {
    const renderer = this.renderer
    const scene = this.scene
    const camera = this.camera
    if (!renderer || !scene || !camera) return

    this.buildEnvironment(opts)
    this.buildCrystal(opts)

    const material = this.material
    const crystal = this.crystal
    if (!material || !crystal) return

    renderer.setClearColor(this.colour.set(opts.paper), 1)

    if (this.backdropMaterial) {
      ;(this.backdropMaterial.uniforms['u_paper']!.value as THREE.Color).set(opts.paper)
      ;(this.backdropMaterial.uniforms['u_warm']!.value as THREE.Color).set(opts.key)
      this.backdropMaterial.uniforms['u_rules']!.value = Math.max(opts.rules, 0)
      this.backdropMaterial.uniforms['u_weight']!.value = opts.ruleWeight
    }

    material.color.set('#ffffff')
    material.attenuationColor.set(opts.glass)
    material.thickness = opts.thickness
    material.ior = opts.ior
    material.dispersion = opts.dispersion
    material.roughness = opts.roughness
    material.iridescence = opts.iridescence
    material.iridescenceIOR = 1.4
    material.flatShading = Math.round(opts.detail) === 0

    /*
     * One turn and one rise per period, so the loop closes exactly. The two
     * axes are whole multiples of the same phase for the same reason: a turn
     * of 1.0 against a turn of 0.6 never comes back to where it started, which
     * is how a pair of effects in this library shipped with a seam.
     */
    const phase = TAU * (t / Math.max(opts.period, 0.001))
    crystal.rotation.set(phase * 0.5, phase, 0)
    crystal.position.y = Math.sin(phase) * opts.drift
    crystal.scale.setScalar(opts.size)

    renderer.render(scene, camera)
  }

  context(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return this.renderer?.getContext() ?? null
  }

  teardown(): void {
    if (this.crystal) {
      this.crystal.geometry.dispose()
      this.crystal = null
    }
    this.material?.dispose()
    this.backdrop?.geometry.dispose()
    this.backdropMaterial?.dispose()
    this.environment?.dispose()
    this.pmrem?.dispose()
    this.scene?.clear()
    this.renderer?.dispose()
    this.renderer = null
    this.scene = null
    this.camera = null
    this.material = null
    this.backdrop = null
    this.backdropMaterial = null
    this.environment = null
    this.pmrem = null
    this.builtFor = ''
  }
}

/**
 * Mount GlassCrystal into `el`. The element needs a size, in CSS, not just
 * content.
 *
 * ```ts
 * const crystal = createGlassCrystal(document.querySelector('#hero')!)
 * crystal.start()
 * ```
 */
export function createGlassCrystal(
  el: HTMLElement,
  opts: Partial<GlassCrystalOptions> = {}
): EffectHandle {
  return mount<GlassCrystalOptions>(el, opts, {
    defaults: glassCrystalDefaults,
    create: () => new GlassCrystalSurface()
  })
}

export default createGlassCrystal
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

GlassCrystal is a cut solid of glass turning slowly in front of the page, with
what is behind it genuinely bent through it rather than blurred.

## 3. Wire it in

**Plain HTML.** The element is a container; the effect fills it.

```html
<div id="stage" style="position: relative; height: 70vh"></div>

<script type="module">
  import { createGlassCrystal } from './beamish/effects/glass-crystal/core.js'

  const crystal = createGlassCrystal(document.querySelector('#stage'))
  crystal.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createGlassCrystal } from '@/beamish/effects/glass-crystal/core'

export function Crystal() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const crystal = createGlassCrystal(host.current, { rules: 16 })
    crystal.start()
    return () => crystal.destroy()
  }, [])

  return <div ref={host} style={{ position: 'relative', height: '70vh' }} />
}
```

**Vue.** The component takes the same options as props.

**Astro.** Nothing extra is required. The core is a standard ES module.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `paper` | color | `#fbfaf4` | any CSS hex | The page behind the glass, and the colour the frame is cleared to. The sheet that gets refracted is built from this, so it sets what the solid is full of. |
| `glass` | color | `#f4f7fb` | any CSS hex | The tint the glass leaves on light that passes through it. This is an attenuation colour, not a surface colour: it is what a given thickness of the material takes out, so the tint deepens where the solid is thick and all but disappears at a thin edge. Setting the surface colour instead paints the object, which is what makes stage-prop glass look like coloured plastic. |
| `key` | color | `#ffd9a8` | any CSS hex | The warm light, one of the two the environment is built from, and the wash on the sheet behind. Warm against a cool fill is what gives the solid two different colours to catch on opposite faces, which is most of what stops it reading as a grey lump. |
| `fill` | color | `#bcd4ff` | any CSS hex | The cool light, opposite the key. Equal to the key in brightness and opposite it in hue is the safe setting; pushing them together flattens the solid. |
| `detail` | number | `0` | 0 to 3 (looks right between 0 and 1) | Faces. 0 is a twenty-sided solid with flat shading, which is the cut gem. Each step up quadruples the faces and rounds it off, and by 3 it is a glass ball, which is a less interesting object and a more expensive one. |
| `size` | number | `1.5` | 0.4 to 3 (looks right between 1.1 and 2) | How large the solid is in the frame. Past about 2.2 it reaches the edges and stops being an object on a page. |
| `thickness` | number | `1.1` | 0 to 5 (looks right between 0.6 and 2) | How much glass the light is treated as travelling through, which is what the tint and the bending are scaled by. At 0 it is a soap bubble: a surface with nothing inside it. |
| `ior` | number | `1.46` | 1 to 2.4 (looks right between 1.3 and 1.8) | Refractive index, and the one number here that is a physical quantity rather than a taste. 1.0 is air and bends nothing, 1.5 is window glass, 2.4 is diamond. Above about 1.9 the solid stops transmitting the page and starts mirroring the environment, which is the right look for a gem and the wrong one for a backdrop. |
| `dispersion` | number | `1.6` | 0 to 5 (looks right between 0.8 and 2.5) | How far the colours separate at the edges, by refracting red, green and blue at slightly different indices. This is where the colour fringing comes from and there is no rainbow texture anywhere in the effect. At 0 the glass is colourless and noticeably duller. |
| `roughness` | number | `0.04` | 0 to 0.6 (looks right between 0 and 0.15) | Frosting. 0 is polished. Past about 0.2 what is behind the glass stops being legible, which is the whole point of putting it there. |
| `iridescence` | number | `0.3` | 0 to 1 (looks right between 0 and 0.5) | Thin-film colour on the surface, the way oil goes on water. A little reads as a coating on the glass; at 1 it reads as a soap bubble and fights the dispersion for the same job. |
| `rules` | number | `16` | 0 to 64 (looks right between 10 and 28) | Rules across the sheet behind the glass, and the thing the bending is actually visible as. A bend can only be seen as the displacement of something straight, so with no rules the solid is a grey lump however correct the optics are: measured, the shipped version with one hairline rule had a luminance range of 2 out of 255 inside the solid against 26 with these. At 0 the sheet is a plain wash and you get that lump back, which is worth seeing once. |
| `ruleWeight` | number | `0.45` | 0 to 1 (looks right between 0.25 and 0.6) | How dark the rules are, as a fraction taken out of the paper. This is the one dial that changes how much glass you can see, because what reaches you through the solid is a dimmer, averaged copy of what is behind it: the contrast inside tracks this almost linearly and lands at about a fifteenth of the contrast on the open sheet. Past about 0.6 the sheet stops being a backdrop and starts being the subject. |
| `drift` | number | `0.12` | 0 to 1 (looks right between 0.05 and 0.3) | How far it rises and falls over a period, in scene units. One rise and fall per period, so it closes with the turn. At 0 it only turns. |
| `period` | number | `44` | 4 to 120 (looks right between 24 and 60) | Seconds for one turn, and the length of the loop. Both rotation axes and the rise are whole multiples of this same phase, which is what makes the take close exactly. Slow is the point: this is a thing in the corner of a page, not an animation anybody is meant to watch. |

## 5. Real transmission, not a frosted overlay

The usual browser glass is `backdrop-filter: blur()`. That softens what is
behind, which is what frosted glass does, and it is the wrong model for a
solid: a blur cannot displace a straight line, and displacement is the whole
signal that something is being looked through.

This uses `MeshPhysicalMaterial` with `transmission`, which renders the scene
behind the object into a buffer and samples that buffer along a refracted ray.
So the rules on the sheet behind really do step sideways as they cross each
facet, and they step by different amounts on facets at different angles,
because the angle is what the refraction is computed from.

`dispersion` then samples red, green and blue at slightly different indices.
That is where the colour at the edges comes from. There is no rainbow texture
anywhere in this effect, and there is no gradient faking one.

## 6. The thing it is easy to get wrong

**Glass with nothing behind it is a grey lump.** This is worth stating plainly
because the first version of this effect was exactly that, and the optics were
never the problem.

The sheet behind it carried a soft wash and one hairline rule. Measured in the
page, the luminance range inside the solid was **2 out of 255**. It looked
like a smudge, and the instinct is to reach for the glass: raise the
refractive index, raise the dispersion, dim the environment. None of that
moved it.

The proof it was not the glass is a one-line test. **Turn transmission off.**
The solid became *more* varied, not less, going from a range of 2 to 20. That
is only possible if transmission was working and was averaging a flat buffer
into a flat result. The glass was faithfully showing you a blank page.

So the sheet is ruled. With the same optics and nothing else changed, the
range inside the solid went from 2 to **26**.

## 7. A bend is only visible against something straight

That is the general rule and it is worth keeping once you put your own content
behind this. Refraction displaces; displacement is only legible where there
was a known position to be displaced from.

Good things to put behind it: rules, a baseline grid, columns of type, a hard
horizon, anything with edges. Bad things: a photograph of foliage, a soft
gradient, a blurred image, a flat brand colour. Those are the same cases that
make glass in a flat interface fall flat, and for the same reason.

`rules: 0` turns the sheet back into a plain wash, which is the quickest way to
see the grey lump this is built to avoid.

## 8. The environment is built, not loaded

Transmission also needs something to reflect or the material comes back dark.
The usual answer is an HDR file, which is a megabyte of asset and a network
request for an effect that is otherwise two files.

This builds one: four emissive planes in a scene of their own, rendered into a
cube and prefiltered. A key, a fill opposite it, a soft top and a dark floor.
It is a lighting setup rather than a photograph of a room, which is also why
`key` and `fill` are real controls rather than decoration.

It is rebuilt only when one of the colours that defines it changes, keyed on
those colours. Rebuilding it every frame is the mistake that turns a cheap
effect into an expensive one, and nothing on screen tells you it is happening.

## 9. Tuning it

1. **`ruleWeight`.** The one dial that changes how much glass you can see.
   What reaches you through the solid is a dimmer, averaged copy of the sheet,
   so the contrast inside tracks this almost linearly and lands at roughly a
   fifteenth of the contrast on the open sheet. Past about 0.6 the sheet stops
   being a backdrop and becomes the subject.
2. **`ior`.** The one physical quantity here. 1.5 is window glass. Above about
   1.9 the solid stops transmitting the page and starts mirroring the
   environment, which is right for a gem and wrong for a backdrop.
3. **`detail`.** 0 is a twenty-sided solid with flat shading, which is the cut
   gem and the interesting one. By 3 it is a glass ball.
4. **`dispersion`.** The colour at the edges. At 0 the glass is colourless and
   noticeably duller.
5. **`period`.** Slow is the point. This is a thing in the corner of a page,
   not an animation anybody is meant to watch.

## 10. Accessibility. Do not skip this

The solid is decorative and the canvas carries nothing for assistive
technology, by design. Put the real content in the document, not behind the
glass as a texture.

Under reduced motion the loop never starts and one frame is drawn, the one at
`reducedMotionTime`. The solid is simply there, at an angle chosen to show the
facets rather than at whatever angle zero happens to be.

## 11. Cleanup and SSR

`destroy()` releases the WebGL context, the geometry, both materials and the
prefiltered environment, cancels the RAF, disconnects the observers and
removes every listener. One live context at a time is the budget, so call it.

There is nothing to render on the server. The element is empty until the
script runs, so give it a height in CSS or the page will reflow when it
mounts.

## 12. The six mistakes most likely to be made here

1. **Putting nothing behind it.** The failure this effect was rescued from. A
   flat colour, a soft gradient or a blurred photograph gives refraction
   nothing to displace, and no amount of index or dispersion will save it. Put
   something straight back there.

2. **Diagnosing it as the glass.** When it looks like a lump, the instinct is
   to raise `ior` and `dispersion` and dim the environment. Turn `transmission`
   off for one frame instead: if the solid gets *more* varied, the optics were
   fine and the backdrop is empty.

3. **Reaching for `backdrop-filter` instead.** A blur softens, it does not
   displace, so it can never bend a straight line. If what you want is frosted
   glass then a blur is correct and cheaper; if you want a solid, it cannot do
   it at any setting.

4. **Rebuilding the environment every frame.** It is a cube render plus a
   prefilter pass, and nothing on screen tells you it is happening. Key it on
   the colours that define it.

5. **Measuring the rules in UV without `fwidth`.** The sheet is scaled to cover
   the frame at its own depth, so a fixed width in UV is a different width in
   pixels at every viewport, and the rules alias into a moire the moment the
   frame is not 16:9. Through a refracting solid that moire is what you see.

6. **Tinting the surface colour.** Glass is not a colour, it is what a
   thickness of material takes out of the light crossing it. Set
   `attenuationColor` and let `thickness` scale it. Painting the surface is
   what makes stage-prop glass read as coloured plastic.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
