#version 300 es
precision highp float;

/*
 * PointerTrail: marks pressed into the paper, soaking in and fading.
 *
 * Not a comet and not a glow. A nib touching down repeatedly leaves a row of
 * blots, and each one does two things as it sits: it spreads a little as the
 * paper draws the ink sideways along the fibres, and it lightens as it sinks in.
 * So an older mark here is wider and paler than a new one, which is the opposite
 * of a particle trail, where older means smaller.
 *
 * The marks multiply rather than compositing. Two blots that overlap are darker
 * than either, which is the behaviour that makes a trail of ink look wet rather
 * than look like a gradient.
 */

#define MARKS 28

uniform vec2  u_resolution;
uniform float u_dpr;
uniform vec2  u_marks[MARKS];
uniform float u_count;
uniform float u_active;

uniform vec3  u_paper;
uniform vec3  u_ink;
uniform vec3  u_accent;
uniform float u_size;
uniform float u_spread;
uniform float u_fade;
uniform float u_edge;
uniform float u_grain;

out vec4 fragColor;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  float shortSide = min(cssRes.x, cssRes.y);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  int count = int(clamp(u_count, 0.0, float(MARKS)));
  float ink = 0.0;
  float freshest = 0.0;

  for (int i = 0; i < MARKS; i++) {
    if (i >= count) break;

    /*
     * Age runs 0 for the newest mark to 1 for the oldest. Index order is age
     * order, because the trail is written newest first, which saves carrying a
     * timestamp per mark.
     */
    float age = float(i) / max(float(count - 1), 1.0);

    vec2 markPx = vec2(u_marks[i].x, 1.0 - u_marks[i].y) * cssRes;
    float d = length(cssPx - markPx) / shortSide;

    // Spreading outward and sinking in. A mark that has been there longer is
    // wider and weaker, which is what ink does and what a particle does not.
    float radius = u_size * (1.0 + age * u_spread);
    float strength = pow(1.0 - age, max(u_fade, 0.01));

    /*
     * A soft shoulder rather than a hard disc. Ink on a fibrous surface has no
     * edge to speak of, and `edge` sets how much of the blot is that shoulder.
     */
    float blot = 1.0 - smoothstep(radius * (1.0 - u_edge), radius, d);
    float mark = blot * strength;

    // Multiplied, not added: two blots crossing are darker than either, which
    // is what makes a wet trail read as wet.
    ink = 1.0 - (1.0 - ink) * (1.0 - mark);
    freshest = max(freshest, mark * (1.0 - age));
  }

  ink *= u_active;

  // The freshest ink has not had time to sink, so it carries the accent and the
  // rest of the trail settles back to the body colour.
  vec3 colour = mix(u_ink, u_accent, smoothstep(0.25, 0.8, freshest));
  vec3 col = mix(u_paper, colour, clamp(ink, 0.0, 1.0));

  float tooth = hash12(floor(cssPx * 0.5) + 19.0) - 0.5;
  col += tooth * 0.05 * u_grain;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
