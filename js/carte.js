// La carte : le "Complexe Delta", avec un hall d'accueil, une cour, un entrepôt, des bureaux et un parcours.
//
//                 nord (-z)
//        ┌──────── PARCOURS ────────┐
//        │                          │
//  ENTREPÔT ─────── COUR ─────── BUREAUX
//        │                          │
//        └────────── HALL ──────────┘   <- départ
//                 sud (+z)
import * as THREE from 'three';
import { RAPIER, world, scene, creerObjet, ajouterDecor, fusionnerDecor, objets, vibrer } from './monde.js';
import { creerMateriaux, texturePanneau, textureEnseigne } from './materiaux.js';
import { jouerSon } from './sons.js';

const B = (taille, materiau, extra = {}) => ({ type: 'boite', taille, materiau, ...extra });
const C = (rayon, hauteur, materiau, extra = {}) => ({ type: 'cylindre', rayon, hauteur, materiau, ...extra });
const S = (rayon, materiau, extra = {}) => ({ type: 'boule', rayon, materiau, ...extra });
const SUR_X = [0, 0, Math.PI / 2], SUR_Z = [Math.PI / 2, 0, 0];
const alea = (a, b) => a + Math.random() * (b - a);

let M;
const animations = [];

// --- Petites briques de construction ---
const bloc = (pos, taille, materiau, extra = {}) => creerObjet({ pos, formes: [B(taille, materiau)], ...extra });
const solVisuel = (x, z, l, p, materiau, y = 0.006) => ajouterDecor(new THREE.BoxGeometry(l, 0.01, p), materiau, [x, y, z]);

// Morceau de mur exact : le long de l'axe 'x' ou 'z', à la position "fixe", de "debut" à "fin"
function segment(axe, fixe, debut, fin, h, materiau, ep, y0 = 0) {
  const milieu = (debut + fin) / 2, long = fin - debut;
  if (axe === 'z') bloc([fixe, y0 + h / 2, milieu], [ep, h, long], materiau);
  else bloc([milieu, y0 + h / 2, fixe], [long, h, ep], materiau);
}

// Mur aligné sur un axe, de (x1,z1) à (x2,z2) (avec x1 <= x2 et z1 <= z2), qui déborde un peu pour fermer les coins
function mur(x1, z1, x2, z2, h, materiau, ep = 0.3, y0 = 0) {
  if (x1 === x2) segment('z', x1, z1 - ep / 2, z2 + ep / 2, h, materiau, ep, y0);
  else segment('x', z1, x1 - ep / 2, x2 + ep / 2, h, materiau, ep, y0);
}

// Mur avec une ouverture [a, b] (le long du mur) de hauteur hOuv
function murOuvert(x1, z1, x2, z2, h, materiau, a, b, hOuv, ep = 0.3) {
  const [axe, fixe, debut, fin] = x1 === x2 ? ['z', x1, z1, z2] : ['x', z1, x1, x2];
  segment(axe, fixe, debut - ep / 2, a, h, materiau, ep);
  segment(axe, fixe, b, fin + ep / 2, h, materiau, ep);
  if (hOuv < h) segment(axe, fixe, a, b, h - hOuv, materiau, ep, hOuv);
}

function panneau(texture, pos, rotY, l = 2, h = 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(l, h), new THREE.MeshBasicMaterial({ map: texture }));
  m.position.set(...pos);
  m.rotation.y = rotY;
  scene.add(m);
}

function plafonnier(x, y, z, l = 1.2) {
  ajouterDecor(new THREE.BoxGeometry(l, 0.04, 0.3), M.lampe, [x, y, z]);
}

// --- Mobilier et objets ---
function table(x, z, l = 1.6, p = 0.8, h = 0.78, materiau = M.bois, rot = 0) {
  const pieds = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
    .map(([sx, sz]) => B([0.06, h - 0.03, 0.06], materiau, { pos: [sx * (l / 2 - 0.08), -(h - 0.03) / 2 - 0.015, sz * (p / 2 - 0.08)] }));
  creerObjet({ pos: [x, h - 0.015, z], rot: [0, rot, 0], formes: [B([l, 0.03, p], materiau), ...pieds] });
}

function banc(x, z, rot) {
  creerObjet({ pos: [x, 0, z], rot: [0, rot, 0], formes: [
    B([1.6, 0.05, 0.4], M.bois, { pos: [0, 0.45, 0] }),
    B([1.6, 0.4, 0.05], M.bois, { pos: [0, 0.7, -0.19] }),
    B([0.06, 0.45, 0.35], M.fonte, { pos: [-0.7, 0.225, 0] }),
    B([0.06, 0.45, 0.35], M.fonte, { pos: [0.7, 0.225, 0] }),
  ] });
}

function arbre(x, z, taille = 1) {
  creerObjet({ pos: [x, 1.3 * taille, z], formes: [C(0.18 * taille, 2.6 * taille, M.ecorce)] });
  const boules = [[0, 3.2, 0, 1.3], [0.7, 2.8, 0.3, 1.0], [-0.6, 3.5, -0.4, 0.95], [0.1, 3.9, 0.5, 0.8]];
  boules.forEach(([dx, y, dz, r], i) => ajouterDecor(new THREE.IcosahedronGeometry(r * taille, 1),
    i % 2 ? M.feuillageClair : M.feuillage, [x + dx * taille, y * taille, z + dz * taille], [alea(0, 3), alea(0, 3), 0]));
}

function lampadaire(x, z) {
  creerObjet({ pos: [x, 1.75, z], formes: [C(0.06, 3.5, M.fonte)] });
  ajouterDecor(new THREE.SphereGeometry(0.18, 12, 8), M.lampe, [x, 3.6, z]);
}

function plante(x, z) {
  creerObjet({ pos: [x, 0.25, z], formes: [C(0.25, 0.5, M.couleur(0xb5643c, 0.9))] });
  ajouterDecor(new THREE.IcosahedronGeometry(0.45, 1), M.feuillage, [x, 0.85, z]);
}

