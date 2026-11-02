// Point d'entrée : rendu, contrôles (VR et PC) et boucle de jeu.
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { RAPIER, world, scene, objets, infos, manettes, vibrer, synchroniserObjets, replacer } from './monde.js';
import { MainPhysique, crochets } from './mains.js';
import { Joueur } from './joueur.js';
import { Inventaire } from './inventaire.js';
import { construireCarte } from './carte.js';
import { creerPersonnages } from './personnages.js';
import { jouerSon, majAuditeur } from './sons.js';

// --- Rendu ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const HORIZON = 0xc9dcee;
scene.fog = new THREE.Fog(HORIZON, 45, 170);
scene.background = new THREE.Color(HORIZON);
const toileCiel = document.createElement('canvas');
toileCiel.width = 4; toileCiel.height = 256;
const gc = toileCiel.getContext('2d');
const degrade = gc.createLinearGradient(0, 0, 0, 256);
degrade.addColorStop(0, '#3f78c0'); degrade.addColorStop(0.47, '#c9dcee'); degrade.addColorStop(0.53, '#c9dcee'); degrade.addColorStop(1, '#7d9a6a');
gc.fillStyle = degrade; gc.fillRect(0, 0, 4, 256);
const texCiel = new THREE.CanvasTexture(toileCiel);
texCiel.colorSpace = THREE.SRGBColorSpace;
const ciel = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), new THREE.MeshBasicMaterial({ map: texCiel, side: THREE.BackSide, fog: false, depthWrite: false }));
ciel.renderOrder = -1;
scene.add(ciel);

scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x8f8576, 1.15));
const soleil = new THREE.DirectionalLight(0xfff3e0, 2.4);
soleil.castShadow = true;
soleil.shadow.mapSize.set(1024, 1024);
Object.assign(soleil.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
soleil.shadow.camera.updateProjectionMatrix();
soleil.shadow.normalBias = 0.04;
scene.add(soleil, soleil.target);

// --- Joueur : le "rig" contient la caméra (la tête) et les manettes ---
const rig = new THREE.Group();
scene.add(rig);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.03, 400);
camera.position.set(0, 1.65, 0);
rig.add(camera);

const carte = construireCarte();
const joueur = new Joueur(rig, camera, carte.depart);
const mains = { left: new MainPhysique('left'), right: new MainPhysique('right') };
const listeMains = Object.values(mains);
const inventaire = new Inventaire(rig, camera, listeMains);
crochets.sortir = (main) => inventaire.sortir(main);
crochets.ranger = (main, objet) => inventaire.ranger(main, objet);

let personnages = [];
creerPersonnages(carte.personnages)
  .then((p) => { personnages = p; message('Les habitants du complexe sont arrivés'); })
  .catch((err) => { console.error(err); message('Personnages indisponibles (connexion ?)'); });

const grips = [], rayons = [];
for (let i = 0; i < 2; i++) {
  const grip = renderer.xr.getControllerGrip(i);
  grip.addEventListener('connected', (e) => { grip.userData.source = e.data; });
  grip.addEventListener('disconnected', () => { grip.userData.source = null; });
  const rayon = renderer.xr.getController(i);
  rig.add(grip, rayon);
  grips.push(grip); rayons.push(rayon);
}

// --- Message flottant devant les yeux ---
const toileMsg = document.createElement('canvas');
toileMsg.width = 1024; toileMsg.height = 128;
const texMsg = new THREE.CanvasTexture(toileMsg);
texMsg.colorSpace = THREE.SRGBColorSpace;
const panneauMsg = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.125), new THREE.MeshBasicMaterial({ map: texMsg, transparent: true, depthTest: false }));
panneauMsg.renderOrder = 999;
panneauMsg.visible = false;
scene.add(panneauMsg);
let dureeMsg = 0, placerMsg = false;
function message(texte, duree = 2.5) {
  const g = toileMsg.getContext('2d');
  g.clearRect(0, 0, 1024, 128);
  g.fillStyle = 'rgba(15,20,28,0.85)';
  g.beginPath(); g.roundRect(8, 8, 1008, 112, 40); g.fill();
  g.fillStyle = '#ffffff'; g.font = '44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(texte, 512, 66, 980);
  texMsg.needsUpdate = true;
  dureeMsg = duree; placerMsg = true; panneauMsg.visible = true;
  const aide = document.getElementById('message');
  if (aide) { aide.textContent = texte; aide.style.opacity = 1; clearTimeout(aide._t); aide._t = setTimeout(() => { aide.style.opacity = 0; }, duree * 1000); }
}
const teteMsg = new THREE.Vector3(), devantMsg = new THREE.Vector3(), qMsg = new THREE.Quaternion();
function majMessage(dt) {
  if (dureeMsg <= 0) { panneauMsg.visible = false; return; }
  dureeMsg -= dt;
  joueur.teteMonde(teteMsg);
  qMsg.copy(rig.quaternion).multiply(camera.quaternion);
  devantMsg.set(0, -0.22, -1.3).applyQuaternion(qMsg).add(teteMsg);
  if (placerMsg) { panneauMsg.position.copy(devantMsg); placerMsg = false; }
  else panneauMsg.position.lerp(devantMsg, Math.min(1, dt * 5));
  panneauMsg.lookAt(teteMsg);
}

