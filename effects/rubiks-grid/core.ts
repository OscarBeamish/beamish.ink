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

export type RubiksGridScheme =
  | 'classic'
  | 'neon'
  | 'ocean'
  | 'sunset'
  | 'forest'
  | 'pastel'
  | 'monochrome'

export type RubiksGridOptions = BaseOptions & {
  /** How much of the field you see. Higher means smaller cubes, more of them. */
  density: number
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
  /** Seed for the scramble. The same seed gives the same sequence. */
  seed: number
}

/*
 * Kept in step with meta.json by `pnpm generate`, which fails if the two drift.
 * meta.json is the source of truth; this object exists so the file stands alone.
 */
export const rubiksGridDefaults: RubiksGridOptions = {
  density: 6,
  scheme: 'classic',
  turn: 0.4,
  rest: 0.2,
  moves: 5,
  sync: false,
  tilt: 30,
  seed: 7,
  maxDpr: 2,
  reducedMotionTime: 1.2
}

/*
 * The seven palettes from the original sketch, carried over exactly.
 *
 * `faces` is right, left, top, bottom, front, back. `body` is the plastic
 * between the stickers, which the sketch calls the internal colour and which
 * is part of the palette rather than a separate setting: pastel on black looks
 * like a different idea from pastel on its own near-black.
 */
