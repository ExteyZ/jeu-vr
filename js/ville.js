// La ville au bord du lac (rive sud) : quai en pierre et promenade, port avec pontons et barques, grande place pavée
// ouverte sur le lac (fontaine, terrasses de café, église), et des rues bordées de maisons de 3 à 5 étages aux façades
// colorées (fenêtres à volets, balcons, boutiques à stores, toits de tuiles ou d'ardoises, cheminées).
//
//        LAC (nord, -z)
//   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//   quai ─ promenade ─────────────── port (pontons)
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
import { ULTRA } from './profil.js';

const FRONT = -118;               // façades du front de lac
const PROF = 13, RUE = 9;         // profondeur des maisons, largeur des rues
const RANGEES = [FRONT, FRONT + PROF + RUE, FRONT + 2 * (PROF + RUE)];
const TRAVERSES = [-232, -150, -66, 66, 150, 232];    // rues perpendiculaires au lac (centre)
const PLACE = { x0: -61.5, x1: 61.5, z0: FRONT, z1: VILLE.z1 };
const ETAGE = 3.1;
const COULEURS = [0xf1e6cf, 0xe6c07a, 0xe8bba9, 0xcfdcbf, 0xc6d5e2, 0xf4f1ea, 0xeed58a, 0xe8a98a, 0xdcd3c0, 0xd9c2d6];
const COULEURS_VOLETS = [0x2f5d3a, 0x7a2b25, 0x2d4c66, 0x5b5f63, 0x6b4a2f, 0x3d6b5f];
const COULEURS_STORES = [0x9c2b2b, 0x2d5f3c, 0x2b4a7a, 0x8a6b1e, 0x6b2b5f];

let M, P;
const lots = new Map();     // morceaux de décor à fusionner, par matériau
const hasard = (() => { let s = 12345; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; })();

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
    dalles: copie(P.dalles ?? M.beton),
    pavage: copie(P.pavage ?? M.beton),
    place: copie(P.place ?? M.beton, 0xc9c6c0),
    tuiles: copie(P.tuiles ?? M.tour, 0xd9a07a, { side: THREE.DoubleSide }),
    ardoises: copie(P.ardoises ?? M.tour, 0x9aa0a8, { side: THREE.DoubleSide }),
    bois: copie(P.bois2 ?? M.bois, 0x8a7a68),
    fer: new THREE.MeshStandardMaterial({ color: 0x1f2226, roughness: 0.45, metalness: 0.7 }),
    vitre: new THREE.MeshStandardMaterial({ color: 0x1b242c, roughness: 0.04, metalness: 0.2, envMapIntensity: 1.6 }),
    cadre: new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.55 }),
    volet: copie(P.bois2 ?? M.bois, 0xffffff),
    porte: copie(P.bois2 ?? M.bois, 0x5a3a26),
    vitrine: new THREE.MeshStandardMaterial({ color: 0x24302a, roughness: 0.5 }),
    store: new THREE.MeshStandardMaterial({ map: textureStore(), roughness: 0.85, side: THREE.DoubleSide }),
    lanterne: new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffd9a0, emissiveIntensity: 1.6 }),
    eau: M.eau,
  };
}
let V;

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