// --- Entrées VR ---
const zoneMorte = (v) => (Math.abs(v) < 0.15 ? 0 : v);
const mainsVides = () => ({ left: { serrage: 0, gachette: 0, pouce: 0 }, right: { serrage: 0, gachette: 0, pouce: 0 } });

function lireVR() {
  manettes.left = manettes.right = null;
  const e = { stick: { x: 0, y: 0 }, course: false, saut: false, reset: false, retour: false, modeRotation: false,
    tourne: 0, accroupir: 0, mains: mainsVides(), poses: { left: null, right: null }, rayons: { left: null, right: null } };
  for (let i = 0; i < 2; i++) {
    const src = grips[i].userData.source;
    if (!src || !(src.handedness in mains)) continue;
    const cote = src.handedness;
    manettes[cote] = src;
    if (grips[i].visible) e.poses[cote] = grips[i];
    if (rayons[i].visible) e.rayons[cote] = rayons[i];
    const gp = src.gamepad;
    if (!gp) continue;
    const b = (n) => gp.buttons[n];
    e.mains[cote] = { serrage: b(1)?.value ?? 0, gachette: b(0)?.value ?? 0, pouce: b(3)?.touched || b(4)?.touched || b(5)?.touched ? 1 : 0 };
    const x = gp.axes[2] ?? 0, y = gp.axes[3] ?? 0;
    if (cote === 'left') {
      e.stick = { x: zoneMorte(x), y: zoneMorte(y) };
      e.course = !!b(3)?.pressed;
      e.retour = !!b(4)?.pressed;
      e.modeRotation = !!b(5)?.pressed;
    } else {
      e.tourne = Math.abs(y) > 0.6 ? 0 : zoneMorte(x);
      e.accroupir = Math.abs(y) > 0.6 && Math.abs(x) < 0.5 ? Math.sign(y) : 0;
      e.saut = !!b(4)?.pressed;
      e.reset = !!b(5)?.pressed;
    }
  }
  return e;
}

// --- Entrées PC (pour tester sans casque) ---
const touches = new Set();
const souris = { left: 0, right: 0 };
let tangage = 0, portee = 0.5;
const canvas = renderer.domElement;
addEventListener('keydown', (e) => { touches.add(e.code); if (e.code === 'Space') e.preventDefault(); });
addEventListener('keyup', (e) => touches.delete(e.code));
canvas.addEventListener('click', () => {
  if (!renderer.xr.isPresenting && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
});
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  rig.rotation.y -= e.movementX * 0.0022;
  tangage = THREE.MathUtils.clamp(tangage - e.movementY * 0.0022, -1.45, 1.45);
});
addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== canvas) return;
  if (e.button === 0) souris.right = 1;
  if (e.button === 2) souris.left = 1;
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) souris.right = 0;
  if (e.button === 2) souris.left = 0;
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => { portee = THREE.MathUtils.clamp(portee - e.deltaY * 0.0006, 0.3, 1.2); });

function lirePC(dt) {
  const t = (code) => (touches.has(code) ? 1 : 0);
  rig.rotation.y += (t('ArrowLeft') - t('ArrowRight')) * 2 * dt;
  tangage = THREE.MathUtils.clamp(tangage + (t('ArrowUp') - t('ArrowDown')) * 1.5 * dt, -1.45, 1.45);
  return {
    stick: { x: t('KeyD') - t('KeyA'), y: t('KeyS') - t('KeyW') },   // codes physiques : ZQSD en AZERTY
    course: touches.has('ShiftLeft') || touches.has('ShiftRight'),
    saut: touches.has('Space'),
    reset: touches.has('KeyR'),
    retour: touches.has('KeyX'),
    modeRotation: false,
    tourne: 0,
    accroupir: t('KeyC') ? 1 : -1,
    mains: {
      right: { serrage: Math.max(souris.right, t('KeyF')), gachette: t('KeyE'), pouce: 0 },
      left: { serrage: Math.max(souris.left, t('KeyG')), gachette: 0, pouce: 0 },
    },
  };
}