function carton(pos, taille = 0.3, masse = 0.6) {
  return creerObjet({ pos, masse, son: 'carton', formes: [B([taille, taille * 0.8, taille], M.carton)], nom: 'carton' });
}
function caisse(pos, c = 0.42, masse = 8) {
  return creerObjet({ pos, masse, son: 'bois', formes: [B([c, c, c], M.caisse)], nom: 'caisse' });
}
function balle(pos, couleur, rayon = 0.065, masse = 0.25) {
  return creerObjet({ pos, masse, rebond: 0.8, son: 'caoutchouc', formes: [S(rayon, M.couleur(couleur, 0.5))], nom: 'balle' });
}
function baril(pos, materiau) {
  return creerObjet({ pos, masse: 20, son: 'metal', friction: 0.6, formes: [C(0.29, 0.88, materiau),
    C(0.295, 0.03, M.fonte, { pos: [0, 0.3, 0], visuel: true }), C(0.295, 0.03, M.fonte, { pos: [0, -0.3, 0], visuel: true })], nom: 'baril' });
}

function porte(xc, zc, axe, largeur, sens = 1, materiau = M.bois, hauteur = 2.12) {
  // Porte sur charnière : (xc, zc) = position de la charnière ; axe 'x' ou 'z' = direction de la porte fermée
  const dx = axe === 'x' ? sens * largeur / 2 : 0, dz = axe === 'z' ? sens * largeur / 2 : 0;
  const taille = axe === 'x' ? [largeur - 0.04, hauteur, 0.05] : [0.05, hauteur, largeur - 0.04];
  const poignee = axe === 'x' ? [sens * (largeur / 2 - 0.12), 0, 0] : [0, 0, sens * (largeur / 2 - 0.12)];
  const off = axe === 'x' ? [0, 0, 0.06] : [0.06, 0, 0];
  const yc = 0.03 + hauteur / 2;
  const p = creerObjet({ pos: [xc + dx, yc, zc + dz], masse: 14, son: 'bois', amortissement: 1.5, nom: 'porte', formes: [
    B(taille, materiau),
    B([0.04, 0.04, 0.04], M.chrome, { pos: [poignee[0] + off[0], -0.05, poignee[2] + off[2]] }),
    B([0.04, 0.04, 0.04], M.chrome, { pos: [poignee[0] - off[0], -0.05, poignee[2] - off[2]] }),
  ] });
  const cadre = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(xc, yc, zc));
  const j = world.createImpulseJoint(RAPIER.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: -dx, y: 0, z: -dz }, { x: 0, y: 1, z: 0 }), cadre, p.corps, true);
  j.setLimits(-1.75, 1.75);
  j.setContactsEnabled(false);
  return p;
}

function bureau(x, z, rot) {
  creerObjet({ pos: [x, 0, z], rot: [0, rot, 0], formes: [
    B([1.4, 0.04, 0.7], M.bois, { pos: [0, 0.74, 0] }),
    B([0.04, 0.72, 0.66], M.acierGris, { pos: [-0.66, 0.36, 0] }),
    B([0.04, 0.72, 0.66], M.acierGris, { pos: [0.66, 0.36, 0] }),
    B([1.3, 0.4, 0.02], M.acierGris, { pos: [0, 0.5, -0.32] }),
    // écran
    B([0.56, 0.34, 0.03], M.ecranNoir, { pos: [0, 1.06, -0.2] }),
    B([0.5, 0.29, 0.005], M.ecran, { pos: [0, 1.06, -0.183], visuel: true }),
    B([0.05, 0.16, 0.05], M.fonte, { pos: [0, 0.84, -0.22] }),
    B([0.22, 0.015, 0.16], M.fonte, { pos: [0, 0.765, -0.22] }),
  ] });
  const c = Math.cos(rot), s = Math.sin(rot);
  const local = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const [kx, kz] = local(0, 0.08);
  creerObjet({ pos: [kx, 0.775, kz], rot: [0, rot, 0], masse: 0.6, son: 'plastique', nom: 'clavier', formes: [B([0.42, 0.02, 0.13], M.couleur(0x23262b, 0.5))] });
  const [tx, tz] = local(0.5, 0.1);
  creerObjet({ pos: [tx, 0.82, tz], masse: 0.3, son: 'plastique', nom: 'tasse', formes: [C(0.04, 0.1, M.couleur(0xf0efe8, 0.3))] });
  const [cx, cz] = local(0, 0.75);
  chaise(cx, cz, rot + Math.PI);
}

function chaise(x, z, rot) {
  creerObjet({ pos: [x, 0.03, z], rot: [0, rot, 0], masse: 9, son: 'plastique', nom: 'chaise', formes: [
    C(0.3, 0.05, M.fonte, { friction: 0.25 }),
    C(0.03, 0.38, M.chrome, { pos: [0, 0.22, 0] }),
    B([0.48, 0.07, 0.46], M.tissu, { pos: [0, 0.44, 0] }),
    B([0.46, 0.5, 0.06], M.tissu, { pos: [0, 0.75, 0.21] }),
  ] });
}

