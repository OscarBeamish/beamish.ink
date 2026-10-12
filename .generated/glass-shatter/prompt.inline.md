You are adding **GlassShatter** from Beamish to this project.

> A plate of glass broken over a picture, cracked along the stress rather than into a honeycomb. Surfaces · effect · MIT.
> https://beamish.ink/effects/glass-shatter

Beamish is not a package and there is nothing to install from npm. The source
lives in a public repo; you fetch the files, put them in this project, and wire
them in. Adapt them to whatever this project already uses. That is the point of
shipping it this way.

Assume you have not seen this library before. Everything you need is below.

## What it needs

- **npm dependencies:** None. This file has no npm dependencies at all.
- WebGL2. There is no WebGL1 fallback
- Every shattered-glass effect scatters random sites across the plane and gives each pixel to the nearest one. It produces a honeycomb, and a honeycomb is a dry mud flat rather than a broken window
- A plate struck at a point breaks along the stress, and the stress is radial and circumferential: cracks run out from the impact and other cracks run round it, crossing the first set. The pieces come out roughly four-sided, small near the impact and growing with distance, because the radial cracks fan apart as they travel
- So the lattice is polar rather than square. Sites live in cells of angle by radius, the borders fall along radii and around arcs, and the whole character of real glass comes out of the coordinate system rather than out of any extra work
- The radius goes under a square root. A plain radius gives rings of even spacing, and concentric cracks get further apart as they travel; the root also crowds the inner rings together, which is the zone of fine fragments around the impact that any photograph of a broken window has
- The sector index is taken modulo the sector count when it is hashed, so the cell on one side of angle zero is the same cell as the one on the other side. Without that there is a seam running out from the impact that no amount of jitter hides. The position uses the unwrapped index, so the distance stays continuous across the join
- A site is jittered inside its own cell and capped there, which is the assumption the three by three search rests on. Let a site cross into its neighbour and the nearest site can be two cells away, and the plate tears along the lattice instead of along the cracks
- The second nearest site is where the cracks come from. Halfway between two sites the two distances are equal, so their difference falls to zero, and that difference is a distance to the edge for free
- Not every crack is the same crack. In a struck plate the radial cracks go first and go deepest, because the plate is in tension around the impact; the circumferential ones are secondary, forming between radials that have already gone, and they are shorter and shallower. Drawn at equal weight you get a spider web, which is a thing built outward from a centre rather than a thing broken from one. Which kind a border is can be read straight off its own normal: a radial crack runs along the radius, so its normal points round, and a circumferential one is the other way about
- The picture is sampled a little inside its own edge, because the bend and the drift push the lookup outward and a clamped texture asked past its edge hands back the edge column over and over. At the left and right of the frame that came out as horizontal smears of colour, which reads as a fault in the effect rather than as glass
- And not every circumferential crack forms at all. Weighting them down was not enough: a Voronoi diagram partitions the plane, so every cell is ringed by borders and the arcs close into polygons, which is exactly a spider web's architecture and still read as one at a quarter of the weight. Each border is therefore hashed and the circumferential ones only exist if their number comes up. The key is the pair of cells either side of it, taken with a componentwise min and max so both sides agree and a crack does not appear from one shard and not from its neighbour
- What turns a dark line into a crack is the bright line beside it. A broken edge is a fresh face of glass and it catches the light, so a crack in a photograph is a dark line with a glint along it. That one term is the biggest single difference between this and a drawn grid
- The crack width is in screen pixels, got by dividing the border distance by its own gradient. One lattice unit is a few pixels at the impact and a hundred at the edge of the frame, so a width in lattice units comes out as cracks of wildly uneven thickness. Scaling by fwidth was the first attempt and it is the same mistake in a different hat, because fwidth measures how fast the quantity changes rather than how far away the border is: it gave lines eight pixels thick with a white halo, and the thing came out as a spider web
- The picture bends across the crack and the channels come apart as it bends, which is what a wedge of glass does to light passing through it. The bend follows the gradient of the border distance, which points across the crack rather than along it
- The shard drift slides the picture inside the shard rather than moving the shard, so it is kept small. Past a fraction of a cell it stops reading as a piece that has shifted and starts reading as the wrong piece of the photograph
- The <img> stays in the document, hidden. Its alt text is the accessible version of the picture and a page whose script never runs still shows the photograph
- A DOM element with a real size. The canvas fills its host, so a host with no height renders nothing.

Pinned to `{{PIN}}`. These URLs do not move; a future refactor gets a new tag.

## 1. Create these files

The full source is inlined below because you may not be able to fetch URLs.
Create each file at the path given, verbatim. Adjust the paths to match this
project's conventions, but keep them in the same relative arrangement. The
import between them is relative.

**`src/beamish/effects/glass-shatter/core.ts`**

```ts
/*
 * GlassShatter: Beamish
 * https://beamish.ink/effects/glass-shatter
 *
 * A plate of glass broken over a picture, still in its frame.
 *
 * Every shattered-glass effect scatters random sites across the plane and
 * gives each pixel to the nearest one. It produces a honeycomb, and a
 * honeycomb is a dry mud flat rather than a broken window.
 *
 * A plate struck at a point breaks along the stress, and the stress is radial
 * and circumferential: cracks run out from the impact and other cracks run
 * round it, crossing the first set. The pieces come out roughly four-sided,
 * small near the impact and growing with distance, because the radial cracks
 * fan apart as they travel.
 *
 * So the lattice is polar rather than square. Sites live in cells of angle by
 * radius, the borders between them fall along radii and around arcs, and the
 * character of real glass comes out of the coordinate system rather than out
 * of any extra work. The radius goes under a square root, because concentric
 * cracks get further apart as they travel and crowd together at the impact,
 * which is the zone of fine fragments every photograph of a broken window
 * has.
 *
 * What turns a dark line into a crack is the bright line beside it. A broken
 * edge is a fresh face of glass and it catches the light, so a crack in a
 * photograph is always a dark line with a glint along it. That one term is the
 * biggest single difference between this and a drawn grid; `glint: 0` is worth
 * setting once to see it.
 *
 * The picture bends and its channels come apart at the crack, which is what a
 * wedge of glass does to light passing through it, and whole shards sit a
 * shade off their neighbours from being tilted a degree out of the plane.
 *
 * ONE SHOT
 *
 * Intact, then it goes, then it stays gone. `t` past the end is the end, and
 * nothing is stored between frames, so the recorder can seek.
 *
 * The picture comes from the first <img> in the host, which is left in the
 * document and only hidden, so the alt text and the loading behaviour stay
 * whatever was written and a page whose script never runs still shows it.
 */

import { mount, type BaseOptions, type EffectHandle, type Surface } from '../../shared/runtime'

export type GlassShatterOptions = BaseOptions & {
  /** Radial cracks running out from the impact. */
  sectors: number
  /** Concentric cracks running round it. */
  rings: number
  /** How far a site may sit from the middle of its own cell, 0 to 1. */
  jitter: number
  /** Where the plate was struck, 0 to 1 across the element. */
  impactX: number
  /** Where the plate was struck, 0 to 1 down the element. */
  impactY: number
  /** Width of the dark line, in pixels of the crack's own gradient. */
  crack: number
  /** How brightly the fresh edge beside the crack catches the light. */
  glint: number
  /** How far each shard shifts. */
  gap: number
  /** How much the picture bends at a crack. */
  refract: number
  /** How far the channels come apart as it bends. */
  fringe: number
  /** How far a shard may sit out of the plane of the plate. */
  facet: number
  /** How far the damage carries from the impact, in short edges. */
  reach: number
  /** What share of the circumferential cracks actually form, 0 to 1. */
  arcs: number
  /** Seconds before the plate is struck. */
  impactAt: number
  /** Seconds for the break to open. */
  spread: number
  /** The colour of the light on a fresh edge. */
  tint: string
  /** Seed for the shards. The same seed gives the same break. */
  seed: number
}

export const glassShatterDefaults: GlassShatterOptions = {
  sectors: 29,
  rings: 9,
  jitter: 0.7,
  impactX: 0.42,
  impactY: 0.56,
  crack: 1.3,
  glint: 0.5,
  gap: 1,
  refract: 0.6,
  fringe: 0.6,
  facet: 0.16,
  reach: 0.62,
  arcs: 0.3,
  impactAt: 0.5,
  spread: 0.75,
  /* Slightly cool, because a fresh break in glass is a green-blue edge. */
  tint: '#dbe9ff',
  seed: 7,
  maxDpr: 2,
  reducedMotionTime: 4
}

// beamish:shader-begin shaders/glass-shatter.vert
const VERT = `#version 300 es

