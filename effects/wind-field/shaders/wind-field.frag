#version 300 es
precision highp float;

/*
 * WindField: the wind on a weather map, combed into streaks along the flow.
 *
 * NOT A PARTICLE SYSTEM, AND THE REASON MATTERS
 *
 * Every wind map on the web advects a few thousand particles and leaves a
 * fading trail behind them. That look is right and the method cannot be used
 * here. A particle's position depends on the one before it, so the frame is a
 * function of every frame that preceded it: it cannot be seeked, which means it
 * cannot be recorded; it drifts whenever a frame is dropped; and the trail is
 * feedback, which means the first frame after a resize is wrong.
 *
 * This draws the same thing by line integral convolution instead. For every
 * pixel the shader walks a little way up the flow and a little way down it,
 * samples a fixed noise field at each step, and adds the samples up under a
 * travelling kernel. Where the walk follows a streamline the samples agree and
 * the pixel is bright; across the flow they disagree and it cancels. The streak
 * is the agreement, and nothing is stored between frames: every pixel is a
 * function of its own coordinates and t, so the whole frame is.
 *
 * The movement is the phase of the kernel rather than movement of the noise. A
 * whole number of turns over the period, so the loop closes exactly.
 *
 * THE FIELD
 *
 * A few pressure systems and a prevailing drift, which is what a real synoptic
 * chart is. Each system is a rotating vortex with a radius and a sign, and each
 * one orbits its own home once per period so the weather changes without the
 * loop ever failing to come home.
 */

uniform vec2  u_resolution;
uniform float u_dpr;
uniform float u_time;
uniform float u_period;

uniform vec3  u_ground;
uniform vec3  u_calm;
uniform vec3  u_mid;
uniform vec3  u_strong;

uniform float u_systems;
uniform float u_drift;
uniform float u_wander;
uniform float u_scale;
uniform float u_length;
uniform float u_turns;
uniform float u_contrast;
uniform float u_seed;

out vec4 fragColor;

const float TAU = 6.28318530718;

/*
 * Taps each way along the streamline, counting the pixel itself: nine each way,
 * eighteen samples, seventeen distinct points. The cost of the whole effect is
 * this number times the cost of one field evaluation, so it is the first knob
 * to reach for if this ever has to be cheaper. Below about five the streaks
 * stop being streaks and the field reads as noise.
 */
const int TAPS = 8;
/* Room for eight systems. u_systems says how many are actually walked. */
const int MAX_SYSTEMS = 8;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec2 hash22(vec2 p) {
  return vec2(hash12(p + u_seed), hash12(p + u_seed + 41.7));
}

/*
 * Value noise. This is the thing the streaks are made of: the convolution
 * smears it along the flow, so its cell size sets how coarse the combing looks
 * and nothing else in here does.
 */
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/*
 * The wind at a point, in field space, where y spans 0 to 1 and x spans the
 * aspect ratio. Working in a square-ish space rather than in uv is what keeps
 * a system circular on a wide canvas instead of stretched into an ellipse.
 */
