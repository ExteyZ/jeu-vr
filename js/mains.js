// Mains physiques : elles suivent les manettes avec une force limitée, se bloquent contre les murs,
// poussent les objets, sentent leur poids, referment les doigts autour de ce qu'elles tiennent
// et peuvent attirer un objet de loin d'un coup de poignet.
//
// Repère de la main = repère "grip" WebXR : origine au centre du poing, -Z vers le pouce,
// +Y vers le poignet, dos de la main droite vers +X (vers -X pour la main gauche).
import * as THREE from 'three';
import { RAPIER, world, scene, infos, vibrer, CG_MAIN, CG_TENU, CG_MONDE, GRAVITE, distanceSurface } from './monde.js';

const MASSE_MAIN = 0.6;                 // kg
const INERTIE_MAIN = 0.002;
const FORCE_MAX = 350;                  // N : au-delà, la main "plie" sous le poids
const COUPLE_MAX = 25;                  // N·m : force du poignet
const VITESSE_MAX = 20;                 // m/s
const ROTATION_MAX = 40;                // rad/s
const DISTANCE_LACHER = 0.45;           // si la main est trop loin de la manette, on lâche
const PORTEE_OBJET = 0.09;              // distance max (jusqu'à la surface) pour attraper un objet
const PORTEE_PNJ = 0.07;
const PORTEE_DECOR = 0.035;             // il faut vraiment toucher le décor pour s'y accrocher
const ZONE_RECHERCHE = new RAPIER.Ball(0.14);
const ATTRACTION_PORTEE = 9, ATTRACTION_MASSE_MAX = 8;

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion();
const vPoing = new THREE.Vector3(), qPoing = new THREE.Quaternion();

// Combien de mains tiennent chaque corps (handle -> nombre)
export const corpsTenus = new Map();
// Branchements fournis par d'autres modules (inventaire), pour éviter les imports croisés
export const crochets = { sortir: null, ranger: null };