// Full-screen triangle from gl_VertexID. No buffers, no attributes. Bind an
// empty VAO and drawArrays(TRIANGLES, 0, 3).

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`
// beamish:shader-end

// beamish:shader-begin shaders/glass-shatter.frag
const FRAG = `#version 300 es
precision highp float;

/*
 * GlassShatter: a plate of glass broken over a picture, still in its frame.
 *
 * GLASS DOES NOT BREAK INTO A VORONOI DIAGRAM
 *
 * Every shattered-glass effect scatters random sites across the plane and
 * gives each pixel to the nearest one. It produces a honeycomb, and a
 * honeycomb is what a dry mud flat looks like, not what a broken window looks
 * like.
 *
 * A plate struck at a point breaks along the stress, and the stress is radial
 * and circumferential. You get cracks running out from the impact, and cracks
 * running round it, crossing the first set. The pieces are therefore roughly
 * four-sided, they are small near the impact and they grow with distance,
 * because the radial cracks fan apart as they travel.
 *
 * All of which is a polar lattice rather than a square one. Sites live in
 * cells of angle by radius, so the borders between them fall along radii and
 * around arcs, and the whole character of real glass comes out of the
 * coordinate system rather than out of any extra work.
 *
 * Two details in that are load-bearing:
 *
 *   THE RADIUS IS UNDER A SQUARE ROOT. A plain radius gives rings of even
 *   spacing, and concentric cracks in glass get further apart as they go out.
 *   The root also pulls the inner rings together, which is the zone of fine
 *   fragments around the impact that any photograph of a broken window has.
 *
 *   THE ANGULAR CELL WRAPS. The sector index is taken modulo the sector count
 *   when it is hashed, so the cell at one side of angle zero is the same cell
 *   as the one on the other side. Without it there is a seam running out from
 *   the impact that no amount of jitter hides.
 *
 * WHERE THE CRACKS COME FROM
 *
 * The distance to the nearest site says how far you are from a site, which is
 * no use. The second nearest gives the border away: halfway between two sites
 * the two distances are equal, so their difference falls to zero, and that
 * difference is a distance to the edge for free.
 *
 * WHAT MAKES IT READ AS GLASS RATHER THAN AS A DRAWN GRID
 *
 * A dark line is a drawing of a crack. Three things turn it into one:
 *
 *   The light line beside the dark one. A broken edge is a fresh face of glass
 *   and it catches the light, so a crack in a photograph is a dark line with a
 *   bright one along it. This is the single biggest difference.
 *
 *   The picture bends at the crack and the channels come apart as it does,
 *   because that is what a wedge of glass does to light passing through it.
 *
 *   Whole shards sit a shade lighter or darker than their neighbours, from
 *   being tilted a degree or two out of the plane of the plate.
 *
 * Pure in \`t\`. Nothing here depends on the frame before it.
 */

uniform vec2      u_resolution;
uniform float     u_dpr;
uniform float     u_time;
uniform sampler2D u_image;
uniform vec2      u_imageSize;

uniform float u_sectors;
uniform float u_rings;
uniform float u_jitter;
uniform vec2  u_impact;
uniform float u_crack;
uniform float u_glint;
uniform float u_gap;
uniform float u_refract;
uniform float u_fringe;
uniform float u_facet;
uniform float u_reach;
uniform float u_arcs;
uniform float u_impactAt;
uniform float u_spread;
uniform float u_seed;
uniform vec3  u_tint;

out vec4 fragColor;

const float TAU = 6.283185307179586;

