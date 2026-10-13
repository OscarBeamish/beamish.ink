/*
 * InfiniteTube: Beamish
 * https://beamish.ink/effects/infinite-tube
 *
 * Flying through the inside of a tube that has no end.
 *
 * The idea is from a Codrops article by Louis Hoebregts, credited in
 * meta.json: build a tube along a curve, turn the material inside out so you
 * see its far wall, and put the camera inside it.
 *
 * WHY IT IS A CLOSED LOOP AND NOT AN ENDLESS ONE
 *
 * The usual way to make the flight endless is to scroll the texture along the
 * tube a little further every frame. That is a running total, and a running
 * total is the one thing an effect here may not keep: `renderAtTime(t)` has to
 * answer for any moment on its own, so the recorder can seek.
 *
 * So the tube is a closed curve instead. It comes back to where it started,
 * the camera goes round it, and after one lap everything is exactly as it was.
 * The flight has no end because the road has no end, rather than because a
 * counter keeps going up. That also makes the loop perfect for free: there is
 * nothing to line up, because the last frame IS the first frame.
 *
 * WHAT MAKES IT READ AS SPEED
 *
 * Three things, none of which is the speed.
 *
 *   The tube has to bend. A straight one gives you a stationary circle with a
 *   pattern sliding down it, which reads as a screensaver. Corners coming at
 *   you are what sells the movement, and they are also what makes the far end
 *   disappear and reappear.
 *
 *   The camera looks AHEAD along the curve rather than at a fixed point, so
 *   going into a bend swings the view the way a car does.
 *
 *   It has to go dark in the distance. Without that you can see the whole
 *   tube, there is nothing to arrive out of, and the corners stop mattering.
 *
 * The wall is drawn by a shader rather than a texture, so there is no image to
 * fetch and the rings stay sharp whatever the resolution.
 */