// Sur PC, les mains flottent devant la caméra et visent là où l'on regarde
const matCam = new THREE.Matrix4(), qCam = new THREE.Quaternion();
const MAIN_PC = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const echelle = new THREE.Vector3(), qTmp = new THREE.Quaternion();
const ancienneMain = { left: new THREE.Vector3(), right: new THREE.Vector3() }, vBrute = new THREE.Vector3();

function majCibles(e, enVR, dt, mesurerVitesse) {
  if (!enVR) {
    matCam.multiplyMatrices(rig.matrixWorld, camera.matrix);
    qCam.setFromRotationMatrix(matCam);
  }
  for (const cote of ['left', 'right']) {
    const main = mains[cote];
    if (enVR) {
      const grip = e.poses[cote];
      if (!grip) { main.desactiver(); continue; }
      grip.matrixWorld.decompose(main.cible.pos, main.cible.quat, echelle);
      (e.rayons[cote] ?? grip).matrixWorld.decompose(main.rayon.origine, qTmp, echelle);
      main.rayon.dir.set(0, 0, -1).applyQuaternion(qTmp);
      if (mesurerVitesse) {
        vBrute.copy(grip.position).sub(ancienneMain[cote]).divideScalar(dt).applyQuaternion(rig.quaternion);
        main.vitesseMain.lerp(vBrute, 0.5);
        ancienneMain[cote].copy(grip.position);
      }
      main.modePC = false;
    } else {
      main.cible.pos.set(cote === 'right' ? 0.2 : -0.2, -0.22, -portee).applyMatrix4(matCam);
      main.cible.quat.copy(qCam).multiply(MAIN_PC);   // poignet vers soi, doigts vers l'avant, pouce en haut
      main.rayon.origine.setFromMatrixPosition(matCam);
      main.rayon.dir.set(0, 0, -1).applyQuaternion(qCam);
      main.vitesseMain.set(0, 0, 0);
      main.modePC = true;
    }
    main.activer();
  }
}

function toutReplacer() {
  for (const m of listeMains) m.lacher();
  inventaire.vider();
  for (const o of objets) replacer(o);
  message('Tous les objets sont revenus à leur place');
}

renderer.xr.addEventListener('sessionstart', () => { tangage = 0; document.exitPointerLock?.(); message('Bienvenue au Complexe Delta !', 4); });
renderer.xr.addEventListener('sessionend', () => { camera.position.set(0, 1.65, 0); camera.quaternion.identity(); });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- Boucle de jeu ---
const horloge = new THREE.Clock();
const evenements = new RAPIER.EventQueue(true);
const avant = { saut: false, reset: false, retour: false, modeRotation: false, tourne: false };
const escalade = new THREE.Vector3(), tmp = new THREE.Vector3(), tete = new THREE.Vector3();
let rotationFluide = false, accroupi = 0;
let images = 0, chrono = 0, ips = 0;

