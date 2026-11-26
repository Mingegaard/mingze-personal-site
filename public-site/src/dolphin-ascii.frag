precision highp float;

uniform sampler2D u_scene;
uniform sampler2D u_letters;
uniform vec2 u_view;
uniform vec2 u_cell;
uniform vec2 u_origin;
uniform vec2 u_span;
uniform float u_night;
varying vec2 v_screen;

float lightness(vec3 colour) {
  return dot(colour, vec3(.29, .58, .13));
}

// Open water stays blue even in shade. Dolphin skin and breaking waves
// have a much more neutral red/blue balance, including along the thin fins.
float neutralMaterial(vec3 rgb) {
  float warm = smoothstep(.20, .62, rgb.r / (rgb.b + .012));
  float balanced = smoothstep(.24, .74, rgb.r / (rgb.g + .018));
  float nearBlack = (1. - smoothstep(.032, .12, max(rgb.g, rgb.b))) * .67;
  return max(warm * (.54 + .46 * balanced), nearBlack);
}

vec3 scene(vec2 source) {
  return texture2D(u_scene, clamp(source, vec2(.001), vec2(.999))).rgb;
}

// A shaded fluke can be as blue as the sea. Check how much darker it is
// than nearby *water* in both transmitted channels; white foam is not a reference.
float submergedShadow(vec3 pixel, vec3 neighbour) {
  float saltwater = smoothstep(.17,.38,neighbour.b-neighbour.r)
                  * (1.-smoothstep(.27,.48,neighbour.r/(neighbour.b+.01)))
                  * (1.-smoothstep(.59,.82,neighbour.g/(neighbour.b+.01)));
  vec2 drop = (neighbour.gb - pixel.gb) / max(neighbour.gb,vec2(.13,.24));
  return saltwater * smoothstep(.21,.56,min(drop.x,drop.y));
}

