// Personnages (hommes et femmes habillés) : ils marchent, regardent le joueur, parlent, réagissent quand
// on les pousse ou qu'on leur lance quelque chose, et tombent comme de vrais corps (ragdoll) avant de se relever.
//
// Modèles : humains réalistes Microsoft Rocketbox (licence MIT, préparés dans assets/personnages)
// avec leurs propres animations. Si ces fichiers manquent, on se rabat sur les modèles des exemples three.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as clonerSquelette } from 'three/addons/utils/SkeletonUtils.js';
import { RAPIER, world, scene, infos, groupes, G_PNJ, G_MONDE, G_JOUEUR, CG_PNJ, CG_RAGDOLL, GRAVITE } from './monde.js';
import { corpsTenus } from './mains.js';
import { parler } from './sons.js';

const DOSSIER = 'assets/personnages/';
const BASE_THREE = 'https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/models/gltf/';

const REPLIQUES = {
  salut: ['Salut !', 'Bonjour !', 'Tiens, un nouveau visage !', 'Hé, bienvenue au complexe !', 'Coucou, ça va ?'],
  discussion: ['Belle journée, hein ?', "T'as essayé la tour d'escalade au nord ?", 'Il paraît que la caisse en métal pèse cinquante kilos.',
    "Range tes objets sur tes hanches, c'est pratique.", "L'entrepôt est plein de trucs à lancer.", 'Je fais ma pause, là.',
    'Tu peux attirer les objets de loin avec un coup de poignet.', "Les barres de singe, c'est plus dur que ça en a l'air.",
    'Tu as vu la voiture dans la cour ? Elle est magnifique.'],
  pousse: ['Hé ! Doucement !', 'Arrête de me pousser !', 'Ça va pas, non ?', 'Oh ! Fais attention !'],
  touche: ['Aïe !', 'Hé ! Qui a lancé ça ?', 'Ouille !', 'Arrête de me lancer des trucs !'],
  chute: ['Waaah !', 'Woah !', 'Hééé !'],
  attrape: ['Hé ! Lâche-moi !', 'Pose-moi par terre !', 'Mais lâche-moi !'],
  releve: ["Ouf… ça va, j'ai rien.", 'La prochaine fois, fais attention !', 'Bon. On se calme.', 'Aïe aïe aïe… mon dos.'],
};
const auHasard = (liste) => liste[Math.floor(Math.random() * liste.length)];
const alea = (a, b) => a + Math.random() * (b - a);

// Noms des os selon le type de squelette
const SQUELETTES = {
  mixamo: {
    hanches: 'mixamorigHips', colonne1: 'mixamorigSpine1', torse: 'mixamorigSpine2', cou: 'mixamorigNeck', tete: 'mixamorigHead',
    brasG: 'mixamorigLeftArm', avantBrasG: 'mixamorigLeftForeArm', mainG: 'mixamorigLeftHand',
    brasD: 'mixamorigRightArm', avantBrasD: 'mixamorigRightForeArm', mainD: 'mixamorigRightHand',
    cuisseG: 'mixamorigLeftUpLeg', jambeG: 'mixamorigLeftLeg', piedG: 'mixamorigLeftFoot', orteilG: 'mixamorigLeftToeBase',
    cuisseD: 'mixamorigRightUpLeg', jambeD: 'mixamorigRightLeg', piedD: 'mixamorigRightFoot', orteilD: 'mixamorigRightToeBase',
  },
  biped: {
    hanches: 'Bip01_Pelvis', colonne1: 'Bip01_Spine1', torse: 'Bip01_Spine2', cou: 'Bip01_Neck', tete: 'Bip01_Head',
    brasG: 'Bip01_L_UpperArm', avantBrasG: 'Bip01_L_Forearm', mainG: 'Bip01_L_Hand',
    brasD: 'Bip01_R_UpperArm', avantBrasD: 'Bip01_R_Forearm', mainD: 'Bip01_R_Hand',
    cuisseG: 'Bip01_L_Thigh', jambeG: 'Bip01_L_Calf', piedG: 'Bip01_L_Foot', orteilG: 'Bip01_L_Toe0',
    cuisseD: 'Bip01_R_Thigh', jambeD: 'Bip01_R_Calf', piedD: 'Bip01_R_Foot', orteilD: 'Bip01_R_Toe0',
  },
};

