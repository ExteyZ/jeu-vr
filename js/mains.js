// Mains physiques : elles suivent les manettes avec une force limitée,
// se bloquent contre les murs, poussent les objets et sentent le poids de ce qu'elles portent.
import * as THREE from 'three';
import { RAPIER, world, scene, infos, vibrer, CG_MAIN } from './monde.js';

const DEMI = { x: 0.022, y: 0.045, z: 0.05 };    // demi-dimensions de la paume (m)
const MASSE_MAIN = 0.6;                           // kg
const INERTIE_MAIN = 0.002;
const FORCE_MAX = 350;                            // N : au-delà, la main "plie" sous le poids
const COUPLE_MAX = 25;                            // N·m : force du poignet
const VITESSE_MAX = 20;                           // m/s
const ROTATION_MAX = 40;                          // rad/s
const DISTANCE_LACHER = 0.45;                     // si la main est trop loin de la manette, on lâche
const ZONE_PRISE = new RAPIER.Ball(0.08);

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion();

// Combien de mains tiennent chaque corps (handle -> nombre)
export const corpsTenus = new Map();

export class MainPhysique {
  constructor(cote) {
    this.cote = cote;
    this.corps = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, -20, 0).setGravityScale(0).setCcdEnabled(true).setCanSleep(false));
    this.collider = world.createCollider(RAPIER.ColliderDesc.cuboid(DEMI.x, DEMI.y, DEMI.z)
      .setMassProperties(MASSE_MAIN, { x: 0, y: 0, z: 0 }, { x: INERTIE_MAIN, y: INERTIE_MAIN, z: INERTIE_MAIN }, { x: 0, y: 0, z: 0, w: 1 })
      .setFriction(1.5).setRestitution(0)
      .setCollisionGroups(CG_MAIN).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), this.corps);
    infos.set(this.collider.handle, { main: this });

    this.visuel = creerVisuelMain(cote, false);
    this.fantome = creerVisuelMain(cote, true);
    scene.add(this.visuel, this.fantome);

    this.cible = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    this.serrage = 0;
    this.serre = false;
    this.joint = null;
    this.tenu = null;       // corps attrapé
    this.accroche = null;   // point fixe attrapé (escalade), en coordonnées du monde
    this.active = false;
  }

  activer() {
    if (this.active) return;
    this.active = true;
    this.teleporter();
  }

  desactiver() {
    if (!this.active) return;
    this.active = false;
    this.lacher();
    this.corps.setTranslation({ x: 0, y: -20, z: 0 }, true);
    this.visuel.visible = this.fantome.visible = false;
  }

  teleporter() {
    this.corps.setTranslation(this.cible.pos, true);
    this.corps.setRotation(this.cible.quat, true);
    this.corps.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.corps.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  majSerrage(valeur) {
    this.serrage = valeur;
    if (!this.serre && valeur > 0.55) { this.serre = true; this.attraper(); }
    else if (this.serre && valeur < 0.35) { this.serre = false; this.lacher(); }
  }

  attraper() {
    if (this.joint) return;
    const p = this.corps.translation(), r = this.corps.rotation();
    let meilleur = null, meilleurScore = Infinity;
    world.intersectionsWithShape(p, r, ZONE_PRISE, (col) => {
      if (infos.get(col.handle)?.main) return true;
      const corps = col.parent();
      if (!corps) return true;
      const c = corps.translation();
      // On préfère attraper un objet mobile plutôt que le décor
      const score = Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z) + (corps.isFixed() ? 100 : 0);
      if (score < meilleurScore) { meilleurScore = score; meilleur = corps; }
      return true;
    });
    if (!meilleur) return;

    // Joint fixe : l'objet reste collé à la main exactement dans la position où on l'a pris
    const op = meilleur.translation(), oq = meilleur.rotation();
    const inv = qA.set(oq.x, oq.y, oq.z, oq.w).invert();
    const local = v1.set(p.x - op.x, p.y - op.y, p.z - op.z).applyQuaternion(inv);
    const rel = qB.copy(inv).multiply(new THREE.Quaternion(r.x, r.y, r.z, r.w));
    const data = RAPIER.JointData.fixed({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 },
      { x: local.x, y: local.y, z: local.z }, { x: rel.x, y: rel.y, z: rel.z, w: rel.w });
    this.joint = world.createImpulseJoint(data, this.corps, meilleur, true);
    this.joint.setContactsEnabled(false);
    this.tenu = meilleur;

    if (meilleur.isFixed()) this.accroche = this.cible.pos.clone();
    else corpsTenus.set(meilleur.handle, (corpsTenus.get(meilleur.handle) ?? 0) + 1);
    vibrer(this.cote, 0.6, 40);
  }

  lacher() {
    if (!this.joint) return;
    world.removeImpulseJoint(this.joint, true);
    if (!this.tenu.isFixed()) {
      const n = (corpsTenus.get(this.tenu.handle) ?? 1) - 1;
      if (n > 0) corpsTenus.set(this.tenu.handle, n); else corpsTenus.delete(this.tenu.handle);
    }
    this.joint = null;
    this.tenu = null;
    this.accroche = null;
  }

  // Pousse la main vers la manette. La force dépend de ce qu'on porte et elle est plafonnée :
  // un objet trop lourd fait plier la main, deux mains portent deux fois plus.
  piloter(dt) {
    if (!this.active) return;
    const p = this.corps.translation();
    const ecart = v1.set(this.cible.pos.x - p.x, this.cible.pos.y - p.y, this.cible.pos.z - p.z);
    if (ecart.length() > DISTANCE_LACHER) { this.lacher(); this.teleporter(); return; }

    // Masse "ressentie" : la main + sa part de l'objet porté
    let masse = MASSE_MAIN, inertie = INERTIE_MAIN;
    if (this.tenu && !this.tenu.isFixed()) {
      const part = 1 / (corpsTenus.get(this.tenu.handle) ?? 1);
      const m = this.tenu.mass();
      const c = this.tenu.worldCom();
      const i = this.tenu.principalInertia();
      const bras2 = (c.x - p.x) ** 2 + (c.y - p.y) ** 2 + (c.z - p.z) ** 2;
      masse += m * part;
      inertie += (m * bras2 + Math.max(i.x, i.y, i.z)) * part;
    }

    // Translation
    const vVoulue = ecart.divideScalar(dt).clampLength(0, VITESSE_MAX);
    const v = this.corps.linvel();
    const impulsion = v2.set(vVoulue.x - v.x, vVoulue.y - v.y, vVoulue.z - v.z).multiplyScalar(masse).clampLength(0, FORCE_MAX * dt);
    this.corps.applyImpulse(impulsion, true);

    // Rotation
    const r = this.corps.rotation();
    const qErr = qA.copy(this.cible.quat).multiply(qB.set(r.x, r.y, r.z, r.w).invert());
    if (qErr.w < 0) qErr.set(-qErr.x, -qErr.y, -qErr.z, -qErr.w);
    const angle = 2 * Math.acos(Math.min(1, qErr.w));
    const s = Math.sqrt(Math.max(0, 1 - qErr.w * qErr.w));
    const wVoulue = s > 1e-5 ? v1.set(qErr.x / s, qErr.y / s, qErr.z / s).multiplyScalar(angle / dt) : v1.set(0, 0, 0);
    wVoulue.clampLength(0, ROTATION_MAX);
    const w = this.corps.angvel();
    const couple = v2.set(wVoulue.x - w.x, wVoulue.y - w.y, wVoulue.z - w.z).multiplyScalar(inertie).clampLength(0, COUPLE_MAX * dt);
    this.corps.applyTorqueImpulse(couple, true);
  }

  majVisuel() {
    if (!this.active) return;
    const p = this.corps.translation(), r = this.corps.rotation();
    this.visuel.visible = true;
    this.visuel.position.set(p.x, p.y, p.z);
    this.visuel.quaternion.set(r.x, r.y, r.z, r.w);
    this.fantome.position.copy(this.cible.pos);
    this.fantome.quaternion.copy(this.cible.quat);
    this.fantome.visible = this.fantome.position.distanceTo(this.visuel.position) > 0.04;
    const plie = (this.joint ? 1 : this.serrage) * 1.3 * (this.cote === 'left' ? -1 : 1);
    this.visuel.userData.doigts.rotation.y = plie;
    this.fantome.userData.doigts.rotation.y = plie;
  }
}

