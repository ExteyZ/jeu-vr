// La ville au bord du lac (rive sud) : quai en pierre et promenade, port avec pontons et barques, grande place pavée
// ouverte sur le lac (fontaine, terrasses de café, église), et quatre rangées de maisons qui suivent la courbe de la
// rive, séparées par des rues pavées avec leurs trottoirs. Chaque maison a de vrais murs épais percés de fenêtres
// (embrasures avec leur ombre), un toit à deux pans, à pignon sur rue ou à quatre pans (avec lucarnes, cheminées,
// avant-toits), des volets, balcons, jardinières de géraniums, chaînes d'angle en pierre et boutiques à stores.
//
//        LAC (nord, -z)
//   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//    quai ─ promenade (suit la rive) ─────── port (pontons)
//   [maisons] rue [maisons]  PLACE   [maisons] rue
//   [maisons] rue [maisons] (église) [maisons] rue
//        colline et hameau de chalets (sud, +z)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene, creerObjet, uvMonde, fusionnerDecor } from './monde.js';
import { ressources } from './ressources.js';
import { texturePanneau } from './materiaux.js';
import { materiauxCarte, objetModele, balle, caisse, carton, baril, marteau, lampeTorche, lanceBalles, voiture, animations } from './carte.js';
import { creerBarque } from './village.js';
import { NIVEAU_LAC, riveSud, VILLE } from './terrain.js';
import { opaciteLointaine } from './arbres.js';
import { ULTRA } from './profil.js';

const QUAI = 13;                  // largeur de la promenade, de la rive aux premières façades
const PROF = 13, RUE = 9;         // profondeur des maisons, largeur des rues
const RANGEES = 4;
const TRAVERSES = [-232, -150, -66, 66, 150, 232];    // rues perpendiculaires au lac (centre)
const PLACE = { x0: -61.5, x1: 61.5 };
const ETAGE = 3.1, SOCLE = 0.7, MUR = 0.3;            // hauteur d'un étage, du socle en pierre, épaisseur des murs
const COULEURS = [0xf1e6cf, 0xe6c07a, 0xe8bba9, 0xcfdcbf, 0xc6d5e2, 0xf4f1ea, 0xeed58a, 0xe8a98a, 0xdcd3c0, 0xd9c2d6, 0xf3ece0, 0xe9dcc0];
const COULEURS_VOLETS = [0x2f5d3a, 0x7a2b25, 0x2d4c66, 0x5b5f63, 0x6b4a2f, 0x3d6b5f];
const COULEURS_STORES = [0x9c2b2b, 0x2d5f3c, 0x2b4a7a, 0x8a6b1e, 0x6b2b5f];
const COULEURS_FLEURS = [0xd01e2c, 0xe03c78, 0xf2efe8, 0xd8441c, 0xc81a4a];
// Façade (côté lac) de la rangée r à l'abscisse x : les rangées suivent la courbe de la rive
const zRang = (x, r) => riveSud(x) + QUAI + r * (PROF + RUE);
const zRue = (x, r) => zRang(x, r) + PROF + RUE / 2;   // milieu de la rue derrière la rangée r
const penteRive = (x) => (riveSud(x + 1) - riveSud(x - 1)) / 2;

let M, P, V;
const lots = new Map();     // morceaux de décor à fusionner, par matériau
const hasard = (() => { let s = 12345; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; })();
const choisir = (liste) => liste[Math.floor(hasard() * liste.length)];

// --- Petites briques ---
function boite(materiau, [sx, sy, sz], [x, y, z], rotY = 0, couleur = null) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  uvMonde(g, [sx, sy, sz], materiau.userData?.tuile ?? 1);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  ajouterAuLot(materiau, g, couleur);
}
function ajouterAuLot(materiau, g, couleur = null) {
  if (g.index) g = g.toNonIndexed();
  if (materiau.vertexColors) {
    const c = new THREE.Color(couleur ?? 0xffffff), n = g.attributes.position.count, tab = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { tab[i * 3] = c.r; tab[i * 3 + 1] = c.g; tab[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(tab, 3));
  }
  for (const nom of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(nom)) g.deleteAttribute(nom);
  if (!lots.has(materiau)) lots.set(materiau, []);
  lots.get(materiau).push(g);
}
function fusionnerLots() {
  for (const [materiau, geos] of lots) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), materiau);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
  }
  lots.clear();
}
function solide(taille, pos, rotY = 0, son = 'pierre') {
  return creerObjet({ pos, rot: [0, rotY, 0], son, formes: [{ type: 'boite', taille, cache: true }] });
}
// Plan horizontal (sol) avec une texture à sa taille réelle
function sol(materiau, x0, x1, z0, z1, y) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv, t = materiau.userData?.tuile ?? 2;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) / t, uv.getY(i) * (z1 - z0) / t);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const m = new THREE.Mesh(g, materiau);
  m.receiveShadow = true;
  scene.add(m);
}

// --- Repère d'une maison : x le long de la rue, z vers l'arrière (la façade avant est en z = 0, tournée vers -z).
// Les maisons suivent la courbe de la rive : chacune est construite dans son repère, puis tournée et posée.
const repere = new THREE.Matrix4(), vTmp = new THREE.Vector3();
let angle = 0;
function placerRepere(x, z, a) { angle = -a; repere.makeRotationY(-a).setPosition(x, 0, z); }
// Texture "plaquée" selon l'orientation de chaque face, en coordonnées de la maison : le plâtre et la pierre
// continuent d'un morceau de mur à l'autre, sans raccord visible
function uvPlaques(g, t) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i) / t, p.getZ(i) / t);
    else if (ax >= az) uv.setXY(i, p.getZ(i) / t, p.getY(i) / t);
    else uv.setXY(i, p.getX(i) / t, p.getY(i) / t);
  }
}
// Pavé droit dans le repère de la maison, de [x0, x1] × [y0, y1] × [z0, z1]
function bloc(materiau, [x0, x1], [y0, y1], [z0, z1], couleur = null) {
  if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3 || z1 - z0 < 1e-3) return;
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  uvPlaques(g, materiau.userData?.tuile ?? 1);
  g.applyMatrix4(repere);
  ajouterAuLot(materiau, g, couleur);
}
// Polygone plat (convexe, sommets tournant dans le sens inverse des aiguilles d'une montre vu de dehors),
// dans le repère de la maison, avec la texture à sa taille réelle (rangs de tuiles parallèles au bord du toit)
function poly(materiau, points, couleur = null, axeU = [1, 0, 0]) {
  const P = points.map((p) => new THREE.Vector3(...p));
  const n = new THREE.Vector3().subVectors(P[1], P[0]).cross(new THREE.Vector3().subVectors(P[2], P[0])).normalize();
  const u = new THREE.Vector3(...axeU);
  u.addScaledVector(n, -u.dot(n));
  if (u.lengthSq() < 1e-6) u.set(0, 0, 1).addScaledVector(n, -n.z);
  u.normalize();
  const v = new THREE.Vector3().crossVectors(n, u);
  if (v.y < -1e-4) { u.negate(); v.negate(); }
  const t = materiau.userData?.tuile ?? 2, pos = [], uv = [], nor = [];
  for (let i = 1; i + 1 < P.length; i++) for (const p of [P[0], P[i], P[i + 1]]) {
    pos.push(p.x, p.y, p.z); uv.push(p.dot(u) / t, p.dot(v) / t); nor.push(n.x, n.y, n.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.applyMatrix4(repere);
  ajouterAuLot(materiau, g, couleur);
}
// Planche (rive de toit) entre deux points du repère de la maison
function planche(materiau, a, b, epaisseur = 0.06, largeur = 0.24) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), l = A.distanceTo(B);
  const g = new THREE.BoxGeometry(epaisseur, largeur, l);
  uvMonde(g, [epaisseur, largeur, l], materiau.userData?.tuile ?? 1);
  const m = new THREE.Matrix4().lookAt(B, A, new THREE.Vector3(0, 1, 0)).setPosition(A.clone().add(B).multiplyScalar(0.5));
  g.applyMatrix4(m).applyMatrix4(repere);
  ajouterAuLot(materiau, g);
}
function solideLocal(taille, [x, y, z]) {
  vTmp.set(x, y, z).applyMatrix4(repere);
  solide(taille, [vTmp.x, vTmp.y, vTmp.z], angle);
}

