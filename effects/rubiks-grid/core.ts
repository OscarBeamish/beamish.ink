/*
 * RubiksGrid: Beamish
 * https://beamish.ink/effects/rubiks-grid
 *
 * A field of Rubik's cubes in isometric projection, turning a layer at a time.
 *
 * Adapted from a standalone sketch of mine, Isometric Rubik's, which is MIT
 * and credited in meta.json along with the Reddit post that started it. The
 * look is the same. Almost none of the code is, and the reason is worth
 * stating because it is the whole shape of this item.
 *
 * THE ORIGINAL KEEPS ITS STATE. THIS CANNOT.
 *
 * The sketch does what any cube simulation does: pick a move, reparent the
 * nine cubies of that layer to a pivot, turn the pivot, reparent them back
 * with their positions snapped, push the move onto a history. Every frame is
 * built from the one before it.
 *
 * Nothing here may do that. `renderAtTime(t)` has to answer for any moment
 * without having seen the moments before it, so the recorder can seek and so
 * a loop closes exactly. So the scene graph is never mutated and no history
 * is kept. Instead:
 *
 *   Every move is DERIVED. Cube number seven's fourth move is a function of
 *   the seed and those two numbers, so it is the same answer every time it is
 *   asked, and it can be asked out of order.
 *
 *   The state is REBUILT each frame. At time t a cube is `done` moves in and
 *   partway through the next, so its cubies are replayed from solved. That is
 *   a few dozen integer permutations per cube, which costs nothing next to
 *   the matrices that have to be written anyway.
 *
 *   The cubie state is INTEGER. Each cubie carries a position in {-1,0,1} and
 *   a 3x3 rotation matrix whose entries are only ever -1, 0 or 1. Quaternions
 *   would drift over a few hundred replayed turns; integers cannot, so a cube
 *   that should be solved is exactly solved.
 *
 * THE LOOP CLOSES BECAUSE THE SEQUENCE UNDOES ITSELF
 *
 * Each cube scrambles for `moves` turns and then replays them backwards, so
 * it returns to solved. That is the original's solve button, turned into the
 * shape of the animation rather than a control on it.
 *
 * When the cubes are out of step with each other their offsets are whole
 * numbers of turns rather than arbitrary times. A fractional offset would
 * mean the grid never returns to the state it started in and the recording
 * could not loop.
 *
 * SEVEN DRAW CALLS, NOT SEVEN HUNDRED
 *
 * The original gives every cubie its own mesh with six materials. Readable,
 * and at a 6x4 grid that is 648 meshes before the stickers.
 *
 * Here the cubie bodies are one InstancedMesh and the stickers are one more
 * per colour, so the whole field is seven draw calls whatever its size. The
 * per-frame work is writing about two thousand matrices, which is the real
 * cost and is the same either way.
 */

import * as THREE from 'three'
import {
  mount,
  type BaseOptions,
  type EffectHandle,
  type Pointer,
  type Surface
} from '../../shared/runtime'

export type RubiksGridScheme = 'classic' | 'neon' | 'ocean' | 'sunset' | 'monochrome'

