// Herbe : des dizaines de milliers de touffes autour du joueur (chacune porte une quarantaine de brins dessinés),
// posées exactement sur le relief, plus ou moins denses selon le terrain, qui ondulent au vent et s'écartent
// quand on marche dedans. Les touffes sont toujours les mêmes : celles qui sortent derrière le joueur réapparaissent
// devant lui (calcul fait par la carte graphique).
import * as THREE from 'three';
import { scene } from './monde.js';
import { horsReflet } from './eau.js';
import { PROFIL, ULTRA } from './profil.js';
import { grilleInterieure, fbm, lisse, distanceLac, densiteForet, COMPLEXE, VILLAGE, NIVEAU_LAC } from './terrain.js';
import { opaciteLointaine } from './arbres.js';
import { positionsChalets } from './village.js';

const CHALETS = positionsChalets();
const uniformes = {
  temps: { value: 0 }, centre: { value: new THREE.Vector3() }, pieds: { value: new THREE.Vector3(0, -1000, 0) },
  tSol: { value: null }, origine: { value: new THREE.Vector2() }, pas: { value: 1 }, n: { value: 1 },
};

// Densité d'herbe à chaque point de la grille du relief (0 = pas d'herbe)
function densiteHerbe(x, z, y, penteSol) {
  if (x > COMPLEXE.x0 - 1 && x < COMPLEXE.x1 + 1 && z > COMPLEXE.z0 - 1 && z < COMPLEXE.z1 + 1) return 0;
  if (distanceLac(x, z) < 1.02 || y < NIVEAU_LAC + 0.9) return 0;
  if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 9) return 0;                 // place de la fontaine
  for (const c of CHALETS) if (Math.hypot(x - c.x, z - c.z) < Math.max(c.l, c.p) * 0.62) return 0;
  if (Math.abs(x - 40) < 2.5 && z < -150 && z > -262) return 0;   // chemin du ponton
  let d = 1 - lisse(0.38, 0.58, penteSol);   // l'herbe tient aussi dans les pentes raides (alpages)
  d *= 1 - lisse(290, 400, y);
  d *= 1 - 0.88 * densiteForet(x, z, y);
  d *= 0.8 + 0.2 * lisse(0.3, 0.6, fbm(x / 14 + 3, z / 14 - 8, 3));
  return d;
}

