precision mediump float;

#ifdef VERTEX_SHADER
  attribute vec3 pos;
  void main() { gl_Position = vec4(pos, 1); }
#else
  //uniform vec4 color;
  void main() {
    gl_FragColor = vec4(1, 0, 0, 1);
  }
#endif
