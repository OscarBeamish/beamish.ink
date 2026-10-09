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

  // effects/paper-grain/core.ts
  var paperGrainDefaults = {
    paper: "#f7f5ed",
    fibre: "#fffdf6",
    scale: 340,
    direction: 12,
    stretch: 3.4,
    formation: 0.55,
    tooth: 0.5,
    light: 0.18,
    relief: 0.6,
    sweep: 26,
    shive: 0.35,
    period: 36,
    reducedMotionTime: 9
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
 * PaperGrain: the surface of a sheet of paper, with nothing on it.
 *
 * The image is a lighting calculation, not a pattern. One noise field becomes a
 * height, the height is differenced into a normal, and the normal meets one low
 * light. Draw that same field as tone instead and the result is a grey cloud
 * that could be anything; light it and it is a sheet of paper.
 *
 * The fibre is stretched along the machine direction, because the stock runs in
 * a direction on a paper machine and the fibres lie along it. Formation, the
 * cloud you see holding a sheet to a window, is a density rather than a shape,
 * so it goes into the tone. The tooth is smaller than a pixel, so it goes into
 * neither: it is a flicker added to the light, weighted by how much the light
 * rakes, because roughness you cannot resolve only shows as sparkle in grazing
 * light.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_paper;
uniform vec3  u_fibre;
uniform float u_scale;
uniform float u_direction;
uniform float u_stretch;
uniform float u_formation;
uniform float u_tooth;
uniform float u_light;
uniform float u_relief;
uniform float u_sweep;
uniform float u_shive;

out vec4 fragColor;

const float TAU = 6.28318530718;
const float PI = 3.14159265359;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/* Value noise, smoothstepped so the fields have no cell edges in them. */
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

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += noise(p) * amp;
    p = p * 2.03 + 17.3;
    amp *= 0.5;
  }
  return sum;
}

/*
 * The fibre, in a frame rotated to the machine direction and squashed across
 * it, which is what makes the grain run one way. Isotropic noise here is the
 * single thing that stops a paper texture reading as paper: the sheets that
 * really are isotropic are the handmade ones, and they look like felt.
 */
float fibreAt(vec2 p) {
  float a = radians(u_direction);
  mat2 toGrain = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 g = toGrain * p;
  g.x /= max(u_stretch, 0.05);
  return fbm(g * u_scale);
}

/*
 * Formation: the uneven spread of fibre, in patches far larger than the fibres.
 *
 * It belongs in the tone and not in the height, and that is the whole shape of
 * this shader rather than a detail. Formation is a density variation, so what
 * it changes is how much light comes back, not which way the surface faces.
 * Put it in the height with the fibre and two things go wrong: it contributes
 * almost nothing, because a broad field has almost no slope, and the fine fibre
 * that is left dominates the derivative and the sheet comes out as rough-cast
 * plaster.
 */
