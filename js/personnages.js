// Personnages (hommes et femmes habillés) : ils marchent, regardent le joueur, parlent, réagissent quand
// on les pousse ou qu'on leur lance quelque chose, et tombent comme de vrais corps (ragdoll) avant de se relever.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as clonerSquelette } from 'three/addons/utils/SkeletonUtils.js';
import { RAPIER, world, scene, infos, groupes, G_PNJ, G_MONDE, G_JOUEUR, CG_PNJ, CG_RAGDOLL, GRAVITE } from './monde.js';
import { corpsTenus } from './mains.js';
import { parler } from './sons.js';

const BASE = 'https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/models/gltf/';

const REPLIQUES = {
  salut: ['Salut !', 'Bonjour !', 'Tiens, un nouveau visage !', 'Hé, bienvenue au complexe !', 'Coucou, ça va ?'],
  discussion: ['Belle journée, hein ?', "T'as essayé la tour d'escalade au nord ?", 'Il paraît que la caisse en métal pèse cinquante kilos.',
    'Range tes objets sur tes hanches, c\'est pratique.', "L'entrepôt est plein de trucs à lancer.", 'Je fais ma pause, là.',
    'Tu peux attirer les objets de loin avec un coup de poignet.', 'Les barres de singe, c\'est plus dur que ça en a l\'air.'],
  pousse: ['Hé ! Doucement !', 'Arrête de me pousser !', 'Ça va pas, non ?', 'Oh ! Fais attention !'],
  touche: ['Aïe !', 'Hé ! Qui a lancé ça ?', 'Ouille !', 'Arrête de me lancer des trucs !'],
  chute: ['Waaah !', 'Woah !', 'Hééé !'],
  attrape: ['Hé ! Lâche-moi !', 'Pose-moi par terre !', 'Mais lâche-moi !'],
  releve: ["Ouf… ça va, j'ai rien.", 'La prochaine fois, fais attention !', 'Bon. On se calme.', 'Aïe aïe aïe… mon dos.'],
};
const auHasard = (liste) => liste[Math.floor(Math.random() * liste.length)];
const alea = (a, b) => a + Math.random() * (b - a);

// Parties du corps pour la chute physique. masse = part de la masse totale.
// joint = os où se trouve l'articulation avec la partie parente.
const PARTIES = [
  { nom: 'bassin', os: 'Hips', a: 'LeftUpLeg', b: 'RightUpLeg', rayon: 0.11, masse: 0.15 },
  { nom: 'torse', os: 'Spine2', a: 'Spine1', b: 'Neck', rayon: 0.135, masse: 0.3, parent: 'bassin', joint: 'Spine2' },
  { nom: 'tete', os: 'Head', tete: true, rayon: 0.1, masse: 0.08, parent: 'torse', joint: 'Head' },
  { nom: 'brasG', os: 'LeftArm', a: 'LeftArm', b: 'LeftForeArm', rayon: 0.048, masse: 0.028, parent: 'torse', joint: 'LeftArm' },
  { nom: 'avantBrasG', os: 'LeftForeArm', a: 'LeftForeArm', b: 'LeftHand', rayon: 0.042, masse: 0.022, parent: 'brasG', joint: 'LeftForeArm' },
  { nom: 'brasD', os: 'RightArm', a: 'RightArm', b: 'RightForeArm', rayon: 0.048, masse: 0.028, parent: 'torse', joint: 'RightArm' },
  { nom: 'avantBrasD', os: 'RightForeArm', a: 'RightForeArm', b: 'RightHand', rayon: 0.042, masse: 0.022, parent: 'brasD', joint: 'RightForeArm' },
  { nom: 'cuisseG', os: 'LeftUpLeg', a: 'LeftUpLeg', b: 'LeftLeg', rayon: 0.07, masse: 0.1, parent: 'bassin', joint: 'LeftUpLeg' },
  { nom: 'jambeG', os: 'LeftLeg', a: 'LeftLeg', b: 'LeftFoot', rayon: 0.052, masse: 0.06, parent: 'cuisseG', joint: 'LeftLeg' },
  { nom: 'cuisseD', os: 'RightUpLeg', a: 'RightUpLeg', b: 'RightLeg', rayon: 0.07, masse: 0.1, parent: 'bassin', joint: 'RightUpLeg' },
  { nom: 'jambeD', os: 'RightLeg', a: 'RightLeg', b: 'RightFoot', rayon: 0.052, masse: 0.06, parent: 'cuisseD', joint: 'RightLeg' },
];