// --- Éléments de façade, en série (une seule géométrie, affichée des milliers de fois) ---
class Serie {
  constructor(geo, materiau, avecCouleur = false) { this.geo = geo; this.materiau = materiau; this.poses = []; this.avecCouleur = avecCouleur; }
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
    inst.castShadow = inst.receiveShadow = true;
    inst.computeBoundingSphere();
    scene.add(inst);
  }
}
function fusion(parts) {
  return mergeGeometries(parts.map(([sx, sy, sz, x, y, z]) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z).toNonIndexed()));
}
// Toutes les pièces sont dessinées pour une façade tournée vers +z (on les tourne ensuite)
function series() {
  return {
    cadres: new Serie(fusion([[1.2, 0.09, 0.12, 0, 0.8, 0.05], [1.2, 0.09, 0.12, 0, -0.8, 0.05], [0.09, 1.66, 0.12, -0.56, 0, 0.05], [0.09, 1.66, 0.12, 0.56, 0, 0.05],
      [0.05, 1.55, 0.08, 0, 0, 0.04], [1.05, 0.05, 0.08, 0, 0.35, 0.04]]), V.cadre),
    vitres: new Serie(new THREE.PlaneGeometry(1.06, 1.56).translate(0, 0, 0.02), V.vitre),
    pierres: new Serie(fusion([[1.42, 0.07, 0.24, 0, -0.88, 0.1], [1.36, 0.16, 0.06, 0, 0.92, 0.03]]), V.pierreBlanche),
    volets: new Serie(fusion([[0.6, 1.62, 0.04, -0.92, 0, 0.05], [0.6, 1.62, 0.04, 0.92, 0, 0.05]]), V.volet, true),
    portes: new Serie(fusion([[1.3, 2.45, 0.08, 0, 1.22, 0.03], [1.5, 0.12, 0.14, 0, 2.5, 0.05], [0.1, 2.5, 0.14, -0.7, 1.25, 0.05], [0.1, 2.5, 0.14, 0.7, 1.25, 0.05]]), V.porte),
    vitrines: new Serie(new THREE.PlaneGeometry(2.7, 2.2).translate(0, 1.55, 0.03), V.vitre),
    cadresVitrines: new Serie(fusion([[3.0, 0.14, 0.14, 0, 2.7, 0.06], [3.0, 0.5, 0.12, 0, 0.25, 0.06], [0.14, 2.7, 0.14, -1.43, 1.35, 0.06], [0.14, 2.7, 0.14, 1.43, 1.35, 0.06], [0.06, 2.2, 0.08, 0, 1.55, 0.05]]), V.vitrine),
    stores: new Serie(new THREE.PlaneGeometry(3.0, 1.5).rotateX(-1.05).translate(0, 3.25, 0.62), V.store, true),
    balcons: new Serie(fusion([[2.0, 0.14, 0.9, 0, -0.07, 0.45],
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => [0.025, 0.95, 0.025, -0.95 + k * 0.2375, 0.47, 0.88]),
      [0.025, 0.95, 0.025, -0.95, 0.47, 0.45], [0.025, 0.95, 0.025, 0.95, 0.47, 0.45],
      [2.0, 0.04, 0.05, 0, 0.95, 0.88], [0.05, 0.04, 0.9, -0.97, 0.95, 0.45], [0.05, 0.04, 0.9, 0.97, 0.95, 0.45]]), V.fer),
  };
}

