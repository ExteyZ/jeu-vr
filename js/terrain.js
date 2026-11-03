// La vallée suisse : relief (prairies, forêts, montagnes enneigées) et lac.
// Le Complexe Delta est posé à plat au fond de la vallée ; le lac s'étend au nord.
// Les arbres sont dans arbres.js, l'herbe dans herbe.js, les plantes et rochers dans sousbois.js.
import * as THREE from 'three';
import { RAPIER, world, scene, infos, CG_MONDE } from './monde.js';
import { PROFIL, ULTRA } from './profil.js';

export const NIVEAU_LAC = -2.5;
export const LAC = { cx: 0, cz: -430, rx: 380, rz: 210 };
export const VILLAGE = { x: 445, z: -300 };
const VALLEE = { x: 0, z: -230 };
export const COMPLEXE = { x0: -40, x1: 38, z0: -34, z1: 30 };
// Zone détaillée (1,6 km de côté) : relief fin, collisions précises, forêt et végétation
export const INTERIEUR = { x: 0, z: -200, taille: 1600 };

// --- Bruit procédural (valeur lissée + fractales) ---
function hash2(ix, iz) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
function bruit(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  const ab = a + (b - a) * sx, cd = c + (d - c) * sx;
  return ab + (cd - ab) * sz;
}
export function fbm(x, z, octaves) {
  let s = 0, a = 0.5, f = 1, t = 0;
  for (let i = 0; i < octaves; i++) { s += a * bruit(x * f, z * f); t += a; a *= 0.5; f *= 2.03; }
  return s / t;
}
// Crêtes de montagne (bruit "ridged")
function crete(x, z, octaves) {
  let s = 0, a = 0.5, f = 1, t = 0, poids = 1;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(bruit(x * f, z * f) * 2 - 1);
    n *= n * poids;
    poids = Math.min(1, n * 1.6);
    s += a * n; t += a; a *= 0.5; f *= 2.07;
  }
  return s / t;
}
export const lisse = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const aleatoire = (i) => hash2(i * 7919, i * 104729 + 13);

export function distanceLac(x, z) {
  return Math.hypot((x - LAC.cx) / LAC.rx, (z - LAC.cz) / LAC.rz);   // 1 = sur la rive
}

// Hauteur du sol en (x, z)
export function hauteur(x, z) {
  // Prairies vallonnées, plus douces dans le couloir entre le complexe et le lac (pour voir le lac en sortant)
  const couloir = 0.2 + 0.8 * lisse(50, 190, Math.abs(x - 10)) + 0.8 * lisse(-40, 20, z);
  let h = ((fbm(x / 170, z / 170, 4) - 0.5) * 16 + (fbm(x / 38 + 50, z / 38, 3) - 0.5) * 2.5) * Math.min(1, couloir);
  h -= 2.2 * lisse(-40, -200, z) * (1 - lisse(120, 260, Math.abs(x)));   // le terrain descend doucement vers le lac
  // Montagnes, de plus en plus hautes en s'éloignant du fond de la vallée
  const r = Math.hypot(x - VALLEE.x, (z - VALLEE.z) / 1.4);
  const m = lisse(430, 1300, r);
  // (plus des ravines et arêtes rocheuses, de plus en plus marquées en altitude)
  if (m > 0) h += m * (crete(x / 950 + 3.1, z / 950 - 7.7, 6) * 1050 + fbm(x / 240, z / 240, 4) * 160 + (crete(x / 70 + 11, z / 70 - 4, 3) - 0.35) * 46 * m);
  // Lac : un bassin profond, et des rives toujours au-dessus de l'eau
  const dl = distanceLac(x, z);
  if (dl < 1) {
    h = NIVEAU_LAC - 0.8 - 40 * Math.pow(lisse(1, 0.15, dl), 0.8);
  } else {
    h = Math.max(h, NIVEAU_LAC + 0.45);
    if (dl < 1.35) h = NIVEAU_LAC + 0.45 + (h - NIVEAU_LAC - 0.45) * lisse(1, 1.35, dl);
  }
  // Le complexe est construit sur un terrain parfaitement plat
  const dx = Math.max(COMPLEXE.x0 - x, 0, x - COMPLEXE.x1), dz = Math.max(COMPLEXE.z0 - z, 0, z - COMPLEXE.z1);
  const w = 1 - lisse(0, 35, Math.hypot(dx, dz));
  h = h * (1 - w);
  // Le village est sur un replat
  const dv = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
  const wv = 1 - lisse(70, 140, dv);
  if (wv > 0) h = h * (1 - wv) + Math.max(NIVEAU_LAC + 3, hauteurBrute(VILLAGE.x, VILLAGE.z)) * wv;
  return h;
}
function hauteurBrute(x, z) { return (fbm(x / 170, z / 170, 4) - 0.5) * 16; }

