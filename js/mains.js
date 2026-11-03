// Mains physiques : quand elles sont vides, elles suivent les manettes avec une force limitée (elles se bloquent
// contre les murs et poussent les objets). Quand elles tiennent un objet, c'est l'objet qui est piloté
// directement vers la main (force limitée selon son poids) et la main est dessinée collée à lui : aucun tremblement.
//
// Repère de la main = repère "grip" WebXR (incliné pour suivre l'avant-bras) : origine au centre du poing,
// -Y vers le bout des doigts, -Z vers le pouce, dos de la main droite vers +X (vers -X pour la gauche).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as clonerSquelette } from 'three/addons/utils/SkeletonUtils.js';
import { RAPIER, world, scene, infos, vibrer, CG_MAIN, CG_TENU, CG_MONDE, GRAVITE, distanceSurface } from './monde.js';

const MASSE_MAIN = 0.6;                 // kg
const INERTIE_MAIN = 0.002;
const FORCE_MAX = 350;                  // N par main : au-delà, l'objet est trop lourd pour suivre
const COUPLE_MAX = 25;                  // N·m par main
const VITESSE_MAX = 20;                 // m/s
const ROTATION_MAX = 40;                // rad/s
const DISTANCE_LACHER = 0.45;           // si la main tenue est trop loin de la manette, on lâche
const PORTEE_OBJET = 0.09;              // distance max (jusqu'à la surface) pour attraper un objet
const PORTEE_PNJ = 0.08;
const PORTEE_DECOR = 0.035;             // il faut vraiment toucher le décor pour s'y accrocher
const ZONE_RECHERCHE = new RAPIER.Ball(0.14);
const ZONE_CHEVAUCHEMENT = new RAPIER.Ball(0.045);
const ATTRACTION_PORTEE = 9, ATTRACTION_MASSE_MAX = 8;
// Une poignée (lampe, lance-balles) se tient canon vers l'avant (-Y de la main) et poignée dans le poing
const PRISE_POIGNEE = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion();
const vPoing = new THREE.Vector3(), qPoing = new THREE.Quaternion();
const pTmp = new THREE.Vector3(), qTmp = new THREE.Quaternion();

// Combien de mains tiennent chaque corps (handle -> nombre)
export const corpsTenus = new Map();
// Objets tenus (handle -> { corps, mains }) : pilotés une fois par image, même à deux mains
const prises = new Map();
// Branchements fournis par d'autres modules (inventaire), pour éviter les imports croisés
export const crochets = { sortir: null, ranger: null };

const corpsMobile = (corps) => !corps.isFixed() && !corps.isKinematic();
const poingLocal = (s) => new THREE.Vector3(s * 0.006, -0.045, 0.005);

