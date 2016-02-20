//
// Shaderfood: a simple WebGL feeder
// (C) Andy Thomason 2016
//

// From gl-matrix.js 
/* global mat4 vec4 vec3 */

//! Create a WebGL canvas in an element with a certain id.
function Canvas(id) {
  var canvas = this.canvas = document.getElementById(id);
  if (!canvas) throw("could not find " + id);

  // note: this may throw an exception.
  this.gl = canvas.getContext("webgl");
  this.vbos = {};
  this.ibos = {};
  var ia = this.default_indices = new Uint16Array(65536);
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
  this.viewport = viewport;

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

//! map arrays of indices to ibo objects
Canvas.prototype.get_ibo = function(indices) {
  if (!indices) indices = this.default_indices;
  var ibo = this.ibos[indices];
  if (!ibo) {
    var gl = this.gl;
    this.ibos[indices] = ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    if (!(indices instanceof Uint16Array)) indices = new Uint16Array(indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  }
  return ibo;
}

//! map arrays of vertices to vbo objects
Canvas.prototype.get_vbo = function(vertices) {
  if (!vertices) vertices = this.default_vertices;
  var vbo = this.vbos[vertices];
  if (!vbo) {
    var gl = this.gl;
    this.vbos[vertices] = vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    if (!(vertices instanceof Float32Array)) vertices = new Float32Array(vertices)
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
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
  
  // return [default, simple type, size]
  function get_info(type, size) {
    switch(type) {
      default: return [0, type, size];
      case gl.FLOAT_VEC2: return [[0, 0], gl.FLOAT, size*2];
      case gl.FLOAT_VEC3: return [[0, 0, 0], gl.FLOAT, size*3];
      case gl.FLOAT_VEC4: return [[0, 0, 0, 1], gl.FLOAT, size*4];
      case gl.FLOAT_MAT2: return [[1, 0,  0, 1], gl.FLOAT, size*4];
      case gl.FLOAT_MAT3: return [[1, 0, 0,  0, 1, 0,  0, 0, 1], gl.FLOAT, size*9];
      case gl.FLOAT_MAT4: return [[1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1], gl.FLOAT, size*16];
      case gl.INT_VEC2: return [[0, 0], gl.INT, size*2];
      case gl.INT_VEC3: return [[0, 0, 0], gl.INT, size*2];
      case gl.INT_VEC4: return [[0, 0, 0, 1], gl.INT, size*2];
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
  var get_opt = function(param, deflt) {
    return params && param in params ? params[param] : deflt;
  };

  var enables = get_opt('enables', []);
  var disables = get_opt('disables', []);

  for (var e of enables) {
    gl.enable(e);
  }

  for (var d of disables) {
    gl.disable(d);
  }

  if (this.program) {
    var gl = this.gl;
    var canvas = this.canvas;

    gl.useProgram(this.program);

    for (var u in this.uniforms) {
      var uval = this.uniforms[u];
      var value = u in params ? params[u] : this.infos[u][0];
      var loc = uval.loc;
      switch (uval.autype) {
        case gl.FLOAT: gl.uniform1f(loc, value); break;
        case gl.FLOAT_VEC2: gl.uniform2f(loc, value[0], value[1]); break;
        case gl.FLOAT_VEC3: gl.uniform3f(loc, value[0], value[1], value[2]); break;
        case gl.FLOAT_VEC4: gl.uniform4f(loc, value[0], value[1], value[2], value[3]); break;
        case gl.FLOAT_MAT2: gl.uniformMatrix2fv(loc, false, value); break;
        case gl.FLOAT_MAT3: gl.uniformMatrix3fv(loc, false, value); break;
        case gl.FLOAT_MAT4: gl.uniformMatrix4fv(loc, false, value); break;
        case gl.INT: gl.uniform1i(loc, value); break;
        case gl.INT_VEC2: gl.uniform2i(loc, value[0], value[1]); break;
        case gl.INT_VEC3: gl.uniform3i(loc, value[0], value[1], value[2]); break;
        case gl.INT_VEC4: gl.uniform4i(loc, value[0], value[1], value[2], value[3]); break;
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
      gl.vertexAttribPointer(val.loc, val.size, val.type, val.normalized, val.stride, 0);
      gl.enableVertexAttribArray(val.loc);
    }
    
    var num_indices = params.indices ? params.indices.length : 3;
    var ibo = canvas.get_ibo(params.indices);
    if (ibo) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    }

    var primitive  = get_opt('primitive', gl.TRIANGLES);
    gl.drawElements(primitive, num_indices, gl.UNSIGNED_SHORT, 0);

    for (var a in this.attributes) {
      gl.disableVertexAttribArray(this.attributes[a].loc);
    }
  }
};

Shader.default_material = function(dict) {
  var params = {
    ambient: [0.4, 0.4, 0.4],
    diffuse: [0.5, 0.5, 0.5],
    specular: [0.5, 0.5, 0.5],
    shininess: 10,
    alpha: 1.0,
    model_to_world: mat4.create(),

    // will be machine generated
    light_pos: [3, 0, 0],
    view_pos: [0, 0, 3],
    model_to_perspective: [1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1]
  };
  
  if (!dict) return params;
  
  for (var name in params) {
    dict[name] = params[name];
  }
  
  return dict;
}

function ObjFile(canvas, url, callback) {
  var vals;
  var scene = {};
  var obj_num = 0;

  function reset() {
    vals = { name: 'unnamed.' + obj_num++, v: [], vt: [], vp: [], vn: [], f: [], u: {}, ua: [] };
  }
  
  function make_model() {
    if (vals.v.length == 0) return;
    
    var pos = [];
    var uvs = [];
    var normals = [];
    var ua = vals.ua;
    var v_size = vals.v_size;
    for (var i = 0; i != ua.length; ++i) {
      var v = ua[i];
      var r = /(\d*)\/?(\d*)\/?(\d*)/.exec(v);
      var vi = parseInt(r[1])-1;
      pos.push(vals.v[vi*3+0]);
      pos.push(vals.v[vi*3+1]);
      pos.push(vals.v[vi*3+2]);
      if (r[2] != "") {
        var vti = parseInt(r[2])-1;
        uvs.push(vals.vt[vti*2+0]);
        uvs.push(vals.vt[vti*2+1]);
      }
      if (r[3] != "") {
        var vni = parseInt(r[3])-1;
        normals.push(vals.vn[vni*3+0]);
        normals.push(vals.vn[vni*3+1]);
        normals.push(vals.vn[vni*3+2]);
      }
    }

    var params = {
      pos: new Float32Array(pos),
      indices: new Uint16Array(vals.f),
    };
    
    Shader.default_material(params);

    if (uvs.length) {
      params.uv = new Float32Array(uvs);
    }
    if (normals.length) {
      params.normal = new Float32Array(normals);
    }
    scene[vals.name] = params;
  }
  
  var http = new XMLHttpRequest();
  http.onreadystatechange = function() {
    if (http.readyState == 4 && http.status == 200) {
      var lines = http.responseText.split("\n");
      var num_lines = lines.length;
      var line = 0;
      reset();
      while (line < num_lines) {
        var cur = lines[line++];
        if (cur[0] == '#' || cur == '') continue;
        var s = cur.split(/\s+/);
        switch (s[0]) {
          case '#': break;
          case 'o': {
            make_model();
            reset();
            vals.name = s[1];
          } break;
          case 'v': case 'vt': case 'vn': {
            var v = vals[s[0]];
            if (v.length == 0) vals[s[0]+'_size'] = s.length-1;
            v.push(parseFloat(s[1]));
            if (s.length > 2) v.push(parseFloat(s[2]));
            if (s.length > 3) v.push(parseFloat(s[3]));
          } break;
          case 'f': {
            //for (var i = 1; i != s.length; ++i) {
            for (var i = 1; i != 4; ++i) {
              if (!vals.u[s[i]]) {
                vals.u[s[i]] = vals.ua.length;
                vals.ua.push(s[i]);
              }
              vals.f.push(vals.u[s[i]]);
            }
            break;
          }
        }
      }
      make_model();

      callback(scene);
    }
  }
  http.open("GET", url, true);
  http.send();
}

// See mesh.hpp in glslmath
function BinFile(canvas, url, callback) {
  var http = new XMLHttpRequest();
  http.responseType = 'arraybuffer';
  
  var pos = 0;
  var u8;
  var u16;
  var u32;
  var f32;
  var attr_name;
  var params = {};
  var mesh_name;
  var scene = {};

  function read_str() {
    var res = "";
    while (u8[pos]) {
      res += String.fromCharCode(u8[pos++]);
    }
    pos++;
    while (pos & 3) pos++;
    return res;
  }
  
  function read_u32() { var res = u32[pos/4]; pos += 4; return res; }

  function read_chunk() {
    var tag = read_str();
    var len = read_u32();
    var end = pos + len - 4;
    console.log(tag);
    if (tag < 'a') {
      switch (tag) {
        case 'MSH': {
          params = {};
        } break;
      }
      while (pos < end) {
        read_chunk();
      }
      switch (tag) {
        case 'MSH': {
          Shader.default_material(params);
          scene[mesh_name] = params;
        } break;
      }
    } else {
      switch (tag) {
        case 'msh': {
          mesh_name = read_str();
        } break;
        case 'ix2': {
          params.indices = new Uint16Array(u16.slice(pos/2, end/2));
        } break;
        case 'ix4': {
          params.indices = new Uint16Array(u32.slice(pos/4, end/4).values());
        } break;
        case 'atn': {
          attr_name = read_str();
          console.log("attr=" + attr_name);
        } break;
        case 'a3f': {
          params[attr_name] = new Float32Array(f32.slice(pos/4, end/4));
          console.log("len=" + params[attr_name].length);
        } break;
      }
    }
    pos = (end + 3) & -4;
  }
  
  http.onreadystatechange = function() {
    if (http.readyState == 4 && http.status == 200) {
      u8 = new Uint8Array(http.response);
      u16 = new Uint16Array(http.response);
      u32 = new Uint32Array(http.response);
      f32 = new Float32Array(http.response);
      read_chunk();
      callback(scene);
    }
  };
  http.open("GET", url, true);
  http.send();
}

function Camera(canvas) {
  this.model_to_world = mat4.create();
  this.znear =  0.1;
  this.zfar = 1000;
  this.yfov = 90 * (3.141592653/180);
  this.canvas = canvas;
  this.world_to_camera = mat4.create();
  this.aspect = canvas.canvas.width / canvas.canvas.height;
  this.camera_to_perspective = mat4.create();
  this.model_to_perspective = mat4.create();
  this.model_to_camera = mat4.create();
}

Camera.prototype.update = function() {
  mat4.invert(this.world_to_camera, this.model_to_world);
  mat4.perspective(this.camera_to_perspective, this.yfov, this.aspect, this.znear, this.zfar);
}

Camera.prototype.translate = function(v) {
  mat4.translate(this.model_to_world, this.model_to_world, v);
}

Camera.prototype.set_params = function(params) {
  this.update();
  mat4.multiply(this.model_to_camera, this.world_to_camera, params.model_to_world);
  mat4.multiply(params.model_to_perspective, this.camera_to_perspective, this.model_to_camera);

  var tmp = vec3.create();
  vec3.transformMat4(tmp, [0, 0, 0], params.model_to_perspective)
  console.log("params.model_to_perspective [0, 0, 0] = " + tmp);
}

