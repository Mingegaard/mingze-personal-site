import terrainUrl from './assets/snow-terrain.webp';

// Lighter marks leave the paper or the night sky visible between the ridges.
const marks = [".", "'`", ":", ";-", "+~", "rc", "vx", "nu", "oe", "sz", "ZX", "AO", "QS", "8B", "%$", "#@"];
const sourcePeakX = .325;
const clamp = (value, low, high) => Math.max(low, Math.min(value, high));

function drawMountain(canvas, terrain, wideSidebar) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const context = canvas.getContext('2d');
  const sample = document.createElement('canvas');
  const sampling = sample.getContext('2d', { willReadFrequently: true });
  if (!context || !sampling) return;

  // Sample the terrain in character cells. The peak stays near one third of
  // the viewport even when a narrow screen crops the outer slopes.
  const cell = clamp(width / 278, 3.2, 6.4);
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / (cell * 1.52));
  sample.width = cols;
  sample.height = rows;
  const aspect = terrain.naturalWidth / terrain.naturalHeight;
  const railWidth = wideSidebar && width >= 760 ? 280 : 76;
  const composerLeft = (width + railWidth - 800) / 2;
  const peak = width >= 1200
    ? clamp(composerLeft - 56, railWidth + 36, width * .34)
    : Math.max(width * .34, railWidth + 26);
  const artWidth = Math.max(peak / sourcePeakX, (width - peak) / (1 - sourcePeakX), height * aspect * .87);
  const artHeight = Math.max(height, artWidth / aspect * .54);
  const left = peak - artWidth * sourcePeakX;
  sampling.imageSmoothingQuality = 'high';
  sampling.drawImage(terrain, left / width * cols, 0, artWidth / width * cols, artHeight / height * rows);
  const pixels = sampling.getImageData(0, 0, cols, rows).data;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  const stepX = width / cols;
  const stepY = height / rows;
  context.font = `600 ${Math.min(stepX * 1.64, stepY * 1.09)}px Menlo, Consolas, monospace`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const night = document.body.hasAttribute('data-ds-dark-theme');
  const inks = Array.from({length: 32}, (_, i) => {
    const gray = night ? Math.round(72 + 181 * i / 31) : Math.round(183 - 160 * i / 31);
    return `rgb(${gray},${gray},${gray})`;
  });
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const offset = 4 * (row * cols + col);
      const coverage = pixels[offset + 3] / 255;
      if (coverage < .2) continue;
      const luminance = pixels[offset] / 255;
      const tone = night ? luminance : (1 - luminance) ** 1.35;
      const ink = clamp((.035 + tone * 1.03) * coverage, 0, 1);
      const grain = ((col * 97 + row * 47 + col * row * 17) % 109) / 109;
      const band = marks[Math.round(clamp(ink * (marks.length - 1) + (grain - .5) * .85, 0, marks.length - 1))];
      let glyph = band[Math.floor(grain * band.length)];
      // Slant midtone strokes along the visible rock and snow boundaries.
      if (col > 0 && row > 0 && ink > .2 && ink < .74) {
        const dx = pixels[offset] - pixels[offset - 4];
        const dy = pixels[offset] - pixels[offset - cols * 4];
        if (Math.abs(dx) > 18 && Math.abs(dy) > 12) glyph = dx * dy > 0 ? '/' : '\\';
      }
      context.fillStyle = inks[Math.round(ink * 31)];
      context.fillText(glyph, (col + .5) * stepX, (row + .52) * stepY);
    }
  }
}

export function mountMountain() {
  const canvas = document.createElement('canvas');
  canvas.className = 'site-snow-mountain';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const terrain = new Image();
  let frame = 0;
  const shell = document.querySelector('.site-shell');
  function schedule() {
    if (frame || !terrain.naturalWidth) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      drawMountain(canvas, terrain, shell?.dataset.wide === 'true');
    });
  }
  const resize = new ResizeObserver(schedule);
  resize.observe(canvas);
  const appearance = new MutationObserver(schedule);
  appearance.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
  if (shell) appearance.observe(shell, { attributes: true, attributeFilter: ['data-wide'] });
  terrain.onload = schedule;
  terrain.src = terrainUrl;
  return () => {
    terrain.onload = null;
    cancelAnimationFrame(frame);
    resize.disconnect();
    appearance.disconnect();
    canvas.remove();
  };
}
