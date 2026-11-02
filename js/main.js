// Point d'entrée : rendu, contrôles (VR et PC) et boucle de jeu.
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { RAPIER, world, scene, objets, infos, manettes, vibrer, synchroniserObjets, replacer } from './monde.js';
import { MainPhysique } from './mains.js';
import { Joueur } from './joueur.js';
import { construireNiveau } from './niveau.js';

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

scene.background = new THREE.Color(0xa9c8e8);
scene.fog = new THREE.Fog(0xa9c8e8, 25, 60);
scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x6b5a48, 1.1));
const soleil = new THREE.DirectionalLight(0xfff3e0, 2.4);
soleil.position.set(5, 12, 6);
soleil.castShadow = true;
soleil.shadow.mapSize.set(1024, 1024);
Object.assign(soleil.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 35 });
soleil.shadow.camera.updateProjectionMatrix();
soleil.shadow.normalBias = 0.03;
scene.add(soleil);

// --- Joueur : le "rig" contient la caméra (la tête) et les manettes ---
const rig = new THREE.Group();
scene.add(rig);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.03, 100);
camera.position.set(0, 1.65, 0);
rig.add(camera);

const { animations } = construireNiveau();
const joueur = new Joueur(rig, camera, new THREE.Vector3(0, 0, 5));
const mains = { left: new MainPhysique('left'), right: new MainPhysique('right') };
const listeMains = Object.values(mains);

const grips = [0, 1].map((i) => {
  const grip = renderer.xr.getControllerGrip(i);
  grip.addEventListener('connected', (e) => { grip.userData.source = e.data; });
  grip.addEventListener('disconnected', () => { grip.userData.source = null; });
  rig.add(grip);
  return grip;
});

// --- Entrées VR ---
const zoneMorte = (v) => (Math.abs(v) < 0.15 ? 0 : v);

function lireVR() {
  manettes.left = manettes.right = null;
  const e = { stick: { x: 0, y: 0 }, course: false, saut: false, reset: false, tourne: 0,
    serrage: { left: 0, right: 0 }, poses: { left: null, right: null } };
  for (const grip of grips) {
    const src = grip.userData.source;
    if (!src || !(src.handedness in mains)) continue;
    manettes[src.handedness] = src;
    if (grip.visible) e.poses[src.handedness] = grip;
    const gp = src.gamepad;
    if (!gp) continue;
    e.serrage[src.handedness] = gp.buttons[1]?.value ?? 0;
    const x = gp.axes[2] ?? 0, y = gp.axes[3] ?? 0;
    if (src.handedness === 'left') {
      e.stick = { x: zoneMorte(x), y: zoneMorte(y) };
      e.course = !!gp.buttons[3]?.pressed;
    } else {
      e.tourne = x;
      e.saut = !!gp.buttons[4]?.pressed;
      e.reset = !!gp.buttons[5]?.pressed;
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
    tourne: 0,
    serrage: { right: Math.max(souris.right, t('KeyF')), left: Math.max(souris.left, t('KeyG')) },
  };
}

// Sur PC, les mains flottent devant la caméra
const matCam = new THREE.Matrix4();
function posePC(cote, cible) {
  matCam.multiplyMatrices(rig.matrixWorld, camera.matrix);
  cible.pos.set(cote === 'right' ? 0.2 : -0.2, -0.22, -portee).applyMatrix4(matCam);
  cible.quat.setFromRotationMatrix(matCam);
}

const echelle = new THREE.Vector3();
function majCibles(e, enVR) {
  for (const cote of ['left', 'right']) {
    const main = mains[cote];
    if (enVR) {
      const grip = e.poses[cote];
      if (!grip) { main.desactiver(); continue; }
      grip.matrixWorld.decompose(main.cible.pos, main.cible.quat, echelle);
    } else {
      posePC(cote, main.cible);
    }
    main.activer();
  }
}

function toutReplacer() {
  for (const m of listeMains) m.lacher();
  for (const o of objets) replacer(o);
}

renderer.xr.addEventListener('sessionstart', () => { tangage = 0; document.exitPointerLock?.(); });
renderer.xr.addEventListener('sessionend', () => { camera.position.set(0, 1.65, 0); camera.quaternion.identity(); });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- Boucle de jeu ---
const horloge = new THREE.Clock();
const evenements = new RAPIER.EventQueue(true);
const avant = { saut: false, reset: false, tourne: false };
const escalade = new THREE.Vector3(), tmp = new THREE.Vector3();

function boucle(dtImpose) {
  const dt = dtImpose ?? THREE.MathUtils.clamp(horloge.getDelta(), 1 / 120, 1 / 45);
  const enVR = renderer.xr.isPresenting;
  const e = enVR ? lireVR() : lirePC(dt);
  if (!enVR) {
    camera.position.set(0, 1.65, 0);
    camera.rotation.set(tangage, 0, 0);
  }

  // Rotation par crans de 30° (joystick droit)
  if (!avant.tourne && Math.abs(e.tourne) > 0.7) {
    joueur.tourner(-Math.sign(e.tourne) * Math.PI / 6);
    avant.tourne = true;
  } else if (Math.abs(e.tourne) < 0.3) avant.tourne = false;

  // Escalade : les mains accrochées tirent le corps pour que les manettes reviennent sur leur prise
  rig.updateMatrixWorld(true);
  majCibles(e, enVR);
  let accrochees = 0;
  escalade.set(0, 0, 0);
  for (const m of listeMains) {
    if (m.active && m.accroche) { escalade.add(tmp.copy(m.accroche).sub(m.cible.pos)); accrochees++; }
  }

  joueur.maj(dt, { stick: e.stick, course: e.course, saut: e.saut && !avant.saut,
    escalade: accrochees ? escalade.divideScalar(accrochees) : null });

  // Les mains visent la nouvelle position des manettes
  rig.updateMatrixWorld(true);
  majCibles(e, enVR);
  for (const cote of ['left', 'right']) {
    mains[cote].majSerrage(e.serrage[cote]);
    mains[cote].piloter(dt);
  }
  if (e.reset && !avant.reset) toutReplacer();
  avant.saut = e.saut;
  avant.reset = e.reset;

  // Physique
  world.timestep = dt;
  world.step(evenements);
  evenements.drainCollisionEvents((h1, h2, debut) => {
    if (!debut) return;
    for (const h of [h1, h2]) {
      const main = infos.get(h)?.main;
      if (!main) continue;
      const v = main.corps.linvel();
      const vitesse = Math.hypot(v.x, v.y, v.z);
      if (vitesse > 0.4) vibrer(main.cote, Math.min(1, vitesse / 4), 25);
    }
  });

  // Affichage
  synchroniserObjets();
  for (const m of listeMains) m.majVisuel();
  for (const a of animations) a();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(() => boucle());

document.getElementById('chargement')?.remove();
// Outils de test depuis la console : jeu.simuler(72) fait avancer le jeu d'une seconde
window.jeu = { world, joueur, mains, objets, renderer, scene, rig, camera,
  simuler: (images, dt = 1 / 72) => { for (let i = 0; i < images; i++) boucle(dt); } };