vec2 wind(vec2 q, float aspect, float phase) {
  vec2 v = vec2(u_drift, 0.0);

  for (int i = 0; i < MAX_SYSTEMS; i++) {
    if (float(i) >= u_systems) break;
    float fi = float(i);
    vec2 rnd = hash22(vec2(fi * 3.17 + 1.0, fi * 7.91 + 2.0));

    /*
     * Where this system sits, and the small circuit it makes around that.
     * Exactly one turn over the period: a fractional number here is how a
     * looping effect ends up with a visible jump once a cycle.
     */
    vec2 home = vec2((0.12 + 0.76 * rnd.x) * aspect, 0.14 + 0.72 * rnd.y);
    float a = phase + rnd.x * TAU;
    vec2 centre = home + vec2(cos(a), sin(a)) * u_wander;

    float spin = fract(rnd.y * 7.3) < 0.5 ? -1.0 : 1.0;
    float rad = 0.15 + 0.17 * fract(rnd.x * 13.1);
    float strength = 0.65 + 0.5 * fract(rnd.y * 5.7);

    vec2 d = q - centre;
    /*
     * A gaussian skirt rather than a hard edge, so systems blend into each
     * other the way pressure does. The tangent is the perpendicular of d, which
     * is what makes it a rotation rather than a source.
     */
    float k = exp(-dot(d, d) / (2.0 * rad * rad));
    v += spin * strength * vec2(-d.y, d.x) / rad * k;
  }

  return v;
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  float height = max(cssRes.y, 1.0);
  float aspect = cssRes.x / height;

  vec2 q = vec2(cssPx.x / height, cssPx.y / height);
  float phase = TAU * u_time / max(u_period, 0.001);

  /* Step length along the streamline, in field units. stepLen rather than
     step, because `step` is a GLSL built-in and a variable of that name hides
     it for the rest of the shader. */
  float stepLen = (max(u_length, 4.0) / float(TAPS)) / height;
  float noiseScale = height / max(u_scale, 2.0);

  /*
   * The travelling kernel. Its phase is the only thing in here that moves the
   * streaks, and u_turns is how many times it goes round in a period. Whole
   * turns, so frame zero and frame last are the same frame.
   */
  float travel = TAU * u_turns * u_time / max(u_period, 0.001);

  float sum = 0.0;
  float weight = 0.0;

  /*
   * Walk both ways from the pixel. Forward and backward in the same loop, so
   * the field is evaluated twice per iteration rather than the loop running
   * twice: the same work, one set of bookkeeping.
   */
  vec2 fwd = q;
  vec2 back = q;
  float speedHere = length(wind(q, aspect, phase));

  for (int j = 0; j <= TAPS; j++) {
    float s = float(j);
    /*
     * A raised cosine down the length of the kernel, so a streak fades out at
     * both ends instead of stopping. The travel term slides that envelope along
     * the streamline, which is what makes the wind look like it is going
     * somewhere.
     */
    float w = (0.5 + 0.5 * cos(TAU * (s / float(TAPS)) * 0.5)) *
              (0.6 + 0.4 * cos(TAU * s / float(TAPS) * 1.5 - travel));

    sum += vnoise(fwd * noiseScale) * w;
    sum += vnoise(back * noiseScale) * w;
    weight += 2.0 * w;

    vec2 vf = wind(fwd, aspect, phase);
    vec2 vb = wind(back, aspect, phase);
    float lf = max(length(vf), 1e-4);
    float lb = max(length(vb), 1e-4);
    fwd += (vf / lf) * stepLen;
    back -= (vb / lb) * stepLen;
  }

  float ink = sum / max(weight, 1e-4);

  /*
   * Stretch around the mean. Raw LIC output sits in a narrow band around 0.5
   * because it is an average of a uniform field, and without this the whole
   * thing is a flat grey with a hint of structure in it.
   */
  ink = clamp(0.5 + (ink - 0.5) * (1.0 + u_contrast * 7.0), 0.0, 1.0);

  /*
   * Then thin it. Stretching alone gives a field with as much streak in it as
   * ground, which is the difference between a chart and a sheet of marbled
   * paper: on a chart you read the shape of the air, and you can only do that
   * if there is dark between the streaks for them to be shapes against.
   */
  ink = ink * ink * ink;

  /*
   * Colour by speed, the way every chart of this kind does: the ramp is the
   * legend. Two interpolations rather than one, because wind maps are read by
   * hue and a straight line between two colours gives you one hue and a tint.
   *
   * The floor and the span are measured against the field this draws rather
   * than assumed: a prevailing drift of 0.34 with four systems puts almost
   * everything between 0.15 and 1.0, and mapping the whole of 0 upwards left
   * the top of the ramp for the few pixels on a system's shoulder.
   */
  float speed = clamp((speedHere - 0.14) / 0.72, 0.0, 1.0);
  vec3 ramp = speed < 0.5
    ? mix(u_calm, u_mid, speed * 2.0)
    : mix(u_mid, u_strong, (speed - 0.5) * 2.0);

  /*
   * Fast air is drawn brighter as well as warmer. A wind map that draws still
   * air as hard as a jet reads as a texture, and it is also what buries the
   * prevailing drift: the calm corners fill in and there is nothing left for
   * the moving part to be moving against.
   */
  vec3 col = u_ground + ramp * ink * (0.18 + 0.82 * speed);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