vec2 hash22(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

/* The picture covering the frame rather than stretching to it. */
vec2 cover(vec2 uv, vec2 frame, vec2 image) {
  float frameAspect = frame.x / max(frame.y, 1.0);
  float imageAspect = image.x / max(image.y, 1.0);
  vec2 scale = imageAspect > frameAspect
    ? vec2(frameAspect / imageAspect, 1.0)
    : vec2(1.0, imageAspect / frameAspect);
  return (uv - 0.5) * scale + 0.5;
}

/* The flip is here rather than on the upload: a texture from an <img> arrives
   with its first row at the top, and this shader works in gl_FragCoord's
   frame, where y counts up from the bottom. */
vec3 pick(vec2 uv) {
  return texture(u_image, clamp(vec2(uv.x, 1.0 - uv.y), 0.0, 1.0)).rgb;
}

/* Quick out, so the plate is broken rather than still breaking. */
float easeOut(float k) {
  float n = 1.0 - clamp(k, 0.0, 1.0);
  return 1.0 - n * n * n;
}

void main() {
  vec2 cssRes = u_resolution / max(u_dpr, 0.001);
  vec2 cssPx = gl_FragCoord.xy / max(u_dpr, 0.001);
  vec2 screen = cssPx / cssRes;
  float shortEdge = max(min(cssRes.x, cssRes.y), 1.0);

  /*
   * How far through the break. One shot: intact, then it goes, then it stays
   * gone. Nothing here is periodic, so \`t\` past the end is simply the end.
   */
  float open = easeOut((u_time - u_impactAt) / max(u_spread, 0.001));

  /*
   * Measured against the short edge rather than in screen fractions, so a
   * shard is the same size and shape whatever the aspect of the element.
   */
  vec2 fromImpact = (cssPx - u_impact * cssRes) / shortEdge;
  float r = length(fromImpact);
  float angle = atan(fromImpact.y, fromImpact.x);

  float sectors = max(3.0, floor(u_sectors));
  /*
   * Under a root, so the rings get further apart going out and crowd together
   * at the impact. A small floor on the radius stops the innermost ring
   * collapsing to a point, where every sector would meet in one pixel and the
   * cracks would come out as a star.
   */
  float ringAt = sqrt(max(r, 0.004)) * max(u_rings, 1.0);
  float sectorAt = (angle / TAU + 0.5) * sectors;

  vec2 lattice = vec2(sectorAt, ringAt);
  vec2 home = floor(lattice);

  float first = 8.0;
  float second = 8.0;
  vec2 winner = vec2(0.0);
  vec2 runner = vec2(0.0);

  /*
   * POLAR FOR THE ARRANGEMENT, CARTESIAN FOR THE METRIC
   *
   * This is the line the whole item turns on, and the first three versions got
   * it wrong in the same way.
   *
   * Measuring the distance in lattice units is the obvious thing and it gives
   * curved borders, because a straight line in polar coordinates is an arc on
   * the screen. Curved arcs between evenly spaced spokes are not broken glass:
   * they are an orb web, which is a thing a spider builds by laying radials
   * and then spiralling between them. No amount of weighting the arcs down or
   * thinning them out fixes that, because the shape is the problem.
   *
   * A crack in glass is straight. It propagates in a straight line and changes
   * direction abruptly, and a Voronoi border measured in cartesian distance is
   * a straight line too: it is the perpendicular bisector of two sites. So the
   * sites keep their polar arrangement, which is what gives glass its shard
   * layout, small at the impact and growing outward, and the distance between
   * a pixel and a site is measured on the screen, which is what makes every
   * crack straight.
   */
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cell = home + vec2(float(i), float(j));

      /*
       * Hashed on the wrapped sector so the lattice closes on itself at angle
       * zero. Without it there is a seam running out from the impact that no
       * amount of jitter hides.
       */
      vec2 id = vec2(mod(cell.x + sectors * 4.0, sectors), cell.y);
      vec2 rnd = hash22(id + u_seed);

      /* Jittered inside its own cell and never out of it, which is the
         assumption the nine-cell search rests on. */
      vec2 at = cell + 0.5 + (rnd - 0.5) * min(u_jitter, 0.96);

      /* Back out of the lattice and onto the screen. The ring coordinate was
         the root of the radius, so the radius is its square. */
      float siteR = (at.y / max(u_rings, 1.0));
      siteR *= siteR;
      float siteA = (at.x / sectors - 0.5) * TAU;
      vec2 site = vec2(cos(siteA), sin(siteA)) * siteR;

      float d = length(site - fromImpact);
      if (d < first) {
        second = first;
        runner = winner;
        first = d;
        winner = id;
      } else if (d < second) {
        second = d;
        runner = id;
      }
    }
  }

  /*
   * Distance to the border, converted into screen pixels by dividing by its
   * own gradient. This is the step that decides whether the thing looks like
   * broken glass or like a spider web, and the first version got it wrong.
   *
   * The raw difference is in lattice units, and one lattice unit is a wildly
   * different number of pixels depending on where you are: a sector is a few
   * pixels wide at the impact and a hundred at the edge of the frame. Scaling
   * by fwidth was the first attempt and it is the same mistake wearing a
   * different hat, because fwidth measures how fast the quantity changes
   * rather than how far away the border is. Dividing the distance by the
   * steepness of the field is the standard way to normalise a distance
   * function, and it gives a number in pixels that means the same thing
   * everywhere in the frame.
   */
  float gap = second - first;
  vec2 acrossCrack = vec2(dFdx(gap), dFdy(gap));
  float slope = max(length(acrossCrack), 1e-6);
  float gapPx = gap / slope;

  /*
   * Which way the border runs, from the same derivatives. The picture is bent
   * along this, which is across the crack rather than along it: a wedge of
   * glass deflects light towards its thin end.
   */
  vec2 normal = acrossCrack / slope;

  vec2 outward = r > 1e-5 ? fromImpact / r : vec2(0.0);

  /*
   * Not every crack is the same crack, and treating them alike is what makes
   * every version of this look like a spider web.
   *
   * In a struck plate the radial cracks go first and go deepest: the plate is
   * in tension around the impact, so it opens along lines running outward. The
   * circumferential ones are secondary, they form between radials that have
   * already gone, and they are shorter and shallower. Drawn at equal weight
   * you get a web, which is a thing built outward from a centre by something
   * with eight legs rather than a thing broken from a centre by something
   * hard.
   *
   * Which kind a border is can be read off its own normal. A radial crack runs
   * along the radius, so its normal points round; a circumferential one runs
   * round, so its normal points out.
   */
  float radial = 1.0 - abs(dot(normal, outward));

  /*
   * How far the damage carries. A strike does not break the whole pane: there
   * is a region of cracks around the impact and intact glass past it. Without
   * this the frame is webbed edge to edge at an even density, which is the
   * other half of why the honeycomb version never convinces.
   */
  float withinReach = 1.0 - smoothstep(max(u_reach, 0.01) * 0.5, max(u_reach, 0.01), r);

  /*
   * And not every circumferential crack forms at all.
   *
   * Weighting them down was not enough. A Voronoi diagram partitions the
   * plane, so every cell is ringed by borders and the arcs close into
   * polygons: with a radial crack between each pair of neighbours and an arc
   * joining them, the architecture is exactly a spider web, and it still read
   * as one at a quarter of the weight. A break is not a partition of the
   * plane. It is a set of curves with ends.
   *
   * So each border is hashed and the circumferential ones only exist if their
   * own number comes up. The key is the pair of cells either side of it, taken
   * with a componentwise min and max so both sides of the border agree on it
   * and the crack does not appear from one shard and not from its neighbour.
   *
   * Because \`radial\` varies along a border, a gated arc also fades out where
   * it turns radial, which is a crack that stops partway. Glass does that; a
   * web does not.
   */
  vec2 lo = min(winner, runner);
  vec2 hi = max(winner, runner);
  float border = hash12(lo * 7.13 + hi * 3.37 + u_seed);
  float circumferential = smoothstep(0.5, 0.88, 1.0 - radial);
  float gate = mix(1.0, step(border, clamp(u_arcs, 0.0, 1.0)), circumferential);

  float strength = withinReach * gate * mix(0.5, 1.0, radial);

  /* Per shard, fixed for the life of it. */
  vec2 shard = hash22(winner * 1.37 + u_seed + 11.0);
  float shardTilt = hash12(winner * 2.11 + u_seed) - 0.5;

  /*
   * Where the shard has gone. Outward from the impact, because that is the
   * direction the plate is being pushed, plus a little of its own. Kept small:
   * this slides the picture inside the shard rather than moving the shard, so
   * past a fraction of a cell it stops reading as a piece that has shifted and
   * starts reading as the wrong piece of the photograph.
   */
  vec2 drift = (outward * 0.7 + (shard - 0.5) * 0.9) * u_gap * open * 0.02 * withinReach;

  /*
   * The picture, bent across the crack and split as it bends. The bend is
   * strongest at the crack and dies away into the middle of the shard, which
   * is where a wedge is thickest and where it is flat.
   */
  float nearCrack = (1.0 - smoothstep(0.0, 16.0, gapPx)) * strength;
  vec2 bend = normal * u_refract * nearCrack * 0.012 * (0.35 + 0.65 * open);
  /*
   * The picture is sampled a little inside its own edge. The bend and the
   * drift push the lookup outward, and a clamped texture asked for a sample
   * past its edge hands back the edge column over and over: at the left and
   * right of the frame that came out as horizontal smears of colour, which
   * looks like a fault in the effect rather than like glass.
   */
  vec2 uvBase = (cover(screen, cssRes, u_imageSize) - 0.5) * 0.97 + 0.5 + drift;
  vec2 split = normal * u_fringe * nearCrack * 0.004 * (0.35 + 0.65 * open);

  vec3 picture = vec3(
    pick(uvBase + bend + split).r,
    pick(uvBase + bend).g,
    pick(uvBase + bend - split).b
  );

  /*
   * Whole shards a shade off their neighbours, from sitting a degree or two
   * out of the plane. This is the term that makes the plate read as something
   * with thickness rather than as a pattern printed on the picture.
   */
  picture *= 1.0 + shardTilt * u_facet * open * withinReach;

  /*
   * The crack itself. A dark line, and a bright one just inside it, because a
   * broken edge is a fresh face of glass and it catches the light. The dark
   * line alone is a drawing of a crack; the pair of them is a crack.
   *
   * Both widen as the plate opens, since a crack that is already its final
   * width before anything has moved reads as a decal.
   */
  float width = max(u_crack, 0.0) * (0.35 + 0.65 * open);
  float dark = 1.0 - smoothstep(width * 0.4, width + 0.75, gapPx);

  /*
   * The glint sits just outside the dark line and is narrower than it.
   *
   * It was the other way round first, a band three times the width of the
   * crack, and the result was a white thread rather than a crack: on a bright
   * photograph the pale line swamped the dark one and every crack read as
   * something laid on top of the picture rather than as a split in it. A
   * specular highlight on a fresh edge is thinner than the edge, not thicker.
   *
   * It is also scaled by how bright the picture is there, because a highlight
   * is light being reflected: a crack across a dark part of the frame does not
   * glow.
   */
  float glint = smoothstep(width, width + 0.4, gapPx)
    * (1.0 - smoothstep(width + 0.4, width + 1.3, gapPx))
    * (0.25 + 0.75 * dot(picture, vec3(0.2126, 0.7152, 0.0722)));

  picture = mix(picture, picture * 0.12, dark * open * strength);
  picture += u_tint * glint * u_glint * open * strength;

  fragColor = vec4(max(picture, vec3(0.0)), 1.0);
}
`
// beamish:shader-end

const UNIFORMS = [
  'u_resolution',
  'u_dpr',
  'u_time',
  'u_image',
  'u_imageSize',
  'u_sectors',
  'u_rings',
  'u_jitter',
  'u_impact',
  'u_crack',
  'u_glint',
  'u_gap',
  'u_refract',
  'u_fringe',
  'u_facet',
  'u_reach',
  'u_arcs',
  'u_impactAt',
  'u_spread',
  'u_seed',
  'u_tint'
] as const

type UniformName = (typeof UNIFORMS)[number]

function rgb(value: string): [number, number, number] {
  const hex = value.trim()
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255
    ]
  }
  const nums = value.match(/[\d.]+/g)
  if (nums && nums.length >= 3) {
    return [Number(nums[0]) / 255, Number(nums[1]) / 255, Number(nums[2]) / 255]
  }
  return [0, 0, 0]
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('GlassShatter: could not create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`GlassShatter: shader failed to compile\n${log ?? ''}`)
  }
  return shader
}

class GlassShatterSurface implements Surface<GlassShatterOptions> {
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private locations = new Map<UniformName, WebGLUniformLocation | null>()
  private size = { pixelWidth: 1, pixelHeight: 1, dpr: 1 }
  private texture: WebGLTexture | null = null
  private imageSize = { width: 1, height: 1 }
  private image: HTMLImageElement | null = null

  setup(ctx: { canvas: HTMLCanvasElement | null; host: HTMLElement }): void {
    if (!ctx.canvas) throw new Error('GlassShatter needs a canvas')
    const gl = ctx.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      // The recorder reads pixels back after the draw call, and without this the
      // buffer may already have been cleared.
      preserveDrawingBuffer: true,
      powerPreference: 'low-power'
    })
    if (!gl) throw new Error('GlassShatter needs WebGL2, which this browser did not provide')

    const vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!program) throw new Error('GlassShatter: could not create program')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      throw new Error(`GlassShatter: program failed to link\n${log ?? ''}`)
    }

    this.gl = gl
    this.program = program
    this.vao = gl.createVertexArray()
    this.locations.clear()
    for (const name of UNIFORMS) {
      this.locations.set(name, gl.getUniformLocation(program, name))
    }

    /*
     * The first <img> in the host, hidden from sight and left in the document.
     * The alt text and the loading behaviour stay whatever was written, and a
     * page whose script never runs still shows the picture.
     */
    const image = ctx.host.querySelector('img')
    if (image) {
      this.image = image
      image.style.visibility = 'hidden'
      if (image.complete && image.naturalWidth > 0) this.upload(image)
      else image.addEventListener('load', () => this.upload(image), { once: true })
    }
  }

  private upload(image: HTMLImageElement): void {
    const gl = this.gl
    if (!gl || this.texture || image.naturalWidth === 0) return
    const texture = gl.createTexture()
    if (!texture) return
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    this.texture = texture
    this.imageSize = { width: image.naturalWidth, height: image.naturalHeight }
  }


  resize(size: { pixelWidth: number; pixelHeight: number; dpr: number }): void {
    this.size = size
    this.gl?.viewport(0, 0, size.pixelWidth, size.pixelHeight)
  }

  render(t: number, opts: GlassShatterOptions): void {
    const gl = this.gl
    const program = this.program
    if (!gl || !program) return

    if (this.image && !this.texture) this.upload(this.image)

    gl.useProgram(program)
    gl.bindVertexArray(this.vao)
    const loc = (name: UniformName) => this.locations.get(name) ?? null

    if (this.texture) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.texture)
      gl.uniform1i(loc('u_image'), 0)
    }

    gl.uniform2f(loc('u_resolution'), this.size.pixelWidth, this.size.pixelHeight)
    gl.uniform1f(loc('u_dpr'), this.size.dpr)
    gl.uniform1f(loc('u_time'), t)
    gl.uniform2f(loc('u_imageSize'), this.imageSize.width, this.imageSize.height)
    gl.uniform1f(loc('u_sectors'), Math.max(3, Math.round(opts.sectors)))
    gl.uniform1f(loc('u_rings'), Math.max(1, opts.rings))
    gl.uniform1f(loc('u_jitter'), opts.jitter)
    /* Y is flipped: the option is measured down the element, the way a page
       is, and the shader works in gl_FragCoord's frame, which counts up. */
    gl.uniform2f(loc('u_impact'), opts.impactX, 1 - opts.impactY)
    gl.uniform1f(loc('u_crack'), opts.crack)
    gl.uniform1f(loc('u_glint'), opts.glint)
    gl.uniform1f(loc('u_gap'), opts.gap)
    gl.uniform1f(loc('u_refract'), opts.refract)
    gl.uniform1f(loc('u_fringe'), opts.fringe)
    gl.uniform1f(loc('u_facet'), opts.facet)
    gl.uniform1f(loc('u_reach'), opts.reach)
    gl.uniform1f(loc('u_arcs'), opts.arcs)
    gl.uniform1f(loc('u_impactAt'), Math.max(0, opts.impactAt))
    gl.uniform1f(loc('u_spread'), Math.max(0.001, opts.spread))
    gl.uniform1f(loc('u_seed'), opts.seed)
    gl.uniform3fv(loc('u_tint'), rgb(opts.tint))

    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  context(): WebGLRenderingContext | WebGL2RenderingContext | null {
    return this.gl
  }

  teardown(): void {
    const gl = this.gl
    if (gl) {
      if (this.program) gl.deleteProgram(this.program)
      if (this.vao) gl.deleteVertexArray(this.vao)
      if (this.texture) gl.deleteTexture(this.texture)
    }
    if (this.image) this.image.style.visibility = ''
    this.gl = null
    this.program = null
    this.vao = null
    this.texture = null
    this.image = null
    this.locations.clear()
  }
}

/**
 * Mount GlassShatter into `el`. The element must contain an `<img>`, which stays
 * in the document: its alt text is the accessible version of the picture.
 *
 * ```ts
 * const typed = createGlassShatter(document.querySelector('#plate')!)
 * typed.start()
 * // …later
 * typed.destroy()
 * ```
 */
export function createGlassShatter(
  el: HTMLElement,
  opts: Partial<GlassShatterOptions> = {}
): EffectHandle {
  return mount<GlassShatterOptions>(el, opts, {
    defaults: glassShatterDefaults,
    create: () => new GlassShatterSurface()
  })
}

export default createGlassShatter
```

