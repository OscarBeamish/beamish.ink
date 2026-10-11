
precision mediump float;

varying vec3 vColor;

void main() {
  /*
   * Round points, cut out of the square one the hardware gives you, with the
   * edge softened by one pixel's worth of the point's own coordinate. Square
   * points read as a screen door over the picture: the grid they sit on
   * becomes the subject, which is the opposite of what this is for.
   */
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d);
  float alpha = 1.0 - smoothstep(0.42, 0.5, r);
  if (alpha <= 0.001) discard;

  gl_FragColor = vec4(vColor, alpha);
}
