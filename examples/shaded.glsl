precision mediump float;

varying vec3 normal_;

#ifdef VERTEX_SHADER
  attribute vec3 pos;
  attribute vec3 normal;
  uniform mat4 model_to_perspective;

  void main() {
    gl_Position = model_to_perspective * vec4(pos, 1);
    normal_ = normal;
  }
#else
  uniform vec3 light_dir;
  uniform vec3 view_pos;
  uniform vec4 diffuse;
  uniform vec4 specular;
  uniform float shininess;

  void main() {
    vec3 normal = normalize(normal_);
    vec3 view_dir = vec3(0.0, 0.0, 1.0);
    float diffuse_factor = max(0.0, dot(normal, -light_dir));
    vec3 reflection = reflect(-light_dir, normal);
    float specular_dot = max(0.0, -dot(reflection, view_dir));
    float specular_factor = pow(specular_dot, shininess);
    gl_FragColor = vec4(
      specular.xyz * specular_factor + diffuse.xyz * diffuse_factor,
      1
    );
  }
#endif
