"use strict";
(() => {
  // shared/stage.ts
  var DEFAULTS = { margin: 0.12, floor: 0.08 };
  function createStage(sections2, opts = {}) {
    const margin = opts.margin ?? DEFAULTS.margin;
    const floor = opts.floor ?? DEFAULTS.floor;
    const seen = sections2.map(() => 0);
    let live = -1;
    let handle = null;
    let queued = 0;
    let destroyed = false;
    const steps = Array.from({ length: 21 }, (_, i) => i / 20);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const i = sections2.findIndex((s) => s.el === entry.target);
          if (i >= 0) seen[i] = entry.intersectionRatio;
        }
        schedule();
      },
      { threshold: steps }
    );
    function schedule() {
      if (destroyed || queued) return;
      queued = requestAnimationFrame(() => {
        queued = 0;
        settle();
      });
    }
    function settle() {
      if (destroyed) return;
      let best = -1;
      let bestRatio = floor;
      for (let i = 0; i < sections2.length; i++) {
        if (seen[i] > bestRatio) {
          best = i;
          bestRatio = seen[i];
        }
      }
      if (best === live) return;
      if (live >= 0 && best >= 0 && bestRatio - seen[live] < margin) return;
      handle?.destroy();
      handle = null;
      live = -1;
      if (best >= 0) {
        handle = sections2[best].create();
        handle.start();
        live = best;
      }
    }
    for (const section of sections2) observer.observe(section.el);
    return {
      get live() {
        return live;
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        if (queued) cancelAnimationFrame(queued);
        observer.disconnect();
        handle?.destroy();
        handle = null;
        live = -1;
      }
    };
  }

  // shared/ground.ts
  function pageGround(el) {
    for (let node = el; node; node = node.parentElement) {
      const colour = getComputedStyle(node).backgroundColor;
      if (isPainted(colour)) return colour;
    }
    const root = getComputedStyle(document.documentElement).backgroundColor;
    if (isPainted(root)) return root;
    const body = document.body && getComputedStyle(document.body).backgroundColor;
    if (body && isPainted(body)) return body;
    return "rgb(255, 255, 255)";
  }
  function isDarkGround(colour) {
    return relativeLuminance(colour) < 0.5;
  }
  function resolveAutoGrounds(el, opts) {
    let ground = null;
    let next = null;
    const page = () => ground ??= pageGround(el);
    const write = (key, value) => {
      next ??= { ...opts };
      next[key] = value;
    };
    for (const [key, value] of Object.entries(opts)) {
      if (typeof value !== "string") continue;
      const text = value.trim();
      const word = text.toLowerCase();
      if (word === "auto") {
        write(key, page());
        continue;
      }
      if (word.startsWith("light-dark(")) {
        const pair = splitPair(text);
        if (pair) write(key, isDarkGround(page()) ? pair[1] : pair[0]);
      }
    }
    return next ?? opts;
  }
  function splitPair(text) {
    const open = text.indexOf("(");
    const close = text.lastIndexOf(")");
    if (open < 0 || close < open) return null;
    const inner = text.slice(open + 1, close);
    let depth = 0;
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      else if (ch === "," && depth === 0) {
        return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()];
      }
    }
    return null;
  }
  function isPainted(colour) {
    if (!colour || colour === "transparent") return false;
    const parts = colour.match(/[\d.]+/g);
    if (!parts) return false;
    return !(parts.length >= 4 && Number(parts[3]) === 0);
  }
  function relativeLuminance(colour) {
    const [r, g, b] = toRgb(colour);
    const channel = (value) => {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  }
  function toRgb(colour) {
    const text = colour.trim();
    if (text.startsWith("#")) {
      const hex = text.length === 4 ? text[1] + text[1] + text[2] + text[2] + text[3] + text[3] : text.slice(1, 7);
      const n = Number.parseInt(hex, 16);
      return Number.isNaN(n) ? [255, 255, 255] : [n >> 16 & 255, n >> 8 & 255, n & 255];
    }
    const parts = text.match(/[\d.]+/g);
    if (!parts || parts.length < 3) return [255, 255, 255];
    return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
  }

  // shared/runtime.ts
  var REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
  var clamp01 = (n) => n < 0 ? 0 : n > 1 ? 1 : n;
  var samplePointerPath = (keys, t, duration) => {
    if (keys.length === 0) return { x: 0.5, y: 0.5, active: false };
    const first = keys[0];
    if (keys.length === 1) return { x: first.x, y: first.y, active: true };
    const span2 = duration > 0 ? duration : keys[keys.length - 1].t;
    const local = span2 > 0 ? (t % span2 + span2) % span2 : 0;
    let a = first;
    let b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) {
      const lo = keys[i];
      const hi = keys[i + 1];
      if (local >= lo.t && local <= hi.t) {
        a = lo;
        b = hi;
        break;
      }
    }
    const gap = b.t - a.t;
    const k = gap > 0 ? clamp01((local - a.t) / gap) : 0;
    const e = k * k * (3 - 2 * k);
    return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, active: true };
  };
  var sampleScrollPath = (keys, t, duration) => {
    if (keys.length === 0) return { progress: 0, velocity: 0, active: false };
    const first = keys[0];
    if (keys.length === 1) return { progress: first.progress, velocity: 0, active: true };
    const span2 = duration > 0 ? duration : keys[keys.length - 1].t;
    const local = span2 > 0 ? (t % span2 + span2) % span2 : 0;
    let a = first;
    let b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) {
      const lo = keys[i];
      const hi = keys[i + 1];
      if (local >= lo.t && local <= hi.t) {
        a = lo;
        b = hi;
        break;
      }
    }
    const gap = b.t - a.t;
    const k = gap > 0 ? clamp01((local - a.t) / gap) : 0;
    const e = k * k * (3 - 2 * k);
    const delta = b.progress - a.progress;
    return {
      progress: a.progress + delta * e,
      velocity: gap > 0 ? delta * 6 * k * (1 - k) / gap : 0,
      active: true
    };
  };
  function mount(el, userOpts, config) {
    let opts = resolveAutoGrounds(el, { ...config.defaults, ...userOpts ?? {} });
    const kind = config.kind ?? "canvas";
    let canvas = null;
    if (kind === "canvas") {
      canvas = document.createElement("canvas");
      canvas.style.display = "block";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.visibility = "hidden";
      if (config.canvasClass) canvas.className = config.canvasClass;
      el.appendChild(canvas);
    }
    let surface = null;
    let size = measure();
    let raf = 0;
    let running = false;
    let destroyed = false;
    let contextLost = false;
    let elapsed = 0;
    let lastStamp = 0;
    const pointer = { x: 0.5, y: 0.5, active: false };
    const scroll = { progress: 0, velocity: 0, active: false };
    let scrollStarted = false;
    let scrollSeeded = false;
    const VELOCITY_HALF_LIFE = 0.07;
    function sampleScroll(dt) {
      const rect = el.getBoundingClientRect();
      const viewport = window.innerHeight || 1;
      const span2 = viewport + rect.height;
      const next = span2 > 0 ? clamp01((viewport - rect.top) / span2) : 0;
      if (!scrollSeeded) {
        scroll.progress = next;
        scrollSeeded = true;
        return;
      }
      if (dt > 0) {
        const instant = (next - scroll.progress) / dt;
        const k = 1 - Math.pow(0.5, dt / VELOCITY_HALF_LIFE);
        scroll.velocity += (instant - scroll.velocity) * k;
        if (Math.abs(scroll.velocity) < 1e-4) scroll.velocity = 0;
      }
      if (next !== scroll.progress) scrollStarted = true;
      scroll.progress = next;
      scroll.active = scrollStarted;
    }
    const motionQuery = typeof matchMedia === "function" ? matchMedia(REDUCED_MOTION_QUERY) : null;
    let reduced = motionQuery?.matches ?? false;
    function measure() {
      const rect = el.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const cap = opts.maxDpr ?? 2;
      const dpr = Math.min(window.devicePixelRatio || 1, cap);
      return {
        width,
        height,
        pixelWidth: Math.max(1, Math.round(width * dpr)),
        pixelHeight: Math.max(1, Math.round(height * dpr)),
        dpr
      };
    }
    function applySize() {
      size = measure();
      if (canvas) {
        if (canvas.width !== size.pixelWidth) canvas.width = size.pixelWidth;
        if (canvas.height !== size.pixelHeight) canvas.height = size.pixelHeight;
      }
      surface?.resize(size);
    }
    function pointerAt(t) {
      const path = opts.pointerPath;
      if (path && path.length > 0) {
        return samplePointerPath(path, t, opts.pointerPathDuration ?? 0);
      }
      return pointer;
    }
    function scrollAt(t) {
      const path = opts.scrollPath;
      if (path && path.length > 0) {
        return sampleScrollPath(path, t, opts.scrollPathDuration ?? 0);
      }
      return scroll;
    }
    function draw(t) {
      if (!surface || contextLost) return;
      surface.render(t, opts, pointerAt(t), scrollAt(t));
      if (canvas && canvas.style.visibility === "hidden") canvas.style.visibility = "";
    }
    function tick(stamp) {
      if (!running) return;
      const dt = Math.min(stamp - lastStamp, 100) / 1e3;
      elapsed += dt;
      lastStamp = stamp;
      sampleScroll(dt);
      draw(elapsed);
      raf = requestAnimationFrame(tick);
    }
    function ensureSurface() {
      if (surface || destroyed) return;
      surface = config.create();
      surface.setup({ host: el, canvas, size });
      surface.resize(size);
    }
    function start() {
      if (destroyed || running || contextLost) return;
      ensureSurface();
      if (reduced) {
        draw(opts.reducedMotionTime ?? 0);
        return;
      }
      running = true;
      lastStamp = performance.now();
      raf = requestAnimationFrame(tick);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      scroll.velocity = 0;
    }
    const onLost = (event) => {
      event.preventDefault();
      contextLost = true;
      stop();
      surface?.teardown();
      surface = null;
    };
    const onRestored = () => {
      contextLost = false;
      if (destroyed) return;
      ensureSurface();
      applySize();
      if (visible) start();
    };
    canvas?.addEventListener("webglcontextlost", onLost, false);
    canvas?.addEventListener("webglcontextrestored", onRestored, false);
    const windowScope = opts.pointerScope === "window";
    const onPointerMove = (event) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      pointer.x = windowScope ? x : clamp01(x);
      pointer.y = windowScope ? y : clamp01(y);
      pointer.active = true;
    };
    const onPointerLeave = () => {
      pointer.active = false;
    };
    const pointerTarget = windowScope ? window : el;
    pointerTarget.addEventListener("pointermove", onPointerMove);
    if (!windowScope) el.addEventListener("pointerleave", onPointerLeave);
    let visible = true;
    let wantedByUser = false;
    const resizeObserver = new ResizeObserver(() => {
      if (destroyed) return;
      applySize();
      draw(reduced ? opts.reducedMotionTime ?? 0 : elapsed);
    });
    resizeObserver.observe(el);
    const intersectionObserver = opts.pauseWhenOffscreen === false ? null : new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        visible = entry.isIntersecting;
        if (visible) {
          if (wantedByUser) start();
        } else {
          stop();
        }
      },
      { threshold: 0 }
    );
    intersectionObserver?.observe(el.parentElement ?? el);
    const onVisibilityChange = () => {
      if (document.hidden) stop();
      else if (wantedByUser && visible) start();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const onMotionChange = (event) => {
      reduced = event.matches;
      if (reduced) {
        stop();
        ensureSurface();
        draw(opts.reducedMotionTime ?? 0);
      } else if (wantedByUser && visible) {
        start();
      }
    };
    motionQuery?.addEventListener("change", onMotionChange);
    const handle = {
      start() {
        wantedByUser = true;
        if (visible && !document.hidden) start();
      },
      stop() {
        wantedByUser = false;
        stop();
      },
      update(next) {
        opts = resolveAutoGrounds(el, { ...opts, ...next });
        applySize();
        if (!running) draw(reduced ? opts.reducedMotionTime ?? 0 : elapsed);
      },
      renderAtTime(t) {
        if (destroyed) return;
        ensureSurface();
        elapsed = t;
        draw(t);
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        stop();
        motionQuery?.removeEventListener("change", onMotionChange);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        intersectionObserver?.disconnect();
        resizeObserver.disconnect();
        pointerTarget.removeEventListener("pointermove", onPointerMove);
        el.removeEventListener("pointerleave", onPointerLeave);
        canvas?.removeEventListener("webglcontextlost", onLost);
        canvas?.removeEventListener("webglcontextrestored", onRestored);
        const gl = surface?.context?.() ?? null;
        surface?.teardown();
        surface = null;
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
        canvas?.remove();
      }
    };
    return handle;
  }

  // effects/aurora-curtain/core.ts
  var auroraCurtainDefaults = {
    sky: "#070b18",
    low: "#45efa0",
    high: "#d8468f",
    curtains: 3,
    height: 0.3,
    fold: 0.62,
    rays: 0.8,
    pitch: 40,
    brightness: 0.8,
    stars: 0.5,
    horizon: 0.45,
    grain: 0.3,
    period: 36,
    reducedMotionTime: 7
  };
  var VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;
  var FRAG = `#version 300 es
precision highp float;

/*
 * AuroraCurtain: the northern lights, built the way they are made.
 *
 * It is not a rainbow gradient with some noise on it, and the difference is
 * most of why those read as wallpaper. An aurora is emission: electrons follow
 * the magnetic field down into the atmosphere and excite gas along the way, so
 * everything about its shape follows from that.
 *
 *   It hangs in vertical rays, because the field lines are near vertical at
 *   those latitudes and the light is emitted along them. That is the striation,
 *   and it is the single most recognisable thing about an aurora.
 *
 *   The bottom edge is sharp and the top is not. The electrons stop at the
 *   altitude where the air finally gets thick enough, which is an abrupt floor
 *   at around 100km, and thin out upwards over hundreds of kilometres.
 *
 *   The colour is altitude. Atomic oxygen gives the green line at 557.7nm low
 *   down, and the red line at 630nm higher up where collisions are rare enough
 *   to let the slower transition happen. So green at the foot running to red at
 *   the top, never the other way round and never a hue cycle.
 *
 *   The curtain folds along its length rather than waving as a whole. What you
 *   are looking at is a sheet seen edge on, so a fold reads as a bright rib.
 *
 * Everything moves on sums of sines whose time coefficients are whole numbers
 * of turns over the period, so the loop closes exactly. A noise field advanced
 * by time would never return to its first frame, and the recorder needs it to.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_sky;
uniform vec3  u_low;
uniform vec3  u_high;

uniform float u_curtains;
uniform float u_height;
uniform float u_fold;
uniform float u_rays;
uniform float u_pitch;
uniform float u_brightness;
uniform float u_stars;
uniform float u_horizon;
uniform float u_grain;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/*
 * The fold of one curtain along its length.
 *
 * Three sines, and the time coefficients are 1, 2 and 3 turns over the period.
 * Whole numbers are not a detail: a fractional one never comes back to where it
 * started, and the video jumps once a cycle.
 */
float fold(float x, float phase, float seed) {
  float s = sin(x * 2.1 + phase + seed) * 0.55;
  s += sin(x * 4.3 - phase * 2.0 + seed * 2.1) * 0.3;
  s += sin(x * 8.7 + phase * 3.0 + seed * 3.7) * 0.15;
  return s;
}

/*
 * A note on those spatial frequencies, because the first version of this had
 * them ten times too low and the mistake is invisible in the maths.
 *
 * x spans the aspect ratio, so about 1.8 on a wide frame. A term at sin(x * 0.7)
 * turns through 1.25 radians across the whole canvas, which is a fifth of a
 * cycle: not a fold, a tilt. Every curtain came out as one smooth arc and the
 * stack of them read as a hillside. A frequency here is only meaningful against
 * the width it has to cross.
 */

/*
 * The vertical rays, as a modulation along the curtain rather than across it.
 *
 * Three more sines at a much higher spatial frequency. They drift faster than
 * the fold does, which is what makes the curtain look like it is being fed
 * light from somewhere rather than simply swaying.
 */
float striation(float x, float phase, float seed) {
  float s = sin(x * u_pitch + phase * 2.0 + seed) * 0.5;
  s += sin(x * u_pitch * 2.3 - phase * 3.0 + seed * 1.7) * 0.3;
  s += sin(x * u_pitch * 4.7 + phase * 5.0 + seed * 2.9) * 0.2;
  return s;
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  // y runs 0 at the horizon to 1 at the top of the frame, which is the way an
  // aurora is measured and saves flipping it in every term below.
  vec2 uv = cssPx / cssRes;
  float aspect = cssRes.x / max(cssRes.y, 1.0);
  float x = (uv.x - 0.5) * aspect;

  float phase = TAU * u_time / max(u_period, 0.001);

  vec3 col = u_sky;

  /*
   * Stars first, so the aurora washes over them rather than sitting under them.
   *
   * One candidate per cell of a fixed grid, which needs no sorting and cannot
   * drift. They do not twinkle: a twinkle is atmospheric scintillation, it is
   * strongest near the horizon and nearly absent overhead, and faking it evenly
   * across the frame costs a per-frame change in every pixel for something
   * nobody looks at.
   */
  vec2 grid = uv * vec2(aspect, 1.0) * 150.0;
  vec2 cell = floor(grid);
  float pick = hash12(cell);
  vec2 at = vec2(hash12(cell + 11.3), hash12(cell + 27.7));
  float d = length(fract(grid) - at);
  float star = step(0.985, pick) * exp(-d * d * 90.0);
  // Brighter overhead, because low stars are seen through more air.
  col += vec3(0.85, 0.89, 1.0) * star * u_stars * smoothstep(0.0, 0.5, uv.y);

  /*
   * A little light on the horizon. Nowhere on Earth is the bottom of the sky
   * as dark as the top: there is always a town somewhere behind you.
   */
  col += u_sky * u_horizon * 3.5 * exp(-uv.y * 6.0);

  int count = int(clamp(u_curtains, 1.0, 3.0));
  vec3 glow = vec3(0.0);

  for (int i = 0; i < 3; i++) {
    if (i >= count) break;
    float fi = float(i);
    float seed = fi * 2.399;

    /*
     * Each curtain is further away than the last: lower in the frame, dimmer,
     * and folded on a slightly different scale. Depth is the whole reason to
     * draw more than one, so if they share a scale they read as one curtain
     * drawn three times.
     */
    float depth = 1.0 - fi * 0.26;
    float scale = 1.0 + fi * 0.37;

    /*
     * Where the foot of this curtain sits. Low in the frame but not at the
     * bottom of it: the bright core is the part worth looking at, and a foot on
     * the horizon line puts it half off the canvas.
     */
    float base = 0.3 + fi * 0.12 + u_fold * fold(x * scale, phase, seed) * 0.14;
    float h = uv.y - base;
    float reach = max(u_height * depth, 0.01);

    /*
     * Two falloffs rather than one, because an aurora is not an even glow: it
     * has a bright core just above the floor, where the air is still dense
     * enough to light up properly, and a long faint tail above it. One
     * exponential gives you the tail or the core, never both, and a single
     * middling one is the gradient wash this effect looked like at first.
     *
     * Both are exponentials, so a curtain still has no top edge. It runs out.
     */
    float tail = exp(-max(h, 0.0) / reach) * 0.22;
    float core = exp(-max(h, 0.0) / (reach * 0.34)) * 0.95;
    float floorEdge = smoothstep(-0.01, 0.018, h);
    // And a little spill below the foot, which is scattered light in the air
    // under it rather than emission.
    float spill = exp(-max(-h, 0.0) / (reach * 0.14)) * 0.16;

    /*
     * Where along its length this curtain is lit at all.
     *
     * This is the part that decides whether the thing reads as a sheet or as a
     * band of colour across the frame. A real curtain has ends and gaps: it is
     * bright in sections and absent in between, and without that every curtain
     * spans the whole width evenly and the eye has nothing to hold onto.
     */
    float env = 0.5 + 0.5 * fold(x * scale * 0.42 + 3.1, phase + 1.7, seed * 1.3);
    env = smoothstep(0.3, 0.95, env);

    float rays = 0.5 + 0.5 * striation(x * scale + fi * 7.0, phase, seed) * u_rays;
    float amount = ((tail + core) * floorEdge + spill) * max(rays, 0.0) * env * depth;

    // Green at the foot, red at the top. Altitude is the only thing that sets
    // the colour of an aurora, so it is the only thing that sets it here.
    vec3 tint = mix(u_low, u_high, clamp(h / (reach * 2.6), 0.0, 1.0));
    glow += tint * amount;
  }

  col += glow * u_brightness;

  /*
   * A soft shoulder rather than a clamp. Three curtains crossing can easily sum
   * past 1, and clipping turns the overlap into a flat white patch with a hard
   * edge, which is the one thing that never happens in the sky.
   */
  col = vec3(1.0) - exp(-col);

  // Grain, which on a dark ground reads as the sensor noise of a long exposure.
  // Static rather than per-frame: film grain that crawls is a different effect
  // and a far noisier one.
  float tooth = hash12(floor(gl_FragCoord.xy * 0.5)) - 0.5;
  col += tooth * 0.03 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
  var UNIFORMS = [
    "u_resolution",
    "u_dpr",
    "u_time",
    "u_period",
    "u_sky",
    "u_low",
    "u_high",
    "u_curtains",
    "u_height",
    "u_fold",
    "u_rays",
    "u_pitch",
    "u_brightness",
    "u_stars",
    "u_horizon",
    "u_grain"
  ];
  function parseColor(input) {
    const value = input.trim();
    if (value.startsWith("#")) {
      let hex = value.slice(1);
      if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      const n = Number.parseInt(hex.slice(0, 6), 16);
      if (Number.isNaN(n)) return [0, 0, 0];
      return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
    }
    const nums = value.match(/[\d.]+/g);
    if (nums && nums.length >= 3) {
      return [Number(nums[0]) / 255, Number(nums[1]) / 255, Number(nums[2]) / 255];
    }
    return [0, 0, 0];
  }
  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("AuroraCurtain: could not create shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`AuroraCurtain: shader failed to compile