**`src/beamish/shared/runtime.ts`**

```ts
/*
 * Beamish effect runtime.
 *
 * Every tier-1 effect is a thin `Surface` plugged into `mount()`. The host owns
 * everything that is the same for all of them and easy to get wrong: DPR capping,
 * resize, pausing offscreen, pausing on tab hide, reduced motion, WebGL context
 * loss and restore, and full teardown.
 *
 * An effect's core.ts should contain drawing, and nothing else.
 */

import { resolveAutoGrounds } from './ground'

export type EffectHandle = {
  start(): void
  stop(): void
  update(opts: Record<string, unknown>): void
  /** Deterministic: the same `t` must always yield the same frame. */
  renderAtTime(t: number): void
  /** Release the WebGL context, RAF and every listener. */
  destroy(): void
}

export type Size = {
  /** CSS pixels. */
  width: number
  height: number
  /** Device pixels, DPR already capped. Use these for the drawing buffer. */
  pixelWidth: number
  pixelHeight: number
  dpr: number
}

export type Pointer = {
  /**
   * 0 to 1 across the element, origin top-left. Centre until first move.
   *
   * Under `pointerScope: 'window'` this is not clamped: 1.4 means the cursor is
   * 40% of the element's width past its right edge. An effect that reaches
   * beyond its own box needs to know how far.
   */
  x: number
  y: number
  /** False until the pointer has entered, so effects can idle sensibly. */
  active: boolean
}

/** One sample of a scripted cursor path. `t` is seconds; x/y are 0 to 1. */
export type PointerKey = { t: number; x: number; y: number }

/**
 * One scripted press. `t` is seconds from the start of the loop; x/y are 0 to 1
 * across the element.
 *
 * A path can say where the cursor is at any moment, but a press is an instant
 * rather than a position, so it needs its own list. An effect that answers to
 * clicks reads this alongside whatever real presses it has seen, which is what
 * lets the recorder produce a take with clicks in it without anything having
 * been clicked.
 */
export type PressKey = { t: number; x: number; y: number }

export type Scroll = {
  /**
   * How far the host has travelled through the viewport. 0 when its top edge is
   * level with the bottom of the viewport, 1 when its bottom edge is level with
   * the top. Outside that range the element is off screen.
   */
  progress: number
  /**
   * Signed rate of change of `progress`, in units per second, already smoothed.
   * Negative is scrolling back up.
   *
   * This is the interesting one. Position tells an effect where it is; velocity
   * tells it how hard it was thrown, which is what anything physical has to know.
   */
  velocity: number
  /** False until the page has actually been scrolled. */
  active: boolean
}

/** One sample of a scripted scroll path. `t` is seconds; progress is 0 to 1. */
export type ScrollKey = { t: number; progress: number }

export type SurfaceContext = {
  /** The element the effect was mounted into. */
  host: HTMLElement
  /**
   * The generated canvas, or null for a `kind: 'dom'` effect. A text treatment
   * has nothing to draw into and should not be handed a canvas it will not use.
   */
  canvas: HTMLCanvasElement | null
  size: Size
}

/**
 * The per-effect half. `setup` runs on mount and again after the GPU hands the
 * context back, so it must be safe to call more than once.
 */
export interface Surface<O> {
  setup(ctx: SurfaceContext): void
  resize(size: Size): void
  /**
   * Draw one frame. `t` is absolute seconds from the start of the loop.
   *
   * Must be pure in `t`. Do not integrate against the previous frame, or the
   * recorder cannot produce a clean loop and `renderAtTime` breaks.
   */
  render(t: number, opts: O, pointer: Pointer, scroll: Scroll): void
  teardown(): void
  /** Return the GL context if there is one, so the host can release it. */
  context?(): WebGLRenderingContext | WebGL2RenderingContext | null
}

export type BaseOptions = {
  /**
   * Scripted cursor path. When set, the live pointer is ignored and the pointer
   * is sampled from this path at the current time, which is what makes
   * pointer-driven effects deterministic for the recorder.
   */
  pointerPath?: PointerKey[]
  /** Seconds the scripted path takes to run once before repeating. */
  pointerPathDuration?: number
  /**
   * Scripted presses, for effects that answer to a click. Each is a time and a
   * point, and an effect treats them exactly as it treats a real press that
   * happened at that moment, so a recorded take and a live page agree.
   *
   * Unlike `pointerPath`, this does not replace the live input: a scripted press
   * and a real one are the same kind of event, and an effect that ignored the
   * cursor while a script was running would be dead on the page.
   */
  pressPath?: PressKey[]
  /**
   * Scripted scroll path. When set, the real scroll position is ignored and both
   * progress and velocity are read from this path at the current time.
   *
   * Velocity is the slope of the segment rather than a difference against the
   * last frame, so it is a function of `t` alone. That is the whole point: an
   * effect driven by a real scrollbar cannot be replayed, and the recorder needs
   * frame 90 to look the same every time it asks for it.
   */
  scrollPath?: ScrollKey[]
  /** Seconds the scripted scroll path takes to run once before repeating. */
  scrollPathDuration?: number
  /** Frame shown when the user prefers reduced motion. Pick one that composes. */
  reducedMotionTime?: number
  /** Cap on device pixel ratio. Above 2 the cost is real and the gain is not. */
  maxDpr?: number
  /** Set false to opt out of pausing when scrolled offscreen. */
  pauseWhenOffscreen?: boolean
  /**
   * Where the pointer is read from.
   *
   * `element` fires only while the cursor is over the host and reports 0 to 1.
   * `window` follows the cursor everywhere and reports element-relative
   * coordinates that go outside 0 to 1, which is what an effect needs if it
   * reacts to a cursor that has not arrived yet.
   */
  pointerScope?: 'element' | 'window'
}

export type MountConfig<O> = {
  /** Merged over on every `update()`. */
  defaults: O
  create(): Surface<O>
  /**
   * `canvas` generates a canvas filling the host and watches it for context
   * loss. `dom` generates nothing and hands the host element straight to the
   * surface, which is what a text or layout effect wants.
   */
  kind?: 'canvas' | 'dom'
  /** Extra classes for the generated canvas. Ignored when kind is 'dom'. */
  canvasClass?: string
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** Linear sample of a scripted path, wrapping at `duration` so it loops. */
export const samplePointerPath = (keys: PointerKey[], t: number, duration: number): Pointer => {
  if (keys.length === 0) return { x: 0.5, y: 0.5, active: false }
  const first = keys[0]!
  if (keys.length === 1) return { x: first.x, y: first.y, active: true }

  const span = duration > 0 ? duration : keys[keys.length - 1]!.t
  const local = span > 0 ? ((t % span) + span) % span : 0

  let a = first
  let b = keys[keys.length - 1]!
  for (let i = 0; i < keys.length - 1; i++) {
    const lo = keys[i]!
    const hi = keys[i + 1]!
    if (local >= lo.t && local <= hi.t) {
      a = lo
      b = hi
      break
    }
  }

  const gap = b.t - a.t
  const k = gap > 0 ? clamp01((local - a.t) / gap) : 0
  // Smoothstep between keys: a linear cursor reads as a machine, which is what
  // it is, but it looks wrong next to eased motion.
  const e = k * k * (3 - 2 * k)
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, active: true }
}

/**
 * Linear sample of a scripted scroll path, wrapping at `duration` so it loops.
 *
 * Velocity comes out of the same smoothstep by differentiating it rather than by
 * comparing against the previous frame, which is what keeps the whole thing a
 * function of `t`. The derivative of the smoothstep is 6k(1-k), so velocity is
 * zero at each key and peaks halfway between: the scroll eases in and out of
 * every stop by construction.
 */
export const sampleScrollPath = (keys: ScrollKey[], t: number, duration: number): Scroll => {
  if (keys.length === 0) return { progress: 0, velocity: 0, active: false }
  const first = keys[0]!
  if (keys.length === 1) return { progress: first.progress, velocity: 0, active: true }

  const span = duration > 0 ? duration : keys[keys.length - 1]!.t
  const local = span > 0 ? ((t % span) + span) % span : 0

  let a = first
  let b = keys[keys.length - 1]!
  for (let i = 0; i < keys.length - 1; i++) {
    const lo = keys[i]!
    const hi = keys[i + 1]!
    if (local >= lo.t && local <= hi.t) {
      a = lo
      b = hi
      break
    }
  }

  const gap = b.t - a.t
  const k = gap > 0 ? clamp01((local - a.t) / gap) : 0
  const e = k * k * (3 - 2 * k)
  const delta = b.progress - a.progress
  return {
    progress: a.progress + delta * e,
    velocity: gap > 0 ? (delta * 6 * k * (1 - k)) / gap : 0,
    active: true
  }
}

export function mount<O extends BaseOptions>(
  el: HTMLElement,
  userOpts: Partial<O> | undefined,
  config: MountConfig<O>
): EffectHandle {
  /*
   * `auto` in a colour option means take it from the page. Resolved here, at
   * the one point that has both the host element and the merged options, so no
   * item has to reach into the DOM from inside its own render loop.
   */
  let opts: O = resolveAutoGrounds(el, { ...config.defaults, ...(userOpts ?? {}) })

  const kind = config.kind ?? 'canvas'

  let canvas: HTMLCanvasElement | null = null
  if (kind === 'canvas') {
    canvas = document.createElement('canvas')
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    /*
     * Its own compositor layer, so the page cannot resample it.
     *
     * A canvas whose box lands on a half pixel has to be resampled to the
     * device grid, and which way it snaps is the compositor's business rather
     * than ours. Snapping one way on one frame and the other way on the next
     * moves the whole picture by a pixel, which is a flicker between two
     * positions that leaves no trace anywhere: the drawing buffer is perfect,
     * the clock is smooth, the box never changes and every number comes back
     * clean. It was reported on a canvas sitting at x = 683.5, and the same
     * effect at x = 123.5 on another machine was steady.
     *
     * translateZ(0) rather than will-change, because will-change is a hint
     * the browser is free to drop and this needs to be a promise. The cost is
     * one layer per live effect, and there is only ever one.
     */
    canvas.style.transform = 'translateZ(0)'
    canvas.style.backfaceVisibility = 'hidden'
    /*
     * Hidden until the first frame is in it.
     *
     * A WebGL canvas with `alpha: false` starts opaque black, and it is in the
     * document from the moment it is created, so between that and the first
     * draw the browser has a black rectangle to paint. On a warm cache that is
     * one frame and it reads as a flash; on a cold one the gap is longer.
     *
     * visibility rather than display, because display: none gives the element
     * no size and the first measure would come back zero.
     */
    canvas.style.visibility = 'hidden'
    if (config.canvasClass) canvas.className = config.canvasClass
    el.appendChild(canvas)
  }

  let surface: Surface<O> | null = null
  let size: Size = measure()
  let raf = 0
  let running = false
  let destroyed = false
  let contextLost = false

  // Wall-clock is accumulated rather than read, so stopping and starting does not
  // jump the animation and the loop stays reproducible.
  let elapsed = 0
  let lastStamp = 0

  const pointer: Pointer = { x: 0.5, y: 0.5, active: false }
  const scroll: Scroll = { progress: 0, velocity: 0, active: false }

  /*
   * Scroll is sampled once per frame, in the loop, rather than on the scroll
   * event.
   *
   * The event is the obvious place and it is the wrong one. Measured on a real
   * wheel scroll, scroll events arrive at about 6Hz while the effect renders at
   * 60, so a value taken on the event is reused for up to five frames running
   * and the effect moves in visible steps. Decaying it between events does not
   * fix that; it just turns the steps into a sawtooth.
   *
   * Reading the rect every frame costs about 20 microseconds, measured, which
   * is a tenth of a percent of a frame. It is a read with no write in front of
   * it, so it forces no layout.
   *
   * This is the one piece of state in the runtime that is not a function of
   * `t`, which is why `scrollPath` exists to replace it wholesale for the
   * recorder.
   */
  let scrollStarted = false
  let scrollSeeded = false

  /*
   * Half-life of the velocity smoothing. A per-frame difference is noisy enough
   * that handing it straight to a shader looks like chatter, and frame times
   * are not uniform. 70ms is short enough to feel attached to the input and
   * long enough to hide that jitter.
   */
  const VELOCITY_HALF_LIFE = 0.07

  function sampleScroll(dt: number) {
    const rect = el.getBoundingClientRect()
    const viewport = window.innerHeight || 1
    /*
     * 0 when the top edge is level with the bottom of the viewport, 1 when the
     * bottom edge is level with the top. Measured against the element's own
     * height plus the viewport, so a tall hero and a short strip both travel
     * the full range, which is what makes the number worth handing to an
     * effect at all.
     */
    const span = viewport + rect.height
    const next = span > 0 ? clamp01((viewport - rect.top) / span) : 0

    if (!scrollSeeded) {
      // Nothing to difference against on the first frame, and seeding it with a
      // zero gap would read as an infinite velocity.
      scroll.progress = next
      scrollSeeded = true
      return
    }

    if (dt > 0) {
      const instant = (next - scroll.progress) / dt
      const k = 1 - Math.pow(0.5, dt / VELOCITY_HALF_LIFE)
      scroll.velocity += (instant - scroll.velocity) * k
      if (Math.abs(scroll.velocity) < 1e-4) scroll.velocity = 0
    }

    if (next !== scroll.progress) scrollStarted = true
    scroll.progress = next
    scroll.active = scrollStarted
  }

  const motionQuery =
    typeof matchMedia === 'function' ? matchMedia(REDUCED_MOTION_QUERY) : null
  let reduced = motionQuery?.matches ?? false

  function measure(): Size {
    const rect = el.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect.width))
    const height = Math.max(1, Math.round(rect.height))
    const cap = opts.maxDpr ?? 2
    const dpr = Math.min(window.devicePixelRatio || 1, cap)
    return {
      width,
      height,
      pixelWidth: Math.max(1, Math.round(width * dpr)),
      pixelHeight: Math.max(1, Math.round(height * dpr)),
      dpr
    }
  }

  function applySize() {
    size = measure()
    if (canvas) {
      if (canvas.width !== size.pixelWidth) canvas.width = size.pixelWidth
      if (canvas.height !== size.pixelHeight) canvas.height = size.pixelHeight
    }
    surface?.resize(size)
  }

  function pointerAt(t: number): Pointer {
    const path = opts.pointerPath
    if (path && path.length > 0) {
      return samplePointerPath(path, t, opts.pointerPathDuration ?? 0)
    }
    return pointer
  }

  function scrollAt(t: number): Scroll {
    const path = opts.scrollPath
    if (path && path.length > 0) {
      return sampleScrollPath(path, t, opts.scrollPathDuration ?? 0)
    }
    return scroll
  }

  function draw(t: number) {
    if (!surface || contextLost) return
    surface.render(t, opts, pointerAt(t), scrollAt(t))
    // There is something in the canvas now, so it can be shown. Cheap: a style
    // write that is already the current value does not invalidate anything.
    if (canvas && canvas.style.visibility === 'hidden') canvas.style.visibility = ''
  }

  function tick(stamp: number) {
    if (!running) return
    /*
     * Clamped at both ends.
     *
     * The top end is the tab-switch spike this always guarded against. The
     * bottom end is that a rAF timestamp is the moment the frame began, which
     * can be EARLIER than the performance.now() start() took a moment before:
     * the subtraction is then negative, Math.min keeps it, and the effect's
     * clock runs backwards. Measured on WindField, elapsed began at -0.1088
     * and four frames were rendered at a negative t before it climbed past
     * zero. A shader handed a smaller t than last frame draws an earlier
     * picture, which is a visible jump backwards on every start, and start
     * runs again every time the panel scrolls into view or the tab is
     * returned to.
     */
    const dt = Math.min(Math.max(stamp - lastStamp, 0), 100) / 1000
    elapsed += dt
    lastStamp = stamp
    sampleScroll(dt)
    draw(elapsed)
    raf = requestAnimationFrame(tick)
  }

  function ensureSurface() {
    if (surface || destroyed) return
    surface = config.create()
    surface.setup({ host: el, canvas, size })
    surface.resize(size)
  }

  function start() {
    if (destroyed || running || contextLost) return
    ensureSurface()
    if (reduced) {
      // WCAG 2.3.3: no loop at all. Still show a composed frame rather than a
      // blank panel. See reducedMotionTime.
      draw(opts.reducedMotionTime ?? 0)
      return
    }
    running = true
    lastStamp = performance.now()
    raf = requestAnimationFrame(tick)
  }

  function stop() {
    running = false
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    /*
     * Velocity is sampled in the loop, so a paused effect would otherwise keep
     * whatever it was last handed. Resuming after being scrolled past would
     * then show one frame of a flick that happened seconds ago.
     */
    scroll.velocity = 0
  }

  // --- context loss ------------------------------------------------------
  // Chromium hands a lost context back when an active one is released, so this
  // path fires in ordinary use, not only on a GPU crash.

  const onLost = (event: Event) => {
    event.preventDefault() // without this the context is not recoverable
    contextLost = true
    stop()
    surface?.teardown()
    surface = null
  }

  const onRestored = () => {
    contextLost = false
    if (destroyed) return
    ensureSurface()
    applySize()
    if (visible) start()
  }

  // Only a canvas can lose a GL context. A DOM effect has nothing to listen for.
  canvas?.addEventListener('webglcontextlost', onLost as EventListener, false)
  canvas?.addEventListener('webglcontextrestored', onRestored, false)

  // --- pointer -----------------------------------------------------------

  const windowScope = opts.pointerScope === 'window'

  const onPointerMove = (event: PointerEvent) => {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    // Window scope reports unclamped coordinates on purpose. An effect that
    // reaches past its own edge has to know how far past, and clamping would
    // pin it to the border instead.
    pointer.x = windowScope ? x : clamp01(x)
    pointer.y = windowScope ? y : clamp01(y)
    pointer.active = true
  }

  const onPointerLeave = () => {
    pointer.active = false
  }

  const pointerTarget: EventTarget = windowScope ? window : el
  pointerTarget.addEventListener('pointermove', onPointerMove as EventListener)
  // Only element scope has a leave: the window one is never left.
  if (!windowScope) el.addEventListener('pointerleave', onPointerLeave)

  // --- scroll ------------------------------------------------------------

  /*
   * No scroll listener. The position is read in the frame loop above, which is
   * both smoother and one fewer thing to remove on teardown. An effect that is
   * not running does not need a scroll position, because nothing is drawing it.
   */

  // --- visibility and viewport -------------------------------------------

  let visible = true
  let wantedByUser = false

  const resizeObserver = new ResizeObserver(() => {
    if (destroyed) return
    applySize()
    /*
     * Always redraw, not only when stopped.
     *
     * Assigning canvas.width or canvas.height resets the drawing buffer, and a
     * WebGL buffer resets to opaque black. Leaving that for the next animation
     * frame means one black frame every time the element changes size, and
     * since the observer fires once on its first observation, that was a black
     * flash on every mount: the canvas showed its first drawn frame, the
     * observer cleared it, and the page painted the hole before the next tick
     * filled it.
     */
    draw(reduced ? opts.reducedMotionTime ?? 0 : elapsed)
  })
  resizeObserver.observe(el)

  const intersectionObserver =
    opts.pauseWhenOffscreen === false
      ? null
      : new IntersectionObserver(
          entries => {
            const entry = entries[entries.length - 1]
            if (!entry) return
            visible = entry.isIntersecting
            if (visible) {
              if (wantedByUser) start()
            } else {
              stop()
            }
          },
          { threshold: 0 }
        )
  /*
   * The gate watches the element's parent, not the element.
   *
   * Watching the element deadlocks any effect that clips or moves its own host.
   * A reveal starts with its host clipped to nothing, the observer reports that
   * as not intersecting, the runtime stops the loop, and the clip therefore
   * never advances off the host: blank for ever, with the replay button unable
   * to escape it because `visible` can never become true again. The gate's
   * input must not be geometry the effect controls.
   *
   * The parent is laid out by the page rather than by the effect, so it breaks
   * the cycle. It is usually a little larger, which means an effect can start a
   * frame or two before it is strictly on screen. That is the cheaper mistake.
   */
  intersectionObserver?.observe(el.parentElement ?? el)

  const onVisibilityChange = () => {
    if (document.hidden) stop()
    else if (wantedByUser && visible) start()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  // Live listener, not a one-time read, so toggling the OS setting mid-session
  // takes effect without a reload.
  const onMotionChange = (event: MediaQueryListEvent) => {
    reduced = event.matches
    if (reduced) {
      stop()
      ensureSurface()
      draw(opts.reducedMotionTime ?? 0)
    } else if (wantedByUser && visible) {
      start()
    }
  }
  motionQuery?.addEventListener('change', onMotionChange)

  // --- handle ------------------------------------------------------------

  const handle: EffectHandle = {
    start() {
      wantedByUser = true
      if (visible && !document.hidden) start()
    },
    stop() {
      wantedByUser = false
      stop()
    },
    update(next) {
      opts = resolveAutoGrounds(el, { ...opts, ...(next as Partial<O>) })
      applySize()
      if (!running) draw(reduced ? opts.reducedMotionTime ?? 0 : elapsed)
    },
    renderAtTime(t) {
      if (destroyed) return
      ensureSurface()
      elapsed = t
      draw(t)
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      stop()

      motionQuery?.removeEventListener('change', onMotionChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      intersectionObserver?.disconnect()
      resizeObserver.disconnect()
      pointerTarget.removeEventListener('pointermove', onPointerMove as EventListener)
      el.removeEventListener('pointerleave', onPointerLeave)
      canvas?.removeEventListener('webglcontextlost', onLost as EventListener)
      canvas?.removeEventListener('webglcontextrestored', onRestored)

      const gl = surface?.context?.() ?? null
      surface?.teardown()
      surface = null

      // Hand the context back now rather than waiting for GC. The browser budget
      // is 16 contexts or 16M pixels, whichever comes first, and a page that
      // navigates between demos will hit it otherwise.
      gl?.getExtension('WEBGL_lose_context')?.loseContext()

      canvas?.remove()
    }
  }

  return handle
}
```

