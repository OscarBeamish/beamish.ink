#version 300 es
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
 * Pure in `t`. Nothing here depends on the frame before it.
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
   * gone. Nothing here is periodic, so `t` past the end is simply the end.
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
   * Because `radial` varies along a border, a gated arc also fades out where
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
