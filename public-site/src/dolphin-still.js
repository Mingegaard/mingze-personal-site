function smoothstep(low, high, value) {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2*t);
}

const mix = (a, b, t) => a + (b - a) * t;
const dayWater = [18, 62, 138];
const nightWater = [11, 40, 95];
const openWater = [.055, .217, .525];
const nightGain = [.69, .72, .77];
const skinShadow = [.025, .055, .14];
const silver = [.64, .69, .77];
const pearl = [.99, .985, .995];
const foamShadow = [.19, .36, .58];
const foamWhite = [.99, .995, 1.];

function cssInk(color) {
  return 'rgb(' + color.map(channel => Math.round(255 * Math.max(0, Math.min(1, channel)))).join(',') + ')';
}

// Match the water glyphs and measured ink coverage in the film renderer.
function waterMark(coverage, variation) {
  if (coverage > .26) return variation > .56 ? ['O',.31] : ['S',.27];
  if (coverage > .205) return variation > .54 ? ['x',.22] : ['s',.21];
  if (coverage > .135) return variation > .48 ? ['=',.19] : ['c',.19];
  if (coverage > .081) return variation > .54 ? ['~',.10] : ['-',.09];
  return variation > .58 ? ['.',.04] : [':',.08];
}

function grain(col, row) {
  const x = (col * .1031) % 1;
  const y = (row * .1031) % 1;
  const sum = x * (y + 33.33) + y * (x + 33.33) + x * (x + 33.33);
  return ((x + y + 2 * sum) * (x + sum)) % 1;
}

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
    const ground = (dark ? nightWater : dayWater).map(channel => channel / 255);
    for (let row = 0; row * line < height; row++) {
      const y = (row + .5) * line;
      const viewportY = y / height;
      const v = top + viewportY * spanY - Math.max(0, top) * (1 - smoothstep(.06, .22, viewportY));
      const sy = Math.floor(v * sh);
      for (let col = 0; col * cell < width; col++) {
        const x = (col + .5) * cell;
        const u = Math.abs(left + x / width * spanX);
        const sx = Math.floor(u * sw);
        const offset = index(sx, sy);
        const red = data[offset], green = data[offset+1], blue = data[offset+2];
        const rgb = [red/255, green/255, blue/255];
        const luma = (.29*red + .58*green + .13*blue) / 255;
        const noise = grain(col, row);
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
          const tone = smoothstep(.06, .86, luma);
          const foam = Math.max(1 - smoothstep(.24, .36, v),
            smoothstep(.36, .66, green/255) * smoothstep(.015, .10, (green-red)/255)
              * (1 - smoothstep(.32, .52, v)));
          const midtone = smoothstep(.035,.46,luma);
          const highlight = smoothstep(.40,.85,luma);
          const spray = smoothstep(.13,.79,luma);
          const color = rgb.map((channel, i) => {
            const skin = mix(mix(skinShadow[i], silver[i], midtone), pearl[i], highlight);
            const reflected = Math.max(0, Math.min(1, skin + .52*(channel-luma)));
            return mix(reflected, mix(foamShadow[i], foamWhite[i], spray), foam) * (dark ? .88+.10*tone : 1);
          });
          ctx.fillStyle = cssInk(color);
          ctx.globalAlpha = 1;
          const density = .47 + .47*Math.max(tone, 1-smoothstep(.04,.37,luma)) + .12*(noise-.5);
          let pair = density > .78 ? 'BM' : density > .57 ? 'N@' : '#8';
          if (foam > .55) pair = tone > .78 ? '8@' : tone > .53 ? 'O%' : tone > .28 ? 'x*' : '~=';
          glyph = pair[Number(noise > .55)];
        } else {
          const waterDetail = smoothstep(-.002,.01,v) * (1 - smoothstep(.86,1,v));
          const delta = rgb.map((channel, i) => {
            const recorded = mix(openWater[i], channel, waterDetail) * (dark ? nightGain[i] : 1);
            return recorded - ground[i];
          });
          const coverage = delta.map((d, i) => Math.abs(d) / (d < 0 ? Math.max(ground[i],.15) : 1-ground[i]));
          const required = Math.max(.45 * coverage[0], coverage[1], coverage[2]);
          const keep = mix(.62,.96,smoothstep(.025,.32,required));
          if (grain(col+19, row+31) < 1-keep) continue;
          const strength = .90;
          const [mark, area] = waterMark((required+.014)/(keep*strength) + .045*(noise-.5), noise);
          const painted = Math.max(.045, area * keep * strength);
          const ink = delta.map((d, i) => Math.max(0, Math.min(1, ground[i] + d / painted)));
          ink[1] = Math.max(ink[1], .27 * ink[2]);
          ink[0] = Math.min(ink[0], Math.min(ink[1], ink[2]) + .018);
          ctx.fillStyle = cssInk(ink);
          ctx.globalAlpha = strength;
          glyph = mark;
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