## 2. What it is

GlassShatter breaks a plate of glass over a picture and leaves the pieces in
the frame.

Every version of this effect scatters random sites across the plane and gives
each pixel to the nearest one. The result is a honeycomb, and a honeycomb is
what a dry mud flat looks like. It is not what a broken window looks like, and
once you have noticed that you cannot unsee it.

## 3. Wire it in

**Plain HTML.** The element must contain an `<img>`. It stays in the document,
hidden once the texture is uploaded, so a browser that never runs the script
shows the photograph and a screen reader still reads the alt text.

```html
<div id="pane" style="position: relative; height: 70vh">
  <img src="/plate.jpg" alt="A ridge against a bright sky" />
</div>

<script type="module">
  import { createGlassShatter } from './beamish/effects/glass-shatter/core.js'

  const pane = createGlassShatter(document.querySelector('#pane'))
  pane.start()
</script>
```

Take the image out of the flow (`position: absolute; inset: 0`). Left in it,
the canvas the effect appends is pushed a full element height down the page,
where it draws perfectly and is never seen. That is worth saying because it
looks like the effect has failed rather than like a layout problem.

**React.**

```tsx
import { useEffect, useRef } from 'react'
import { createGlassShatter } from '@/beamish/effects/glass-shatter/core'

export function Pane({ src, alt }: { src: string; alt: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const pane = createGlassShatter(host.current, { impactX: 0.42 })
    pane.start()
    return () => pane.destroy()
  }, [src])

  return (
    <div ref={host} style={{ position: 'relative' }}>
      <img src={src} alt={alt} style={{ position: 'absolute', inset: 0 }} />
    </div>
  )
}
```

