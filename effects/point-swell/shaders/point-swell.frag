
precision mediump float;

uniform float uOpacity;
varying vec3 vColor;
varying float vFade;

void main() {
  /*
   * Round, with the edge softened across the whole radius rather than at it.
   * A hard disc at this size aliases into a square, and tens of thousands of
   * squares read as a dither pattern rather than as light.
   */
  vec2 d = gl_PointCoord - 0.5;
  float l = length(d);
  if (l > 0.5) discard;
  float a = smoothstep(0.5, 0.0, l);
  a *= a;

  gl_FragColor = vec4(vColor, a * vFade * uOpacity);
}