function commode(x, z) {
  // Meuble à tiroirs (contre un mur au nord, tiroirs vers +z)
  const meuble = creerObjet({ pos: [x, 0, z], formes: [
    B([0.5, 1.3, 0.02], M.acierGris, { pos: [0, 0.65, -0.29] }),
    B([0.02, 1.3, 0.6], M.acierGris, { pos: [-0.25, 0.65, 0] }),
    B([0.02, 1.3, 0.6], M.acierGris, { pos: [0.25, 0.65, 0] }),
    B([0.52, 0.02, 0.6], M.acierGris, { pos: [0, 1.3, 0] }),
    B([0.52, 0.02, 0.6], M.acierGris, { pos: [0, 0.01, 0] }),
  ] });
  for (const y of [0.22, 0.65, 1.08]) {
    const t = creerObjet({ pos: [x, y, z], masse: 3, son: 'metal', nom: 'tiroir', formes: [
      B([0.44, 0.02, 0.52], M.acierGris, { pos: [0, -0.15, 0] }),
      B([0.02, 0.28, 0.52], M.acierGris, { pos: [-0.21, -0.02, 0] }),
      B([0.02, 0.28, 0.52], M.acierGris, { pos: [0.21, -0.02, 0] }),
      B([0.44, 0.28, 0.02], M.acierGris, { pos: [0, -0.02, -0.25] }),
      B([0.46, 0.38, 0.03], M.acierBleu, { pos: [0, 0, 0.275] }),
      B([0.16, 0.03, 0.04], M.chrome, { pos: [0, 0.05, 0.31] }),
    ] });
    const j = world.createImpulseJoint(RAPIER.JointData.prismatic({ x: 0, y, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }), meuble.corps, t.corps, true);
    j.setLimits(0, 0.42);
    j.setContactsEnabled(false);
  }
  creerObjet({ pos: [x, 1.14, z - 0.05], masse: 0.2, son: 'metal', nom: 'clé', formes: [B([0.12, 0.015, 0.04], M.couleur(0xd4af37, 0.3))] });
}

// --- Objets qu'on utilise avec la gâchette ---
function lampeTorche(pos) {
  const o = creerObjet({ pos, masse: 0.5, son: 'metal', nom: 'lampe', formes: [
    C(0.024, 0.2, M.fonte, { rot: SUR_Z, pos: [0, 0, -0.02] }),
    C(0.034, 0.05, M.chrome, { rot: SUR_Z, pos: [0, 0, -0.14] }),
    B([0.03, 0.1, 0.035], M.caoutchouc, { pos: [0, -0.07, 0.03] }),
  ] });
  const verre = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), new THREE.MeshBasicMaterial({ color: 0x555555 }));
  verre.position.set(0, 0, -0.166);
  verre.rotation.y = Math.PI;
  const spot = new THREE.SpotLight(0xfff2d8, 0, 20, 0.38, 0.45, 1.5);
  spot.position.set(0, 0, -0.17);
  spot.target.position.set(0, 0, -2);
  o.groupe.add(verre, spot, spot.target);
  o.poignee = new THREE.Vector3(0, -0.07, 0.03);
  o.utiliser = (objet, main) => {
    const allumee = spot.intensity === 0;
    spot.intensity = allumee ? 25 : 0;
    verre.material.color.set(allumee ? 0xfff6cc : 0x555555);
    jouerSon('clic', objet.groupe.position, 0.6);
    vibrer(main.cote, 0.3, 20);
  };
  return o;
}

function lanceBalles(pos, munitions) {
  const o = creerObjet({ pos, masse: 0.9, son: 'plastique', nom: 'lance-balles', formes: [
    C(0.035, 0.32, M.acierOrange, { rot: SUR_Z, pos: [0, 0, -0.08] }),
    C(0.026, 0.1, M.fonte, { rot: SUR_Z, pos: [0, 0, -0.27] }),
    B([0.035, 0.11, 0.045], M.fonte, { pos: [0, -0.075, 0.04] }),
  ] });
  o.poignee = new THREE.Vector3(0, -0.075, 0.04);
  let suivante = 0;
  const bout = new THREE.Vector3(), dir = new THREE.Vector3();
  o.utiliser = (objet, main) => {
    const b = munitions[suivante];
    suivante = (suivante + 1) % munitions.length;
    if (b.range) return;
    bout.set(0, 0, -0.36).applyQuaternion(objet.groupe.quaternion).add(objet.groupe.position);
    dir.set(0, 0, -1).applyQuaternion(objet.groupe.quaternion);
    const v = objet.corps.linvel();
    b.corps.setTranslation(bout, true);
    b.corps.setLinvel({ x: dir.x * 15 + v.x, y: dir.y * 15 + v.y, z: dir.z * 15 + v.z }, true);
    b.corps.setAngvel({ x: 0, y: 0, z: 0 }, true);
    jouerSon('tir', bout, 0.8);
    vibrer(main.cote, 0.7, 35);
    objet.corps.applyImpulse({ x: -dir.x * 0.4, y: -dir.y * 0.4, z: -dir.z * 0.4 }, true);
  };
  return o;
}

function marteau(pos) {
  return creerObjet({ pos, masse: 1.1, son: 'metal', nom: 'marteau', formes: [
    C(0.016, 0.32, M.bois, { rot: SUR_X }),
    B([0.05, 0.05, 0.13], M.fonte, { pos: [0.17, 0, 0] }),
  ] });
}

// =====================================================================
export function construireCarte() {
  M = creerMateriaux();

  // Sol général (herbe) et ciel
  creerObjet({ pos: [0, -0.1, -4], formes: [B([120, 0.2, 120], M.herbe)], son: 'herbe' });

  construireHall();
  construireCour();
  construireEntrepot();
  construireBureaux();
  construireParcours();

  fusionnerDecor();
  return {
    animations,
    depart: new THREE.Vector3(0, 0, 18.5),
    personnages: [
      { nom: 'Léa', modele: 'femme', pos: [-2, 13], points: [[-2, 13], [2, 12.5], [0, 16], [-3, 19.5], [4, 19.5], [1, 21]], voix: 1 },
      { nom: 'Marc', modele: 'homme', pos: [4, -4], points: [[-4, -4], [4, -4], [4, 4], [-4, 4], [0, 7], [-7, -2], [7, 2], [0, -7]], voix: 1 },
      { nom: 'Karim', modele: 'homme', pos: [-17, 0], teinte: 0x9fb8ff, points: [[-17, 0], [-20, 4.5], [-17, -3], [-24, 1.2], [-20, 8], [-27, -0.5]], voix: 0.9 },
      { nom: 'Sofia', modele: 'femme', pos: [17, 3], teinte: 0xffd8b0, points: [[16, 2], [19, 3], [17, 6], [20, 7], [16, 8.5], [20.5, 1]], voix: 1.08 },
    ],
  };
}

