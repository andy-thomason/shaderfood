precision mediump float;

varying vec3 normal_;
varying vec3 pos_;

#ifdef VERTEX_SHADER
  attribute vec3 pos;
  attribute vec3 normal;
  uniform mat4 model_to_perspective;

  void main() {
    gl_Position = model_to_perspective * vec4(pos, 1);
    normal_ = normal;
    pos_ = pos;
  }
#else
  uniform vec3 light_pos;  // in model space
  uniform vec3 view_pos;   // in model space
  uniform vec3 ambient;    // rgb
  uniform vec3 diffuse;    // rgb
  uniform vec3 specular;   // rgb
  uniform float shininess; // power factor
  uniform float alpha; // alpha

  void main() {
    vec3 normal = normalize(normal_);
    vec3 view_ray = normalize(pos_ - view_pos);
    vec3 incident = normalize(pos_ - light_pos);
    float diffuse_factor = max(0.0, -dot(normal, incident));
    vec3 reflection = reflect(incident, normal);
    float specular_dot = max(0.0, dot(reflection, view_ray));
    float specular_factor = pow(specular_dot, shininess);
    gl_FragColor = vec4(
      ambient.xyz +
      specular.xyz * specular_factor +
      diffuse.xyz * diffuse_factor,
      alpha
    );
    //gl_FragColor = vec4(diffuse_factor, 0, 0, 1);
  }
#endif
