You are adding **RubiksGrid** from Beamish to this project.

> A field of Rubik's cubes in isometric projection, each turning a layer at a time and solving itself. Backdrops · effect · MIT.
> https://beamish.ink/effects/rubiks-grid

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** `three@>=0.160.0`
- WebGL2. There is no WebGL1 fallback
- Adapted from a standalone sketch of mine, Isometric Rubik's, which is MIT. The look is the same and almost none of the code is, for one reason: the original keeps its state and this cannot
- The sketch does what any cube simulation does. Pick a move, reparent the nine cubies of that layer to a pivot, turn the pivot, reparent them back with positions snapped, push the move onto a history. Every frame is built from the one before it
- renderAtTime has to answer for any moment without having seen the moments before it, so the recorder can seek and so a loop closes exactly. So the scene graph is never mutated and no history is kept
- Every move is derived instead. Cube seven's fourth move is a function of the seed and those two numbers, so it is the same answer every time it is asked and it can be asked out of order
- The state is rebuilt each frame, replayed from solved. A few dozen integer permutations per cube, which costs nothing next to the matrices that have to be written anyway
- The cubie state is integer: a position in {-1,0,1} and a 3x3 rotation whose entries are only ever -1, 0 or 1. Quaternions drift over a few hundred replayed turns, and a cube that should be solved coming back a fraction of a degree off is a visible seam on a flat isometric face. Integers cannot drift
- The loop closes because the sequence undoes itself. Each cube scrambles for `moves` turns then replays them backwards, which is the standard inverse scramble. That is the original's solve button turned into the shape of the animation rather than a control on it
- When the cubes are out of step their offsets are whole numbers of turns, never fractions. A fractional offset means the grid never returns to the frame it started on and the recording jumps once per loop
- Orthographic camera, because isometric is a projection with no perspective in it: a cube at the edge has to be the same size and shape as one in the middle, or the field stops tiling and starts being a scene
- Seven draw calls whatever the grid size. The original gives every cubie its own mesh with six materials, which at a 6x4 grid is 648 meshes before the stickers; here the bodies are one InstancedMesh and the stickers are one per colour
- Which faces of a cubie carry a sticker is decided by where it started, not where it is now. That is what keeps nine of each colour however scrambled it gets
- The middle layer is never turned. It moves no corner, so at this size it reads as a glitch rather than as a move
- three's colour management is off, so a colour written here is the colour that lands. With it on the sticker reds come out muddy and the whites come out grey
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/rubiks-grid/core.ts`**

```ts
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

RubiksGrid fills the frame with Rubik's cubes seen in isometric projection.
Each one turns a layer, rests, turns another, and after a few moves undoes
every one of them and comes back to solved.

It is adapted from a standalone sketch of mine, [Isometric
Rubik's](https://github.com/OscarBeamish/isometric-rubiks), which is MIT. The
look is the same. Almost none of the code is, and the reason is the whole shape
of this item.

## 3. Wire it in

**Plain HTML.**

```html
<div id="hero" style="position: relative; height: 70vh"></div>

<script type="module">
  import { createRubiksGrid } from './beamish/effects/rubiks-grid/core.js'

  const field = createRubiksGrid(document.querySelector('#hero'))
  field.start()
</script>
```

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createRubiksGrid } from '@/beamish/effects/rubiks-grid/core'

export function Hero() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const field = createRubiksGrid(host.current, { columns: 5 })
    field.start()
    return () => field.destroy()
  }, [])

  return <div ref={host} style={{ height: '70vh' }} />
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createRubiksGrid } from '@/beamish/effects/rubiks-grid/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let field: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  field = createRubiksGrid(host.value)
  field.start()
})

onBeforeUnmount(() => field?.destroy())
</script>