${log ?? ""}`);
    }
    return shader;
  }
  var AuroraCurtainSurface = class {
    gl = null;
    program = null;
    vao = null;
    locations = /* @__PURE__ */ new Map();
    size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 };
    setup(ctx) {
      if (!ctx.canvas) throw new Error("AuroraCurtain needs a canvas");
      const gl = ctx.canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        // The recorder reads pixels back after the draw call, and without this the
        // buffer may already have been cleared.
        preserveDrawingBuffer: true,
        powerPreference: "low-power"
      });
      if (!gl) throw new Error("AuroraCurtain needs WebGL2, which this browser did not provide");
      const vert = compile(gl, gl.VERTEX_SHADER, VERT);
      const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG);
      const program = gl.createProgram();
      if (!program) throw new Error("AuroraCurtain: could not create program");
      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`AuroraCurtain: program failed to link
${log ?? ""}`);
      }
      const vao = gl.createVertexArray();
      this.gl = gl;
      this.program = program;
      this.vao = vao;
      this.locations.clear();
      for (const name of UNIFORMS) {
        this.locations.set(name, gl.getUniformLocation(program, name));
      }
    }
    resize(size) {
      this.size = size;
      this.gl?.viewport(0, 0, size.pixelWidth, size.pixelHeight);
    }
    render(t, opts) {
      const gl = this.gl;
      const program = this.program;
      if (!gl || !program) return;
      gl.useProgram(program);
      gl.bindVertexArray(this.vao);
      const at2 = (name) => this.locations.get(name) ?? null;
      gl.uniform2f(at2("u_resolution"), this.size.pixelWidth, this.size.pixelHeight);
      gl.uniform1f(at2("u_dpr"), this.size.dpr);
      gl.uniform1f(at2("u_time"), t);
      gl.uniform1f(at2("u_period"), opts.period);
      gl.uniform3fv(at2("u_sky"), parseColor(opts.sky));
      gl.uniform3fv(at2("u_low"), parseColor(opts.low));
      gl.uniform3fv(at2("u_high"), parseColor(opts.high));
      gl.uniform1f(at2("u_curtains"), opts.curtains);
      gl.uniform1f(at2("u_height"), opts.height);
      gl.uniform1f(at2("u_fold"), opts.fold);
      gl.uniform1f(at2("u_rays"), opts.rays);
      gl.uniform1f(at2("u_pitch"), opts.pitch);
      gl.uniform1f(at2("u_brightness"), opts.brightness);
      gl.uniform1f(at2("u_stars"), opts.stars);
      gl.uniform1f(at2("u_horizon"), opts.horizon);
      gl.uniform1f(at2("u_grain"), opts.grain);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    }
    context() {
      return this.gl;
    }
    teardown() {
      const gl = this.gl;
      if (!gl) return;
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.program) gl.deleteProgram(this.program);
      this.vao = null;
      this.program = null;
      this.locations.clear();
      this.gl = null;
    }
  };
  function createAuroraCurtain(el, opts = {}) {
    return mount(el, opts, {
      defaults: auroraCurtainDefaults,
      create: () => new AuroraCurtainSurface()
    });
  }
  var core_default = createAuroraCurtain;

  // effects/light-shafts/core.ts
  var lightShaftsDefaults = {
    ground: "#e7e2d6",
    light: "#fff6e2",
    angle: 128,
    distance: 1.6,
    bars: 7,
    gap: 0.44,
    softness: 0.06,
    spread: 1.5,
    reach: 2.1,
    strength: 0.26,
    dust: 0.7,
    drift: 4,
    period: 42,
    reducedMotionTime: 10
  };
  var VERT2 = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;
  var FRAG2 = `#version 300 es
