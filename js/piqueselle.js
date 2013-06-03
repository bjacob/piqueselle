(function(window) {

  function is_power_of_2(n) {
    return !!((n != 0) && ((n & (n - 1)) == 0));
  };

  var nextSceneId = 0;
  function Scene(context, atlas, planes) {
    var gl = context.gl;
    var id = nextSceneId++;

    var vertexShaderString =
      '\n\
      attribute vec2 vertexPosition; \n\
        void main(void) { \n\
        gl_Position = vec4(vertexPosition, 0.0, 1.0); \n\
      } \n\
      \n';

    var fragmentShaderString =
      '\n\
      precision mediump float; \n\
      void blend(vec4 src, inout vec4 dst) { \n\
        // http://developer.download.nvidia.com/SDK/10/opengl/src/dual_depth_peeling/doc/DualDepthPeeling.pdf \n\
        dst.rgb = (dst.a * src.a) * src.rgb + dst.rgb; \n\
        dst.a = (1.0 - src.a) * dst.a; \n\
      } \n\
      \n\
      uniform float inverseZoom; \n\
      uniform vec3 cameraPos; \n\
      \n\
      %GLOBALS% \n\
      \n\
      vec4 resultColor = vec4(0.0, 0.0, 0.0, 1.0); \n\
      vec4 color; \n\
      \n\
      void main(void) { \n\
        \n\
        %MAIN% \n\
        \n\
        gl_FragColor = vec4(resultColor.rgb, 1.0); \n\
      } \n\
      \n';

    var fragmentShaderGlobals = [atlas.fragmentShaderGlobals];
    var fragmentShaderMain = [];

    planes.forEach(function(plane) {
      fragmentShaderGlobals.push(plane.fragmentShaderGlobals);
      fragmentShaderMain.push(plane.fragmentShaderMain);
    });

    fragmentShaderString = fragmentShaderString.replace("%GLOBALS%", fragmentShaderGlobals.join(''));
    fragmentShaderString = fragmentShaderString.replace("%MAIN%", fragmentShaderMain.join(''));

    // console.log('fragment shader: ' + fragmentShaderString);

    var vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexShaderString);
    gl.compileShader(vertexShader);

    var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentShaderString);
    gl.compileShader(fragmentShader);

    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    gl.bindAttribLocation(program, context.vertexPositionAttrLoc, "vertexPosition");

    gl.linkProgram(program);

    // Shader uniform locations
    var uniformLocations = {
      'cameraPos': gl.getUniformLocation(program, "cameraPos"),
      'inverseZoom': gl.getUniformLocation(program, "inverseZoom"),
    };

    this.atlas = atlas;
    this.planes = planes;
    this.program = program;
    this.id = id;
    this.uniformLocations = uniformLocations;
  };

  function Camera(position, zoom) {
    this.x = position[0] || 0;
    this.y = position[1] || 0;
    this.zoom = zoom || 4;
  };

  function Renderer(context) {
    var gl = context.gl;

    var vertexPositionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositionBuffer);
    var vertices = [ -1,  -1,
                     -1,   1,
                      1,  -1,
                      1,   1 ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.vertexAttribPointer(context.vertexPositionAttrLoc, 2, gl.FLOAT, false, 0, 0);

    this.context = context;
  };
  Renderer.prototype.render = function render(scene, camera) {
    var gl = this.context.gl;
    var program = scene.program;
    var nextTextureUnit = 0;

    gl.useProgram(program);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    // Set camera position
    gl.uniform3f(scene.uniformLocations['cameraPos'], camera.x, camera.y, 0);
    gl.uniform1f(scene.uniformLocations['inverseZoom'], 1/camera.zoom);

    // Bind to texture units
    nextTextureUnit = scene.atlas.bindTextures(program, nextTextureUnit);

    var textureLocations;
    var planes = scene.planes;
    planes.forEach(function(plane) {
      nextTextureUnit = plane.bindTextures(program, nextTextureUnit);
      plane.prepare(program);
    });

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  function TextureAtlas(context, options) {
    options = options || {};

    if(!options.hasOwnProperty('atlas')) {
      throw new Error('missing atlas');
    }

    var gl = context.gl;
    var atlas = options['atlas'];
    var atlasFormat = options['atlasFormat'] || 'RGBA';
    var atlasType = options['atlasType'] || 'UNSIGNED_SHORT_4_4_4_4';

    var tileSize = options['tileSize'] || 16;

    var atlasTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
    if(atlas instanceof HTMLImageElement) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl[atlasFormat],
        gl[atlasFormat], gl[atlasType], atlas);
    } else {
      if(!atlas.hasOwnProperty('data')) {
        throw new Error('missing atlas data');
      } else if(!atlas.hasOwnProperty('width')) {
        throw new Error('missing atlas width');
      } else if(!atlas.hasOwnProperty('height')) {
        throw new Error('missing atlas height');
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl[atlasFormat],
        atlas['width'], atlas['height'], 0, gl[atlasFormat], gl[atlasType], atlas['data']);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    var fragmentShaderGlobals =
    '\n\
      uniform sampler2D atlasSampler; \n\
      const vec2 atlasSize = vec2(' + atlas['width']/tileSize + ', ' + atlas['height']/tileSize + '); \n\
      const vec2 inverseTileSize = vec2(' + 1/tileSize + ', ' + 1/tileSize + '); \n\
    \n';

    this.context = context;
    this.atlasTexture = atlasTexture;
    this.fragmentShaderGlobals = fragmentShaderGlobals;
  };
  TextureAtlas.prototype.bindTextures = function bindTextures(program, nextTextureUnit) {
    var gl = this.context.gl;

    gl.activeTexture(gl.TEXTURE0 + nextTextureUnit);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    gl.uniform1i(gl.getUniformLocation(program, 'atlasSampler'), nextTextureUnit);

    ++ nextTextureUnit;

    return nextTextureUnit;
  };

  var nextTilePlaneId = 0;
  function TilePlane(context, options) {
    options = options || {};

    if(!options.hasOwnProperty('map')) {
      throw new Error('missing map');
    }

    var gl = context.gl;
    var map = options['map'];
    var format = options['format'] || 'LUMINANCE_ALPHA';
    var type = options['type'] || 'UNSIGNED_BYTE';
    var horizontalWrapMode = options['horizontalWrapMode'] || 'CLAMP_TO_EDGE';
    var verticalWrapMode = options['verticalWrapMode'] || 'CLAMP_TO_EDGE';
    var name = options['name'] || 'TilePlane' + (nextTilePlaneId++);
    var position = options['position'] || [0.0, 0.0, 0.0];

    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if(map instanceof HTMLImageElement) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl[format],
        gl[format], gl[type], map);
    } else {
      if(!map.hasOwnProperty('data')) {
        throw new Error('missing map data');
      } else if(!map.hasOwnProperty('width')) {
        throw new Error('missing map width');
      } else if(!map.hasOwnProperty('height')) {
        throw new Error('missing map height');
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl[format],
        map['width'], map['height'], 0, gl[format], gl[type], map['data']);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, horizontalWrapMode);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, verticalWrapMode);

    var fragmentShaderGlobals =
    '\n\
      uniform sampler2D ' + name + 'Sampler; \n\
      uniform vec3 ' + name + 'Pos; \n\
    \n';


    // FIXME: cull the plane if it's behind the camera?
    var fragmentShaderMain =
    '\n\
      { // ' + name + '\n\
        const vec2 planeSize = vec2(' + map['width'] + ', ' + map['height'] + '); \n\
        vec3 planePos = ' + name + 'Pos; \n\
        vec2 fragPos = gl_FragCoord.xy * inverseZoom + cameraPos.xy / (cameraPos.z - planePos.z); \n\
        vec2 fractionalTileInPlane = (fragPos - planePos.xy) * inverseTileSize; \n\
        vec2 tileInPlane = floor(fractionalTileInPlane); \n\
        vec2 atlasCoordForPlane = floor(256.0 * texture2D(' + name + 'Sampler, tileInPlane / planeSize).ra); \n\
        vec2 texCoordInTile = fractionalTileInPlane - tileInPlane; \n\
        color = texture2D(atlasSampler, (atlasCoordForPlane + vec2(texCoordInTile.x, 1.0 - texCoordInTile.y)) / atlasSize); \n\
        blend(color, resultColor); \n\
        if (resultColor.a == 0.0) { \n\
          gl_FragColor = vec4(resultColor.rgb, 1.0); \n\
          return; \n\
        } \n\
      } // ' + name + '\n\
    \n';

    this.context = context;
    this.texture = texture;
    this.name = name;
    this.position = position;
    this.fragmentShaderGlobals = fragmentShaderGlobals;
    this.fragmentShaderMain = fragmentShaderMain;
  };
  TilePlane.prototype.bindTextures = function bindTextures(program, nextTextureUnit) {
    var gl = this.context.gl;

    gl.activeTexture(gl.TEXTURE0 + nextTextureUnit);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(gl.getUniformLocation(program, this.name + 'Sampler'), nextTextureUnit);

    return ++ nextTextureUnit;
  };
  TilePlane.prototype.prepare = function prepare(program) {
    var gl = this.context.gl;

    gl.uniform3f(gl.getUniformLocation(program, this.name + 'Pos'), this.position[0], this.position[1], this.position[2]);
  };

  function Context(canvasElement) {
    var glOptions = {
      antialias: false,
      depth: false,
      alpha: false
    };
    var gl = canvasElement.getContext('experimental-webgl', glOptions);
    var vertexPositionAttrLoc = 0;

    gl.enableVertexAttribArray(vertexPositionAttrLoc);
    gl.disable(gl.CULL_FACE);

    this.canvas = canvasElement;
    this.gl = gl;
    this.Renderer = Renderer.bind(undefined, this);
    this.Scene = Scene.bind(undefined, this);
    this.TextureAtlas = TextureAtlas.bind(undefined, this);
    this.TilePlane = TilePlane.bind(undefined, this);
    this.Camera = Camera.bind(undefined, this);
    this.vertexPositionAttrLoc = vertexPositionAttrLoc;
  };
  Context.prototype.resize = function resize() {
    var canvas = this.canvas;
    var gl = this.gl;

    if (canvas.width != canvas.clientWidth ||
          canvas.height != canvas.clientHeight)
      {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
      }
  };

  window.Piqueselle = {
    Context: Context,
  };

}(window));