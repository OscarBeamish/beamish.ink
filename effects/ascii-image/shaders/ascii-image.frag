#version 300 es
precision highp float;

/*
 * AsciiImage: a picture set in characters, each cell taking the glyph whose
 * shape fits what is in it.
 *
 * The usual renderer measures the average tone of a cell and looks up a glyph
 * ordered by how much ink it carries. The fault is always the same: a cell
 * sitting on a hard edge averages to a midtone, a midtone glyph is a texture
 * rather than a line, and every contour in the picture turns to mush.
 *
 * So each cell is measured twice. A Sobel pass over the cell's neighbourhood
 * gives the direction and strength of the edge running through it. Where that
 * edge is strong the cell takes a glyph lying along it, quantised to four
 * angles; where there is no edge it falls back to the ramp. The two measurements
 * answer different questions and only one of them is about brightness.
 */

uniform vec2  u_resolution;
uniform float u_dpr;

uniform sampler2D u_image;
uniform vec2  u_imageSize;
uniform sampler2D u_atlas;
/* How many glyphs the atlas holds, and how many of those are the tone ramp. */
uniform float u_atlasCount;
uniform float u_rampCount;

uniform vec3  u_paper;
uniform vec3  u_ink;
uniform float u_cell;
uniform float u_contrast;
uniform float u_threshold;
uniform float u_shapes;
uniform float u_progress;

out vec4 fragColor;

float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

/* The image, covering the frame rather than stretching to it. */
vec2 cover(vec2 uv, vec2 frame, vec2 image) {
  float frameAspect = frame.x / max(frame.y, 1.0);
  float imageAspect = image.x / max(image.y, 1.0);
  vec2 scale = imageAspect > frameAspect
    ? vec2(frameAspect / imageAspect, 1.0)
    : vec2(1.0, imageAspect / frameAspect);
  return (uv - 0.5) * scale + 0.5;
}

float tone(vec2 uv) {
  vec3 c = texture(u_image, clamp(uv, 0.0, 1.0)).rgb;
  // Rec. 709 luma. A straight mean of the channels makes red and blue too
  // light, and on a face that is the difference between skin and a mask.
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);

  float cell = max(u_cell, 2.0);
  vec2 cells = floor(cssRes / cell);
  vec2 id = floor(cssPx / cell);
  // Where in the cell this pixel is. The glyph is drawn into this square.
  vec2 within = fract(cssPx / cell);

  vec2 centre = (id + 0.5) * cell;
  vec2 uv = cover(centre / cssRes, cssRes, u_imageSize);
  uv.y = 1.0 - uv.y;

  /*
   * Sobel over the neighbouring cells rather than the neighbouring pixels. The
   * question is which way the edge in this cell runs, and that is a question
   * about the picture at the scale of a cell: measured at pixel scale, a strand
   * of hair fills the kernel and every cell comes back as an edge.
   */
  // Named for what it is, and not step, which is a builtin that name shadowed.
  vec2 reach = cell / cssRes;
  float tl = tone(uv + vec2(-reach.x,  reach.y));
  float tc = tone(uv + vec2(0.0,      reach.y));
  float tr = tone(uv + vec2( reach.x,  reach.y));
  float ml = tone(uv + vec2(-reach.x, 0.0));
  float mc = tone(uv);
  float mr = tone(uv + vec2( reach.x, 0.0));
  float bl = tone(uv + vec2(-reach.x, -reach.y));
  float bc = tone(uv + vec2(0.0,     -reach.y));
  float br = tone(uv + vec2( reach.x, -reach.y));

  float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  float gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
  float strength = length(vec2(gx, gy));

  float lit = clamp((mc - 0.5) * u_contrast + 0.5, 0.0, 1.0);

  /*
   * Which glyph. An edge gets a character lying along it, which is the gradient
   * turned a quarter: the gradient points across an edge, not along it, and
   * getting that backwards gives a picture whose every contour is drawn at
   * right angles to itself.
   */
  float index;
  if (u_shapes > 0.5 && strength > u_threshold) {
    float along = atan(gx, -gy);
    float quarter = floor(mod(along / 3.14159265 * 4.0 + 4.5, 4.0));
    index = u_rampCount + quarter;
  } else {
    // Darker is further along the ramp, and the ramp is written lightest first.
    float level = floor((1.0 - lit) * (u_rampCount - 0.001));
    index = clamp(level, 0.0, u_rampCount - 1.0);
  }

  /*
   * The picture comes in cell by cell, in reading order, with a little jitter so
   * the front is a ragged edge rather than a diagonal line. A teleprinter
   * arrives a character at a time and so does this.
   */
  float order = (id.y * cells.x + id.x) / max(cells.x * cells.y, 1.0);
  float jitter = (hash12(id + 3.7) - 0.5) * 0.06;
  float arrived = step(order + jitter, u_progress);

  vec2 atlasUv = vec2((index + within.x) / max(u_atlasCount, 1.0), 1.0 - within.y);
  float glyph = texture(u_atlas, atlasUv).a * arrived;

  fragColor = vec4(mix(u_paper, u_ink, glyph), 1.0);
}
