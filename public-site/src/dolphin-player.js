import animation from './assets/dolphins/animation.json';
import lightAtlas from './assets/dolphins/light.png';
import darkAtlas from './assets/dolphins/dark.png';

const chunkUrls = import.meta.glob('./assets/dolphins/*.bin', {
  eager: true, import: 'default', query: '?url&no-inline',
});
const { cols, rows, cellWidth, cellHeight, atlasColumns, fps, chunks } = animation;
const cells = cols * rows;

async function readChunk(chunk, signal) {
  const url = chunkUrls[`./assets/dolphins/${chunk.file}`];
  if (!url) throw new Error('Missing dolphin animation chunk');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Could not load dolphin animation chunk');
  let bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b && bytes[2] === 8) {
    const inflated = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    bytes = new Uint8Array(await new Response(inflated).arrayBuffer());
  }
  if (bytes.length !== chunk.frames * cells) throw new Error('Invalid dolphin frame count');
  // Each chunk starts at a keyframe. Later frames store just their XOR differences.
  for (let i = cells; i < bytes.length; i++) bytes[i] ^= bytes[i - cells];
  return bytes;
}

export function mountDolphinPlayer(canvas) {
  const context = canvas.getContext('2d', { alpha: false });
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection;
  const cache = new Map();
  const displayed = new Uint8Array(cells);
  canvas.width = cols * cellWidth;
  canvas.height = rows * cellHeight;
  let atlasUrl;
  let atlas;
  let paper;
  let chunkIndex = 0;
  let frameIndex = 0;
  let timer;
  let generation = 0;

  function loadChunk(index) {
    if (!cache.has(index)) {
      const abort = new AbortController();
      const entry = { abort, failed: false };
      entry.frames = readChunk(chunks[index], abort.signal).catch(() => {
        entry.failed = true;
        return null;
      });
      cache.set(index, entry);
    }
    return cache.get(index).frames;
  }

  function draw(sheet, frame) {
    if (!canvas.hasAttribute('data-playing')) {
      context.fillStyle = paper;
      context.fillRect(0, 0, canvas.width, canvas.height);
      displayed.fill(0);
    }
    for (let i = 0; i < cells; i++) {
      const tile = frame[i];
      if (displayed[i] === tile) continue;
      context.drawImage(sheet,
        (tile % atlasColumns) * cellWidth, Math.floor(tile / atlasColumns) * cellHeight, cellWidth, cellHeight,
        (i % cols) * cellWidth, Math.floor(i / cols) * cellHeight, cellWidth, cellHeight,
      );
    }
    displayed.set(frame);
    canvas.setAttribute('data-playing', '');
  }

  async function playFrame() {
    const current = generation;
    if (!atlas) {
      const image = new Image();
      image.src = atlasUrl;
      atlas = image.decode().then(() => image).catch(() => null);
    }
    const [sheet, frames] = await Promise.all([atlas, loadChunk(chunkIndex)]);
    if (current !== generation) return;
    if (!sheet || !frames) {
      if (!sheet) atlas = null;
      canvas.removeAttribute('data-playing');
      return;
    }
    const start = performance.now();
    draw(sheet, frames.subarray(frameIndex * cells, (frameIndex + 1) * cells));
    const next = (chunkIndex + 1) % chunks.length;
    if (chunks[chunkIndex].frames - frameIndex <= fps * 2) loadChunk(next);
    timer = setTimeout(() => {
      if (++frameIndex === chunks[chunkIndex].frames) {
        if (next !== chunkIndex) cache.delete(chunkIndex);
        chunkIndex = next;
        frameIndex = 0;
      }
      playFrame();
    }, Math.max(0, 1000 / fps - (performance.now() - start)));
  }

  function cancelPending() {
    generation++;
    clearTimeout(timer);
  }
  function clearCache() {
    for (const { abort } of cache.values()) abort.abort();
    cache.clear();
  }
  function syncPlayback() {
    cancelPending();
    if (!context || typeof DecompressionStream === 'undefined' || motion.matches || connection?.saveData) {
      clearCache();
      canvas.removeAttribute('data-playing');
      return;
    }
    if (atlasUrl && !document.hidden && document.readyState === 'complete') {
      for (const [index, entry] of cache) {
        if (entry.failed) cache.delete(index);
      }
      playFrame();
    }
  }

  window.addEventListener('load', syncPlayback, { once: true });
  window.addEventListener('online', syncPlayback);
  document.addEventListener('visibilitychange', syncPlayback);
  motion.addEventListener('change', syncPlayback);
  connection?.addEventListener('change', syncPlayback);
  return {
    setTheme(dark) {
      const url = dark ? darkAtlas : lightAtlas;
      if (url === atlasUrl) return;
      atlasUrl = url;
      paper = dark ? '#101010' : '#f7f7f7';
      atlas = null;
      canvas.removeAttribute('data-playing');
      syncPlayback();
    },
    destroy() {
      cancelPending();
      clearCache();
      window.removeEventListener('load', syncPlayback);
      window.removeEventListener('online', syncPlayback);
      document.removeEventListener('visibilitychange', syncPlayback);
      motion.removeEventListener('change', syncPlayback);
      connection?.removeEventListener('change', syncPlayback);
    },
  };
}
