/*
 * Where the wind field has no direction, and how violently it changes there.
 *
 * WindField flickers in patches, and it follows the seed and the wander
 * rather than the machine. Both of those move the pressure systems, so the
 * suspicion is a stagnation point: a spot where the systems cancel, the
 * speed goes to nothing, and the normalised direction is whatever the
 * rounding says. The shader walks a streamline through every pixel, so one
 * dead spot scatters every streak that passes near it.
 *
 * This is the field in plain arithmetic, with no GPU and no browser, so the
 * question can be answered exactly rather than inferred from pixels. For a
 * grid over the visible frame it reports the speed distribution and, for one
 * frame's worth of phase, how far the direction turns. A healthy field turns
 * a fraction of a degree. A stagnation point turns by any amount at all.
 *
 *   pnpm stagnation            # the shipped defaults
 *   pnpm stagnation 7 0.06     # seed, wander
 */

const TAU = Math.PI * 2
const fract = (x: number) => x - Math.floor(x)

/* The shader's hashes, exactly. */
const hash12 = (x: number, y: number) =>
  fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123)
const hash22 = (x: number, y: number, seed: number): [number, number] => [
  hash12(x + seed, y + seed),
  hash12(x + seed + 41.7, y + seed + 41.7)
]

type Opts = { seed: number; wander: number; systems: number; drift: number }

function wind(qx: number, qy: number, aspect: number, phase: number, o: Opts): [number, number] {
  let vx = o.drift
  let vy = 0
  for (let i = 0; i < o.systems; i++) {
    const [rx, ry] = hash22(i * 3.17 + 1, i * 7.91 + 2, o.seed)
    const homeX = (0.12 + 0.76 * rx) * aspect
    const homeY = 0.14 + 0.72 * ry
    const a = phase + rx * TAU
    const cx = homeX + Math.cos(a) * o.wander
    const cy = homeY + Math.sin(a) * o.wander
    const spin = fract(ry * 7.3) < 0.5 ? -1 : 1
    const rad = 0.15 + 0.17 * fract(rx * 13.1)
    const strength = 0.65 + 0.5 * fract(ry * 5.7)
    const dx = qx - cx
    const dy = qy - cy
    const k = Math.exp(-(dx * dx + dy * dy) / (2 * rad * rad))
    vx += (spin * strength * -dy * k) / rad
    vy += (spin * strength * dx * k) / rad
  }
  return [vx, vy]
}

function main() {
  const seed = Number(process.argv[2] ?? 11)
  const wander = Number(process.argv[3] ?? 0.06)
  const o: Opts = { seed, wander, systems: 4, drift: 0.42 }
  const aspect = 16 / 9
  const period = 24
  /* One frame at 164Hz, which is what the direction has to survive. */
  const dPhase = (TAU * (1 / 164)) / period

  const speeds: number[] = []
  let worstTurn = 0
  let worstAt = ''
  let turnedFar = 0
  let n = 0
  const N = 400
  for (let iy = 0; iy <= N; iy++) {
    for (let ix = 0; ix <= Math.round(N * aspect); ix++) {
      const qx = (ix / (N * aspect)) * aspect
      const qy = iy / N
      const [ax, ay] = wind(qx, qy, aspect, 0, o)
      const [bx, by] = wind(qx, qy, aspect, dPhase, o)
      const sa = Math.hypot(ax, ay)
      speeds.push(sa)
      /*
       * The direction the walk would actually use, under the candidate fix:
       * below CALM the local direction carries no information, so it blends
       * to the prevailing drift instead of to whatever the rounding said.
       * Pass a CALM of 0 to measure the shipped behaviour.
       */
      const CALM = Number(process.argv[4] ?? 0)
      const dir = (vx: number, vy: number) => {
        const s = Math.hypot(vx, vy)
        if (CALM <= 0) return Math.atan2(vy, vx)
        const t = Math.min(1, Math.max(0, s / CALM))
        const e = t * t * (3 - 2 * t)
        const ux = s > 1e-9 ? vx / s : 1
        const uy = s > 1e-9 ? vy / s : 0
        return Math.atan2(uy * e, 1 * (1 - e) + ux * e)
      }
      const turn = Math.abs(dir(ax, ay) - dir(bx, by))
      const wrapped = Math.min(turn, TAU - turn)
      if (wrapped > worstTurn) {
        worstTurn = wrapped
        worstAt = `${qx.toFixed(3)},${qy.toFixed(3)} speed ${sa.toExponential(2)}`
      }
      /* More than a degree in one frame is a streak that will not hold still. */
      if (wrapped > Math.PI / 180) turnedFar++
      n++
    }
  }
  speeds.sort((a, b) => a - b)
  const at = (f: number) => speeds[Math.floor(f * (speeds.length - 1))]!

  console.log(`\n  seed ${seed}, wander ${wander}, ${n} points over the visible frame\n`)
  console.log(`  speed   min ${at(0).toExponential(2)}   1% ${at(0.01).toFixed(3)}   ` +
    `median ${at(0.5).toFixed(3)}   max ${at(1).toFixed(2)}`)
  console.log(`  points slower than CALM 0.04: ${speeds.filter(s => s < 0.04).length}`)
  console.log(`  direction turning more than 1 degree in one frame: ${turnedFar}`)
  console.log(`  worst turn ${((worstTurn * 180) / Math.PI).toFixed(1)} degrees at ${worstAt}`)
}

main()