export function pente(x, z) {
  const e = 2;
  const nx = hauteur(x - e, z) - hauteur(x + e, z), nz = hauteur(x, z - e) - hauteur(x, z + e);
  const n = new THREE.Vector3(nx, 2 * e, nz).normalize();
  return 1 - n.y;
}

// Endroits où l'on ne met ni arbres ni végétation haute (bâtiments, lac, village, chemin du ponton)
export function zoneLibre(x, z, marge = 25) {
  if (x > COMPLEXE.x0 - marge && x < COMPLEXE.x1 + marge && z > COMPLEXE.z0 - marge && z < COMPLEXE.z1 + marge) return false;
  if (distanceLac(x, z) < 1.08) return false;
  if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 120) return false;
  if (Math.abs(x - 40) < 12 && z < -150 && z > -260) return false;   // chemin du ponton
  return true;
}

// Densité de forêt (0 = prairie, 1 = forêt dense) : des massifs de sapins, jusqu'à la limite des arbres
export function densiteForet(x, z, y = hauteur(x, z)) {
  const f = fbm(x / 110 + 17, z / 110 - 3, 3) + (fbm(x / 23 + 4, z / 23 + 9, 2) - 0.5) * 0.12;
  return lisse(0.44, 0.58, f) * (1 - lisse(300, 380, y));
}

// --- Relief : maillage + collision (une zone détaillée et un grand anneau lointain) ---
const grilles = [];
function grille(centreX, centreZ, taille, segments, abaisserInterieur = null) {
  const n = segments + 1;
  const hauteurs = new Float32Array(n * n);
  const pas = taille / segments;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      const x = centreX - taille / 2 + k * pas, z = centreZ - taille / 2 + i * pas;
      let y = hauteur(x, z);
      if (abaisserInterieur && Math.abs(x - abaisserInterieur.x) < abaisserInterieur.demi - pas && Math.abs(z - abaisserInterieur.z) < abaisserInterieur.demi - pas) y -= 12;
      hauteurs[i * n + k] = y;
    }
  }
  const g = { hauteurs, n, pas, x0: centreX - taille / 2, z0: centreZ - taille / 2, taille };
  grilles.push(g);
  return g;
}

// Hauteur exacte de la surface affichée (mêmes triangles que le maillage) : pour poser arbres et plantes
export function hauteurSol(x, z) {
  for (const g of grilles) {
    const fx0 = (x - g.x0) / g.pas, fz0 = (z - g.z0) / g.pas;
    const k = Math.floor(fx0), l = Math.floor(fz0);
    if (k < 0 || l < 0 || k >= g.n - 1 || l >= g.n - 1) continue;
    const fx = fx0 - k, fz = fz0 - l, H = g.hauteurs, n = g.n;
    const ha = H[l * n + k], hb = H[(l + 1) * n + k], hc = H[(l + 1) * n + k + 1], hd = H[l * n + k + 1];
    return fx + fz <= 1 ? ha + (hd - ha) * fx + (hb - ha) * fz : hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fz);
  }
  return hauteur(x, z);
}
export const grilleInterieure = () => grilles[0];

function maillageRelief(g, materiau) {
  const geo = new THREE.PlaneGeometry(g.taille, g.taille, g.n - 1, g.n - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  // Nature du sol à chaque sommet : densité de forêt, et variation des prairies (plus ou moins vertes)
  const sol = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    // PlaneGeometry tournée : les sommets vont de -z à +z ligne par ligne, et de -x à +x
    const k = i % g.n, ligne = Math.floor(i / g.n);
    const x = g.x0 + k * g.pas, z = g.z0 + ligne * g.pas, y = g.hauteurs[ligne * g.n + k];
    pos.setXYZ(i, x, y, z);
    sol[i * 2] = zoneLibre(x, z, 4) ? densiteForet(x, z, y) : 0;
    sol[i * 2 + 1] = fbm(x / 60 + 31, z / 60 - 12, 3);
  }
  geo.setAttribute('aSol', new THREE.BufferAttribute(sol, 2));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, materiau);
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);
  return mesh;
}

