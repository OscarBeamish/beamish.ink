#version 300 es
precision highp float;

/*
 * PrismSpectrum: a beam of white light through a turning prism.
 *
 * The fan is not a rainbow gradient drawn at an angle. It is traced: sixteen
 * wavelengths, each refracted at the entry face, carried through the glass,
 * refracted again on the way out, and drawn as its own ray.
 *
 * What makes that worth doing is that every property people recognise falls
 * out of it rather than being arranged:
 *
 *   Red bends least and violet most, because the refractive index of glass
 *   rises towards the blue end. That ordering is not a choice here. Reverse the
 *   dispersion constant and the spectrum reverses, as it would in a material
 *   with anomalous dispersion.
 *
 *   The fan is narrow. A real 60 degree prism in crown glass spreads the
 *   visible band by about one degree, which is why a prism throws a long thin
 *   spectrum rather than a wide one, and why the picture everyone has in mind
 *   is of a spectrum cast several metres away.
 *
 *   The spread changes as the prism turns, and it is least near minimum
 *   deviation, where the beam passes symmetrically. That is the one place the
 *   fan tightens as it sweeps, and it is the detail that says this is being
 *   worked out rather than painted.
 *
 * The index comes from Cauchy's equation, n = A + B / lambda squared, which is
 * the two-term fit every glass catalogue starts with. A is roughly the index in
 * the middle of the band and B is the dispersion.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_background;
uniform float u_apex;
uniform float u_incidence;
uniform float u_index;
uniform float u_dispersion;
uniform float u_size;
uniform float u_spread;
uniform float u_brightness;
uniform float u_glass;
uniform float u_tilt;
uniform float u_sway;
uniform float u_grain;

out vec4 fragColor;

const float TAU = 6.28318530718;
const float PI = 3.14159265359;
const int SAMPLES = 16;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec2 turn(vec2 p, float a) {
  float s = sin(a), c = cos(a);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

/*
 * Ray against one edge, as a segment rather than an infinite line, so the hit
 * is on the prism rather than on its continuation.
 */
bool hitEdge(vec2 o, vec2 d, vec2 p0, vec2 p1, out float t, out vec2 nrm) {
  vec2 e = p1 - p0;
  float den = d.x * e.y - d.y * e.x;
  if (abs(den) < 1e-7) return false;
  vec2 diff = p0 - o;
  float tt = (diff.x * e.y - diff.y * e.x) / den;
  float u = (diff.x * d.y - diff.y * d.x) / den;
  if (tt <= 1e-4 || u < 0.0 || u > 1.0) return false;
  t = tt;
  nrm = normalize(vec2(e.y, -e.x));
  return true;
}

/* The nearest of the three edges. */
bool hitPrism(vec2 o, vec2 d, vec2 a, vec2 b, vec2 c, out float t, out vec2 nrm) {
  bool found = false;
  t = 1e9;
  float tt;
  vec2 nn;
  if (hitEdge(o, d, a, b, tt, nn) && tt < t) { t = tt; nrm = nn; found = true; }
  if (hitEdge(o, d, b, c, tt, nn) && tt < t) { t = tt; nrm = nn; found = true; }
  if (hitEdge(o, d, c, a, tt, nn) && tt < t) { t = tt; nrm = nn; found = true; }
  return found;
}

/* Distance from a point to a segment, and to a half-line. */
float distSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-9), 0.0, 1.0);
  return length(pa - ba * h);
}

float distRay(vec2 p, vec2 o, vec2 d) {
  float h = max(dot(p - o, d), 0.0);
  return length(p - o - d * h);
}

