/*
 * Paste this into the DevTools console on an effect page and wait two seconds.
 *
 * It reports what the effect is actually being given and what it actually
 * produces, on the machine that is showing the problem. Everything measured
 * from here has been measured on a different one.
 */
(async () => {
  const c = document.querySelector('[data-stage] canvas') || document.querySelector('canvas')
  if (!c) return console.log('BEAMISH: no canvas on this page')
  const gl = c.getContext('webgl2') || c.getContext('webgl')
  const proto = Object.getPrototypeOf(gl)

  const times = [], gaps = [], px = []
  let draws = 0, frames = 0, lastT
  const locs = new Map()

  const realU = proto.uniform1f
  proto.uniform1f = function (l, v) {
    if (l) { if (!locs.has(l)) locs.set(l, locs.size); if (locs.get(l) === 1) lastT = v }
    return realU.call(this, l, v)
  }
  const realD = proto.drawArrays
  proto.drawArrays = function (...a) {
    draws++
    const r = realD.apply(this, a)
    if (typeof lastT === 'number') times.push(lastT)
    return r
  }

  let last = performance.now()
  await new Promise(res => {
    const step = () => {
      const now = performance.now()
      gaps.push(now - last); last = now
      const b = new Uint8Array(4)
      try { gl.readPixels((c.width / 2) | 0, (c.height / 2) | 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); px.push(b[0] + ',' + b[1] + ',' + b[2]) } catch (e) {}
      if (++frames < 150) requestAnimationFrame(step); else res()
    }
    requestAnimationFrame(step)
  })

  proto.uniform1f = realU
  proto.drawArrays = realD

  const med = a => [...a].sort((x, y) => x - y)[a.length >> 1]
  const steps = times.slice(1).map((t, i) => t - times[i])
  const uniq = new Set(px)
  let ab = 0
  for (let i = 2; i < px.length; i++) if (px[i] === px[i - 2] && px[i] !== px[i - 1]) ab++

  console.log('BEAMISH PROBE', JSON.stringify({
    dpr: devicePixelRatio,
    buffer: c.width + 'x' + c.height,
    box: Math.round(c.getBoundingClientRect().width) + 'x' + Math.round(c.getBoundingClientRect().height),
    refreshHz: Math.round(1000 / med(gaps)),
    worstGapMs: Math.round(Math.max(...gaps)),
    drawsPerFrame: +(draws / frames).toFixed(2),
    clockFrom: times[0], clockTo: times[times.length - 1],
    clockBackwards: steps.filter(s => s <= 0).length,
    clockBiggestStep: +Math.max(...steps.map(Math.abs)).toFixed(4),
    distinctPixels: uniq.size + ' of ' + px.length,
    alternating: ab
  }, null, 1))
})()
