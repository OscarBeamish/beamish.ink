
/*
 * The surface, as a sum of travelling waves.
 *
 * Every mode is sin(k·x - omega·t), which is a closed form in t: there is no
 * accumulator anywhere in this effect and renderAtTime can be called with any
 * time in any order. Every omega is a whole number of turns per period, so
 * the whole sea is exactly where it started when the period comes round.
 *
 * The directions fan about straight-on by a fixed spread rather than over
 * the full circle. A real swell has a heading: waves arriving from every
 * direction at once average out into chop, and what reads as a sea rolling
 * toward you is a narrow fan of headings with a little disagreement in it.
 */

attribute float aRipple;

uniform float uTime;
uniform float uPeriod;
uniform float uSwell;
uniform float uScale;
uniform float uWaves;
uniform float uSize;
uniform float uSeed;
uniform vec3 uCursor;
uniform float uPartRadius;
uniform float uPart;
uniform float uActivity;
uniform vec3 uColLow;
uniform vec3 uColHigh;

varying vec3 vColor;
varying float vFade;

const float TAU = 6.28318530718;

void main() {
  vec3 p = position;

  float total = 0.0;
  float height = 0.0;
  /* 24 is the ceiling the loop is unrolled to. A literal rather than a
     JS interpolation: syncShaders escapes ${ on the way into core.ts, because
     a GLSL comment is allowed to contain one, so an interpolation here would
     arrive in the shader as its own source text. */
  int count = int(clamp(uWaves, 3.0, 24.0));

  for (int i = 0; i < 24; i++) {
    if (i >= count) break;
    float fi = float(i);

    /*
     * A fan about straight-on, stepped by the golden angle so no two modes
     * share a heading and the set never lies on a lattice.
     */
    float spread = 0.85;
    float theta = sin(fi * 2.39996323 + uSeed) * spread;
    vec2 dir = vec2(sin(theta), cos(theta));

    /* Geometric wavenumbers: a spectrum rather than a chord. */
    float k = TAU * uScale * pow(1.17, fi) / 12.0;

    /*
     * Deep water disperses, so a long wave runs faster than a short one, as
     * the root of the wavelength. Rounded to whole turns because that is what
     * closes the loop; the rounding bends the dispersion by an amount nobody
     * can see and removes a join everybody would.
     */
    float turns = max(1.0, floor(2.0 * sqrt(TAU * uScale / 12.0 / k) + 0.5));
    float omega = turns * TAU / uPeriod;

    /* Amplitude falls with wavenumber, which is what keeps the fine modes as
       texture on the big ones rather than as noise over them. */
    float a = pow(0.9, fi);
    total += a;

    height += a * sin(k * dot(dir, p.xz) - omega * uTime + fi * 1.7 + uSeed);
  }

  p.y = height / max(total, 0.0001) * uSwell;

  /* The crest is what gets the light. */
  /*
   * Stretched around the middle, not a straight read of the height. A sum of
   * sines spends most of its time near zero because the modes cancel, so a
   * plain remap leaves every point sitting on the middle of the ramp and the
   * sheet comes out one flat colour. The crest has to reach the high colour
   * or there is no point having one.
   */
  float lift = clamp(p.y / max(uSwell, 0.0001) * 1.7 + 0.5, 0.0, 1.0);

  vec4 world = modelMatrix * vec4(p, 1.0);

  /*
   * The cursor parts the surface. Pushed outward along the ground plane only:
   * lifting points towards the camera reads as the sea bulging at whoever is
   * looking at it, which is the wrong physical story and much louder.
   */
  vec3 away = vec3(world.x - uCursor.x, 0.0, world.z - uCursor.z);
  float d = length(away);
  float fall = smoothstep(uPartRadius, 0.0, d);
  world.xyz += normalize(away + vec3(0.0001, 0.0, 0.0001)) * fall * uPart * uActivity;

  vec4 mv = viewMatrix * world;

  vColor = mix(uColLow, uColHigh, lift);

  /*
   * Near points are brighter as well as larger. Without it the far edge of
   * the sheet is as present as the near edge and the whole thing reads as a
   * flat texture rather than as a surface going away from you.
   */
  vFade = smoothstep(0.5, 6.0, -mv.z) * (1.0 - smoothstep(70.0, 130.0, -mv.z));
  vFade *= 0.72 + 0.28 * aRipple;

  gl_PointSize = uSize * (14.0 / max(-mv.z, 0.001));
  gl_PointSize = max(gl_PointSize, 1.0);
  gl_Position = projectionMatrix * mv;
}
