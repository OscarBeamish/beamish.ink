/*
 * PointerLitBusts: Beamish
 * https://beamish.ink/effects/pointer-lit-busts
 *
 * Three helmeted busts in a dark room, and the cursor is the lamp. Move it and
 * the forms turn: a cheekbone catches, a visor goes black, the one at the back
 * comes out of the dark for a moment and goes again.
 *
 * The forms are generated here rather than loaded. There is no model file,
 * which is the point: a prompt in this library hands over source, and a
 * decimated head scan is several megabytes of binary that cannot be read,
 * reviewed or tuned. Built from a lathe profile and three primitives, the
 * whole cast is a few hundred bytes of numbers and every part of it can be
 * changed by somebody who has never opened a 3D tool.
 *
 * Three things carry it, and the first is the one that separates this from a
 * flashlight cursor.
 *
 * The light moves in the world, on a plane in front of the busts, not in
 * screen space. A light pinned to the cursor in two dimensions lights
 * everything from the same angle wherever it goes, so the shading never
 * changes and the scene reads as a flat image with a bright patch on it.
 * Moving it through the scene is what makes a form turn: the same cheek is lit
 * from the left, then from below, then not at all.
 *
 * There is always a little rim light. On a dark ground an unlit form is not
 * subtle, it is absent, and a reader who moves the cursor somewhere empty
 * concludes the page is broken. A faint edge keeps all three present and makes
 * the lamp read as a lamp rather than as the only thing that exists.
 *
 * And there are no shadow maps. A moving light and three solids is exactly the
 * case where real shadows look obvious and cost a second render pass every
 * frame. The forms read from shading alone, which at this scale is most of
 * what a shadow would have told you anyway.
 */

import * as THREE from 'three'
import {
  mount,
  type BaseOptions,
  type EffectHandle,
  type Pointer,
  type Size,
  type Surface,
  type SurfaceContext
} from '../../shared/runtime'