<template><div ref="host" class="hero" /></template>
```

**Astro.** Nothing extra is required, but `three` has to be installed: this is
one of the few items here with a dependency.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `columns` | number | `5` | 1 to 14 (looks right between 3 and 8) | Cubes across the frame. Rows follow from it and the aspect, so the field always fills the box. This is the density control and the performance control at once: the work goes with the square of it, so 10 is four times 5. |
| `scheme` | enum | `classic` | `classic` · `neon` · `ocean` · `sunset` · `monochrome` | The six sticker colours. `classic` is the real cube's palette. `monochrome` is the one worth seeing once: with the colour gone you watch the geometry instead, and it becomes obvious how much of the effect is the turning rather than the palette. |
| `turn` | number | `0.4` | 0.08 to 2 s (looks right between 0.25 and 0.6) | Seconds one quarter turn takes. The easing inside it is a finger flick rather than a symmetric curve: quick away, slow home, with the weight at the end. That is the single thing that makes the motion feel like fingers instead of like a motor. |
| `rest` | number | `0.2` | 0 to 3 s (looks right between 0.1 and 0.6) | Seconds a cube sits still between turns. Most of the charm is here. At 0 nothing ever stops and the field reads as a machine; a pause lets each turn land before the next one starts. |
| `moves` | number | `5` | 1 to 20 (looks right between 3 and 8) | Turns of scramble before the cube undoes them and returns to solved. The whole loop is twice this, so it is also what sets the length of the animation: at the default beat, 5 moves is a six second cycle. |
| `sync` | boolean | `false` | `true` · `false` | Every cube turns at the same moment rather than each on its own offset. Worth trying both: in sync the field reads as one object breathing, and out of sync it reads as a room full of people each solving their own. |
| `tilt` | number | `30` | 0 to 60 deg (looks right between 24 and 38) | How far the field tilts out of flat. 30 with the fixed eighth-turn is the classic isometric pair, and it is why a cube drawn this way shows three faces of equal width. Away from 30 it is still a nice axonometric view, just not an isometric one. |
| `body` | color | `#141318` | any CSS hex | The plastic between the stickers. Near-black rather than black: a true black body against bright stickers reads as gaps rather than as a cube. |
| `seed` | number | `7` | 1 to 9999 | Seed for the scramble. The same seed gives the same sequence in the same order, which is what makes a recording reproducible. |
| `maxDpr` | number | `2` | 1 to 3 | Device pixel ratio ceiling. Flat isometric faces meeting at hard edges alias badly, so this is worth leaving at 2. |
| `reducedMotionTime` | number | `1.2` | 0 to 30 s | The single frame shown when the user prefers reduced motion. Pick a moment mid-scramble rather than 0: at 0 every cube is solved and the field is six flat colours, which says nothing about what the item does. |

## 5. The original keeps its state. This one cannot

The sketch does what any cube simulation does. Pick a move, reparent the nine
cubies of that layer to a pivot object, turn the pivot, reparent them back with
their positions snapped, push the move onto a history. Every frame is built
from the one before it.

Nothing here is allowed to do that. `renderAtTime(t)` has to answer for any
moment without having seen the moments before it, so a recorder can seek and so
a loop closes exactly. So the scene graph is never mutated and no history is
kept. Three things replace it:

**Every move is derived.** Cube number seven's fourth move is a function of the
seed and those two numbers. Same answer every time it is asked, and it can be
asked out of order.

**The state is rebuilt each frame.** At time `t` a cube is some whole number of
moves in and partway through the next, so its cubies are replayed from solved.
That is a few dozen integer permutations per cube, which costs nothing next to
the matrices that have to be written anyway.

**The cubie state is integer.** Each cubie carries a position in `{-1,0,1}` and
a 3x3 rotation whose entries are only ever `-1`, `0` or `1`. This is not an
optimisation. Replaying from solved means a cube late in a scramble has had
hundreds of turns composed, and in floating point that drifts: a cube that is
supposed to be solved comes back a fraction of a degree off, which on a flat
isometric face is a visible seam. Integers cannot drift.

## 6. The loop closes because the sequence undoes itself

Each cube scrambles for `moves` turns, then replays those same turns backwards
and in reverse order. That is the standard inverse scramble, and it returns the
cube exactly to solved.

