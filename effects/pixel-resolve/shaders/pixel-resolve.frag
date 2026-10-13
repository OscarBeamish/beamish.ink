#version 300 es
precision highp float;

/*
 * PixelResolve: a picture arriving out of big blocks, the way one used to
 * arrive over a slow connection.
 *
 * WHY IT IS NOT JUST A SHRINKING BLOCK SIZE
 *
 * Quantise the coordinate, sample once per block, step the block size down
 * over time: that is the obvious version and it has two faults you can see
 * immediately.
 *
 *   It jumps. The block size has to be a whole number of pixels or the blocks
 *   come out uneven, so stepping it gives four or five visible lurches and
 *   nothing in between. Crossfading between two block sizes is what turns the
 *   steps into an arrival.
 *
 *   It picks one pixel out of each block and calls it the block. That is a
 *   point sample, not an average, so thin bright things vanish entirely at
 *   large block sizes and then pop back. Averaging over the block is what
 *   keeps a picture legible when it is eight pixels across, and it is the
 *   whole reason a mipmap exists.
 *
 * THE BLOCKS DO NOT ALL ARRIVE AT ONCE
 *
 * A picture that sharpens uniformly reads as a lens being focused. One that
 * resolves in patches reads as data landing. Each block has its own moment,
 * from a hash of the block rather than from its position, so the order is
 * scattered rather than sweeping.
 *
 * Pure in `t`. The block a pixel belongs to, the moment it resolves and the
 * average inside it are all functions of the frame being asked for.
 */

uniform vec2      u_resolution;
uniform float     u_dpr;
uniform float     u_time;
uniform sampler2D u_image;
uniform vec2      u_imageSize;

uniform float u_coarse;
uniform float u_steps;
uniform float u_duration;
uniform float u_hold;
uniform float u_scatter;
uniform float u_taps;
uniform float u_levels;
uniform vec3  u_ink;

out vec4 fragColor;

/* The picture covering the frame rather than stretching to it. */
vec2 cover(vec2 uv, vec2 frame, vec2 image) {
  float frameAspect = frame.x / max(frame.y, 1.0);
  float imageAspect = image.x / max(image.y, 1.0);
  vec2 scale = imageAspect > frameAspect
    ? vec2(frameAspect / imageAspect, 1.0)
    : vec2(1.0, imageAspect / frameAspect);
  return (uv - 0.5) * scale + 0.5;
}

/* A texture from an <img> arrives with its first row at the top; everything
   here is in gl_FragCoord's frame, where y counts up. */
vec3 pick(vec2 uv) {
  return texture(u_image, clamp(vec2(uv.x, 1.0 - uv.y), 0.0, 1.0)).rgb;
}

float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

/*
 * The average colour of one block, taken as a grid of samples across it.
 *
 * Not the centre pixel. A point sample loses anything thinner than a block, so
 * a sign or a cable disappears at sixteen pixels and reappears at eight, which
 * reads as the picture flickering rather than resolving. The average is what a
 * mipmap would give and it is what keeps the subject readable when the blocks
 * are enormous.
 */
vec3 blockAverage(vec2 block, float size, vec2 cssRes, float taps) {
  vec3 total = vec3(0.0);
  float n = 0.0;
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      if (float(x) >= taps || float(y) >= taps) continue;
      vec2 at = (block + (vec2(float(x), float(y)) + 0.5) / taps) * size;
      vec2 uv = cover(at / cssRes, cssRes, u_imageSize);
      total += pick(uv);
      n += 1.0;
    }
  }
  return total / max(n, 1.0);
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  /*
   * How far through the arrival, before any per-block scatter. One shot: it
   * resolves and then it stays resolved.
   */
  float run = clamp((u_time - u_hold) / max(u_duration, 0.001), 0.0, 1.0);

  /*
   * The ladder of block sizes, each a whole number of pixels and each half the
   * one before. `where` is a position on that ladder rather than a size, so
   * the crossfade below is between two rungs.
   */
  float rungs = max(u_steps, 1.0);
  float where = (1.0 - run) * rungs;

  float lower = floor(where);
  float blend = where - lower;

  /* Two block sizes to cross between, both whole pixels. */
  float sizeA = max(floor(u_coarse / pow(2.0, rungs - lower)), 1.0);
  float sizeB = max(floor(u_coarse / pow(2.0, rungs - lower - 1.0)), 1.0);

  float taps = clamp(floor(u_taps), 1.0, 4.0);

  vec2 blockA = floor(cssPx / sizeA);
  vec2 blockB = floor(cssPx / sizeB);

  /*
   * Each block gets its own moment, hashed from the block rather than taken
   * from its position, so the picture lands in patches instead of sweeping.
   * A picture that sharpens evenly reads as a lens being focused; one that
   * arrives in patches reads as data.
   */
  float jitterA = (hash12(blockA + 11.7) - 0.5) * u_scatter;
  float jitterB = (hash12(blockB + 11.7) - 0.5) * u_scatter;
  float mixAB = clamp(blend + jitterA * 0.5 + jitterB * 0.5, 0.0, 1.0);

  vec3 colour = mix(
    blockAverage(blockA, sizeA, cssRes, taps),
    blockAverage(blockB, sizeB, cssRes, taps),
    mixAB
  );

  /*
   * Fewer colours while the blocks are big, all of them by the end. A picture
   * arriving over a slow line lost its palette as well as its resolution, and
   * without this the big blocks are a smooth gradient, which no slow format
   * ever produced.
   */
  float levels = mix(u_levels, 255.0, run);
  if (levels < 254.0) {
    colour = floor(colour * levels + 0.5) / levels;
  }

  /*
   * What is not here yet. Blocks whose moment has not come are flat, so the
   * frame starts as a field of them and fills in.
   */
  float arrived = step(hash12(blockA + 3.1), run * (1.0 + u_scatter));
  colour = mix(u_ink, colour, clamp(arrived + run * run, 0.0, 1.0));

  fragColor = vec4(colour, 1.0);
}