// --- Matériaux de la ville ---
function materiaux() {
  M = materiauxCarte();
  P = ressources.materiaux;
  const copie = (m, couleur, extra = {}) => { const n = (m ?? new THREE.MeshStandardMaterial({ roughness: 0.9 })).clone(); if (couleur !== undefined) n.color.set(couleur); n.userData = { ...(m?.userData ?? { tuile: 2 }) }; Object.assign(n, extra); return n; };
  return {
    facade: copie(P.facade ?? M.blanc, 0xffffff, { vertexColors: true }),
    socle: copie(P.quai ?? M.beton, 0xb9b2a6),
    pierreBlanche: copie(P.facade ?? M.blanc, 0xe9e4da),
    quai: copie(P.quai ?? M.beton, 0xcfc8bc),
    dalles: copie(P.dalles ?? M.beton, 0xd8d4cc),
    pavage: copie(P.pavage ?? M.beton, 0xc9c3b9),
    place: copie(P.dalles ?? M.beton, 0xbcbec0),
    granit: copie(P.dalles ?? M.beton, 0x8e8d8a),
    tuiles: copie(P.tuiles ?? M.tour, 0xd9a07a, { side: THREE.DoubleSide }),
    ardoises: copie(P.ardoises ?? M.tour, 0x9aa0a8, { side: THREE.DoubleSide }),
    bois: copie(P.bois2 ?? M.bois, 0x8a7a68),
    boisPeint: copie(P.bois2 ?? M.bois, 0x5b4a3c),
    fer: new THREE.MeshStandardMaterial({ color: 0x1f2226, roughness: 0.45, metalness: 0.7 }),
    vitre: new THREE.MeshStandardMaterial({ color: 0x1b242c, roughness: 0.04, metalness: 0.2, envMapIntensity: 1.6 }),
    cadre: new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.55 }),
    volet: copie(P.bois2 ?? M.bois, 0xffffff),
    porte: copie(P.bois2 ?? M.bois, 0x5a3a26),
    vitrine: new THREE.MeshStandardMaterial({ color: 0x24302a, roughness: 0.5 }),
    store: new THREE.MeshStandardMaterial({ map: textureStore(), roughness: 0.85, side: THREE.DoubleSide }),
    lanterne: new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffd9a0, emissiveIntensity: 1.6 }),
    jardiniere: new THREE.MeshStandardMaterial({ color: 0x7a4a2c, roughness: 0.8 }),
    feuilles: new THREE.MeshStandardMaterial({ color: 0x2e5a1f, roughness: 0.85 }),
    fleurs: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }),
    eauFontaine: new THREE.MeshStandardMaterial({ color: 0x1f5c66, roughness: 0.05, metalness: 0.1, envMapIntensity: 1.4 }),
    eau: M.eau,
  };
}