**Vue.**

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { createGlassShatter } from '@/beamish/effects/glass-shatter/core'
import type { EffectHandle } from '@/beamish/shared/runtime'

const host = ref<HTMLElement | null>(null)
let pane: EffectHandle | null = null

onMounted(() => {
  if (!host.value) return
  pane = createGlassShatter(host.value)
  pane.start()
})

onBeforeUnmount(() => pane?.destroy())
</script>

<template>
  <div ref="host" class="pane">
    <img src="/plate.jpg" alt="A ridge against a bright sky" />
  </div>
</template>
```

**Astro.** Nothing extra is required. The core is a standard ES module and
works from a plain `<script>` in the page.

## 4. Options

Every option, with its default and the range that actually looks good. Pass them
as the second argument to the create function; anything omitted takes its default.

| Option | Type | Default | Range | What it does |
| --- | --- | --- | --- | --- |
| `sectors` | number | `29` | 3 to 48 (looks right between 8 and 20) | Radial cracks running out from the impact. A prime number by default and for a reason: with an even count the cracks opposite each other line up through the impact and read as a drawn asterisk rather than as a break. |
| `rings` | number | `9` | 1 to 24 (looks right between 4 and 12) | Concentric cracks running round the impact, counted along the square root of the radius, so they come out close together near the impact and further apart as they go out. At 1 you have radial cracks only, which is a smashed pane rather than a struck one. |
| `jitter` | number | `0.7` | 0 to 0.96 (looks right between 0.5 and 0.9) | How far a site may sit from the middle of its own cell. At 0 the shards are a perfect polar grid, which is a dartboard. The cap is just under 1 and it is load-bearing: a site that crosses into its neighbour's cell breaks the nine-cell search the whole thing rests on, and the plate tears along the lattice. |
| `crack` | number | `1.3` | 0.2 to 8 px (looks right between 1 and 3) | Width of the dark line, in screen pixels. Thin. A crack in glass is a hairline with light on it, and a fat dark line is a drawing of a crack: that is the single most common way this effect is got wrong. |
| `glint` | number | `0.5` | 0 to 2 (looks right between 0.35 and 0.9) | How brightly the fresh edge beside the crack catches the light. The term that does the most work here and the one nobody includes. Set it to 0 once: the cracks stop being cracks and become a grid drawn over the photograph, and no amount of width or refraction brings them back. |
| `gap` | number | `1` | 0 to 4 (looks right between 0.5 and 1.8) | How far each shard shifts, outward from the impact plus a little of its own. This slides the picture inside the shard rather than moving the shard, so it has to stay small: past about 2.5 the pieces stop reading as shifted and start reading as the wrong part of the photograph. |
| `refract` | number | `0.6` | 0 to 4 (looks right between 0.6 and 1.8) | How much the picture bends at a crack. The bend is strongest at the crack and dies away into the middle of the shard, which is where a wedge of glass is thickest and where it is flat. |
| `fringe` | number | `0.6` | 0 to 4 (looks right between 0.5 and 1.8) | How far red and blue come apart as the picture bends. It only happens at the cracks, which is the point: a plate of glass is not a prism, but the wedge at a broken edge is. |
| `facet` | number | `0.16` | 0 to 0.6 (looks right between 0.08 and 0.26) | How far a shard may sit out of the plane of the plate, as a share of its brightness. This is what gives the plate thickness: without it the cracks are lines on a flat picture, and with too much of it the shards read as tiles of different colours. |
| `reach` | number | `0.62` | 0.1 to 2 (looks right between 0.45 and 0.95) | How far the damage carries from the impact, measured in short edges of the element. A strike does not break the whole pane: there is a region of cracks around the impact and intact glass past it, and without that the frame is webbed edge to edge at an even density, which is half of why the honeycomb version of this effect never convinces. Above about 1.4 the whole element is inside the break and this stops doing anything. |
| `arcs` | number | `0.3` | 0 to 1 (looks right between 0.3 and 0.6) | What share of the circumferential cracks actually form. At 1 every one of them is there, and that is the spider web: a Voronoi diagram partitions the plane, so with a radial crack between each pair of neighbours and an arc joining them the architecture is exactly a web, and weighting the arcs down is not enough to fix it. A break is not a partition of the plane, it is a set of curves with ends. At 0 you have radials only, which is a struck pane that has not finished going. |
| `impactX` | number | `0.42` | 0 to 1 | Where the plate was struck, across the element. Off centre on purpose: a break centred in the frame reads as a graphic, and the whole argument for a polar lattice is that the break has a place it came from. |
| `impactY` | number | `0.56` | 0 to 1 | Where the plate was struck, down the element. |
| `impactAt` | number | `0.5` | 0 to 10 s | Seconds of intact glass before it is struck. Worth having at all: the picture whole for half a second is what makes the break an event rather than a texture. |
| `spread` | number | `0.75` | 0.05 to 6 s (looks right between 0.4 and 1.2) | Seconds for the break to open. Quick. Glass does not ease: the cracks arrive at something like a kilometre a second, and anything above about 1.5 here reads as the picture slowly developing a fault. |
| `tint` | color | `#dbe9ff` | any CSS hex | The colour of the light on a fresh edge. Slightly cool, because a fresh break in glass is a green-blue line: that is the iron in it, and it is why the cut edge of a float-glass pane looks green end on. |
| `seed` | number | `7` | 1 to 9999 | Seed for the shards. The same seed gives the same break, which is what makes the take reproducible. |
| `maxDpr` | number | `2` | 1 to 3 | Device pixel ratio ceiling. The crack width is in screen pixels, so this changes what the hairlines cost to draw but not how thick they look. |
| `reducedMotionTime` | number | `4` | 0 to 30 s | The single frame shown when the user prefers reduced motion. For a one-shot break this has to be a time after it has opened, so the plate is simply broken. The broken plate is the point; the breaking is how it gets there. |