// --- Hall d'accueil (départ) : x -8..8, z 10..22 ---
function construireHall() {
  solVisuel(0, 16, 16, 12, M.carrelage);
  mur(-8, 22, 8, 22, 4.5, M.mur);
  mur(-8, 10, -8, 22, 4.5, M.mur);
  mur(8, 10, 8, 22, 4.5, M.mur);
  murOuvert(-8, 10, 8, 10, 4.5, M.mur, -2.5, 2.5, 3.2);
  bloc([0, 4.65, 16], [16.3, 0.3, 12.3], M.plafond);
  for (const x of [-3.5, 3.5]) for (const z of [13, 19]) plafonnier(x, 4.48, z);

  // Accueil
  creerObjet({ pos: [-4.5, 0, 13.5], formes: [B([3, 1.05, 0.6], M.bois, { pos: [0, 0.525, 0] }), B([3.2, 0.05, 0.8], M.blanc, { pos: [0, 1.075, 0] })] });
  creerObjet({ pos: [-4.2, 1.13, 13.4], masse: 1.2, son: 'plastique', nom: 'téléphone', formes: [B([0.2, 0.07, 0.16], M.couleur(0x23262b, 0.4))] });
  creerObjet({ pos: [-5.3, 1.16, 13.5], masse: 0.8, son: 'carton', nom: 'livre', formes: [B([0.22, 0.04, 0.3], M.couleur(0x8c2f39, 0.8))] });
  creerObjet({ pos: [-5.3, 1.2, 13.5], masse: 0.8, son: 'carton', nom: 'livre', formes: [B([0.22, 0.04, 0.3], M.couleur(0x2f5d8c, 0.8))] });

  // Table de test avec les petits objets
  table(3.5, 15.5, 2, 0.9);
  for (const p of [[2.75, 0.87, 15.4], [2.98, 0.87, 15.4], [2.865, 1.04, 15.4], [2.8, 0.87, 15.75]]) carton(p, 0.2, 0.4);
  balle([3.6, 0.86, 15.65], 0xd63c3c);
  balle([3.8, 0.86, 15.4], 0x3c7bd6);
  creerObjet({ pos: [4.05, 0.85, 15.7], masse: 0.9, nom: 'cube', formes: [B([0.12, 0.12, 0.12], M.bois)] });
  creerObjet({ pos: [3.5, 0.81, 15.2], masse: 0.9, nom: 'bâton', formes: [B([0.9, 0.045, 0.045], M.bois)] });
  lampeTorche([4.05, 0.91, 15.25]);
  marteau([3.3, 0.81, 15.85]);

  // Bac de balles en mousse + lance-balles
  creerObjet({ pos: [2.2, 0, 15.5], formes: [
    B([0.5, 0.04, 0.5], M.acierBleu, { pos: [0, 0.7, 0] }),
    B([0.5, 0.15, 0.03], M.acierBleu, { pos: [0, 0.79, 0.235] }), B([0.5, 0.15, 0.03], M.acierBleu, { pos: [0, 0.79, -0.235] }),
    B([0.03, 0.15, 0.5], M.acierBleu, { pos: [0.235, 0.79, 0] }), B([0.03, 0.15, 0.5], M.acierBleu, { pos: [-0.235, 0.79, 0] }),
    B([0.06, 0.68, 0.06], M.fonte, { pos: [0, 0.34, 0] }),
  ] });
  const munitions = [];
  for (let i = 0; i < 10; i++) {
    const b = creerObjet({ pos: [2.05 + (i % 4) * 0.09, 0.76 + Math.floor(i / 4) * 0.07, 15.38 + (i % 3) * 0.1], masse: 0.03, rebond: 0.75,
      son: 'caoutchouc', nom: 'balle en mousse', formes: [S(0.032, M.couleur(0xe8e23a, 0.8), { segments: 12 })] });
    b.jouet = true;
    munitions.push(b);
  }
  lanceBalles([4.35, 0.92, 15.55], munitions);

  // Décor
  banc(-7.5, 17, Math.PI / 2);
  banc(-7.5, 20, Math.PI / 2);
  for (const [x, z] of [[7.2, 21.2], [-7.2, 21.2], [7.2, 10.8], [-7.2, 10.8]]) plante(x, z);
  creerObjet({ pos: [7.45, 0.95, 19.5], formes: [B([0.8, 1.9, 0.9], M.couleur(0xb3262e, 0.5)), B([0.02, 1.2, 0.6], M.ecran, { pos: [-0.41, 0.2, 0], visuel: true })] });

  panneau(texturePanneau('Commandes', [
    'Gâchette du majeur : attraper / grimper',
    'Gâchette de l\'index : utiliser l\'objet tenu',
    'Joystick gauche : marcher (clic = courir)',
    'Joystick droit : tourner / bas = s\'accroupir',
    'A : sauter   B : tout remettre en place',
    'Y : rotation fluide ou par crans   X : revenir ici',
    'Lâche un objet sur ta hanche ou ton épaule = rangé',
    'Main serrée vers un objet + coup de poignet = attiré',
  ]), [-7.82, 2.3, 14.5], Math.PI / 2, 2.6, 1.3);
  panneau(textureEnseigne('COMPLEXE DELTA'), [0, 3.85, 10.17], 0, 4, 1);
}

