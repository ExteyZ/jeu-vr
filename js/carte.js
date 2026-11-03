// Matériaux de base et fabriques d'objets de la carte (caisses, balles, lampe, lance-balles, voiture, bancs...).
// La ville elle-même est construite dans ville.js, le hameau de chalets dans village.js.
import * as THREE from 'three';
import { RAPIER, world, scene, creerObjet, ajouterDecor, fusionnerDecor, objets, vibrer, CG_MARCHES, CG_RAMPE, enregistrerDetails, uvMonde } from './monde.js';
import { creerMateriaux, texturePanneau, textureEnseigne } from './materiaux.js';
import { jouerSon } from './sons.js';
import { ressources, copieModele } from './ressources.js';

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

// Rampe invisible sous un escalier, de "bas" à "haut" (nez des marches) : seul le joueur la sent,
// pour monter les marches en douceur comme dans la vraie vie
function rampe(bas, haut, largeur) {
  const a = new THREE.Vector3(...bas), b = new THREE.Vector3(...haut);
  const long = new THREE.Vector3().subVectors(b, a);
  const L = long.length();
  long.normalize();
  const cote = new THREE.Vector3().crossVectors(long, new THREE.Vector3(0, 1, 0)).normalize();
  const dessus = new THREE.Vector3().crossVectors(cote, long);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(long, dessus, cote));
  const centre = a.clone().add(b).multiplyScalar(0.5).addScaledVector(dessus, -0.05);
  const e = new THREE.Euler().setFromQuaternion(q);
  creerObjet({ pos: [centre.x, centre.y, centre.z], rot: [e.x, e.y, e.z], cg: CG_RAMPE, fusion: false,
    formes: [B([L, 0.1, largeur], null, { cache: true })] });
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

// --- Vrais modèles 3D (Poly Haven, CC0) avec une forme de collision ajustée à leur taille ---
// forme : 'boite' | 'cylindre' | 'boule' | 'poteau' (fin poteau au pied du modèle) | 'aucune'
// taille = plus grande dimension voulue (m) ; hauteur = hauteur voulue (m) ; sinon taille réelle du modèle
const taillesSources = new Map();
function objetModele(id, pos, { masse = 0, rot = [0, 0, 0], forme = 'boite', son, nom = id, taille, hauteur,
  friction, rebond, amortissement, ombre = true } = {}) {
  if (!ressources.modeles.has(id)) return null;
  if (!taillesSources.has(id)) taillesSources.set(id, copieModele(id, 1).boite.getSize(new THREE.Vector3()));
  const t0 = taillesSources.get(id);
  const echelle = taille ? taille / Math.max(t0.x, t0.y, t0.z) : hauteur ? hauteur / t0.y : 1;
  const { modele, boite } = copieModele(id, echelle);
  // Le point le plus bas du modèle est posé à la hauteur "pos"
  modele.position.y -= boite.min.y;
  boite.translate(new THREE.Vector3(0, -boite.min.y, 0));
  const t = boite.getSize(new THREE.Vector3()), c = boite.getCenter(new THREE.Vector3());
  let formes = [];
  if (forme === 'boite') formes = [{ type: 'boite', taille: [t.x, t.y, t.z], pos: [c.x, c.y, c.z] }];
  else if (forme === 'cylindre') formes = [{ type: 'cylindre', rayon: Math.max(t.x, t.z) / 2, hauteur: t.y, pos: [c.x, c.y, c.z] }];
  else if (forme === 'boule') formes = [{ type: 'boule', rayon: Math.max(t.x, t.y, t.z) / 2, pos: [c.x, c.y, c.z] }];
  else if (forme === 'poteau') formes = [{ type: 'cylindre', rayon: 0.09, hauteur: t.y, pos: [0, t.y / 2, 0] }];
  formes.forEach((f) => { f.cache = true; });
  const o = creerObjet({ pos, rot, masse, son, nom, formes, fusion: false, friction, rebond, amortissement });
  if (!ombre) modele.traverse((m) => { if (m.isMesh) m.castShadow = false; });
  o.groupe.add(modele);
  enregistrerDetails(modele, Math.max(t.x, t.y, t.z));
  o.dimensions = t.clone();
  if (masse > 0) {
    const b = new THREE.Box3().setFromObject(o.groupe);
    const s = b.getSize(new THREE.Vector3());
    o.tailleMax = Math.max(s.x, s.y, s.z);
  }
  return o;
}