// Parties du corps pour la chute physique (noms logiques). masse = part de la masse totale.
// pli = articulation qui ne plie que dans un sens (coude, genou), sinon rotule.
const PARTIES = [
  { nom: 'bassin', os: 'hanches', a: 'cuisseG', b: 'cuisseD', rayon: 0.11, masse: 0.15 },
  { nom: 'torse', os: 'torse', a: 'colonne1', b: 'cou', rayon: 0.13, masse: 0.3, parent: 'bassin', joint: 'torse' },
  { nom: 'tete', os: 'tete', tete: true, rayon: 0.1, masse: 0.08, parent: 'torse', joint: 'tete' },
  { nom: 'brasG', os: 'brasG', a: 'brasG', b: 'avantBrasG', rayon: 0.045, masse: 0.028, parent: 'torse', joint: 'brasG' },
  { nom: 'avantBrasG', os: 'avantBrasG', a: 'avantBrasG', b: 'mainG', rayon: 0.04, masse: 0.022, parent: 'brasG', joint: 'avantBrasG', pli: 'coude' },
  { nom: 'brasD', os: 'brasD', a: 'brasD', b: 'avantBrasD', rayon: 0.045, masse: 0.028, parent: 'torse', joint: 'brasD' },
  { nom: 'avantBrasD', os: 'avantBrasD', a: 'avantBrasD', b: 'mainD', rayon: 0.04, masse: 0.022, parent: 'brasD', joint: 'avantBrasD', pli: 'coude' },
  { nom: 'cuisseG', os: 'cuisseG', a: 'cuisseG', b: 'jambeG', rayon: 0.068, masse: 0.1, parent: 'bassin', joint: 'cuisseG' },
  { nom: 'jambeG', os: 'jambeG', a: 'jambeG', b: 'piedG', rayon: 0.05, masse: 0.06, parent: 'cuisseG', joint: 'jambeG', pli: 'genou' },
  { nom: 'cuisseD', os: 'cuisseD', a: 'cuisseD', b: 'jambeD', rayon: 0.068, masse: 0.1, parent: 'bassin', joint: 'cuisseD' },
  { nom: 'jambeD', os: 'jambeD', a: 'jambeD', b: 'piedD', rayon: 0.05, masse: 0.06, parent: 'cuisseD', joint: 'jambeD', pli: 'genou' },
];

const CENTRE_CAPSULE = 0.82;
const VITESSE_MARCHE = 1.1;
const FILTRE_DEPLACEMENT = groupes(G_PNJ, G_MONDE | G_JOUEUR);
const HAUT = new THREE.Vector3(0, 1, 0);
const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion();

const position = (os, out = new THREE.Vector3()) => os.getWorldPosition(out);

// Direction "devant" d'un corps : perpendiculaire à l'axe des hanches (gauche -> droite) et à la verticale
function devantDuCorps(os, out = new THREE.Vector3()) {
  const gauche = position(os.cuisseG).sub(position(os.cuisseD));
  gauche.y = 0;
  return out.crossVectors(gauche, HAUT).normalize();
}

// --- Chargement ---
const chargeurFBX = () => {
  const gestion = new THREE.LoadingManager();
  // Les .fbx Rocketbox réclament des textures .tga : on les remplace par nos .jpg réduits
  gestion.addHandler(/\.tga$/i, { setPath() { return this; }, setCrossOrigin() { return this; }, load: (u, ok) => { const t = new THREE.Texture(); setTimeout(() => ok?.(t)); return t; } });
  return new FBXLoader(gestion);
};
const chargeurTex = new THREE.TextureLoader();
const tex = (url, couleur) => new Promise((ok) => chargeurTex.load(url, (t) => { if (couleur) t.colorSpace = THREE.SRGBColorSpace; t.flipY = true; ok(t); }, undefined, () => ok(null)));

