(function(window) {

  function is_power_of_2(n) {
    return !!((n != 0) && ((n & (n - 1)) == 0));
  };

  var nextSceneId = 0;
  function Scene(context, atlas, planes, options) {
    options = options || {};

    this.backgroundColor = options.backgroundColor || [0, 0, 0];

    var gl = context.gl;
    var id = nextSceneId++;

    var spriteVertexShaderString =
      '\n\
      precision highp int; \n\
      uniform vec4 sprites[1]; \n\
      uniform vec3 cameraPos; \n\
      uniform float inverseZoom; \n\
      uniform vec2 halfScreenSize; \n\
      attribute vec2 vertexPos; \n\
      varying vec2 texAtlasCoord; \n\
      varying vec2 fragPos; \n\
      \n\
      %GLOBALS% \n\
      \n\
      void main(void) { \n\
        texAtlasCoord.x = float(sprites[0].x); \n\
        texAtlasCoord.y = float(sprites[0].y); \n\
        fragPos = clamp((1.0 - inverseZoom * inverseTileSize) - vertexPos, 0.0, 1.0); \n\
        float x = floor((vertexPos.x/inverseTileSize.x + sprites[0].z - cameraPos.x) / inverseZoom) / halfScreenSize.y; \n\
        float y = floor((vertexPos.y/inverseTileSize.y + sprites[0].w - cameraPos.y) / inverseZoom) / halfScreenSize.y; \n\
        gl_Position = vec4(x, y, 0.0, 1.0); \n\
      } \n\
      \n';

    var spriteFragmentShaderString =
      '\n\
      precision mediump float; \n\
      varying vec2 texAtlasCoord; \n\
      varying vec2 fragPos; \n\
      \n\
      %GLOBALS% \n\
      \n\
      void main(void) { \n\
        gl_FragColor = texture2D(atlasSampler, (texAtlasCoord + fragPos)/atlasSize); \n\
      } \n\
      \n';

    var rayVertexShaderString =
      '\n\
      attribute vec2 vertexPosition; \n\
      void main(void) { \n\
        gl_Position = vec4(vertexPosition, 0.0, 1.0); \n\
      } \n\
      \n';

    var rayFragmentShaderString =
      '\n\
      precision mediump float; \n\
      void blend(vec4 src, inout vec4 dst) { \n\
        // http://developer.download.nvidia.com/SDK/10/opengl/src/dual_depth_peeling/doc/DualDepthPeeling.pdf \n\
        dst.rgb = (dst.a * src.a) * src.rgb + dst.rgb; \n\
        dst.a = (1.0 - src.a) * dst.a; \n\
      } \n\
      \n\
      uniform float sp_to_bp; \n\
      uniform vec2 camera_pos_at_unit_depth_in_bp; \n\
      uniform vec3 backgroundColor; \n\
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
        // finally, blend resultColor into the backgroundColor and record the resulting fragment color \n\
        gl_FragColor = vec4(resultColor.a * backgroundColor.rgb + resultColor.rgb, 1.0); \n\
      } \n\
      \n';

    var spriteFragmentShaderGlobals = [atlas.fragmentShaderGlobals];
    var spriteVertexShaderGlobals = [atlas.fragmentShaderGlobals];

    var rayFragmentShaderGlobals = [atlas.fragmentShaderGlobals];
    var rayFragmentShaderMain = [];

    planes.forEach(function(plane) {
      rayFragmentShaderGlobals.push(plane.fragmentShaderGlobals);
      rayFragmentShaderMain.push(plane.fragmentShaderMain);
    });

    spriteFragmentShaderString = spriteFragmentShaderString.replace("%GLOBALS%", spriteFragmentShaderGlobals.join(''));
    spriteVertexShaderString = spriteVertexShaderString.replace("%GLOBALS%", spriteVertexShaderGlobals.join(''));

    rayFragmentShaderString = rayFragmentShaderString.replace("%GLOBALS%", rayFragmentShaderGlobals.join(''));
    rayFragmentShaderString = rayFragmentShaderString.replace("%MAIN%", rayFragmentShaderMain.join(''));

    var printString = rayFragmentShaderString;
    var counter = 0;
    printString.split('\n').forEach(function(line) {
      // console.log(++ counter, line);
    })

    var rayVertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(rayVertexShader, rayVertexShaderString);
    gl.compileShader(rayVertexShader);

    var rayFragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(rayFragmentShader, rayFragmentShaderString);
    gl.compileShader(rayFragmentShader);

    var rayProgram = gl.createProgram();
    gl.attachShader(rayProgram, rayVertexShader);
    gl.attachShader(rayProgram, rayFragmentShader);

    gl.bindAttribLocation(rayProgram, context.vertexPositionAttrLoc, "vertexPosition");

    gl.linkProgram(rayProgram);
/*
    var spriteVertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(spriteVertexShader, spriteVertexShaderString);
    gl.compileShader(spriteVertexShader);

    var spriteFragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(spriteFragmentShader, spriteFragmentShaderString);
    gl.compileShader(spriteFragmentShader);

    var spriteProgram = gl.createProgram();
    gl.attachShader(spriteProgram, spriteVertexShader);
    gl.attachShader(spriteProgram, spriteFragmentShader);

    gl.bindAttribLocation(spriteProgram, context.vertexPositionAttrLoc, "vertexPosition");

    gl.linkProgram(spriteProgram);
*/
    // Shader uniform locations
    var rayProgramUniformLocations = {
      'camera_pos_at_unit_depth_in_bp': gl.getUniformLocation(rayProgram, "camera_pos_at_unit_depth_in_bp"),
      'backgroundColor': gl.getUniformLocation(rayProgram, "backgroundColor"),
      'sp_to_bp': gl.getUniformLocation(rayProgram, "sp_to_bp"),
    };
/*
    var spriteProgramUniformLocations = {
      'sprites': gl.getUniformLocation(spriteProgram, "sprites"),
      'camera_pos_at_unit_depth_in_bp': gl.getUniformLocation(spriteProgram, "camera_pos_at_unit_depth_in_bp"),
      'sp_to_bp': gl.getUniformLocation(spriteProgram, "sp_to_bp"),
      'screen_scale': gl.getUniformLocation(spriteProgram, "screen_scale"),
    };
*/
    this.atlas = atlas;
    this.planes = planes;
    this.rayProgram = rayProgram;
    // this.spriteProgram = spriteProgram;
    this.id = id;
    this.rayProgramUniformLocations = rayProgramUniformLocations;
    // this.spriteProgramUniformLocations = spriteProgramUniformLocations;
    this.backgroundColor = options.backgroundColor;
  };

  function Camera(position, zoom) {
    this.x = position[0] || 0;
    this.y = position[1] || 0;
    this.zoom = zoom || 4;
  };

  function Renderer(context) {
    var gl = context.gl;

    var rayVertexPositionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, rayVertexPositionBuffer);
    var rayVertices = [ -1,  -1,
                        -1,   1,
                         1,  -1,
                         1,   1 ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(rayVertices), gl.STATIC_DRAW);

    var spriteVertexPositionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, spriteVertexPositionBuffer);
    var spriteVertices = [ 0,  0,
                           0,  1,
                           1,  0,
                           1,  1 ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(spriteVertices), gl.STATIC_DRAW);

    this.context = context;
    this.rayVertexPositionBuffer = rayVertexPositionBuffer;
    this.spriteVertexPositionBuffer = spriteVertexPositionBuffer;
  };
  Renderer.prototype.render = function render(scene, camera) {
    var renderer = this;
    var gl = this.context.gl;

    function rayRenderPass() {
      var program = scene.rayProgram;
      var nextTextureUnit = 0;

      gl.useProgram(program);

      // Set camera position
      gl.uniform2f(scene.rayProgramUniformLocations['camera_pos_at_unit_depth_in_bp'], camera.x, camera.y, 0);
      gl.uniform1f(scene.rayProgramUniformLocations['sp_to_bp'], 1/camera.zoom);
      gl.uniform3fv(scene.rayProgramUniformLocations['backgroundColor'], scene.backgroundColor);

      // Bind to texture units
      nextTextureUnit = scene.atlas.bindTextures(program, nextTextureUnit);

      var planes = scene.planes;
      planes.forEach(function(plane) {
        nextTextureUnit = plane.bindTextures(program, nextTextureUnit);
        plane.prepare(program);
      });

      gl.bindBuffer(gl.ARRAY_BUFFER, renderer.rayVertexPositionBuffer);
      gl.vertexAttribPointer(renderer.context.vertexPositionAttrLoc, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    function spriteRenderPass() {
      var program = scene.spriteProgram;
      var nextTextureUnit = 0;

      gl.useProgram(program);

      // Set camera position
      gl.uniform3f(scene.spriteProgramUniformLocations['cameraPos'], camera.x, camera.y, 0);
      gl.uniform1f(scene.spriteProgramUniformLocations['inverseZoom'], 1/camera.zoom);
      gl.uniform2f(scene.spriteProgramUniformLocations['halfScreenSize'], gl.drawingBufferWidth/2, gl.drawingBufferHeight/2);

      // Bind to texture units
      nextTextureUnit = scene.atlas.bindTextures(program, nextTextureUnit);

      var planes = scene.planes;
      planes.forEach(function(plane) {
        if(plane instanceof SpritePlane) {
          gl.uniform4fv(scene.spriteProgramUniformLocations['sprites'], plane.data);
          gl.bindBuffer(gl.ARRAY_BUFFER, renderer.spriteVertexPositionBuffer);
          gl.vertexAttribPointer(renderer.context.vertexPositionAttrLoc, 2, gl.FLOAT, false, 0, 0);

          // Render to sprite plane texture
          gl.bindFramebuffer(gl.FRAMEBUFFER, plane.framebuffer);
          gl.clear(gl.COLOR_BUFFER_BIT);

          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
      });

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    // spriteRenderPass();
    rayRenderPass();
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
      const vec2 bp_to_tiles = vec2(' + 1/tileSize + ', ' + 1/tileSize + '); \n\
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

  var nextPlaneId = 0;

  function SpritePlane(context, options) {
    options = options || {};

    var gl = context.gl;
    var data = options['data'];

    var name = options['name'] || 'SpritePlane' + (nextPlaneId++);
    var position = options['position'] || [0.0, 0.0, 0.0];
    var horizontalWrapMode = options['horizontalWrapMode'] || 'CLAMP_TO_EDGE';
    var verticalWrapMode = options['verticalWrapMode'] || 'CLAMP_TO_EDGE';

    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl['RGBA'],
      gl.drawingBufferWidth, gl.drawingBufferHeight, 0, gl['RGBA'], gl['UNSIGNED_SHORT_4_4_4_4'], null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl[horizontalWrapMode]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl[verticalWrapMode]);

    var framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var fragmentShaderGlobals =
    '\n\
      uniform sampler2D ' + name + 'Sampler; \n\
      uniform vec3 ' + name + 'Pos; \n\
    \n';

    var fragmentShaderMain =
    '\n\
      { // ' + name + '\n\
        color = texture2D(' + name + 'Sampler, gl_FragCoord.xy/256.0); \n\
        blend(color, resultColor); \n\
        if (resultColor.a == 0.0) { \n\
          gl_FragColor = vec4(resultColor.rgb, 1.0); \n\
          return; \n\
        } \n\
      } // ' + name + '\n\
    \n';

    this.context = context;
    this.name = name;
    this.position = position;
    this.data = data;
    this.texture = texture;
    this.framebuffer = framebuffer;
    this.fragmentShaderGlobals = fragmentShaderGlobals;
    this.fragmentShaderMain = fragmentShaderMain;
  };
  SpritePlane.prototype.bindTextures = function bindTextures(program, nextTextureUnit) {
    var gl = this.context.gl;

    gl.activeTexture(gl.TEXTURE0 + nextTextureUnit);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(gl.getUniformLocation(program, this.name + 'Sampler'), nextTextureUnit);

    return ++ nextTextureUnit;
  };
  SpritePlane.prototype.prepare = function prepare(program) {
    var gl = this.context.gl;

    gl.uniform3f(gl.getUniformLocation(program, this.name + 'Pos'), this.position[0], this.position[1], this.position[2]);
  };

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
    var name = options['name'] || 'TilePlane' + (nextPlaneId++);
    var position = options['position'] || [0.0, 0.0];
    var depth = options['depth'] || -1.0;

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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl[horizontalWrapMode]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl[verticalWrapMode]);

    var fragmentShaderGlobals =
    '\n\
      uniform sampler2D ' + name + 'Sampler; \n\
      uniform vec2 ' + name + 'Pos; \n\
      uniform float ' + name + 'Depth; \n\
    \n';


    // FIXME: cull the plane if it's behind the camera?
    var fragmentShaderMain =
    '\n\
      { // ' + name + '\n\
        const vec2 plane_size_in_tiles = vec2(' + map['width'] + ', ' + map['height'] + '); \n\
        vec2 plane_pos_in_bp = ' + name + 'Pos; \n\
        float plane_depth = ' + name + 'Depth; \n\
        vec2 projected_camera_pos_in_bp = camera_pos_at_unit_depth_in_bp / plane_depth; \n\
        vec2 frag_coord_in_bp = gl_FragCoord.xy * sp_to_bp; \n\
        vec2 frag_pos_in_tiles = (frag_coord_in_bp + projected_camera_pos_in_bp - plane_pos_in_bp) * bp_to_tiles; \n\
        vec2 tile = floor(frag_pos_in_tiles); \n\
        vec2 atlas_coord_in_elements = floor(256.0 * texture2D(' + name + 'Sampler, tile / plane_size_in_tiles).ra); \n\
        %IF_NON_EMPTY_TILE% \n\
        { \n\
          vec2 fractional_part_of_frag_pos_in_tiles = frag_pos_in_tiles - tile; \n\
          color = texture2D(atlasSampler, (atlas_coord_in_elements + vec2(fractional_part_of_frag_pos_in_tiles.x, 1.0 - fractional_part_of_frag_pos_in_tiles.y)) / atlasSize); \n\
          blend(color, resultColor); \n\
          %OPAQUE_PIXELS_OPTIMIZATION% \n\
        } \n\
      } // ' + name + '\n\
    \n';

    // FIXME - these flags should automatically be set to true or false by analyzing the input data
    // (atlas and plane textures). 'true' is at worst slightly slower and generally much faster,
    // so is the sane default.
    var emptyTilesOptimization = true;
    var opaquePixelsOptimization = true;

    var ifNonEmptyTileCode = '';
    if (emptyTilesOptimization) {
      ifNonEmptyTileCode = 'if (atlas_coord_in_elements != vec2(0.0, 0.0))';
    }

    var opaquePixelsOptimizationCode = '';
    if (opaquePixelsOptimization) {
      opaquePixelsOptimizationCode =
      'if (resultColor.a == 0.0) { \n\
         gl_FragColor = vec4(resultColor.rgb, 1.0); \n\
         return; \n\
       }';
    }

    fragmentShaderMain = fragmentShaderMain.replace("%IF_NON_EMPTY_TILE%", ifNonEmptyTileCode);
    fragmentShaderMain = fragmentShaderMain.replace("%OPAQUE_PIXELS_OPTIMIZATION%", opaquePixelsOptimizationCode);

    this.context = context;
    this.texture = texture;
    this.name = name;
    this.position = position;
    this.depth = depth;
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

    gl.uniform2f(gl.getUniformLocation(program, this.name + 'Pos'), this.position[0], this.position[1]);
    gl.uniform1f(gl.getUniformLocation(program, this.name + 'Depth'), this.depth);
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
    this.SpritePlane = SpritePlane.bind(undefined, this);
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