## 5. Glass breaks along the stress

A plate struck at a point does not break into equal cells. The stress is
**radial and circumferential**, so you get cracks running out from the impact
and other cracks running round it, crossing the first set. The pieces come out
roughly four-sided. They are small near the impact and they grow with
distance, because the radial cracks fan apart as they travel.

All of which is a **polar lattice** rather than a square one. Sites live in
cells of angle by radius, so the borders between them fall along radii and
around arcs, and the entire character of real glass comes out of the coordinate
system. There is no extra work in it: it is the same nine hashes and nine
distances a square Voronoi costs.

Two details in that are load-bearing.

**The radius goes under a square root.** A plain radius gives rings of even
spacing, and concentric cracks in glass get further apart as they travel. The
root also crowds the inner rings together, which is the zone of fine fragments
around the impact that any photograph of a broken window has.

**The angular cell wraps.** The sector index is taken modulo the sector count
when it is hashed, so the cell on one side of angle zero is the same cell as
the one on the other side. Without that there is a seam running out from the
impact that no amount of jitter will hide. The *position* uses the unwrapped
index, so the distance stays continuous across the join.

## 6. Where the cracks come from

The distance to the nearest site says how far you are from a site, which is no
use. The second nearest gives the border away: halfway between two sites the
two distances are equal, so their difference falls to zero, and that difference
is a distance to the edge for free.

