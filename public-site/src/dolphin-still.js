function smoothstep(low, high, value) {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2*t);
}

const mix = (a, b, t) => a + (b - a) * t;

// Sample the still offscreen. Only fillText draws on the visible, transparent canvas.
export function mountGlyphStill(canvas, stillUrl, camera, characterSpacing, content) {
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
    const contentWidth = content?.clientWidth || width;
    const ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(2300000 / (width * height)));
    const key = [width, height, contentWidth, ratio, dark].join('/');
    if (previousKey === key) return;
    previousKey = key;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    ctx.scale(canvas.width / width, canvas.height / height);
    const [cell, line] = characterSpacing(width);
    const [left, top, spanX, spanY] = camera(width, height, contentWidth);
    ctx.font = `bold ${cell * 1.76}px Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const { width: sw, height: sh, data } = pixels;
    const index = (x, y) => 4 * (Math.max(0, Math.min(sh-1, y)) * sw + Math.min(sw-1, x < 0 ? -x-1 : x));
    const neutral = i => data[i] > .33 * data[i+2] && data[i] > .39 * data[i+1];
    const shadowAgainstWater = (i, green, blue) => data[i] < .38 * data[i+2]
      && green < .70 * data[i+1] && blue < .75 * data[i+2];
    const stepX = Math.max(1, Math.round(.32 * cell / width * spanX * sw));
    const stepY = Math.max(1, Math.round(.32 * line / height * spanY * sh));
    const finStep = Math.max(1, Math.round(sh * .03));
    const ramp = dark ? 'XOH8BWM@' : '@MWB8HOX';
    for (let row = 0; row * line < height; row++) {
      const y = (row + .5) * line;
      const bend = Math.min(1, y / height / .19);
      const v = top + y / height * spanY - Math.max(0, top) * (1 - bend*bend*(3-2*bend));
      const sy = Math.floor(v * sh);
      for (let col = 0; col * cell < width; col++) {
        const x = (col + .5) * cell;
        const u = Math.abs(left + x / width * spanX);
        const sx = Math.floor(u * sw);
        const offset = index(sx, sy);
        const red = data[offset], green = data[offset+1], blue = data[offset+2];
        const luma = .29*red + .58*green + .13*blue;
        const light = Math.min(1, luma / 205);
        const noise = Math.abs(Math.sin(col*71.39 + row*37.21)*9173.31) % 1;
        // Keep narrow fins where the centre sample falls just outside the silhouette.
        const isBody = neutral(offset)
          || (neutral(index(sx-stepX, sy)) && neutral(index(sx+stepX, sy)))
          || (neutral(index(sx, sy-stepY)) && neutral(index(sx, sy+stepY)));
        const fin = !isBody && v > .14 && blue < 114 && (
          shadowAgainstWater(index(sx, sy-finStep), green, blue)
          || shadowAgainstWater(index(sx, sy+finStep), green, blue)
        );
        let glyph;
        let maxWidth = cell * 1.12;
        if (sx >= 0 && sx < sw && v >= 0 && v <= 1 && (isBody || fin)) {
          const tone = Math.max(0, Math.min(1, (light - .07) * 1.22));
          const grey = dark ? Math.round(131 + tone * 119) : Math.round(32 + tone * 110);
          glyph = ramp[Math.round(tone * (ramp.length-1))];
          // Reflected sky and aerated water stay cool near the surface, even in shadow.
          const foam = dark ? 0 : Math.max(1 - smoothstep(.24, .36, v),
            smoothstep(.36, .66, green/255) * smoothstep(.015, .10, (green-red)/255)
              * (1 - smoothstep(.32, .52, v)));
          const r = mix(grey, mix(118, 211, tone), foam);
          const g = mix(grey + 2, mix(172, 232, tone), foam);
          const b = mix(grey + 3, mix(199, 239, tone), foam);
          ctx.fillStyle = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
          if (foam > .55) {
            const pair = tone > .7 ? '*+' : tone > .38 ? '~=' : 'xs';
            glyph = pair[Number(noise > .5)];
          }
        } else if (dark) {
          if (noise > .16 + .27*light) continue;
          ctx.fillStyle = '#6693ac';
          glyph = light > .55 ? '~' : noise < .1 ? ':' : '.';
        } else {
          const edge = Math.min(v, 1-v);
          const level = mix(.12, smoothstep(.135, .40, luma/255), smoothstep(-.002, .01, edge));
          if (noise > .62 + .32*level) continue;
          const r = Math.round(mix(54, 101, level));
          const g = Math.round(mix(130, 169, level));
          const b = Math.round(mix(176, 204, level));
          ctx.fillStyle = `rgba(${r},${g},${b},${mix(.77,.94,level)})`;
          const texture = level + (noise-.5)*.23 + .11;
          const pair = texture > .78 ? '~=' : texture > .54 ? '-:' : texture > .28 ? ":'" : ".'";
          glyph = pair[Number((noise*7) % 1 > .60)];
          maxWidth = cell * .82;
        }
        ctx.fillText(glyph, x, y, maxWidth);
      }
    }
    canvas.setAttribute('data-playing', '');
  }

  const resize = new ResizeObserver(draw);
  resize.observe(canvas);
  if (content) resize.observe(content);
  image.onload = () => {
    if (destroyed) return;
    const sample = document.createElement('canvas');
    sample.width = image.naturalWidth;
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