// --- Une maison de ville ---
// x0..x1 le long de la rue, zf : façade côté lac (z le plus petit), prof : profondeur, devant/derriere : rues
function maison(S, { x0, x1, zf, prof = PROF, etages, couleur, toit, commerce, cotesLibres }) {
  const l = x1 - x0, cx = (x0 + x1) / 2, cz = zf + prof / 2, H = etages * ETAGE + 0.6;
  // Murs (plâtre coloré), socle en pierre, bandeaux d'étage et corniche
  boite(V.facade, [l, H, prof], [cx, H / 2, cz], 0, couleur);
  boite(V.socle, [l + 0.08, 0.7, prof + 0.08], [cx, 0.35, cz]);
  for (let e = 1; e < etages; e++) boite(V.pierreBlanche, [l + 0.1, 0.16, prof + 0.1], [cx, e * ETAGE + 0.6, cz]);
  boite(V.pierreBlanche, [l + 0.36, 0.32, prof + 0.36], [cx, H - 0.1, cz]);
  solide([l, H, prof], [cx, H / 2, cz]);

  // Toit à deux pans (faîtage parallèle à la rue), pignons en plâtre, cheminées
  const deb = 0.45, demi = prof / 2 + deb, montee = (prof / 2) * 0.78;
  const pans = new THREE.BufferGeometry();
  const ax = x0 - deb, bx = x1 + deb, yb = H - deb * 0.78 + 0.05, yh = H + montee;
  const p = [ax, yb, zf - deb, bx, yb, zf - deb, bx, yh, cz, ax, yh, cz, ax, yh, cz, bx, yh, cz, bx, yb, zf + prof + deb, ax, yb, zf + prof + deb];
  pans.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  const t = (toit.userData?.tuile ?? 2.5), lp = Math.hypot(demi, montee + deb * 0.78);
  pans.setAttribute('uv', new THREE.Float32BufferAttribute([ax / t, 0, bx / t, 0, bx / t, lp / t, ax / t, lp / t, ax / t, lp / t, bx / t, lp / t, bx / t, 0, ax / t, 0], 2));
  pans.setIndex([0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6]);
  pans.computeVertexNormals();
  ajouterAuLot(toit, pans);
  const pignon = new THREE.BufferGeometry();
  pignon.setAttribute('position', new THREE.Float32BufferAttribute([x0, H, zf, x0, H, zf + prof, x0, yh - 0.1, cz, x1, H, zf + prof, x1, H, zf, x1, yh - 0.1, cz], 3));
  pignon.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, prof / 3, 0, prof / 6, montee / 3, 0, 0, prof / 3, 0, prof / 6, montee / 3], 2));
  pignon.computeVertexNormals();
  ajouterAuLot(V.facade, pignon, couleur);
  for (let c = 0; c < 1 + (l > 12 ? 1 : 0); c++) {
    const xc = x0 + l * (0.25 + 0.5 * c + (hasard() - 0.5) * 0.15), zc = cz + (hasard() - 0.5) * prof * 0.4;
    boite(V.facade, [0.75, 2.2, 0.75], [xc, yh - 0.2, zc], 0, couleur);
    boite(V.socle, [0.95, 0.14, 0.95], [xc, yh + 0.95, zc]);
  }

  // Façades : côté lac (-z) et côté opposé (+z), plus les côtés qui donnent sur une rue
  const faces = [
    { long: l, centre: (u) => [cx + u, zf], rot: Math.PI, dehors: [0, -1] },
    { long: l, centre: (u) => [cx - u, zf + prof], rot: 0, dehors: [0, 1] },
  ];
  if (cotesLibres?.gauche) faces.push({ long: prof, centre: (u) => [x0, cz - u], rot: -Math.PI / 2, dehors: [-1, 0], cote: true });
  if (cotesLibres?.droite) faces.push({ long: prof, centre: (u) => [x1, cz + u], rot: Math.PI / 2, dehors: [1, 0], cote: true });
  const volets = hasard() < 0.75, couleurVolets = COULEURS_VOLETS[Math.floor(hasard() * COULEURS_VOLETS.length)];
  for (const [i, f] of faces.entries()) {
    const n = Math.max(1, Math.floor((f.long - 1.8) / 2.7)), pas = f.long / n;
    // Rez-de-chaussée : vitrines à stores (commerces) ou porte et fenêtres
    const commerceIci = commerce && i === 0;
    const porteIndex = Math.floor(hasard() * n);
    for (let k = 0; k < n; k++) {
      const u = -f.long / 2 + pas * (k + 0.5);
      const [px, pz] = f.centre(u);
      if (commerceIci && !f.cote) {
        if (k === porteIndex) S.portes.ajouter(px, 0, pz, f.rot);
        else {
          S.vitrines.ajouter(px, 0, pz, f.rot); S.cadresVitrines.ajouter(px, 0, pz, f.rot);
          S.stores.ajouter(px, 0, pz, f.rot, COULEURS_STORES[(Math.floor(cx) + k) % COULEURS_STORES.length]);
        }
      } else if (k === porteIndex && !f.cote) S.portes.ajouter(px, 0.0, pz, f.rot);
      else fenetre(S, px, 1.85, pz, f.rot, volets, couleurVolets);
      // Étages
      for (let e = 1; e < etages; e++) {
        const y = e * ETAGE + 0.6 + 1.5;
        fenetre(S, px, y, pz, f.rot, volets, couleurVolets);
        if (!f.cote && i === 0 && e <= 2 && k === Math.floor(n / 2) && (cx * 7 + e) % 3 < 1.2) S.balcons.ajouter(px, e * ETAGE + 0.6, pz, f.rot);
      }
    }
  }
}