// --- Cour extérieure : x -14..14, z -10..10 ---
function construireCour() {
  solVisuel(0, 0, 3, 20, M.pave);
  solVisuel(0, 0, 28, 3, M.pave, 0.007);
  mur(-14, 10, -8, 10, 3.5, M.brique);
  mur(8, 10, 14, 10, 3.5, M.brique);
  murOuvert(-14, -10, 14, -10, 3.5, M.brique, -3, 3, 3.5);

  // Fontaine
  const bord = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    bord.push(B([0.85, 0.5, 0.25], M.beton, { pos: [Math.cos(a) * 2, 0.25, Math.sin(a) * 2], rot: [0, -a + Math.PI / 2, 0] }));
  }
  creerObjet({ pos: [0, 0, 0], formes: [...bord, C(0.22, 1.4, M.beton, { pos: [0, 0.7, 0] }), C(0.6, 0.15, M.beton, { pos: [0, 1.45, 0] })] });
  ajouterDecor(new THREE.CylinderGeometry(1.9, 1.9, 0.02, 32), M.eau, [0, 0.35, 0]);
  ajouterDecor(new THREE.CylinderGeometry(0.55, 0.55, 0.02, 20), M.eau, [0, 1.53, 0]);

  // Arbres, bancs, lampadaires
  for (const [x, z, t] of [[-10, -7, 1.1], [-6, -7.5, 0.9], [6.5, -7.3, 1], [-5, 7.5, 1], [11.5, 7.5, 1.15], [-11.5, -2, 0.95]]) arbre(x, z, t);
  banc(-6.5, -3.4, 0);
  banc(4.5, 7.6, Math.PI);
  banc(6, -3.4, 0);
  for (const [x, z] of [[-2.3, -6], [2.3, -6], [-2.3, 6], [2.3, 6]]) lampadaire(x, z);

  // Panier de basket
  const anneau = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    anneau.push(B([0.13, 0.02, 0.02], M.acierOrange, { pos: [Math.cos(a) * 0.23, 0, Math.sin(a) * 0.23], rot: [0, -a + Math.PI / 2, 0] }));
  }
  creerObjet({ pos: [10, 0, -9.4], formes: [
    C(0.08, 3.4, M.acierGris, { pos: [0, 1.7, 0] }),
    B([0.1, 0.1, 0.6], M.acierGris, { pos: [0, 3.2, 0.3] }),
    B([1.8, 1.05, 0.05], M.blanc, { pos: [0, 3.35, 0.62] }),
  ] });
  creerObjet({ pos: [10, 3.05, -8.53], formes: anneau, friction: 0.5 });
  ajouterDecor(new THREE.CylinderGeometry(0.23, 0.15, 0.4, 12, 2, true), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true }), [10, 2.85, -8.53]);
  for (const x of [9.2, 10.8]) creerObjet({ pos: [x, 0.12, -6], masse: 0.6, rebond: 0.75, son: 'caoutchouc', nom: 'ballon de basket',
    formes: [S(0.12, M.couleur(0xd9752b, 0.7))] });

  // Voiture garée
  creerObjet({ pos: [-9.6, 0, 5.8], formes: [
    B([4.2, 0.7, 1.8], M.acierBleu, { pos: [0, 0.65, 0] }),
    B([2.3, 0.62, 1.62], M.verreSombre, { pos: [-0.2, 1.31, 0] }),
    B([2.25, 0.05, 1.6], M.acierBleu, { pos: [-0.2, 1.64, 0] }),
    ...[[-1.35, -0.86], [1.35, -0.86], [-1.35, 0.86], [1.35, 0.86]].map(([x, z]) => C(0.34, 0.24, M.caoutchouc, { rot: SUR_Z, pos: [x, 0.34, z] })),
    B([0.12, 0.2, 1.82], M.chrome, { pos: [2.12, 0.45, 0] }),
    B([0.12, 0.2, 1.82], M.chrome, { pos: [-2.12, 0.45, 0] }),
    B([0.03, 0.1, 0.3], M.lampe, { pos: [2.11, 0.75, 0.6], visuel: true }),
    B([0.03, 0.1, 0.3], M.lampe, { pos: [2.11, 0.75, -0.6], visuel: true }),
  ] });

  // Table de pique-nique
  creerObjet({ pos: [7, 0, 4.5], formes: [
    B([1.8, 0.06, 0.8], M.bois, { pos: [0, 0.76, 0] }),
    B([1.8, 0.05, 0.3], M.bois, { pos: [0, 0.45, 0.62] }),
    B([1.8, 0.05, 0.3], M.bois, { pos: [0, 0.45, -0.62] }),
    B([0.08, 0.76, 1.5], M.bois, { pos: [-0.7, 0.38, 0] }),
    B([0.08, 0.76, 1.5], M.bois, { pos: [0.7, 0.38, 0] }),
  ] });
  creerObjet({ pos: [6.6, 0.9, 4.5], masse: 0.43, rebond: 0.7, son: 'caoutchouc', nom: 'ballon de foot', formes: [S(0.11, M.blanc)] });
  creerObjet({ pos: [7.3, 0.8, 4.3], masse: 0.17, son: 'plastique', nom: 'frisbee', formes: [C(0.13, 0.02, M.couleur(0x2ecc71, 0.4))] });
  for (let i = 0; i < 3; i++) creerObjet({ pos: [7.5 + i * 0.1, 0.92, 4.7], masse: 0.5, son: 'plastique', nom: 'bouteille',
    formes: [C(0.035, 0.26, M.couleur([0x3c7bd6, 0xd63c3c, 0x2ecc71][i], 0.2))] });

  panneau(textureEnseigne('PARCOURS'), [0, 3.0, -9.83], 0, 3, 0.75);
}