const ANIMS_ROCKETBOX = {
  f: { idle: 'f_idle_neutral_02', marche: 'f_walk_neutral_01', salut: 'f_wave_01', colere: 'f_idle_angry_01' },
  m: { idle: 'm_idle_neutral_01', marche: 'm_walk_neutral_01', salut: 'm_wave_01', colere: 'm_idle_angry_02' },
};

async function chargerRocketbox(definitions) {
  const fbx = chargeurFBX();
  const genres = [...new Set(definitions.map((d) => d.genre))];
  const anims = {};
  await Promise.all(genres.map(async (g) => {
    anims[g] = {};
    await Promise.all(Object.entries(ANIMS_ROCKETBOX[g]).map(async ([nom, fichier]) => {
      const a = await fbx.loadAsync(`${DOSSIER}animations/${fichier}.fbx`);
      anims[g][nom] = a.animations[0];
    }));
  }));
  const modeles = await Promise.all(definitions.map(async (d) => {
    const dossier = `${DOSSIER}${d.rocketbox}/`;
    const [objet, cc, cn, tc, tn, oc, oa] = await Promise.all([
      fbx.loadAsync(`${dossier}${d.rocketbox}.fbx`),
      tex(dossier + 'corps_couleur.jpg', true), tex(dossier + 'corps_normal.jpg'),
      tex(dossier + 'tete_couleur.jpg', true), tex(dossier + 'tete_normal.jpg'),
      tex(dossier + 'opacite_couleur.jpg', true), tex(dossier + 'opacite_alpha.jpg'),
    ]);
    objet.traverse((o) => {
      if (!o.isMesh) return;
      const liste = Array.isArray(o.material) ? o.material : [o.material];
      const nouveaux = liste.map((m) => {
        const n = m.name.toLowerCase();
        if (n.includes('opacity')) return new THREE.MeshStandardMaterial({ map: oc, alphaMap: oa, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7 });
        if (n.includes('head')) return new THREE.MeshStandardMaterial({ map: tc, normalMap: tn, roughness: 0.55 });
        return new THREE.MeshStandardMaterial({ map: cc, normalMap: cn, roughness: 0.8 });
      });
      o.material = Array.isArray(o.material) ? nouveaux : nouveaux[0];
    });
    objet.scale.setScalar(0.01);   // centimètres -> mètres
    return objet;
  }));
  return definitions.map((d, i) => new Personnage(d, { scene: modeles[i], squelette: 'biped', clips: anims[d.genre] }));
}

// Secours (si les personnages réalistes ne sont pas encore disponibles) : le soldat des exemples three.js,
// avec ses propres animations
async function chargerSecours(definitions) {
  const soldat = await new GLTFLoader().loadAsync(BASE_THREE + 'Soldier.glb');
  const clips = { idle: soldat.animations.find((a) => a.name === 'Idle'), marche: soldat.animations.find((a) => a.name === 'Walk') };
  return definitions.map((d) => new Personnage(d, { scene: clonerSquelette(soldat.scene), squelette: 'mixamo', clips }));
}

export async function creerPersonnages(definitions) {
  try {
    return await chargerRocketbox(definitions);
  } catch (e) {
    console.warn('Personnages réalistes indisponibles, modèles de secours :', e);
    return chargerSecours(definitions);
  }
}