export class MainPhysique {
  constructor(cote) {
    this.cote = cote;
    this.s = cote === 'right' ? 1 : -1;
    const s = this.s;
    this.corps = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, -20, 0).setGravityScale(0).setCcdEnabled(true).setCanSleep(false));
    const paume = RAPIER.ColliderDesc.cuboid(0.014, 0.048, 0.043).setTranslation(s * 0.035, 0.01, 0.006)
      .setMassProperties(MASSE_MAIN, { x: 0, y: 0, z: 0 }, { x: INERTIE_MAIN, y: INERTIE_MAIN, z: INERTIE_MAIN }, { x: 0, y: 0, z: 0, w: 1 });
    const poing = RAPIER.ColliderDesc.cuboid(0.028, 0.02, 0.042).setTranslation(s * 0.008, -0.05, 0.006).setDensity(0);
    this.colliders = [paume, poing].map((cd) => {
      const c = world.createCollider(cd.setFriction(1.5).setRestitution(0).setCollisionGroups(CG_MAIN)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), this.corps);
      infos.set(c.handle, { main: this });
      return c;
    });

    this.visuel = new ModeleMain(cote, false);
    this.fantome = new ModeleMain(cote, true);
    this.cadre = new THREE.BoxHelper(undefined, 0xffd040);   // objet visé pour l'attraction
    this.cadre.visible = false;
    scene.add(this.visuel.groupe, this.fantome.groupe, this.cadre);

    this.cible = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    this.rayon = { origine: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) };
    this.vitesseMain = new THREE.Vector3();   // vitesse de la manette par rapport au corps
    this.rel = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };   // pose de l'objet dans le repère de la main
    this.serrage = 0; this.gachette = 0; this.pouce = 0;
    this.serre = false; this.appuie = false;
    this.tenu = null;         // corps attrapé
    this.objetTenu = null;    // fiche de l'objet attrapé (null pour le décor)
    this.accroche = null;     // point fixe attrapé (escalade), en coordonnées du monde
    this.courbures = null;    // position des doigts autour de l'objet tenu
    this.doigtsAPlacer = false;
    this.visee = null;        // objet visé pour l'attraction à distance
    this.attire = null;       // objet en train de voler vers la main
    this.dureeVisee = 0;
    this.delaiCollisions = 0;
    this.active = false;
    this.modePC = false;
  }

  // Centre du poing de la main physique, en coordonnées du monde
  poing(out) {
    const p = this.corps.translation(), r = this.corps.rotation();
    return out.copy(poingLocal(this.s)).applyQuaternion(qPoing.set(r.x, r.y, r.z, r.w)).add(vPoing.set(p.x, p.y, p.z));
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
    this.visuel.groupe.visible = this.fantome.groupe.visible = this.cadre.visible = false;
  }

  teleporter() {
    this.corps.setTranslation(this.cible.pos, true);
    this.corps.setRotation(this.cible.quat, true);
    this.corps.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.corps.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  majEntrees({ serrage = 0, gachette = 0, pouce = 0 }) {
    this.serrage = serrage; this.gachette = gachette; this.pouce = pouce;
    if (!this.serre && serrage > 0.55) { this.serre = true; this.attraper(); }
    else if (this.serre && serrage < 0.35) { this.serre = false; this.lacher(); this.visee = null; this.attire = null; }
    if (!this.appuie && gachette > 0.6) { this.appuie = true; this.objetTenu?.utiliser?.(this.objetTenu, this); }
    else if (this.appuie && gachette < 0.3) this.appuie = false;
  }

  attraper() {
    if (this.tenu || !this.active) return;
    const sorti = crochets.sortir?.(this);
    if (sorti) { this.saisir(sorti.corps, sorti); return; }

    const p = this.poing(new THREE.Vector3());
    const choix = { objet: null, pnj: null, decor: null };
    const dist = { objet: PORTEE_OBJET, pnj: PORTEE_PNJ, decor: PORTEE_DECOR };
    world.intersectionsWithShape(p, { x: 0, y: 0, z: 0, w: 1 }, ZONE_RECHERCHE, (col) => {
      const info = infos.get(col.handle);
      if (!info || info.main || info.objet?.range) return true;
      const type = info.objet ? 'objet' : info.pnj ? 'pnj' : 'decor';
      const d = distanceSurface(col, p);
      if (d < dist[type]) { dist[type] = d; choix[type] = { info, col }; }
      return true;
    });

    // Priorité : un objet mobile, puis un personnage, puis le décor (escalade)
    if (choix.objet) this.saisir(choix.objet.info.objet.corps, choix.objet.info.objet);
    else if (choix.pnj) {
      const pnj = choix.pnj.info.pnj;
      pnj.passerEnRagdoll(null, 'attrape');
      const partie = pnj.partieProche(p);
      if (partie) this.saisir(partie.corps, partie);
    } else if (choix.decor) this.saisir(choix.decor.col.parent(), null);
  }

  // On retient où se trouve l'objet par rapport à la main au moment de la prise
  saisir(corps, objet) {
    const p = this.corps.translation(), r = this.corps.rotation();
    const qMain = new THREE.Quaternion(r.x, r.y, r.z, r.w), pMain = new THREE.Vector3(p.x, p.y, p.z);
    if (objet?.poignee) {
      // Objet à poignée : il se place tout seul dans la main, canon vers l'avant, poignée au centre du poing
      const qObjet = qMain.clone().multiply(PRISE_POIGNEE.clone().invert());
      const pObjet = pMain.clone().add(poingLocal(this.s).applyQuaternion(qMain))
        .sub(objet.poignee.clone().applyQuaternion(qObjet));
      corps.setTranslation(pObjet, true);
      corps.setRotation(qObjet, true);
      corps.setLinvel(this.corps.linvel(), true);
      corps.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    const op = corps.translation(), oq = corps.rotation();
    const invMain = qMain.clone().invert();
    this.rel.quat.copy(invMain).multiply(qA.set(oq.x, oq.y, oq.z, oq.w));
    this.rel.pos.set(op.x - p.x, op.y - p.y, op.z - p.z).applyQuaternion(invMain);
    this.tenu = corps;
    this.objetTenu = objet;
    this.visee = null; this.attire = null; this.cadre.visible = false;

    if (corpsMobile(corps)) {
      corpsTenus.set(corps.handle, (corpsTenus.get(corps.handle) ?? 0) + 1);
      if (!prises.has(corps.handle)) prises.set(corps.handle, { corps, mains: new Set() });
      prises.get(corps.handle).mains.add(this);
      if (objet && !objet.ragdoll) for (const c of objet.colliders) c.setCollisionGroups(CG_TENU);
    } else {
      this.accroche = this.cible.pos.clone();
    }
    // La main devient un "fantôme physique" collé à l'objet : c'est l'objet qui touche le monde
    this.corps.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    for (const c of this.colliders) c.setEnabled(false);
    this.courbures = null;
    this.doigtsAPlacer = true;
    vibrer(this.cote, 0.6, 40);
    objet?.surPrise?.(objet, this);
  }

  // Pose de la main collée à l'objet tenu : main = objet × rel⁻¹
  poseAttachee(pos, quat) {
    const op = this.tenu.translation(), oq = this.tenu.rotation();
    quat.set(oq.x, oq.y, oq.z, oq.w).multiply(qB.copy(this.rel.quat).invert());
    pos.copy(this.rel.pos).applyQuaternion(quat).negate().add(v2.set(op.x, op.y, op.z));
  }

  lacher() {
    if (!this.tenu) return;
    const corps = this.tenu, objet = this.objetTenu;
    this.poseAttachee(pTmp, qTmp);
    if (corpsMobile(corps)) {
      const n = (corpsTenus.get(corps.handle) ?? 1) - 1;
      if (n > 0) corpsTenus.set(corps.handle, n); else corpsTenus.delete(corps.handle);
      prises.get(corps.handle)?.mains.delete(this);
      if (n <= 0) prises.delete(corps.handle);
    }
    this.tenu = null; this.objetTenu = null; this.accroche = null; this.courbures = null;

    this.corps.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    this.corps.setTranslation(pTmp, true);
    this.corps.setRotation(qTmp, true);
    this.corps.setLinvel(corpsMobile(corps) ? corps.linvel() : { x: 0, y: 0, z: 0 }, true);
    this.corps.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.delaiCollisions = 0.2;   // la main ne cogne pas l'objet qu'elle vient de lancer

    if (objet && !objet.ragdoll && corpsMobile(corps) && !corpsTenus.has(corps.handle)) {
      for (const c of objet.colliders) c.setCollisionGroups(CG_MONDE);
      crochets.ranger?.(this, objet);
    }
  }

  // Les doigts se referment un par un jusqu'à toucher l'objet
  calculerCourbures(corps) {
    const colliders = [];
    for (let i = 0; i < corps.numColliders(); i++) colliders.push(corps.collider(i));
    return this.visuel.courbesAutour(colliders);
  }

  // Main vide : poussée vers la manette avec une force limitée. Main pleine : elle suit l'objet.
  piloter(dt) {
    if (!this.active) return;
    if (this.delaiCollisions > 0) {
      this.delaiCollisions -= dt;
      if (this.delaiCollisions <= 0 && !this.tenu) {
        // La main ne redevient solide qu'une fois sortie de l'objet (sinon elle le projetterait)
        if (this.chevauche()) this.delaiCollisions = 0.05;
        else for (const c of this.colliders) c.setEnabled(true);
      }
    }
    if (this.tenu) {
      this.poseAttachee(pTmp, qTmp);
      if (pTmp.distanceTo(this.cible.pos) > DISTANCE_LACHER) { this.lacher(); this.teleporter(); return; }
      this.corps.setNextKinematicTranslation(pTmp);
      this.corps.setNextKinematicRotation(qTmp);
      return;
    }

    const p = this.corps.translation();
    const ecart = v1.set(this.cible.pos.x - p.x, this.cible.pos.y - p.y, this.cible.pos.z - p.z);
    if (ecart.length() > DISTANCE_LACHER) { this.teleporter(); return; }
    const vVoulue = ecart.divideScalar(dt).clampLength(0, VITESSE_MAX);
    const v = this.corps.linvel();
    const impulsion = v2.set(vVoulue.x - v.x, vVoulue.y - v.y, vVoulue.z - v.z).multiplyScalar(MASSE_MAIN).clampLength(0, FORCE_MAX * dt);
    this.corps.applyImpulse(impulsion, true);

    const r = this.corps.rotation();
    const wVoulue = vitesseAngulaire(this.cible.quat, qA.set(r.x, r.y, r.z, r.w), dt, v1);
    const w = this.corps.angvel();
    const couple = v2.set(wVoulue.x - w.x, wVoulue.y - w.y, wVoulue.z - w.z).multiplyScalar(INERTIE_MAIN).clampLength(0, COUPLE_MAX * dt);
    this.corps.applyTorqueImpulse(couple, true);
  }

  chevauche() {
    let touche = false;
    world.intersectionsWithShape(this.poing(new THREE.Vector3()), { x: 0, y: 0, z: 0, w: 1 }, ZONE_CHEVAUCHEMENT, (col) => {
      if (infos.get(col.handle)?.main) return true;
      touche = true;
      return false;
    }, undefined, CG_MAIN, undefined, this.corps);
    return touche;
  }

  // Attraction à distance : on vise un objet main serrée, puis un coup de poignet vers soi le fait voler jusqu'à la main
  majAttraction(dt) {
    const poing = this.poing(new THREE.Vector3());
    if (this.attire) {
      this.attire.temps -= dt;
      const o = this.attire.objet;
      const d = Math.min(...o.colliders.map((c) => distanceSurface(c, poing)));
      if (d < 0.12) this.saisir(o.corps, o);
      else if (this.attire.temps < 0) this.attire = null;
      return;
    }
    if (!this.serre || this.tenu) { this.visee = null; this.cadre.visible = false; return; }

    const hit = world.castRay(new RAPIER.Ray(this.rayon.origine, this.rayon.dir), ATTRACTION_PORTEE, true,
      undefined, undefined, undefined, this.corps, (col) => !infos.get(col.handle)?.main);
    const o = hit ? infos.get(hit.collider.handle)?.objet : null;
    if (o && !o.ragdoll && !o.range && o.masse <= ATTRACTION_MASSE_MAX && !corpsTenus.has(o.corps.handle)) {
      if (this.visee !== o) { this.visee = o; this.dureeVisee = 0; vibrer(this.cote, 0.15, 15); }
      this.dureeVisee += dt;
      this.cadre.setFromObject(o.groupe);
      this.cadre.visible = true;
      // Il faut viser un instant puis donner un vrai coup de poignet (évite les déclenchements par accident)
      const versSoi = -this.vitesseMain.dot(this.rayon.dir);
      const coupDePoignet = (this.dureeVisee > 0.25 && (versSoi > 1.6 || this.vitesseMain.y > 1.8)) || (this.modePC && this.dureeVisee > 0.3);
      if (coupDePoignet) this.lancerVersMain(o, poing);
    } else {
      this.visee = null;
      this.cadre.visible = false;
    }
  }

  lancerVersMain(o, poing) {
    const p = o.corps.translation();
    const dist = poing.distanceTo(p);
    const T = THREE.MathUtils.clamp(dist / 9, 0.3, 0.7);
    o.corps.setLinvel({ x: (poing.x - p.x) / T, y: (poing.y - p.y) / T + 0.5 * GRAVITE * T, z: (poing.z - p.z) / T }, true);
    o.corps.setAngvel({ x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 }, true);
    this.attire = { objet: o, temps: T + 0.8 };
    this.visee = null;
    this.cadre.visible = false;
    vibrer(this.cote, 0.4, 30);
  }

  majVisuel() {
    if (!this.active) return;
    const g = this.visuel.groupe;
    g.visible = true;
    if (this.tenu) this.poseAttachee(g.position, g.quaternion);
    else {
      const p = this.corps.translation(), r = this.corps.rotation();
      vPoing.set(p.x, p.y, p.z);
      // Main appuyée contre une surface : on lisse l'affichage pour gommer les micro-tremblements du contact
      if (vPoing.distanceTo(this.cible.pos) > 0.01 && g.position.distanceTo(vPoing) < 0.05) g.position.lerp(vPoing, 0.35);
      else g.position.copy(vPoing);
      g.quaternion.set(r.x, r.y, r.z, r.w);
    }
    if (this.doigtsAPlacer && this.tenu && this.visuel.pret) {
      g.updateMatrixWorld(true);
      this.courbures = this.calculerCourbures(this.tenu);
      this.doigtsAPlacer = false;
    }
    this.fantome.groupe.position.copy(this.cible.pos);
    this.fantome.groupe.quaternion.copy(this.cible.quat);
    this.fantome.groupe.visible = this.fantome.groupe.position.distanceTo(g.position) > 0.04;

    let pose;
    if (this.courbures) pose = this.courbures;
    else {
      const s = this.serrage;
      pose = [Math.max(s * 0.6, this.pouce * 0.45), Math.max(s * 0.85, this.gachette), s, s, s];
    }
    this.visuel.poser(pose);
    if (this.fantome.groupe.visible) this.fantome.poser(pose);
  }
}

// Vitesse angulaire pour passer de l'orientation q à la cible en un pas de temps
function vitesseAngulaire(cible, q, dt, out) {
  const qErr = qB.copy(cible).multiply(q.invert());
  if (qErr.w < 0) qErr.set(-qErr.x, -qErr.y, -qErr.z, -qErr.w);
  const angle = 2 * Math.acos(Math.min(1, qErr.w));
  const s = Math.sqrt(Math.max(0, 1 - qErr.w * qErr.w));
  if (s < 1e-5) return out.set(0, 0, 0);
  return out.set(qErr.x / s, qErr.y / s, qErr.z / s).multiplyScalar(angle / dt).clampLength(0, ROTATION_MAX);
}

// Pilote chaque objet tenu vers la position voulue par la (ou les) main(s), avec une force limitée :
// un objet trop lourd n'arrive pas à suivre, deux mains portent deux fois plus.
const cibleP = new THREE.Vector3(), cibleQ = new THREE.Quaternion(), pi = new THREE.Vector3(), qi = new THREE.Quaternion();
export function piloterObjetsTenus(dt) {
  for (const { corps, mains } of prises.values()) {
    const actives = [...mains].filter((m) => m.active);
    if (!actives.length) continue;
    actives.forEach((m, k) => {
      pi.copy(m.rel.pos).applyQuaternion(m.cible.quat).add(m.cible.pos);
      qi.copy(m.cible.quat).multiply(m.rel.quat);
      if (k === 0) { cibleP.copy(pi); cibleQ.copy(qi); }
      else { cibleP.lerp(pi, 1 / (k + 1)); cibleQ.slerp(qi, 1 / (k + 1)); }
    });
    const n = actives.length;
    const masse = Math.max(0.05, corps.mass());

    // Translation (sur le centre de masse), en compensant la gravité dans la limite de la force
    const com = corps.worldCom(), lc = corps.localCom();
    const comCible = v1.set(lc.x, lc.y, lc.z).applyQuaternion(cibleQ).add(cibleP);
    const vVoulue = comCible.sub(v2.set(com.x, com.y, com.z)).divideScalar(dt).clampLength(0, VITESSE_MAX);
    const v = corps.linvel();
    const dv = vVoulue.sub(v2.set(v.x, v.y, v.z)).add(v2.set(0, GRAVITE * dt, 0)).clampLength(0, FORCE_MAX * n * dt / masse);
    corps.setLinvel({ x: v.x + dv.x, y: v.y + dv.y, z: v.z + dv.z }, true);

    // Rotation
    const r = corps.rotation();
    const wVoulue = vitesseAngulaire(cibleQ, qA.set(r.x, r.y, r.z, r.w), dt, v1);
    const w = corps.angvel();
    const i = corps.principalInertia();
    const inertie = Math.max(0.002, i.x, i.y, i.z);
    const dw = wVoulue.sub(v2.set(w.x, w.y, w.z)).clampLength(0, COUPLE_MAX * n * dt / inertie);
    corps.setAngvel({ x: w.x + dw.x, y: w.y + dw.y, z: w.z + dw.z }, true);
  }
}

// --- Modèle 3D réaliste de la main (modèle WebXR "generic-hand"), doigts pliés par le code ---
const URL_MAINS = 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0.19/dist/profiles/generic-hand/';
const chargements = {};
const matPeau = new THREE.MeshStandardMaterial({ color: 0xd6a184, roughness: 0.55, metalness: 0 });
const matManche = new THREE.MeshStandardMaterial({ color: 0x252b33, roughness: 0.85 });
const matFantome = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false });
const DOIGTS = [
  ['thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  ['index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip'],
  ['middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip'],
  ['ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip'],
  ['pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'],
];
const PLI = [1.45, 1.65, 1.05];           // angle max de chaque articulation d'un doigt (rad)
const PLI_POUCE = [0.65, 0.8];

class ModeleMain {
  constructor(cote, fantome) {
    this.s = cote === 'right' ? 1 : -1;
    this.groupe = new THREE.Group();
    this.groupe.visible = false;
    this.pret = false;
    this.derniere = null;
    chargements[cote] ??= new GLTFLoader().loadAsync(URL_MAINS + cote + '.glb');
    chargements[cote].then((gltf) => this.installer(gltf, fantome)).catch((e) => console.error('main', e));
  }

  installer(gltf, fantome) {
    const modele = clonerSquelette(gltf.scene);
    modele.traverse((o) => {
      if (!o.isMesh) return;
      o.material = fantome ? matFantome : matPeau;
      o.castShadow = !fantome;
      o.frustumCulled = false;
    });
    this.groupe.add(modele);
    if (!fantome) {
      const manche = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.04, 0.16, 16), matManche);
      manche.position.set(this.s * 0.04, 0.135, 0.008);
      manche.castShadow = true;
      this.groupe.add(manche);
    }
    modele.updateMatrixWorld(true);
    const inverseRacine = new THREE.Matrix4().copy(modele.matrixWorld).invert();
    // Pose de repos de chaque os, dans le repère de la main
    this.os = {};
    modele.traverse((o) => {
      if (!o.isBone) return;
      const m = new THREE.Matrix4().multiplyMatrices(inverseRacine, o.matrixWorld);
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Vector3();
      m.decompose(p, q, e);
      this.os[o.name] = { objet: o, p, q, pose: new THREE.Matrix4().copy(m) };
    });
    this.ordre = [];
    modele.traverse((o) => { if (o.isBone) this.ordre.push(o.name); });
    this.racine = modele;
    // Axe de pliage de chaque doigt : perpendiculaire au doigt et à la paume
    const paume = new THREE.Vector3(-this.s, 0, 0);
    this.axes = DOIGTS.map((chaine, d) => {
      const dir = this.os[chaine.at(-1)].p.clone().sub(this.os[chaine[0]].p).normalize();
      const vers = d === 0 ? paume.clone().add(new THREE.Vector3(0, 0, 0.5)).normalize() : paume;
      return dir.cross(vers).normalize();
    });
    this.pret = true;
  }

  // Calcule la pose (dans le repère de la main) de chaque articulation pour un pliage donné
  poserDoigt(d, t, sortie) {
    const chaine = DOIGTS[d];
    const angles = d === 0 ? PLI_POUCE : PLI;
    const P = chaine.map((n) => this.os[n].p.clone());
    const Q = chaine.map((n) => this.os[n].q.clone());
    const axe = this.axes[d].clone();
    for (let j = 0; j < angles.length && j < chaine.length - 1; j++) {
      const rot = new THREE.Quaternion().setFromAxisAngle(axe, t * angles[j]);
      for (let k = j + 1; k < chaine.length; k++) P[k].sub(P[j]).applyQuaternion(rot).add(P[j]);
      for (let k = j; k < chaine.length; k++) Q[k].premultiply(rot);
      axe.applyQuaternion(rot);
    }
    chaine.forEach((n, k) => sortie.set(n, { p: P[k], q: Q[k] }));
  }

  poser(courbures) {
    if (!this.pret) return;
    const cle = courbures.map((c) => c.toFixed(2)).join();
    if (cle === this.derniere) return;
    this.derniere = cle;
    const poses = new Map();
    courbures.forEach((t, d) => this.poserDoigt(d, t, poses));
    // Applique les poses aux os (en tenant compte de la hiérarchie du squelette)
    const monde = new Map();
    for (const nom of this.ordre) {
      const os = this.os[nom];
      const voulu = poses.get(nom);
      const m = voulu ? new THREE.Matrix4().compose(voulu.p, voulu.q, new THREE.Vector3(1, 1, 1)) : os.pose;
      monde.set(nom, m);
      const parent = os.objet.parent;
      const mParent = parent?.isBone ? monde.get(parent.name) : null;
      const local = mParent ? new THREE.Matrix4().copy(mParent).invert().multiply(m) : new THREE.Matrix4().copy(this.inverseParent(parent)).multiply(m);
      local.decompose(os.objet.position, os.objet.quaternion, os.objet.scale);
    }
  }

  inverseParent(parent) {
    // Parent non-os (armature) : sa pose dans le repère de la main
    if (!this._invParents) this._invParents = new Map();
    if (!this._invParents.has(parent)) {
      const m = new THREE.Matrix4().copy(this.racine.matrixWorld).invert().multiply(parent.matrixWorld);
      this._invParents.set(parent, m.invert());
    }
    return this._invParents.get(parent);
  }

  // Plie chaque doigt jusqu'à ce que son bout touche l'objet (les doigts serrent toujours un minimum)
  courbesAutour(colliders) {
    const res = [];
    const poses = new Map();
    const pt = new THREE.Vector3();
    this.groupe.updateMatrixWorld(true);
    for (let d = 0; d < 5; d++) {
      const minimum = d === 0 ? 0.3 : 0.4;
      let c = 1;
      for (let k = 1; k <= 16; k++) {
        const t = minimum + (1 - minimum) * (k / 16);
        this.poserDoigt(d, t, poses);
        const touche = DOIGTS[d].slice(-2).some((n) => {
          pt.copy(poses.get(n).p).applyMatrix4(this.groupe.matrixWorld);
          return colliders.some((col) => distanceSurface(col, pt) < 0.007);
        });
        if (touche) { c = t; break; }
      }
      res.push(c);
    }
    return res;
  }
}