// Main simplifiée : une paume (même taille que la zone physique) et des doigts qui se plient
function creerVisuelMain(cote, fantome) {
  const mat = fantome
    ? new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false })
    : new THREE.MeshStandardMaterial({ color: 0x3b4a5e, roughness: 0.65 });
  const g = new THREE.Group();
  const paume = new THREE.Mesh(new THREE.BoxGeometry(DEMI.x * 2, DEMI.y * 2, DEMI.z * 2), mat);
  paume.castShadow = !fantome;
  g.add(paume);

  const doigts = new THREE.Group();
  doigts.position.set(0, 0, -DEMI.z);
  const bloc = new THREE.Mesh(new THREE.BoxGeometry(DEMI.x * 1.6, DEMI.y * 1.8, 0.065), mat);
  bloc.position.set(0, 0, -0.032);
  bloc.castShadow = !fantome;
  doigts.add(bloc);
  g.add(doigts);

  const pouce = new THREE.Mesh(new THREE.BoxGeometry(DEMI.x * 1.4, 0.022, 0.05), mat);
  pouce.position.set(cote === 'left' ? 0.012 : -0.012, DEMI.y + 0.008, -0.02);
  g.add(pouce);

  g.userData.doigts = doigts;
  g.visible = false;
  return g;
}