// Adapte une animation : on garde les rotations des os, la position seulement pour la racine (mise à l'échelle)
function adapterClip(clip, modele, racine, ratio = 1) {
  const noms = new Set();
  modele.traverse((o) => { if (o.isBone) noms.add(o.name); });
  const c = clip.clone();
  c.tracks = c.tracks.filter((t) => {
    const [os, prop] = t.name.split('.');
    return noms.has(os) && (prop === 'quaternion' || (prop === 'position' && os === racine));
  });
  if (ratio !== 1) for (const t of c.tracks) if (t.name.endsWith('.position')) for (let i = 0; i < t.values.length; i++) t.values[i] *= ratio;
  return c;
}

class Personnage {
  constructor(def, { scene: modele, squelette, clips }) {
    this.def = def;
    this.voix = { feminin: def.genre === 'f', hauteur: def.voix ?? 1 };
    this.racine = new THREE.Group();
    this.racine.position.set(def.pos[0], 0, def.pos[1]);
    this.racine.rotation.y = def.lacet ?? 0;
    this.modele = modele;
    this.modele.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    });
    this.enveloppe = new THREE.Group();   // tourne le modèle pour qu'il regarde vers +Z
    this.enveloppe.add(this.modele);
    this.racine.add(this.enveloppe);
    scene.add(this.racine);

    const noms = SQUELETTES[squelette];
    this.os = {};
    for (const [cle, nom] of Object.entries(noms)) this.os[cle] = this.modele.getObjectByName(nom);
    this.nomRacineAnim = squelette === 'biped' ? 'Bip01' : 'mixamorigHips';

    // Orientation : le modèle doit regarder vers +Z, pieds au sol
    this.racine.updateMatrixWorld(true);
    const devant = devantDuCorps(this.os);
    const angle = Math.atan2(devant.x, devant.z);
    this.enveloppe.rotation.y = -angle;

    // Animations
    this.mixer = new THREE.AnimationMixer(this.modele);
    this.actions = {};
    // Les animations Rocketbox viennent d'un acteur de taille standard : on ajuste la hauteur des hanches
    // à celle de ce personnage (comparée dans le repère du monde, pieds au sol)
    const racineAnim = this.modele.getObjectByName(this.nomRacineAnim);
    this.modele.updateMatrixWorld(true);
    const hauteurRepos = racineAnim.getWorldPosition(new THREE.Vector3()).y;
    for (const [nom, clip] of Object.entries(clips)) {
      if (!clip) continue;
      let ratio = 1;
      const piste = clip.tracks.find((t) => t.name === this.nomRacineAnim + '.position');
      if (squelette === 'biped' && piste) {
        const hauteurAnim = new THREE.Vector3().fromArray(piste.values, 0).applyMatrix4(racineAnim.parent.matrixWorld).y;
        if (hauteurAnim > 0.3) ratio = THREE.MathUtils.clamp(hauteurRepos / hauteurAnim, 0.8, 1.25);
      }
      this.actions[nom] = this.mixer.clipAction(adapterClip(clip, this.modele, this.nomRacineAnim, ratio));
    }
    for (const g of ['salut', 'colere']) if (this.actions[g]) { this.actions[g].setLoop(THREE.LoopOnce); this.actions[g].clampWhenFinished = false; }
    this.mixer.addEventListener('finished', () => this.jouer(this.etat === 'marche' ? 'marche' : 'idle'));
    this.actionCourante = 'idle';
    this.actions.idle.play();
    this.mixer.update(Math.random() * 3);

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
    parler(texte, this.voix, position(this.os.tete, vA), urgent);
  }

  jouer(nom, fondu = 0.35) {
    if (!this.actions[nom]) nom = 'idle';
    if (this.actionCourante === nom && !['salut', 'colere'].includes(nom)) return;
    const suivante = this.actions[nom];
    suivante.reset().setEffectiveWeight(1).fadeIn(fondu).play();
    if (this.actionCourante !== nom) this.actions[this.actionCourante]?.fadeOut(fondu);
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
      this.etat = 'parle'; this.tempsEtat = 3;
      this.jouer('salut');
    } else if (dist < 4 && this.temps > this.prochaineReplique) {
      this.prochaineReplique = this.temps + alea(18, 35);
      this.dire('discussion');
    }

    if (this.etat === 'marche') {
      if (dist < 1.8) { this.etat = 'idle'; this.tempsEtat = alea(2, 4); this.jouer('idle'); }
      else {
        vA.set(this.point[0] - pos.x, 0, this.point[1] - pos.z);
        if (vA.length() < 0.4) { this.etat = 'idle'; this.tempsEtat = alea(3, 8); this.jouer('idle'); }
        else {
          this.lacetVoulu = Math.atan2(vA.x, vA.z);
          const voulu = vA.normalize().multiplyScalar(VITESSE_MARCHE * dt * Math.max(0, Math.cos(this.ecartLacet())));
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

    this.racine.rotation.y += this.ecartLacet() * Math.min(1, dt * 3);
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
    if (v > 4.2) { this.passerEnRagdoll(vitesse.clone().multiplyScalar(12), 'chute'); return; }
    if (v < 1.5 || this.temps - this.dernierCri < 2.5) return;
    this.dernierCri = this.temps;
    this.dire('pousse', true);
    this.jouer('colere');
    this.etat = 'parle'; this.tempsEtat = 2.5;
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
    this.jouer('colere');
    this.etat = 'parle'; this.tempsEtat = 2;
  }

  // --- Chute physique (ragdoll) ---
  // Tous les corps sont créés avec la même orientation (celle du monde) : les articulations à un seul axe
  // (coudes, genoux) se règlent alors simplement, avec des limites réalistes.
  passerEnRagdoll(impulsion, raison) {
    if (this.parties) return;
    this.etat = 'ragdoll';
    this.tempsRagdoll = 0;
    this.calme = 0;
    this.collider.setEnabled(false);
    this.modele.updateMatrixWorld(true);
    const masseTotale = this.def.genre === 'f' ? 62 : 78;
    const vitesseMarche = this.actionCourante === 'marche'
      ? new THREE.Vector3(Math.sin(this.racine.rotation.y), 0, Math.cos(this.racine.rotation.y)).multiplyScalar(VITESSE_MARCHE) : new THREE.Vector3();
    const gauche = position(this.os.cuisseG).sub(position(this.os.cuisseD)).normalize();

    const parNom = {};
    this.parties = PARTIES.map((def) => {
      const os = this.os[def.os];
      const qOs = os.getWorldQuaternion(new THREE.Quaternion());
      const pOs = position(os);
      let centre, qForme, desc, volume, longueur = 0.2;
      if (def.tete) {
        const cou = position(this.os.cou);
        centre = pOs.clone().sub(cou).normalize().multiplyScalar(0.09).add(pOs);
        qForme = new THREE.Quaternion();
        desc = RAPIER.ColliderDesc.ball(def.rayon);
        volume = (4 / 3) * Math.PI * def.rayon ** 3;
      } else {
        const a = position(this.os[def.a]), b = position(this.os[def.b]);
        const axe = vC.subVectors(b, a);
        longueur = Math.max(0.05, axe.length());
        centre = a.clone().add(b).multiplyScalar(0.5);
        qForme = new THREE.Quaternion().setFromUnitVectors(HAUT, axe.normalize());
        const demi = Math.max(0.01, longueur / 2 - def.rayon * 0.7);
        desc = RAPIER.ColliderDesc.capsule(demi, def.rayon);
        volume = Math.PI * def.rayon ** 2 * demi * 2 + (4 / 3) * Math.PI * def.rayon ** 3;
      }
      const masse = def.masse * masseTotale;
      const corps = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(centre.x, centre.y, centre.z)
        .setLinearDamping(0.1).setAngularDamping(1.6).setCcdEnabled(true)
        .setLinvel(vitesseMarche.x, vitesseMarche.y, vitesseMarche.z));
      const collider = world.createCollider(desc.setRotation(qForme).setDensity(masse / volume).setFriction(0.9).setRestitution(0.02)
        .setCollisionGroups(CG_RAGDOLL).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(masse * GRAVITE * 4), corps);
      const partie = {
        def, os, corps, colliders: [collider], masse, son: 'chair', ragdoll: true, pnj: this, nom: this.def.nom,
        qDecalage: qOs.clone(),                                         // corps créé sans rotation
        pDecalage: def.os === 'hanches' ? pOs.clone().sub(centre) : null,
      };
      infos.set(collider.handle, { objet: partie });
      parNom[def.nom] = partie;
      return partie;
    });

    for (const p of this.parties) {
      if (!p.def.parent) continue;
      const parent = parNom[p.def.parent];
      const articulation = position(this.os[p.def.joint]);
      const ancre = (partie) => { const t = partie.corps.translation(); return { x: articulation.x - t.x, y: articulation.y - t.y, z: articulation.z - t.z }; };
      let joint;
      if (p.def.pli) {
        // Coude / genou : un seul axe, et ça ne plie que dans un sens
        const dirParent = vA.subVectors(articulation, position(this.os[parent.def.a])).normalize();
        const dirEnfant = vB.subVectors(position(this.os[p.def.b]), articulation).normalize();
        let axe = new THREE.Vector3().crossVectors(dirParent, dirEnfant);
        const deja = Math.asin(Math.min(1, axe.length()));
        if (p.def.pli === 'genou') axe = gauche.clone();
        else if (axe.length() < 0.15) axe = gauche.clone().negate();
        axe.normalize();
        joint = world.createImpulseJoint(RAPIER.JointData.revolute(ancre(parent), ancre(p), axe), parent.corps, p.corps, true);
        const pli = p.def.pli === 'genou' ? 2.4 : 2.5;
        joint.setLimits(-deja - 0.05, pli - deja);
      } else {
        joint = world.createImpulseJoint(RAPIER.JointData.spherical(ancre(parent), ancre(p)), parent.corps, p.corps, true);
      }
      joint.setContactsEnabled(false);
    }

    if (impulsion) {
      parNom.torse.corps.applyImpulse(impulsion, true);
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
    const pos = position(this.os.hanches);
    const devant = devantDuCorps(this.os);
    if (devant.lengthSq() > 0.01) this.racine.rotation.y = Math.atan2(devant.x, devant.z);
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
    this.jouer('colere');
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

    if (this.dureeBulle > 0) {
      this.dureeBulle -= dt;
      position(this.os.tete, this.bulle.position);
      this.bulle.position.y += 0.45;
      this.bulle.visible = this.bulle.position.distanceTo(teteJoueur) < 14;
    } else this.bulle.visible = false;
  }

  // La tête suit le joueur des yeux (rotation limitée et douce), par-dessus l'animation
  tournerTete(dt, teteJoueur) {
    this.regard += ((this.regarde && this.etat !== 'marche' ? 1 : 0) - this.regard) * Math.min(1, dt * 2.5);
    if (this.regard < 0.01) return;
    this.racine.updateMatrixWorld(true);
    const tete = this.os.tete;
    const local = vB.subVectors(teteJoueur, position(tete, vA)).applyQuaternion(qA.copy(this.racine.quaternion).invert());
    const lacet = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -1.0, 1.0) * this.regard;
    const tangage = THREE.MathUtils.clamp(Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.4, 0.4) * this.regard;
    const rotLocale = qB.setFromEuler(new THREE.Euler(-tangage, lacet, 0, 'YXZ'));
    const rotMonde = this.racine.quaternion.clone().multiply(rotLocale).multiply(qA);
    const voulu = rotMonde.multiply(tete.getWorldQuaternion(new THREE.Quaternion()));
    const qParent = tete.parent.getWorldQuaternion(new THREE.Quaternion());
    tete.quaternion.copy(qParent.invert().multiply(voulu));
  }
}

// Pour les tests depuis la console
export const outilsTest = { Personnage, chargeurFBX, ANIMS_ROCKETBOX };