function fenetre(S, x, y, z, rot, volets, couleurVolets) {
  S.cadres.ajouter(x, y, z, rot);
  S.vitres.ajouter(x, y, z, rot);
  S.pierres.ajouter(x, y, z, rot);
  if (volets) S.volets.ajouter(x, y, z, rot, couleurVolets);
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

// --- Quai : mur en pierre au bord de l'eau, promenade dallée, garde-corps, réverbères, bancs, fleurs ---
function quai() {
  const pas = 3;
  // Dalles de la promenade, de la rive jusqu'aux façades
  const pos = [], uv = [], idx = [], t = V.dalles.userData?.tuile ?? 3;
  for (let x = VILLE.x0, i = 0; x <= VILLE.x1 + 0.01; x += pas, i++) {
    const zr = riveSud(x) + 0.35;
    pos.push(x, 0.02, zr, x, 0.02, FRONT + 0.5);
    uv.push(x / t, zr / t, x / t, (FRONT + 0.5) / t);
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeVertexNormals();
  const dalles = new THREE.Mesh(g, V.dalles);
  dalles.receiveShadow = true;
  scene.add(dalles);
  // Mur du quai qui plonge dans le lac, et sa margelle
  for (let x = VILLE.x0; x < VILLE.x1; x += pas) {
    const xm = x + pas / 2, zr = riveSud(xm), a = Math.atan2(riveSud(x + pas) - riveSud(x), pas);
    boite(V.quai, [pas + 0.05, 3.6, 1.1], [xm, -1.55, zr - 0.25], -a);
    boite(V.pierreBlanche, [pas + 0.05, 0.16, 0.7], [xm, 0.09, zr - 0.1], -a);
    // Garde-corps en fer forgé (ouvert devant le port)
    if (xm > 155 && xm < 245) continue;
    boite(V.fer, [pas, 0.05, 0.05], [xm, 1.0, zr + 0.05], -a);
    boite(V.fer, [pas, 0.03, 0.03], [xm, 0.55, zr + 0.05], -a);
    boite(V.fer, [0.06, 1.0, 0.06], [x, 0.5, riveSud(x) + 0.05]);
  }
  // Réverbères, bancs face au lac et bacs à fleurs
  for (let x = VILLE.x0 + 10; x < VILLE.x1; x += 20) {
    const zr = riveSud(x);
    reverbere(x, zr + 2.2);
    if ((x / 20) % 2 < 1 && !(x > 155 && x < 245)) objetModele('painted_wooden_bench', [x + 10, 0.02, zr + 3.4], { rot: [0, Math.PI, 0], hauteur: 0.85 });
  }
  for (let x = VILLE.x0 + 20; x < VILLE.x1; x += 40) {
    if (x > -62 && x < 62) continue;
    objetModele('planter_pot_clay', [x, 0.02, FRONT - 2.2], { hauteur: 0.7 });
    fleurs(x, 0.62, FRONT - 2.2, 0.45);
  }
}

function reverbere(x, z) {
  boite(V.fer, [0.3, 0.4, 0.3], [x, 0.2, z]);
  boite(V.fer, [0.12, 4.2, 0.12], [x, 2.3, z]);
  boite(V.fer, [0.6, 0.08, 0.08], [x, 4.2, z]);
  boite(V.lanterne, [0.32, 0.45, 0.32], [x, 4.6, z]);
  boite(V.fer, [0.42, 0.06, 0.42], [x, 4.86, z]);
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
    for (let z = z0 - 6; z > z1; z -= 3.2) for (const s of [-1, 1]) boite(V.porte, [0.22, 6, 0.22], [x + s * 1.2, y - 3, z]);
    for (const s of [-1, 1]) boite(V.porte, [0.24, 1.1, 0.24], [x + s * 1.2, y + 0.55, z1 + 0.3]);
    objetModele('lifebuoy', [x + 1.35, y + 0.35, z1 + 1], { hauteur: 0.7, rot: [0, Math.PI / 2, 0], ombre: false });
    creerBarque(x + 3.2, z1 + 9 + (x % 7), 0.05);
  }
  // Tonneaux et caisses sur le quai du port (on peut les déplacer)
  for (let i = 0; i < 6; i++) baril([186 + i * 1.1, 0.46, FRONT - 3.2 - (i % 2) * 0.9], i % 2 ? M.acierOrange : M.acierVert);
  for (let i = 0; i < 5; i++) caisse([214 + (i % 3) * 0.9, 0.22 + Math.floor(i / 3) * 0.44, FRONT - 3.5], 0.42, 8);
  objetModele('wine_barrel_01', [212, 0.02, FRONT - 1.6], { hauteur: 1.1 });
  objetModele('wine_barrel_01', [213.4, 0.02, FRONT - 1.6], { hauteur: 1.1 });
}

// --- La place : fontaine, terrasses de café avec parasols, chariot à café, panneau des commandes ---
function placeDuVillage(depart) {
  // Fontaine (bassin octogonal en pierre, colonne, vasque)
  const fx = 0, fz = -92;
  creerObjet({ pos: [fx, 0, fz], son: 'pierre', formes: [
    { type: 'cylindre', rayon: 3.4, hauteur: 0.75, materiau: V.quai, pos: [0, 0.375, 0], segments: 8 },
    { type: 'cylindre', rayon: 0.35, hauteur: 2.4, materiau: V.pierreBlanche, pos: [0, 1.2, 0] },
    { type: 'cylindre', rayon: 1.1, hauteur: 0.25, materiau: V.pierreBlanche, pos: [0, 2.0, 0] },
  ] });
  const eau = new THREE.Mesh(new THREE.CircleGeometry(3.15, 8).rotateX(-Math.PI / 2).rotateY(Math.PI / 8), new THREE.MeshStandardMaterial({ color: 0x1f5c66, roughness: 0.05, metalness: 0.1, envMapIntensity: 1.4 }));
  eau.position.set(fx, 0.68, fz);
  scene.add(eau);

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
  const S = series();
  // Sols : pavés dans toutes les rues, gros pavés sur la place
  sol(V.pavage, VILLE.x0, VILLE.x1, FRONT, VILLE.z1 + 6, 0.015);
  sol(V.place, PLACE.x0, PLACE.x1, FRONT, -50, 0.025);
  quai();

  // Maisons : trois rangées le long du lac, coupées par des rues perpendiculaires (sauf la place)
  const troncons = [];
  let debut = VILLE.x0 + 6;
  for (const t of [...TRAVERSES, VILLE.x1 - 6 + RUE / 2]) {
    troncons.push([debut, t - RUE / 2]);
    debut = t + RUE / 2;
  }
  RANGEES.forEach((zf, r) => {
    for (const [a, b] of troncons) {
      if (a > PLACE.x0 - 1 && b < PLACE.x1 + 1) continue;   // la place
      let x = a;
      while (b - x > 7) {
        let l = 9 + hasard() * 6;
        if (b - x - l < 8) l = b - x;
        maison(S, {
          x0: x, x1: x + l, zf, etages: 3 + Math.floor(hasard() * (r === 0 ? 3 : 2.5)),
          couleur: COULEURS[Math.floor(hasard() * COULEURS.length)], toit: hasard() < 0.72 ? V.tuiles : V.ardoises,
          commerce: r === 0 || (r === 1 && hasard() < 0.5) || Math.abs(x - PLACE.x0) < 20 || Math.abs(x + l - PLACE.x1) < 20,
          cotesLibres: { gauche: x === a, droite: x + l === b },
        });
        x += l;
      }
    }
  });
  eglise(S);
  port();
  const depart = new THREE.Vector3(0, 0, -72);
  placeDuVillage(depart);
  voiture(110, -100, Math.PI / 2);

  for (const s of Object.values(S)) s.construire();
  fusionnerLots();
  fusionnerDecor();   // fontaine, pontons, panneaux : assemblés en un seul dessin par matériau
  return {
    animations,
    depart,
    personnages: [
      { nom: 'Léa', genre: 'f', rocketbox: 'Female_Adult_02', pos: [-8, -100], points: [[-8, -100], [8, -101], [11, -86], [-10, -84], [-14, -95]], voix: 1 },
      { nom: 'Marc', genre: 'm', rocketbox: 'Male_Adult_01', pos: [-40, -128], points: [[-40, -128], [-10, -131], [20, -130], [50, -128], [10, -126], [-25, -127]], voix: 1 },
      { nom: 'Karim', genre: 'm', rocketbox: 'Male_Adult_05', pos: [190, -130], points: [[176, -128], [204, -129], [232, -130], [214, -126], [190, -127]], voix: 0.9 },
      { nom: 'Sofia', genre: 'f', rocketbox: 'Female_Adult_04', pos: [12, -60], points: [[12, -60], [-12, -60], [-20, -70], [20, -72], [6, -78]], voix: 1.08 },
    ],
  };
}