// --- Entrepôt : x -32..-14, z -10..10 ---
function construireEntrepot() {
  solVisuel(-23, 0, 18, 20, M.beton);
  mur(-32, -10, -32, 10, 7, M.brique);
  mur(-32, -10, -14, -10, 7, M.brique);
  mur(-32, 10, -14, 10, 7, M.brique);
  murOuvert(-14, -10, -14, 10, 7, M.brique, -3, 3, 4.5);
  bloc([-23, 7.15, 0], [18.3, 0.3, 20.3], M.plafond);
  for (const x of [-28, -23, -18]) for (const z of [-5, 0, 5]) plafonnier(x, 6.98, z, 1.6);
  panneau(textureEnseigne('ENTREPÔT'), [-13.83, 5.2, 0], Math.PI / 2, 3, 0.75);

  // Étagères
  for (const x of [-29.5, -26, -22.5]) {
    const formes = [];
    for (const z of [-8.4, -5.5, -2.6]) for (const dx of [-0.42, 0.42]) formes.push(B([0.08, 2.6, 0.08], M.acierOrange, { pos: [dx, 1.3, z + 5.5] }));
    for (const y of [0.15, 1.2, 2.25]) formes.push(B([0.92, 0.04, 6], M.bois, { pos: [0, y, 0] }));
    creerObjet({ pos: [x, 0, -5.5], formes });
  }
  carton([-29.5, 0.32, -7.6], 0.4, 1.5); carton([-29.5, 0.32, -6.9], 0.35, 1); carton([-29.5, 1.35, -4], 0.45, 2);
  carton([-26, 0.3, -3.5], 0.3, 0.7); carton([-26, 1.36, -7], 0.5, 2.5); carton([-26, 2.4, -5], 0.35, 1);
  caisse([-22.5, 0.4, -7.5], 0.45, 7); caisse([-22.5, 1.45, -4.2], 0.45, 7); caisse([-22.5, 0.4, -3.2], 0.45, 7);

  // Barils, palettes, caisses
  baril([-17.5, 0.44, 6.2], M.acierBleu); baril([-16.8, 0.44, 6.9], M.acierVert); baril([-17.6, 0.44, 7.5], M.acierBleu);
  creerObjet({ pos: [-16.6, 0.29, 8.4], rot: [Math.PI / 2, 0.4, 0], masse: 20, son: 'metal', formes: [C(0.29, 0.88, M.acierOrange)], nom: 'baril' });
  for (let i = 0; i < 3; i++) creerObjet({ pos: [-29, 0.065 + i * 0.14, 7.2], masse: 12, son: 'bois', nom: 'palette', formes: [
    B([1.2, 0.03, 0.8], M.bois, { pos: [0, 0.05, 0] }),
    ...[-0.35, 0, 0.35].map((z) => B([1.2, 0.09, 0.1], M.bois, { pos: [0, -0.015, z] })),
  ] });
  const C42 = 0.42, E = 0.44;
  for (const [dx, etage] of [[-E, 0], [0, 0], [E, 0], [-E / 2, 1], [E / 2, 1], [0, 2]]) caisse([-19 + dx, C42 / 2 + etage * (C42 + 0.005), -6]);
  creerObjet({ pos: [-16.5, 0.3, -8], masse: 50, friction: 0.6, son: 'metal', formes: [B([0.7, 0.6, 0.6], M.metal)], nom: 'caisse en métal' });
  creerObjet({ pos: [-30.6, 0, 0], formes: [B([1.5, 1.5, 2.2], M.acierVert, { pos: [0, 0.75, 0] }), B([1.55, 0.2, 2.25], M.rayures, { pos: [0, 0.1, 0] })] });

  // Mezzanine (3 m) avec escalier, échelle et garde-corps
  bloc([-29.25, 2.9, 6], [5.5, 0.2, 8], M.beton);
  for (const z of [2.2, 6, 9.8]) bloc([-26.65, 1.4, z], [0.25, 2.8, 0.25], M.acierGris);
  for (let k = 1; k <= 11; k++) {
    const h = 3 - 0.25 * k;
    bloc([-26.25 + 0.5 * (k - 1), h / 2, 9.2], [0.5, h, 1.2], M.beton);
  }
  // Garde-corps : ouvert en z 3.5..4.5 (échelle) et z 8.6..10 (escalier)
  const poteauGC = (x, z) => B([0.05, 1, 0.05], M.acierOrange, { pos: [x, 0, z] });
  creerObjet({ pos: [-26.55, 3.5, 0], formes: [
    B([0.05, 0.05, 1.5], M.acierOrange, { pos: [0, 0.5, 2.75] }), poteauGC(0, 2.05), poteauGC(0, 3.5),
    B([0.05, 0.05, 4.1], M.acierOrange, { pos: [0, 0.5, 6.55] }), poteauGC(0, 4.5), poteauGC(0, 8.6),
    B([5.45, 0.05, 0.05], M.acierOrange, { pos: [-2.725, 0.5, 2.05] }), poteauGC(-5.4, 2.05),
  ] });
  const echelle = [B([0.05, 3.6, 0.05], M.acierGris, { pos: [0, 1.8, -0.25] }), B([0.05, 3.6, 0.05], M.acierGris, { pos: [0, 1.8, 0.25] })];
  for (let y = 0.3; y < 3.4; y += 0.3) echelle.push(C(0.018, 0.5, M.acierGris, { rot: SUR_Z, pos: [0, y, 0] }));
  creerObjet({ pos: [-26.38, 0, 4.0], formes: echelle });
  balle([-30, 3.1, 4], 0x9b59b6, 0.1, 0.4);
  creerObjet({ pos: [-31, 3.11, 8], masse: 6, son: 'pierre', nom: 'boule de bowling', formes: [S(0.11, M.couleur(0x1d1f3a, 0.2))] });
  carton([-30.5, 3.2, 5.5], 0.35, 0.8); carton([-30.5, 3.5, 5.5], 0.3, 0.6);

  // Coin musculation : sac de frappe, haltères, bascule, planche
  creerObjet({ pos: [-16.5, 2.4, 4], formes: [B([0.1, 0.1, 1.6], M.fonte)] });
  const poteau = creerObjet({ pos: [-16.5, 1.175, 3.25], formes: [B([0.1, 2.35, 0.1], M.fonte)] });
  creerObjet({ pos: [-16.5, 1.175, 4.75], formes: [B([0.1, 2.35, 0.1], M.fonte)] });
  const HAUT_SAC = 0.375 + 0.18, CORDE = 0.5;
  const sac = creerObjet({ pos: [-16.5, 2.35 - CORDE - HAUT_SAC, 4], masse: 25, amortissement: 0.6, son: 'chair', nom: 'sac',
    formes: [{ type: 'capsule', rayon: 0.18, hauteur: 0.75, materiau: M.sac }] });
  world.createImpulseJoint(RAPIER.JointData.spherical({ x: 0, y: 1.175, z: 0.75 }, { x: 0, y: HAUT_SAC + CORDE, z: 0 }), poteau.corps, sac.corps, true);
  const corde = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 8), M.corde);
  scene.add(corde);
  const accroche = new THREE.Vector3(-16.5, 2.35, 4), bas = new THREE.Vector3(), haut = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
  animations.push(() => {
    bas.set(0, HAUT_SAC, 0).applyQuaternion(sac.groupe.quaternion).add(sac.groupe.position);
    corde.position.copy(accroche).add(bas).multiplyScalar(0.5);
    corde.scale.y = accroche.distanceTo(bas);
    corde.quaternion.setFromUnitVectors(haut, d.subVectors(accroche, bas).normalize());
  });
  for (const z of [1.8, 2.4]) creerObjet({ pos: [-18.6, 0.1, z], masse: 12, son: 'metal', nom: 'haltère', formes: [
    C(0.017, 0.44, M.chrome, { rot: SUR_X }), C(0.1, 0.07, M.fonte, { rot: SUR_X, pos: [-0.17, 0, 0] }), C(0.1, 0.07, M.fonte, { rot: SUR_X, pos: [0.17, 0, 0] }),
  ] });
  const support = creerObjet({ pos: [-24, 0.25, -1], formes: [B([0.3, 0.5, 0.5], M.fonte)] });
  const plancheBascule = creerObjet({ pos: [-24, 0.55, -1], masse: 12, nom: 'bascule', formes: [B([3.2, 0.06, 0.45], M.bois)] });
  const pivot = world.createImpulseJoint(RAPIER.JointData.revolute({ x: 0, y: 0.27, z: 0 }, { x: 0, y: -0.03, z: 0 }, { x: 0, y: 0, z: 1 }), support.corps, plancheBascule.corps, true);
  pivot.setContactsEnabled(false);
  creerObjet({ pos: [-20.5, 0.025, 7.6], masse: 6, nom: 'planche', formes: [B([2, 0.04, 0.22], M.bois)] });
}