float formationAt(vec2 p) {
  return fbm(p * u_scale * 0.03 + 53.1);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = max(min(cssRes.x, cssRes.y), 1.0);
  vec2 p = (cssPx - cssRes * 0.5) / shortSide;

  /*
   * Forward differences at one CSS pixel. The step has to be the pixel rather
   * than some small constant: a normal measured over a shorter distance than
   * the screen can resolve is sampling detail that is not in the image, and it
   * comes back as sparkle that moves when the canvas is resized.
   */
  float e = 1.0 / shortSide;
  float here = fibreAt(p);
  float hx = fibreAt(p + vec2(e, 0.0)) - here;
  float hy = fibreAt(p + vec2(0.0, e)) - here;

  // Divided by the step, so the slope is a slope rather than a difference, and
  // relief means the same thing at every canvas size.
  vec2 slope = vec2(hx, hy) / e;
  vec3 normal = normalize(vec3(-slope * u_relief * 0.02, 1.0));

  /*
   * One light, low. The swing is a sine of the phase, so it returns to where it
   * started and the loop closes exactly: a light that travels a full circle
   * passes through the back of the sheet on the way, which on a flat surface
   * reads as the image inverting.
   */
  float phase = TAU * u_time / max(u_period, 0.001);
  float azimuth = radians(135.0 + u_sweep * sin(phase));
  float elevation = mix(0.04, 1.0, clamp(u_light, 0.0, 1.0)) * PI * 0.5;
  vec3 sun = vec3(cos(azimuth) * cos(elevation), sin(azimuth) * cos(elevation), sin(elevation));

  /*
   * Paper is not a mirror and it is not a void. Nearly all of what comes off a
   * sheet is bounced light, so the ambient term is much the larger of the two
   * and the lit term is a small correction on top of it. Weight these the way a
   * solid object is weighted and the sheet turns to stone.
   */
  float lambert = max(dot(normal, sun), 0.0);
  float shade = 0.94 + 0.16 * (lambert - 0.5);

  /*
   * PaperGrain. Smaller than a pixel, so it cannot be in the surface: it is a
   * flicker in the light, weighted by how level the light is. Overhead light
   * fills the pits and the sheet goes flat, which is exactly what happens to a
   * sheet of paper under a ceiling light and the reason nobody photographs
   * paper that way.
   */
  float rake = 1.0 - clamp(u_light, 0.0, 1.0);
  float speck = hash12(floor(gl_FragCoord.xy)) - 0.5;
  shade += speck * 0.028 * u_tooth * (0.25 + 0.75 * rake);

  // The cloud, as tone. Centred on zero so it lightens and darkens the stock
  // rather than dragging the whole sheet one way.
  float cloud = (formationAt(p) - 0.5) * u_formation * 0.085;
  vec3 col = mix(u_paper, u_fibre, clamp(0.5 + cloud * 6.0, 0.0, 1.0)) * (shade + cloud);

  /*
   * Shive: specks of fibre the beater did not break down, which end up darker
   * than the sheet and are the one thing in here that is a mark rather than a
   * surface. Sparse on purpose. A sheet with visible shive all over it is a
   * sheet nobody bought.
   */
  vec2 cell = floor(cssPx * 0.5);
  float pick = hash12(cell + 91.7);
  float speckle = step(1.0 - u_shive * 0.0045, pick);
  col *= 1.0 - speckle * (0.10 + 0.14 * hash12(cell + 13.9));

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
  var UNIFORMS = [
    "u_resolution",
    "u_dpr",
    "u_time",
    "u_period",
    "u_paper",
    "u_fibre",
    "u_scale",
    "u_direction",
    "u_stretch",
    "u_formation",
    "u_tooth",
    "u_light",
    "u_relief",
    "u_sweep",
    "u_shive"
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
  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("PaperGrain: could not create shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`PaperGrain: shader failed to compile
${log ?? ""}`);
    }
    return shader;
  }
  var PaperGrainSurface = class {
    gl = null;
    program = null;
    vao = null;
    locations = /* @__PURE__ */ new Map();
    size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 };
    setup(ctx) {
      if (!ctx.canvas) throw new Error("PaperGrain needs a canvas");
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
      if (!gl) throw new Error("PaperGrain needs WebGL2, which this browser did not provide");
      const vert = compile(gl, gl.VERTEX_SHADER, VERT);
      const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG);
      const program = gl.createProgram();
      if (!program) throw new Error("PaperGrain: could not create program");
      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`PaperGrain: program failed to link
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
      const loc = (name) => this.locations.get(name) ?? null;
      gl.uniform2f(loc("u_resolution"), this.size.pixelWidth, this.size.pixelHeight);
      gl.uniform1f(loc("u_dpr"), this.size.dpr);
      gl.uniform1f(loc("u_time"), t);
      gl.uniform1f(loc("u_period"), opts.period);
      gl.uniform3fv(loc("u_paper"), rgb(opts.paper));
      gl.uniform3fv(loc("u_fibre"), rgb(opts.fibre));
      gl.uniform1f(loc("u_scale"), opts.scale);
      gl.uniform1f(loc("u_direction"), opts.direction);
      gl.uniform1f(loc("u_stretch"), opts.stretch);
      gl.uniform1f(loc("u_formation"), opts.formation);
      gl.uniform1f(loc("u_tooth"), opts.tooth);
      gl.uniform1f(loc("u_light"), opts.light);
      gl.uniform1f(loc("u_relief"), opts.relief);
      gl.uniform1f(loc("u_sweep"), opts.sweep);
      gl.uniform1f(loc("u_shive"), opts.shive);
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
  function createPaperGrain(el, opts = {}) {
    return mount(el, opts, {
      defaults: paperGrainDefaults,
      create: () => new PaperGrainSurface()
    });
  }
  var core_default = createPaperGrain;

  // effects/registration-marks/core.ts
  var registrationMarksDefaults = {
    paper: "#fbfaf4",
    first: "#1b6f8c",
    second: "#c44400",
    third: "#36362f",
    size: 17,
    weight: 1.4,
    arms: 1.8,
    margin: 0.13,
    spread: 3.2,
    bar: 18,
    period: 32,
    reducedMotionTime: 8
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
 * RegistrationMarks: the marks outside the trim, with the plates out of
 * register.
 *
 * Everything is a signed distance in CSS pixels, turned into coverage with a
 * softening of exactly one pixel's footprint. That is not for looks. These are
 * hairlines moving by fractions of a pixel, and a hairline without
 * anti-aliasing crawls between whole pixels as it drifts: the sub-pixel
 * movement is the entire subject here, so it has to be the thing that survives.
 *
 * The inks multiply. Where the three plates land together the mark goes nearly
 * black; where they have come apart you see three coloured marks beside each
 * other. That difference is precisely how misregistration announces itself on a
 * real sheet, and adding the inks instead loses it.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_paper;
uniform vec3  u_first;
uniform vec3  u_second;
uniform vec3  u_third;
uniform float u_size;
uniform float u_weight;
uniform float u_arms;
uniform float u_margin;
uniform float u_spread;
uniform float u_bar;

out vec4 fragColor;

const float TAU = 6.28318530718;

/* A rule of a given half-length and half-width, as a signed distance. */
float rule(vec2 p, vec2 extent) {
  // Not half, and the swatch below is not patch. Both are reserved words in
  // GLSL, held for types the language does not have, and both fail at compile
  // rather than at run time.
  vec2 d = abs(p) - extent;
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

/*
 * One registration mark: a ring with a cross through it, the arms running past
 * the ring on all four sides. The ring reads rotation and the arms read
 * translation, which is why the real thing has both.
 */
float markAt(vec2 p, float radius, float weight) {
  float ring = abs(length(p) - radius) - weight * 0.5;
  float reach = radius * max(u_arms, 1.0);
  float across = rule(p, vec2(reach, weight * 0.5));
  float down = rule(p, vec2(weight * 0.5, reach));
  return min(ring, min(across, down));
}

/* One plate's ink coverage at this pixel, marks and bar together. */
float plateAt(vec2 cssPx, vec2 cssRes, vec2 offset, float slot, float slots) {
  vec2 p = cssPx - offset;
  float shortSide = max(min(cssRes.x, cssRes.y), 1.0);
  vec2 inset = cssRes * 0.5 - vec2(u_margin * shortSide);

  // Four marks, one at each corner of the inset rectangle.
  vec2 centred = p - cssRes * 0.5;
  vec2 folded = abs(centred) - inset;
  float d = markAt(folded, max(u_size, 1.0), max(u_weight, 0.3));

  /*
   * The colour bar along the foot: one solid patch per plate, side by side, the
   * way a press sheet carries them for a densitometer. They are the other half
   * of what a printer reads off the sheet.
   */
  if (u_bar > 0.5) {
    float barWidth = min(cssRes.x * 0.1, 58.0);
    float gap = barWidth * 0.18;
    float total = slots * barWidth + (slots - 1.0) * gap;
    float left = cssRes.x * 0.5 - total * 0.5 + slot * (barWidth + gap);
    vec2 swatch = p - vec2(left + barWidth * 0.5, cssRes.y - u_margin * shortSide * 0.45);
    d = min(d, rule(swatch, vec2(barWidth * 0.5, u_bar * 0.5)));
  }

  float aa = max(fwidth(d), 0.0001);
  return clamp(smoothstep(aa, -aa, d), 0.0, 1.0);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  // y down, so the foot of the sheet is the foot of the frame.
  cssPx.y = cssRes.y - cssPx.y;

  /*
   * Each plate drifts on a closed orbit, a third of a turn apart, so after one
   * period every plate is back where it started and the loop closes. Circles
   * rather than a wander: a press drifts because something is turning.
   */
  float phase = TAU * u_time / max(u_period, 0.001);
  vec2 a = vec2(cos(phase), sin(phase * 2.0)) * u_spread * 0.5;
  vec2 b = vec2(cos(phase + 2.094), sin(phase * 2.0 + 1.047)) * u_spread;
  vec2 c = vec2(cos(phase + 4.189), sin(phase * 2.0 + 3.142)) * u_spread * 0.7;

  float ia = plateAt(cssPx, cssRes, a, 0.0, 3.0);
  float ib = plateAt(cssPx, cssRes, b, 1.0, 3.0);
  float ic = plateAt(cssPx, cssRes, c, 2.0, 3.0);

  vec3 col = u_paper;
  col *= mix(vec3(1.0), u_first / max(u_paper, vec3(0.001)), ia);
  col *= mix(vec3(1.0), u_second / max(u_paper, vec3(0.001)), ib);
  col *= mix(vec3(1.0), u_third / max(u_paper, vec3(0.001)), ic);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
  var UNIFORMS2 = [
    "u_resolution",
    "u_dpr",
    "u_time",
    "u_period",
    "u_paper",
    "u_first",
    "u_second",
    "u_third",
    "u_size",
    "u_weight",
    "u_arms",
    "u_margin",
    "u_spread",
    "u_bar"
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
  function compile2(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("RegistrationMarks: could not create shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`RegistrationMarks: shader failed to compile
${log ?? ""}`);
    }
    return shader;
  }
  var RegistrationMarksSurface = class {
    gl = null;
    program = null;
    vao = null;
    locations = /* @__PURE__ */ new Map();
    size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 };
    setup(ctx) {
      if (!ctx.canvas) throw new Error("RegistrationMarks needs a canvas");
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
      if (!gl) throw new Error("RegistrationMarks needs WebGL2, which this browser did not provide");
      const vert = compile2(gl, gl.VERTEX_SHADER, VERT2);
      const frag = compile2(gl, gl.FRAGMENT_SHADER, FRAG2);
      const program = gl.createProgram();
      if (!program) throw new Error("RegistrationMarks: could not create program");
      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`RegistrationMarks: program failed to link
${log ?? ""}`);
      }
      this.gl = gl;
      this.program = program;
      this.vao = gl.createVertexArray();
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
      gl.uniform3fv(loc("u_paper"), rgb2(opts.paper));
      gl.uniform3fv(loc("u_first"), rgb2(opts.first));
      gl.uniform3fv(loc("u_second"), rgb2(opts.second));
      gl.uniform3fv(loc("u_third"), rgb2(opts.third));
      gl.uniform1f(loc("u_size"), opts.size);
      gl.uniform1f(loc("u_weight"), opts.weight);
      gl.uniform1f(loc("u_arms"), opts.arms);
      gl.uniform1f(loc("u_margin"), opts.margin);
      gl.uniform1f(loc("u_spread"), opts.spread);
      gl.uniform1f(loc("u_bar"), opts.bar);
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
  function createRegistrationMarks(el, opts = {}) {
    return mount(el, opts, {
      defaults: registrationMarksDefaults,
      create: () => new RegistrationMarksSurface()
    });
  }
  var core_default2 = createRegistrationMarks;

  // effects/masked-heading/core.ts
  var maskedHeadingDefaults = {
    direction: "up",
    duration: 1500,
    hold: 250,
    tear: 0.07,
    fray: 0.018,
    points: 48,
    overshoot: 0.12,
    seed: 7,
    reducedMotionTime: 999
  };
  var clamp012 = (n) => n < 0 ? 0 : n > 1 ? 1 : n;
  var easeOutExpo = (k) => k >= 1 ? 1 : 1 - Math.pow(2, -10 * k);
  function hash2(a, b) {
    let h = Math.imul(a | 0, 668265261) ^ Math.imul(b | 0, 374761393);
    h = Math.imul(h ^ h >>> 15, 1 | h);
    h = h + Math.imul(h ^ h >>> 7, 61 | h) ^ h;
    return ((h ^ h >>> 14) >>> 0) / 4294967296;
  }
  var MaskedHeadingSurface = class {
    host = null;
    /** The fixed shape of the tear, sampled along the edge. Built once per seed. */
    profile = [];
    profileFor = "";
    previous = "";
    setup(ctx) {
      this.host = ctx.host;
    }
    /*
     * The tear itself, as a list of offsets along the edge.
     *
     * Two scales, because a deckle edge has two. The slow one is where the pulp
     * ran thin against the deckle and it wanders over a third of the sheet. The
     * fine one is the fray of individual fibres. One scale alone gives either a
     * gentle curve or a saw blade, and neither reads as paper.
     *
     * Built once and reused, because a torn edge does not re-tear itself while
     * the sheet is being pulled away.
     */
    shape(opts) {
      const count = Math.max(4, Math.round(opts.points));
      const key = `${count}|${opts.tear}|${opts.fray}|${opts.seed}`;
      if (this.profileFor === key) return;
      this.profileFor = key;
      this.profile = [];
      for (let i = 0; i <= count; i++) {
        const s = i / count;
        const slow = Math.sin(s * 5.1 + hash2(1, opts.seed) * 6.3) * 0.6 + Math.sin(s * 11.7 + hash2(2, opts.seed) * 6.3) * 0.4;
        const fine = hash2(i + 3, opts.seed) - 0.5;
        this.profile.push(slow * opts.tear + fine * opts.fray * 2);
      }
    }
    resize() {
    }
    render(t, opts) {
      const host = this.host;
      if (!host) return;
      this.shape(opts);
      const duration = Math.max(opts.duration, 1) / 1e3;
      const hold = Math.max(opts.hold, 0) / 1e3;
      const eased = easeOutExpo(clamp012((t - hold) / duration));
      const reach = opts.tear + opts.fray + 1e-3;
      const span2 = 1 + reach * 2 + opts.overshoot;
      const travelled = eased * span2;
      const vertical = opts.direction === "up" || opts.direction === "down";
      const count = this.profile.length - 1;
      const edge = [];
      for (let i = 0; i <= count; i++) {
        const s = i / count;
        const offset = this.profile[i];
        const grows = opts.direction === "down" || opts.direction === "right";
        const at2 = grows ? -reach + travelled + offset : 1 + reach - travelled + offset;
        const along = (s * 100).toFixed(3);
        const across = (at2 * 100).toFixed(3);
        edge.push(vertical ? `${along}% ${across}%` : `${across}% ${along}%`);
      }
      const corners = opts.direction === "up" ? ["100% 200%", "0% 200%"] : opts.direction === "down" ? ["100% -100%", "0% -100%"] : opts.direction === "left" ? ["200% 100%", "200% 0%"] : ["-100% 100%", "-100% 0%"];
      const path = `polygon(${[...edge, ...corners].join(", ")})`;
      if (path !== this.previous) {
        host.style.clipPath = path;
        host.style.setProperty("-webkit-clip-path", path);
        this.previous = path;
      }
    }
    teardown() {
      const host = this.host;
      if (host) {
        host.style.clipPath = "";
        host.style.removeProperty("-webkit-clip-path");
      }
      this.profile = [];
      this.profileFor = "";
      this.previous = "";
      this.host = null;
    }
  };
  function createMaskedHeading(el, opts = {}) {
    return mount(el, opts, {
      defaults: maskedHeadingDefaults,
      kind: "dom",
      create: () => new MaskedHeadingSurface()
    });
  }
  var core_default3 = createMaskedHeading;

  // effects/rotating-words/core.ts
  var rotatingWordsDefaults = {
    interval: 2200,
    swap: 520,
    rise: 0.9,
    tilt: 0,
    blur: 0,
    reducedMotionTime: 0
  };
  var clamp013 = (n) => n < 0 ? 0 : n > 1 ? 1 : n;
  var easeOutQuart = (k) => 1 - Math.pow(1 - k, 4);
  var RotatingWordsSurface = class {
    host = null;
    words = [];
    built = false;
    applied = "";
    setup(ctx) {
      const host = ctx.host;
      this.host = host;
      host.style.display = "inline-grid";
      host.style.verticalAlign = "bottom";
      host.setAttribute("aria-live", "off");
    }
    build() {
      const host = this.host;
      if (!host || this.built) return;
      this.words = [...host.children].filter(
        (node) => node instanceof HTMLElement
      );
      for (let i = 0; i < this.words.length; i++) {
        const word = this.words[i];
        word.style.gridArea = "1 / 1";
        word.style.willChange = "transform, opacity";
        word.style.whiteSpace = "nowrap";
        if (i > 0) word.setAttribute("aria-hidden", "true");
      }
      this.built = true;
    }
    /*
     * Nothing to measure.
     *
     * The box is sized by the grid itself: every word is in the same cell, so the
     * cell is as wide as the longest and as tall as the tallest, and it stays
     * that size whichever word is showing. No measurement, nothing to recompute
     * on resize, and nothing that can be wrong before a font has loaded.
     */
    resize() {
    }
    render(t, opts) {
      this.build();
      const host = this.host;
      const count = this.words.length;
      if (!host || count === 0) return;
      const interval = Math.max(opts.interval, 1) / 1e3;
      const swap = Math.min(Math.max(opts.swap, 1) / 1e3, interval);
      const turns = Math.floor(t / interval);
      const within = t - turns * interval;
      const moving = easeOutQuart(clamp013(within / swap));
      const showing = (turns % count + count) % count;
      const leaving = ((showing - 1) % count + count) % count;
      const state = `${showing}|${moving.toFixed(4)}`;
      if (state === this.applied) return;
      this.applied = state;
      for (let i = 0; i < count; i++) {
        const word = this.words[i];
        let shift = 0;
        let fade = 0;
        if (i === showing) {
          shift = (1 - moving) * opts.rise;
          fade = moving;
        } else if (i === leaving && moving < 1) {
          shift = -moving * opts.rise;
          fade = 1 - moving;
        } else {
          word.style.opacity = "0";
          word.style.transform = "";
          word.style.filter = "";
          continue;
        }
        const turn = opts.tilt === 0 ? "" : ` rotate(${(shift * opts.tilt).toFixed(2)}deg)`;
        word.style.transform = `translate3d(0, ${(shift * 100).toFixed(2)}%, 0)${turn}`;
        word.style.opacity = fade.toFixed(3);
        word.style.filter = opts.blur > 0 ? `blur(${((1 - fade) * opts.blur).toFixed(2)}px)` : "";
      }
    }
    teardown() {
      for (const word of this.words) {
        word.style.gridArea = "";
        word.style.willChange = "";
        word.style.whiteSpace = "";
        word.style.transform = "";
        word.style.opacity = "";
        word.style.filter = "";
        word.removeAttribute("aria-hidden");
      }
      if (this.host) {
        this.host.style.display = "";
        this.host.style.verticalAlign = "";
        this.host.removeAttribute("aria-live");
      }
      this.words = [];
      this.built = false;
      this.applied = "";
      this.host = null;
    }
  };
  function createRotatingWords(el, opts = {}) {
    return mount(el, opts, {
      defaults: rotatingWordsDefaults,
      kind: "dom",
      create: () => new RotatingWordsSurface()
    });
  }
  var core_default4 = createRotatingWords;

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
  var clamp014 = (n) => n < 0 ? 0 : n > 1 ? 1 : n;
  var easeOutExpo2 = (k) => k >= 1 ? 1 : 1 - Math.pow(2, -10 * k);
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
      const progress = easeOutExpo2(clamp014(t / (Math.max(opts.duration, 1) / 1e3)));
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
  var core_default5 = createCountUpNumber;

  // effects/split-fountain-text/core.ts
  var splitFountainTextDefaults = {
    first: "#c44400",
    second: "#8a3b6b",
    third: "#1b6f8c",
    angle: 96,
    blend: 0.42,
    wobble: 0.35,
    walk: 0.12,
    seed: 7,
    period: 30,
    reducedMotionTime: 7
  };
  var TAU = Math.PI * 2;
  function hash22(a, b) {
    let h = Math.imul(a | 0, 668265261) ^ Math.imul(b | 0, 374761393);
    h = Math.imul(h ^ h >>> 15, 1 | h);
    h = h + Math.imul(h ^ h >>> 7, 61 | h) ^ h;
    return ((h ^ h >>> 14) >>> 0) / 4294967296;
  }
  var clamp015 = (n) => n < 0 ? 0 : n > 1 ? 1 : n;
  var STEPS = 7;
  var SplitFountainTextSurface = class {
    host = null;
    previous = "";
    touched = false;
    setup(ctx) {
      this.host = ctx.host;
    }
    resize() {
    }
    render(t, opts) {
      const host = this.host;
      if (!host) return;
      if (!this.touched) {
        host.style.setProperty("-webkit-background-clip", "text");
        host.style.backgroundClip = "text";
        host.style.color = "transparent";
        host.style.setProperty("-webkit-text-fill-color", "transparent");
        host.style.backgroundRepeat = "no-repeat";
        this.touched = true;
      }
      const phase = TAU * t / Math.max(opts.period, 1e-3);
      const walked = Math.sin(phase) * opts.walk;
      const inks = [opts.first, opts.second, opts.third];
      const blend = clamp015(opts.blend);
      const stops = [];
      for (let i = 0; i < inks.length; i++) {
        const centre = i / (inks.length - 1);
        for (let s = 0; s < STEPS; s++) {
          const along = s / (STEPS - 1);
          const base = centre + (along - 0.5) * blend * (1 / (inks.length - 1));
          const nudge = (hash22(i * 31 + s, opts.seed) - 0.5) * opts.wobble * blend * 0.22 * Math.cos(phase + s * 1.3 + i);
          const at2 = clamp015(base + nudge + walked);
          stops.push(`${inks[i]} ${(at2 * 100).toFixed(2)}%`);
        }
      }
      const ordered = stops.map((stop) => {
        const at2 = Number(stop.slice(stop.lastIndexOf(" ") + 1, -1));
        return { stop, at: at2 };
      }).sort((a, b) => a.at - b.at).map((entry) => entry.stop).join(", ");
      const image = `linear-gradient(${opts.angle.toFixed(1)}deg, ${ordered})`;
      if (image !== this.previous) {
        host.style.backgroundImage = image;
        this.previous = image;
      }
    }
    teardown() {
      const host = this.host;
      if (host && this.touched) {
        host.style.removeProperty("-webkit-background-clip");
        host.style.backgroundClip = "";
        host.style.color = "";
        host.style.removeProperty("-webkit-text-fill-color");
        host.style.backgroundImage = "";
        host.style.backgroundRepeat = "";
      }
      this.touched = false;
      this.previous = "";
      this.host = null;
    }
  };
  function createSplitFountainText(el, opts = {}) {
    return mount(el, opts, {
      defaults: splitFountainTextDefaults,
      kind: "dom",
      create: () => new SplitFountainTextSurface()
    });
  }
  var core_default6 = createSplitFountainText;

  // templates/quoin-and-rule/meta.json
  var meta_default = {
    name: "Quoin & Rule",
    slug: "quoin-and-rule",
    description: "An invented letterpress studio, built entirely from library items, on paper",
    intent: "The paper end of the library under load: a twelve column grid carrying real copy and photographs, with two WebGL backdrops brokered by the stage so only one context is ever live.",
    ground: "paper",
    uses: [
      {
        name: "TwelveColumn",
        slug: "twelve-column",
        kind: "grid"
      },
      {
        name: "PaperGrain",
        slug: "paper-grain",
        kind: "effect"
      },
      {
        name: "RegistrationMarks",
        slug: "registration-marks",
        kind: "effect"
      },
      {
        name: "MaskedHeading",
        slug: "masked-heading",
        kind: "effect"
      },
      {
        name: "RotatingWords",
        slug: "rotating-words",
        kind: "effect"
      },
      {
        name: "CountUpNumber",
        slug: "count-up-number",
        kind: "effect"
      },
      {
        name: "SplitFountainText",
        slug: "split-fountain-text",
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

  // templates/quoin-and-rule/entry.ts
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
  var sections = [...document.querySelectorAll("[data-stage-section]")];
  var stage = createStage(
    sections.map((section) => {
      const host = section.querySelector("[data-backdrop]");
      const which = host.dataset["backdrop"];
      return {
        el: section,
        create: () => which === "paper-grain" ? core_default(host) : core_default2(host)
      };
    })
  );
  var hero = at("#hero-line");
  if (hero) keep(core_default3(hero, { direction: "up", duration: 1700, hold: 350 }));
  var words = at("#we-print");
  if (words) keep(core_default4(words, { interval: 2400, rise: 0, blur: 0 }));
  for (const counter of document.querySelectorAll(".counter")) {
    keep(core_default5(counter, { duration: 1400 }));
  }
  var quote = at("#quote-line");
  if (quote) keep(core_default6(quote));
  var manifest = at("#manifest");
  if (manifest) {
    for (const item of used) {
      const li = document.createElement("li");
      const label = item.slug ? `<a href="https://beamish.ink/${item.kind === "grid" ? "grids" : "effects"}/${item.slug}">${item.name}</a>` : item.name;
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
    }
  };
  window.__beamish = driver;
  if (!new URLSearchParams(location.search).has("record")) scrollTo(0, 0);
})();