function boucle(dtImpose) {
  const dt = dtImpose ?? THREE.MathUtils.clamp(horloge.getDelta(), 1 / 120, 1 / 45);
  const enVR = renderer.xr.isPresenting;
  const e = enVR ? lireVR() : lirePC(dt);
  if (!enVR) {
    camera.position.set(0, 1.65, 0);
    camera.rotation.set(tangage, 0, 0);
  }

  // Boutons
  if (e.modeRotation && !avant.modeRotation) {
    rotationFluide = !rotationFluide;
    message(rotationFluide ? 'Rotation fluide' : 'Rotation par crans');
  }
  if (e.retour && !avant.retour) { joueur.reapparaitre(); message('Retour au hall'); }
  if (e.reset && !avant.reset) toutReplacer();
  accroupi = THREE.MathUtils.clamp(accroupi + e.accroupir * 1.6 * dt, 0, 0.7);

  // Rotation (joystick droit)
  if (rotationFluide) { if (e.tourne) joueur.tourner(-e.tourne * 2.6 * dt); }
  else if (!avant.tourne && Math.abs(e.tourne) > 0.7) { joueur.tourner(-Math.sign(e.tourne) * Math.PI / 6); avant.tourne = true; }
  else if (Math.abs(e.tourne) < 0.3) avant.tourne = false;

  // Escalade : les mains accrochées tirent le corps pour que les manettes reviennent sur leur prise
  rig.updateMatrixWorld(true);
  majCibles(e, enVR, dt, true);
  let accrochees = 0;
  escalade.set(0, 0, 0);
  for (const m of listeMains) {
    if (m.active && m.accroche) { escalade.add(tmp.copy(m.accroche).sub(m.cible.pos)); accrochees++; }
  }
  joueur.maj(dt, { stick: e.stick, course: e.course, saut: e.saut && !avant.saut, accroupi,
    escalade: accrochees ? escalade.divideScalar(accrochees) : null });

  // Les mains visent la nouvelle position des manettes
  rig.updateMatrixWorld(true);
  majCibles(e, enVR, dt, false);
  inventaire.maj(dt, enVR);
  for (const cote of ['left', 'right']) {
    const m = mains[cote];
    if (!m.active) continue;
    m.majEntrees(e.mains[cote]);
    m.majAttraction(dt);
    m.piloter(dt);
  }
  joueur.teteMonde(tete);
  for (const p of personnages) p.maj(dt, tete);
  Object.assign(avant, { saut: e.saut, reset: e.reset, retour: e.retour, modeRotation: e.modeRotation });

  // Physique
  world.timestep = dt;
  world.step(evenements);
  evenements.drainCollisionEvents((h1, h2, debut) => {
    if (!debut) return;
    const i1 = infos.get(h1), i2 = infos.get(h2);
    for (const [a, b] of [[i1, i2], [i2, i1]]) {
      if (!a?.main) continue;
      const v = a.main.corps.linvel();
      const vitesse = Math.hypot(v.x, v.y, v.z);
      if (vitesse > 0.4) vibrer(a.main.cote, Math.min(1, vitesse / 4), 25);
      if (b?.pnj) b.pnj.pousse(new THREE.Vector3(v.x, v.y, v.z));
    }
  });
  evenements.drainContactForceEvents((ev) => {
    const i1 = infos.get(ev.collider1()), i2 = infos.get(ev.collider2());
    for (const [a, b] of [[i1, i2], [i2, i1]]) {
      if (a?.pnj && b?.objet && !b.objet.ragdoll) {
        const v = b.objet.corps.linvel();
        a.pnj.impact(b.objet, new THREE.Vector3(v.x, v.y, v.z));
      }
    }
    const o1 = i1?.objet, o2 = i2?.objet;
    const o = o1 && o2 ? (o1.masse < o2.masse ? o1 : o2) : (o1 ?? o2);
    if (!o) return;
    const maintenant = performance.now();
    if (maintenant - (o.dernierSon ?? 0) < 70) return;
    const intensite = THREE.MathUtils.clamp((ev.totalForceMagnitude() / (o.masse * 9.81) - 3) / 25, 0, 1);
    if (intensite < 0.03) return;
    o.dernierSon = maintenant;
    jouerSon(o.son, o.corps.translation(), intensite);
  });

  // Affichage
  synchroniserObjets();
  inventaire.afficher();
  for (const m of listeMains) m.majVisuel();
  for (const p of personnages) p.majVisuel(dt, tete);
  for (const a of carte.animations) a();
  joueur.pieds(tmp);
  soleil.position.set(Math.round(tmp.x) + 8, 22, Math.round(tmp.z) + 12);
  soleil.target.position.set(Math.round(tmp.x), 0, Math.round(tmp.z));
  soleil.target.updateMatrixWorld();
  ciel.position.copy(tete);
  majMessage(dt);
  renderer.render(scene, camera);
  majAuditeur(camera);

  images++; chrono += dt;
  if (chrono >= 1) { ips = Math.round(images / chrono); images = 0; chrono = 0; }
}
renderer.setAnimationLoop(() => boucle());

document.getElementById('chargement')?.remove();
// Outils de test depuis la console : jeu.simuler(72) fait avancer le jeu d'une seconde
window.jeu = {
  world, joueur, mains, objets, renderer, scene, rig, camera, inventaire, message,
  get personnages() { return personnages; },
  get ips() { return ips; },
  simuler: (n, dt = 1 / 72) => { for (let i = 0; i < n; i++) boucle(dt); },
};