float grain(vec2 cell) {
  vec3 p = fract(vec3(cell.xyx) * .1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float letterInk(float code, vec2 local) {
  float index = code - 32.;
  vec2 tile = vec2(mod(index, 16.), floor(index / 16.));
  return texture2D(u_letters, (tile + clamp(local, .022, .978)) / vec2(16., 6.)).r;
}

float bodyLetter(float tone, float slopeX, float slopeY, float random) {
  if (max(abs(slopeX), abs(slopeY)) > .11 && random > .36) {
    if (abs(slopeX) > 2.8 * abs(slopeY)) return 124.; // |
    if (abs(slopeY) > 2.8 * abs(slopeX)) return 61.;  // =
    return slopeX * slopeY > 0. ? 47. : 92.;           // / or backslash
  }
  if (tone < .13) return random > .52 ? 77. : 35.;   // M #
  if (tone < .29) return random > .45 ? 66. : 56.;   // B 8
  if (tone < .44) return random > .59 ? 83. : 88.;   // S X
  if (tone < .63) return random > .50 ? 101. : 111.; // e o
  if (tone < .80) return random > .47 ? 79. : 85.;   // O U
  return random > .55 ? 64. : 87.;                   // @ W, pearly highlights
}

vec3 silver(float tone) {
  vec3 back = mix(vec3(.16,.205,.23), vec3(.46,.50,.52), u_night);
  vec3 flank = mix(vec3(.61,.65,.67), vec3(.77,.80,.81), u_night);
  vec3 pearl = vec3(.984,.987,.976);
  vec3 metal = mix(back, flank, smoothstep(.04,.61,tone));
  return mix(metal, pearl, smoothstep(.48,.96,tone));
}

vec2 cameraUV(vec2 viewport) {
  vec2 uv = u_origin + viewport * u_span;
  // Fit the narrow ribbon of ripples above the focus, while the dolphin
  // itself keeps its filmed proportions below the upper fifth of the screen.
  uv.y -= max(0.,u_origin.y) * (1.-smoothstep(0.,.19,viewport.y));
  return uv;
}

void main() {
  vec2 cellCoord = v_screen * u_view / u_cell;
  vec2 cell = floor(cellCoord);
  vec2 local = fract(cellCoord);
  vec2 source = cameraUV(v_screen);
  vec2 cellSpan = u_cell / u_view * u_span;
  vec2 center = cameraUV((cell + .5) * u_cell / u_view);
  vec3 pixel = scene(source);
  vec3 middle = scene(center);
  float random = grain(cell);

  // Continue the water beyond the frame without repeating dolphins. When the
  // camera reaches an edge, the same boundary blend also covers the source side.
  vec2 border = min(source, 1. - source);
  float inFilm = smoothstep(-.001,.016,min(border.x,border.y));
  float body = neutralMaterial(pixel) * inFilm;
  float midBody = neutralMaterial(middle);
  float light = lightness(pixel);
  if (inFilm>.01 && source.y>.13 && pixel.b<.56 && pixel.g<.35 && body<.93) {
    float shade = max(submergedShadow(pixel,scene(source+vec2(.010,-.031))),
                      submergedShadow(pixel,scene(source+vec2(-.009,.030))));
    shade = max(shade, max(submergedShadow(pixel,scene(source+vec2(.021,.013))),
                           submergedShadow(pixel,scene(source-vec2(.022,.011)))));
    float deepSkin = (1.-smoothstep(.35,.56,pixel.b)) * smoothstep(.13,.24,source.y);
    body = max(body,inFilm * shade * deepSkin);
  }
  float foam = smoothstep(.37,.68,pixel.g)
             * smoothstep(.33,.70,pixel.r/(pixel.b+.01))
             * smoothstep(.62,.87,pixel.g/(pixel.b+.01));
  body = max(body,foam*inFilm);
  float waterLevel = smoothstep(.12,.48,light);
  float waterDepth = clamp(source.y, 0., 1.48);
  float exterior = 1. - smoothstep(-.15, 0., min(border.x,border.y));
  waterLevel = mix(waterLevel * (1.-.65*neutralMaterial(pixel)), .27, exterior);

  float sun = clamp(.32 + .28*(1.-waterDepth) + .38*waterLevel, 0., 1.);
  vec3 deep = mix(vec3(.555,.735,.806), vec3(.072,.135,.164), u_night);
  vec3 shallow = mix(vec3(.858,.938,.960), vec3(.223,.333,.368), u_night);
  vec3 water = mix(deep, shallow, sun);

  float shimmer = smoothstep(.13,.48,lightness(middle));
  float waterCode = 46.;
  if (random < .15 * shimmer) waterCode = 126.;
  else if (random < .34 * shimmer) waterCode = 58.;
  else if (random > .77) waterCode = 39.;
  float scatter = smoothstep(.55,.67,random + .35 * shimmer);
  float wetInk = letterInk(waterCode, local) * scatter;
  vec3 waterMark = mix(vec3(.31,.53,.62), vec3(.50,.62,.64), u_night);
  water = mix(water, waterMark, wetInk * (.16+.21*shimmer) * (1.-.56*exterior));

  vec3 colour = water;
  if (body > .005) {
    float tone = smoothstep(.085,.77,light);
    float centerTone = smoothstep(.085,.77,lightness(middle));
    float dx = lightness(scene(center+vec2(cellSpan.x*.56,0.))) - lightness(middle);
    float dy = lightness(scene(center+vec2(0.,cellSpan.y*.56))) - lightness(middle);
    float code = bodyLetter(mix(tone,centerTone,.78*midBody), dx, dy, random);
    float ink = letterInk(code, local);
    // A continuous silver wash carries the fine flukes between strokes.
    // The photographic light still modulates each individual character.
    float wash = .45 + .15 * abs(2.*tone-1.);
    vec3 silverBody = silver(tone);
    vec3 inkColour = silver(clamp(tone * 1.24 - .12, 0., 1.));
    // The milky aerated water around a surfacing dolphin is a soft mass,
    // with brighter character strokes catching its crests.
    float froth = foam * smoothstep(.44,.75,light);
    wash = mix(wash,.73,froth);
    silverBody = mix(silverBody,vec3(.94,.963,.973),froth*.72);
    inkColour = mix(inkColour,vec3(.996),froth);
    vec3 printed = mix(mix(water, silverBody, wash), inkColour, ink);
    colour = mix(water, printed, smoothstep(.025,.77,body));
  }
  gl_FragColor = vec4(colour,1.);
}
