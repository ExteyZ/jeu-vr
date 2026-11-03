// Monde partagé : moteur physique (Rapier), scène 3D et fonctions pour créer des objets.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import RAPIER from '@dimforge/rapier3d-compat';

await RAPIER.init();
export { RAPIER };

// Groupes de collision : (à quel groupe j'appartiens << 16) | (avec quels groupes je collisionne)
export const G_MONDE = 0x0001, G_JOUEUR = 0x0002, G_MAIN = 0x0004, G_PNJ = 0x0008, G_RAGDOLL = 0x0010, G_TENU = 0x0020, G_RAMPE = 0x0040;
export const groupes = (membre, filtre) => (membre << 16) | filtre;
export const CG_MONDE = groupes(G_MONDE, 0xffff);
export const CG_TENU = groupes(G_TENU, 0xffff & ~G_JOUEUR);             // un objet tenu ne pousse pas notre propre corps
export const CG_JOUEUR = groupes(G_JOUEUR, G_MONDE | G_PNJ | G_RAMPE);
// Escaliers : les marches arrêtent les objets et les mains, mais le joueur glisse sur une rampe invisible (montée fluide)
export const CG_MARCHES = groupes(G_MONDE, 0xffff & ~G_JOUEUR);
export const CG_RAMPE = groupes(G_RAMPE, G_JOUEUR);
export const CG_MAIN = groupes(G_MAIN, G_MONDE | G_MAIN | G_PNJ | G_RAGDOLL | G_TENU);
export const CG_PNJ = groupes(G_PNJ, G_MONDE | G_MAIN | G_JOUEUR | G_TENU);
export const CG_RAGDOLL = groupes(G_RAGDOLL, G_MONDE | G_MAIN | G_TENU | G_RAGDOLL);   // les membres se cognent entre eux

export const GRAVITE = 9.81;
export const world = new RAPIER.World({ x: 0, y: -GRAVITE, z: 0 });
export const scene = new THREE.Scene();

// Tous les objets mobiles (pour afficher leur position et pouvoir tout remettre en place)
export const objets = [];
// Infos attachées à chaque collider (handle -> { main } | { objet } | { pnj } | { decor })
export const infos = new Map();

// Manettes VR branchées, par côté ('left' / 'right')
export const manettes = { left: null, right: null };

export function vibrer(cote, force, ms) {
  const gp = manettes[cote]?.gamepad;
  if (!gp) return;
  const h = gp.hapticActuators?.[0];
  if (h?.pulse) h.pulse(force, ms);
  else gp.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: force, weakMagnitude: force });
}

const quat = (r) => new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2]));

function volume(f) {
  switch (f.type) {
    case 'boite': return f.taille[0] * f.taille[1] * f.taille[2];
    case 'boule': return (4 / 3) * Math.PI * f.rayon ** 3;
    case 'cylindre': return Math.PI * f.rayon ** 2 * f.hauteur;
    case 'capsule': return Math.PI * f.rayon ** 2 * f.hauteur + (4 / 3) * Math.PI * f.rayon ** 3;
  }
}

function forme(f) {
  switch (f.type) {
    case 'boite': return [RAPIER.ColliderDesc.cuboid(f.taille[0] / 2, f.taille[1] / 2, f.taille[2] / 2), new THREE.BoxGeometry(...f.taille)];
    case 'boule': return [RAPIER.ColliderDesc.ball(f.rayon), new THREE.SphereGeometry(f.rayon, f.segments ?? 24, Math.ceil((f.segments ?? 24) * 0.66))];
    case 'cylindre': return [RAPIER.ColliderDesc.cylinder(f.hauteur / 2, f.rayon), new THREE.CylinderGeometry(f.rayon, f.rayon, f.hauteur, f.segments ?? 20)];
    case 'capsule': return [RAPIER.ColliderDesc.capsule(f.hauteur / 2, f.rayon), new THREE.CapsuleGeometry(f.rayon, f.hauteur, 6, 16)];
  }
}

// Sur le décor, les textures se répètent selon la taille réelle (1 motif = "tuile" mètres)
function uvMonde(geo, [sx, sy, sz], tuile) {
  const uv = geo.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];   // faces +x -x +y -y +z -z
  for (let face = 0; face < 6; face++) {
    for (let k = 0; k < 4; k++) {
      const i = face * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[face][0] / tuile, uv.getY(i) * dims[face][1] / tuile);
    }
  }
}

// Le décor fixe est fusionné en quelques gros maillages (beaucoup plus rapide à afficher sur le Quest)
const aFusionner = new Map();   // matériau -> [géométries en coordonnées monde]
const mTmp = new THREE.Matrix4();