function textureStore() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#c9c4ba'; g.fillRect(i * 16, 0, 16, 56); }
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#c9c4ba'; g.beginPath(); g.arc(i * 16 + 8, 56, 8, 0, Math.PI); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Lumière du ciel plus faible en bas des murs (une rue entre deux rangées de maisons en reçoit moins) :
// les façades s'assombrissent doucement vers le sol, comme dans une vraie rue (le soleil direct n'est pas touché)
function occlusionRue(m) {
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vHautMonde;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vec4 pointMonde = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
pointMonde = instanceMatrix * pointMonde;
#endif
vHautMonde = (modelMatrix * pointMonde).y;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vHautMonde;')
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
{
  float rue = mix(0.58, 1.0, smoothstep(0.0, 11.0, vHautMonde));
  irradiance *= rue;
#if defined( RE_IndirectSpecular )
  radiance *= mix(rue, 1.0, 0.4);
#endif
}`);
  };
}

// Reflets de la ville : une sonde photographie une rue dans toutes les directions ; les vitres et l'eau de la
// fontaine reflètent ensuite des façades et le ciel (au lieu du ciel seul)
export function refleterVille(renderer, caches = []) {
  if (!V) return;
  const cible = new THREE.WebGLCubeRenderTarget(ULTRA ? 512 : 128, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const sonde = new THREE.CubeCamera(0.3, 9000, cible);
  sonde.position.set(-120, 5, zRue(-120, 0));
  const masques = caches.filter((o) => o.visible), xr = renderer.xr.enabled;
  masques.forEach((o) => { o.visible = false; });
  renderer.xr.enabled = false;
  sonde.update(renderer, scene);
  renderer.xr.enabled = xr;
  masques.forEach((o) => { o.visible = true; });
  for (const m of [V.vitre, V.eauFontaine]) { m.envMap = cible.texture; m.needsUpdate = true; }
}

// --- Éléments de façade, en série (une seule géométrie, affichée des milliers de fois) ---
class Serie {
  constructor(geo, materiau, avecCouleur = false, ombre = true) { this.geo = geo; this.materiau = materiau; this.poses = []; this.avecCouleur = avecCouleur; this.ombre = ombre; }
  ajouter(x, y, z, rotY, couleur = 0xffffff, echelle = [1, 1, 1]) { this.poses.push({ x, y, z, rotY, couleur, echelle }); }
  construire() {
    if (!this.poses.length) return;
    const inst = new THREE.InstancedMesh(this.geo, this.materiau, this.poses.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    this.poses.forEach((p, i) => {
      m.compose(new THREE.Vector3(p.x, p.y, p.z), q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.rotY), new THREE.Vector3(...p.echelle));
      inst.setMatrixAt(i, m);
      if (this.avecCouleur) inst.setColorAt(i, c.set(p.couleur));
    });
    inst.castShadow = this.ombre;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    scene.add(inst);
  }
}
function fusion(parts) {
  return mergeGeometries(parts.map(([sx, sy, sz, x, y, z]) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z).toNonIndexed()));
}
// Une touffe de géraniums (feuilles ou fleurs) le long d'une jardinière d'un mètre
function touffe(n, rayon, y0, graine, forme) {
  let s = graine;
  const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const parts = [];
  for (let i = 0; i < n; i++) {
    const g = forme === 'fleur' ? new THREE.OctahedronGeometry(rayon * (0.8 + r() * 0.5), 0) : new THREE.IcosahedronGeometry(rayon * (0.8 + r() * 0.5), 0);
    parts.push(g.translate(-0.45 + (i + r()) / n * 0.9, y0 + r() * 0.09, 0.07 + r() * 0.16));
  }
  return mergeGeometries(parts);
}
// Toutes les pièces sont dessinées pour une façade tournée vers +z (on les tourne ensuite)
function series() {
  return {
    cadres: new Serie(fusion([[1.2, 0.09, 0.12, 0, 0.8, 0.05], [1.2, 0.09, 0.12, 0, -0.8, 0.05], [0.09, 1.66, 0.12, -0.56, 0, 0.05], [0.09, 1.66, 0.12, 0.56, 0, 0.05],
      [0.05, 1.55, 0.08, 0, 0, 0.04], [1.05, 0.05, 0.08, 0, 0.35, 0.04]]), V.cadre, false, false),
    vitres: new Serie(new THREE.PlaneGeometry(1.06, 1.56).translate(0, 0, 0.02), V.vitre, false, false),
    pierres: new Serie(fusion([[1.42, 0.07, 0.26, 0, -0.88, 0.1], [1.36, 0.16, 0.06, 0, 0.92, 0.03]]), V.pierreBlanche),
    volets: new Serie(fusion([[0.6, 1.62, 0.04, -0.92, 0, 0.05], [0.6, 1.62, 0.04, 0.92, 0, 0.05]]), V.volet, true, false),
    portes: new Serie(fusion([[1.3, 2.45, 0.08, 0, 1.22, 0.03], [1.5, 0.12, 0.14, 0, 2.5, 0.05], [0.1, 2.5, 0.14, -0.7, 1.25, 0.05], [0.1, 2.5, 0.14, 0.7, 1.25, 0.05],
      [1.1, 0.9, 0.03, 0, 1.75, 0.08], [1.1, 0.9, 0.03, 0, 0.7, 0.08]]), V.porte),
    vitrines: new Serie(new THREE.PlaneGeometry(2.7, 2.2).translate(0, 1.55, 0.03), V.vitre, false, false),
    cadresVitrines: new Serie(fusion([[3.0, 0.14, 0.14, 0, 2.7, 0.06], [3.0, 0.5, 0.12, 0, 0.25, 0.06], [0.14, 2.7, 0.14, -1.43, 1.35, 0.06], [0.14, 2.7, 0.14, 1.43, 1.35, 0.06], [0.06, 2.2, 0.08, 0, 1.55, 0.05]]), V.vitrine),
    stores: new Serie(new THREE.PlaneGeometry(3.0, 1.5).rotateX(-1.05).translate(0, 3.25, 0.62), V.store, true),
    balcons: new Serie(fusion([[2.0, 0.14, 0.9, 0, -0.07, 0.45],
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => [0.025, 0.95, 0.025, -0.95 + k * 0.2375, 0.47, 0.88]),
      [0.025, 0.95, 0.025, -0.95, 0.47, 0.45], [0.025, 0.95, 0.025, 0.95, 0.47, 0.45],
      [2.0, 0.04, 0.05, 0, 0.95, 0.88], [0.05, 0.04, 0.9, -0.97, 0.95, 0.45], [0.05, 0.04, 0.9, 0.97, 0.95, 0.45]]), V.fer),
    // Jardinières sur l'appui des fenêtres, débordant de géraniums
    jardinieres: new Serie(fusion([[1.0, 0.2, 0.22, 0, -0.74, 0.14]]), V.jardiniere, false, false),
    feuilles: new Serie(touffe(8, 0.085, -0.6, 7, 'feuille'), V.feuilles, false, false),
    fleurs: new Serie(touffe(11, 0.06, -0.52, 11, 'fleur'), V.fleurs, true, false),
  };
}

// --- Une maison de ville ---
// (xa, za) et (xb, zb) : coins avant gauche et droit (façade côté lac). retrait : la façade recule un peu (ou avance)
function maison(S, { xa, za, xb, zb, etages, couleur, toit, pente, forme, commerce, cotesLibres, retrait = 0, fleurs, bandeaux, chaines, lucarnes }) {
  placerRepere(xa, za, Math.atan2(zb - za, xb - xa));
  const l = Math.hypot(xb - xa, zb - za), z0 = retrait, z1 = retrait + PROF, cz = (z0 + z1) / 2;
  const H = etages * ETAGE + 0.6, g = !!cotesLibres?.gauche, d = !!cotesLibres?.droite;
  // Cœur de la maison, derrière les murs percés, et sa collision
  bloc(V.facade, [g ? MUR : 0, d ? l - MUR : l], [0, H], [z0 + MUR, z1 - MUR], couleur);
  solideLocal([l, H, PROF], [l / 2, H / 2, cz]);
  // Corniche sous le toit, bandeaux de pierre entre les étages
  bloc(V.pierreBlanche, [g ? -0.18 : 0, d ? l + 0.18 : l], [H - 0.26, H + 0.06], [z0 - 0.18, z1 + 0.18]);
  if (bandeaux) for (let e = 1; e < etages; e++) bloc(V.pierreBlanche, [g ? -0.05 : 0, d ? l + 0.05 : l], [e * ETAGE + 0.52, e * ETAGE + 0.68], [z0 - 0.05, z1 + 0.05]);

  // Façades percées : avant (côté lac), arrière, et les côtés qui donnent sur une rue
  const faces = [
    { axe: 'z', plan: z0, dehors: -1, a: 0, b: l, rot: Math.PI, avant: true },
    { axe: 'z', plan: z1, dehors: 1, a: 0, b: l, rot: 0 },
  ];
  if (g) faces.push({ axe: 'x', plan: 0, dehors: -1, a: z0 + MUR, b: z1 - MUR, rot: -Math.PI / 2, cote: true });
  if (d) faces.push({ axe: 'x', plan: l, dehors: 1, a: z0 + MUR, b: z1 - MUR, rot: Math.PI / 2, cote: true });
  const volets = hasard() < 0.75, couleurVolets = choisir(COULEURS_VOLETS), couleurFleurs = choisir(COULEURS_FLEURS);
  for (const f of faces) {
    const long = f.b - f.a, n = Math.max(1, Math.floor((long - 1.8) / 2.7)), pas = long / n, trous = [];
    const commerceIci = commerce && f.avant, porte = f.cote ? -1 : Math.floor(hasard() * n);
    for (let k = 0; k < n; k++) {
      const u = f.a + pas * (k + 0.5);
      // Rez-de-chaussée : vitrines à stores (commerces) ou porte et fenêtres
      if (commerceIci && k !== porte) {
        trous.push({ u0: u - 1.5, u1: u + 1.5, y0: 0, y1: 2.77 });
        poser(S.vitrines, f, u, 0, 0.12); poser(S.cadresVitrines, f, u, 0, 0.12);
        poser(S.stores, f, u, 0, 0, COULEURS_STORES[(Math.floor(xa) + k) % COULEURS_STORES.length]);
      } else if (k === porte) {
        trous.push({ u0: u - 0.75, u1: u + 0.75, y0: 0, y1: 2.56 });
        poser(S.portes, f, u, 0, 0.17);
      } else fenetre(S, f, trous, u, 1.85, volets, couleurVolets, false);
      // Étages
      for (let e = 1; e < etages; e++) {
        const y = e * ETAGE + 0.6 + 1.5;
        fenetre(S, f, trous, u, y, volets, couleurVolets, fleurs && e <= 2 && !f.cote ? couleurFleurs : false);
        if (!f.cote && f.avant && e <= 2 && k === Math.floor(n / 2) && (Math.floor(xa) * 7 + e) % 3 < 1.2) poser(S.balcons, f, u, e * ETAGE + 0.6, 0);
      }
    }
    murPerce(f, H, trous, couleur);
  }
  // Chaînes d'angle en pierre (blocs alternés) aux coins qui donnent sur une rue
  if (chaines) for (const [cote, xc, sx] of [[g, 0, 1], [d, l, -1]]) {
    if (!cote) continue;
    for (const [zc, sz] of [[z0, 1], [z1, -1]]) for (let y = SOCLE, k = 0; y + 0.42 < H - 0.3; y += 0.48, k++) {
      const lx = k % 2 ? 0.55 : 0.32, lz = k % 2 ? 0.32 : 0.55;
      bloc(V.pierreBlanche, sx > 0 ? [xc - 0.03, xc + lx] : [xc - lx, xc + 0.03], [y, y + 0.42], sz > 0 ? [zc - 0.03, zc + lz] : [zc - lz, zc + 0.03]);
    }
  }
  toitMaison(S, { l, z0, z1, cz, H, g, d, toit, m: pente, forme, couleur, lucarnes });
  return l;
}

// Fenêtre au fond de son embrasure : encadrement et vitre en retrait, appui et linteau en pierre, volets ouverts,
// et parfois une jardinière de géraniums
function fenetre(S, f, trous, u, y, volets, couleurVolets, fleurs) {
  trous.push({ u0: u - 0.6, u1: u + 0.6, y0: y - 0.845, y1: y + 0.845 });
  poser(S.cadres, f, u, y, 0.17);
  poser(S.vitres, f, u, y, 0.17);
  poser(S.pierres, f, u, y, 0);
  if (volets) poser(S.volets, f, u, y, 0, couleurVolets);
  if (fleurs) { poser(S.jardinieres, f, u, y, 0); poser(S.feuilles, f, u, y, 0); poser(S.fleurs, f, u, y, 0, fleurs); }
}
// Pose une pièce de façade sur la face f, au point (u, y) du mur, enfoncée de "renfonce" mètres
function poser(serie, f, u, y, renfonce = 0, couleur = 0xffffff, echelle) {
  const w = f.plan - f.dehors * renfonce;
  vTmp.set(f.axe === 'z' ? u : w, y, f.axe === 'z' ? w : u).applyMatrix4(repere);
  serie.ajouter(vTmp.x, vTmp.y, vTmp.z, f.rot + angle, couleur, echelle);
}
// Un mur percé de trous (fenêtres, portes, vitrines) : des morceaux de mur épais autour des trous, pour que les
// fenêtres soient au fond de vraies embrasures. En bas, le socle en pierre déborde un peu du plâtre.
function murPerce(f, H, trous, couleur) {
  const coupes = [...new Set([f.a, f.b, ...trous.flatMap((t) => [Math.max(f.a, t.u0), Math.min(f.b, t.u1)])])].sort((p, q) => p - q);
  for (let i = 0; i + 1 < coupes.length; i++) {
    const a = coupes[i], b = coupes[i + 1];
    if (b - a < 1e-3) continue;
    const dessus = trous.filter((t) => t.u0 <= a + 1e-4 && t.u1 >= b - 1e-4).sort((p, q) => p.y0 - q.y0);
    let y = 0;
    for (const t of dessus) { if (t.y0 > y + 1e-3) morceauMur(f, a, b, y, t.y0, couleur); y = Math.max(y, t.y1); }
    if (y < H - 1e-3) morceauMur(f, a, b, y, H, couleur);
  }
}
function morceauMur(f, a, b, y0, y1, couleur) {
  if (y0 < SOCLE) morceau(f, a, b, y0, Math.min(y1, SOCLE), V.socle, null, 0.04);
  if (y1 > SOCLE) morceau(f, a, b, Math.max(y0, SOCLE), y1, V.facade, couleur, 0);
}
function morceau(f, a, b, y0, y1, materiau, couleur, saillie) {
  const e0 = f.plan - f.dehors * MUR, e1 = f.plan + f.dehors * saillie;
  const w = e0 < e1 ? [e0, e1] : [e1, e0];
  if (f.axe === 'z') bloc(materiau, [a, b], [y0, y1], w, couleur);
  else bloc(materiau, w, [y0, y1], [a, b], couleur);
}

// --- Toits : deux pans (faîtage le long de la rue), pignon sur rue, ou quatre pans ; avant-toits en bois ---
function toitMaison(S, { l, z0, z1, cz, H, g, d, toit, m, forme, couleur, lucarnes }) {
  const deb = 0.5, cx = l / 2;
  // (pas de débord du côté d'une maison voisine : les toits se rejoignent)
  const dg = g ? deb : 0, dd = d ? deb : 0;
  if (forme === 'pignon') {
    // Faîtage perpendiculaire à la rue : le pignon (triangle) donne sur la rue, avec une petite fenêtre de grenier
    const montee = (l / 2) * m, yh = H + montee, yg = H - dg * m, yd = H - dd * m;
    poly(toit, [[-dg, yg, z1 + deb], [cx, yh, z1 + deb], [cx, yh, z0 - deb], [-dg, yg, z0 - deb]], null, [0, 0, 1]);
    poly(toit, [[l + dd, yd, z0 - deb], [cx, yh, z0 - deb], [cx, yh, z1 + deb], [l + dd, yd, z1 + deb]], null, [0, 0, 1]);
    poly(V.facade, [[0, H, z0], [cx, yh - 0.05, z0], [l, H, z0]], couleur);
    poly(V.facade, [[l, H, z1], [cx, yh - 0.05, z1], [0, H, z1]], couleur);
    for (const z of [z0 - deb, z1 + deb]) {
      planche(V.boisPeint, [-dg, yg - 0.1, z], [cx, yh - 0.1, z]);
      planche(V.boisPeint, [cx, yh - 0.1, z], [l + dd, yd - 0.1, z]);
    }
    if (g) avantToit([-dg, -dg], [z0 - deb, z1 + deb], yg, 'x', -1);
    if (d) avantToit([l + dd, l + dd], [z0 - deb, z1 + deb], yd, 'x', 1);
    if (montee > 2.6) for (const f of [{ axe: 'z', plan: z0, dehors: -1, rot: Math.PI }, { axe: 'z', plan: z1, dehors: 1, rot: 0 }]) {
      poser(S.cadres, f, cx, H + montee * 0.34, 0, 0xffffff, [0.62, 0.62, 1]);
      poser(S.vitres, f, cx, H + montee * 0.34, -0.02, 0xffffff, [0.62, 0.62, 1]);
    }
    cheminees([[cx + 1.1, z0 + PROF * (0.3 + hasard() * 0.4)]], (x) => yh - Math.abs(x - cx) * m, couleur);
    return;
  }
  const montee = (PROF / 2) * m, yh = H + montee, ye = H - deb * m;
  if (forme === 'croupe') {
    // Quatre pans : le faîtage est plus court, les côtés sont des triangles
    const r = PROF / 2;
    poly(toit, [[-deb, ye, z0 - deb], [r, yh, cz], [l - r, yh, cz], [l + deb, ye, z0 - deb]]);
    poly(toit, [[l + deb, ye, z1 + deb], [l - r, yh, cz], [r, yh, cz], [-deb, ye, z1 + deb]]);
    poly(toit, [[-deb, ye, z1 + deb], [r, yh, cz], [-deb, ye, z0 - deb]], null, [0, 0, 1]);
    poly(toit, [[l + deb, ye, z0 - deb], [l - r, yh, cz], [l + deb, ye, z1 + deb]], null, [0, 0, 1]);
    avantToit([-deb, l + deb], [z0 - deb, z0 - deb], ye, 'z', -1);
    avantToit([-deb, l + deb], [z1 + deb, z1 + deb], ye, 'z', 1);
    avantToit([-deb, -deb], [z0 - deb, z1 + deb], ye, 'x', -1);
    avantToit([l + deb, l + deb], [z0 - deb, z1 + deb], ye, 'x', 1);
  } else {
    // Deux pans, faîtage le long de la rue ; pignons en plâtre sur les côtés
    poly(toit, [[-dg, ye, z0 - deb], [-dg, yh, cz], [l + dd, yh, cz], [l + dd, ye, z0 - deb]]);
    poly(toit, [[l + dd, ye, z1 + deb], [l + dd, yh, cz], [-dg, yh, cz], [-dg, ye, z1 + deb]]);
    poly(V.facade, [[0, H, z0], [0, H, z1], [0, yh - 0.05, cz]], couleur);
    poly(V.facade, [[l, H, z1], [l, H, z0], [l, yh - 0.05, cz]], couleur);
    avantToit([-dg, l + dd], [z0 - deb, z0 - deb], ye, 'z', -1);
    avantToit([-dg, l + dd], [z1 + deb, z1 + deb], ye, 'z', 1);
    for (const [cote, x] of [[g, -dg], [d, l + dd]]) if (cote) {
      planche(V.boisPeint, [x, ye - 0.1, z0 - deb], [x, yh - 0.1, cz]);
      planche(V.boisPeint, [x, yh - 0.1, cz], [x, ye - 0.1, z1 + deb]);
    }
    // Lucarnes sur le pan avant
    if (lucarnes && montee > 3.2) for (const u of l > 12.5 ? [l * 0.3, l * 0.7] : [l / 2]) lucarne(S, u, z0, H, m, couleur);
  }
  const nb = l > 12 ? 2 : 1, r = forme === 'croupe' ? PROF / 2 : -99;
  cheminees(Array.from({ length: nb }, (_, c) => [l * (0.25 + 0.5 * c + (hasard() - 0.5) * 0.15), cz + (hasard() - 0.5) * PROF * 0.3]),
    (x, z) => yh - Math.max(Math.abs(z - cz), r - x, x - (l - r)) * m, couleur);
}
// Avant-toit : bandeau en bois peint sous le bord du toit, et la sous-face en planches jusqu'au mur
// (bord en (xa..xb, za..zb) à la hauteur y ; dehors = -1 ou 1 : de quel côté est la façade, vers l'intérieur)
function avantToit([xa, xb], [za, zb], y, axe, dehors) {
  if (axe === 'z') {
    bloc(V.boisPeint, [xa, xb], [y - 0.24, y + 0.03], [za - 0.04, za + 0.04]);
    bloc(V.bois, [xa, xb], [y - 0.26, y - 0.2], dehors < 0 ? [za, za + 0.5] : [za - 0.5, za]);
  } else {
    bloc(V.boisPeint, [xa - 0.04, xa + 0.04], [y - 0.24, y + 0.03], [za, zb]);
    bloc(V.bois, dehors < 0 ? [xa, xa + 0.5] : [xa - 0.5, xa], [y - 0.26, y - 0.2], [za, zb]);
  }
}
function cheminees(positions, hauteurToit, couleur) {
  for (const [x, z] of positions) {
    const y = hauteurToit(x, z);
    bloc(V.facade, [x - 0.38, x + 0.38], [y - 0.8, y + 1.4], [z - 0.38, z + 0.38], couleur);
    bloc(V.socle, [x - 0.48, x + 0.48], [y + 1.4, y + 1.55], [z - 0.48, z + 0.48]);
    bloc(V.fer, [x - 0.12, x + 0.12], [y + 1.55, y + 1.75], [z - 0.12, z + 0.12]);
  }
}
// Lucarne : petite fenêtre dans le toit, avec ses joues en plâtre et son propre petit toit à deux pans
function lucarne(S, u, z0, H, m, couleur) {
  const W = 1.7, zd = z0 + 0.7, yr = H + 0.7 * m, yt = yr + 1.55, zf = z0 + (yt + 0.8 - H) / m;
  bloc(V.facade, [u - W / 2, u + W / 2], [yr - 0.4, yt], [zd, zf], couleur);
  const yh = yt + W / 2 * 0.95, a = u - W / 2 - 0.18, b = u + W / 2 + 0.18, yb = yt - 0.17;
  poly(V.ardoises, [[a, yb, zf], [u, yh, zf], [u, yh, zd - 0.3], [a, yb, zd - 0.3]], null, [0, 0, 1]);
  poly(V.ardoises, [[b, yb, zd - 0.3], [u, yh, zd - 0.3], [u, yh, zf], [b, yb, zf]], null, [0, 0, 1]);
  poly(V.facade, [[u - W / 2, yt, zd], [u, yh - 0.05, zd], [u + W / 2, yt, zd]], couleur);
  planche(V.boisPeint, [a, yb - 0.08, zd - 0.3], [u, yh - 0.08, zd - 0.3], 0.05, 0.16);
  planche(V.boisPeint, [u, yh - 0.08, zd - 0.3], [b, yb - 0.08, zd - 0.3], 0.05, 0.16);
  const f = { axe: 'z', plan: zd, dehors: -1, rot: Math.PI };
  poser(S.cadres, f, u, yr + 0.7, 0, 0xffffff, [0.72, 0.72, 1]);
  poser(S.vitres, f, u, yr + 0.7, -0.02, 0xffffff, [0.72, 0.72, 1]);
}

// Trottoir dallé le long d'une façade (dans le repère de la maison), avec sa bordure en granit
function trottoir(l, z, dehors) {
  const [a, b] = dehors < 0 ? [z - 1.6, z] : [z, z + 1.6], [ba, bb] = dehors < 0 ? [z - 1.75, z - 1.6] : [z + 1.6, z + 1.75];
  bloc(V.dalles, [0, l], [0, 0.12], [a, b]);
  bloc(V.granit, [0, l], [0, 0.14], [ba, bb]);
  solideLocal([l, 0.14, 1.75], [l / 2, 0.07, dehors < 0 ? z - 0.875 : z + 0.875]);
}

// --- L'église : nef blanche, chaînes d'angle en pierre, grandes fenêtres, clocher pointu avec horloge ---
function eglise(S) {
  const x0 = -11, x1 = 11, z0 = -50, z1 = -20, H = 12.5, cx = 0, cz = (z0 + z1) / 2;
  boite(V.facade, [x1 - x0, H, z1 - z0], [cx, H / 2, cz], 0, 0xf3f0e8);
  boite(V.socle, [x1 - x0 + 0.1, 1.0, z1 - z0 + 0.1], [cx, 0.5, cz]);
  for (const x of [x0, x1]) for (const z of [z0, z1]) for (let y = 0.5; y < H; y += 1.2) boite(V.socle, [0.9, 0.55, 0.9], [x, y + 0.27, z]);
  solide([x1 - x0, H, z1 - z0], [cx, H / 2, cz]);
  // Toit d'ardoises (faîtage dans la longueur)
  const l = x1 - x0, montee = l / 2 * 1.0, deb = 0.5;
  const pans = new THREE.BufferGeometry();
  const yb = H - 0.4, yh = H + montee;
  pans.setAttribute('position', new THREE.Float32BufferAttribute([x0 - deb, yb, z0 - deb, cx, yh, z0 - deb, cx, yh, z1 + deb, x0 - deb, yb, z1 + deb,
    x1 + deb, yb, z1 + deb, cx, yh, z1 + deb, cx, yh, z0 - deb, x1 + deb, yb, z0 - deb], 3));
  const lp = Math.hypot(l / 2 + deb, montee + 0.4) / 2.5, lz = (z1 - z0 + 2 * deb) / 2.5;
  pans.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, lp, 0, lp, lz, 0, lz, 0, 0, lp, 0, lp, lz, 0, lz], 2));
  pans.setIndex([0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6]);
  pans.computeVertexNormals();
  ajouterAuLot(V.ardoises, pans);
  // Pignons de la nef (devant, côté lac, et derrière)
  const pignon = new THREE.BufferGeometry();
  pignon.setAttribute('position', new THREE.Float32BufferAttribute([x0, H, z1, x1, H, z1, cx, yh - 0.2, z1, x1, H, z0, x0, H, z0, cx, yh - 0.2, z0], 3));
  pignon.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 7, 0, 3.5, 3.5, 0, 0, 7, 0, 3.5, 3.5], 2));
  pignon.computeVertexNormals();
  ajouterAuLot(V.facade, pignon, 0xf3f0e8);
  // Grandes fenêtres des côtés
  for (const s of [-1, 1]) for (let k = 0; k < 5; k++) {
    const z = z0 + 4 + k * 5.5, x = s > 0 ? x1 : x0, rot = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    S.cadres.ajouter(x, 6.5, z, rot, 0xffffff, [1.3, 3.2, 1]);
    S.vitres.ajouter(x, 6.5, z, rot, 0xffffff, [1.3, 3.2, 1]);
  }
  // Clocher devant la nef, avec horloge et flèche
  const tx = 0, tz = z0 - 3, T = 30, c = 6.4;
  boite(V.facade, [c, T, c], [tx, T / 2, tz], 0, 0xf1ede4);
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) for (let y = 0.5; y < T; y += 1.2) boite(V.socle, [0.8, 0.55, 0.8], [tx + dx * c / 2, y + 0.27, tz + dz * c / 2]);
  boite(V.pierreBlanche, [c + 0.5, 0.45, c + 0.5], [tx, T, tz]);
  solide([c, T, c], [tx, T / 2, tz]);
  const fleche = new THREE.ConeGeometry(c * 0.62, 15, 8, 1, true).rotateY(Math.PI / 8).translate(tx, T + 7.5, tz);
  const uvf = fleche.attributes.uv;
  for (let i = 0; i < uvf.count; i++) uvf.setXY(i, uvf.getX(i) * 8, uvf.getY(i) * 6);
  ajouterAuLot(V.ardoises, fleche);
  boite(V.fer, [0.08, 3, 0.08], [tx, T + 16, tz]);
  boite(V.fer, [1.2, 0.08, 0.08], [tx, T + 16.8, tz]);
  // Abat-sons du clocher (ouvertures sombres) et cadrans d'horloge
  const horloge = new THREE.MeshStandardMaterial({ map: textureHorloge(), roughness: 0.6 });
  for (const [dx, dz, rot] of [[0, -1, Math.PI], [0, 1, 0], [-1, 0, -Math.PI / 2], [1, 0, Math.PI / 2]]) {
    const px = tx + dx * (c / 2 + 0.02), pz = tz + dz * (c / 2 + 0.02);
    const m = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), horloge);
    m.position.set(px + dx * 0.03, 22.5, pz + dz * 0.03);
    m.rotation.y = rot;
    scene.add(m);
    for (const o of [-1, 1]) S.vitrines.ajouter(px + (dz ? o * 1.2 : 0), 24.6, pz + (dx ? o * 1.2 : 0), rot, 0xffffff, [0.3, 1.1, 1]);
  }
  // Grande porte en bois
  if (!objetModele('large_castle_door', [tx, 0, tz - c / 2 - 0.05], { hauteur: 4.2, rot: [0, Math.PI, 0] })) S.portes.ajouter(tx, 0, tz - c / 2, Math.PI, 0xffffff, [1.6, 1.6, 1]);
}

function textureHorloge() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1e2f45'; g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#d9b45a'; g.lineWidth = 8; g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#d9b45a';
  for (let h = 0; h < 12; h++) { const a = (h / 12) * Math.PI * 2; g.fillRect(128 + Math.sin(a) * 96 - 5, 128 - Math.cos(a) * 96 - 12, 10, 24); }
  g.strokeStyle = '#d9b45a'; g.lineCap = 'round';
  g.lineWidth = 10; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + 50, 128 - 30); g.stroke();
  g.lineWidth = 6; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 - 10, 128 - 85); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Bande de sol horizontale qui suit la rive : de zA(x) à zB(x), pour x de VILLE.x0 à VILLE.x1
function bande(materiau, zA, zB, y) {
  const pos = [], uv = [], idx = [], t = materiau.userData?.tuile ?? 3;
  for (let x = VILLE.x0, i = 0; x <= VILLE.x1 + 0.01; x += 3, i++) {
    const a = zA(x), b = zB(x);
    pos.push(x, y, a, x, y, b);
    uv.push(x / t, a / t, x / t, b / t);
    if (i > 0) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, materiau);
  m.receiveShadow = true;
  scene.add(m);
}

// --- Quai : mur en pierre au bord de l'eau, promenade dallée, garde-corps, réverbères, bancs, fleurs ---
function quai() {
  const pas = 3;
  // Dalles de la promenade, de la rive jusqu'aux façades
  bande(V.dalles, (x) => riveSud(x) + 0.35, (x) => zRang(x, 0) + 0.5, 0.02);
  // Mur du quai qui plonge dans le lac, et sa margelle
  for (let x = VILLE.x0; x < VILLE.x1; x += pas) {
    const xm = x + pas / 2, zr = riveSud(xm), a = Math.atan2(riveSud(x + pas) - riveSud(x), pas);
    boite(V.quai, [pas + 0.05, 7, 1.1], [xm, -3.25, zr - 0.25], -a);
    boite(V.pierreBlanche, [pas + 0.05, 0.16, 0.7], [xm, 0.09, zr - 0.1], -a);
    // Garde-corps en fer forgé (ouvert devant le port)
    if (xm > 155 && xm < 245) continue;
    boite(V.fer, [pas, 0.05, 0.05], [xm, 1.0, zr + 0.05], -a);
    boite(V.fer, [pas, 0.03, 0.03], [xm, 0.55, zr + 0.05], -a);
    boite(V.fer, [0.06, 1.0, 0.06], [x, 0.5, riveSud(x) + 0.05]);
  }
  // Réverbères, bancs face au lac et bacs à fleurs
  for (let x = VILLE.x0 + 10; x < VILLE.x1; x += 20) {
    reverbere(x, riveSud(x) + 2.2);
    if ((x / 20) % 2 < 1 && !(x > 155 && x < 245)) objetModele('painted_wooden_bench', [x + 10, 0.02, riveSud(x + 10) + 3.4], { rot: [0, Math.PI - Math.atan(penteRive(x + 10)), 0], hauteur: 0.85 });
  }
  for (let x = VILLE.x0 + 20; x < VILLE.x1; x += 40) {
    if (x > -62 && x < 62) continue;
    const z = zRang(x, 0) - 3.2;
    objetModele('planter_pot_clay', [x, 0.02, z], { hauteur: 0.7 });
    fleurs(x, 0.62, z, 0.45);
  }
}

// Réverbère à l'ancienne : pied mouluré, fût en fonte, lanterne vitrée à quatre pans et son chapeau
function reverbere(x, z) {
  const pieces = [
    [V.fer, new THREE.CylinderGeometry(0.13, 0.2, 0.55, 8).translate(0, 0.275, 0)],
    [V.fer, new THREE.CylinderGeometry(0.1, 0.13, 0.12, 8).translate(0, 0.61, 0)],
    [V.fer, new THREE.CylinderGeometry(0.055, 0.075, 3.4, 8).translate(0, 2.37, 0)],
    [V.fer, new THREE.CylinderGeometry(0.12, 0.08, 0.14, 8).translate(0, 4.1, 0)],
    [V.lanterne, new THREE.CylinderGeometry(0.21, 0.14, 0.5, 4, 1).rotateY(Math.PI / 4).translate(0, 4.42, 0)],
    [V.fer, new THREE.ConeGeometry(0.3, 0.26, 4).rotateY(Math.PI / 4).translate(0, 4.8, 0)],
    [V.fer, new THREE.SphereGeometry(0.05, 8, 6).translate(0, 4.95, 0)],
  ];
  for (const [m, g] of pieces) ajouterAuLot(m, g.translate(x, 0, z));
  solide([0.2, 4.4, 0.2], [x, 2.2, z], 0, 'metal');
}

// Petites fleurs colorées (géraniums) dans un bac
let matFleurs = null, matFeuilles = null;
function fleurs(x, y, z, r) {
  matFleurs ??= [0xd8283a, 0xf2c230, 0xe85a9a, 0xf4f1e8].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
  matFeuilles ??= new THREE.MeshStandardMaterial({ color: 0x2f5a22, roughness: 0.9 });
  const teinte = Math.floor(hasard() * matFleurs.length);
  for (let i = 0; i < 9; i++) {
    const a = hasard() * Math.PI * 2, d = Math.sqrt(hasard()) * r;
    ajouterAuLot(matFeuilles, new THREE.IcosahedronGeometry(0.12, 0).translate(x + Math.cos(a) * d, y, z + Math.sin(a) * d));
    ajouterAuLot(matFleurs[(teinte + (i % 3 === 0 ? 1 : 0)) % matFleurs.length],
      new THREE.IcosahedronGeometry(0.09, 0).translate(x + Math.cos(a) * d, y + 0.1 + hasard() * 0.06, z + Math.sin(a) * d));
  }
}

// --- Le port : pontons en bois sur pilotis, barques, bouées, tonneaux et caisses ---
function port() {
  const y = NIVEAU_LAC + 0.75;
  for (const x of [172, 200, 228]) {
    const z0 = riveSud(x), z1 = z0 - 32;
    creerObjet({ pos: [x, y, (z0 + z1) / 2 - 3], son: 'bois', formes: [{ type: 'boite', taille: [2.6, 0.16, z0 - z1 - 6], materiau: V.bois }] });
    // Escalier en pente douce depuis le quai
    const dy = 0 - y, a = Math.atan2(dy, 6.5);
    creerObjet({ pos: [x, y + dy / 2, z0 - 3.1], rot: [-a, 0, 0], son: 'bois', formes: [{ type: 'boite', taille: [2.6, 0.16, Math.hypot(6.5, dy)], materiau: V.bois }] });
    for (let z = z0 - 6; z > z1; z -= 3.2) for (const s of [-1, 1]) boite(V.porte, [0.22, 14, 0.22], [x + s * 1.2, y - 7, z]);
    for (const s of [-1, 1]) boite(V.porte, [0.24, 1.1, 0.24], [x + s * 1.2, y + 0.55, z1 + 0.3]);
    objetModele('lifebuoy', [x + 1.35, y + 0.35, z1 + 1], { hauteur: 0.7, rot: [0, Math.PI / 2, 0], ombre: false });
    creerBarque(x + 3.2, z1 + 9 + (x % 7), 0.05);
  }
  // Tonneaux et caisses sur le quai du port (on peut les déplacer)
  for (let i = 0; i < 6; i++) { const x = 186 + i * 1.1; baril([x, 0.46, zRang(x, 0) - 3.4 - (i % 2) * 0.9], i % 2 ? M.acierOrange : M.acierVert); }
  for (let i = 0; i < 5; i++) { const x = 214 + (i % 3) * 0.9; caisse([x, 0.22 + Math.floor(i / 3) * 0.44, zRang(x, 0) - 3.6], 0.42, 8); }
  objetModele('wine_barrel_01', [212, 0.02, zRang(212, 0) - 2.4], { hauteur: 1.1 });
  objetModele('wine_barrel_01', [213.4, 0.02, zRang(213.4, 0) - 2.4], { hauteur: 1.1 });
}

// --- Tilleuls (sur la place et le long du quai) : tronc et grosses branches en écorce, couronne arrondie faite de
// centaines de plaques de feuilles dessinées (transparentes), éclairée comme un volume et qui bouge au vent ---
function plancheFeuilles() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  let s = 99;
  const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  g.strokeStyle = '#4b3b2a'; g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    g.lineWidth = 2 + r() * 3;
    g.beginPath(); g.moveTo(256, 256); g.quadraticCurveTo(256 + (r() - 0.5) * 200, 256 + (r() - 0.5) * 200, 256 + (r() - 0.5) * 440, 256 + (r() - 0.5) * 440); g.stroke();
  }
  for (let i = 0; i < 170; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 215, x = 256 + Math.cos(a) * d, y = 256 + Math.sin(a) * d, l = 24 + r() * 22, v = 0.7 + r() * 0.55;
    g.fillStyle = `rgb(${Math.round(64 * v)}, ${Math.round(108 * v)}, ${Math.round(34 * v)})`;
    g.save(); g.translate(x, y); g.rotate(r() * Math.PI * 2);
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(l * 0.2, -l * 0.55, l * 0.85, -l * 0.4, l, 0); g.bezierCurveTo(l * 0.85, l * 0.4, l * 0.2, l * 0.55, 0, 0); g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function arbreTilleul(graine) {
  let s = graine;
  const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const tronc = [new THREE.CylinderGeometry(0.17, 0.27, 3.6, 10, 1).translate(0, 1.8, 0)], feuilles = [];
  for (let i = 0; i < 5; i++) {
    const l = 2.2 + r() * 0.9, b = new THREE.CylinderGeometry(0.05, 0.12, l, 6).translate(0, l / 2, 0);
    tronc.push(b.rotateZ(0.45 + r() * 0.4).rotateY((i / 5) * Math.PI * 2 + r()).translate(0, 3.3, 0));
  }
  for (const t of tronc) { const uv = t.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 2.5); }
  // La couronne est faite de plusieurs touffes (une au centre, d'autres autour) : sa silhouette est bosselée
  const C = new THREE.Vector3(0, 5.7, 0), p = new THREE.Vector3(), v = new THREE.Vector3(), w = new THREE.Vector3();
  const touffes = [[0, 5.9, 0, 2.2]];
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + r(), d = 1.3 + r() * 0.7; touffes.push([Math.cos(a) * d, 4.9 + r() * 1.9, Math.sin(a) * d, 1.3 + r() * 0.6]); }
  while (feuilles.length < 270) {
    const [tx, ty, tz, tr] = touffes[Math.floor(r() * touffes.length)];
    p.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
    if (p.lengthSq() > 1 || p.lengthSq() < 0.05) continue;
    p.normalize().multiplyScalar(tr * (0.5 + 0.5 * Math.sqrt(r())));
    const q = new THREE.PlaneGeometry(1.1, 1.1).rotateX(r() * Math.PI).rotateY(r() * Math.PI * 2).rotateZ((r() - 0.5) * 1.2)
      .translate(tx + p.x, ty + p.y * 0.85, tz + p.z);
    // Normales vers l'extérieur (de la touffe et de la couronne) : éclairée comme un volume, sans plaques visibles
    const pos = q.attributes.position, nor = q.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      w.copy(v).sub(C).normalize().multiplyScalar(0.5).add(v.sub(new THREE.Vector3(tx, ty, tz)).normalize().multiplyScalar(0.5)).normalize();
      nor.setXYZ(i, w.x, w.y, w.z);
    }
    feuilles.push(q);
  }
  return { tronc: mergeGeometries(tronc), feuilles: mergeGeometries(feuilles) };
}
function tilleuls(positions) {
  const feuillage = new THREE.MeshStandardMaterial({ map: plancheFeuilles(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 });
  feuillage.onBeforeCompile = (shader) => {
    shader.uniforms.temps = tempsVent;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float temps;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
// Le vent agite le haut de la couronne
float haut = max(0.0, position.y - 3.0);
vec4 ancre = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
transformed.x += sin(temps * 1.7 + ancre.x * 0.3 + position.y) * 0.03 * haut;
transformed.z += cos(temps * 1.3 + ancre.z * 0.3 + position.x) * 0.03 * haut;`);
    // (les deux faces de chaque plaque sont éclairées pareil : on ne retourne pas la normale)
    shader.fragmentShader = opaciteLointaine(shader.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '')), 'map', 'vMapUv');
  };
  const ecorce = (P.ecorce ?? M.bois).clone();
  ecorce.color.set(0x8f877e);
  const modeles = [arbreTilleul(3), arbreTilleul(17)].map((a) => ({ tronc: new Serie(a.tronc, ecorce), feuilles: new Serie(a.feuilles, feuillage, true) }));
  positions.forEach(([x, z], i) => {
    const m = modeles[i % 2], e = 0.85 + hasard() * 0.3, rot = hasard() * Math.PI * 2;
    m.tronc.ajouter(x, 0, z, rot, 0xffffff, [e, e, e]);
    m.feuilles.ajouter(x, 0, z, rot, choisir([0xffffff, 0xeef3dc, 0xdfe9cc, 0xf6f2d8]), [e, e, e]);
    solide([0.45, 3.4, 0.45], [x, 1.7, z], 0, 'bois');
  });
  for (const m of modeles) { m.tronc.construire(); m.feuilles.construire(); }
}
const tempsVent = { value: 0 };
export function animerVille(temps) { tempsVent.value = temps; }