It is the original's **solve button**, turned into the shape of the animation
rather than a control sitting on top of it.

One detail that is easy to miss: when the cubes are out of step with each
other, their offsets are **whole numbers of turns**, never fractions of one. A
fractional offset would mean the field never returns to the frame it started
on, and a recording of it would jump once per loop.

## 7. Isometric means orthographic

The camera has no perspective in it at all. A cube at the edge of the frame has
to be exactly the same size and shape as one in the middle, or the field stops
tiling and starts being a scene with a vanishing point.

The angles are a tilt of 30 degrees and a turn of an eighth. That pair is what
makes a cube show three faces of equal width, which is the whole look. `tilt`
is adjustable, but away from 30 you have a nice axonometric view rather than an
isometric one.

## 8. Seven draw calls

The original gives every cubie its own mesh with six materials. Readable, and
at a 6x4 grid that is 648 meshes before you count the stickers.

Here the cubie bodies are one instanced mesh and the stickers are one more per
colour, so the whole field is **seven draw calls whatever its size**. The real
per-frame cost is writing the instance matrices, and that is the same either
way.

Which faces of a cubie carry a sticker is decided by **where it started**, not
where it is now. That is what keeps exactly nine of each colour however
scrambled it gets.

## 9. Tuning it

1. **`columns`.** The density and the cost at once, since rows follow from it
   and the aspect. The work goes with the square, so 10 is four times 5.
2. **`rest`.** Most of the charm. At 0 nothing ever stops and the field reads
   as a machine. A pause lets each turn land before the next starts.
3. **`sync`.** Worth trying both. In sync the field reads as one object
   breathing; out of sync it reads as a room full of people each solving their
   own.
4. **`moves`.** Also the loop length, because the cycle is twice it. At the
   default beat, 5 moves is a six second loop.
5. **`scheme`.** Set it to `monochrome` once. With the colour gone you watch
   the geometry instead, and it is obvious how much of the effect is the
   turning rather than the palette.

## 10. Two small decisions

**The middle layer is never turned.** It moves no corner, so at this size it
reads as a glitch rather than as a move.

**three's colour management is switched off**, so a colour written in the
palette is the colour that lands. With it on, three converts every colour from
sRGB into linear light on the way in, and the sticker reds come out muddy and
the whites come out grey.

## 11. Accessibility. Do not skip this

Decorative, and there is nothing in the canvas for assistive technology. Under
reduced motion the loop never starts and one frame is drawn, the one at
`reducedMotionTime`. Pick a moment mid-scramble rather than 0: at 0 every cube
is solved and the field is six flat colours, which says nothing about what the
item does.

## 12. Cleanup and SSR

`destroy()` releases the WebGL context, disposes every geometry and material,
cancels the RAF, disconnects the observers and removes every listener. One live
context at a time is the budget, so call it.

There is nothing to render on the server. The element is empty until the script
runs, so give it a height and, if it matters, a background.

## 13. The three mistakes most likely to be made here

1. **Keeping a move history.** It is the obvious way to write this and it makes
   the effect unrecordable, because no frame can be produced without producing
   every frame before it.

2. **Floating-point cubie orientations.** They drift over a few hundred
   replayed turns and a solved cube comes back visibly crooked.

3. **A perspective camera.** Isometric has no vanishing point. With perspective
   the cubes at the edges splay and the field stops tiling.

4. **Fractional offsets between cubes.** The grid never returns to its starting
   frame and the loop jumps.

5. **A mesh per cubie.** It works and it is readable, and it is hundreds of
   draw calls for a result that instancing gives you in seven.

---

Concept credit: A grid of Rubik's cubes in isometric projection with layers turning, from a procedurally generated Rubik's cube pattern posted to r/creativecoding. The standalone sketch this is adapted from is my own and is MIT; the idea was theirs, by u/Positive_Tea_1166 on r/creativecoding, https://www.reddit.com/r/creativecoding/comments/1r78hw2/procedurally_generated_rubiks_cube_pattern/.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