export class MainPhysique {
  constructor(cote) {
    this.cote = cote;
    this.s = cote === 'right' ? 1 : -1;
    const s = this.s;
    this.corps = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, -20, 0).setGravityScale(0).setCcdEnabled(true).setCanSleep(false));
    const paume = RAPIER.ColliderDesc.cuboid(0.014, 0.05, 0.043).setTranslation(s * 0.034, 0.03, 0)
      .setMassProperties(MASSE_MAIN, { x: 0, y: 0, z: 0 }, { x: INERTIE_MAIN, y: INERTIE_MAIN, z: INERTIE_MAIN }, { x: 0, y: 0, z: 0, w: 1 });
    const poing = RAPIER.ColliderDesc.cuboid(0.024, 0.017, 0.042).setTranslation(s * 0.004, -0.026, 0).setDensity(0);
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
    this.serrage = 0; this.gachette = 0; this.pouce = 0;
    this.serre = false; this.appuie = false;
    this.joint = null;
    this.tenu = null;         // corps attrapé
    this.objetTenu = null;    // fiche de l'objet attrapé (null pour le décor)
    this.accroche = null;     // point fixe attrapé (escalade), en coordonnées du monde
    this.courbures = null;    // position des doigts autour de l'objet tenu
    this.visee = null;        // objet visé pour l'attraction à distance
    this.attire = null;       // objet en train de voler vers la main
    this.dureeVisee = 0;
    this.active = false;
    this.modePC = false;
  }

  // Centre du poing de la main physique, en coordonnées du monde
  poing(out) {
    const p = this.corps.translation(), r = this.corps.rotation();
    return out.set(-this.s * 0.012, -0.01, 0).applyQuaternion(qPoing.set(r.x, r.y, r.z, r.w)).add(vPoing.set(p.x, p.y, p.z));
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
    if (this.joint || !this.active) return;
    const sorti = crochets.sortir?.(this);
    if (sorti) { this.fixerA(sorti.corps, sorti); return; }

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
    if (choix.objet) this.fixerA(choix.objet.info.objet.corps, choix.objet.info.objet);
    else if (choix.pnj) {
      const pnj = choix.pnj.info.pnj;
      pnj.passerEnRagdoll(null, 'attrape');
      const partie = pnj.partieProche(p);
      if (partie) this.fixerA(partie.corps, partie);
    } else if (choix.decor) this.fixerA(choix.decor.col.parent(), null);
  }

  // Joint fixe : l'objet reste collé à la main exactement dans la position où on l'a pris
  fixerA(corps, objet) {
    const p = this.corps.translation(), r = this.corps.rotation();
    if (objet?.prise) {
      // Objet avec une poignée (lampe, lance-balles) : il se place tout seul dans la main, pointé vers l'avant
      const qObjet = new THREE.Quaternion(r.x, r.y, r.z, r.w).multiply(objet.prise.quat.clone().invert());
      const pObjet = new THREE.Vector3(p.x, p.y, p.z).sub(objet.prise.pos.clone().applyQuaternion(qObjet));
      corps.setTranslation(pObjet, true);
      corps.setRotation(qObjet, true);
      corps.setLinvel(this.corps.linvel(), true);
      corps.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    const op = corps.translation(), oq = corps.rotation();
    const inv = qA.set(oq.x, oq.y, oq.z, oq.w).invert();
    const local = v1.set(p.x - op.x, p.y - op.y, p.z - op.z).applyQuaternion(inv);
    const rel = qB.copy(inv).multiply(new THREE.Quaternion(r.x, r.y, r.z, r.w));
    const data = RAPIER.JointData.fixed({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 },
      { x: local.x, y: local.y, z: local.z }, { x: rel.x, y: rel.y, z: rel.z, w: rel.w });
    this.joint = world.createImpulseJoint(data, this.corps, corps, true);
    this.joint.setContactsEnabled(false);
    this.tenu = corps;
    this.objetTenu = objet;
    this.visee = null; this.attire = null; this.cadre.visible = false;

    if (corps.isFixed() || corps.isKinematic()) {
      this.accroche = this.cible.pos.clone();
    } else {
      corpsTenus.set(corps.handle, (corpsTenus.get(corps.handle) ?? 0) + 1);
      if (objet && !objet.ragdoll) for (const c of objet.colliders) c.setCollisionGroups(CG_TENU);
    }
    // Les doigts se placeront après le prochain pas de physique (formes de l'objet à jour)
    this.courbures = null;
    this.doigtsAPlacer = true;
    vibrer(this.cote, 0.6, 40);
    objet?.surPrise?.(objet, this);
  }

  lacher() {
    if (!this.joint) return;
    world.removeImpulseJoint(this.joint, true);
    const corps = this.tenu, objet = this.objetTenu;
    this.joint = null; this.tenu = null; this.objetTenu = null; this.accroche = null; this.courbures = null;
    if (corps.isFixed() || corps.isKinematic()) return;
    const n = (corpsTenus.get(corps.handle) ?? 1) - 1;
    if (n > 0) corpsTenus.set(corps.handle, n); else corpsTenus.delete(corps.handle);
    if (objet && !objet.ragdoll && n <= 0) {
      for (const c of objet.colliders) c.setCollisionGroups(CG_MONDE);
      crochets.ranger?.(this, objet);
    }
  }

  // Les doigts se referment un par un jusqu'à toucher l'objet
  calculerCourbures(corps) {
    const colliders = [];
    for (let i = 0; i < corps.numColliders(); i++) colliders.push(corps.collider(i));
    const m = this.visuel;
    m.placer(this.corps);
    const res = [];
    for (let d = 0; d < 5; d++) {
      let c = 1;
      for (let k = 1; k <= 12; k++) {
        const t = k / 12;
        m.plierDoigt(d, t);
        m.groupe.updateMatrixWorld(true);
        if (m.touche(d, colliders)) { c = Math.max(0, t - 0.06); break; }
      }
      res.push(c);
    }
    return res;
  }

  // Pousse la main vers la manette. La force dépend de ce qu'on porte et elle est plafonnée :
  // un objet trop lourd fait plier la main, deux mains portent deux fois plus.
  piloter(dt) {
    if (!this.active) return;
    const p = this.corps.translation();
    const ecart = v1.set(this.cible.pos.x - p.x, this.cible.pos.y - p.y, this.cible.pos.z - p.z);
    if (ecart.length() > DISTANCE_LACHER) { this.lacher(); this.teleporter(); return; }

    let masse = MASSE_MAIN, inertie = INERTIE_MAIN;
    if (this.tenu && !this.tenu.isFixed() && !this.tenu.isKinematic()) {
      const part = 1 / (corpsTenus.get(this.tenu.handle) ?? 1);
      const m = this.tenu.mass();
      const c = this.tenu.worldCom();
      const i = this.tenu.principalInertia();
      const bras2 = (c.x - p.x) ** 2 + (c.y - p.y) ** 2 + (c.z - p.z) ** 2;
      masse += m * part;
      inertie += (m * bras2 + Math.max(i.x, i.y, i.z)) * part;
    }

    const vVoulue = ecart.divideScalar(dt).clampLength(0, VITESSE_MAX);
    const v = this.corps.linvel();
    const impulsion = v2.set(vVoulue.x - v.x, vVoulue.y - v.y, vVoulue.z - v.z).multiplyScalar(masse).clampLength(0, FORCE_MAX * dt);
    this.corps.applyImpulse(impulsion, true);

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

  // Attraction à distance : on vise un objet main serrée, puis un coup de poignet vers soi le fait voler jusqu'à la main
  majAttraction(dt) {
    const poing = this.poing(new THREE.Vector3());
    if (this.attire) {
      this.attire.temps -= dt;
      const o = this.attire.objet;
      const d = Math.min(...o.colliders.map((c) => distanceSurface(c, poing)));
      if (d < 0.12) this.fixerA(o.corps, o);
      else if (this.attire.temps < 0) this.attire = null;
      return;
    }
    if (!this.serre || this.joint) { this.visee = null; this.cadre.visible = false; return; }

    const hit = world.castRay(new RAPIER.Ray(this.rayon.origine, this.rayon.dir), ATTRACTION_PORTEE, true,
      undefined, undefined, undefined, this.corps, (col) => !infos.get(col.handle)?.main);
    const o = hit ? infos.get(hit.collider.handle)?.objet : null;
    if (o && !o.ragdoll && !o.range && o.masse <= ATTRACTION_MASSE_MAX && !corpsTenus.has(o.corps.handle)) {
      if (this.visee !== o) { this.visee = o; this.dureeVisee = 0; vibrer(this.cote, 0.15, 15); }
      this.dureeVisee += dt;
      this.cadre.setFromObject(o.groupe);
      this.cadre.visible = true;
      const versSoi = -this.vitesseMain.dot(this.rayon.dir);
      const coupDePoignet = versSoi > 1.1 || this.vitesseMain.y > 1.4 || (this.modePC && this.dureeVisee > 0.3);
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
    if (this.doigtsAPlacer && this.tenu) this.courbures = this.calculerCourbures(this.tenu);
    this.doigtsAPlacer = false;
    this.visuel.groupe.visible = true;
    this.visuel.placer(this.corps);
    this.fantome.groupe.position.copy(this.cible.pos);
    this.fantome.groupe.quaternion.copy(this.cible.quat);
    this.fantome.groupe.visible = this.fantome.groupe.position.distanceTo(this.visuel.groupe.position) > 0.04;

    let pose;
    if (this.courbures) pose = this.courbures;
    else {
      const g = this.serrage;
      pose = [Math.max(g * 0.55, this.pouce * 0.45), Math.max(g * 0.85, this.gachette), g, g, g];
    }
    this.visuel.poser(pose);
    this.fantome.poser(pose);
  }
}

// --- Modèle 3D de la main : paume, poignet, 4 doigts à 3 phalanges et un pouce ---
const matGant = new THREE.MeshStandardMaterial({ color: 0x2e3846, roughness: 0.55, metalness: 0.1 });
const matPaume = new THREE.MeshStandardMaterial({ color: 0x48566a, roughness: 0.7 });
const matFantome = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false });
const DOIGTS = [
  { z: -0.030, longueurs: [0.044, 0.027, 0.022] },   // index
  { z: -0.010, longueurs: [0.047, 0.030, 0.023] },   // majeur
  { z: 0.010, longueurs: [0.044, 0.028, 0.022] },    // annulaire
  { z: 0.028, longueurs: [0.036, 0.022, 0.020] },    // auriculaire
];
const PLI = [1.35, 1.6, 1.1];          // angle max de chaque articulation (rad)
const PLI_POUCE = [0.45, 0.75, 0.65];
const geoPhalange = new Map();
function phalange(longueur, rayon) {
  const cle = `${longueur}-${rayon}`;
  if (!geoPhalange.has(cle)) {
    const g = new THREE.CapsuleGeometry(rayon, Math.max(0.001, longueur - rayon), 3, 8);
    g.translate(0, -longueur / 2, 0);
    geoPhalange.set(cle, g);
  }
  return geoPhalange.get(cle);
}