// --- La place : fontaine, terrasses de café avec parasols, chariot à café, panneau des commandes ---
function placeDuVillage(depart) {
  // Fontaine : bassin octogonal à margelle de pierre, colonne moulurée, vasque, et quatre filets d'eau
  const fx = 0, fz = -92;
  creerObjet({ pos: [fx, 0, fz], son: 'pierre', formes: [
    { type: 'cylindre', rayon: 3.45, hauteur: 0.8, pos: [0, 0.4, 0], cache: true },
    { type: 'cylindre', rayon: 0.45, hauteur: 2.6, pos: [0, 1.3, 0], cache: true },
  ] });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8, c = Math.cos(a), s = Math.sin(a);
    boite(V.pierreBlanche, [2.72, 0.72, 0.36], [fx + s * 3.15, 0.36, fz + c * 3.15], a);
    boite(V.pierreBlanche, [2.95, 0.12, 0.52], [fx + s * 3.2, 0.78, fz + c * 3.2], a);
  }
  const pierre = V.pierreBlanche;
  for (const g of [
    new THREE.CylinderGeometry(0.55, 0.62, 0.4, 8).translate(0, 0.45, 0),
    new THREE.CylinderGeometry(0.26, 0.32, 1.4, 12).translate(0, 1.35, 0),
    new THREE.CylinderGeometry(0.42, 0.3, 0.16, 12).translate(0, 2.12, 0),
    new THREE.LatheGeometry([[0, 0], [0.5, 0.02], [1.05, 0.2], [1.15, 0.34], [1.05, 0.34], [0.5, 0.18], [0, 0.17]].map(([x, y]) => new THREE.Vector2(x, y)), 16).translate(0, 2.18, 0),
    new THREE.CylinderGeometry(0.12, 0.18, 0.5, 8).translate(0, 2.55, 0),
    new THREE.SphereGeometry(0.2, 12, 8).translate(0, 2.9, 0),
  ]) ajouterAuLot(pierre, g.translate(fx, 0, fz));
  const eauFontaine = V.eauFontaine;
  const eau = new THREE.Mesh(new THREE.CircleGeometry(3.0, 8).rotateX(-Math.PI / 2).rotateY(Math.PI / 8), eauFontaine);
  eau.position.set(fx, 0.6, fz);
  const vasque = new THREE.Mesh(new THREE.CircleGeometry(1.02, 16).rotateX(-Math.PI / 2), eauFontaine);
  vasque.position.set(fx, 2.5, fz);
  scene.add(eau, vasque);
  const filet = new THREE.MeshStandardMaterial({ color: 0xd8eef4, roughness: 0.1, transparent: true, opacity: 0.5, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const courbe = new THREE.QuadraticBezierCurve3(new THREE.Vector3(fx + s * 1.12, 2.5, fz + c * 1.12), new THREE.Vector3(fx + s * 1.45, 2.3, fz + c * 1.45), new THREE.Vector3(fx + s * 1.6, 0.6, fz + c * 1.6));
    const m = new THREE.Mesh(new THREE.TubeGeometry(courbe, 12, 0.035, 6), filet);
    m.userData.sansAO = true;
    scene.add(m);
  }

  // Terrasses de café (côté ouest de la place) avec parasols
  const parasol = new THREE.MeshStandardMaterial({ color: 0xf1ead8, roughness: 0.85, side: THREE.DoubleSide });
  const tables = [];
  for (let i = 0; i < 6; i++) {
    const x = -48 + (i % 3) * 6.5, z = -110 + Math.floor(i / 3) * 7;
    // (le modèle n'a pas de collision : on ajoute juste le plateau de la table, pour y poser des objets)
    const o = objetModele('outdoor_table_chair_set_01', [x, 0.02, z], { hauteur: 0.95, rot: [0, i * 0.7, 0], forme: 'aucune' });
    creerObjet({ pos: [x, 0, z], son: 'metal', formes: [{ type: 'cylindre', rayon: 0.42, hauteur: 0.74, materiau: V.fer, pos: [0, 0.37, 0], cache: true }] });
    tables.push([x, z, o]);
    boite(V.fer, [0.06, 2.5, 0.06], [x, 1.25, z]);
    const toile = new THREE.ConeGeometry(1.7, 0.55, 8, 1, true).translate(x, 2.55, z);
    ajouterAuLot(parasol, toile);
  }
  objetModele('CoffeeCart_01', [40, 0.02, -104], { hauteur: 2.2, rot: [0, -Math.PI / 2, 0] });
  for (const [x, z] of [[52, -84], [52, -70], [-52, -70]]) objetModele('planter_box_01', [x, 0.02, z], {}) && fleurs(x, 0.75, z, 0.5);
  for (const [x, z, r] of [[25, -80, Math.PI / 2], [-25, -80, -Math.PI / 2]]) objetModele('painted_wooden_bench', [x, 0.02, z], { rot: [0, r, 0], hauteur: 0.85 });
  for (const [x, z] of [[-30, -60], [30, -60], [-58, -100], [58, -100]]) reverbere(x, z);

  // Objets à essayer, posés sur deux tables du café
  const [t1, t2] = tables;
  const surTable = (t, dx, dz, h = 0.82) => [t[0] + dx, h, t[1] + dz];
  balle(surTable(t1, 0.15, 0.1, 0.86), 0xd63c3c);
  balle(surTable(t1, -0.15, -0.1, 0.86), 0x3c7bd6);
  lampeTorche(surTable(t1, 0.1, -0.2, 0.9));
  marteau(surTable(t2, -0.2, 0.1, 0.84));
  carton(surTable(t2, 0.2, -0.1, 0.94), 0.2, 0.4);
  if (!objetModele('football', [t2[0] + 1.2, 0.02, t2[1] + 1.2], { masse: 0.43, taille: 0.22, forme: 'boule', rebond: 0.7, son: 'caoutchouc', nom: 'ballon de foot' })) balle([t2[0] + 1.2, 0.2, t2[1] + 1.2], 0xffffff, 0.11, 0.43);
  objetModele('baseball_bat', [t1[0] - 1.3, 0.02, t1[1] + 0.8], { masse: 0.9, taille: 0.84, son: 'bois', nom: 'batte' });
  const munitions = [];
  for (let i = 0; i < 10; i++) {
    const b = creerObjet({ pos: [-34 + (i % 4) * 0.09, 0.9 + Math.floor(i / 4) * 0.07, -103 + (i % 3) * 0.1], masse: 0.03, rebond: 0.75,
      son: 'caoutchouc', nom: 'balle en mousse', formes: [{ type: 'boule', rayon: 0.032, materiau: M.couleur(0xe8e23a, 0.8), segments: 12 }] });
    b.jouet = true;
    munitions.push(b);
  }
  creerObjet({ pos: [-34, 0, -103], formes: [{ type: 'boite', taille: [0.6, 0.85, 0.6], materiau: V.porte, pos: [0, 0.425, 0] }] });
  lanceBalles([-33.6, 0.95, -102.6], munitions);

  // Panneau des commandes, devant le point de départ, un peu à gauche
  const bx = depart.x - 4, bz = depart.z - 4.5;
  creerObjet({ pos: [bx, 0, bz], formes: [
    { type: 'boite', taille: [0.12, 2.6, 0.12], materiau: V.porte, pos: [-1.35, 1.3, 0] }, { type: 'boite', taille: [0.12, 2.6, 0.12], materiau: V.porte, pos: [1.35, 1.3, 0] },
    { type: 'boite', taille: [2.9, 1.5, 0.08], materiau: V.porte, pos: [0, 1.75, 0] }] });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshStandardMaterial({ map: texturePanneau('Commandes', [
    'Gâchette du majeur : attraper / grimper',
    'Gâchette de l\'index : utiliser l\'objet / le pouvoir',
    'Joystick gauche : marcher, nager (clic = courir)',
    'Joystick droit : tourner / bas = s\'accroupir',
    'A : sauter   B : pouvoir activé / coupé',
    'Y : inventaire et objets   X : super-pouvoirs',
    'Lâche un objet sur ta hanche ou ton épaule = rangé',
    'Main serrée vers un objet + coup de poignet = attiré',
  ]), roughness: 0.8 }));
  m.position.set(bx, 1.75, bz + 0.05);   // tourné vers le joueur (+z)
  scene.add(m);
}