const SCHEMES: Record<RubiksGridScheme, { faces: readonly string[]; body: string }> = {
  classic: {
    faces: ['#c41e3a', '#ff5800', '#ffd500', '#ffffff', '#0051ba', '#009e60'],
    body: '#000000'
  },
  neon: {
    faces: ['#ff00ff', '#00ffff', '#ffff00', '#ff0080', '#00ff00', '#8000ff'],
    body: '#000000'
  },
  ocean: {
    faces: ['#0077b6', '#00b4d8', '#90e0ef', '#caf0f8', '#023e8a', '#48cae4'],
    body: '#001219'
  },
  sunset: {
    faces: ['#ff6b6b', '#ffa500', '#ffd93d', '#ff8e72', '#c44569', '#6c5b7b'],
    body: '#1a1a2e'
  },
  forest: {
    faces: ['#2d6a4f', '#40916c', '#95d5b2', '#74c69d', '#1b4332', '#52b788'],
    body: '#081c15'
  },
  pastel: {
    faces: ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#bdb2ff'],
    body: '#2d2d2d'
  },
  monochrome: {
    faces: ['#ffffff', '#000000', '#ffffff', '#000000', '#ffffff', '#000000'],
    body: '#000000'
  }
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
/* A cube is three cubies across, and a cubie is one unit. */
const SIDE = 3

/*
 * THE TILING
 *
 * These three numbers are the whole look, and they are not a grid.
 *
 * The cubes are laid in a staircase: each row is pushed sideways by half a
 * cube so the V between two cubes in one row is filled by the cube below, and
 * the rows are closer together than a cube is tall so the faces interlock. The
 * result is a continuous surface rather than objects with gaps between them,
 * which is the difference between a pattern and a pile.
 *
 * The first version here used a plain rectangular grid with a gap, and it read
 * as a shelf of ornaments.
 *
 * They come from projecting the eight corners of a cube under the isometric
 * pair and measuring, then taking the sketch's own fractions of the result.
 * Carried as multiples of the side length so they hold at any size:
 *
 *   projected width  = side * sqrt(2)   = 1.41421 sides
 *   projected height                    = 1.57313 sides
 *   spacing across   = width  - gap     = 1.38821 sides
 *   stagger per row  = (width - gap)/2  = 0.70111 sides
 *   spacing down     = height * 0.767   = 1.19459 sides
 *
 * The 0.767 is the sketch's, found by eye rather than derived, and it is what
 * makes the rows sit into each other instead of merely near each other.
 */
/* A cubie fills 0.88 of its one-unit cell; the rest is the black grid. */
const CUBIE = 0.88

const PROJ_W = SIDE * Math.SQRT2
const SPACING_X = SIDE * 1.388214
const SHIFT_X = SIDE * 0.701107
const SPACING_Y = SIDE * 1.194592

const AXIS_X = new THREE.Vector3(1, 0, 0)
const AXIS_Y = new THREE.Vector3(0, 1, 0)
const AXIS_Z = new THREE.Vector3(0, 0, 1)

/*
 * Where a sticker sits on its cubie, worked out once for each of the six
 * faces. Built at module load because they never change and because building
 * them in the loop would be six matrices per cubie per frame.
 */
const FACE_PLACE: THREE.Matrix4[] = FACES.map(n => {
  const place = new THREE.Matrix4().makeTranslation(n[0] * 0.451, n[1] * 0.451, n[2] * 0.451)
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
     * three's colour management is left ON, which is its default and which the
     * sketch relies on.
     *
     * Turning it off was the first thing done here, copied from another item
     * in this library where it is needed for a different reason, and it washed
     * every colour out: disabling it skips the sRGB-to-linear conversion on
     * the way IN but not the linear-to-sRGB conversion on the way OUT, so each
     * colour gets brightened exactly once. Classic red came out pink.
     *
     * Left alone, the two conversions are inverses and the colour that lands
     * is the colour that was written.
     */

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
     * No lights. None at all, and that is the look.
     *
     * The sketch uses MeshBasicMaterial throughout, so every face of a given
     * colour is that exact colour wherever it is and whichever way it points.
     * The first version here used Lambert with an ambient and a key, which is
     * the sensible thing to do and is wrong: the shading pulled the reds to a
     * dusty rose and the whites to grey, and the field went from a flat
     * graphic to a photograph of some toys.
     *
     * A cube still reads as a cube because its three visible faces are three
     * different colours. It does not need shading to do that.
     */

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

    /*
     * How many cubes it takes to COVER the frame, not to fit inside it.
     *
     * The field is a pattern, so it has to run off every edge: a cube clipped
     * by the frame is right, and a tidy margin of background around a
     * rectangle of cubes is the thing that makes it look like a widget. The
     * last row and column are generated beyond the edge and simply fall
     * outside.
     */
    const density = Math.max(2, Math.round(opts.density))
    const aspect = this.size.width / Math.max(this.size.height, 1)
    const frustum = density * 2.5
    const halfW = (frustum * aspect) / 2
    const halfH = frustum / 2
    const pad = PROJ_W * 1.5
    const rows = Math.ceil((halfH + pad) / SPACING_Y) + 1
    const cols = Math.ceil((halfW + pad) / SPACING_X) + 1

    const key = [rows, cols, opts.scheme].join('/')
    if (key === this.builtFor) return

    this.disposeMeshes()
    this.grid = { cols, rows }
    /* Both run from -n to n, and the stagger pushes rows sideways, so the
       capacity has to cover the worst case rather than the visible count. */
    const cubes = (rows * 2 + 1) * (cols * 2 + 1)

    const palette = SCHEMES[opts.scheme] ?? SCHEMES.classic

    /*
     * A cubie fills 0.88 of its cell, which is the sketch's own ratio: a gap
     * of four per cent of the whole cube on each side. That gap is the black
     * grid you see, and it is the only black there is.
     */
    const body = new THREE.BoxGeometry(CUBIE, CUBIE, CUBIE)
    const bodyMaterial = new THREE.MeshBasicMaterial({ color: rgb(palette.body) })
    const bodies = new THREE.InstancedMesh(body, bodyMaterial, cubes * CUBIES)
    bodies.frustumCulled = false
    this.field.add(bodies)
    this.bodies = bodies

    /*
     * The sticker covers its whole cubie face rather than sitting inset on it.
     * The sketch colours the cubie's own faces, so there is no border around a
     * sticker, only the gap between cubies. An inset tile gives every cubie a
     * second black outline and doubles the amount of black in the picture.
     *
     * It is a separate tile here only because an InstancedMesh cannot give
     * each instance a different colour per face.
     */
    const tile = new THREE.BoxGeometry(CUBIE, CUBIE, 0.02)
    for (let face = 0; face < 6; face++) {
      const material = new THREE.MeshBasicMaterial({ color: rgb(palette.faces[face]!) })
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
     * The camera opens by `density` alone. The cubes are a fixed size in world
     * units and it is the frustum that changes, which is what the sketch's
     * zoom control does: more of the same field rather than smaller cubes.
     */
    const density = Math.max(2, Math.round(opts.density))
    const aspect = this.size.width / Math.max(this.size.height, 1)
    const frustum = density * 2.5
    const halfW = (frustum * aspect) / 2
    const halfH = frustum / 2
    camera.left = -halfW
    camera.right = halfW
    camera.top = halfH
    camera.bottom = -halfH
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
     * then laid out on a staircase that is square to the screen.
     */
    this.tiltM.makeRotationX((opts.tilt * Math.PI) / 180)
    this.isoM.makeRotationY(-Math.PI / 4).premultiply(this.tiltM)

    let bodyAt = 0
    const stickerAt = this.stickerAt
    stickerAt.fill(0)

    const edge = PROJ_W
    for (let row = -rows; row <= rows; row++) {
      for (let col = -cols; col <= cols; col++) {
        /*
         * The staircase. Each row is pushed sideways by half a cube, so the V
         * between two cubes in a row is filled by the cube below it.
         */
        const originX = col * SPACING_X + row * SHIFT_X
        const originY = -row * SPACING_Y
        if (
          originX < -halfW - edge ||
          originX > halfW + edge ||
          originY < -halfH - edge ||
          originY > halfH + edge
        ) {
          continue
        }

        /* Keyed on the place, so a cube keeps its own sequence rather than
           being renumbered when the grid changes size. */
        const index = (row + 512) * 1024 + (col + 512)
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