// --- Bureaux : x 14..30, z -10..10 ---
function construireBureaux() {
  solVisuel(18, 0, 8, 20, M.parquet);
  solVisuel(26, 0, 8, 20, M.carrelage);
  mur(30, -10, 30, 10, 3.5, M.mur);
  mur(14, -10, 30, -10, 3.5, M.mur);
  mur(14, 10, 30, 10, 3.5, M.mur);
  murOuvert(14, -10, 14, 10, 3.5, M.mur, -0.6, 0.6, 2.2);
  murOuvert(22, -10, 22, 10, 3.5, M.mur, 3, 4.2, 2.2, 0.2);
  bloc([22, 3.65, 0], [16.3, 0.3, 20.3], M.plafond);
  for (const x of [16, 20, 24, 28]) for (const z of [-5, 0, 5]) plafonnier(x, 3.48, z);
  panneau(textureEnseigne('BUREAUX'), [13.83, 2.8, 0], -Math.PI / 2, 2.4, 0.6);
  porte(14, -0.55, 'z', 1.1, 1);
  porte(22, 3.05, 'z', 1.1, 1);

  // Salle 1 : open space
  bureau(16.5, -6.5, 0); bureau(19.5, -6.5, 0); bureau(16.5, -3.2, 0); bureau(19.5, -3.2, 0);
  commode(21.2, -9.55);
  const tableau = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshStandardMaterial({ map: texturePanneau('Réunion de 14 h', [
    '1. Ranger l\'entrepôt (encore !)', '2. Qui a mis la caisse de 50 kg ici ?', '3. Interdit de lancer des balles sur les collègues',
  ], '#f4f4f0') }));
  tableau.position.set(16.5, 1.6, -9.83);
  scene.add(tableau);
  creerObjet({ pos: [21.5, 0, 8.6], formes: [B([0.35, 1.0, 0.35], M.blanc, { pos: [0, 0.5, 0] }), C(0.15, 0.45, M.eau, { pos: [0, 1.25, 0] })] });
  plante(14.6, 9.4); plante(21.4, -0.5);

  // Salle 2 : salle de pause et labo
  creerObjet({ pos: [26.5, 0, 8.7], formes: [
    B([2.4, 0.45, 0.9], M.tissuRouge, { pos: [0, 0.225, 0] }), B([2.4, 0.5, 0.2], M.tissuRouge, { pos: [0, 0.7, 0.35] }),
    B([0.2, 0.3, 0.9], M.tissuRouge, { pos: [-1.2, 0.6, 0] }), B([0.2, 0.3, 0.9], M.tissuRouge, { pos: [1.2, 0.6, 0] }),
  ] });
  for (const x of [25.8, 27.2]) creerObjet({ pos: [x, 0.55, 8.6], masse: 0.5, son: 'carton', nom: 'coussin', formes: [B([0.45, 0.14, 0.45], M.tissu)] });
  table(26.5, 6.6, 1.2, 0.6, 0.45);
  creerObjet({ pos: [26.3, 0.5, 6.6], masse: 0.3, son: 'plastique', nom: 'tasse', formes: [C(0.04, 0.1, M.couleur(0xd63c3c, 0.3))] });
  creerObjet({ pos: [26.8, 0.47, 6.5], masse: 0.4, son: 'plastique', nom: 'télécommande', formes: [B([0.05, 0.025, 0.18], M.couleur(0x23262b, 0.5))] });
  creerObjet({ pos: [29.8, 1.5, 6.5], formes: [B([0.08, 0.9, 1.6], M.ecranNoir), B([0.01, 0.82, 1.5], M.ecran, { pos: [-0.045, 0, 0], visuel: true })] });

  // Frigo avec porte
  creerObjet({ pos: [29.35, 0, -8.2], formes: [
    B([0.6, 1.8, 0.04], M.blanc, { pos: [0, 0.9, -0.33] }), B([0.6, 1.8, 0.04], M.blanc, { pos: [0, 0.9, 0.33] }),
    B([0.04, 1.8, 0.7], M.blanc, { pos: [0.3, 0.9, 0] }), B([0.6, 0.04, 0.7], M.blanc, { pos: [0, 1.8, 0] }),
    B([0.6, 0.06, 0.7], M.blanc, { pos: [0, 0.03, 0] }), B([0.56, 0.02, 0.62], M.verre, { pos: [0, 0.9, 0] }),
  ] });
  porte(29.01, -8.53, 'z', 0.72, 1, M.blanc, 1.76);
  for (let i = 0; i < 3; i++) creerObjet({ pos: [29.35, 1.05, -8.4 + i * 0.16], masse: 0.5, son: 'plastique', nom: 'bouteille', formes: [C(0.035, 0.24, M.couleur(0x3caf6a, 0.2))] });
  creerObjet({ pos: [29.35, 0.14, -8.2], masse: 1, son: 'plastique', nom: 'pastèque', formes: [S(0.1, M.couleur(0x2f7a3a, 0.5))] });

  // Labo
  table(25, -4, 2, 0.8, 0.9, M.acierGris);
  for (let i = 0; i < 4; i++) creerObjet({ pos: [24.4 + i * 0.35, 1.01, -4], masse: 0.3, son: 'plastique', nom: 'fiole',
    formes: [C(0.04, 0.18, M.verre)] });
  creerObjet({ pos: [25.6, 0.97, -3.75], masse: 2, son: 'metal', nom: 'microscope', formes: [B([0.15, 0.04, 0.2], M.blanc), C(0.025, 0.25, M.fonte, { pos: [0, 0.14, -0.03] })] });
}