import * as THREE from 'three'
import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type InfiniteTubeOptions = BaseOptions & {
  /** Seconds for one lap of the loop. */
  period: number
  /** How wide the tube is. */
  radius: number
  /** How many bends the loop has. */
  bends: number
  /** How far the bends swing off the straight. */
  sway: number
  /** Rings down the length of the tube. */
  rings: number
  /** Lines running around it. */
  spokes: number
  /** How thick the lines are drawn, 0 to 1 of the gap between them. */
  weight: number
  /** How far down the tube you can see before it goes dark. */
  reach: number
  /** The wall between the lines. */
  wall: string
  /** The lines themselves. */
  line: string
  /** How wide an angle the camera takes in, in degrees. */
  lens: number
  /** Seed for the shape of the loop. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const infiniteTubeDefaults: InfiniteTubeOptions = {
  period: 12,
  radius: 2.6,
  bends: 7,
  sway: 11,
  rings: 300,
  spokes: 16,
  weight: 0.045,
  reach: 20,
  wall: '#0a0a12',
  line: '#5de4ff',
  lens: 78,
  seed: 4,
  maxDpr: 2,
  reducedMotionTime: 3
}

/** A small deterministic generator, so a seed always gives the same loop. */
function rng(seed: number): () => number {
  let s = (seed | 0) >>> 0
  if (s === 0) s = 1
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

const VERT = `
varying vec2 vUv;
varying float vDepth;

void main() {
  vUv = uv;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  /* Distance from the camera, which is what the wall fades on. */
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

const FRAG = `
precision highp float;

varying vec2 vUv;
varying float vDepth;

uniform vec3  u_wall;
uniform vec3  u_line;
uniform float u_rings;
uniform float u_spokes;
uniform float u_weight;
uniform float u_reach;

/*
 * One line, drawn as a band around the nearest multiple of its spacing.
 *
 * Widened by one pixel of its own gradient, which is what keeps a ring a
 * hairline when it is close and still visible when it is a hundred units away
 * and squeezed into nothing. Without it the far end of the tube turns into a
 * field of moire.
 */
float rule(float coord, float count, float weight) {
  float at = coord * count;
  /* Distance to the NEAREST line, which is zero on one and a half a spacing
     away midway between two. Measuring the distance to the midpoint instead
     draws the gaps and leaves the lines blank, which is a quick way to end up
     with a bright tube and dark rings. */
  float d = 0.5 - abs(fract(at) - 0.5);
  float w = max(fwidth(at), 0.0001);
  return 1.0 - smoothstep(weight - w, weight + w, d);
}

void main() {
  float rings = rule(vUv.x, u_rings, u_weight);
  float spokes = rule(vUv.y, u_spokes, u_weight);
  float ink = max(rings, spokes);

  vec3 colour = mix(u_wall, u_line, ink);

  /*
   * Into the dark. Squared, so the fade starts gently and then takes
   * everything: a linear one leaves a visible grey disc at the far end that
   * reads as the tube being capped.
   */
  float far = clamp(vDepth / max(u_reach, 0.001), 0.0, 1.0);
  colour *= 1.0 - far * far;

  gl_FragColor = vec4(colour, 1.0);
}
`

class InfiniteTubeSurface implements Surface<InfiniteTubeOptions> {
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private mesh: THREE.Mesh | null = null
  private material: THREE.ShaderMaterial | null = null
  private curve: THREE.CatmullRomCurve3 | null = null
  private builtFor = ''

  private at = new THREE.Vector3()
  private ahead = new THREE.Vector3()

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('InfiniteTube needs a canvas')
    const renderer = new THREE.WebGLRenderer({ canvas: ctx.canvas, antialias: true })
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(78, 1, 0.1, 400)
    scene.add(camera)

    this.renderer = renderer
    this.scene = scene
    this.camera = camera
  }

  resize(size: { pixelWidth: number; pixelHeight: number }): void {
    this.renderer?.setSize(size.pixelWidth, size.pixelHeight, false)
    const camera = this.camera
    if (camera) {
      camera.aspect = size.pixelWidth / Math.max(size.pixelHeight, 1)
      camera.updateProjectionMatrix()
    }
  }

  /*
   * The loop, and the tube wrapped round it.
   *
   * The curve is closed, which is the whole trick: CatmullRomCurve3 with
   * `closed` joins the last point back to the first with the same smoothness
   * as every other join, so there is no seam to fly through.
   *
   * Points are placed round a circle and then pushed about by the seed, so the
   * loop is always a loop and never ties itself in a knot. Scattering them
   * freely was the first attempt and roughly one seed in three produced a
   * curve that passed through itself, which from the inside is a wall.
   */
  private build(opts: InfiniteTubeOptions): void {
    const scene = this.scene
    if (!scene) return

    const bends = Math.max(3, Math.round(opts.bends))
    const key = [bends, opts.sway, opts.radius, opts.seed].join('/')
    if (key === this.builtFor) return

    if (this.mesh) {
      scene.remove(this.mesh)
      this.mesh.geometry.dispose()
    }

    const random = rng(opts.seed)
    const points: THREE.Vector3[] = []
    const ring = 26
    for (let i = 0; i < bends; i++) {
      const a = (i / bends) * Math.PI * 2
      points.push(
        new THREE.Vector3(
          Math.cos(a) * ring + (random() - 0.5) * opts.sway,
          (random() - 0.5) * opts.sway,
          Math.sin(a) * ring + (random() - 0.5) * opts.sway
        )
      )
    }

    const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.5)
    const geometry = new THREE.TubeGeometry(curve, bends * 28, opts.radius, 24, true)

    const material =
      this.material ??
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        /* Inside out, because the camera is in here and what you need to see
           is the far wall rather than the outside of the pipe. */
        side: THREE.BackSide,
        uniforms: {
          u_wall: { value: new THREE.Color(opts.wall) },
          u_line: { value: new THREE.Color(opts.line) },
          u_rings: { value: opts.rings },
          u_spokes: { value: opts.spokes },
          u_weight: { value: opts.weight },
          u_reach: { value: opts.reach }
        }
      })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    scene.add(mesh)

    this.mesh = mesh
    this.material = material
    this.curve = curve
    this.builtFor = key
  }

  render(t: number, opts: InfiniteTubeOptions): void {
    const renderer = this.renderer
    const scene = this.scene
    const camera = this.camera
    if (!renderer || !scene || !camera) return
    this.build(opts)

    const curve = this.curve
    const material = this.material
    if (!curve || !material) return

    material.uniforms['u_wall']!.value.set(opts.wall)
    material.uniforms['u_line']!.value.set(opts.line)
    material.uniforms['u_rings']!.value = Math.max(1, opts.rings)
    material.uniforms['u_spokes']!.value = Math.max(1, opts.spokes)
    material.uniforms['u_weight']!.value = Math.min(Math.max(opts.weight, 0), 0.49)
    material.uniforms['u_reach']!.value = Math.max(opts.reach, 0.1)

    if (camera.fov !== opts.lens) {
      camera.fov = opts.lens
      camera.updateProjectionMatrix()
    }

    /*
     * Where on the loop we are. `fract` rather than a running total, so any
     * `t` can be asked for directly and one lap is one period exactly.
     */
    const where = ((t / Math.max(opts.period, 0.001)) % 1 + 1) % 1

    /*
     * `getPointAt` rather than `getPoint`: the first is spaced by distance
     * along the curve and the second by the parameter, and on a curve whose
     * segments are not the same length the parameter version speeds up and
     * slows down on its own. That reads as the tube breathing.
     */
    curve.getPointAt(where, this.at)
    curve.getPointAt((where + 0.012) % 1, this.ahead)

    camera.position.copy(this.at)
    camera.lookAt(this.ahead)

    renderer.render(scene, camera)
  }

  context(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return this.renderer?.getContext() ?? null
  }

  teardown(): void {
    if (this.mesh) {
      this.scene?.remove(this.mesh)
      this.mesh.geometry.dispose()
    }
    this.material?.dispose()
    this.renderer?.dispose()
    this.renderer = null
    this.scene = null
    this.camera = null
    this.mesh = null
    this.material = null
    this.curve = null
    this.builtFor = ''
  }
}

/**
 * Mount InfiniteTube into `el`.
 *
 * ```ts
 * const tube = createInfiniteTube(document.querySelector('#hero')!)
 * tube.start()
 * // …later
 * tube.destroy()
 * ```
 */
export function createInfiniteTube(
  el: HTMLElement,
  opts: Partial<InfiniteTubeOptions> = {}
): EffectHandle {
  return mount<InfiniteTubeOptions>(el, opts, {
    defaults: infiniteTubeDefaults,
    create: () => new InfiniteTubeSurface()
  })
}

export default createInfiniteTube