const CENTRE_CAPSULE = 0.82;
const VITESSE_MARCHE = 1.1;
const FILTRE_DEPLACEMENT = groupes(G_PNJ, G_MONDE | G_JOUEUR);

const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion();
const HAUT = new THREE.Vector3(0, 1, 0);

// Chaque modèle a été exporté avec une orientation de base différente (racine tournée de ±90°, regard vers +Z ou -Z).
// "repere" décrit cette orientation : F remet le modèle face à +Z, FR = F × rotation de la racine,
// et "hauteur" est la hauteur des hanches au repos.
function repere(modele) {
  const hanches = modele.getObjectByName('mixamorigHips');
  const qRacine = hanches.parent.quaternion.clone();
  const devant = new THREE.Vector3(0, 0, 1).applyQuaternion(qRacine.clone().multiply(hanches.quaternion));
  const F = new THREE.Quaternion().setFromAxisAngle(HAUT, -Math.atan2(devant.x, devant.z));
  return { F, FR: F.clone().multiply(qRacine), hauteur: hanches.position.clone().applyQuaternion(qRacine).y };
}

// Adapte une animation d'un modèle à un autre : seules les hanches dépendent du repère de base,
// les autres os du squelette Mixamo sont identiques.
function adapterClip(clip, source, cible) {
  const nomsOs = new Set();
  cible.traverse((o) => { if (o.isBone) nomsOs.add(o.name); });
  const rs = repere(source), rc = repere(cible);
  const conversion = rc.FR.clone().invert().multiply(rs.FR);
  const ratio = rc.hauteur / rs.hauteur;
  const c = clip.clone();
  // On garde les rotations de tous les os, mais la position seulement pour les hanches :
  // sinon les longueurs d'os du modèle source étireraient les bras et les jambes du modèle cible.
  c.tracks = c.tracks.filter((t) => {
    const [os, propriete] = t.name.split('.');
    return nomsOs.has(os) && (propriete === 'quaternion' || (propriete === 'position' && os === 'mixamorigHips'));
  });
  const q = new THREE.Quaternion(), p = new THREE.Vector3();
  for (const t of c.tracks) {
    if (t.name === 'mixamorigHips.quaternion') {
      for (let i = 0; i < t.values.length; i += 4) {
        q.fromArray(t.values, i).premultiply(conversion).toArray(t.values, i);
      }
    } else if (t.name === 'mixamorigHips.position') {
      for (let i = 0; i < t.values.length; i += 3) {
        p.fromArray(t.values, i).applyQuaternion(conversion).multiplyScalar(ratio).toArray(t.values, i);
      }
    }
  }
  return c;
}

export async function creerPersonnages(definitions) {
  const loader = new GLTFLoader();
  const [soldat, michelle, xbot] = await Promise.all(['Soldier.glb', 'Michelle.glb', 'Xbot.glb'].map((n) => loader.loadAsync(BASE + n)));
  const modeles = { homme: soldat, femme: michelle };
  const clips = {
    idle: [soldat, 'Idle'], marche: [soldat, 'Walk'],
    oui: [xbot, 'agree'], non: [xbot, 'headShake'],
  };
  return definitions.map((d) => new Personnage(d, modeles[d.modele], clips));
}

