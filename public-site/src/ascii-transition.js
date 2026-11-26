const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const glyphs = '.:;+=tx%S8#@';

function hash(x, y) {
  const value = Math.sin(x * 127.1 + y * 311.7 + 19.73) * 43758.5453;
  return value - Math.floor(value);
}

function noise(x, y) {
  const col = Math.floor(x), row = Math.floor(y);
  const u = smooth(x - col), v = smooth(y - row);
  const top = hash(col, row) * (1 - u) + hash(col + 1, row) * u;
  const bottom = hash(col, row + 1) * (1 - u) + hash(col + 1, row + 1) * u;
  return top * (1 - v) + bottom * v;
}

/** A deterministic field: reverse progress without moving a single grid cell. */
export function createAsciiTransition(canvas) {
  const context = canvas.getContext('2d');
  const texture = document.createElement('canvas');
  const ink = texture.getContext('2d');
  if (!context || !ink) return null;
  let width = 0, height = 0, cellWidth = 0, cellHeight = 0, scale = 1;
  let columns = 0, rows = 0, cells = [], dark = null, paper = '';

  function prepareTexture() {
    dark = document.body.hasAttribute('data-ds-dark-theme');
    paper = getComputedStyle(document.body).getPropertyValue('--ocean-paper').trim() || (dark ? '#111315' : '#fff');
    ink.setTransform(scale, 0, 0, scale, 0, 0);
    ink.globalAlpha = 1;
    ink.fillStyle = paper;
    ink.fillRect(0, 0, columns * cellWidth, rows * cellHeight);
    ink.font = `600 ${Math.round(cellHeight * .74)}px 'SFMono-Regular', Menlo, Consolas, monospace`;
    ink.textAlign = 'center';
    ink.textBaseline = 'middle';
    for (const cell of cells) {
      const { x, y, tone, seed } = cell;
      // Opaque paper masks the page; translucent blue cells keep the shark palette.
      ink.fillStyle = dark ? '#559fe3' : '#397fc4';
      ink.globalAlpha = .07 + tone * (dark ? .35 : .29);
      ink.fillRect(x + 1, y + 1, cellWidth - 1, cellHeight - 1);
      ink.globalAlpha = dark ? .08 : .065;
      ink.fillRect(x, y, cellWidth, 1);
      ink.fillRect(x, y, 1, cellHeight);
      ink.fillStyle = dark ? '#b9ddff' : '#256bac';
      ink.globalAlpha = .3 + tone * .66;
      const density = clamp(tone * .8 + seed * .24);
      ink.fillText(glyphs[Math.min(glyphs.length - 1, Math.floor(density * glyphs.length))], x + cellWidth / 2, y + cellHeight / 2 + 1, cellWidth - 2);
    }
    ink.globalAlpha = 1;
  }

  function resize() {
    const nextScale = Math.min(devicePixelRatio || 1, 2);
    if (width === innerWidth && height === innerHeight && scale === nextScale && cells.length) return;
    width = innerWidth;
    height = innerHeight;
    // Same projection as the shark renderer and decorative pointer ripples.
    cellWidth = Math.max(8, Math.min(13, Math.round(width / 124)));
    cellHeight = Math.round(cellWidth * 1.45);
    columns = Math.ceil(width / cellWidth);
    rows = Math.ceil(height / cellHeight);
    scale = nextScale;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    texture.width = Math.ceil(columns * cellWidth * scale);
    texture.height = Math.ceil(rows * cellHeight * scale);
    cells = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const broad = noise(col / 15, row / 12);
        const fine = noise(col / 5, row / 5);
        const field = broad * .78 + fine * .22;
        cells.push({
          x: col * cellWidth, y: row * cellHeight,
          // Coherent islands travel from the rail across the page, not random flicker.
          delay: .025 + (col / Math.max(1, columns - 1)) * .37 + field * .39,
          tone: clamp(.13 + broad * .72 + fine * .25),
          seed: hash(col, row),
        });
      }
    }
    prepareTexture();
  }

  function render(progress) {
    const p = clamp(progress);
    context.clearRect(0, 0, width, height);
    if (p === 0 || p === 1 || !cells.length) return;
    if (document.body.hasAttribute('data-ds-dark-theme') !== dark) prepareTexture();
    // The central 10% is completely opaque, leaving a safe page-commit interval.
    if (p >= .45 && p <= .55) {
      context.globalAlpha = 1;
      context.drawImage(texture, 0, 0, texture.width / scale, texture.height / scale);
      return;
    }
    const cover = Math.min(p, 1 - p) / .45;
    for (const cell of cells) {
      const alpha = smooth((cover - cell.delay) / .19);
      if (alpha <= 0) continue;
      context.globalAlpha = alpha;
      context.drawImage(texture, cell.x * scale, cell.y * scale, cellWidth * scale, cellHeight * scale, cell.x, cell.y, cellWidth, cellHeight);
    }
    context.globalAlpha = 1;
  }

  function destroy() {
    context.clearRect(0, 0, width, height);
    texture.width = texture.height = 1;
    cells = [];
  }

  resize();
  return { render, resize, destroy };
}
