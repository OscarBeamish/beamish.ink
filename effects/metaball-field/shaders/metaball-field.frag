#version 300 es
precision highp float;

/*
 * MetaballField: a distance function, walked.
 *
 * The scene is not geometry. It is map(), which answers "how far is the
 * nearest surface from here", and the image is made by stepping a ray forward
 * by exactly that much, over and over. The step is always safe because the
 * answer is a distance to the nearest thing in any direction, so the ray can
 * never pass through a surface it has not noticed.
 *
 * Two distance fields merge by taking the smaller of the two, which is the
 * whole reason blobs are done this way. smin() softens that minimum over a
 * band, and the fillet it leaves is what makes the pair read as liquid instead
 * of as two spheres parked in the same place.
 *
 * Two things here are about cost rather than looks, because a raymarcher pays
 * per pixel for every step and every blob.
 *
 * The ray is advanced straight to a bounding sphere around the whole swarm
 * before any marching starts, and a ray that misses the bounding sphere is
 * abandoned on the spot. Without that, every pixel of empty background runs
 * the full loop to find nothing, which on a backdrop is most of the frame.
 *
 * And the loop breaks on a hit rather than running to the step count. Sphere
 * tracing converges fast once it is close, so a typical hit is a dozen steps
 * even where the ceiling is fifty.
 */

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_period;

uniform vec3  u_background;
uniform vec3  u_body;
uniform vec3  u_light;
uniform float u_count;
uniform float u_radius;
uniform float u_blend;
uniform float u_orbit;
uniform float u_detail;
uniform float u_shine;
uniform float u_seed;

out vec4 fragColor;

const float TAU = 6.28318530718;
const int MAX_BLOBS = 9;
const int MAX_STEPS = 96;

/*
 * Polynomial smooth minimum. Blends two fields over a band of width k and
 * costs one mix and one clamp, which is why it is this one rather than the
 * exponential version: inside a loop that runs per step per pixel, an exp() is
 * not free and nothing here can tell the difference.
 */
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / max(k, 1e-4), 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

/*
 * Where blob i is at time t.
 *
 * Two circles at right angles with whole numbers of turns in a period, so the
 * path is closed and the blob is exactly where it started when the loop comes
 * round. Whole turns are not a nicety: a fractional multiplier here is a jump
 * once a cycle in the recorded video, and it has shipped twice in this
 * library.
 */
vec3 blobAt(int i, float t) {
  float fi = float(i);
  float phase = TAU * t / u_period;

  /* Golden angle, so the blobs do not set off in a rosette. */
  float a = fi * 2.39996323 + u_seed * 0.9;

  /* Small whole turn counts, different per axis, so the paths are not circles
     traced in lockstep but something closer to a slow tumble. */
  float na = 1.0 + mod(fi, 3.0);
  float nb = 2.0 + mod(fi * 2.0 + 1.0, 3.0);

  return u_orbit * vec3(
    cos(na * phase + a),
    sin(nb * phase + a * 1.7),
    0.6 * sin(na * phase + a * 2.3)
  );
}

float map(vec3 p) {
  int count = int(clamp(u_count, 1.0, float(MAX_BLOBS)));
  float d = length(p - blobAt(0, u_time)) - u_radius;

  for (int i = 1; i < MAX_BLOBS; i++) {
    if (i >= count) break;
    float di = length(p - blobAt(i, u_time)) - u_radius;
    d = smin(d, di, u_blend);
  }
  return d;
}

/*
 * The normal, by the tetrahedron trick: four samples rather than the six a
 * central difference on three axes would take. On a surface this smooth the
 * difference is invisible and it is a third off the most expensive thing in
 * the shader after the march itself.
 */
vec3 normalAt(vec3 p) {
  vec2 e = vec2(1.0, -1.0) * 0.0015;
  return normalize(
    e.xyy * map(p + e.xyy) +
    e.yyx * map(p + e.yyx) +
    e.yxy * map(p + e.yxy) +
    e.xxx * map(p + e.xxx)
  );
}