// Voiture réaliste (Ferrari des exemples three.js), garée et immobile
function voiture(x, z, rotY) {
  if (!ressources.ferrari) return false;
  const modele = ressources.ferrari.clone(true);
  const carrosserie = new THREE.MeshPhysicalMaterial({ color: 0x8c0c10, metalness: 0.85, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.03 });
  const details = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.35 });
  const vitre = new THREE.MeshStandardMaterial({ color: 0x14181e, metalness: 0.4, roughness: 0.04, transparent: true, opacity: 0.6 });
  const corps = modele.getObjectByName('body');
  if (corps) corps.material = carrosserie;
  for (const n of ['rim_fl', 'rim_fr', 'rim_rr', 'rim_rl', 'trim']) { const o = modele.getObjectByName(n); if (o) o.material = details; }
  const verre = modele.getObjectByName('glass');
  if (verre) verre.material = vitre;
  // L'habitacle (des centaines de milliers de triangles) ne fait pas d'ombre et n'est affiché que de près
  const habitacle = (m) => /leather|interior|plastic|carbon|steering|carpet|nuts|^brake(_\d)?$|^metal$|leds|wipers/.test(m.name);
  modele.traverse((o) => { if (o.isMesh) { o.castShadow = !habitacle(o); o.receiveShadow = true; } });
  modele.updateMatrixWorld(true);
  let boite = new THREE.Box3().setFromObject(modele);
  const t0 = boite.getSize(new THREE.Vector3());
  modele.scale.setScalar(4.5 / Math.max(t0.x, t0.z));
  modele.updateMatrixWorld(true);
  boite = new THREE.Box3().setFromObject(modele);
  const t = boite.getSize(new THREE.Vector3()), c = boite.getCenter(new THREE.Vector3());
  modele.position.y = -boite.min.y;
  const o = creerObjet({ pos: [x, 0, z], rot: [0, rotY, 0], fusion: false, son: 'metal',
    formes: [{ type: 'boite', taille: [t.x, t.y * 0.85, t.z], pos: [c.x, t.y * 0.425, c.z], cache: true }] });
  o.groupe.add(modele);
  enregistrerDetails(modele, 0, habitacle, 9);
  return true;
}

// --- Mobilier et objets ---
function table(x, z, l = 1.6, p = 0.8, h = 0.78, materiau = M.bois, rot = 0) {
  const pieds = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
    .map(([sx, sz]) => B([0.06, h - 0.03, 0.06], materiau, { pos: [sx * (l / 2 - 0.08), -(h - 0.03) / 2 - 0.015, sz * (p / 2 - 0.08)] }));
  creerObjet({ pos: [x, h - 0.015, z], rot: [0, rot, 0], formes: [B([l, 0.03, p], materiau), ...pieds] });
}

function banc(x, z, rot) {
  if (objetModele('painted_wooden_bench', [x, 0, z], { rot: [0, rot, 0], hauteur: 0.85 })) return;
  creerObjet({ pos: [x, 0, z], rot: [0, rot, 0], formes: [
    B([1.6, 0.05, 0.4], M.bois, { pos: [0, 0.45, 0] }),
    B([1.6, 0.4, 0.05], M.bois, { pos: [0, 0.7, -0.19] }),
    B([0.06, 0.45, 0.35], M.fonte, { pos: [-0.7, 0.225, 0] }),
    B([0.06, 0.45, 0.35], M.fonte, { pos: [0.7, 0.225, 0] }),
  ] });
}

function arbre(x, z, taille = 1) {
  // Massif d'arbustes dans un bac en bois
  if (objetModele('planter_box_01', [x, 0, z], { rot: [0, alea(0, 3), 0] })) {
    objetModele('shrub_03', [x, 0.35, z], { forme: 'aucune', hauteur: 1.6 * taille, rot: [0, alea(0, 6), 0] });
    return;
  }
  creerObjet({ pos: [x, 1.3 * taille, z], formes: [C(0.18 * taille, 2.6 * taille, M.ecorce)] });
  const boules = [[0, 3.2, 0, 1.3], [0.7, 2.8, 0.3, 1.0], [-0.6, 3.5, -0.4, 0.95], [0.1, 3.9, 0.5, 0.8]];
  boules.forEach(([dx, y, dz, r], i) => ajouterDecor(new THREE.IcosahedronGeometry(r * taille, 1),
    i % 2 ? M.feuillageClair : M.feuillage, [x + dx * taille, y * taille, z + dz * taille], [alea(0, 3), alea(0, 3), 0]));
}