function collisionRelief(g) {
  // Rapier : hauteurs rangées colonne par colonne (lignes = axe X, colonnes = axe Z)
  const n = g.n, h = new Float32Array(n * n);
  for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) h[k * n + i] = g.hauteurs[i * n + k];
  const corps = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(g.x0 + g.taille / 2, 0, g.z0 + g.taille / 2));
  const c = world.createCollider(RAPIER.ColliderDesc.heightfield(n - 1, n - 1, h, { x: g.taille, y: 1, z: g.taille })
    .setFriction(0.9).setCollisionGroups(CG_MONDE), corps);
  infos.set(c.handle, { decor: { colliders: [c], son: 'herbe' } });
  return c;
}

// Matériau du relief : sept sols photo (prairie, sol forestier vert, aiguilles de sapin, roche moussue, falaise,
// neige, galets) mélangés selon la forêt, la pente et l'altitude, avec leur relief (cartes de normales).
function materiauRelief(t) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  m.defines = { ULTRA: ULTRA ? 1 : 0 };
  m.onBeforeCompile = (shader) => {
    const u = shader.uniforms;
    for (const [nom, mat] of Object.entries(t)) {
      u['c_' + nom] = { value: mat.map };
      u['n_' + nom] = { value: mat.normalMap ?? mat.map };
    }
    u.niveauLac = { value: NIVEAU_LAC };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aSol;\nvarying vec2 vSol;\nvarying vec3 vMonde;\nvarying vec3 vNormaleMonde;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSol = aSol;\nvMonde = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvNormaleMonde = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D c_herbe, c_solVert, c_foret, c_mousse, c_roche, c_neige, c_galets;
uniform sampler2D n_herbe, n_foret, n_mousse, n_roche;
uniform float niveauLac;
varying vec2 vSol; varying vec3 vMonde; varying vec3 vNormaleMonde;
vec3 perturbation = vec3(0.0);
// Deux échelles mélangées : moins de répétition visible au loin
vec3 echant(sampler2D t, vec2 p, float s) {
#if ULTRA
  return mix(texture2D(t, p / s).rgb, texture2D(t, p / (s * 4.7)).rgb, 0.35);
#else
  return texture2D(t, p / s).rgb;
#endif
}
vec2 relief(sampler2D t, vec2 p, float s) { return texture2D(t, p / s).xy * 2.0 - 1.0; }`)
      .replace('#include <map_fragment>', `
vec3 nG = normalize(vNormaleMonde);
float penteSol = 1.0 - nG.y;
float foret = vSol.x, variation = vSol.y;
float dist = length(vMonde - cameraPosition);
// Prairie alpine : herbe et sol vert, plus ou moins secs selon l'endroit
vec3 herbe = echant(c_herbe, vMonde.xz, 2.5);
vec3 solVert = echant(c_solVert, vMonde.xz, 3.0);
vec3 prairie = mix(herbe, solVert, smoothstep(0.55, 0.85, variation) * 0.7);
prairie *= mix(vec3(0.27, 0.5, 0.15), vec3(0.4, 0.58, 0.2), smoothstep(0.3, 0.75, variation));
// Sous les sapins : tapis d'aiguilles brunes
vec3 aiguilles = echant(c_foret, vMonde.xz, 2.5);
// Roches : moussue dans les pentes moyennes, falaise grise projetée sur trois axes dans les pentes fortes
vec3 poidsAxes = pow(abs(nG), vec3(4.0)); poidsAxes /= (poidsAxes.x + poidsAxes.y + poidsAxes.z);
vec3 roche = texture2D(c_roche, vMonde.zy / 9.0).rgb * poidsAxes.x + echant(c_roche, vMonde.xz, 9.0) * poidsAxes.y + texture2D(c_roche, vMonde.xy / 9.0).rgb * poidsAxes.z;
// Au loin, la roche est vue à grande échelle (pas de motif répété sur les montagnes)
float loin = smoothstep(120.0, 700.0, dist);
#if ULTRA
vec3 rocheLoin = texture2D(c_roche, vMonde.zy / 310.0).rgb * poidsAxes.x + texture2D(c_roche, vMonde.xz / 310.0).rgb * poidsAxes.y + texture2D(c_roche, vMonde.xy / 310.0).rgb * poidsAxes.z;
roche = mix(roche, mix(vec3(0.3, 0.3, 0.29), rocheLoin * 0.8, 0.45), loin);
#else
roche = mix(roche, vec3(0.32, 0.31, 0.3), loin * 0.85);
#endif
vec3 mousse = echant(c_mousse, vMonde.xz, 4.0);
vec3 neige = echant(c_neige, vMonde.xz, 3.0) * 0.86;
vec3 galets = echant(c_galets, vMonde.xz, 2.0) * 0.72;
float wForet = smoothstep(0.25, 0.75, foret);
float wMousse = smoothstep(0.16, 0.3, penteSol + (variation - 0.5) * 0.08);
// En bas des montagnes, seules les vraies falaises sont en roche nue : le reste est vert (comme dans les Alpes)
float altitudeRoche = smoothstep(70.0, 260.0, vMonde.y);
float wRoche = smoothstep(mix(0.5, 0.33, altitudeRoche), mix(0.68, 0.5, altitudeRoche), penteSol + (variation - 0.5) * 0.06);
float hauteurNeige = 800.0 + variation * 160.0;
float wNeige = smoothstep(hauteurNeige, hauteurNeige + 90.0, vMonde.y) * (1.0 - smoothstep(0.3, 0.5, penteSol));
float wGalets = 1.0 - smoothstep(niveauLac + 0.6, niveauLac + 1.5, vMonde.y + (variation - 0.5) * 0.6);
// Vus de loin : les prairies sont plus sombres et les forêts forment des masses vert foncé (la cime des sapins)
prairie *= mix(vec3(1.0), vec3(0.6, 0.74, 0.56), loin);
aiguilles = mix(aiguilles, vec3(0.05, 0.085, 0.045), loin * 0.85);
vec3 couleur = mix(prairie, aiguilles, wForet);
couleur = mix(couleur, mousse, wMousse);
couleur = mix(couleur, roche, wRoche);
couleur = mix(couleur, galets, wGalets);
couleur = mix(couleur, neige, wNeige);
// Grandes taches plus claires / plus sombres (le relief n'a pas partout la même couleur)
float macro = 0.5 + 0.5 * sin(vMonde.x * 0.0061 + sin(vMonde.z * 0.0043) * 2.3) * sin(vMonde.z * 0.0052 + vMonde.x * 0.0017);
couleur *= 0.84 + 0.32 * macro;
// Lumière ambiante plus faible sous les arbres, sol plus sombre sous l'eau
couleur *= 1.0 - 0.18 * wForet;
couleur *= mix(vec3(1.0), vec3(0.42, 0.58, 0.62), smoothstep(niveauLac, niveauLac - 6.0, vMonde.y));
diffuseColor.rgb *= couleur;
#if ULTRA
// Relief des sols (cartes de normales), plus faible au loin
float fondu = 1.0 - smoothstep(25.0, 120.0, dist);
vec2 r = mix(relief(n_herbe, vMonde.xz, 2.5), relief(n_foret, vMonde.xz, 2.5), wForet);
r = mix(r, relief(n_mousse, vMonde.xz, 4.0), wMousse);
r = mix(r, relief(n_roche, vMonde.xz, 9.0), wRoche) * (1.0 - wNeige * 0.7);
perturbation = vec3(r.x, 0.0, -r.y) * 0.9 * fondu;
// Au loin : grand relief des montagnes (ravines, arêtes) donné par la roche vue à très grande échelle
vec2 rl = relief(n_roche, vMonde.xz, 260.0) + relief(n_roche, vMonde.zx + 71.0, 97.0) * 0.6;
perturbation += vec3(rl.x, 0.0, -rl.y) * 0.55 * loin;
#endif`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#if ULTRA
normal = normalize((viewMatrix * vec4(normalize(nG + perturbation), 0.0)).xyz);
#endif`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(mix(roughnessFactor, 0.8, wRoche), 0.6, wNeige);`);
  };
  return m;
}

// --- Construction ---
export function construireTerrain(textures) {
  const materiau = materiauRelief(textures);
  const gInt = grille(INTERIEUR.x, INTERIEUR.z, INTERIEUR.taille, PROFIL.segmentsRelief);
  maillageRelief(gInt, materiau);
  collisionRelief(gInt);
  // Grand anneau lointain (8 km) : les montagnes autour de la vallée
  const gExt = grille(INTERIEUR.x, INTERIEUR.z, 8000, ULTRA ? 320 : 128, { x: INTERIEUR.x, z: INTERIEUR.z, demi: INTERIEUR.taille / 2 });
  maillageRelief(gExt, materiau);
  collisionRelief(gExt);
}
