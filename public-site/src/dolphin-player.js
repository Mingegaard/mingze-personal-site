import filmUrl from './assets/dolphin/ocean.mp4';
import stillUrl from './assets/dolphin/still.webp';
import lettersUrl from './assets/dolphin/glyphs.png';
import focus from './assets/dolphin/focus.json';
import media from './assets/dolphin/media.json';
import fragmentSource from './dolphin-ascii.frag?raw';

const vertexSource = `
attribute vec2 a_position;
varying vec2 v_screen;
void main() {
  v_screen = vec2(a_position.x*.5+.5, .5-a_position.y*.5);
  gl_Position = vec4(a_position, 0., 1.);
}`;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function camera(width, height, time) {
  const aspect = width / height;
  const sourceAspect = 16 / 9;
  const sourceTime = (time + media.sourceStart) % media.sourceDuration;
  const position = Math.min(focus.points.length - 1, sourceTime / focus.step);
  const first = Math.floor(position);
  const a = focus.points[first];
  const b = focus.points[Math.min(first + 1, focus.points.length - 1)];
  const fraction = position - first;
  const mix = (x, y, t) => x + (y - x) * t;
  const x = mix(a[0], b[0], fraction);
  const y = mix(a[1], b[1], fraction);
  const dolphinWidth = mix(a[2], b[2], fraction);

  // On a phone the shot must accommodate a whole dolphin and its lead room.
  // Narrowing a window crops around the animal; the character grid never shrinks.
  const narrow = clamp((1.65 - aspect) / .75, 0, 1);
  const spanX = Math.min(1, Math.max(Math.min(1, aspect/sourceAspect), narrow * dolphinWidth * 1.48));
  const spanY = spanX * sourceAspect / aspect;
  const left = clamp(mix((1-spanX)/2, x - .58*spanX, narrow), 0, 1-spanX);
  const subjectY = mix(.455, y, narrow);
  const top = clamp(subjectY - .218*spanY, -.27, .36);
  return [left, top, spanX, spanY];
}

function createRenderer(gl) {
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }
  const program = gl.createProgram();
  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(message);
  }
  gl.useProgram(program);
  const corners = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const attr = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(attr);
  gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);
  const uniforms = Object.fromEntries(['scene','letters','view','cell','origin','span','night'].map(
    name => [name, gl.getUniformLocation(program, 'u_' + name)]
  ));

  function texture(unit, uniform) {
    const handle = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, handle);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(uniform, unit);
    return handle;
  }
  const picture = texture(0, uniforms.scene);
  const alphabet = texture(1, uniforms.letters);
  let previousSource;
  let previousTime;
  function upload(unit, source) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }
  return {
    setLetters(image) { upload(1, image); },
    draw(canvas, source, time, night) {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2300000/(width*height)));
      const w = Math.max(1, Math.round(width*ratio));
      const h = Math.max(1, Math.round(height*ratio));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      if (source !== previousSource || time !== previousTime) {
        upload(0, source);
        previousSource = source;
        previousTime = time;
      }
      const cell = clamp(6.65 + (width - 520) / 1100, 6.5, 7.5);
      const [left, top, spanX, spanY] = camera(width, height, time);
      gl.uniform2f(uniforms.view, width, height);
      gl.uniform2f(uniforms.cell, cell, cell*1.5);
      gl.uniform2f(uniforms.origin, left, top);
      gl.uniform2f(uniforms.span, spanX, spanY);
      gl.uniform1f(uniforms.night, night ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    destroy() {
      gl.deleteTexture(picture);
      gl.deleteTexture(alphabet);
      gl.deleteBuffer(corners);
      gl.deleteProgram(program);
    },
  };
}

export function mountDolphinPlayer(canvas) {
  const gl = canvas.getContext('webgl', { alpha:false, depth:false, stencil:false, antialias:false, powerPreference:'low-power' });
  if (!gl) return { setTheme() {}, destroy() {} };
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection;
  const video = document.createElement('video');
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'none';
  const still = new Image();
  const letters = new Image();
  let renderer;
  let assetsReady = false;
  let destroyed = false;
  let dark = false;
  let callback = null;
  let hasVideoFrame = false;
  let frameTime = 0;

  const reduced = () => motion.matches || connection?.saveData;
  function paint() {
    if (destroyed || !renderer || !assetsReady || document.hidden) return;
    const film = hasVideoFrame && !reduced() && video.readyState >= 2;
    renderer.draw(canvas, film ? video : still, film ? frameTime : 0, dark);
    canvas.setAttribute('data-playing', '');
  }
  function stopFrames() {
    if (callback === null) return;
    if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(callback);
    else cancelAnimationFrame(callback);
    callback = null;
  }
  function nextFrame() {
    if (callback !== null || video.paused || document.hidden || destroyed || !renderer) return;
    function show(time) {
      callback = null;
      if (destroyed || document.hidden || video.paused) return;
      if (video.readyState >= 2 && (!hasVideoFrame || time !== frameTime)) {
        hasVideoFrame = true;
        frameTime = time;
        paint();
      }
      nextFrame();
    }
    callback = video.requestVideoFrameCallback
      ? video.requestVideoFrameCallback((_, metadata) => show(metadata.mediaTime))
      : requestAnimationFrame(() => show(video.currentTime));
  }
  function playback() {
    stopFrames();
    if (destroyed) return;
    if (reduced()) {
      video.pause();
      hasVideoFrame = false;
      if (video.hasAttribute('src')) {
        video.removeAttribute('src');
        video.load();
      }
      paint();
    } else if (!renderer || document.hidden) {
      video.pause();
    } else if (assetsReady && document.readyState === 'complete') {
      paint();
      if (!video.hasAttribute('src')) video.src = filmUrl;
      video.play().then(nextFrame).catch(() => {}); // The themed still covers autoplay restrictions.
    }
  }
  function initialise() {
    try {
      renderer = createRenderer(gl);
      if (assetsReady) renderer.setLetters(letters);
    } catch {
      renderer = null; // The native poster is already visible.
    }
    paint();
    playback();
  }
  function contextLost(event) {
    event.preventDefault();
    renderer = null;
    canvas.removeAttribute('data-playing');
    playback();
  }
  function failedVideo() {
    hasVideoFrame = false;
    stopFrames();
    paint();
  }
  const resize = new ResizeObserver(paint);
  resize.observe(canvas);
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('webglcontextrestored', initialise);
  document.addEventListener('visibilitychange', playback);
  motion.addEventListener('change', playback);
  connection?.addEventListener('change', playback);
  window.addEventListener('load', playback, {once:true});
  video.addEventListener('playing', nextFrame);
  video.addEventListener('error', failedVideo);

  initialise();
  if (renderer) {
    still.src = stillUrl;
    letters.src = lettersUrl;
    Promise.all([still.decode(), letters.decode()]).then(() => {
      if (destroyed) return;
      assetsReady = true;
      renderer?.setLetters(letters);
      paint();
      playback();
    }).catch(() => {});
  }
  return {
    setTheme(value) { dark = value; paint(); },
    destroy() {
      destroyed = true;
      stopFrames();
      resize.disconnect();
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('webglcontextrestored', initialise);
      document.removeEventListener('visibilitychange', playback);
      motion.removeEventListener('change', playback);
      connection?.removeEventListener('change', playback);
      window.removeEventListener('load', playback);
      video.removeEventListener('playing', nextFrame);
      video.removeEventListener('error', failedVideo);
      video.pause();
      video.removeAttribute('src');
      video.load();
      renderer?.destroy();
    },
  };
}