function texturesol() {
  const g = grilleInterieure();
  const n = g.n, donnees = new Float32Array(n * n * 4);
  for (let l = 0; l < n; l++) for (let k = 0; k < n; k++) {
    const H = g.hauteurs, i = l * n + k;
    const kx = Math.min(n - 2, k), lz = Math.min(n - 2, l);
    const dx = (H[lz * n + kx + 1] - H[lz * n + kx]) / g.pas, dz = (H[(lz + 1) * n + kx] - H[lz * n + kx]) / g.pas;
    const penteSol = 1 - 1 / Math.sqrt(1 + dx * dx + dz * dz);
    const x = g.x0 + k * g.pas, z = g.z0 + l * g.pas;
    donnees[i * 4] = H[i];
    donnees[i * 4 + 1] = densiteHerbe(x, z, H[i], penteSol);
    donnees[i * 4 + 2] = fbm(x / 40 - 7, z / 40 + 2, 2);   // zones plus sèches (herbe jaunie)
  }
  const t = new THREE.DataTexture(donnees, n, n, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  uniformes.tSol.value = t;
  uniformes.origine.value.set(g.x0, g.z0);
  uniformes.pas.value = g.pas;
  uniformes.n.value = n;
}

// Planche de 4 touffes d'herbe dessinées : brins effilés et courbés, sombres au pied, quelques brins secs
function plancheTouffes() {
  const L = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = L; c.height = H;
  const g = c.getContext('2d');
  for (let t = 0; t < 4; t++) {
    const x0 = (t % 2) * 512, y0 = Math.floor(t / 2) * 256, w = 512, h = 256;
    const seche = t === 3 ? 0.35 : 0.08;
    for (let i = 0; i < 70; i++) {
      const bx = x0 + w * (0.06 + Math.random() * 0.88);
      const hb = h * (0.3 + Math.pow(Math.random(), 0.6) * 0.68);
      const penche = (Math.random() - 0.5) * hb * 0.55 + (bx - x0 - w / 2) * 0.12;
      const larg = 3 + Math.random() * 5;
      const sec = Math.random() < seche;
      const deg = g.createLinearGradient(0, y0 + h, 0, y0 + h - hb);
      const teinte = 74 + Math.random() * 28, lum = 20 + Math.random() * 15;
      deg.addColorStop(0, '#0b1405');
      deg.addColorStop(0.35, sec ? `hsl(45, 30%, ${lum}%)` : `hsl(${teinte}, 62%, ${lum * 0.75}%)`);
      deg.addColorStop(1, sec ? `hsl(48, 38%, ${lum + 20}%)` : `hsl(${teinte - 10}, 58%, ${lum + 11}%)`);
      g.fillStyle = deg;
      const bas = y0 + h, haut = y0 + h - hb;
      g.beginPath();
      g.moveTo(bx - larg / 2, bas);
      g.quadraticCurveTo(bx - larg * 0.3 + penche * 0.2, bas - hb * 0.55, bx + penche, haut);
      g.quadraticCurveTo(bx + larg * 0.3 + penche * 0.2, bas - hb * 0.55, bx + larg / 2, bas);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ULTRA ? 8 : 2;
  return t;
}

// Une touffe : deux panneaux croisés, découpés en 2 étages pour pouvoir se courber
function geometrieTouffe() {
  const pos = [], uv = [], nor = [], idx = [];
  for (const a of [0, Math.PI / 2]) {
    const dx = Math.cos(a), dz = Math.sin(a), base = pos.length / 3;
    for (let j = 0; j <= 2; j++) for (const s of [-0.5, 0.5]) {
      pos.push(dx * s, j / 2, dz * s);
      uv.push(s + 0.5, j / 2);
      nor.push(0, 1, 0);
    }
    for (let j = 0; j < 2; j++) { const b = base + j * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}

export function construireHerbe() {
  texturesol();
  const planche = plancheTouffes();
  const { touffes, rayon } = PROFIL.herbe;
  coucheHerbe(planche, { touffes, rayon, interieur: 0, grossissement: 1 });
  // Ultra : deuxième couche, plus clairsemée et à plus grosses touffes, jusqu'à 80 m (la prairie reste une prairie au loin)
  if (ULTRA) coucheHerbe(planche, { touffes: 26000, rayon: 80, interieur: rayon * 0.75, grossissement: 1.7 });
}

function coucheHerbe(planche, { touffes, rayon, interieur, grossissement }) {
  const T = rayon * 2;
  const geo = geometrieTouffe();
  const racines = new Float32Array(touffes * 4);
  for (let i = 0; i < touffes; i++) {
    racines[i * 4] = Math.random() * T;
    racines[i * 4 + 1] = Math.random() * T;
    racines[i * 4 + 2] = Math.random() * Math.PI * 2;
    racines[i * 4 + 3] = Math.random();
  }
  geo.setAttribute('aRacine', new THREE.InstancedBufferAttribute(racines, 4));
  geo.instanceCount = touffes;

  const m = new THREE.MeshStandardMaterial({ map: planche, alphaTest: 0.4, alphaToCoverage: ULTRA, side: THREE.DoubleSide,
    roughness: 0.8, metalness: 0, envMapIntensity: 0.3 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniformes, { taille: { value: T } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aRacine;
uniform float temps, pas, taille, n;
uniform vec3 centre, pieds;
uniform vec2 origine;
uniform highp sampler2D tSol;
varying float vSec, vHaut;
float solEn(ivec2 c, int canal) { c = clamp(c, ivec2(0), ivec2(int(n) - 1)); return texelFetch(tSol, c, 0)[canal]; }`)
      .replace('#include <beginnormal_vertex>', `
// Position de la touffe : la copie la plus proche du joueur dans une grille qui se répète
vec2 rel = mod(aRacine.xy - centre.xz + 0.5 * taille, taille) - 0.5 * taille;
vec2 monde = centre.xz + rel;
vec2 g = (monde - origine) / pas;
ivec2 c = ivec2(floor(g));
vec2 f = g - vec2(c);
float ha = solEn(c, 0), hb = solEn(c + ivec2(0, 1), 0), hc = solEn(c + ivec2(1, 1), 0), hd = solEn(c + ivec2(1, 0), 0);
float sol = (f.x + f.y <= 1.0) ? ha + (hd - ha) * f.x + (hb - ha) * f.y : hc + (hb - hc) * (1.0 - f.x) + (hd - hc) * (1.0 - f.y);
float densite = mix(mix(solEn(c, 1), solEn(c + ivec2(1, 0), 1), f.x), mix(solEn(c + ivec2(0, 1), 1), solEn(c + ivec2(1, 1), 1), f.x), f.y);
vSec = solEn(c, 2);
float dist = length(rel);
float echelle = (aRacine.w < densite ? 1.0 : 0.0) * (1.0 - smoothstep(${(rayon * 0.62).toFixed(1)}, ${rayon.toFixed(1)}, dist))
  * ${interieur > 0 ? `smoothstep(${(interieur * 0.7).toFixed(1)}, ${interieur.toFixed(1)}, dist)` : '1.0'};
float tirage = fract(aRacine.w * 91.7);
float hauteurTouffe = (0.26 + tirage * 0.3) * (0.6 + 0.4 * densite) * echelle * ${Math.sqrt(grossissement).toFixed(2)};
float largeurTouffe = (0.42 + fract(aRacine.w * 37.1) * 0.3) * echelle * ${grossissement.toFixed(2)};
float ca = cos(aRacine.z), sa = sin(aRacine.z);
// Vent : ondulation + rafales qui traversent la prairie
float rafale = sin(temps * 0.9 + monde.x * 0.045 + monde.y * 0.03) * 0.5 + 0.5;
vec2 vent = vec2(0.8, 0.45) * (0.05 + 0.22 * rafale * rafale) * (0.6 + 0.4 * sin(temps * 2.6 + monde.x * 0.7 + monde.y * 0.5));
// Les brins s'écartent sous les pieds du joueur
vec2 ecart = monde - pieds.xz;
float pres = (1.0 - smoothstep(0.2, 0.9, length(ecart))) * (1.0 - smoothstep(0.4, 1.4, abs(pieds.y - sol)));
vec2 plie = vent + normalize(ecart + 1e-4) * pres * 0.9;
vec3 objectNormal = normalize(vec3(plie.x * 0.4, 1.0, plie.y * 0.4));
#ifdef USE_TANGENT
vec3 objectTangent = vec3(1.0, 0.0, 0.0);
#endif`)
      .replace('#include <begin_vertex>', `
float v = position.y;
vHaut = v;
vec3 transformed = vec3(monde.x, sol - 0.03, monde.y);
transformed.xz += vec2(position.x * ca - position.z * sa, position.x * sa + position.z * ca) * largeurTouffe + plie * v * v * hauteurTouffe;
transformed.y += v * hauteurTouffe * (1.0 - 0.3 * min(1.0, length(plie)) * v);`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
vMapUv = vec2((vMapUv.x + mod(floor(aRacine.w * 4.0), 2.0)) * 0.5, (vMapUv.y + floor(fract(aRacine.w * 4.0) * 2.0)) * 0.5);`);
    shader.fragmentShader = opaciteLointaine(shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSec, vHaut;')
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.35, 1.15, 0.55), smoothstep(0.55, 0.8, vSec) * 0.6);
diffuseColor.rgb *= 0.55 + 0.45 * vHaut;`)
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '')), 'map', 'vMapUv');
  };
  const herbe = new THREE.Mesh(geo, m);
  herbe.frustumCulled = false;
  herbe.receiveShadow = ULTRA;
  herbe.userData.sansAO = true;
  scene.add(herbe);
  horsReflet.add(herbe);
  return herbe;
}

export function majHerbe(t, tete, piedsJoueur) {
  uniformes.temps.value = t;
  uniformes.centre.value.copy(tete);
  uniformes.pieds.value.copy(piedsJoueur);
}
