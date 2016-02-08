//
// Shaderfood: a simple WebGL feeder
// (C) Andy Thomason 2016
//

//! Create a WebGL canvas in an element with a certain id.
function Canvas(id) {
  var canvas = this.canvas = document.getElementById(id);
  if (!canvas) throw("could not find " + id);

  // note: this may throw an exception.
  this.gl = canvas.getContext("webgl");
  this.vbos = {};
  this.ibos = {};
  var ia = this.default_indices = new Int16Array(65536);
  for (var i = 0; i != 65536; ++i) ia[i] = i;
  this.default_vertices = [-1, -1, 0,  0, 1, 0, 1, -1, 0];
}

//! Clear the viewport and z buffer.      
Canvas.prototype.clear = function(params) {
  var gl = this.gl;
  
  var get_opt = function(param, deflt) {
    return params && param in params ? params[param] : deflt;
  };

  var cc = get_opt('color', [.6, .6, .6, 1]);
  var clear_bits = get_opt('bits', gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  var enables = get_opt('enables', [gl.DEPTH_TEST]);
  var disables = get_opt('disables', []);
  var viewport = get_opt('viewport', [0, 0, gl.canvas.width, gl.canvas.height]);

  gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
  gl.clearColor(cc[0], cc[1], cc[2], cc[3]);
  gl.clear(clear_bits);
  for (var e of enables) {
    gl.enable(e);
  }
  for (var d of disables) {
    gl.disable(d);
  }
};

Canvas.prototype.get_ibo = function(indices) {
  if (!indices) indices = this.default_indices;
  var ibo = this.ibos[indices];
  if (!ibo) {
    var gl = this.gl;
    this.ibos[indices] = ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Int16Array(indices), gl.STATIC_DRAW);
  }
  return ibo;
}

Canvas.prototype.get_vbo = function(vertices) {
  if (!vertices) vertices = this.default_vertices;
  var vbo = this.vbos[vertices];
  if (!vbo) {
    var gl = this.gl;
    this.vbos[vertices] = vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  }
  return vbo;
}

//! Create a WebGL shader from a URL
function Shader(canvas, url) {
  var http = new XMLHttpRequest();
  var gl = canvas.gl;

  function make_shader(src, shader_type, url) {
    var def = shader_type == gl.FRAGMENT_SHADER ? "#define FRAGMENT_SHADER 1\n\n" : "#define VERTEX_SHADER 1\n\n";
    var shader = gl.createShader(shader_type);

    gl.shaderSource(shader, def + src);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw("error compiling shader " + url + ":\n" + gl.getShaderInfoLog(shader));
    }

    return shader;
  }
  
  function get_info(type, size) {
    switch(type) {
      default: return 0;
      case gl.FLOAT_VEC2: return [[0, 0], gl.FLOAT, 2];
      case gl.FLOAT_VEC3: return [[0, 0, 0], gl.FLOAT, 3];
      case gl.FLOAT_VEC4: return [[0, 0, 0, 1], gl.FLOAT, 4];
      case gl.FLOAT_MAT2: return [[1, 0,  0, 1], gl.FLOAT, 4];
      case gl.FLOAT_MAT3: return [[1, 0, 0,  0, 1, 0,  0, 0, 1], gl.FLOAT, 9];
      case gl.FLOAT_MAT4: return [[1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1], gl.FLOAT, 16];
      case gl.INT_VEC2: return [[0, 0], gl.INT, 2];
      case gl.INT_VEC3: return [[0, 0, 0], gl.INT, 2];
      case gl.INT_VEC4: return [[0, 0, 0, 1], gl.INT, 2];
    }
  }
  
  var thiz = this;

  http.onreadystatechange = function() {
    if (http.readyState == 4 && http.status == 200) {
      var program = gl.createProgram();
      gl.attachShader(program, make_shader(http.responseText, gl.VERTEX_SHADER, url));
      gl.attachShader(program, make_shader(http.responseText, gl.FRAGMENT_SHADER, url));
      gl.linkProgram(program);
  
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        alert("error linking " + url);
      }
      
      var infos = {}
  
      var nattr = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
      var attributes = {}
      for (var i = 0; i != nattr; ++i) {
        var val = gl.getActiveAttrib(program, i);
        var info = infos[val.name] = get_info(val.type, val.size);
        attributes[val.name] = {
          size: info[2], type: info[1],
          loc: gl.getAttribLocation(program, val.name),
          normalized: false,
          stride: info[2] * 4,
        };
      }
      
      var nuni = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      var uniforms = {}
      for (var i = 0; i != nuni; ++i) {
        var val = gl.getActiveUniform(program, i);
        var info = infos[val.name] = get_info(val.type, val.size);
        uniforms[val.name] = {
          size: info[2], type: info[1],
          autype: val.type,
          loc: gl.getUniformLocation(program, val.name)
        };
      }
      thiz.attributes = attributes;
      thiz.uniforms = uniforms;
      thiz.infos = infos;
      thiz.program = program;
      thiz.gl = gl;
      thiz.canvas = canvas;
    }
  };
  http.open("GET", url, true);
  http.send();
}

//! Draw a model using this shader.
Shader.prototype.draw = function(params) {
  check = function() { if (gl.getError()) throw(gl.getError()); }

  if (this.program) {
    var gl = this.gl;
    var canvas = this.canvas;

    gl.useProgram(this.program);
    check();

    for (var u in this.uniforms) {
      var uval = this.uniforms[u];
      var value = u in params ? params[u] : uval.default;
      var loc = uval.loc;
      switch (uval.autype) {
        case gl.FLOAT: gl.uniform1f(loc, value); break;
        case gl.FLOAT_VEC2: gl.uniform2fv(loc, value); break;
        case gl.FLOAT_VEC3: gl.uniform3fv(loc, value); break;
        case gl.FLOAT_VEC4: gl.uniform4fv(loc, value); break;
        case gl.FLOAT_MAT2: gl.uniformMatrix2fv(loc, false, value); break;
        case gl.FLOAT_MAT3: gl.uniformMatrix3fv(loc, false, value); break;
        case gl.FLOAT_MAT4: gl.uniformMatrix4fv(loc, false, value); break;
        case gl.INT: gl.uniform1i(loc, value); break;
        case gl.INT_VEC2: gl.uniform2iv(loc, value); break;
        case gl.INT_VEC3: gl.uniform3iv(loc, value); break;
        case gl.INT_VEC4: gl.uniform4iv(loc, value); break;
      }
    }

    for (var a in this.attributes) {
      var value = a in params ? params[a] : this.infos[a][0];
      var val = this.attributes[a];
      var vbo = canvas.vbos[value];
      if (!vbo) {
        canvas.vbos[value] = vbo = canvas.get_vbo(value);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      check();
      gl.vertexAttribPointer(val.loc, val.size, val.type, val.normalized, val.stride, 0);
      check();
      gl.enableVertexAttribArray(val.loc);
    }
    
    var num_indices = params.indices ? params.indices.length : 3;
    var ibo = canvas.get_ibo(params.indices);
    if (ibo) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      check();
    }

    gl.drawElements(gl.TRIANGLES, num_indices, gl.UNSIGNED_SHORT, 0);
    check();

    for (var a in this.attributes) {
      gl.disableVertexAttribArray(this.attributes[a].loc);
    }
  }
};