precision highp float;

/*
 * LightShafts: light through an occluder, falling across the frame in bands.
 *
 * The whole image comes from one quantity: the angle from the source to the
 * pixel. The occluder is a repeating profile of bars and gaps read against that
 * angle, which is why the beams fan out from the source rather than running
 * parallel down the frame. Push the source far enough away and the fan becomes
 * parallel on its own, because that is what distance does to a fan.
 *
 * Two details carry it, and both are cheap.
 *
 * The shadow edges soften with distance travelled. A shadow is sharp only near
 * the thing that cast it: the source has width, so the half-shadow grows as the
 * shadow runs. Leave this out and the beams are triangles with hard sides, which
 * is what every version of this effect looks like.
 *
 * The motes are drawn only inside the beams. Light in clean air is invisible
 * from the side, so the dust is not decoration laid over the shafts, it is the
 * reason there is anything to see.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_ground;
uniform vec3  u_light;
uniform float u_angle;
uniform float u_distance;
uniform float u_bars;
uniform float u_gap;
uniform float u_softness;
uniform float u_spread;
uniform float u_reach;
uniform float u_strength;
uniform float u_dust;
uniform float u_drift;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = max(min(cssRes.x, cssRes.y), 1.0);
  vec2 p = (cssPx - cssRes * 0.5) / shortSide;

  /*
   * The source, off frame. The swing is a sine of the phase so it returns to
   * where it started: a source that travels a full circle crosses the frame on
   * the way round, and a light passing through the room it is lighting is a
   * different effect entirely.
   */
  float phase = TAU * u_time / max(u_period, 0.001);
  float a = radians(u_angle + u_drift * sin(phase));
  vec2 source = vec2(cos(a), sin(a)) * max(u_distance, 0.02);

  vec2 toPixel = p - source;
  float travelled = length(toPixel);
  float bearing = atan(toPixel.y, toPixel.x);

  /*
   * The occluder, read against the bearing. Scaled by the distance of the
   * source so the bars keep the same apparent width on the frame as the source
   * is moved out: without this, pushing the light away to straighten the beams
   * also squeezes them all into a sliver.
   */
  float across = bearing * max(u_distance, 0.02) * u_bars;
  float within = abs(fract(across) - 0.5) * 2.0;

  /*
   * The penumbra. The edge of a shadow is sharp only near the thing that cast
   * it, because the source has width and the half-shadow it throws grows with
   * the distance the shadow has run. One multiplication, and it is the whole
   * difference between a beam and a triangle.
   */
  float blur = u_softness * (1.0 + u_spread * travelled);
  float edge = 1.0 - clamp(u_gap, 0.01, 0.99);
  float open = smoothstep(edge + blur, max(edge - blur, 0.0), within);

  // How far the light gets. Beyond its reach the room is just the room.
  float falloff = exp(-travelled / max(u_reach, 0.01));

  float beam = open * falloff * u_strength;

  /*
   * Motes, and only inside the beam. They drift across it rather than along it,
   * because dust in a room is moved by the air and not by the light, and the
   * drift is a whole number of turns over the period so the loop closes.
   *
   * The drift is very small on purpose. Dust hangs: it does not stream. The
   * first pass moved the mote field fifteen of its own widths over a period,
   * which measured three times the change per frame of everything else here put
   * together, for something that read as the air being blown out of the room.
   */
  vec2 air = p * 26.0 + vec2(sin(phase) * 0.14, cos(phase) * 0.09);
  float motes = noise(air) * noise(air * 2.7 + 11.0);
  motes = smoothstep(0.34, 0.72, motes);
  beam *= 1.0 + motes * u_dust * 1.1;

  // Plus the light that has bounced around the room and arrives from nowhere in
  // particular. Without it the unlit bands are flat and the frame reads as two
  // colours rather than as one room.
  float ambient = falloff * 0.22 * u_strength;

  vec3 col = u_ground + u_light * (beam + ambient);

  float tooth = hash12(floor(gl_FragCoord.xy)) - 0.5;
  col += tooth * 0.012;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
  var UNIFORMS2 = [
    "u_resolution",
    "u_dpr",
    "u_time",
    "u_period",
    "u_ground",
    "u_light",
    "u_angle",
    "u_distance",
    "u_bars",
    "u_gap",
    "u_softness",
    "u_spread",
    "u_reach",
    "u_strength",
    "u_dust",
    "u_drift"
  ];
  function rgb(value) {
    const hex = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(hex)) {
      return [
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255
      ];
    }
    const nums = value.match(/[\d.]+/g);
    if (nums && nums.length >= 3) {
      return [Number(nums[0]) / 255, Number(nums[1]) / 255, Number(nums[2]) / 255];
    }
    return [0, 0, 0];
  }
  function compile2(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("LightShafts: could not create shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`LightShafts: shader failed to compile
${log ?? ""}`);
    }
    return shader;
  }
  var LightShaftsSurface = class {
    gl = null;
    program = null;
    vao = null;
    locations = /* @__PURE__ */ new Map();
    size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 };
    setup(ctx) {
      if (!ctx.canvas) throw new Error("LightShafts needs a canvas");
      const gl = ctx.canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        // The recorder reads pixels back after the draw call, and without this the
        // buffer may already have been cleared.
        preserveDrawingBuffer: true,
        powerPreference: "low-power"
      });
      if (!gl) throw new Error("LightShafts needs WebGL2, which this browser did not provide");
      const vert = compile2(gl, gl.VERTEX_SHADER, VERT2);
      const frag = compile2(gl, gl.FRAGMENT_SHADER, FRAG2);
      const program = gl.createProgram();
      if (!program) throw new Error("LightShafts: could not create program");
      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`LightShafts: program failed to link
${log ?? ""}`);
      }
      const vao = gl.createVertexArray();
      this.gl = gl;
      this.program = program;
      this.vao = vao;
      this.locations.clear();
      for (const name of UNIFORMS2) {
        this.locations.set(name, gl.getUniformLocation(program, name));
      }
    }
    resize(size) {
      this.size = size;
      this.gl?.viewport(0, 0, size.pixelWidth, size.pixelHeight);
    }
    render(t, opts) {
      const gl = this.gl;
      const program = this.program;
      if (!gl || !program) return;
      gl.useProgram(program);
      gl.bindVertexArray(this.vao);
      const loc = (name) => this.locations.get(name) ?? null;
      gl.uniform2f(loc("u_resolution"), this.size.pixelWidth, this.size.pixelHeight);
      gl.uniform1f(loc("u_dpr"), this.size.dpr);
      gl.uniform1f(loc("u_time"), t);
      gl.uniform1f(loc("u_period"), opts.period);
      gl.uniform3fv(loc("u_ground"), rgb(opts.ground));
      gl.uniform3fv(loc("u_light"), rgb(opts.light));
      gl.uniform1f(loc("u_angle"), opts.angle);
      gl.uniform1f(loc("u_distance"), opts.distance);
      gl.uniform1f(loc("u_bars"), opts.bars);
      gl.uniform1f(loc("u_gap"), opts.gap);
      gl.uniform1f(loc("u_softness"), opts.softness);
      gl.uniform1f(loc("u_spread"), opts.spread);
      gl.uniform1f(loc("u_reach"), opts.reach);
      gl.uniform1f(loc("u_strength"), opts.strength);
      gl.uniform1f(loc("u_dust"), opts.dust);
      gl.uniform1f(loc("u_drift"), opts.drift);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    context() {
      return this.gl;
    }
    teardown() {
      const gl = this.gl;
      if (gl) {
        if (this.program) gl.deleteProgram(this.program);
        if (this.vao) gl.deleteVertexArray(this.vao);
      }
      this.gl = null;
      this.program = null;
      this.vao = null;
      this.locations.clear();
    }
  };
  function createLightShafts(el, opts = {}) {
    return mount(el, opts, {
      defaults: lightShaftsDefaults,
      create: () => new LightShaftsSurface()
    });
  }
  var core_default2 = createLightShafts;

  // effects/dust-motes/core.ts
  var dustMotesDefaults = {
    ground: "#17171c",
    mote: "#fdf6e4",
    pitch: 34,
    size: 1.5,
    haze: 0.72,
    light: 125,
    falloff: 0.65,
    drift: 0.75,
    sparkle: 0.12,
    seed: 7,
    period: 44,
    reducedMotionTime: 11
  };
  var VERT3 = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;
  var FRAG3 = `#version 300 es
precision highp float;

/*
 * DustMotes: dust in a room, as a field rather than a particle system.
 *
 * The frame is a lattice. Each cell holds one mote whose position is a function
 * of the cell, a seed and the clock, and a pixel looks only at the nine cells
 * around it. Nothing is stored and nothing is advanced, so the whole thing is
 * pure in t and the count is a division rather than a loop: ten thousand motes
 * cost what a hundred do.
 *
 * The depth of field is the part that matters. A real mote is a few micrometres
 * across, so at any focal distance nearly all of them are blurred smudges and
 * only a handful are sharp. Draw them all sharp and you have snow. Here each
 * mote carries a focus taken from its own hash, which sets both how wide it is
 * drawn and how faint: a blurred mote is spread over more area and so is dimmer,
 * which is what a lens does and what makes the two read as the same object at
 * different distances.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_ground;
uniform vec3  u_mote;
uniform float u_pitch;
uniform float u_size;
uniform float u_haze;
uniform float u_light;
uniform float u_falloff;
uniform float u_drift;
uniform float u_sparkle;
uniform float u_seed;

out vec4 fragColor;

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec2 hash22(vec2 p) {
  return vec2(hash12(p + u_seed), hash12(p + u_seed + 37.19));
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = max(min(cssRes.x, cssRes.y), 1.0);

  float pitch = max(u_pitch, 4.0);
  vec2 cell = cssPx / pitch;
  vec2 id = floor(cell);

  float phase = TAU * u_time / max(u_period, 0.001);

  /*
   * The light. A mote catches light rather than emitting it, so where it sits
   * in the frame decides how bright it is: the ones on the lit side read, the
   * ones away from it are nearly gone. Without this the field has no direction
   * and reads as static.
   */
  float a = radians(u_light);
  vec2 towards = vec2(cos(a), sin(a));
  vec2 fromCentre = (cssPx - cssRes * 0.5) / shortSide;
  float lit = 1.0 - u_falloff * (0.5 - dot(fromCentre, towards)) ;

  float ink = 0.0;

  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 nid = id + vec2(float(ox), float(oy));
      vec2 rnd = hash22(nid);

      /*
       * Where this cell's mote sits. It drifts on a closed path, so after one
       * period every mote is back where it started and the loop closes, and it
       * rises as often as it falls: dust in a lit room is moved by convection
       * rather than by gravity, and it hangs.
       */
      /*
       * One turn across, two turns up, both whole numbers over the period, so
       * every mote is back where it started when the loop comes round. The
       * first version used 0.7 turns on the vertical, which is a figure that
       * never returns: the seam measured 2.59 against a requirement of zero.
       */
      float wobble = phase + rnd.x * TAU;
      vec2 at = nid + 0.5 + (rnd - 0.5) * 0.8 +
        vec2(cos(wobble), sin(phase * 2.0 + rnd.y * TAU)) * u_drift * 0.5;

      /*
       * How far out of focus this one is. Most are, because at the scale of a
       * mote the depth of field is almost nothing. A blurred mote is spread
       * over more area and is therefore fainter, which is what a lens does: the
       * two together are what make a wide smudge and a tight point read as the
       * same object at different distances.
       */
      float focus = hash12(nid + 11.3);
      float blurred = u_haze * focus;
      float radius = (u_size / pitch) * (1.0 + blurred * 7.0);
      float brightness = 1.0 / (1.0 + blurred * 9.0);

      // A few are bright enough to read as sharp specks. Dust in a sunbeam does
      // this, and it is most of what makes the air look occupied.
      if (hash12(nid + 73.1) < u_sparkle) brightness *= 2.6;

      float d = length(cell - at);
      // A gaussian rather than a disc: a mote has no edge, in or out of focus.
      ink += exp(-(d * d) / max(radius * radius, 1e-6)) * brightness;
    }
  }

  vec3 col = u_ground + u_mote * clamp(ink, 0.0, 4.0) * max(lit, 0.0) * 0.5;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
  var UNIFORMS3 = [
    "u_resolution",
    "u_dpr",
    "u_time",
    "u_period",
    "u_ground",
    "u_mote",
    "u_pitch",
    "u_size",
    "u_haze",
    "u_light",
    "u_falloff",
    "u_drift",
    "u_sparkle",
    "u_seed"
  ];
  function rgb2(value) {
    const hex = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(hex)) {
      return [
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255
      ];
    }
    const nums = value.match(/[\d.]+/g);
    if (nums && nums.length >= 3) {
      return [Number(nums[0]) / 255, Number(nums[1]) / 255, Number(nums[2]) / 255];
    }
    return [0, 0, 0];
  }
  function compile3(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("DustMotes: could not create shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`DustMotes: shader failed to compile
${log ?? ""}`);
    }
    return shader;
  }
  var DustMotesSurface = class {
    gl = null;
    program = null;
    vao = null;
    locations = /* @__PURE__ */ new Map();
    size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 };
    setup(ctx) {
      if (!ctx.canvas) throw new Error("DustMotes needs a canvas");
      const gl = ctx.canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        // The recorder reads pixels back after the draw call, and without this the
        // buffer may already have been cleared.
        preserveDrawingBuffer: true,
        powerPreference: "low-power"
      });
      if (!gl) throw new Error("DustMotes needs WebGL2, which this browser did not provide");
      const vert = compile3(gl, gl.VERTEX_SHADER, VERT3);
      const frag = compile3(gl, gl.FRAGMENT_SHADER, FRAG3);
      const program = gl.createProgram();
      if (!program) throw new Error("DustMotes: could not create program");
      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`DustMotes: program failed to link
${log ?? ""}`);
      }
      this.gl = gl;
      this.program = program;
      this.vao = gl.createVertexArray();
      this.locations.clear();
      for (const name of UNIFORMS3) {
        this.locations.set(name, gl.getUniformLocation(program, name));
      }
    }
    resize(size) {
      this.size = size;
      this.gl?.viewport(0, 0, size.pixelWidth, size.pixelHeight);
    }
    render(t, opts) {
      const gl = this.gl;
      const program = this.program;
      if (!gl || !program) return;
      gl.useProgram(program);
      gl.bindVertexArray(this.vao);
      const loc = (name) => this.locations.get(name) ?? null;
      gl.uniform2f(loc("u_resolution"), this.size.pixelWidth, this.size.pixelHeight);
      gl.uniform1f(loc("u_dpr"), this.size.dpr);
      gl.uniform1f(loc("u_time"), t);
      gl.uniform1f(loc("u_period"), opts.period);
      gl.uniform3fv(loc("u_ground"), rgb2(opts.ground));
      gl.uniform3fv(loc("u_mote"), rgb2(opts.mote));
      gl.uniform1f(loc("u_pitch"), opts.pitch);
      gl.uniform1f(loc("u_size"), opts.size);
      gl.uniform1f(loc("u_haze"), opts.haze);
      gl.uniform1f(loc("u_light"), opts.light);
      gl.uniform1f(loc("u_falloff"), opts.falloff);
      gl.uniform1f(loc("u_drift"), opts.drift);
      gl.uniform1f(loc("u_sparkle"), opts.sparkle);
      gl.uniform1f(loc("u_seed"), opts.seed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    context() {
      return this.gl;
    }
    teardown() {
      const gl = this.gl;
      if (gl) {
        if (this.program) gl.deleteProgram(this.program);
        if (this.vao) gl.deleteVertexArray(this.vao);
      }
      this.gl = null;
      this.program = null;
      this.vao = null;
      this.locations.clear();
    }
  };
  function createDustMotes(el, opts = {}) {
    return mount(el, opts, {
      defaults: dustMotesDefaults,
      create: () => new DustMotesSurface()
    });
  }
  var core_default3 = createDustMotes;

  // effects/spotlight-card/core.ts
  var spotlightCardDefaults = {
    light: "#fff6e4",
    sheen: 0.5,
    spread: 0.85,
    edge: 0.7,
    shade: 0.5,
    ease: 0.12,
    reducedMotionTime: 0,
    /*
     * Window scope, so the sheen has started to move before the cursor reaches
     * the card. A lamp carried across a desk lights the card on the way.
     */
    pointerScope: "window"
  };
  var SpotlightCardSurface = class {
    host = null;
    layer = null;
    previousPosition = "";
    x = 0.5;
    y = 0.5;
    lit = 0;
    setup(ctx) {
      const host = ctx.host;
      this.host = host;
      this.previousPosition = host.style.position;
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      const layer = document.createElement("span");
      layer.setAttribute("aria-hidden", "true");
      layer.style.cssText = [
        "position:absolute",
        "inset:0",
        "pointer-events:none",
        "border-radius:inherit",
        "will-change:background,box-shadow"
      ].join(";");
      host.append(layer);
      this.layer = layer;
    }
    resize() {
    }
    render(_t, opts, pointer) {
      const layer = this.layer;
      if (!layer) return;
      const k = Math.min(Math.max(opts.ease, 0.01), 1);
      this.x += (pointer.x - this.x) * k;
      this.y += (pointer.y - this.y) * k;
      this.lit += ((pointer.active ? 1 : 0) - this.lit) * k;
      const px = (this.x * 100).toFixed(2);
      const py = (this.y * 100).toFixed(2);
      const radius = (Math.max(opts.spread, 0.05) * 140).toFixed(1);
      const lightAmount = (opts.sheen * this.lit * 100).toFixed(1);
      const shadeAmount = (opts.shade * this.lit * 22).toFixed(1);
      const angle = Math.atan2(this.y - 0.5, this.x - 0.5) * 180 / Math.PI + 90;
      layer.style.background = `radial-gradient(${radius}% ${radius}% at ${px}% ${py}%, color-mix(in srgb, ${opts.light} ${lightAmount}%, transparent), transparent 70%), linear-gradient(${angle.toFixed(1)}deg, transparent 35%, color-mix(in srgb, #201f1a ${shadeAmount}%, transparent))`;
      const reach = 2 + opts.edge * 10;
      const dx = (0.5 - this.x) * reach;
      const dy = (0.5 - this.y) * reach;
      const lit = (opts.edge * this.lit * 100).toFixed(1);
      const dark = (opts.shade * this.lit * 55).toFixed(1);
      const falloff = (reach * 2.4).toFixed(1);
      const pullIn = (-reach * 0.85).toFixed(1);
      layer.style.boxShadow = `inset ${dx.toFixed(2)}px ${dy.toFixed(2)}px 0 -1px color-mix(in srgb, ${opts.light} ${lit}%, transparent), inset ${(-dx * 1.6).toFixed(2)}px ${(-dy * 1.6).toFixed(2)}px ${falloff}px ${pullIn}px color-mix(in srgb, #201f1a ${dark}%, transparent)`;
    }
    teardown() {
      this.layer?.remove();
      if (this.host) this.host.style.position = this.previousPosition;
      this.layer = null;
      this.host = null;
      this.lit = 0;
    }
  };
  function createSpotlightCard(el, opts = {}) {
    return mount(el, opts, {
      defaults: spotlightCardDefaults,
      create: () => new SpotlightCardSurface(),
      // A surface treatment lights markup that is already on the page, so it gets
      // the host element rather than a canvas it would never draw into.
      kind: "dom"
    });
  }
  var core_default4 = createSpotlightCard;

  // effects/decode-text/core.ts
  var decodeTextDefaults = {
    glyphs: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+-=?/<>[]{}",
    order: "forward",
    stagger: 45,
    hold: 160,
    rate: 18,
    dim: 0.45,
    steady: true,
    seed: 7,
    reducedMotionTime: 999
  };
  function hash3(a, b, c) {
    let h = Math.imul(a | 0, 668265261) ^ Math.imul(b | 0, 374761393);
    h = Math.imul(h ^ h >>> 15, 1 | (c | 0));
    h = h + Math.imul(h ^ h >>> 7, 61 | h) ^ h;
    return ((h ^ h >>> 14) >>> 0) / 4294967296;
  }
  function orderFor(mode, count, seed) {
    const indices = Array.from({ length: count }, (_, i) => i);
    if (mode === "reverse") return indices.map((i) => count - 1 - i);
    if (mode === "centre") {
      const middle = (count - 1) / 2;
      return indices.map((i) => Math.round(Math.abs(i - middle)));
    }
    if (mode === "random") {
      const ranks = indices.slice();
      for (let i = ranks.length - 1; i > 0; i--) {
        const j = Math.floor(hash3(i, 0, seed) * (i + 1));
        const swap = ranks[i];
        ranks[i] = ranks[j];
        ranks[j] = swap;
      }
      return ranks;
    }
    return indices;
  }
  var SCRAMBLES = /[a-z0-9]/i;
  function matchCase(glyph, letter) {
    if (letter >= "a" && letter <= "z") return glyph.toLowerCase();
    if (letter >= "A" && letter <= "Z") return glyph.toUpperCase();
    return glyph;
  }
  var DecodeTextSurface = class {
    host = null;
    original = "";
    cells = [];
    letters = [];
    ranks = [];
    pools = [];
    probe = null;
    built = false;
    measured = false;
    measuredFor = "";
    fontsPending = false;
    setup(ctx) {
      this.host = ctx.host;
      this.original = (ctx.host.textContent ?? "").replace(/\s+/g, " ").trim();
    }
    build() {
      const host = this.host;
      if (!host || this.built) return;
      host.textContent = "";
      this.cells = [];
      this.letters = [];
      const label = document.createElement("span");
      label.textContent = this.original;
      label.style.cssText = "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0";
      const visual = document.createElement("span");
      visual.setAttribute("aria-hidden", "true");
      const words = this.original.split(" ");
      words.forEach((word, index) => {
        const wrapper = document.createElement("span");
        wrapper.style.display = "inline-block";
        wrapper.style.whiteSpace = "nowrap";
        for (const character of Array.from(word)) {
          const cell = document.createElement("span");
          cell.textContent = character;
          cell.style.display = "inline-block";
          wrapper.append(cell);
          this.cells.push(cell);
          this.letters.push(character);
        }
        visual.append(wrapper);
        if (index < words.length - 1) visual.append(document.createTextNode(" "));
      });
      const probe = document.createElement("span");
      probe.setAttribute("aria-hidden", "true");
      probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre;pointer-events:none;top:0;left:0";
      visual.append(probe);
      this.probe = probe;
      host.append(label, visual);
      this.built = true;
      if (!this.fontsPending && typeof document !== "undefined" && document.fonts) {
        this.fontsPending = true;
        document.fonts.ready.then(() => {
          this.measured = false;
        });
      }
    }
    /*
     * Each box is pinned to the width of the letter it will become, and the
     * substitute is centred in it. The alternative, pinning the width of the
     * whole element, stops the page moving but still lets the letters inside it
     * jostle, which is the part that actually catches the eye.
     */
    measure(steady, glyphs) {
      const probe = this.probe;
      if (this.measured && this.measuredFor === glyphs) return;
      this.measuredFor = glyphs;
      if (!steady || !probe) {
        for (const cell of this.cells) {
          cell.style.width = "";
          cell.style.textAlign = "";
        }
        this.pools = [];
        this.measured = true;
        return;
      }
      const widths = /* @__PURE__ */ new Map();
      const width = (character) => {
        const known = widths.get(character);
        if (known !== void 0) return known;
        probe.textContent = character;
        const measured = probe.getBoundingClientRect().width;
        widths.set(character, measured);
        return measured;
      };
      const set = Array.from(glyphs);
      this.pools = [];
      for (let i = 0; i < this.cells.length; i++) {
        const cell = this.cells[i];
        const letter = this.letters[i];
        if (!SCRAMBLES.test(letter)) {
          cell.style.width = "";
          cell.style.textAlign = "";
          this.pools.push([]);
          continue;
        }
        const target = width(letter);
        cell.style.width = `${target.toFixed(2)}px`;
        cell.style.textAlign = "center";
        const nearest = set.map((glyph, index) => {
          const fitted = matchCase(glyph, letter);
          return { glyph: fitted, index, gap: Math.abs(width(fitted) - target) };
        }).sort((a, b) => a.gap - b.gap || a.index - b.index);
        const tolerance = Math.max(target * 0.14, 0.5);
        const fits = nearest.filter((entry) => entry.gap <= tolerance);
        const pool = fits.length >= 5 ? fits : nearest.slice(0, 5);
        this.pools.push(pool.map((entry) => entry.glyph));
      }
      this.measured = true;
    }
    resize() {
      this.measured = false;
    }
    render(t, opts) {
      this.build();
      if (this.cells.length === 0) return;
      const glyphs = opts.glyphs.length > 0 ? opts.glyphs : decodeTextDefaults.glyphs;
      this.measure(opts.steady, glyphs);
      if (this.ranks.length !== this.cells.length) {
        this.ranks = orderFor(opts.order, this.cells.length, opts.seed);
      }
      const stagger = opts.stagger / 1e3;
      const hold = opts.hold / 1e3;
      const frame = Math.floor(t * Math.max(opts.rate, 1e-3));
      const dim = String(1 - Math.max(0, Math.min(1, opts.dim)));
      const set = Array.from(glyphs);
      for (let i = 0; i < this.cells.length; i++) {
        const cell = this.cells[i];
        const letter = this.letters[i];
        const landed = t >= hold + this.ranks[i] * stagger || !SCRAMBLES.test(letter);
        const pool = this.pools[i];
        const pick = (source) => source[Math.floor(hash3(i + 1, frame, opts.seed) * source.length)] ?? letter;
        const next = landed ? letter : pool && pool.length > 0 ? pick(pool) : matchCase(pick(set), letter);
        if (cell.textContent !== next) cell.textContent = next;
        const opacity = landed ? "" : dim;
        if (cell.style.opacity !== opacity) cell.style.opacity = opacity;
      }
    }
    teardown() {
      if (this.host && this.original) this.host.textContent = this.original;
      this.cells = [];
      this.letters = [];
      this.ranks = [];
      this.pools = [];
      this.probe = null;
      this.built = false;
      this.measured = false;
      this.measuredFor = "";
      this.host = null;
    }
  };
  function createDecodeText(el, opts = {}) {
    return mount(el, opts, {
      defaults: decodeTextDefaults,
      kind: "dom",
      create: () => new DecodeTextSurface()
    });
  }
  var core_default5 = createDecodeText;

  // effects/count-up-number/core.ts
  var countUpNumberDefaults = {
    from: 0,
    duration: 1800,
    decimals: 0,
    locale: "",
    prefix: "",
    suffix: "",
    reducedMotionTime: 999
  };
  var clamp012 = (n) => n < 0 ? 0 : n > 1 ? 1 : n;
  var easeOutExpo = (k) => k >= 1 ? 1 : 1 - Math.pow(2, -10 * k);
  var CountUpNumberSurface = class {
    host = null;
    output = null;
    original = "";
    target = 0;
    places = 0;
    setup(ctx) {
      const host = ctx.host;
      this.host = host;
      this.original = (host.textContent ?? "").trim();
      const cleaned = this.original.replace(/[^\d.,-]/g, "");
      const lastComma = cleaned.lastIndexOf(",");
      const lastDot = cleaned.lastIndexOf(".");
      const decimalMark = lastComma > lastDot ? "," : ".";
      const normalised = cleaned.split("").filter((character) => character !== (decimalMark === "," ? "." : ",")).join("").replace(",", ".");
      const parsed = Number.parseFloat(normalised);
      this.target = Number.isFinite(parsed) ? parsed : 0;
      const fraction = normalised.split(".")[1];
      this.places = fraction ? fraction.length : 0;
      host.textContent = "";
      const label = document.createElement("span");
      label.textContent = this.original;
      label.style.cssText = "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0";
      const output = document.createElement("span");
      output.setAttribute("aria-hidden", "true");
      host.append(label, output);
      this.output = output;
    }
    resize() {
    }
    render(t, opts) {
      const output = this.output;
      if (!output) return;
      const places = opts.decimals || this.places;
      const progress = easeOutExpo(clamp012(t / (Math.max(opts.duration, 1) / 1e3)));
      const value = opts.from + (this.target - opts.from) * progress;
      const formatter = new Intl.NumberFormat(opts.locale || void 0, {
        minimumFractionDigits: places,
        maximumFractionDigits: places
      });
      output.textContent = `${opts.prefix}${formatter.format(value)}${opts.suffix}`;
    }
    teardown() {
      if (this.host) this.host.textContent = this.original;
      this.output = null;
      this.host = null;
    }
  };
  function createCountUpNumber(el, opts = {}) {
    return mount(el, opts, {
      defaults: countUpNumberDefaults,
      kind: "dom",
      create: () => new CountUpNumberSurface()
    });
  }
  var core_default6 = createCountUpNumber;

  // effects/odometer-number/core.ts
  var odometerNumberDefaults = {
    from: 0,
    to: 128640,
    duration: 4200,
    hold: 300,
    digits: 6,
    group: "",
    carry: 0.12,
    drum: 0.55,
    seed: 7,
    reducedMotionTime: 999
  };
  var clamp013 = (n) => n < 0 ? 0 : n > 1 ? 1 : n;
  var easeOutExpo2 = (k) => k >= 1 ? 1 : 1 - Math.pow(2, -10 * k);
  var smoothstep = (edge0, edge1, x) => {
    const t = clamp013((x - edge0) / Math.max(edge1 - edge0, 1e-6));
    return t * t * (3 - 2 * t);
  };
  var OdometerNumberSurface = class {
    host = null;
    original = "";
    label = null;
    wheels = [];
    built = false;
    builtFor = "";
    lineHeight = 1;
    setup(ctx) {
      this.host = ctx.host;
      this.original = (ctx.host.textContent ?? "").trim();
    }
    /*
     * One window and one strip per wheel. The strip carries nought to nine and
     * then nought again: without the repeat, a wheel rolling from nine has
     * nothing to roll on to and snaps back through the whole drum.
     */
    build(opts) {
      const host = this.host;
      if (!host) return;
      const count = Math.max(
        Math.round(opts.digits),
        String(Math.floor(Math.max(Math.abs(opts.from), Math.abs(opts.to)))).length
      );
      const key = `${count}|${opts.group}`;
      if (this.built && this.builtFor === key) return;
      this.builtFor = key;
      host.textContent = "";
      this.wheels = [];
      const label = document.createElement("span");
      label.style.cssText = "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0";
      this.label = label;
      const visual = document.createElement("span");
      visual.setAttribute("aria-hidden", "true");
      visual.style.cssText = "display:inline-flex;align-items:stretch;overflow:hidden";
      for (let i = 0; i < count; i++) {
        const place = count - 1 - i;
        const window2 = document.createElement("span");
        window2.style.cssText = "position:relative;display:inline-block;overflow:hidden;height:1em;line-height:1em;vertical-align:top";
        const strip = document.createElement("span");
        strip.style.cssText = "display:flex;flex-direction:column;align-items:center;will-change:transform";
        for (let d = 0; d <= 10; d++) {
          const figure = document.createElement("span");
          figure.textContent = String(d % 10);
          figure.style.cssText = "display:block;height:1em;line-height:1em";
          strip.append(figure);
        }
        window2.append(strip);
        visual.append(window2);
        this.wheels.push({ window: window2, strip });
        if (opts.group.length > 0 && place > 0 && place % 3 === 0) {
          const gap = document.createElement("span");
          gap.textContent = opts.group;
          gap.style.cssText = "display:inline-block;height:1em;line-height:1em";
          visual.append(gap);
        }
      }
      host.append(label, visual);
      this.built = true;
    }
    resize() {
      const first = this.wheels[0];
      if (first) this.lineHeight = first.window.getBoundingClientRect().height || 1;
    }
    render(t, opts) {
      this.build(opts);
      if (this.wheels.length === 0) return;
      if (this.lineHeight <= 1) this.resize();
      const duration = Math.max(opts.duration, 1) / 1e3;
      const hold = Math.max(opts.hold, 0) / 1e3;
      const travelled = easeOutExpo2(clamp013((t - hold) / duration));
      const value = opts.from + (opts.to - opts.from) * travelled;
      if (this.label) {
        const shown = String(Math.round(value));
        if (this.label.textContent !== shown) this.label.textContent = shown;
      }
      const carry = clamp013(opts.carry);
      const count = this.wheels.length;
      for (let i = 0; i < count; i++) {
        const place = count - 1 - i;
        const scaled = Math.abs(value) / Math.pow(10, place);
        const whole = Math.floor(scaled);
        const within = scaled - whole;
        const turn = carry >= 1 ? within : smoothstep(1 - carry, 1, within);
        const position = (whole % 10 + turn + 10) % 10;
        const wheel = this.wheels[i];
        const offset = -position * this.lineHeight;
        const transform = `translateY(${offset.toFixed(2)}px)`;
        if (wheel.strip.style.transform !== transform) wheel.strip.style.transform = transform;
        const shade = (1 - Math.abs(turn * 2 - 1)) * opts.drum;
        const filter = shade > 0.01 ? `brightness(${(1 - shade * 0.45).toFixed(3)})` : "";
        if (wheel.strip.style.filter !== filter) wheel.strip.style.filter = filter;
      }
    }
    teardown() {
      if (this.host) this.host.textContent = this.original;
      this.wheels = [];
      this.label = null;
      this.built = false;
      this.builtFor = "";
      this.host = null;
    }
  };
  function createOdometerNumber(el, opts = {}) {
    return mount(el, opts, {
      defaults: odometerNumberDefaults,
      kind: "dom",
      create: () => new OdometerNumberSurface()
    });
  }
  var core_default7 = createOdometerNumber;

  // components/glass-nav/glass.ts
  function watchSettle(el, over = 120) {
    let frame = 0;
    let last = -1;
    const measure = () => {
      frame = 0;
      const settled = Math.min(Math.max(window.scrollY / Math.max(over, 1), 0), 1);
      const rounded = Math.round(settled * 100) / 100;
      if (rounded === last) return;
      last = rounded;
      el.style.setProperty("--crossbar-settle", String(rounded));
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }
  function makeLensMap(width, height, radius, thickness) {
    const canvas = document.createElement("canvas");
    const w = Math.max(Math.round(width / 4), 1);
    const h = Math.max(Math.round(height / 4), 1);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    const image = ctx.createImageData(w, h);
    const halfW = w / 2;
    const halfH = h / 2;
    const r = Math.min(radius / 4, Math.min(halfW, halfH));
    const edge = Math.max(thickness / 4, 1);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const qx = Math.abs(x + 0.5 - halfW) - (halfW - r);
        const qy = Math.abs(y + 0.5 - halfH) - (halfH - r);
        const ox = Math.max(qx, 0);
        const oy = Math.max(qy, 0);
        const dist = Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
        const nx = qx > qy ? Math.sign(x + 0.5 - halfW) : 0;
        const ny = qy >= qx ? Math.sign(y + 0.5 - halfH) : 0;
        let dirX = ox !== 0 || oy !== 0 ? ox * Math.sign(x + 0.5 - halfW) : nx;
        let dirY = ox !== 0 || oy !== 0 ? oy * Math.sign(y + 0.5 - halfH) : ny;
        const len = Math.hypot(dirX, dirY) || 1;
        dirX /= len;
        dirY /= len;
        const bevel = Math.min(Math.max(1 + dist / edge, 0), 1);
        const i = (y * w + x) * 4;
        image.data[i] = Math.round((dirX * bevel * 0.5 + 0.5) * 255);
        image.data[i + 1] = Math.round((dirY * bevel * 0.5 + 0.5) * 255);
        image.data[i + 2] = 0;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL();
  }
  var filterSeq = 0;
  function attachRefraction(el, strength, radius) {
    const id = `beamish-lens-${filterSeq += 1}`;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    svg.innerHTML = `<filter id="${id}" x="0%" y="0%" width="100%" height="100%" color-interpolation-filters="sRGB"><feImage result="lens" preserveAspectRatio="none" /><feDisplacementMap in="SourceGraphic" in2="lens" xChannelSelector="R" yChannelSelector="G" /></filter>`;
    document.body.append(svg);
    const feImage = svg.querySelector("feImage");
    const feDisplacement = svg.querySelector("feDisplacementMap");
    const draw = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      const map = makeLensMap(rect.width, rect.height, radius, Math.min(rect.height, 48));
      if (!map) return;
      feImage.setAttribute("href", map);
      feImage.setAttribute("width", String(rect.width));
      feImage.setAttribute("height", String(rect.height));
      feDisplacement.setAttribute("scale", String(strength));
    };
    draw();
    const previous = el.style.filter;
    el.style.setProperty("--crossbar-lens", `url(#${id})`);
    const observer = new ResizeObserver(draw);
    observer.observe(el);
    return () => {
      observer.disconnect();
      svg.remove();
      el.style.removeProperty("--crossbar-lens");
      el.style.filter = previous;
    };
  }

  // templates/coil-and-bias/meta.json
  var meta_default = {
    name: "Coil & Bias",
    slug: "coil-and-bias",
    description: "An invented audio hardware brand, on a dark ground, where three backdrops share one context",
    intent: "The dark end of the library under load, and the real test of the stage: three WebGL backdrops on one page, handed the single context as the page scrolls, with the DOM items that claim to work on either ground made to prove it.",
    ground: "dark",
    uses: [
      {
        name: "TwelveColumn",
        slug: "twelve-column",
        kind: "grid"
      },
      {
        name: "GlassNav",
        slug: "glass-nav",
        kind: "component"
      },
      {
        name: "AuroraCurtain",
        slug: "aurora-curtain",
        kind: "effect"
      },
      {
        name: "LightShafts",
        slug: "light-shafts",
        kind: "effect"
      },
      {
        name: "DustMotes",
        slug: "dust-motes",
        kind: "effect"
      },
      {
        name: "SpotlightCard",
        slug: "spotlight-card",
        kind: "effect"
      },
      {
        name: "DecodeText",
        slug: "decode-text",
        kind: "effect"
      },
      {
        name: "CountUpNumber",
        slug: "count-up-number",
        kind: "effect"
      },
      {
        name: "OdometerNumber",
        slug: "odometer-number",
        kind: "effect"
      },
      {
        name: "Stage",
        slug: "",
        kind: "shared"
      }
    ],
    record: {
      duration: 14,
      fps: 24,
      posterAt: 1.6,
      crf: 38,
      webmCrf: 48
    }
  };

  // templates/coil-and-bias/entry.ts
  var used = meta_default.uses;
  var at = (sel) => document.querySelector(sel);
  var handles = [];
  var keep = (handle) => {
    if (handle) {
      handle.start();
      handles.push(handle);
    }
    return handle;
  };
  var cleanups = [];
  var sections = [...document.querySelectorAll("[data-stage-section]")];
  var stage = createStage(
    sections.map((section) => {
      const host = section.querySelector("[data-backdrop]");
      const which = host.dataset["backdrop"];
      return {
        el: section,
        create: () => {
          if (which === "aurora-curtain") {
            return core_default(host, { sky: "#0b0d10", brightness: 0.62, stars: 0.5 });
          }
          if (which === "light-shafts") {
            return core_default2(host, { ground: "#0b0d10", strength: 0.5, dust: 0.35 });
          }
          return core_default3(host, { ground: "#0b0d10", mote: "#9fb4c7", haze: 0.25 });
        }
      };
    })
  );
  var crossbar = at("#crossbar");
  if (crossbar) {
    cleanups.push(watchSettle(crossbar));
    cleanups.push(attachRefraction(crossbar, 18, 14));
  }
  var hero = at("#hero-line");
  if (hero) keep(core_default5(hero, { stagger: 26, hold: 420 }));
  for (const card of document.querySelectorAll(".card")) {
    keep(core_default4(card, { light: "#9fd8d0", spread: 0.55, shade: 0.4 }));
  }
  var odo = at(".odo");
  if (odo) keep(core_default7(odo, { from: 0, to: 12, duration: 1600, digits: 2 }));
  var counters = [...document.querySelectorAll(".counter")];
  if (counters[0]) keep(core_default6(counters[0], { duration: 1500, decimals: 2 }));
  if (counters[1]) keep(core_default6(counters[1], { duration: 1500 }));
  var manifest = at("#manifest");
  if (manifest) {
    const group = (kind) => kind === "grid" ? "grids" : kind === "component" ? "components" : "effects";
    for (const item of used) {
      const li = document.createElement("li");
      const label = item.slug ? `<a href="https://beamish.ink/${group(item.kind)}/${item.slug}">${item.name}</a>` : item.name;
      li.innerHTML = `${label}<span class="kind">${item.kind}</span>`;
      manifest.append(li);
    }
  }
  var ease = (k) => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  var span = Number(new URLSearchParams(location.search).get("span")) || 14;
  var driver = {
    renderAtTime(t) {
      const reach = Math.max(document.body.scrollHeight - innerHeight, 0);
      const k = Math.min(Math.max(t / span, 0), 1);
      const there = k < 0.5 ? ease(k * 2) : ease((1 - k) * 2);
      scrollTo(0, reach * there);
      for (const handle of handles) handle.renderAtTime?.(t);
    },
    start() {
    },
    stop() {
    },
    update(next) {
      if (next && typeof next.span === "number") span = next.span;
    },
    destroy() {
      stage.destroy();
      for (const handle of handles) handle.destroy();
      for (const off of cleanups) off();
    }
  };
  window.__beamish = driver;
  if (!new URLSearchParams(location.search).has("record")) scrollTo(0, 0);
})();