class ModeleMain {
  constructor(cote, fantome) {
    const s = cote === 'right' ? 1 : -1;
    this.s = s;
    const mat = fantome ? matFantome : matGant;
    this.groupe = new THREE.Group();
    this.groupe.visible = false;
    const maillage = (geo, m = mat) => {
      const o = new THREE.Mesh(geo, m);
      o.castShadow = !fantome;
      return o;
    };

    const paume = maillage(new THREE.BoxGeometry(0.026, 0.095, 0.084), fantome ? mat : matPaume);
    paume.position.set(s * 0.034, 0.03, 0);
    const poignet = maillage(new THREE.CylinderGeometry(0.03, 0.034, 0.11, 12));
    poignet.position.set(s * 0.03, 0.12, 0);
    this.groupe.add(paume, poignet);

    // Doigts : chaque articulation tourne autour de Z (axe des jointures), vers la paume
    this.doigts = [];
    const pouce = [];
    let parent = new THREE.Group();
    parent.position.set(s * 0.02, 0.035, -0.036);
    parent.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(-s * 0.35, -0.55, -0.75).normalize());
    this.groupe.add(parent);
    const versPaume = new THREE.Vector3(-s, 0, 0).applyQuaternion(parent.quaternion.clone().invert());
    this.axePouce = new THREE.Vector3(0, -1, 0).cross(versPaume).normalize();
    [0.038, 0.03, 0.025].forEach((l, i) => {
      const art = new THREE.Group();
      if (i > 0) art.position.set(0, -[0.038, 0.03][i - 1], 0);
      art.add(maillage(phalange(l, 0.0095)));
      parent.add(art);
      pouce.push(art);
      parent = art;
    });
    this.doigts.push(pouce);