/* Signed distance to the triangle, negative inside. */
float sdTriangle(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2;
  vec2 v0 = p - p0, v1 = p - p1, v2 = p - p2;
  vec2 q0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 q1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 q2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(
    min(vec2(dot(q0, q0), s * (v0.x * e0.y - v0.y * e0.x)),
        vec2(dot(q1, q1), s * (v1.x * e1.y - v1.y * e1.x))),
    vec2(dot(q2, q2), s * (v2.x * e2.y - v2.y * e2.x))
  );
  return -sqrt(d.x) * sign(d.y);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 p = (cssPx - cssRes * 0.5) / max(shortSide, 1.0);

  float phase = TAU * u_time / max(u_period, 0.001);

  /*
   * The prism: an isoceles triangle of the given apex angle, turning slowly.
   *
   * The sway is a sine rather than a spin. A prism rotating through a whole
   * turn spends most of the cycle with the beam missing it or exiting through
   * the face it came in by, and the interesting part, the pass through minimum
   * deviation, goes by in a moment. Rocking it through a few degrees keeps the
   * spectrum on the screen and sweeps it across the one range that matters.
   */
  float apex = radians(clamp(u_apex, 20.0, 110.0));
  float height = u_size;
  float halfBase = height * tan(apex * 0.5);
  float angle = radians(u_tilt) + u_sway * sin(phase);

  /*
   * Set high and to the right rather than in the middle of the frame. The beam
   * arrives from the left and the spectrum leaves downward, so a centred prism
   * throws its fan off the bottom corner within a third of the width. Put the
   * glass where the light has somewhere to go and both halves of the picture
   * get a diagonal to run along.
   */
  vec2 centre = vec2(0.26, 0.15);
  vec2 v0 = centre + turn(vec2(0.0, height * 0.6), angle);
  vec2 v1 = centre + turn(vec2(-halfBase, -height * 0.4), angle);
  vec2 v2 = centre + turn(vec2(halfBase, -height * 0.4), angle);

  // The incoming beam, aimed at the middle of the left face.
  vec2 aim = mix(v0, v1, 0.55);
  vec2 dir = vec2(cos(radians(u_incidence)), sin(radians(u_incidence)));
  vec2 start = aim - dir * 1.6;

  vec3 col = u_background;

  float entryT;
  vec2 entryN;
  bool entered = hitPrism(start, dir, v0, v1, v2, entryT, entryN);
  vec2 entry = start + dir * entryT;

  // The beam on its way in. One white line, because nothing has split yet.
  float incident = exp(-pow(distSegment(p, start, entry) / u_spread, 2.0));
  col += vec3(1.0, 0.98, 0.94) * incident * u_brightness * (entered ? 1.0 : 1.0);

  if (entered) {
    /*
     * Which face it leaves by is worked out once, with the middle of the band,
     * rather than per wavelength. The rays inside the glass differ by a fraction
     * of a degree, so they leave through the same face as each other; tracing
     * all sixteen against all three edges would be three times the work for a
     * difference below a pixel.
     */
    float nMid = u_index + u_dispersion / (0.55 * 0.55);
    vec2 inwardN = dot(entryN, dir) > 0.0 ? entryN : -entryN;
    vec2 midDir = refract(dir, -inwardN, 1.0 / nMid);

    float exitT;
    vec2 exitN;
    bool leaves = hitPrism(entry, midDir, v0, v1, v2, exitT, exitN);

    if (leaves) {
      vec2 exitPoint = entry + midDir * exitT;

      // The beam inside the glass. Still nearly white: the split is there, it
      // is just a fraction of a degree wide over this distance.
      float inside = exp(-pow(distSegment(p, entry, exitPoint) / (u_spread * 0.9), 2.0));
      col += vec3(0.92, 0.95, 1.0) * inside * u_brightness * 0.55;

      /*
       * And the fan. Sixteen wavelengths, each with its own index from Cauchy's
       * equation, refracted twice and drawn as its own ray from where it leaves
       * the glass.
       *
       * The tints are the CIE 1931 colour matching functions converted to
       * linear sRGB, evaluated at build time. Several of them are outside the
       * gamut and clamp, which is correct and unavoidable: a monitor cannot
       * show a spectral green, and the honest thing is to let it sit on the
       * edge of what it can show rather than desaturate the whole spectrum to
       * make it fit.
       */
      const float LAMBDA[16] = float[16](
        400.0, 420.0, 440.0, 460.0, 480.0, 500.0, 520.0, 540.0,
        560.0, 580.0, 600.0, 620.0, 640.0, 660.0, 680.0, 700.0
      );
      const vec3 TINT[16] = vec3[16](
        vec3(0.0054, 0.0000, 0.0674),
        vec3(0.1276, 0.0000, 0.7261),
        vec3(0.2799, 0.0000, 1.9288),
        vec3(0.0000, 0.0000, 1.8474),
        vec3(0.0000, 0.2053, 0.8696),
        vec3(0.0000, 0.6500, 0.2298),
        vec3(0.0000, 1.3153, 0.0000),
        vec3(0.0000, 1.5814, 0.0000),
        vec3(0.4478, 1.3301, 0.0000),
        vec3(1.7127, 0.7767, 0.0000),
        vec3(2.5520, 0.1742, 0.0000),
        vec3(2.2871, 0.0000, 0.0000),
        vec3(1.2581, 0.0000, 0.0000),
        vec3(0.4373, 0.0000, 0.0000),
        vec3(0.0953, 0.0000, 0.0000),
        vec3(0.0123, 0.0027, 0.0000)
      );

      vec2 outwardN = dot(exitN, midDir) < 0.0 ? -exitN : exitN;

      for (int i = 0; i < SAMPLES; i++) {
        float um = LAMBDA[i] * 0.001;
        float n = u_index + u_dispersion / (um * um);

        vec2 inDir = refract(dir, -inwardN, 1.0 / n);
        if (dot(inDir, inDir) < 1e-6) continue;

        /*
         * Carried the same distance through the glass as the middle of the
         * band. The rays inside differ by a fraction of a degree, so over the
         * width of a prism they arrive within a pixel of each other, and
         * intersecting each one against the faces again would be three times
         * the work for a difference nobody can see.
         */
        vec2 x = entry + inDir * exitT;

        vec2 outDir = refract(inDir, outwardN, n);
        // Total internal reflection: no ray leaves at this wavelength, which is
        // a real thing a prism does and not a case to paper over.
        if (dot(outDir, outDir) < 1e-6) continue;
        outDir = normalize(outDir);

        float d = distRay(p, x, outDir);
        float reach = exp(-max(dot(p - x, outDir), 0.0) * 0.3);
        float ray = exp(-pow(d / (u_spread * 1.35), 2.0));
        col += TINT[i] * ray * reach * u_brightness * 0.22;
      }
    }
  }

  /*
   * The glass itself, last and faintly. It is a window rather than an object:
   * what you are meant to look at is the light, and a prism drawn as a solid
   * shape in front of its own spectrum is a paperweight.
   */
  float sd = sdTriangle(p, v0, v1, v2);
  float body = smoothstep(0.004, -0.004, sd);
  float edge = exp(-pow(abs(sd) / 0.0045, 2.0));
  col += vec3(0.55, 0.62, 0.78) * body * 0.05 * u_glass;
  col += vec3(0.8, 0.86, 1.0) * edge * 0.5 * u_glass;

  // A soft shoulder rather than a clamp, so where the rays cross they go white
  // the way a photograph does rather than flattening into a hard patch.
  col = vec3(1.0) - exp(-col);

  float tooth = hash12(floor(gl_FragCoord.xy * 0.5)) - 0.5;
  col += tooth * 0.03 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