export type RubiksGridOptions = BaseOptions & {
  /** Cubes across the frame. Rows follow from the aspect. */
  columns: number
  /** Which set of sticker colours. */
  scheme: RubiksGridScheme
  /** Seconds one quarter turn takes. */
  turn: number
  /** Seconds a cube rests between turns. */
  rest: number
  /** Turns of scramble before it undoes itself. The loop is twice this. */
  moves: number
  /** All cubes turn together, rather than each on its own offset. */
  sync: boolean
  /** How far the field tilts out of flat, in degrees. 30 is isometric. */
  tilt: number
  /** The body of a cubie, between the stickers. */
  body: string
  /** Seed for the scramble. The same seed gives the same sequence. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const rubiksGridDefaults: RubiksGridOptions = {
  columns: 5,
  scheme: 'classic',
  turn: 0.4,
  rest: 0.2,
  moves: 5,
  sync: false,
  tilt: 30,
  body: '#141318',
  seed: 7,
  maxDpr: 2,
  reducedMotionTime: 1.2
}

/* The six sticker colours, in the order right, left, top, bottom, front, back. */
const SCHEMES: Record<RubiksGridScheme, readonly string[]> = {
  classic: ['#c41e3a', '#ff5800', '#ffd500', '#ffffff', '#0051ba', '#009e60'],
  neon: ['#ff2d95', '#ff8a00', '#faff00', '#f2f2f2', '#00c2ff', '#28ff8f'],
  ocean: ['#0b4f6c', '#01baef', '#20bf55', '#fbfbff', '#145c9e', '#0f8b8d'],
  sunset: ['#c1292e', '#f17105', '#ffd25a', '#fdfcdc', '#235789', '#e6af2e'],
  monochrome: ['#f5f5f5', '#171717', '#f5f5f5', '#171717', '#9a9a9a', '#3d3d3d']
}

/** The six face normals, in the same order as the colours above. */
const FACES: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1]
]

const CUBIES = 27
const SIDE = 3

/*
 * How much room one cube takes on screen, which is not how big it is.
 *
 * Tilted and turned, a cube of side s projects to s*sqrt(2) across and
 * s*sqrt(6)/2 down. Spacing the grid by the side length instead was the first
 * version and the cubes overlapped by forty per cent, because a cube seen
 * corner-on is wider than a cube seen face-on.
 */
const PROJ_W = SIDE * Math.SQRT2
const PROJ_H = (SIDE * Math.sqrt(6)) / 2
const GAP = 0.55

const AXIS_X = new THREE.Vector3(1, 0, 0)
const AXIS_Y = new THREE.Vector3(0, 1, 0)
const AXIS_Z = new THREE.Vector3(0, 0, 1)

/*
 * Where a sticker sits on its cubie, worked out once for each of the six
 * faces. Built at module load because they never change and because building
 * them in the loop would be six matrices per cubie per frame.
 */
const FACE_PLACE: THREE.Matrix4[] = FACES.map(n => {
  const place = new THREE.Matrix4().makeTranslation(n[0] * 0.49, n[1] * 0.49, n[2] * 0.49)
  const turn = new THREE.Matrix4()
  if (n[0] !== 0) turn.makeRotationY((Math.PI / 2) * n[0])
  else if (n[1] !== 0) turn.makeRotationX((-Math.PI / 2) * n[1])
  return place.multiply(turn)
})

/**
 * One cubie: where it sits, and how it is turned.
 *
 * The rotation is a 3x3 matrix held as nine numbers that are only ever -1, 0
 * or 1. It is not an optimisation. The sequence is replayed from solved on
 * every frame, so a cube near the end of a long scramble has had hundreds of
 * turns composed; in floating point that drifts, and a cube that is supposed
 * to be solved comes back a fraction of a degree off, which on a flat
 * isometric face is a visible seam. Integers cannot drift.
 */
type Cubie = { x: number; y: number; z: number; r: Int8Array }

const IDENTITY = () => Int8Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1])