// --- Parcours : x -14..14, z -28..-10 ---
function construireParcours() {
  solVisuel(0, -19, 28, 18, M.beton);
  mur(-14, -28, -14, -10, 4, M.brique);
  mur(14, -28, 14, -10, 4, M.brique);
  mur(-14, -28, 14, -28, 4, M.brique);

  // Tour d'escalade de 3,5 m avec prises colorées
  creerObjet({ pos: [8, 1.75, -25.75], formes: [B([3, 3.5, 1.5], M.tour)] });
  const couleurs = [0xe74c3c, 0xf1c40f, 0x2ecc71, 0x3498db, 0x9b59b6, 0xe67e22];
  const prises = [];
  for (let i = 0; i < 15; i++) {
    const y = 0.5 + i * 0.21;
    const x = (i % 2 ? 0.35 : -0.35) + Math.sin(i * 1.7) * 0.25;
    prises.push(B([0.14, 0.06, 0.1], M.couleur(couleurs[i % couleurs.length], 0.8), { pos: [x, y - 1.75, 0.8] }));
  }
  creerObjet({ pos: [8, 1.75, -25.75], formes: prises, friction: 1.2 });
  creerObjet({ pos: [8, 3.75, -26], masse: 0.3, rebond: 0.7, son: 'caoutchouc', nom: 'ballon', formes: [S(0.25, M.couleur(0xf2b134, 0.5))] });

  // Barres de singe
  creerObjet({ pos: [-6, 0, -16], formes: [
    B([0.08, 0.08, 6.4], M.acierBleu, { pos: [-0.35, 2.4, 0] }), B([0.08, 0.08, 6.4], M.acierBleu, { pos: [0.35, 2.4, 0] }),
    ...[[-0.35, -3.1], [0.35, -3.1], [-0.35, 3.1], [0.35, 3.1]].map(([x, z]) => B([0.1, 2.4, 0.1], M.acierBleu, { pos: [x, 1.2, z] })),
    ...Array.from({ length: 15 }, (_, i) => C(0.02, 0.7, M.chrome, { rot: SUR_X, pos: [0, 2.4, -2.8 + i * 0.4] })),
  ] });
  bloc([-6, 0.5, -12.2], [1.2, 1, 1.2], M.rayures);
  bloc([-6, 0.5, -19.8], [1.2, 1, 1.2], M.rayures);

  // Mur à rebords
  bloc([1, 2, -27.5], [6, 4, 1], M.beton);
  creerObjet({ pos: [0, 0, -26.92], formes: [[-1.2, 1.3], [0.3, 1.9], [1.8, 2.5], [3.0, 3.1], [1.5, 3.6]]
    .map(([x, y]) => B([0.6, 0.06, 0.16], M.acierOrange, { pos: [x, y, 0] })) });

  // Blocs de saut de plus en plus hauts
  [0.4, 0.8, 1.2, 1.6, 2.0].forEach((h, i) => bloc([1 + i * 1.5, h / 2, -15], [1, h, 1], M.rayures));

  // Toit-terrasse (3 m) avec escalier et garde-corps
  bloc([-11.5, 1.5, -25.5], [5, 3, 5], M.brique);
  for (let k = 1; k <= 11; k++) {
    const h = 3 - 0.25 * k;
    bloc([-9.6, h / 2, -22.75 + 0.5 * (k - 1)], [1.2, h, 0.5], M.beton);
  }
  creerObjet({ pos: [0, 3.5, 0], formes: [
    B([3.8, 0.05, 0.05], M.acierOrange, { pos: [-12.1, 0.5, -23.05] }),
    ...[-14, -12.1, -10.25].map((x) => B([0.05, 1, 0.05], M.acierOrange, { pos: [x, 0, -23.05] })),
    B([0.05, 0.05, 5], M.acierOrange, { pos: [-9.05, 0.5, -25.5] }),
    ...[-28, -25.5, -23.05].map((z) => B([0.05, 1, 0.05], M.acierOrange, { pos: [-9.05, 0, z] })),
  ] });
  balle([-12, 3.1, -26], 0xe74c3c, 0.1, 0.4); balle([-11, 3.1, -26.5], 0x3498db, 0.1, 0.4);
  creerObjet({ pos: [-12.5, 3.12, -25], masse: 0.6, rebond: 0.75, son: 'caoutchouc', nom: 'ballon de basket', formes: [S(0.12, M.couleur(0xd9752b, 0.7))] });
}

export function retrouverObjet(nom) {
  return objets.find((o) => o.nom === nom);
}
