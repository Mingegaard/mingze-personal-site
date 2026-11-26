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
  // The full-width canvas extends behind the navigation rail, left of the filmed area.
  point.x = abs(point.x);
  return texture2D(u_scene, clamp(point, .001, .999)).rgb;
}

vec2 cameraUV(vec2 viewport) {
  vec2 uv = u_origin + viewport * u_span;
  // Let the surface reflections keep their scale before easing into the hero crop.
  uv.y -= max(0., u_origin.y) * (1. - smoothstep(.06, .22, viewport.y));
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
  if (weight > .78) return variation > .55 ? 77. : 66.; // M B
  if (weight > .57) return variation > .55 ? 64. : 78.; // @ N
  if (weight > .34) return variation > .60 ? 35. : 56.; // # 8
  if (weight > .16) return variation > .58 ? 88. : 79.; // X O
  return variation > .58 ? 86. : 67.;                   // V C
}

// Character code and approximate ink coverage, measured from this font atlas.
vec2 waterGlyph(float coverage, float variation) {
  if (coverage > .26) return variation > .56 ? vec2(79.,.31) : vec2(83.,.27); // O S
  if (coverage > .205) return variation > .54 ? vec2(120.,.22) : vec2(115.,.21); // x s
  if (coverage > .135) return variation > .48 ? vec2(61.,.19) : vec2(99.,.19); // = c
  if (coverage > .081) return variation > .54 ? vec2(126.,.10) : vec2(45.,.09); // ~ -
  return variation > .58 ? vec2(46.,.04) : vec2(58.,.08); // . :
}

// The bright, cool spray extends below the reflective band at the surface.
float foamWeight(vec3 rgb, float sourceY) {
  float surface = 1. - smoothstep(.24, .36, sourceY);
  float spray = smoothstep(.36, .66, rgb.g) * smoothstep(.015, .10, rgb.g - rgb.r);
  return max(surface, spray * (1. - smoothstep(.32, .52, sourceY)));
}

float foamGlyph(float tone, float variation) {
  if (tone > .78) return variation > .54 ? 64. : 56.; // @ 8
  if (tone > .53) return variation > .48 ? 37. : 79.; // % O
  if (tone > .28) return variation > .55 ? 42. : 120.; // * x
  return variation > .55 ? 61. : 126.;                // = ~
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
  float inFilm = smoothstep(-.002, .01, min(center.y, 1.-center.y));
  // A narrow fin can cross a corner of a cell without touching its center.
  float boundary = max(max(neutralSkin(left), neutralSkin(right)),
                       max(neutralSkin(above), neutralSkin(below)));
  float material = max(dolphinOrFoam(mid, center), max(.76 * neutralSkin(mean), .42 * boundary)) * inFilm;
  float luma = luminance(mean);
  float tone = smoothstep(.06, .86, luma);
  float random = grain(cell);
  float code;
  vec3 ink;
  vec2 glyphUV = fract(grid);
  float opacity = 1.;

  // All decisions above the atlas lookup are constant across a character cell.
  if (material > .24) {
    // Give both the dark flukes and the pearl highlights enough printed area.
    float density = .47 + .47*max(tone, 1.-smoothstep(.04,.37,luma));
    code = dolphinGlyph(clamp(density + .12*(random-.5), 0., 1.), random);
    float dx = luminance(right-left);
    float dy = luminance(below-above);
    if (max(abs(dx),abs(dy)) > .12 && material < .54) {
      if (abs(dx) > 2.*abs(dy)) code = 124.;       // |
      else if (abs(dy) > 2.*abs(dx)) code = 45.;  // -
      else code = dx*dy > 0. ? 47. : 92.;         // / or backslash
    }
    vec3 silver = mix(vec3(.025,.055,.14), vec3(.64,.69,.77), smoothstep(.035,.46,luma));
    silver = mix(silver, vec3(.99,.985,.995), smoothstep(.40,.85,luma));
    // Carry through the violet and turquoise reflections recorded on the skin.
    ink = clamp(silver + .52 * (mean - luma), 0., 1.);
    float foam = foamWeight(mean, center.y);
    vec3 foamInk = mix(vec3(.19,.36,.58), vec3(.99,.995,1.), smoothstep(.13,.79,luma));
    ink = mix(ink, foamInk, foam);
    ink *= mix(1., .88+.10*tone, u_night);
    if (foam > .55) code = foamGlyph(tone, random);
    opacity = mix(.72, 1., smoothstep(.24,.58,material));
    // Use the printed portion of the atlas tile, reducing the type's side bearings and leading.
    glyphUV = vec2(.50,.45) + (glyphUV-.50) * vec2(.86,.78);
  } else {
    // A single blue ground shows between the letters. Expand the recorded water
    // colors around it so their differences survive the open space in the glyphs.
    vec3 ground = mix(vec3(18.,62.,138.), vec3(11.,40.,95.), u_night) / 255.;
    float waterDetail = inFilm * (1. - smoothstep(.86, 1., center.y));
    vec3 water = mix(vec3(.055,.217,.525), mean, waterDetail);
    vec3 recorded = water * mix(vec3(1.), vec3(.69,.72,.77), u_night);
    vec3 delta = recorded - ground;
    vec3 headroom = mix(max(ground,vec3(.15)), 1.-ground, step(vec3(0.),delta));
    vec3 coverage = abs(delta) / headroom;
    float required = max(coverage.r*.45, max(coverage.g,coverage.b));
    float keep = mix(.62,.96,smoothstep(.025,.32,required));
    float strength = .90;
    vec2 mark = waterGlyph((required+.014)/(keep*strength) + .045*(random-.5), random);
    code = mark.x;
    // The apparent color is ground + area * (ink - ground).
    ink = clamp(ground + delta/max(.045, mark.y*keep*strength), 0., 1.);
    // Thin strokes can exaggerate tiny red/blue differences in the recording.
    // Keep individual water marks within its blue-to-cyan range.
    ink.g = max(ink.g, .27 * ink.b);
    ink.r = min(ink.r, min(ink.g, ink.b) + .018);
    opacity = step(1.-keep, grain(cell+vec2(19.,31.))) * strength;
  }

  float index = code - 32.;
  vec2 tile = vec2(mod(index,16.), floor(index/16.));
  float glyph = texture2D(u_letters, (tile + clamp(glyphUV,.022,.978)) / vec2(16.,6.)).r;
  gl_FragColor = vec4(ink, glyph * opacity);
}