export type PointerLitBustsOptions = BaseOptions & {
  /** Brightness of the lamp the cursor carries. */
  lamp: number
  /** Colour of the lamp. */
  lampColour: string
  /** How far in front of the busts the lamp sits. */
  reach: number
  /** How far the lamp travels across the scene, in scene units. */
  sweep: number
  /** Brightness of the edge that keeps a form present with the lamp away. */
  rim: number
  /** Colour of the rim, which is the room rather than the lamp. */
  rimColour: string
  /** The ground the busts stand in. */
  room: string
  /** How far the camera drifts with the cursor. Zero holds it still. */
  parallax: number
  /** How polished the forms are. Low is stone, high is lacquer. */
  polish: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const pointerLitBustsDefaults: PointerLitBustsOptions = {
  lamp: 26,
  lampColour: '#ffe9c9',
  reach: 3.2,
  sweep: 7,
  rim: 0.5,
  rimColour: '#6f86b8',
  room: '#0a0a0c',
  parallax: 0.35,
  polish: 0.42,
  reducedMotionTime: 0
}

/*
 * One bust, as a profile turned on a lathe plus three primitives.
 *
 * The profile is the silhouette from chin to crown, in half-section: a lathe
 * sweeps it around and the head exists. It is the cheapest way to get a form
 * that reads as carved rather than as a sphere with things stuck to it, and it
 * is a dozen numbers rather than a mesh.
 */
function headProfile(crown: number, jaw: number): THREE.Vector2[] {
  /*
   * Chin to crown in half-section, and the shape of it is the whole character.
   * An even curve gives an egg, which is what a sphere already was: what makes
   * a head read as carved is the three places it changes direction, the jaw
   * coming in under the cheek, the brow standing proud of the eye, and the
   * crown falling away behind it.
   */
  return [
    new THREE.Vector2(0.0, -1.5),
    new THREE.Vector2(jaw * 0.3, -1.46),
    new THREE.Vector2(jaw * 0.55, -1.3),
    new THREE.Vector2(jaw * 0.72, -1.02),
    new THREE.Vector2(jaw * 0.8, -0.72),
    /* the jaw, tucked under */
    new THREE.Vector2(jaw * 0.84, -0.4),
    new THREE.Vector2(jaw * 0.95, -0.12),
    /* the cheek, widest */
    new THREE.Vector2(jaw * 1.0, 0.16),
    /* the brow, standing proud */
    new THREE.Vector2(jaw * 0.99, 0.42),
    new THREE.Vector2(jaw * 0.9, 0.64),
    /* and away over the crown */
    new THREE.Vector2(jaw * 0.74, crown * 0.78),
    new THREE.Vector2(jaw * 0.46, crown * 0.98),
    new THREE.Vector2(jaw * 0.2, crown + 0.04),
    new THREE.Vector2(0.0, crown + 0.08)
  ]
}

/*
 * The shoulders, also a lathe. A cylinder gives a detached ribbon: shoulders
 * need to start at the neck and fall away, which is a profile rather than a
 * tube.
 */
function collarProfile(jaw: number): THREE.Vector2[] {
  return [
    new THREE.Vector2(jaw * 0.5, -1.46),
    new THREE.Vector2(jaw * 0.66, -1.6),
    new THREE.Vector2(jaw * 0.98, -1.76),
    new THREE.Vector2(jaw * 1.3, -1.98),
    new THREE.Vector2(jaw * 1.5, -2.3)
  ]
}

type Bust = { group: THREE.Group; drift: number }

class PointerLitBustsSurface implements Surface<PointerLitBustsOptions> {
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private lamp: THREE.PointLight | null = null
  private rim: THREE.DirectionalLight | null = null
  private busts: Bust[] = []
  private made: THREE.BufferGeometry[] = []
  private used: THREE.Material[] = []

  setup(ctx: SurfaceContext): void {
    // kind: 'canvas', so the runtime has made one. Nothing to draw into
    // otherwise, and the scene would have nowhere to go.
    if (!ctx.canvas) return
    const renderer = new THREE.WebGLRenderer({
      canvas: ctx.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    })
    renderer.setPixelRatio(1)
    this.renderer = renderer

    const scene = new THREE.Scene()
    this.scene = scene

    const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 80)
    camera.position.set(0, 0.25, 9.5)
    this.camera = camera

    /*
     * The lamp. A point light rather than a spot: a spot needs an aim, and an
     * aim that follows the cursor as well as the position gives a cone that
     * never crosses the forms at an angle, which is the whole effect.
     */
    const lamp = new THREE.PointLight(0xffe9c9, 26, 26, 2)
    scene.add(lamp)
    this.lamp = lamp

    // The room. Faint, from behind and above, so nothing is ever truly gone.
    const rim = new THREE.DirectionalLight(0x6f86b8, 0.5)
    rim.position.set(-2.5, 3, -4)
    scene.add(rim)
    this.rim = rim

    /*
     * Three of them, each a different build, at different depths. They differ
     * by size, by how far they are turned and by how deep the visor sits,
     * which is enough: a crest was tried on one and read as a blemish rather
     * than as variety, because a ridge that follows a dome is mostly inside
     * it. The one at
     * the back is turned furthest away: a row of identical heads facing front
     * is a shop display, and the whole thing is supposed to read as a room
     * somebody left.
     */
    const cast = [
      { x: -2.5, z: -1.4, scale: 1.0, turn: 0.42, crown: 1.25, jaw: 0.92, visor: 0.52 },
      { x: 0.15, z: 0.3, scale: 1.18, turn: -0.12, crown: 1.1, jaw: 1.0, visor: 0.66 },
      { x: 2.7, z: -2.2, scale: 0.92, turn: -0.75, crown: 1.34, jaw: 0.86, visor: 0.38 }
    ]

    const shell = new THREE.MeshStandardMaterial({
      color: 0xb9b4ab,
      roughness: 0.58,
      metalness: 0.15
    })
    const dark = new THREE.MeshStandardMaterial({
      color: 0x15161a,
      roughness: 0.22,
      metalness: 0.5
    })
    this.used.push(shell, dark)

    for (const spec of cast) {
      const group = new THREE.Group()

      const head = new THREE.LatheGeometry(headProfile(spec.crown, spec.jaw), 64)
      this.made.push(head)
      group.add(new THREE.Mesh(head, shell))

      /*
       * The visor, as a section of a cylinder wrapped round the face rather
       * than a piece of a sphere. A sphere section at this size is a flat
       * black quad stuck on the front; a cylinder arc follows the head and
       * catches the lamp along its edge, which is what reads as glass.
       */
      const visor = new THREE.CylinderGeometry(
        spec.jaw * 1.02,
        spec.jaw * 1.0,
        spec.visor,
        64,
        1,
        true,
        /*
         * Centred on the camera. A cylinder's theta starts at +Z, which is the
         * front, so an arc centred on zero faces the reader; the first attempt
         * started at 0.62pi and wrapped the visor round the back of the head
         * where nobody could see it.
         */
        -Math.PI * 0.38,
        Math.PI * 0.76
      )
      this.made.push(visor)
      const visorMesh = new THREE.Mesh(visor, dark)
      visorMesh.position.y = 0.12
      visorMesh.scale.z = 1.04
      group.add(visorMesh)

      // Shoulders, so the head is a bust rather than a head on nothing.
      const collar = new THREE.LatheGeometry(collarProfile(spec.jaw), 64)
      this.made.push(collar)
      group.add(new THREE.Mesh(collar, shell))

      group.position.set(spec.x, 0, spec.z)
      group.rotation.y = spec.turn
      group.scale.setScalar(spec.scale)
      scene.add(group)
      this.busts.push({ group, drift: spec.turn })
    }

    this.resize(ctx.size)
  }

  resize(size: Size): void {
    const renderer = this.renderer
    const camera = this.camera
    if (!renderer || !camera) return
    renderer.setSize(size.pixelWidth, size.pixelHeight, false)
    camera.aspect = size.pixelWidth / Math.max(size.pixelHeight, 1)
    camera.updateProjectionMatrix()
  }

  render(_t: number, opts: PointerLitBustsOptions, pointer: Pointer): void {
    const { renderer, scene, camera, lamp, rim } = this
    if (!renderer || !scene || !camera || !lamp || !rim) return

    scene.background ??= new THREE.Color(opts.room)
    ;(scene.background as THREE.Color).set(opts.room)

    /*
     * The lamp, placed in the world from the cursor. Centred so the middle of
     * the element is the middle of the scene, and y inverted because the
     * pointer counts down the page while the scene counts up.
     */
    const x = (pointer.x - 0.5) * opts.sweep
    const y = (0.5 - pointer.y) * opts.sweep * 0.62
    lamp.position.set(x, y, opts.reach)
    lamp.intensity = opts.lamp
    lamp.color.set(opts.lampColour)
    lamp.distance = opts.sweep * 4

    rim.intensity = opts.rim
    rim.color.set(opts.rimColour)

    /*
     * A little camera drift, against the cursor rather than with it. Moving
     * the camera the same way as the lamp cancels the parallax out and the
     * scene feels locked; moving it the other way is what gives the room
     * depth.
     */
    camera.position.x = -(pointer.x - 0.5) * opts.parallax
    camera.position.y = 0.25 - (pointer.y - 0.5) * opts.parallax * 0.5
    camera.lookAt(0, -0.2, 0)

    for (const material of this.used) {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.roughness = material.color.getHex() === 0x15161a ? 0.22 : 1 - opts.polish
      }
    }

    renderer.render(scene, camera)
  }

  context(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return this.renderer?.getContext() ?? null
  }

  teardown(): void {
    for (const geometry of this.made) geometry.dispose()
    for (const material of this.used) material.dispose()
    this.lamp?.dispose()
    this.rim?.dispose()
    this.renderer?.dispose()
    this.made = []
    this.used = []
    this.busts = []
    this.lamp = null
    this.rim = null
    this.scene = null
    this.camera = null
    this.renderer = null
  }
}

/**
 * Mount PointerLitBusts into `el`. The element needs a size in CSS; the canvas
 * fills it.
 *
 * ```ts
 * const room = createPointerLitBusts(document.querySelector('#hero')!)
 * room.start()
 * // …later
 * room.destroy()
 * ```
 *
 * Built for a dark ground. On paper the rim light has nothing to separate the
 * forms from and the whole thing goes flat.
 */
export function createPointerLitBusts(
  el: HTMLElement,
  opts: Partial<PointerLitBustsOptions> = {}
): EffectHandle {
  return mount<PointerLitBustsOptions>(el, opts, {
    defaults: pointerLitBustsDefaults,
    kind: 'canvas',
    create: () => new PointerLitBustsSurface()
  })
}

export default createPointerLitBusts