**The width is in screen pixels, got by dividing the border distance by its own
gradient.** One lattice unit is a few pixels at the impact and a hundred at the
edge of the frame, so a width in lattice units comes out as cracks of wildly
uneven thickness. Scaling by `fwidth` was the first attempt here and it is the
same mistake in a different hat, because `fwidth` measures how fast the
quantity changes rather than how far away the border is: it gave eight-pixel
lines with a white halo round them and the whole thing came out as a spider web.
Dividing a distance by the steepness of its field is the standard way to
normalise one, and it gives a number in pixels that means the same thing
everywhere in the frame.

## 7. The bright line is the whole thing

A dark line is a drawing of a crack. What turns it into a crack is the bright
line beside it: a broken edge is a fresh face of glass, it catches the light,
and a crack in a photograph is always a dark line with a glint along it.

**Set `glint: 0` once.** The cracks stop being cracks and become a grid drawn
over the photograph, and no amount of width or refraction brings them back. It
is the term nobody includes and it does more than the rest put together.

Two more carry the remainder:

**The picture bends at the crack and its channels come apart as it bends**,
which is what a wedge of glass does to light passing through it. The bend
follows the gradient of the border distance, which points *across* the crack
rather than along it, and it dies away into the middle of the shard, where a
wedge is thickest and where it is flat.

**Whole shards sit a shade off their neighbours**, from being tilted a degree
out of the plane of the plate. That is `facet`, and it is what gives the thing
thickness. Without it the cracks are lines on a flat picture.

## 8. Tuning it, in order

1. **`impactX` and `impactY`.** Put the impact somewhere, off centre. A break
   centred in the frame reads as a graphic, and the whole argument for a polar
   lattice is that the break came from a place.
2. **`sectors` and `rings`.** How many cracks out and how many round. Keep
   `sectors` odd: with an even count the cracks opposite each other line up
   through the impact and read as a drawn asterisk.
3. **`crack`.** Thin. A crack in glass is a hairline, and a fat dark line is a
   drawing of one.
4. **`glint`.** See above. This is the one.
5. **`refract`, `fringe`, `facet`, `gap`.** Small. Each is something you notice
   once and then stop seeing, which is the right amount.

## 9. Choosing a picture

Bright, with saturated colour and at least one long straight line in it.

A crack is only visible where it crosses something. The glint needs bright
ground to sit against, the channel split needs saturated colour to come apart
into, and the bend needs a straight line running through it to be seen bending.
A horizon does all three at once.

A dark or low-contrast photograph hides the lot. The cracks are still there and
you cannot see them, which looks like a broken effect rather than a broken
plate.

## 10. The shards do not fly

`gap` slides the picture *inside* each shard rather than moving the shard, so
it has to stay small. Past about 2.5 the pieces stop reading as shifted and
start reading as the wrong part of the photograph.

Pieces that actually fly apart are a different item and a different technique:
it needs real geometry, because for any pixel you would have to know which
shard landed there, and that is an inverse problem a single fragment pass
cannot answer. This is the plate still in its frame, which is also the version
you can put behind content.

## 11. Accessibility. Do not skip this

The alt text on the `<img>` is the accessible version of the picture and it is
left exactly as written. Write it as you would for the photograph, because that
is what the reader is being told about. There is nothing in the canvas for
assistive technology, by design.

Under reduced motion the loop never starts and one frame is drawn, the one at
`reducedMotionTime`, which is after the break has opened. The plate is simply
broken. The broken plate is the point; the breaking is how it gets there.

## 12. Cleanup and SSR

`destroy()` releases the WebGL context and the texture, cancels the RAF,
disconnects the observers, removes every listener, and puts the image's
visibility back. One live context at a time is the budget, so call it.

The photograph renders on the server as an ordinary `<img>`, which is the whole
fallback: if the script never runs, the page shows the picture.

## 13. The three mistakes most likely to be made here

1. **A square lattice.** Random sites on a grid give a honeycomb. Glass breaks
   radially and circumferentially, and the lattice is the whole item.

2. **No glint.** The commonest failure, and the one that makes every other
   version of this effect look like a grid over a photograph.

3. **A fat crack.** A hairline with light on it is a crack. Four pixels of
   black is a drawing.

4. **An even sector count.** The opposite cracks line up through the impact and
   the thing reads as an asterisk.

5. **Jitter past the cap.** A site that crosses into its neighbour's cell
   breaks the nine-cell search, the nearest site can be two cells away, and the
   plate tears along the lattice rather than along the cracks.

6. **A width in lattice units.** One lattice unit is a different number of
   pixels in each direction and at each radius, so the cracks come out thick in
   the middle and invisible at the edges.

7. **A dark photograph.** Everything works and nothing is visible.

---

Concept credit: Splitting a layer into shards around a set of sites, opening a crack along each border with the next-nearest shard, and bending and colour-splitting the layer across it, from the Shader Effects library's fracture. Their sites are random; the polar lattice here is the answer to what that looks like, by Shader Effects Inc., https://github.com/shader-effects-inc/shaders.
The implementation here is written from scratch.

---

When you are done, confirm the effect renders and that its cleanup runs on
unmount. If something does not work, the most likely cause is at the top of the
mistakes list above, not in the shader.
