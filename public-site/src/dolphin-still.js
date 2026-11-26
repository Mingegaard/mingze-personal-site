// Sample the still offscreen. Only fillText draws on the visible, transparent canvas.
export function mountGlyphStill(canvas, stillUrl, camera, cellSize) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { setTheme() {}, destroy() {} };
  const image = new Image();
  let pixels;
  let dark = false;
  let destroyed = false;
  let previousKey = '';

  function draw() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!pixels || !width || !height) return;
    const ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(2300000 / (width * height)));
    const key = [width, height, ratio, dark].join('/');
    if (previousKey === key) return;
    previousKey = key;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    ctx.scale(canvas.width / width, canvas.height / height);
    const cell = cellSize(width);
    const line = cell * 1.5;
    const [left, top, spanX, spanY] = camera(width, height, 0);
    ctx.font = `bold ${cell * 1.5}px Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const { width: sw, height: sh, data } = pixels;
    const index = (x, y) => 4 * (Math.max(0, Math.min(sh-1, y)) * sw + Math.max(0, Math.min(sw-1, x)));
    for (let row = 0; row * line < height; row++) {
      const y = (row + .5) * line;
      const bend = Math.min(1, y / height / .19);
      const v = top + y / height * spanY - Math.max(0, top) * (1 - bend*bend*(3-2*bend));
      const sy = Math.floor(v * sh);
      for (let col = 0; col * cell < width; col++) {
        const x = (col + .5) * cell;
        const sx = Math.floor((left + x / width * spanX) * sw);
        const offset = index(sx, sy);
        const red = data[offset], green = data[offset+1], blue = data[offset+2];
        const light = Math.min(1, (.29*red + .58*green + .13*blue) / 205);
        const noise = Math.abs(Math.sin(col*71.39 + row*37.21)*9173.31) % 1;
        const water = index(sx, sy - Math.round(sh * .03));
        const fin = v > .14 && blue < 114 && green < .67*data[water+1] && blue < .73*data[water+2];
        const neutral = red > .33*blue && red > .39*green;
        let glyph;
        if (v >= 0 && v <= 1 && (neutral || fin)) {
          const tone = Math.max(0, Math.min(1, (light - .07) * 1.22));
          const grey = dark ? Math.round(126 + tone * 121) : Math.round(38 + tone * 111);
          ctx.fillStyle = `rgb(${grey},${grey + 2},${grey + 3})`;
          const ramp = dark ? '+rsoxS8W@' : '@W8SXo+;:';
          glyph = ramp[Math.round(tone * (ramp.length-1))];
        } else {
          if (noise > .23 + .35*light) continue;
          ctx.fillStyle = dark ? '#73a5c1' : '#9ec5dc';
          glyph = light > .55 ? '~' : noise < .1 ? ':' : '.';
        }
        ctx.fillText(glyph, x, y);
      }
    }
    canvas.setAttribute('data-playing', '');
  }

  const resize = new ResizeObserver(draw);
  resize.observe(canvas);
  image.onload = () => {
    if (destroyed) return;
    const sample = document.createElement('canvas');
    sample.width = Math.min(400, image.naturalWidth);
    sample.height = Math.max(1, Math.round(sample.width * image.naturalHeight / image.naturalWidth));
    const sampling = sample.getContext('2d', {willReadFrequently:true});
    if (!sampling) return;
    sampling.drawImage(image, 0, 0, sample.width, sample.height);
    pixels = sampling.getImageData(0, 0, sample.width, sample.height);
    draw();
  };
  image.src = stillUrl;
  return {
    setTheme(value) { dark = value; draw(); },
    destroy() {
      destroyed = true;
      resize.disconnect();
      image.onload = null;
      pixels = null;
      canvas.removeAttribute('data-playing');
    },
  };
}
