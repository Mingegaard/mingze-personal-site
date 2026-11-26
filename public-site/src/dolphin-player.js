import { mountGlyphStill } from './dolphin-still.js';
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
const mix = (a, b, fraction) => a + (b - a) * fraction;

// Compose the whole loop around the dolphin in the opening frame.
const openingPosition = Math.min(media.sourceStart / focus.step, focus.points.length - 1);
const openingIndex = Math.floor(openingPosition);
const openingStart = focus.points[openingIndex];
const openingEnd = focus.points[Math.min(openingIndex + 1, focus.points.length - 1)];
const [openingX, openingY, openingWidth] = openingStart.map((value, i) =>
  mix(value, openingEnd[i], openingPosition - openingIndex)
);

function characterSpacing(width) {
  const column = clamp(5.8 + (width - 520) / 3100, 5.75, 6.15);
  return [column, column * 1.42];
}

function camera(width, height, contentWidth = width) {
  const visibleWidth = clamp(contentWidth, 1, width);
  const aspect = visibleWidth / height;
  const sourceAspect = 16 / 9;

  // A landscape page shows the entire source width alongside the navigation.
  // In portrait, keep the opening animal and its lead room in the visible column.
  const landscape = clamp((width / height - 1) / .35, 0, 1);
  const portraitWidth = openingWidth * Math.max(1.22, 1.48 * visibleWidth / width);
  const visibleSpan = mix(Math.min(1, Math.max(aspect / sourceAspect, portraitWidth)), 1, landscape);
  const targetX = .63 - .14*openingX;
  const visibleLeft = clamp(openingX - targetX*visibleSpan, 0, 1-visibleSpan);

  // Extend the same projection under the sidebar. The scene sampler reflects
  // any coordinates beyond the left source edge back into the adjacent water.
  const spanX = visibleSpan * width / visibleWidth;
  const left = visibleLeft - (spanX - visibleSpan);
  const spanY = visibleSpan * sourceAspect / aspect;
  const subjectY = mix(openingY, mix(.455, openingY, .8), landscape);
  const top = clamp(subjectY - .244*spanY, -.27, .45);
  return [left, top, spanX, spanY];
}

function createRenderer(gl, content) {
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
  let layoutWidth = 0;
  let layoutHeight = 0;
  let layoutContentWidth = 0;
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
      const contentWidth = content?.clientWidth || width;
      if (width !== layoutWidth || height !== layoutHeight || contentWidth !== layoutContentWidth) {
        const [column, row] = characterSpacing(width);
        const [left, top, spanX, spanY] = camera(width, height, contentWidth);
        gl.uniform2f(uniforms.view, width, height);
        gl.uniform2f(uniforms.cell, column, row);
        gl.uniform2f(uniforms.origin, left, top);
        gl.uniform2f(uniforms.span, spanX, spanY);
        layoutWidth = width;
        layoutHeight = height;
        layoutContentWidth = contentWidth;
      }
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
  const content = document.getElementById('site-content');
  const gl = canvas.getContext('webgl', { alpha:true, premultipliedAlpha:false, depth:false, stencil:false, antialias:false, powerPreference:'low-power' });
  if (!gl) return mountGlyphStill(canvas, stillUrl, camera, characterSpacing, content);
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

  let fallback;
  function showFallback() {
    canvas.removeAttribute('data-playing');
    if (destroyed || fallback) return;
    const surface = document.createElement('canvas');
    canvas.after(surface);
    const portrait = mountGlyphStill(surface, stillUrl, camera, characterSpacing, content);
    fallback = { surface, portrait };
    portrait.setTheme(dark);
  }
  function clearFallback() {
    if (!fallback) return;
    fallback.portrait.destroy();
    fallback.surface.remove();
    fallback = null;
  }
  const reduced = () => motion.matches || connection?.saveData;
  function paint() {
    if (destroyed || !renderer || !assetsReady || document.hidden) return;
    const film = hasVideoFrame && !reduced() && video.readyState >= 2;
    renderer.draw(canvas, film ? video : still, film ? frameTime : 0, dark);
    canvas.setAttribute('data-playing', '');
    clearFallback();
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
      renderer = createRenderer(gl, content);
      if (assetsReady) renderer.setLetters(letters);
    } catch {
      renderer = null;
      showFallback();
    }
    paint();
    playback();
  }
  function contextLost(event) {
    event.preventDefault();
    renderer = null;
    showFallback();
    playback();
  }
  function failedVideo() {
    hasVideoFrame = false;
    stopFrames();
    paint();
  }
  const resize = new ResizeObserver(paint);
  resize.observe(canvas);
  if (content) resize.observe(content);
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
    }).catch(showFallback);
  }
  return {
    setTheme(value) { dark = value; fallback?.portrait.setTheme(value); paint(); },
    destroy() {
      destroyed = true;
      clearFallback();
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
