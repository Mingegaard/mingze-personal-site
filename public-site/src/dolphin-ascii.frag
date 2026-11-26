precision highp float;

uniform sampler2D u_scene;
uniform sampler2D u_letters;
uniform vec2 u_view;
uniform vec2 u_cell;
uniform vec2 u_origin;
uniform vec2 u_span;
uniform float u_night;
varying vec2 v_screen;

float luminance(vec3 rgb) {
  return dot(rgb, vec3(.29, .58, .13));
}

vec3 sampleFilm(vec2 point) {
  return texture2D(u_scene, clamp(point, .001, .999)).rgb;
}

vec2 cameraUV(vec2 viewport) {
  vec2 uv = u_origin + viewport * u_span;
  uv.y -= max(0., u_origin.y) * (1. - smoothstep(0., .19, viewport.y));
  return uv;
}

float grain(vec2 cell) {
  vec3 p = fract(vec3(cell.xyx) * .1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float neutralSkin(vec3 rgb) {
  float warm = smoothstep(.20, .62, rgb.r / (rgb.b + .012));
  float balanced = smoothstep(.24, .74, rgb.r / (rgb.g + .018));
  return warm * (.54 + .46 * balanced);
}

float submergedShadow(vec3 pixel, vec3 neighbour) {
  float blueWater = smoothstep(.17, .38, neighbour.b - neighbour.r)
    * (1. - smoothstep(.27, .48, neighbour.r / (neighbour.b + .01)))
    * (1. - smoothstep(.59, .82, neighbour.g / (neighbour.b + .01)));
  vec2 drop = (neighbour.gb - pixel.gb) / max(neighbour.gb, vec2(.13, .24));
  return blueWater * smoothstep(.21, .56, min(drop.x, drop.y));
}

float dolphinOrFoam(vec3 pixel, vec2 center) {
  float body = neutralSkin(pixel);
  if (center.y > .13 && pixel.b < .56 && pixel.g < .35 && body < .93) {
    float shade = max(submergedShadow(pixel, sampleFilm(center + vec2(.01,-.031))),
                      submergedShadow(pixel, sampleFilm(center + vec2(-.009,.03))));
    shade = max(shade, max(submergedShadow(pixel, sampleFilm(center + vec2(.021,.013))),
                           submergedShadow(pixel, sampleFilm(center - vec2(.022,.011)))));
    body = max(body, shade * (1. - smoothstep(.35, .56, pixel.b)));
  }
  float foam = smoothstep(.37, .68, pixel.g) * smoothstep(.33, .70, pixel.r / (pixel.b + .01))
    * smoothstep(.62, .87, pixel.g / (pixel.b + .01));
  return max(body, foam);
}

float dolphinGlyph(float weight, float variation) {
  if (weight > .85) return variation > .55 ? 64. : 77.;  // @ M
  if (weight > .70) return variation > .50 ? 35. : 66.;  // # B
  if (weight > .56) return variation > .52 ? 56. : 37.;  // 8 %
  if (weight > .42) return variation > .58 ? 88. : 79.;  // X O
  if (weight > .27) return variation > .48 ? 111. : 115.; // o s
  return variation > .55 ? 43. : 99.;                    // + c
}

float waterGlyph(float level, float variation) {
  if (level > .78) return variation > .57 ? 61. : 126.; // = ~
  if (level > .54) return variation > .60 ? 58. : 45.;  // : -
  if (level > .28) return variation > .64 ? 39. : 58.;  // ' :
  return variation > .80 ? 39. : 46.;                   // ' .
}

void main() {
  vec2 grid = v_screen * u_view / u_cell;
  vec2 cell = floor(grid);
  vec2 center = cameraUV((cell + .5) * u_cell / u_view);
  vec2 span = u_cell / u_view * u_span;
  vec3 mid = sampleFilm(center);
  vec3 left = sampleFilm(center - vec2(.39*span.x, 0.));
  vec3 right = sampleFilm(center + vec2(.39*span.x, 0.));
  vec3 above = sampleFilm(center - vec2(0., .39*span.y));
  vec3 below = sampleFilm(center + vec2(0., .39*span.y));
  vec3 mean = .5 * mid + .125 * (left + right + above + below);
  float edge = min(min(center.x, 1.-center.x), min(center.y, 1.-center.y));
  float inFilm = smoothstep(-.002, .01, edge);
  float material = max(dolphinOrFoam(mid, center), .76 * neutralSkin(mean)) * inFilm;
  float tone = smoothstep(.08, .78, luminance(mean));
  float random = grain(cell);
  float code;
  vec3 ink;
  float opacity = 1.;

  // All decisions above the atlas lookup are constant across a character cell.
  if (material > .24) {
    float density = mix(1.-tone, .31+.69*tone, u_night);
    code = dolphinGlyph(clamp(density + .12*(random-.5), 0., 1.), random);
    float dx = luminance(right-left);
    float dy = luminance(below-above);
    if (max(abs(dx),abs(dy)) > .12 && material < .81 && random > .24) {
      if (abs(dx) > 2.*abs(dy)) code = 124.;       // |
      else if (abs(dy) > 2.*abs(dx)) code = 45.;  // -
      else code = dx*dy > 0. ? 47. : 92.;         // / or backslash
    }
    // Silver highlights stay visible on paper; the night palette reaches white.
    vec3 shadow = mix(vec3(.17,.20,.22), vec3(.47,.51,.54), u_night);
    vec3 highlight = mix(vec3(.64,.67,.69), vec3(.96,.97,.98), u_night);
    ink = mix(shadow, highlight, smoothstep(.02, 1., tone));
    opacity = mix(.74, 1., smoothstep(.24,.67,material));
  } else {
    float level = mix(.12, smoothstep(.135,.40,luminance(mean)), inFilm);
    float textureLevel = clamp(level + .23*(random-.5), 0., 1.);
    code = waterGlyph(textureLevel, random);
    vec3 deep = mix(vec3(.36,.61,.76), vec3(.30,.53,.66), u_night);
    vec3 crest = mix(vec3(.57,.77,.87), vec3(.64,.83,.93), u_night);
    ink = mix(deep, crest, level);
    float keep = .29 + .59*level;
    opacity = step(1.-keep, grain(cell+vec2(19.,31.))) * mix(.50,.84,level);
  }

  float index = code - 32.;
  vec2 tile = vec2(mod(index,16.), floor(index/16.));
  float glyph = texture2D(u_letters, (tile + clamp(fract(grid),.022,.978)) / vec2(16.,6.)).r;
  gl_FragColor = vec4(ink, glyph * opacity);
}