/** A small deterministic generator, so a seed always gives the same scramble. */
function rng(seed: number): () => number {
  let s = (seed | 0) >>> 0
  if (s === 0) s = 1
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/*
 * Turn a vector a quarter turn about one axis. `dir` is 1 or -1.
 *
 * Written out rather than built from a matrix because it runs a few hundred
 * thousand times a second and because the three cases are three lines each.
 */
function spin(v: { a: number; b: number; c: number }, axis: number, dir: number): void {
  const { a, b, c } = v
  if (axis === 0) {
    v.b = -dir * c
    v.c = dir * b
  } else if (axis === 1) {
    v.a = dir * c
    v.c = -dir * a
  } else {
    v.a = -dir * b
    v.b = dir * a
  }
}

/** The same quarter turn, applied to a cubie's position and its rotation. */
function applyMove(cubies: Cubie[], axis: number, layer: number, dir: number): void {
  const v = { a: 0, b: 0, c: 0 }
  for (const cubie of cubies) {
    const on = axis === 0 ? cubie.x : axis === 1 ? cubie.y : cubie.z
    if (on !== layer) continue

    v.a = cubie.x
    v.b = cubie.y
    v.c = cubie.z
    spin(v, axis, dir)
    cubie.x = v.a
    cubie.y = v.b
    cubie.z = v.c

    /* Each column of the rotation is a vector and turns the same way. */
    for (let col = 0; col < 3; col++) {
      v.a = cubie.r[col]!
      v.b = cubie.r[col + 3]!
      v.c = cubie.r[col + 6]!
      spin(v, axis, dir)
      cubie.r[col] = v.a
      cubie.r[col + 3] = v.b
      cubie.r[col + 6] = v.c
    }
  }
}

/*
 * Quick away, slow home, with the weight at the end.
 *
 * A symmetric ease reads as a machine turning a layer. A real cube is flicked:
 * it is already moving fast when it leaves, and the last few degrees are the
 * slowest part. This is the sketch's own curve, kept because it is the single
 * thing that makes the motion feel like fingers rather than like a motor.
 */
function flick(k: number): number {
  if (k < 0.3) return 2.5 * k * k
  const n = (k - 0.3) / 0.7
  return 0.225 + 0.775 * (1 - Math.pow(1 - n, 3))
}

function rgb(hex: string): THREE.Color {
  return new THREE.Color(hex)
}

class RubiksGridSurface implements Surface<RubiksGridOptions> {
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.OrthographicCamera | null = null
  private field = new THREE.Group()

  private bodies: THREE.InstancedMesh | null = null
  private stickers: THREE.InstancedMesh[] = []

  /** The working cube, reused for every cube in the grid, every frame. */
  private cubies: Cubie[] = []
  private grid = { cols: 0, rows: 0 }
  private builtFor = ''
  private size = { width: 1, height: 1, pixelWidth: 1, pixelHeight: 1, dpr: 1 }

  /*
   * Every working object, made once. The inner loop runs tens of thousands of
   * times a second, and a matrix allocated in there is a matrix the garbage
   * collector has to take away again.
   */
  private matrix = new THREE.Matrix4()
  private basis = new THREE.Matrix4()
  private isoM = new THREE.Matrix4()
  private tiltM = new THREE.Matrix4()
  private turnM = new THREE.Matrix4()
  private stickerM = new THREE.Matrix4()
  private offset = new THREE.Vector3()
  private move = { axis: 0, layer: 0, dir: 1 }
  private stickerAt = new Int32Array(6)
  private seqs = new Map<number, Int8Array>()
  private seqFor = ''

  setup(ctx: { canvas: HTMLCanvasElement | null }): void {
    if (!ctx.canvas) throw new Error('RubiksGrid needs a canvas')
    const renderer = new THREE.WebGLRenderer({
      canvas: ctx.canvas,
      antialias: true,
      alpha: true
    })
    renderer.setClearAlpha(0)

    /*
     * Off, so a colour written here is the colour that lands. With it on,
     * three converts every colour from sRGB into linear light on the way in,
     * and the sticker reds come out muddy and the whites come out grey.
     */
    THREE.ColorManagement.enabled = false

    const scene = new THREE.Scene()
    scene.add(this.field)

    /*
     * Orthographic, because isometric is a projection with no perspective in
     * it: a cube at the edge of the frame has to be the same size and shape as
     * one in the middle, or the field stops tiling and starts being a scene.
     */
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 500)
    camera.position.set(0, 0, 100)
    scene.add(camera)

    /*
     * Mostly ambient, with just enough directional to separate the three
     * faces you can see. Lit any harder and the stickers go muddy: a Rubik's
     * cube is flat plastic, and the only shading that belongs on it is the
     * difference between top, left and right.
     */
    scene.add(new THREE.AmbientLight(0xffffff, 1.0))
    const key = new THREE.DirectionalLight(0xffffff, 0.34)
    key.position.set(3, 8, 6)
    scene.add(key)

    for (let i = 0; i < CUBIES; i++) {
      this.cubies.push({ x: 0, y: 0, z: 0, r: IDENTITY() })
    }

    this.renderer = renderer
    this.scene = scene
    this.camera = camera
  }

  resize(size: {
    width: number
    height: number
    pixelWidth: number
    pixelHeight: number
    dpr: number
  }): void {
    this.size = size
    this.renderer?.setSize(size.pixelWidth, size.pixelHeight, false)
    this.builtFor = ''
  }

  /*
   * The meshes, rebuilt only when the grid or the palette changes.
   *
   * One InstancedMesh for every cubie body in the field, and one per sticker
   * colour. Seven draw calls whatever the grid size, against the better part
   * of a thousand if each cubie were its own mesh.
   */
  private build(opts: RubiksGridOptions): void {
    const scene = this.scene
    if (!scene) return

    const cols = Math.max(1, Math.round(opts.columns))
    const aspect = this.size.width / Math.max(this.size.height, 1)
    const rows = Math.max(1, Math.round(cols / Math.max(aspect, 0.2)))
    const key = [cols, rows, opts.scheme, opts.body].join('/')
    if (key === this.builtFor) return

    this.disposeMeshes()
    this.grid = { cols, rows }
    const cubes = cols * rows

    const body = new THREE.BoxGeometry(0.94, 0.94, 0.94)
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: rgb(opts.body) })
    const bodies = new THREE.InstancedMesh(body, bodyMaterial, cubes * CUBIES)
    bodies.frustumCulled = false
    this.field.add(bodies)
    this.bodies = bodies

    /*
     * A sticker is a flat tile sitting just proud of its cubie face. Nine per
     * face per cube, so each colour's instance count is fixed and known.
     */
    const tile = new THREE.BoxGeometry(0.78, 0.78, 0.03)
    const palette = SCHEMES[opts.scheme] ?? SCHEMES.classic
    for (let face = 0; face < 6; face++) {
      const material = new THREE.MeshLambertMaterial({ color: rgb(palette[face]!) })
      const mesh = new THREE.InstancedMesh(tile, material, cubes * 9)
      mesh.frustumCulled = false
      this.field.add(mesh)
      this.stickers.push(mesh)
    }

    this.builtFor = key
  }

  private disposeMeshes(): void {
    for (const mesh of [this.bodies, ...this.stickers]) {
      if (!mesh) continue
      this.field.remove(mesh)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      mesh.dispose()
    }
    this.bodies = null
    this.stickers = []
  }

  /*
   * A cube's move sequence, worked out once and kept.
   *
   * It is a pure function of the seed and the cube's index, so it could be
   * recomputed every frame and would give the same answer. It is cached
   * because it is the same answer: there is no sense deriving twenty-four
   * sequences sixty times a second to get a result that cannot have changed.
   */
  private sequence(index: number, opts: RubiksGridOptions): Int8Array {
    const moves = Math.max(1, Math.round(opts.moves))
    const key = [opts.seed, moves].join('/')
    if (key !== this.seqFor) {
      this.seqs.clear()
      this.seqFor = key
    }
    const had = this.seqs.get(index)
    if (had) return had

    /* Three numbers per move: axis, layer, direction. */
    const seq = new Int8Array(moves * 3)
    const random = rng(opts.seed * 7919 + index * 104729 + 1)
    for (let m = 0; m < moves; m++) {
      seq[m * 3] = Math.floor(random() * 3)
      /* Never the middle layer. Turning it moves no corner, so at this size
         it reads as a glitch rather than as a move. */
      seq[m * 3 + 1] = random() < 0.5 ? -1 : 1
      seq[m * 3 + 2] = random() < 0.5 ? -1 : 1
    }
    this.seqs.set(index, seq)
    return seq
  }

  /**
   * Move number `m` of the full cycle.
   *
   * The first half is the scramble. The second half is the same turns taken
   * backwards and in reverse order, which is the standard inverse scramble and
   * is what returns the cube to solved. It is the original sketch's solve
   * button, turned into the shape of the animation instead of a control on it.
   */
  private moveAt(seq: Int8Array, moves: number, m: number): void {
    const back = m >= moves
    const i = back ? moves - 1 - (m - moves) : m
    this.move.axis = seq[i * 3]!
    this.move.layer = seq[i * 3 + 1]!
    this.move.dir = back ? -seq[i * 3 + 2]! : seq[i * 3 + 2]!
  }

  /** Reset the working cube to solved, then apply `done` whole turns. */
  private replay(seq: Int8Array, moves: number, done: number): void {
    for (let i = 0; i < CUBIES; i++) {
      const cubie = this.cubies[i]!
      cubie.x = (i % 3) - 1
      cubie.y = (Math.floor(i / 3) % 3) - 1
      cubie.z = Math.floor(i / 9) - 1
      cubie.r[0] = 1; cubie.r[1] = 0; cubie.r[2] = 0
      cubie.r[3] = 0; cubie.r[4] = 1; cubie.r[5] = 0
      cubie.r[6] = 0; cubie.r[7] = 0; cubie.r[8] = 1
    }
    for (let m = 0; m < done; m++) {
      this.moveAt(seq, moves, m)
      applyMove(this.cubies, this.move.axis, this.move.layer, this.move.dir)
    }
  }

  render(t: number, opts: RubiksGridOptions, _pointer: Pointer): void {
    const renderer = this.renderer
    const scene = this.scene
    const camera = this.camera
    if (!renderer || !scene || !camera) return
    this.build(opts)

    const bodies = this.bodies
    if (!bodies || this.stickers.length < 6) return

    const { cols, rows } = this.grid
    const moves = Math.max(1, Math.round(opts.moves))
    const total = moves * 2
    const turn = Math.max(opts.turn, 0.02)
    const beat = turn + Math.max(opts.rest, 0)

    /*
     * The field is laid out in cube units and the camera is then opened to
     * exactly fit it, so the grid meets the edges of the frame at any aspect
     * without anything here being measured in pixels.
     */
    const pitchX = PROJ_W + GAP
    const pitchY = PROJ_H + GAP
    /*
     * A margin, because a cube is bigger than its own footprint while it is
     * turning: a layer swung half way out reaches past the cube's resting
     * silhouette, and without the margin the top and bottom rows were clipped
     * exactly when they were doing the interesting thing.
     */
    const margin = 0.9
    const halfWidth = (cols * pitchX) / 2 + margin
    const halfHeight = (rows * pitchY) / 2 + margin
    camera.left = -halfWidth
    camera.right = halfWidth
    camera.top = halfHeight
    camera.bottom = -halfHeight
    camera.updateProjectionMatrix()

    /*
     * The isometric pair: tilt down, then turn an eighth. The sketch uses 30
     * and -45 degrees, which is the classic pair and is why a cube drawn this
     * way shows three faces of equal width.
     *
     * It is applied to each cube about its own centre, NOT to the group that
     * holds them. Rotating the group was the first version, and it turns the
     * grid as well as the cubes: the rows come out as diagonals running off
     * the frame instead of as a field. The cubes are drawn isometrically and
     * then laid out on a grid that is square to the screen.
     */
    this.tiltM.makeRotationX((opts.tilt * Math.PI) / 180)
    this.isoM.makeRotationY(-Math.PI / 4).premultiply(this.tiltM)

    let bodyAt = 0
    const stickerAt = this.stickerAt
    stickerAt.fill(0)

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col
        const seq = this.sequence(index, opts)

        /*
         * Whole turns, never fractions of one. An arbitrary offset would mean
         * the field never returns to the frame it started on, and a recording
         * would jump once per loop.
         */
        const stagger = opts.sync ? 0 : (index * 3 + ((index * index) % 5)) % total
        const at = (t / beat + stagger) % total
        const done = Math.floor(at)

        /*
         * The turn occupies only the first `turn` of the beat. The rest of it
         * is the cube sitting still, which is most of the charm: a cube that
         * never rests reads as a machine.
         */
        const elapsed = (at - done) * beat
        const spun = elapsed >= turn ? 1 : flick(elapsed / turn)

        if (spun >= 1) {
          /* The turn has landed, so it is part of the state. */
          this.replay(seq, moves, done + 1)
        } else {
          this.replay(seq, moves, done)
          this.moveAt(seq, moves, done % total)
        }
        const live = spun < 1

        if (live) {
          const axis = this.move.axis === 0 ? AXIS_X : this.move.axis === 1 ? AXIS_Y : AXIS_Z
          this.turnM.makeRotationAxis(axis, (Math.PI / 2) * this.move.dir * spun)
        }

        const originX = (col - (cols - 1) / 2) * pitchX
        const originY = (row - (rows - 1) / 2) * pitchY

        for (let i = 0; i < CUBIES; i++) {
          const cubie = this.cubies[i]!

          this.basis.set(
            cubie.r[0]!, cubie.r[1]!, cubie.r[2]!, 0,
            cubie.r[3]!, cubie.r[4]!, cubie.r[5]!, 0,
            cubie.r[6]!, cubie.r[7]!, cubie.r[8]!, 0,
            0, 0, 0, 1
          )
          this.offset.set(cubie.x, cubie.y, cubie.z)

          /*
           * The layer in flight gets a partial turn laid on top of the state
           * it is leaving. This is the original's pivot group: there it was
           * done by reparenting nine cubies and turning their new parent, here
           * by one matrix multiply, because nothing in this scene graph is
           * allowed to change.
           */
          if (live) {
            const on =
              this.move.axis === 0 ? cubie.x : this.move.axis === 1 ? cubie.y : cubie.z
            if (on === this.move.layer) {
              this.offset.applyMatrix4(this.turnM)
              this.basis.premultiply(this.turnM)
            }
          }

          /* Draw the cubie isometrically, then put it on the screen grid. */
          this.matrix.copy(this.basis).premultiply(this.isoM)
          this.offset.applyMatrix4(this.isoM)
          this.matrix.setPosition(
            originX + this.offset.x,
            originY + this.offset.y,
            this.offset.z
          )
          bodies.setMatrixAt(bodyAt++, this.matrix)

          /*
           * A sticker on each face that was on the outside of the solved cube.
           * Which faces those are is decided by where the cubie started, not
           * where it is now, which is what keeps nine of each colour however
           * scrambled it gets.
           */
          const hx = (i % 3) - 1
          const hy = (Math.floor(i / 3) % 3) - 1
          const hz = Math.floor(i / 9) - 1
          for (let face = 0; face < 6; face++) {
            const n = FACES[face]!
            const outward =
              n[0] !== 0 ? hx === n[0] : n[1] !== 0 ? hy === n[1] : hz === n[2]
            if (!outward) continue

            this.stickerM.copy(this.matrix).multiply(FACE_PLACE[face]!)
            const mesh = this.stickers[face]!
            mesh.setMatrixAt(stickerAt[face]!, this.stickerM)
            stickerAt[face] = stickerAt[face]! + 1
          }
        }
      }
    }

    bodies.count = bodyAt
    bodies.instanceMatrix.needsUpdate = true
    for (let face = 0; face < 6; face++) {
      const mesh = this.stickers[face]!
      mesh.count = stickerAt[face]!
      mesh.instanceMatrix.needsUpdate = true
    }

    renderer.render(scene, camera)
  }

  context(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return this.renderer?.getContext() ?? null
  }

  teardown(): void {
    this.disposeMeshes()
    this.renderer?.dispose()
    this.renderer = null
    this.scene = null
    this.camera = null
    this.cubies = []
    this.builtFor = ''
  }
}

/**
 * Mount RubiksGrid into `el`.
 *
 * ```ts
 * const field = createRubiksGrid(document.querySelector('#hero')!)
 * field.start()
 * // …later
 * field.destroy()
 * ```
 */
export function createRubiksGrid(
  el: HTMLElement,
  opts: Partial<RubiksGridOptions> = {}
): EffectHandle {
  return mount<RubiksGridOptions>(el, opts, {
    defaults: rubiksGridDefaults,
    create: () => new RubiksGridSurface()
  })
}

export default createRubiksGrid