    for (const d of DOIGTS) {
      const articulations = [];
      let p = new THREE.Group();
      p.position.set(s * 0.03, -0.018, d.z);
      this.groupe.add(p);
      d.longueurs.forEach((l, i) => {
        const art = i === 0 ? p : new THREE.Group();
        if (i > 0) { art.position.set(0, -d.longueurs[i - 1], 0); p.add(art); }
        art.add(maillage(phalange(l, i === 2 ? 0.0078 : 0.0086)));
        articulations.push(art);
        p = art;
      });
      this.doigts.push(articulations);
    }
    // Bout de chaque doigt (pour tester le contact)
    this.bouts = this.doigts.map((arts, d) => {
      const bout = new THREE.Object3D();
      bout.position.set(0, -(d === 0 ? 0.025 : DOIGTS[d - 1].longueurs[2]), 0);
      arts[2].add(bout);
      return bout;
    });
  }

  placer(corps) {
    const p = corps.translation(), r = corps.rotation();
    this.groupe.position.set(p.x, p.y, p.z);
    this.groupe.quaternion.set(r.x, r.y, r.z, r.w);
  }

  plierDoigt(d, t) {
    const arts = this.doigts[d];
    if (d === 0) arts.forEach((a, i) => a.quaternion.setFromAxisAngle(this.axePouce, t * PLI_POUCE[i]));
    else arts.forEach((a, i) => { a.rotation.z = -this.s * t * PLI[i]; });
  }

  poser(courbures) {
    for (let d = 0; d < 5; d++) this.plierDoigt(d, courbures[d]);
  }

  touche(d, colliders) {
    const points = [...this.doigts[d].slice(1), this.bouts[d]].map((o) => o.getWorldPosition(new THREE.Vector3()));
    return points.some((pt) => colliders.some((c) => distanceSurface(c, pt) < 0.009));
  }
}