// Crée un objet physique et son affichage.
// masse = 0 -> objet fixe (sol, murs...). Sinon la masse (en kg) est répartie sur toutes les formes.
// formes : [{ type: 'boite'|'boule'|'cylindre'|'capsule', taille|rayon|hauteur, pos?, rot?, materiau, visuel? }]
//   visuel: true -> seulement affiché, sans collision
// son : 'bois' | 'metal' | 'carton' | 'caoutchouc' | 'plastique' | 'pierre' | 'herbe' | 'chair'
export function creerObjet({ pos, rot = [0, 0, 0], formes, masse = 0, friction = 0.8, rebond = 0.05, amortissement = 0,
  nom = '', son = masse > 0 ? 'bois' : 'pierre', fusion = true, cg = CG_MONDE }) {
  const q = quat(rot);
  const fixe = masse <= 0;
  const desc = fixe ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true);
  desc.setTranslation(...pos).setRotation(q);
  if (amortissement) desc.setLinearDamping(amortissement * 0.1).setAngularDamping(amortissement);
  // Résistance au roulement : sans elle, balles et cylindres rouleraient indéfiniment
  else if (!fixe && formes.some((f) => f.type === 'boule' || f.type === 'cylindre')) desc.setLinearDamping(0.15).setAngularDamping(1.6);
  const corps = world.createRigidBody(desc);

  const physiques = formes.filter((f) => !f.visuel);
  const densite = fixe ? 1 : masse / physiques.reduce((s, f) => s + volume(f), 0);
  const groupe = new THREE.Group();
  const objet = { corps, groupe, nom, masse, son, colliders: [], depart: { pos: [...pos], quat: q.clone() } };
  groupe.position.set(...pos);
  groupe.quaternion.copy(q);
  groupe.updateMatrixWorld(true);

  for (const f of formes) {
    const [cd, geo] = forme(f);
    const fp = f.pos ?? [0, 0, 0], fq = quat(f.rot ?? [0, 0, 0]);
    if (!f.visuel) {
      cd.setTranslation(...fp).setRotation(fq).setDensity(densite)
        .setFriction(f.friction ?? friction).setRestitution(f.rebond ?? rebond).setCollisionGroups(cg);
      if (!fixe) cd.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(masse * GRAVITE * 3);
      const collider = world.createCollider(cd, corps);
      if (cg !== CG_RAMPE) infos.set(collider.handle, fixe ? { decor: objet } : { objet });   // une rampe invisible ne s'attrape pas
      objet.colliders.push(collider);
    }

    if (f.cache) continue;   // forme de collision seulement : un vrai modèle 3D la recouvre
    if (fixe && fusion && f.type === 'boite') uvMonde(geo, f.taille, f.materiau.userData?.tuile ?? 1);
    const mesh = new THREE.Mesh(geo, f.materiau);
    mesh.position.set(...fp);
    mesh.quaternion.copy(fq);
    if (fixe && fusion) {
      mesh.updateMatrix();
      geo.applyMatrix4(mTmp.multiplyMatrices(groupe.matrixWorld, mesh.matrix));
      if (!aFusionner.has(f.materiau)) aFusionner.set(f.materiau, []);
      aFusionner.get(f.materiau).push(geo);
    } else {
      mesh.castShadow = f.ombre ?? true;
      mesh.receiveShadow = true;
      groupe.add(mesh);
    }
  }

  if (!fixe || !fusion) scene.add(groupe);
  if (!fixe) {
    const boite = new THREE.Box3().setFromObject(groupe);
    const t = boite.getSize(new THREE.Vector3());
    objet.tailleMax = Math.max(t.x, t.y, t.z);
    objets.push(objet);
  }
  return objet;
}

// Décor purement visuel (feuillage, filets...) : géométrie placée à "pos" puis fusionnée avec le reste
export function ajouterDecor(geo, materiau, pos, rot = [0, 0, 0], echelle = [1, 1, 1]) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), quat(rot), new THREE.Vector3(...echelle));
  geo.applyMatrix4(m);
  if (!aFusionner.has(materiau)) aFusionner.set(materiau, []);
  aFusionner.get(materiau).push(geo);
}

export function fusionnerDecor() {
  for (const [materiau, geos] of aFusionner) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), materiau);
    mesh.receiveShadow = true;
    mesh.castShadow = !materiau.transparent && materiau.userData?.ombre !== false;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    geos.forEach((g) => g.dispose());
  }
  aFusionner.clear();
}

// Recopie la position des corps physiques sur leurs modèles 3D
export function synchroniserObjets() {
  for (const o of objets) {
    if (o.range) continue;    // rangé dans l'inventaire : c'est l'inventaire qui l'affiche
    const p = o.corps.translation(), r = o.corps.rotation();
    o.groupe.position.set(p.x, p.y, p.z);
    o.groupe.quaternion.set(r.x, r.y, r.z, r.w);
    if (p.y < -10) replacer(o);   // tombé hors du monde
  }
}

export function replacer(o) {
  o.corps.setEnabled(true);
  o.range = null;
  o.corps.setTranslation({ x: o.depart.pos[0], y: o.depart.pos[1], z: o.depart.pos[2] }, true);
  o.corps.setRotation(o.depart.quat, true);
  o.corps.setLinvel({ x: 0, y: 0, z: 0 }, true);
  o.corps.setAngvel({ x: 0, y: 0, z: 0 }, true);
}

// Distance entre un point et la surface d'un collider (0 si le point est dedans)
export function distanceSurface(collider, p) {
  const proj = collider.projectPoint(p, true);
  if (!proj) return Infinity;
  if (proj.isInside) return 0;
  return Math.hypot(proj.point.x - p.x, proj.point.y - p.y, proj.point.z - p.z);
}
