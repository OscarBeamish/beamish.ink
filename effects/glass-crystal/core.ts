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
 * glass in a flat interface fall flat, so there is a sheet behind the crystal
 * with a gradient and a rule on it. Put your own content behind it instead and
 * it will bend that.
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
     * The sheet behind. Refraction needs something to refract: over a flat
     * colour the glass has nothing to bend and comes back as a smudge.
     *
     * A gradient and one rule, which is enough structure to read as bent
     * without being a pattern anybody looks at.
     */
    const backdropMaterial = new THREE.ShaderMaterial({
      uniforms: {
        u_paper: { value: new THREE.Color('#fbfaf4') },
        u_warm: { value: new THREE.Color('#ffd9a8') }
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
        varying vec2 v_uv;
        void main() {
          // A soft wash from one corner, and a single rule across the middle.
          float wash = smoothstep(1.3, -0.2, v_uv.x + v_uv.y);
          vec3 col = mix(u_paper, mix(u_paper, u_warm, 0.55), wash * 0.5);
          float rule = smoothstep(0.004, 0.0, abs(v_uv.y - 0.5));
          col = mix(col, col * 0.88, rule * 0.5);
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