// --- Construction de toute la ville ---
export function construireVille() {
  V = materiaux();
  for (const m of [V.facade, V.socle, V.pierreBlanche, V.cadre, V.volet, V.porte, V.vitrine, V.boisPeint, V.jardiniere, V.fer, V.granit]) occlusionRue(m);
  const S = series();
  // Sols : pavés dans toutes les rues, gros pavés sur la place
  bande(V.pavage, (x) => zRang(x, 0) + 0.5, () => VILLE.z1 + 6, 0.015);
  sol(V.place, PLACE.x0, PLACE.x1, zRang(0, 0) + 0.4, -50, 0.025);
  // Tilleuls : deux rangées sur les côtés de la place, et une allée le long du quai (sauf devant le port)
  const arbres = [];
  for (let z = -118; z <= -58; z += 12) arbres.push([-56, z], [56, z]);
  for (let x = VILLE.x0 + 10; x < VILLE.x1; x += 20) if (!(x > 150 && x < 250)) arbres.push([x, riveSud(x) + 8.5]);
  tilleuls(arbres);
  quai();

  // Maisons : quatre rangées qui suivent la rive, coupées par des rues perpendiculaires au lac (sauf la place)
  const troncons = [];
  let debut = VILLE.x0 + 6;
  for (const t of [...TRAVERSES, VILLE.x1 - 6 + RUE / 2]) {
    troncons.push([debut, t - RUE / 2]);
    debut = t + RUE / 2;
  }
  for (let r = 0; r < RANGEES; r++) {
    for (const [a, b] of troncons) {
      if (a > PLACE.x0 - 1 && b < PLACE.x1 + 1) continue;   // la place
      let x = a;
      while (b - x > 7) {
        let l = 8 + hasard() * 7;
        if (b - x - l < 7.5) l = b - x;
        const cotesLibres = { gauche: x === a, droite: x + l === b }, libre = cotesLibres.gauche || cotesLibres.droite;
        const ardoise = hasard() < 0.3, largeur = Math.hypot(l, zRang(x + l, r) - zRang(x, r));
        const forme = largeur < 11.5 && hasard() < 0.4 ? 'pignon' : libre && largeur > PROF + 1.5 && hasard() < 0.55 ? 'croupe' : 'long';
        const retrait = r === 0 ? 0 : (hasard() - 0.5) * 0.9;
        maison(S, {
          xa: x, za: zRang(x, r), xb: x + l, zb: zRang(x + l, r),
          etages: (r < 2 ? 3 : 2) + Math.floor(hasard() * (r === 0 ? 3 : 2.5)),
          couleur: choisir(COULEURS), toit: ardoise ? V.ardoises : V.tuiles, pente: ardoise ? 0.95 + hasard() * 0.3 : 0.7 + hasard() * 0.25, forme,
          commerce: r === 0 || (r === 1 && hasard() < 0.5) || Math.abs(x - PLACE.x0) < 20 || Math.abs(x + l - PLACE.x1) < 20,
          cotesLibres, retrait, fleurs: hasard() < 0.5, bandeaux: hasard() < 0.6, chaines: hasard() < 0.4, lucarnes: hasard() < 0.5,
        });
        // Trottoirs devant et derrière (le long de la promenade, c'est déjà dallé)
        if (r > 0) trottoir(largeur, retrait, -1);
        trottoir(largeur, retrait + PROF, 1);
        x += l;
      }
    }
  }
  eglise(S);
  port();
  const depart = new THREE.Vector3(0, 0, -72);
  placeDuVillage(depart);
  voiture(110, zRue(110, 0), Math.PI / 2 - Math.atan(penteRive(110)));

  for (const s of Object.values(S)) s.construire();
  fusionnerLots();
  fusionnerDecor();   // fontaine, pontons, panneaux : assemblés en un seul dessin par matériau
  const surLeQuai = (x) => riveSud(x) + 6;
  return {
    animations,
    depart,
    personnages: [
      { nom: 'Léa', genre: 'f', rocketbox: 'Female_Adult_02', pos: [-8, -100], points: [[-8, -100], [8, -101], [11, -86], [-10, -84], [-14, -95]], voix: 1 },
      { nom: 'Marc', genre: 'm', rocketbox: 'Male_Adult_01', pos: [-40, surLeQuai(-40)], points: [-40, -10, 20, 50, 10, -25].map((x) => [x, surLeQuai(x) + (x % 3)]), voix: 1 },
      { nom: 'Karim', genre: 'm', rocketbox: 'Male_Adult_05', pos: [190, surLeQuai(190)], points: [176, 204, 232, 214, 190].map((x) => [x, surLeQuai(x)]), voix: 0.9 },
      { nom: 'Sofia', genre: 'f', rocketbox: 'Female_Adult_04', pos: [12, -60], points: [[12, -60], [-12, -60], [-20, -70], [20, -72], [6, -78]], voix: 1.08 },
    ],
  };
}