function lampadaire(x, z, rot = 0) {
  if (objetModele('street_lamp_02', [x, 0, z], { forme: 'poteau', hauteur: 3.8, rot: [0, rot, 0] })) return;
  creerObjet({ pos: [x, 1.75, z], formes: [C(0.06, 3.5, M.fonte)] });
  ajouterDecor(new THREE.SphereGeometry(0.18, 12, 8), M.lampe, [x, 3.6, z]);
}

function plante(x, z) {
  if (objetModele('potted_plant_04', [x, 0, z], { forme: 'cylindre', hauteur: 1.1, rot: [0, alea(0, 6), 0] })) return;
  creerObjet({ pos: [x, 0.25, z], formes: [C(0.25, 0.5, M.couleur(0xb5643c, 0.9))] });
  ajouterDecor(new THREE.IcosahedronGeometry(0.45, 1), M.feuillage, [x, 0.85, z]);
}

function carton(pos, taille = 0.3, masse = 0.6) {
  const o = objetModele('cardboard_box_01', [pos[0], pos[1] - taille * 0.4, pos[2]], { masse, taille, son: 'carton', nom: 'carton', rot: [0, alea(-0.3, 0.3), 0] });
  if (o) return o;
  return creerObjet({ pos, masse, son: 'carton', formes: [B([taille, taille * 0.8, taille], M.carton)], nom: 'carton' });
}
function caisse(pos, c = 0.42, masse = 8) {
  const o = objetModele('wooden_crate_02', [pos[0], pos[1] - c / 2, pos[2]], { masse, taille: c, son: 'bois', nom: 'caisse' });
  if (o) return o;
  return creerObjet({ pos, masse, son: 'bois', formes: [B([c, c, c], M.caisse)], nom: 'caisse' });
}
function balle(pos, couleur, rayon = 0.065, masse = 0.25) {
  return creerObjet({ pos, masse, rebond: 0.8, son: 'caoutchouc', formes: [S(rayon, M.couleur(couleur, 0.5))], nom: 'balle' });
}
function baril(pos, materiau) {
  const o = objetModele('Barrel_01', [pos[0], pos[1] - 0.44, pos[2]], { masse: 20, hauteur: 0.88, forme: 'cylindre', son: 'metal', nom: 'baril', friction: 0.6, rot: [0, alea(0, 6), 0] });
  if (o) return o;
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
  const pieds = objetModele('metal_office_desk', [x, 0, z], { rot: [0, rot, 0], hauteur: 0.76 }) ? [] : [
    B([1.4, 0.04, 0.7], M.bois, { pos: [0, 0.74, 0] }),
    B([0.04, 0.72, 0.66], M.acierGris, { pos: [-0.66, 0.36, 0] }),
    B([0.04, 0.72, 0.66], M.acierGris, { pos: [0.66, 0.36, 0] }),
    B([1.3, 0.4, 0.02], M.acierGris, { pos: [0, 0.5, -0.32] }),
  ];
  creerObjet({ pos: [x, 0, z], rot: [0, rot, 0], formes: [
    ...pieds,
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
  if (objetModele('modern_arm_chair_01', [x, 0, z], { rot: [0, rot, 0], masse: 12, hauteur: 0.95, son: 'plastique', nom: 'chaise', friction: 0.4 })) return;
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
  const o = objetModele('wooden_hammer_01', [pos[0], pos[1] - 0.03, pos[2]], { masse: 0.8, taille: 0.33, son: 'bois', nom: 'marteau' });
  if (o) return o;
  return creerObjet({ pos, masse: 1.1, son: 'metal', nom: 'marteau', formes: [
    C(0.016, 0.32, M.bois, { rot: SUR_X }),
    B([0.05, 0.05, 0.13], M.fonte, { pos: [0.17, 0, 0] }),
  ] });
}


// =====================================================================
// Prépare les matériaux (photo quand ils sont chargés, sinon dessinés) ; la ville elle-même est dans ville.js
export function construireCarte() {
  M = creerMateriaux();
  const P = ressources.materiaux;
  const remplacements = { herbe: 'herbe', tour: 'planches', bois: 'planches' };
  for (const [cle, ph] of Object.entries(remplacements)) if (P[ph]) M[cle] = P[ph];
  if (P.planches) P.planches.color.set(0xc8955f);  // bois chaud
  return { animations };
}

export function retrouverObjet(nom) {
  return objets.find((o) => o.nom === nom);
}

// Pour les autres parties du monde (village, catalogue d'objets)
export function materiauxCarte() { return M; }
export { objetModele, carton, caisse, balle, baril, marteau, lampeTorche, chaise, lanceBalles, voiture, banc, lampadaire, panneau, table, animations };
