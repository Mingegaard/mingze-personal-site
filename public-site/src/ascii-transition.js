const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const glyphGroups = ['.:-~/', ':;+=xt', '01XS%8', '#@WMB&'];
const glyphs = glyphGroups.join('');
const TONES = 8;

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

/** Coverage reverses independently of the clock driving the living character field. */
export function createAsciiTransition(canvas) {
  const context = canvas.getContext('2d');
  const texture = document.createElement('canvas');
  const atlas = document.createElement('canvas');
  const ink = texture.getContext('2d');
  const letters = atlas.getContext('2d');
  if (!context || !ink || !letters) return null;
  let width = 0, height = 0, cellWidth = 0, cellHeight = 0, scale = 1;
  let columns = 0, rows = 0, fontSize = 0, cells = [], dark = null, paper = '';

  function prepareTexture() {
    dark = document.body.hasAttribute('data-ds-dark-theme');
    paper = getComputedStyle(document.body).getPropertyValue('--ocean-paper').trim() || (dark ? '#111315' : '#fff');
    ink.setTransform(scale, 0, 0, scale, 0, 0);
    ink.globalAlpha = 1;
    ink.fillStyle = paper;
    ink.fillRect(0, 0, columns * cellWidth, rows * cellHeight);
    for (const cell of cells) {
      const { x, y, tone } = cell;
      // Opaque paper masks the page; translucent blue cells keep the shark palette.
      ink.fillStyle = dark ? '#559fe3' : '#397fc4';
      ink.globalAlpha = .06 + tone * (dark ? .35 : .29);
      ink.fillRect(x + 1, y + 1, cellWidth - 1, cellHeight - 1);
      ink.globalAlpha = dark ? .08 : .065;
      ink.fillRect(x, y, cellWidth, 1);
      ink.fillRect(x, y, 1, cellHeight);
    }
    ink.globalAlpha = 1;
    // Rasterize each glyph/color once; animation only selects cached atlas cells.
    letters.setTransform(scale, 0, 0, scale, 0, 0);
    letters.clearRect(0, 0, glyphs.length * cellWidth, TONES * cellHeight);
    letters.font = `600 ${fontSize}px 'SFMono-Regular', Menlo, Consolas, monospace`;
    letters.textAlign = 'center';
    letters.textBaseline = 'middle';
    letters.fillStyle = dark ? '#b9ddff' : '#256bac';
    for (let tone = 0; tone < TONES; tone++) {
      letters.globalAlpha = .4 + tone / (TONES - 1) * .6;
      for (let index = 0; index < glyphs.length; index++) {
        letters.fillText(glyphs[index], (index + .5) * cellWidth, (tone + .5) * cellHeight + 1, cellWidth - 2);
      }
    }
    letters.globalAlpha = 1;
  }

  function resize() {
    const nextScale = Math.min(devicePixelRatio || 1, 2);
    if (width === innerWidth && height === innerHeight && scale === nextScale && cells.length) return;
    width = innerWidth;
    height = innerHeight;
    // Two background cells form one transition cell, preserving the grid origin.
    const baseWidth = Math.max(8, Math.min(13, Math.round(width / 124)));
    const baseHeight = Math.round(baseWidth * 1.45);
    cellWidth = baseWidth * 2;
    cellHeight = baseHeight * 2;
    fontSize = Math.round(Math.round(baseHeight * .74) * 1.9);
    columns = Math.ceil(width / cellWidth);
    rows = Math.ceil(height / cellHeight);
    scale = nextScale;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    texture.width = Math.ceil(columns * cellWidth * scale);
    texture.height = Math.ceil(rows * cellHeight * scale);
    atlas.width = Math.ceil(glyphs.length * cellWidth * scale);
    atlas.height = Math.ceil(TONES * cellHeight * scale);
    cells = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const broad = noise(col / 6.5, row / 5.5);
        const fine = noise(col / 2.8, row / 2.8);
        const field = broad * .8 + fine * .2;
        const seed = hash(col, row);
        const tone = clamp(.08 + broad * .78 + fine * .22);
        const groupIndex = Math.min(glyphGroups.length - 1, Math.floor((tone * .8 + seed * .2) * glyphGroups.length));
        cells.push({
          x: col * cellWidth, y: row * cellHeight,
          // Several organic islands grow together, with only a gentle directional bias.
          delay: .035 + (col / Math.max(1, columns - 1)) * .10 + field * .60,
          motionPhase: col * .17 + row * .21,
          motionPhase2: col * .11 - row * .27,
          tone, atlasTone: Math.min(TONES - 1, Math.floor(tone * TONES)),
          glyphStart: glyphGroups.slice(0, groupIndex).join('').length,
          glyphCount: glyphGroups[groupIndex].length,
          glyphSeed: Math.floor(seed * 997),
          glyphRate: 8 + hash(col + 47, row + 13) * 4,
          glyphPhase: hash(col + 17, row + 53),
        });
      }
    }
    prepareTexture();
  }

  function render(progress, elapsedMs = 0) {
    const p = clamp(progress);
    context.clearRect(0, 0, width, height);
    if (p === 0 || p === 1 || !cells.length) return;
    if (document.body.hasAttribute('data-ds-dark-theme') !== dark) prepareTexture();
    const seconds = Math.max(0, elapsedMs) / 1000;
    // The middle fifth is opaque; the glyphs keep moving through this brief dwell.
    const covered = p >= .40 && p <= .60;
    if (covered) {
      context.globalAlpha = 1;
      context.drawImage(texture, 0, 0, texture.width / scale, texture.height / scale);
    }
    const cover = Math.min(p, 1 - p) / .40;
    for (const cell of cells) {
      const breathing = Math.sin(cell.motionPhase + seconds * 1.8) * .025
        + Math.sin(cell.motionPhase2 - seconds * 1.35) * .018;
      const alpha = covered ? 1 : smooth((cover - cell.delay - breathing) / .20);
      if (alpha <= 0) continue;
      context.globalAlpha = alpha;
      if (!covered) context.drawImage(texture, cell.x * scale, cell.y * scale, cellWidth * scale, cellHeight * scale, cell.x, cell.y, cellWidth, cellHeight);
      // Staggered 8–12 Hz substitutions never flash the entire character field at once.
      const tick = Math.floor(seconds * cell.glyphRate + cell.glyphPhase);
      const glyph = cell.glyphStart + ((cell.glyphSeed + tick * 7 + Math.floor(tick / 3)) % cell.glyphCount);
      context.drawImage(atlas, glyph * cellWidth * scale, cell.atlasTone * cellHeight * scale, cellWidth * scale, cellHeight * scale, cell.x, cell.y, cellWidth, cellHeight);
    }
    context.globalAlpha = 1;
  }

  function destroy() {
    context.clearRect(0, 0, width, height);
    texture.width = texture.height = 1;
    atlas.width = atlas.height = 1;
    cells = [];
  }

  resize();
  return { render, resize, destroy };
}