class Personnage {
  constructor(def, gltf, clips) {
    this.def = def;
    this.voix = { feminin: def.modele === 'femme', hauteur: def.voix ?? 1 };
    this.racine = new THREE.Group();
    this.racine.position.set(def.pos[0], 0, def.pos[1]);
    this.racine.rotation.y = def.lacet ?? 0;
    this.modele = clonerSquelette(gltf.scene);
    this.modele.quaternion.copy(repere(gltf.scene).F);   // tous les personnages regardent vers +Z
    this.modele.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      if (def.teinte) {
        o.material = o.material.clone();
        o.material.color.multiply(new THREE.Color(def.teinte));
      }
    });
    this.racine.add(this.modele);
    scene.add(this.racine);
    this.os = {};
    this.modele.traverse((o) => { if (o.isBone) this.os[o.name.replace('mixamorig', '')] = o; });

    this.mixer = new THREE.AnimationMixer(this.modele);
    this.actions = {};
    for (const [nom, [source, nomClip]] of Object.entries(clips)) {
      const clip = source.animations.find((a) => a.name === nomClip);
      this.actions[nom] = this.mixer.clipAction(adapterClip(clip, source.scene, gltf.scene));
    }
    for (const g of ['oui', 'non']) { this.actions[g].setLoop(THREE.LoopOnce); this.actions[g].clampWhenFinished = false; }
    this.mixer.addEventListener('finished', () => this.jouer(this.etat === 'marche' ? 'marche' : 'idle'));
    this.actionCourante = 'idle';
    this.actions.idle.play();
    this.mixer.update(Math.random() * 2);

    // Capsule invisible qui suit le personnage quand il est debout
    this.corps = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(def.pos[0], CENTRE_CAPSULE, def.pos[1]));
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.25).setCollisionGroups(CG_PNJ)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(15), this.corps);
    infos.set(this.collider.handle, { pnj: this });
    this.cc = world.createCharacterController(0.02);
    this.cc.setApplyImpulsesToDynamicBodies(true);

    this.etat = 'idle';
    this.tempsEtat = alea(1, 4);
    this.point = null;
    this.bloque = 0;
    this.lacetVoulu = this.racine.rotation.y;
    this.regard = 0;
    this.dernierSalut = -100;
    this.prochaineReplique = alea(8, 20);
    this.dernierCri = -100;
    this.temps = 0;
    this.parties = null;
    this.creerBulle();
  }

  creerBulle() {
    this.toile = document.createElement('canvas');
    this.toile.width = 512; this.toile.height = 128;
    this.textureBulle = new THREE.CanvasTexture(this.toile);
    this.textureBulle.colorSpace = THREE.SRGBColorSpace;
    this.bulle = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.textureBulle, transparent: true, depthWrite: false }));
    this.bulle.scale.set(1.3, 0.325, 1);
    this.bulle.visible = false;
    scene.add(this.bulle);
    this.dureeBulle = 0;
  }

  dire(categorie, urgent = false) {
    const texte = auHasard(REPLIQUES[categorie]);
    const g = this.toile.getContext('2d');
    g.clearRect(0, 0, 512, 128);
    g.fillStyle = 'rgba(15,20,28,0.82)';
    g.beginPath(); g.roundRect(4, 4, 504, 120, 28); g.fill();
    g.fillStyle = '#f2b134'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center';
    g.fillText(this.def.nom, 256, 44);
    g.fillStyle = '#ffffff'; g.font = '34px sans-serif';
    g.fillText(texte, 256, 96, 490);
    this.textureBulle.needsUpdate = true;
    this.dureeBulle = 3.5;
    this.teteMonde(vA);
    parler(texte, this.voix, vA, urgent);
  }

  teteMonde(out) {
    return this.os.Head.getWorldPosition(out);
  }

  jouer(nom, fondu = 0.3) {
    if (this.actionCourante === nom && !['oui', 'non'].includes(nom)) return;
    const suivante = this.actions[nom];
    suivante.reset().setEffectiveWeight(1).fadeIn(fondu).play();
    if (this.actionCourante !== nom) this.actions[this.actionCourante].fadeOut(fondu);
    this.actionCourante = nom;
  }

  // --- Intelligence (avant la physique) ---
  maj(dt, teteJoueur) {
    this.temps += dt;
    if (this.etat === 'ragdoll') { this.majRagdoll(dt); return; }
    const pos = this.racine.position;
    const dx = teteJoueur.x - pos.x, dz = teteJoueur.z - pos.z;
    const dist = Math.hypot(dx, dz);
    this.regarde = dist < 4.5;

    if (dist < 2.6 && this.temps - this.dernierSalut > 45) {
      this.dernierSalut = this.temps;
      this.prochaineReplique = this.temps + alea(10, 20);
      this.dire('salut');
      this.etat = 'parle'; this.tempsEtat = 2.5;
      this.jouer('oui');
    } else if (dist < 4 && this.temps > this.prochaineReplique) {
      this.prochaineReplique = this.temps + alea(18, 35);
      this.dire('discussion');
    }

    if (this.etat === 'marche') {
      if (dist < 1.8) { this.etat = 'idle'; this.tempsEtat = alea(2, 4); this.jouer('idle'); }
      else {
        vA.set(this.point[0] - pos.x, 0, this.point[1] - pos.z);
        const reste = vA.length();
        if (reste < 0.4) { this.etat = 'idle'; this.tempsEtat = alea(3, 8); this.jouer('idle'); }
        else {
          this.lacetVoulu = Math.atan2(vA.x, vA.z);
          const voulu = vA.normalize().multiplyScalar(VITESSE_MARCHE * dt);
          // On n'avance que dans la direction où l'on regarde déjà (virages naturels)
          const alignement = Math.max(0, Math.cos(this.ecartLacet()));
          voulu.multiplyScalar(alignement);
          this.cc.computeColliderMovement(this.collider, voulu, undefined, FILTRE_DEPLACEMENT);
          const m = this.cc.computedMovement();
          pos.x += m.x; pos.z += m.z;
          const prevu = voulu.length();
          this.bloque = prevu > 1e-4 && Math.hypot(m.x, m.z) < prevu * 0.3 ? this.bloque + dt : 0;
          if (this.bloque > 1) { this.bloque = 0; this.choisirPoint(); }
        }
      }
    } else {
      this.tempsEtat -= dt;
      if (dist < 3) this.lacetVoulu = Math.atan2(dx, dz);
      if (this.tempsEtat <= 0 && dist > 2.2) { this.choisirPoint(); this.etat = 'marche'; this.jouer('marche'); }
    }

    this.racine.rotation.y += this.ecartLacet() * Math.min(1, dt * 4);
    this.corps.setNextKinematicTranslation({ x: pos.x, y: CENTRE_CAPSULE, z: pos.z });
  }

  ecartLacet() {
    const e = this.lacetVoulu - this.racine.rotation.y;
    return Math.atan2(Math.sin(e), Math.cos(e));
  }

  choisirPoint() {
    const points = this.def.points;
    let p;
    do p = points[Math.floor(Math.random() * points.length)]; while (points.length > 1 && p === this.point);
    this.point = p;
  }

  // --- Réactions ---
  pousse(vitesse) {
    if (this.etat === 'ragdoll') return;
    const v = vitesse.length();
    if (v > 4.2) { this.passerEnRagdoll(vitesse.clone().multiplyScalar(9), 'chute'); return; }
    if (v < 1.5 || this.temps - this.dernierCri < 2.5) return;
    this.dernierCri = this.temps;
    this.dire('pousse', true);
    this.jouer('non');
    this.etat = 'parle'; this.tempsEtat = 2.5;
    // petit recul
    vA.set(vitesse.x, 0, vitesse.z).multiplyScalar(0.06);
    this.cc.computeColliderMovement(this.collider, vA, undefined, FILTRE_DEPLACEMENT);
    const m = this.cc.computedMovement();
    this.racine.position.x += m.x; this.racine.position.z += m.z;
  }

  impact(objet, vitesse) {
    if (this.etat === 'ragdoll') return;
    // Les balles en mousse sont trop légères pour faire mal, mais on les sent quand même
    const elan = objet.jouet ? (vitesse.length() > 5 ? 1 : 0) : objet.masse * vitesse.length();
    if (elan > 10) { this.passerEnRagdoll(vitesse.clone().multiplyScalar(objet.masse * 0.8), 'chute'); return; }
    if (elan < 0.7 || this.temps - this.dernierCri < 2) return;
    this.dernierCri = this.temps;
    this.dire('touche', true);
    this.jouer('non');
    this.etat = 'parle'; this.tempsEtat = 2;
  }

  // --- Chute physique (ragdoll) ---
  passerEnRagdoll(impulsion, raison) {
    if (this.parties) return;
    this.etat = 'ragdoll';
    this.tempsRagdoll = 0;
    this.calme = 0;
    this.collider.setEnabled(false);
    this.modele.updateMatrixWorld(true);
    const masseTotale = this.def.modele === 'femme' ? 60 : 75;
    const vitesseMarche = this.actionCourante === 'marche'
      ? vA.set(Math.sin(this.racine.rotation.y), 0, Math.cos(this.racine.rotation.y)).multiplyScalar(VITESSE_MARCHE).clone() : new THREE.Vector3();

    const parNom = {};
    this.parties = PARTIES.map((def) => {
      const os = this.os[def.os];
      const qOs = os.getWorldQuaternion(new THREE.Quaternion());
      const pOs = os.getWorldPosition(new THREE.Vector3());
      let centre, q, desc, volume;
      if (def.tete) {
        centre = vB.set(0, 1, 0).applyQuaternion(qOs).multiplyScalar(0.09).add(pOs).clone();
        q = qOs.clone();
        desc = RAPIER.ColliderDesc.ball(def.rayon);
        volume = (4 / 3) * Math.PI * def.rayon ** 3;
      } else {
        const a = this.os[def.a].getWorldPosition(new THREE.Vector3());
        const b = this.os[def.b].getWorldPosition(new THREE.Vector3());
        const axe = vC.subVectors(b, a);
        const longueur = Math.max(0.05, axe.length());
        centre = a.clone().add(b).multiplyScalar(0.5);
        q = new THREE.Quaternion().setFromUnitVectors(HAUT, axe.normalize());
        const demi = Math.max(0.01, longueur / 2 - def.rayon * 0.5);
        desc = RAPIER.ColliderDesc.capsule(demi, def.rayon);
        volume = Math.PI * def.rayon ** 2 * demi * 2 + (4 / 3) * Math.PI * def.rayon ** 3;
      }
      const masse = def.masse * masseTotale;
      const corps = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(centre.x, centre.y, centre.z).setRotation(q)
        .setLinearDamping(0.15).setAngularDamping(2.2).setCcdEnabled(true)
        .setLinvel(vitesseMarche.x, vitesseMarche.y, vitesseMarche.z));
      const collider = world.createCollider(desc.setDensity(masse / volume).setFriction(0.9).setRestitution(0.05)
        .setCollisionGroups(CG_RAGDOLL).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(masse * GRAVITE * 4), corps);
      const partie = {
        def, os, corps, colliders: [collider], masse, son: 'chair', ragdoll: true, pnj: this, nom: this.def.nom,
        qDecalage: q.clone().invert().multiply(qOs),
        pDecalage: def.os === 'Hips' ? pOs.clone().sub(centre).applyQuaternion(q.clone().invert()) : null,
      };
      infos.set(collider.handle, { objet: partie });
      parNom[def.nom] = partie;
      return partie;
    });

    for (const p of this.parties) {
      if (!p.def.parent) continue;
      const parent = parNom[p.def.parent];
      const articulation = this.os[p.def.joint].getWorldPosition(new THREE.Vector3());
      const ancre = (partie) => {
        const t = partie.corps.translation(), r = partie.corps.rotation();
        const l = articulation.clone().sub(vB.set(t.x, t.y, t.z)).applyQuaternion(qA.set(r.x, r.y, r.z, r.w).invert());
        return { x: l.x, y: l.y, z: l.z };
      };
      const joint = world.createImpulseJoint(RAPIER.JointData.spherical(ancre(parent), ancre(p)), parent.corps, p.corps, true);
      joint.setContactsEnabled(false);
    }

    if (impulsion) {
      const torse = parNom.torse.corps;
      torse.applyImpulse(impulsion, true);
      parNom.bassin.corps.applyImpulse(impulsion.clone().multiplyScalar(0.5), true);
    }
    this.mixer.stopAllAction();
    this.dire(raison === 'attrape' ? 'attrape' : 'chute', true);
  }

  partieProche(point) {
    if (!this.parties) return null;
    let meilleure = null, d = Infinity;
    for (const p of this.parties) {
      const t = p.corps.translation();
      const dist = Math.hypot(t.x - point.x, t.y - point.y, t.z - point.z);
      if (dist < d) { d = dist; meilleure = p; }
    }
    return meilleure;
  }

  majRagdoll(dt) {
    this.tempsRagdoll += dt;
    const tenu = this.parties.some((p) => corpsTenus.has(p.corps.handle));
    const v = this.parties[0].corps.linvel();
    if (tenu || Math.hypot(v.x, v.y, v.z) > 0.35) this.calme = 0;
    else this.calme += dt;
    if (!tenu && ((this.calme > 1.5 && this.tempsRagdoll > 2.5) || this.tempsRagdoll > 25)) this.relever();
  }

  relever() {
    const hanches = this.os.Hips;
    const pos = hanches.getWorldPosition(new THREE.Vector3());
    const devant = new THREE.Vector3(0, 0, 1).applyQuaternion(hanches.getWorldQuaternion(qA));
    devant.y = 0;
    if (devant.lengthSq() > 0.09) this.racine.rotation.y = Math.atan2(devant.x, devant.z);
    this.racine.position.set(pos.x, 0, pos.z);
    this.lacetVoulu = this.racine.rotation.y;

    for (const p of this.parties) {
      infos.delete(p.colliders[0].handle);
      world.removeRigidBody(p.corps);
    }
    this.parties = null;
    this.corps.setTranslation({ x: pos.x, y: CENTRE_CAPSULE, z: pos.z }, true);
    this.collider.setEnabled(true);
    this.etat = 'parle';
    this.tempsEtat = 3;
    this.actionCourante = 'idle';
    this.actions.idle.reset().play();
    this.jouer('non');
    this.dire('releve', true);
  }

  // --- Affichage (après la physique) ---
  majVisuel(dt, teteJoueur) {
    if (this.parties) {
      for (const p of this.parties) {
        const t = p.corps.translation(), r = p.corps.rotation();
        const qCorps = qA.set(r.x, r.y, r.z, r.w);
        const qMonde = qB.copy(qCorps).multiply(p.qDecalage);
        const parent = p.os.parent;
        parent.updateWorldMatrix(true, false);
        const qParent = parent.getWorldQuaternion(new THREE.Quaternion());
        p.os.quaternion.copy(qParent.invert().multiply(qMonde));
        if (p.pDecalage) {
          const pMonde = vA.copy(p.pDecalage).applyQuaternion(qCorps).add(vB.set(t.x, t.y, t.z));
          p.os.position.copy(parent.worldToLocal(pMonde));
        }
        p.os.updateMatrixWorld(true);
      }
    } else {
      this.mixer.update(dt);
      this.tournerTete(dt, teteJoueur);
    }

    // Bulle de dialogue au-dessus de la tête
    if (this.dureeBulle > 0) {
      this.dureeBulle -= dt;
      this.teteMonde(this.bulle.position);
      this.bulle.position.y += 0.45;
      this.bulle.visible = this.bulle.position.distanceTo(teteJoueur) < 14;
    } else this.bulle.visible = false;
  }

  tournerTete(dt, teteJoueur) {
    this.regard += ((this.regarde ? 1 : 0) - this.regard) * Math.min(1, dt * 3);
    if (this.regard < 0.01) return;
    this.racine.updateMatrixWorld(true);
    const tete = this.os.Head;
    const pTete = tete.getWorldPosition(vA);
    const local = vB.subVectors(teteJoueur, pTete).applyQuaternion(qA.copy(this.racine.quaternion).invert());
    const lacet = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -1.1, 1.1) * this.regard;
    const tangage = THREE.MathUtils.clamp(Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.5, 0.5) * this.regard;
    const rotLocale = qB.setFromEuler(new THREE.Euler(-tangage, lacet, 0, 'YXZ'));
    // rotation exprimée dans le monde : racine * rotLocale * racine⁻¹
    const rotMonde = this.racine.quaternion.clone().multiply(rotLocale).multiply(qA);
    const qTete = tete.getWorldQuaternion(new THREE.Quaternion());
    const voulu = rotMonde.multiply(qTete);
    const qParent = tete.parent.getWorldQuaternion(new THREE.Quaternion());
    tete.quaternion.copy(qParent.invert().multiply(voulu));
  }
}