void main() {
  /*
   * Normalised on the short side, so the swarm is the same size in portrait
   * and landscape rather than being cropped by whichever way the panel runs.
   */
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

  /*
   * Far enough back that the whole swarm fits the short side with room around
   * it. The first version sat at 3.1 with a long lens and the blobs were
   * cropped by every edge, which reads as a close-up of something rather than
   * as a field of things.
   */
  vec3 ro = vec3(0.0, 0.0, 4.4);
  vec3 rd = normalize(vec3(uv, -1.0));

  /*
   * Skip to the bounding sphere. The swarm reaches orbit + radius from the
   * origin, plus the blend band, and everything outside that is empty. A ray
   * that misses it is finished here, which on a backdrop is most of the frame.
   */
  float bound = u_orbit + u_radius + u_blend;
  float b = dot(ro, rd);
  float c = dot(ro, ro) - bound * bound;
  float disc = b * b - c;

  vec3 col = u_background;

  if (disc > 0.0) {
    float entry = max(-b - sqrt(disc), 0.0);
    float exitAt = -b + sqrt(disc);

    float travelled = entry;
    bool hit = false;
    int steps = int(clamp(u_detail, 8.0, float(MAX_STEPS)));

    for (int i = 0; i < MAX_STEPS; i++) {
      if (i >= steps) break;
      vec3 p = ro + rd * travelled;
      float d = map(p);

      /*
       * The hit threshold grows with distance, because a pixel does.
       *
       * A ray is a cone, not a line: the patch of the world one pixel covers
       * gets wider the further along it you look, and a surface closer than
       * that patch is a surface the pixel has already hit. A constant epsilon
       * ignores this, and the rays it fails are the ones that graze a
       * silhouette, where the field flattens out and the march crawls towards
       * a surface it never formally reaches before running out of steps. What
       * that draws is a thin dark splinter along the edge of a lobe, which
       * looked like a crack in the blob and was actually the march giving up.
       *
       * More steps shrinks it and never removes it: at twice the step count
       * it was still there, smaller. Scaling the threshold takes it down to a
       * hairline at a quarter of the cost, which is the trade taken here.
       */
      if (d < 0.0016 * travelled) {
        hit = true;
        break;
      }
      /*
       * Stepped short of what the field says is safe, because the field lies.
       *
       * Sphere tracing is only sound when the function returns a true lower
       * bound on the distance to the surface, and a smooth minimum does not:
       * it rounds the join outwards, so near a fillet the value overestimates
       * how far there is to go. A ray that takes it at face value steps
       * straight through the surface and out the other side, and what that
       * looks like is a thin dark crack across an otherwise solid blob, which
       * is exactly what the first version drew along every neck.
       *
       * Eight tenths is enough here. It is the cheapest fix available: the
       * alternative is dividing by the Lipschitz bound of the blend, which for
       * this smin is not a constant.
       */
      travelled += d * 0.75;
      if (travelled > exitAt) break;
    }

    if (hit) {
      vec3 p = ro + rd * travelled;
      vec3 n = normalAt(p);
      vec3 view = -rd;

      /*
       * One key light, a rim and a fresnel, which is as much as a blob needs.
       * The rim is what separates two blobs that are touching: without it the
       * neck between them is the same tone on both sides and the pair reads as
       * one lump rather than as two things merging.
       */
      vec3 key = normalize(vec3(0.55, 0.85, 0.6));
      float diffuse = clamp(dot(n, key) * 0.5 + 0.5, 0.0, 1.0);
      float fresnel = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 3.0);
      float spec = pow(clamp(dot(reflect(-key, n), view), 0.0, 1.0), 42.0);

      col = mix(u_background, u_body, 0.25 + 0.75 * diffuse);
      col += u_light * (fresnel * 0.5 + spec * u_shine);
    }
  }

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
