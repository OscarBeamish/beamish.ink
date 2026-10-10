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

  // effects/halftone-reveal/core.ts
  var ORDERS = ["sweep", "centre", "edges", "shadows", "highlights"];
  var SHAPES = ["round", "square", "diamond"];
  var halftoneRevealDefaults = {
    paper: "auto",
    screen: 14,
    angle: 45,
    sweep: 24,
    scatter: 0.55,
    order: "sweep",
    shape: "round",
    feather: 0.55,
    grain: 0.4,
    duration: 1800,
    reducedMotionTime: 999
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
 * HalftoneReveal: a picture arriving the way a printed one does.
 *
 * Not a fade and not a wipe. The image is screened into halftone cells, and each
 * cell's dot grows from nothing to full. That is how a halftone actually carries
 * tone, so growing the dots is the honest way to bring one in, and it looks like
 * a press coming up to pressure rather than like opacity being turned up.
 *
 * The cells do not all start together. Each one gets an order, and the order is
 * a blend between where the cell sits along the sweep direction and a hash of
 * its coordinates. At \`scatter\` 0 that is a clean directional sweep; at 1 it is
 * a random dissolve. Everything in between is the useful part.
 */

uniform sampler2D u_image;

uniform vec2  u_resolution;
uniform vec2  u_imageSize;
uniform float u_dpr;
uniform vec3  u_paper;
uniform float u_progress;
uniform float u_screen;
uniform float u_angle;
uniform float u_sweep;
uniform float u_scatter;
uniform float u_order;
uniform float u_shape;
uniform float u_feather;
uniform float u_grain;

out vec4 fragColor;

const float DEG = 0.01745329252;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec2 rot(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c) * p;
}

/* Cover fit, the CSS object-fit rule, in UV space. */
vec2 cover(vec2 uv, vec2 frame, vec2 image) {
  float frameAspect = frame.x / max(frame.y, 1.0);
  float imageAspect = image.x / max(image.y, 1.0);
  vec2 scale = imageAspect > frameAspect
    ? vec2(frameAspect / imageAspect, 1.0)
    : vec2(1.0, imageAspect / frameAspect);
  return (uv - 0.5) * scale + 0.5;
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  vec2 uv = cssPx / cssRes;

  vec2 sampled = cover(vec2(uv.x, 1.0 - uv.y), u_resolution, u_imageSize);
  vec3 ink = texture(u_image, sampled).rgb;

  /*
   * The screen is laid out in CSS pixels rather than in UV, so the dots stay
   * round and stay the same size when the element changes shape. A screen
   * defined in UV turns into ellipses the moment the box is not square.
   */
  vec2 screen = rot(cssPx, u_angle * DEG) / max(u_screen, 1.0);
  vec2 cell = floor(screen);

  /*
   * One pixel, measured in screen cells, for the edge of every dot. Taken out
   * here rather than inside the loop below: a derivative of a value that varies
   * between iterations is not something to rely on, and the figure is the same
   * for all nine cells anyway.
   */
  float aa = max(fwidth(screen.x), fwidth(screen.y)) * 0.75 + 0.001;

  float feather = max(u_feather, 0.001);
  vec2 dir = rot(vec2(1.0, 0.0), u_sweep * DEG);
  float coverage = 0.0;

  /*
   * Tone, for the two orders that arrive by density rather than by position.
   * Rec. 601 weights: a flat average makes a saturated blue as dark as a
   * saturated yellow and the eye says otherwise by a factor of six.
   *
   * Read at this pixel rather than at each cell's centre, which would be nine
   * more texture samples. The difference is sub-cell on a photograph and the
   * ordering is a soft field, so it costs nothing visible and saves the reads.
   */
  float tone = dot(ink, vec3(0.299, 0.587, 0.114));

  /*
   * The nine cells around this pixel, not just the one it sits in.
   *
   * A dot only stays a dot while it fits inside its own cell. Past a radius of
   * 0.5 a single-cell test clips the circle against the cell edges, so the dots
   * grow into rounded squares and then into plain squares, and the reveal ends
   * up looking like blocks rather than like a screen. Taking the union over the
   * neighbourhood instead lets them spill across the boundaries and merge into
   * each other, which is what ink does.
   */
  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 c = cell + vec2(float(ox), float(oy));
      vec2 centre = c + 0.5;

      // Back out of the rotated screen to find where this cell sits in the
      // frame, which is what the sweep is measured along.
      vec2 cellPx = rot(centre * max(u_screen, 1.0), -u_angle * DEG);
      float along = dot(cellPx / cssRes - 0.5, dir) + 0.5;

      /*
       * Where this cell sits in the queue, 0 first and 1 last.
       *
       * 0 sweep: across the frame along \`sweep\`.
       * 1 centre: the middle first, working out.
       * 2 edges: the border first, closing in.
       * 3 shadows: the darks first, which is the order a press lays ink down
       *   in: the heavy areas are the ones that take it.
       * 4 highlights: the lights first, which reads as a picture emerging out
       *   of the paper rather than being printed onto it.
       */
      vec2 fromMiddle = cellPx / cssRes - 0.5;
      float radial = clamp(length(fromMiddle * vec2(1.0, cssRes.y / max(cssRes.x, 1.0))) * 2.0, 0.0, 1.0);

      float place = clamp(along, 0.0, 1.0);
      if (u_order > 0.5 && u_order < 1.5) place = radial;
      else if (u_order > 1.5 && u_order < 2.5) place = 1.0 - radial;
      else if (u_order > 2.5 && u_order < 3.5) place = tone;
      else if (u_order > 3.5) place = 1.0 - tone;

      float order = mix(place, hash12(c), u_scatter);

      /*
       * Scaled by 1 + feather so that at progress 1 every cell has finished,
       * however late its order. Without it the last cells are still growing
       * when the reveal is nominally over and the picture never quite arrives.
       */
      float local = clamp((u_progress * (1.0 + feather) - order) / feather, 0.0, 1.0);

      /*
       * The dot's shape, and the radius that fills a cell with it.
       *
       * These are real screens rather than decoration. A round dot is the
       * default everywhere. A square dot holds its shape into the shadows
       * instead of merging, which is why newspapers used it. A diamond is the
       * one that breaks up the jump at fifty percent, where round dots all
       * touch their neighbours at once and the midtone goes abruptly dark.
       *
       * Each needs a different radius to leave no paper behind: a circle has to
       * reach the corner at 0.707, a square fills at 0.5, and a diamond needs
       * 1.0 because its distance is measured along the axes.
       */
      vec2 q = screen - centre;
      float d;
      float fill;
      if (u_shape > 1.5) {
        d = abs(q.x) + abs(q.y);
        fill = 1.02;
      } else if (u_shape > 0.5) {
        d = max(abs(q.x), abs(q.y));
        fill = 0.52;
      } else {
        d = length(q);
        fill = 0.72;
      }

      float radius = local * fill;
      coverage = max(coverage, smoothstep(radius + aa, radius - aa, d));
    }
  }

  vec3 col = mix(u_paper, ink, coverage);

  float tooth = hash12(floor(cssPx * 0.5) + 11.0) - 0.5;
  col += tooth * 0.045 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
  var UNIFORMS = [
    "u_image",
    "u_resolution",
    "u_imageSize",
    "u_dpr",
    "u_paper",
    "u_progress",
    "u_screen",
    "u_angle",
    "u_sweep",
    "u_scatter",
    "u_order",
    "u_shape",
    "u_feather",
    "u_grain"
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
    if (!shader) throw new Error("HalftoneReveal: could not create shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`HalftoneReveal: shader failed to compile
${log ?? ""}`);
    }
    return shader;
  }
  var HalftoneRevealSurface = class {
    gl = null;
    program = null;
    vao = null;
    locations = /* @__PURE__ */ new Map();
    size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 };
    texture = null;
    imageSize = { width: 1, height: 1 };
    image = null;
    setup(ctx) {
      if (!ctx.canvas) throw new Error("HalftoneReveal needs a canvas");
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
      if (!gl) throw new Error("HalftoneReveal needs WebGL2, which this browser did not provide");
      const vert = compile(gl, gl.VERTEX_SHADER, VERT);
      const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG);
      const program = gl.createProgram();
      if (!program) throw new Error("HalftoneReveal: could not create program");
      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`HalftoneReveal: program failed to link
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
      const image = ctx.host.querySelector("img");
      if (image) {
        this.image = image;
        image.style.visibility = "hidden";
        if (image.complete && image.naturalWidth > 0) this.upload(image);
        else image.addEventListener("load", () => this.upload(image), { once: true });
      }
    }
    upload(image) {
      const gl = this.gl;
      if (!gl || this.texture || image.naturalWidth === 0) return;
      const texture = gl.createTexture();
      if (!texture) return;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.texture = texture;
      this.imageSize = { width: image.naturalWidth, height: image.naturalHeight };
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
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.uniform1i(loc("u_image"), 0);
      gl.uniform2f(loc("u_resolution"), this.size.pixelWidth, this.size.pixelHeight);
      gl.uniform2f(loc("u_imageSize"), this.imageSize.width, this.imageSize.height);
      gl.uniform1f(loc("u_dpr"), this.size.dpr);
      gl.uniform3fv(loc("u_paper"), rgb(opts.paper));
      const seconds = Math.max(opts.duration, 1) / 1e3;
      const k = Math.min(Math.max(t / seconds, 0), 1);
      gl.uniform1f(loc("u_progress"), k * k * (3 - 2 * k));
      gl.uniform1f(loc("u_screen"), opts.screen);
      gl.uniform1f(loc("u_angle"), opts.angle);
      gl.uniform1f(loc("u_sweep"), opts.sweep);
      gl.uniform1f(loc("u_scatter"), opts.scatter);
      gl.uniform1f(loc("u_order"), Math.max(ORDERS.indexOf(opts.order), 0));
      gl.uniform1f(loc("u_shape"), Math.max(SHAPES.indexOf(opts.shape), 0));
      gl.uniform1f(loc("u_feather"), opts.feather);
      gl.uniform1f(loc("u_grain"), opts.grain);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    context() {
      return this.gl;
    }
    teardown() {
      const gl = this.gl;
      if (gl) {
        if (this.texture) gl.deleteTexture(this.texture);
        if (this.program) gl.deleteProgram(this.program);
        if (this.vao) gl.deleteVertexArray(this.vao);
      }
      if (this.image) this.image.style.visibility = "";
      this.image = null;
      this.texture = null;
      this.gl = null;
      this.program = null;
      this.vao = null;
      this.locations.clear();
    }
  };
  function createHalftoneReveal(el, opts = {}) {
    return mount(el, opts, {
      defaults: halftoneRevealDefaults,
      create: () => new HalftoneRevealSurface()
    });
  }
  var core_default = createHalftoneReveal;

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
  var UNIFORMS2 = [
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
      const vert = compile2(gl, gl.VERTEX_SHADER, VERT2);
      const frag = compile2(gl, gl.FRAGMENT_SHADER, FRAG2);
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
      gl.uniform3fv(loc("u_fibre"), rgb2(opts.fibre));
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
  var core_default2 = createPaperGrain;

  // effects/expanding-tiles/core.ts
  var expandingTilesDefaults = {
    duration: 620,
    closeDuration: 420,
    bleed: 0.04,
    rule: 1,
    ruleColour: "rgba(54, 54, 48, 0.28)",
    lead: 0.18,
    follow: true,
    reducedMotionTime: 0
  };
  var clamp012 = (n) => n < 0 ? 0 : n > 1 ? 1 : n;
  var easeOutQuint = (k) => 1 - Math.pow(1 - k, 5);
  var ExpandingTilesSurface = class {
    host = null;
    tiles = [];
    cells = [];
    /* Where each tile's children sit while the grid is at rest. */
    atRest = [];
    /*
     * Where they sit once the tile fills the window, measured the first time a
     * tile is opened at a given window size and kept. Keyed by index and size, so
     * it is a function of the layout rather than of what happened before: the
     * recorder can seek straight into the middle of a gesture and get the same
     * numbers as a page that played it from the start.
     */
    whenOpen = /* @__PURE__ */ new Map();
    rules = [];
    layer = null;
    /*
     * Stands in for the opened tile while it is out of flow.
     *
     * An opened tile is fixed to the window, which takes it out of the grid, and a
     * grid with one fewer item re-places every item after it: the tiles behind the
     * one you pressed shuffle up a cell and the grid's own background shows
     * through the hole. Sized in pixels from the cell we already measured, so it
     * holds the slot whatever the tracks are written in.
     */
    placeholder = null;
    lifted = -1;
    /* Real presses, in the same list as the scripted ones. See phase(). */
    live = [];
    /* The last time render was handed, so a real press can be stamped with it. */
    now = 0;
    /* What was applied last, so a still grid writes nothing at all. */
    applied = "";
    /* Whether anything is open, for the Escape handler. */
    openNow = false;
    /* The tile already followed, so a completed open navigates exactly once. */
    followed = -1;
    restoreFocus = null;
    onPress = (event) => {
      const host = this.host;
      if (!host) return;
      const box = host.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return;
      const x = (event.clientX - box.left) / box.width;
      const y = (event.clientY - box.top) / box.height;
      this.live.push({ t: this.now, x, y });
      if (this.hit(x, y) >= 0) event.preventDefault();
    };
    onKey = (event) => {
      if (event.key !== "Escape" || !this.openNow) return;
      this.live.push({ t: this.now, x: -1, y: -1 });
    };
    setup(ctx) {
      const host = ctx.host;
      this.host = host;
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      host.addEventListener("pointerdown", this.onPress);
      document.addEventListener("keydown", this.onKey);
    }
    build() {
      const host = this.host;
      if (!host || this.tiles.length > 0) return;
      this.tiles = [...host.children].filter(
        (node) => node instanceof HTMLElement && node !== this.placeholder
      );
      for (const tile of this.tiles) {
        tile.style.willChange = "clip-path";
        if (!tile.hasAttribute("aria-expanded")) tile.setAttribute("aria-expanded", "false");
      }
      const layer = document.createElement("div");
      layer.setAttribute("aria-hidden", "true");
      layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483646;display:none";
      for (let i = 0; i < 4; i++) {
        const rule = document.createElement("div");
        layer.append(rule);
        this.rules.push(rule);
      }
      document.body.append(layer);
      this.layer = layer;
    }
    /** Which tile covers a point given in the element's own 0 to 1 space. */
    hit(x, y) {
      const host = this.host;
      if (!host || x < 0 || x > 1 || y < 0 || y > 1) return -1;
      const box = host.getBoundingClientRect();
      const px = box.left + x * box.width;
      const py = box.top + y * box.height;
      for (let i = 0; i < this.cells.length; i++) {
        const c = this.cells[i];
        if (px >= c.left && px <= c.right && py >= c.top && py <= c.bottom) return i;
      }
      return -1;
    }
    resize() {
      const host = this.host;
      if (!host) return;
      this.build();
      if (this.lifted >= 0) {
        this.whenOpen.clear();
        return;
      }
      this.cells = this.tiles.map((tile) => {
        const r = tile.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      });
      this.atRest = this.tiles.map(
        (tile) => [...tile.children].filter((n) => n instanceof HTMLElement).map((child) => {
          const r = child.getBoundingClientRect();
          return { x: r.left, y: r.top };
        })
      );
      this.whenOpen.clear();
    }
    /**
     * The gesture at time `t`, folded out of every press at or before it.
     *
     * Folding from scratch each frame rather than remembering is what keeps this
     * seekable: the recorder can ask for any `t` in any order and get the same
     * answer, which a remembered `isOpen` flag could never do.
     */
    phase(t, opts) {
      const scripted = opts.pressPath ?? [];
      const presses = [...scripted, ...this.live].filter((p) => p.t <= t).sort((a, b) => a.t - b.t);
      let phase = null;
      for (const press of presses) {
        const hit = this.hit(press.x, press.y);
        if (phase && phase.opening) {
          phase = { index: phase.index, at: press.t, opening: false };
        } else if (hit >= 0) {
          phase = { index: hit, at: press.t, opening: true };
        }
      }
      return phase;
    }
    /*
     * Take the tile out of the grid and leave something holding its cell. Both
     * happen together or the grid behind reflows for a frame, which is visible as
     * every other tile jumping at the moment of the press.
     */
    lift(index, tile, cell) {
      if (this.lifted === index) return;
      this.drop();
      const stand = document.createElement("div");
      stand.setAttribute("aria-hidden", "true");
      stand.style.cssText = `width:${(cell.right - cell.left).toFixed(2)}px;height:${(cell.bottom - cell.top).toFixed(2)}px;pointer-events:none`;
      tile.before(stand);
      this.placeholder = stand;
      this.lifted = index;
      tile.style.position = "fixed";
      tile.style.inset = "0";
      tile.style.margin = "0";
      tile.style.zIndex = "2147483645";
    }
    /** Put the grid back the way the page wrote it. */
    drop() {
      this.placeholder?.remove();
      this.placeholder = null;
      this.lifted = -1;
    }
    /*
     * Where this tile's children sit once it fills the window. Measured once per
     * tile per window size, with the counter-translation off so the reading is of
     * the layout rather than of the last frame.
     */
    openShifts(index, tile, vw, vh) {
      const key = `${index}|${vw}x${vh}`;
      const had = this.whenOpen.get(key);
      if (had) return had;
      const kids = [...tile.children].filter((n) => n instanceof HTMLElement);
      for (const child of kids) child.style.transform = "";
      const shifts = kids.map((child) => {
        const r = child.getBoundingClientRect();
        return { x: r.left, y: r.top };
      });
      this.whenOpen.set(key, shifts);
      return shifts;
    }
    render(t, opts, _pointer) {
      this.now = t;
      const host = this.host;
      if (!host) return;
      this.build();
      if (this.cells.length !== this.tiles.length) this.resize();
      const phase = this.phase(t, opts);
      if (!phase) {
        this.rest();
        return;
      }
      const span2 = Math.max(phase.opening ? opts.duration : opts.closeDuration, 1) / 1e3;
      const raw = clamp012((t - phase.at) / span2);
      if (!phase.opening && raw >= 1) {
        this.rest();
        return;
      }
      const cell = this.cells[phase.index];
      const tile = this.tiles[phase.index];
      if (!cell || !tile) {
        this.rest();
        return;
      }
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const eased = easeOutQuint(raw);
      const p = phase.opening ? eased : 1 - eased;
      const ledEase = easeOutQuint(clamp012(raw * (1 + opts.lead)));
      const pRule = phase.opening ? ledEase : 1 - ledEase;
      const state = `${phase.index}|${p.toFixed(4)}|${vw}x${vh}`;
      if (state === this.applied) return;
      this.applied = state;
      this.openNow = true;
      if (!this.restoreFocus && document.activeElement instanceof HTMLElement) {
        this.restoreFocus = document.activeElement;
      }
      for (let i = 0; i < this.tiles.length; i++) {
        if (i === phase.index) continue;
        const other = this.tiles[i];
        other.style.pointerEvents = "none";
        other.setAttribute("aria-expanded", "false");
      }
      this.lift(phase.index, tile, cell);
      tile.setAttribute("aria-expanded", "true");
      const inset = {
        left: cell.left * (1 - p),
        top: cell.top * (1 - p),
        right: (vw - cell.right) * (1 - p),
        bottom: (vh - cell.bottom) * (1 - p)
      };
      tile.style.clipPath = `inset(${inset.top.toFixed(2)}px ${inset.right.toFixed(2)}px ${inset.bottom.toFixed(2)}px ${inset.left.toFixed(2)}px)`;
      const open = this.openShifts(phase.index, tile, vw, vh);
      const rest = this.atRest[phase.index] ?? [];
      const kids = [...tile.children].filter((n) => n instanceof HTMLElement);
      for (let i = 0; i < kids.length; i++) {
        const from = rest[i];
        const to = open[i];
        if (!from || !to) continue;
        const dx = (from.x - to.x) * (1 - p);
        const dy = (from.y - to.y) * (1 - p);
        kids[i].style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
      }
      this.drawRules(opts, cell, pRule, vw, vh);
      if (phase.opening && raw >= 1 && opts.follow && this.followed !== phase.index) {
        const href = tile.getAttribute("href");
        if (href) {
          this.followed = phase.index;
          window.location.assign(href);
        }
      }
    }
    /*
     * The four rules that bounded the cell, travelling out to the edges. They lead
     * the clip slightly, because an edge that arrives with the thing it bounds
     * reads as a border rather than as a movement.
     */
    drawRules(opts, cell, pRule, vw, vh) {
      const layer = this.layer;
      if (!layer) return;
      if (opts.rule <= 0) {
        layer.style.display = "none";
        return;
      }
      const fade = clamp012(pRule / 0.15);
      if (fade <= 1e-3) {
        layer.style.display = "none";
        return;
      }
      layer.style.display = "block";
      layer.style.opacity = fade.toFixed(3);
      const overX = vw * opts.bleed * pRule;
      const overY = vh * opts.bleed * pRule;
      const w = opts.rule;
      const top = cell.top * (1 - pRule);
      const bottom = (vh - cell.bottom) * (1 - pRule);
      const left = cell.left * (1 - pRule);
      const right = (vw - cell.right) * (1 - pRule);
      const geometry = [
        `left:${-overX}px;right:${-overX}px;top:${top.toFixed(2)}px;height:${w}px`,
        `left:${-overX}px;right:${-overX}px;bottom:${bottom.toFixed(2)}px;height:${w}px`,
        `top:${-overY}px;bottom:${-overY}px;left:${left.toFixed(2)}px;width:${w}px`,
        `top:${-overY}px;bottom:${-overY}px;right:${right.toFixed(2)}px;width:${w}px`
      ];
      for (let i = 0; i < 4; i++) {
        this.rules[i].style.cssText = `position:absolute;background:${opts.ruleColour};${geometry[i]}`;
      }
    }
    /** Everything back where the page put it. */
    rest() {
      this.openNow = false;
      if (this.applied === "") return;
      this.applied = "";
      this.followed = -1;
      this.drop();
      for (const tile of this.tiles) {
        tile.style.position = "";
        tile.style.inset = "";
        tile.style.margin = "";
        tile.style.zIndex = "";
        tile.style.clipPath = "";
        tile.style.pointerEvents = "";
        tile.setAttribute("aria-expanded", "false");
        for (const child of tile.children) {
          if (child instanceof HTMLElement) child.style.transform = "";
        }
      }
      if (this.layer) this.layer.style.display = "none";
      const back = this.restoreFocus;
      this.restoreFocus = null;
      if (back && this.host?.contains(document.activeElement)) back.focus();
    }
    teardown() {
      this.rest();
      for (const tile of this.tiles) {
        tile.style.willChange = "";
        tile.removeAttribute("aria-expanded");
      }
      this.host?.removeEventListener("pointerdown", this.onPress);
      document.removeEventListener("keydown", this.onKey);
      this.layer?.remove();
      this.layer = null;
      this.rules = [];
      this.tiles = [];
      this.cells = [];
      this.atRest = [];
      this.whenOpen.clear();
      this.live = [];
      this.host = null;
    }
  };
  function createExpandingTiles(el, opts = {}) {
    return mount(el, opts, {
      defaults: expandingTilesDefaults,
      kind: "dom",
      create: () => new ExpandingTilesSurface()
    });
  }
  var core_default3 = createExpandingTiles;

  // effects/scramble-text/core.ts
  var scrambleTextDefaults = {
    split: "char",
    order: "forward",
    stagger: 26,
    duration: 720,
    rise: 22,
    blur: 5,
    scale: 1,
    seed: 7,
    reducedMotionTime: 999
  };
  var clamp013 = (n) => n < 0 ? 0 : n > 1 ? 1 : n;
  var easeOutExpo = (k) => k >= 1 ? 1 : 1 - Math.pow(2, -10 * k);
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = a + 1831565813 >>> 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function orderFor(mode, count, seed) {
    const indices = Array.from({ length: count }, (_, i) => i);
    if (mode === "forward") return indices;
    if (mode === "reverse") return indices.map((i) => count - 1 - i);
    if (mode === "centre") {
      const middle = (count - 1) / 2;
      return indices.map((i) => Math.round(Math.abs(i - middle)));
    }
    const random = seeded(seed);
    const ranks = indices.slice();
    for (let i = ranks.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [ranks[i], ranks[j]] = [ranks[j], ranks[i]];
    }
    return ranks;
  }
  var ScrambleTextSurface = class {
    host = null;
    original = "";
    pieces = [];
    ranks = [];
    builtFor = null;
    setup(ctx) {
      this.host = ctx.host;
      this.original = (ctx.host.textContent ?? "").replace(/\s+/g, " ").trim();
    }
    /*
     * Splitting is destructive, so it happens once per split mode rather than once
     * per frame, and the original string is kept for teardown.
     */
    build(split) {
      const host = this.host;
      if (!host || this.builtFor === split) return;
      host.textContent = "";
      this.pieces = [];
      const label = document.createElement("span");
      label.textContent = this.original;
      label.style.cssText = "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0";
      const visual = document.createElement("span");
      visual.setAttribute("aria-hidden", "true");
      const makePiece = (text) => {
        const piece = document.createElement("span");
        piece.textContent = text;
        piece.style.display = "inline-block";
        piece.style.willChange = "transform, opacity";
        this.pieces.push(piece);
        return piece;
      };
      if (split === "line") {
        visual.append(makePiece(this.original));
      } else {
        const words = this.original.split(" ");
        words.forEach((word, index) => {
          const wrapper = document.createElement("span");
          wrapper.style.display = "inline-block";
          wrapper.style.whiteSpace = "nowrap";
          if (split === "word") {
            wrapper.append(makePiece(word));
          } else {
            for (const character of Array.from(word)) wrapper.append(makePiece(character));
          }
          visual.append(wrapper);
          if (index < words.length - 1) visual.append(document.createTextNode(" "));
        });
      }
      host.append(label, visual);
      this.builtFor = split;
    }
    resize() {
    }
    render(t, opts) {
      this.build(opts.split);
      if (this.pieces.length === 0) return;
      if (this.ranks.length !== this.pieces.length) {
        this.ranks = orderFor(opts.order, this.pieces.length, opts.seed);
      }
      const stagger = opts.stagger / 1e3;
      const duration = Math.max(opts.duration, 1) / 1e3;
      for (let i = 0; i < this.pieces.length; i++) {
        const piece = this.pieces[i];
        const progress = easeOutExpo(clamp013((t - this.ranks[i] * stagger) / duration));
        const remaining = 1 - progress;
        piece.style.opacity = String(progress);
        const shift = remaining * opts.rise;
        const scale = 1 - remaining * (1 - opts.scale);
        piece.style.transform = scale === 1 ? `translateY(${shift}px)` : `translateY(${shift}px) scale(${scale})`;
        piece.style.filter = opts.blur > 0 && remaining > 0.01 ? `blur(${remaining * opts.blur}px)` : "";
      }
    }
    teardown() {
      if (this.host && this.original) this.host.textContent = this.original;
      this.pieces = [];
      this.ranks = [];
      this.builtFor = null;
      this.host = null;
    }
  };
  function createScrambleText(el, opts = {}) {
    return mount(el, opts, {
      defaults: scrambleTextDefaults,
      kind: "dom",
      create: () => new ScrambleTextSurface()
    });
  }
  var core_default4 = createScrambleText;

  // effects/crosshair-cursor/core.ts
  var crosshairCursorDefaults = {
    colour: "#c44400",
    thickness: 1,
    size: 13,
    corner: 9,
    padding: 6,
    ease: 0.22,
    snap: 0.42,
    target: "a, button, [data-target]",
    lines: true,
    reducedMotionTime: 0
  };
  var CrosshairCursorSurface = class {
    host = null;
    layer = null;
    across = null;
    down = null;
    corners = [];
    box = { width: 1, height: 1 };
    /** Where the crosshair is, in pixels, eased behind the hand. */
    at = { x: 0, y: 0 };
    /** Where the brackets are, eased towards whatever they are framing. */
    frame = { x: 0, y: 0, w: 0, h: 0 };
    /** The target's rect, measured when it was entered. Null when free. */
    locked = null;
    /** Where the last hit test was done, so it is not repeated for free. */
    testedAt = { x: -1e9, y: -1e9 };
    started = false;
    setup(ctx) {
      const host = ctx.host;
      this.host = host;
      const layer = document.createElement("div");
      layer.setAttribute("aria-hidden", "true");
      layer.style.cssText = "position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:2";
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      host.append(layer);
      this.layer = layer;
      const line = () => {
        const el = document.createElement("i");
        el.style.cssText = "position:absolute;top:0;left:0;display:block;will-change:transform";
        layer.append(el);
        return el;
      };
      this.across = line();
      this.down = line();
      for (let i = 0; i < 4; i++) {
        const el = document.createElement("i");
        el.style.cssText = "position:absolute;top:0;left:0;display:block;will-change:transform;border-style:solid;border-right:0;border-bottom:0";
        layer.append(el);
        this.corners.push(el);
      }
    }
    resize(size) {
      this.box = { width: size.width, height: size.height };
    }
    render(_t, opts, pointer) {
      const across = this.across;
      const down = this.down;
      if (!across || !down) return;
      const ease2 = Math.min(Math.max(opts.ease, 0.01), 1);
      const snap = Math.min(Math.max(opts.snap, 0.01), 1);
      const wantX = pointer.x * this.box.width;
      const wantY = pointer.y * this.box.height;
      const host = this.host;
      if (host && Math.hypot(wantX - this.testedAt.x, wantY - this.testedAt.y) > 2) {
        this.testedAt = { x: wantX, y: wantY };
        const base = host.getBoundingClientRect();
        const found = pointer.active ? document.elementFromPoint(base.left + wantX, base.top + wantY)?.closest(opts.target || "none") : null;
        if (found && host.contains(found)) {
          const rect = found.getBoundingClientRect();
          this.locked = {
            x: rect.left - base.left + rect.width / 2,
            y: rect.top - base.top + rect.height / 2,
            w: rect.width / 2,
            h: rect.height / 2
          };
        } else {
          this.locked = null;
        }
      }
      if (!this.started) {
        this.at = { x: wantX, y: wantY };
        this.started = true;
      } else {
        this.at.x += (wantX - this.at.x) * ease2;
        this.at.y += (wantY - this.at.y) * ease2;
      }
      const free = { x: this.at.x, y: this.at.y, w: opts.size, h: opts.size };
      const want = this.locked ? {
        x: this.locked.x,
        y: this.locked.y,
        w: this.locked.w + opts.padding,
        h: this.locked.h + opts.padding
      } : free;
      const k = this.locked ? snap : ease2;
      this.frame.x += (want.x - this.frame.x) * k;
      this.frame.y += (want.y - this.frame.y) * k;
      this.frame.w += (want.w - this.frame.w) * k;
      this.frame.h += (want.h - this.frame.h) * k;
      const weight = Math.max(opts.thickness, 0.5);
      const show = pointer.active ? "1" : "0";
      const setLine = (el, horizontal) => {
        el.style.background = opts.colour;
        el.style.opacity = opts.lines ? show : "0";
        if (horizontal) {
          el.style.width = `${this.box.width}px`;
          el.style.height = `${weight}px`;
          el.style.transform = `translate(0, ${(this.frame.y - weight / 2).toFixed(2)}px)`;
        } else {
          el.style.width = `${weight}px`;
          el.style.height = `${this.box.height}px`;
          el.style.transform = `translate(${(this.frame.x - weight / 2).toFixed(2)}px, 0)`;
        }
      };
      setLine(across, true);
      setLine(down, false);
      const arm = Math.max(opts.corner, 1);
      for (let i = 0; i < 4; i++) {
        const el = this.corners[i];
        const flipX = i === 1 || i === 2 ? -1 : 1;
        const flipY = i === 2 || i === 3 ? -1 : 1;
        const x = this.frame.x - flipX * this.frame.w;
        const y = this.frame.y - flipY * this.frame.h;
        el.style.width = `${arm}px`;
        el.style.height = `${arm}px`;
        el.style.borderWidth = `${weight}px`;
        el.style.borderColor = opts.colour;
        el.style.opacity = show;
        el.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${flipX}, ${flipY})`;
      }
    }
    teardown() {
      const host = this.host;
      if (host) host.style.position = "";
      this.layer?.remove();
      this.host = null;
      this.layer = null;
      this.across = null;
      this.down = null;
      this.corners = [];
      this.locked = null;
      this.started = false;
    }
  };
  function createCrosshairCursor(el, opts = {}) {
    return mount(el, opts, {
      defaults: crosshairCursorDefaults,
      kind: "dom",
      create: () => new CrosshairCursorSurface()
    });
  }
  var core_default5 = createCrosshairCursor;

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
  var core_default6 = createCountUpNumber;

  // templates/halide-and-grain/meta.json
  var meta_default = {
    name: "Halide & Grain",
    slug: "halide-and-grain",
    description: "An invented photographic agency where one primitive, the frame of a negative, is every surface on the page",
    intent: "One primitive carrying a whole page. The frame of a negative, with its rebate, its edge printing and its four states, is the masthead, the hero, every figure, every tile, every photographer, every step and every row of the colophon, so there is nothing on the page for the design to be inconsistent with. Underneath it, two grid systems doing the placing: a page this strict about its surfaces is also the page where a grid that drifts is most obvious.",
    ground: "paper",
    uses: [
      {
        name: "TwelveColumn",
        slug: "twelve-column",
        kind: "grid"
      },
      {
        name: "MarginaliaColumns",
        slug: "marginalia-columns",
        kind: "grid"
      },
      {
        name: "HalftoneReveal",
        slug: "halftone-reveal",
        kind: "effect"
      },
      {
        name: "ExpandingTiles",
        slug: "expanding-tiles",
        kind: "effect"
      },
      {
        name: "ScrambleText",
        slug: "scramble-text",
        kind: "effect"
      },
      {
        name: "CrosshairCursor",
        slug: "crosshair-cursor",
        kind: "effect"
      },
      {
        name: "CountUpNumber",
        slug: "count-up-number",
        kind: "effect"
      },
      {
        name: "PaperGrain",
        slug: "paper-grain",
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

  // templates/halide-and-grain/entry.ts
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
        create: () => which === "halftone-reveal" ? core_default(host) : core_default2(host)
      };
    })
  );
  var eyebrow = at("#eyebrow");
  if (eyebrow) keep(core_default4(eyebrow));
  var tiles = at("#tiles");
  if (tiles) keep(core_default3(tiles, { follow: false, ruleColour: "rgba(228, 87, 46, 0.5)" }));
  keep(core_default5(document.body, { colour: "#e4572e", target: ".tile, a, button" }));
  for (const counter of document.querySelectorAll(".counter")) {
    keep(core_default6(counter, { duration: 1600 }));
  }
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
    }
  };
  window.__beamish = driver;
  if (!new URLSearchParams(location.search).has("record")) scrollTo(0, 0);
})();
