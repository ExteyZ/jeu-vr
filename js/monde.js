// Monde partagé : moteur physique (Rapier), scène 3D et fonctions pour créer des objets.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

await RAPIER.init();
export { RAPIER };

// Groupes de collision : (à quel groupe j'appartiens << 16) | (avec quels groupes je collisionne)
export const G_MONDE = 0x0001, G_JOUEUR = 0x0002, G_MAIN = 0x0004;
const groupes = (membre, filtre) => (membre << 16) | filtre;
export const CG_MONDE = groupes(G_MONDE, 0xffff);
export const CG_JOUEUR = groupes(G_JOUEUR, G_MONDE);          // le corps ne touche pas ses propres mains
export const CG_MAIN = groupes(G_MAIN, G_MONDE | G_MAIN);

export const GRAVITE = 9.81;
export const world = new RAPIER.World({ x: 0, y: -GRAVITE, z: 0 });
export const scene = new THREE.Scene();

// Tous les objets mobiles (pour afficher leur position et pouvoir tout remettre en place)
export const objets = [];
// Infos attachées à chaque collider (handle -> { main } ou { objet })
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
    case 'boule': return [RAPIER.ColliderDesc.ball(f.rayon), new THREE.SphereGeometry(f.rayon, 24, 16)];
    case 'cylindre': return [RAPIER.ColliderDesc.cylinder(f.hauteur / 2, f.rayon), new THREE.CylinderGeometry(f.rayon, f.rayon, f.hauteur, 24)];
    case 'capsule': return [RAPIER.ColliderDesc.capsule(f.hauteur / 2, f.rayon), new THREE.CapsuleGeometry(f.rayon, f.hauteur, 6, 16)];
  }
}

// Crée un objet physique et son affichage.
// masse = 0 -> objet fixe (sol, murs...). Sinon la masse (en kg) est répartie sur toutes les formes.
// formes : [{ type: 'boite'|'boule'|'cylindre'|'capsule', taille|rayon|hauteur, pos?, rot?, materiau }]
export function creerObjet({ pos, rot = [0, 0, 0], formes, masse = 0, friction = 0.8, rebond = 0.05, amortissement = 0, nom = '' }) {
  const q = quat(rot);
  const desc = masse > 0 ? RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true) : RAPIER.RigidBodyDesc.fixed();
  desc.setTranslation(...pos).setRotation(q);
  if (amortissement) desc.setLinearDamping(amortissement * 0.1).setAngularDamping(amortissement);
  const corps = world.createRigidBody(desc);

  const densite = masse > 0 ? masse / formes.reduce((s, f) => s + volume(f), 0) : 1;
  const groupe = new THREE.Group();
  const objet = { corps, groupe, nom, masse, depart: { pos: [...pos], quat: q.clone() } };

  for (const f of formes) {
    const [cd, geo] = forme(f);
    const fp = f.pos ?? [0, 0, 0], fq = quat(f.rot ?? [0, 0, 0]);
    cd.setTranslation(...fp).setRotation(fq).setDensity(densite)
      .setFriction(f.friction ?? friction).setRestitution(f.rebond ?? rebond).setCollisionGroups(CG_MONDE);
    const collider = world.createCollider(cd, corps);
    infos.set(collider.handle, { objet });

    const mesh = new THREE.Mesh(geo, f.materiau);
    mesh.position.set(...fp);
    mesh.quaternion.copy(fq);
    mesh.castShadow = f.ombre ?? true;
    mesh.receiveShadow = true;
    groupe.add(mesh);
  }

  groupe.position.set(...pos);
  groupe.quaternion.copy(q);
  scene.add(groupe);
  if (masse > 0) objets.push(objet);
  return objet;
}

// Recopie la position des corps physiques sur leurs modèles 3D
export function synchroniserObjets() {
  for (const o of objets) {
    const p = o.corps.translation(), r = o.corps.rotation();
    o.groupe.position.set(p.x, p.y, p.z);
    o.groupe.quaternion.set(r.x, r.y, r.z, r.w);
    if (p.y < -10) replacer(o);   // tombé hors du monde
  }
}

export function replacer(o) {
  o.corps.setTranslation({ x: o.depart.pos[0], y: o.depart.pos[1], z: o.depart.pos[2] }, true);
  o.corps.setRotation(o.depart.quat, true);
  o.corps.setLinvel({ x: 0, y: 0, z: 0 }, true);
  o.corps.setAngvel({ x: 0, y: 0, z: 0 }, true);
}
