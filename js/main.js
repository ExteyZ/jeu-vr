// Point d'entrée : rendu, contrôles (VR et PC) et boucle de jeu.
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { RAPIER, world, scene, objets, infos, manettes, vibrer, synchroniserObjets, replacer, masquerLointains, majSolides } from './monde.js';
import { MainPhysique, crochets, piloterObjetsTenus } from './mains.js';
import { Joueur } from './joueur.js';
import { Inventaire } from './inventaire.js';
import { construireCarte } from './carte.js';
import { creerPersonnages } from './personnages.js';
import { jouerSon, majAuditeur } from './sons.js';
import { chargerRessources, ressources } from './ressources.js';
import { construireTerrain, hauteur, NIVEAU_LAC, VILLAGE } from './terrain.js';
import { construireEau, animerEau, flotter, dansLeLac, capturerReflets, horsReflet } from './eau.js';
import { construireVillage } from './village.js';
import { Pouvoirs } from './pouvoirs.js';
import { Interface } from './interface.js';
import { majEffets } from './effets.js';
import { creerCatalogue } from './catalogue.js';
import { PROFIL, ULTRA } from './profil.js';
import { construireForet, majForet } from './arbres.js';
import { construireHerbe, majHerbe } from './herbe.js';
import { construireSousBois, majSousBois } from './sousbois.js';

// --- Rendu ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
if (ULTRA) renderer.shadowMap.type = THREE.PCFSoftShadowMap;   // ombres aux bords doux (carte graphique du PC)
renderer.toneMapping = THREE.ACESFilmicToneMapping;   // rendu "photo" : hautes lumières douces
renderer.toneMappingExposure = 0.9;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const HORIZON = 0xc9dcee;
scene.fog = new THREE.Fog(HORIZON, ULTRA ? 110 : 180, ULTRA ? 3600 : 5200);   // brume : les montagnes lointaines bleuissent
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

// Ciel photo (HDRI), matériaux et modèles réalistes
const ecranChargement = document.getElementById('chargement');
await chargerRessources(renderer, (f) => {
  if (ecranChargement) ecranChargement.textContent = `Chargement de la vallée… ${Math.round(f * 100)} %`;
});
const ambiance = new THREE.HemisphereLight(0xeaf2ff, 0x8f8576, 1.15);
if (ressources.environnement) {
  scene.environment = ressources.environnement;   // reflets et lumière ambiante venant du vrai ciel
  scene.background = ressources.ciel;
  scene.fog.color.set(ULTRA ? 0xb6c6d6 : 0xc3d0dc);
  ciel.visible = false;
  ambiance.intensity = 0.35;
}
scene.add(ambiance);
// Lampes intérieures (sans ombres, pour rester fluide sur le Quest)
const lampeHall = new THREE.PointLight(0xfff0d8, 22, 16, 1.6);
lampeHall.position.set(0, 4.1, 16);
const lampeEntrepot = new THREE.PointLight(0xfff0d8, 40, 24, 1.6);
lampeEntrepot.position.set(-23, 6.4, 0);
scene.add(lampeHall, lampeEntrepot);
const soleil = new THREE.DirectionalLight(0xfff3e0, 2.8);
soleil.castShadow = true;
const OMBRE = PROFIL.ombre;
soleil.shadow.mapSize.setScalar(OMBRE.taille);
Object.assign(soleil.shadow.camera, { left: -OMBRE.portee, right: OMBRE.portee, top: OMBRE.portee, bottom: -OMBRE.portee, near: 1, far: 260 });
soleil.shadow.camera.updateProjectionMatrix();
soleil.shadow.normalBias = ULTRA ? 0.03 : 0.04;
if (ULTRA) soleil.shadow.radius = 2;
scene.add(soleil, soleil.target);
// Direction du soleil (vers le soleil), et repère de la "caméra d'ombre" pour l'aligner sur ses pixels (pas de scintillement)
const DIR_SOLEIL = new THREE.Vector3(0.42, 0.72, 0.55).normalize();
const axeDroite = new THREE.Vector3().crossVectors(DIR_SOLEIL, new THREE.Vector3(0, 1, 0)).normalize();
const axeHaut = new THREE.Vector3().crossVectors(axeDroite, DIR_SOLEIL).normalize();
const centreOmbre = new THREE.Vector3();
function placerSoleil(pos) {
  const texel = (2 * soleil.shadow.camera.right) / soleil.shadow.mapSize.x;
  const a = Math.round(pos.dot(axeDroite) / texel) * texel, b = Math.round(pos.dot(axeHaut) / texel) * texel, c = pos.dot(DIR_SOLEIL);
  centreOmbre.copy(axeDroite).multiplyScalar(a).addScaledVector(axeHaut, b).addScaledVector(DIR_SOLEIL, c);
  soleil.target.position.copy(centreOmbre);
  soleil.position.copy(centreOmbre).addScaledVector(DIR_SOLEIL, 120);
  soleil.target.updateMatrixWorld();
}

// --- Joueur : le "rig" contient la caméra (la tête) et les manettes ---
const rig = new THREE.Group();
scene.add(rig);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 7000);
camera.position.set(0, 1.65, 0);
rig.add(camera);

// La vallée suisse (relief, forêts, lac), puis le complexe et le village
const P = ressources.materiaux;
const SOLS = { herbe: 0x5d7a3a, solVert: 0x5f6b3c, foret: 0x5a4632, mousse: 0x5d6a45, roche: 0x8a8580, neige: 0xf2f4f8, galets: 0x8c8478 };
const sols = {};
for (const [nom, couleur] of Object.entries(SOLS)) {
  if (P[nom]?.map) { sols[nom] = P[nom]; continue; }
  const t = new THREE.DataTexture(new Uint8Array([...new THREE.Color(couleur).toArray().map((v) => v * 255), 255]), 1, 1);
  t.needsUpdate = true;
  sols[nom] = { map: t, normalMap: null };   // couleur unie si la photo n'a pas pu être chargée
}
construireTerrain(sols);
construireEau(ressources.normalesEau);
if (ecranChargement) ecranChargement.textContent = 'Plantation de la forêt…';
await new Promise((ok) => setTimeout(ok, 30));
construireForet(renderer);
construireHerbe();
await construireSousBois().catch((e) => console.warn('Sous-bois indisponible', e));
const carte = construireCarte();
construireVillage();
const joueur = new Joueur(rig, camera, carte.depart);
const mains = { left: new MainPhysique('left'), right: new MainPhysique('right') };
const listeMains = Object.values(mains);

// --- Cadran au poignet gauche : images par seconde (pour vérifier la fluidité dans le casque) ---
const toileCadran = document.createElement('canvas');
toileCadran.width = 256; toileCadran.height = 96;
const texCadran = new THREE.CanvasTexture(toileCadran);
texCadran.colorSpace = THREE.SRGBColorSpace;
const cadran = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.03), new THREE.MeshBasicMaterial({ map: texCadran, transparent: true }));
cadran.position.set(-0.047, 0.085, 0.005);
cadran.rotation.y = -Math.PI / 2;
mains.left.visuel.groupe.add(cadran);
function majCadran() {
  const g = toileCadran.getContext('2d');
  g.clearRect(0, 0, 256, 96);
  g.fillStyle = 'rgba(10,14,20,0.85)';
  g.beginPath(); g.roundRect(0, 0, 256, 96, 24); g.fill();
  g.fillStyle = ips >= 68 ? '#5be37d' : ips >= 55 ? '#f2b134' : '#ff6b6b';
  g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(`${ips} i/s`, 128, 50);
  texCadran.needsUpdate = true;
}

// --- Qualité automatique : si le casque n'arrive pas à suivre 3 secondes de suite, on allège ---
// Niveaux : 0 = tout (ombres fines, lampes), 1 = lampes coupées et ombres plus grossières, 2 = sans ombres
let qualite = 0, secondesLentes = 0, qualiteChoisie = 'auto';
function appliquerQualite(niveau) {
  if (niveau === qualite) return;
  const ombresAvant = renderer.shadowMap.enabled;
  qualite = niveau;
  lampeHall.visible = lampeEntrepot.visible = niveau === 0;
  soleil.shadow.mapSize.setScalar(niveau === 0 ? OMBRE.taille : OMBRE.taille / 2);
  soleil.shadow.map?.dispose();
  soleil.shadow.map = null;
  renderer.shadowMap.enabled = niveau < 2;
  if (renderer.shadowMap.enabled !== ombresAvant) scene.traverse((o) => { if (o.material) [o.material].flat().forEach((m) => { m.needsUpdate = true; }); });
}
function qualiteAuto(enVR) {
  if (!enVR || qualiteChoisie !== 'auto') return;
  secondesLentes = ips < 62 ? secondesLentes + 1 : 0;
  if (secondesLentes < 3 || qualite >= 2) return;
  secondesLentes = 0;
  appliquerQualite(qualite + 1);
  message(qualite === 1 ? 'Qualité réduite pour rester fluide' : 'Ombres coupées pour rester fluide');
}
function choisirQualite(q) {
  qualiteChoisie = q;
  secondesLentes = 0;
  appliquerQualite(q === 'basse' ? 2 : 0);
}
const inventaire = new Inventaire(rig, camera, listeMains);
crochets.sortir = (main) => inventaire.sortir(main);
crochets.ranger = (main, objet) => inventaire.ranger(main, objet);

let personnages = [];
creerPersonnages(carte.personnages)
  .then((p) => { personnages = p; message('Les habitants du complexe sont arrivés'); })
  .catch((err) => { console.error(err); message('Personnages indisponibles (connexion ?)'); });

// --- Super-pouvoirs et panneau d'interface (inventaire, pouvoirs, options) ---
const pouvoirs = new Pouvoirs({ joueur, mains, personnages: () => personnages });
const catalogue = creerCatalogue(joueur);
const interfaceVR = new Interface({ joueur, camera, rig, mains, inventaire, pouvoirs, catalogue, actions: {
  message,
  rotation: (mode) => { rotationFluide = mode === 'fluide'; },
  qualite: choisirQualite,
  replacer: () => toutReplacer(),
  teleporter,
} });

// Destinations de téléportation (le sommet est le plus haut pic de la zone détaillée de la vallée)
const sommet = { x: 0, y: 0, z: 0 };
const VOISINS = [[16, 0], [-16, 0], [0, 16], [0, -16], [12, 12], [-12, 12], [12, -12], [-12, -12]];
for (let x = -740; x <= 740; x += 8) for (let z = -940; z <= 540; z += 8) {
  const y = hauteur(x, z);
  if (y > sommet.y && VOISINS.every(([dx, dz]) => hauteur(x + dx, z + dz) <= y)) Object.assign(sommet, { x, y, z });
}
const DESTINATIONS = {
  hall: { nom: 'Hall du complexe', pos: () => [carte.depart.x, 0, carte.depart.z] },
  ponton: { nom: 'Ponton du lac', pos: () => [40, NIVEAU_LAC + 0.78, -240] },
  village: { nom: 'Village', pos: () => [VILLAGE.x, hauteur(VILLAGE.x, VILLAGE.z - 6), VILLAGE.z - 6] },
  sommet: { nom: `Sommet (${Math.round(sommet.y)} m)`, pos: () => [sommet.x, sommet.y + 0.3, sommet.z] },
};
function teleporter(id) {
  for (const m of listeMains) m.lacher();
  pouvoirs.lacherTout();
  joueur.teleporter(...DESTINATIONS[id].pos());
  message(DESTINATIONS[id].nom);
}

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
    ouvrirInventaire: false, ouvrirPouvoirs: false, ouvrirOptions: false, basculer: false, clic: false,
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
      e.ouvrirPouvoirs = !!b(4)?.pressed;     // X
      e.ouvrirInventaire = !!b(5)?.pressed;   // Y
    } else {
      e.tourne = Math.abs(y) > 0.6 ? 0 : zoneMorte(x);
      e.accroupir = Math.abs(y) > 0.6 && Math.abs(x) < 0.5 ? Math.sign(y) : 0;
      e.saut = !!b(4)?.pressed;               // A
      e.basculer = !!b(5)?.pressed;           // B : pouvoir activé / coupé
      e.clic = (b(0)?.value ?? 0) > 0.6;      // gâchette droite : cliquer sur le panneau
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
    ouvrirInventaire: touches.has('KeyI'),
    ouvrirPouvoirs: touches.has('KeyP'),
    ouvrirOptions: touches.has('KeyO'),
    basculer: touches.has('KeyB'),
    clic: touches.has('KeyE') || souris.right > 0,
    tourne: 0,
    accroupir: t('KeyC') ? 1 : -1,
    mains: {
      right: { serrage: Math.max(souris.right, t('KeyF')), gachette: t('KeyE'), pouce: 0 },
      left: { serrage: Math.max(souris.left, t('KeyG')), gachette: t('KeyQ'), pouce: 0 },   // Q = touche A en AZERTY
    },
  };
}

// Sur PC, les mains flottent devant la caméra et visent là où l'on regarde
const matCam = new THREE.Matrix4(), qCam = new THREE.Quaternion();
const MAIN_PC = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const ciblesForcees = { left: null, right: null };   // outil de test : place une main où l'on veut
const echelle = new THREE.Vector3(), qTmp = new THREE.Quaternion();
const ancienneMain = { left: new THREE.Vector3(), right: new THREE.Vector3() }, vBrute = new THREE.Vector3();
// La poignée de la manette est inclinée par rapport à l'avant-bras : on redresse la main de cet angle,
// mesuré entre le repère "grip" et la direction où pointe la manette (environ 45° sur Quest)
const inclinaison = { left: 0.75, right: 0.75 };
const AXE_X = new THREE.Vector3(1, 0, 0), qIncl = new THREE.Quaternion(), qGrip = new THREE.Quaternion(), dRayon = new THREE.Vector3();

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
      grip.matrixWorld.decompose(main.cible.pos, qGrip, echelle);
      (e.rayons[cote] ?? grip).matrixWorld.decompose(main.rayon.origine, qTmp, echelle);
      main.rayon.dir.set(0, 0, -1).applyQuaternion(qTmp);
      if (e.rayons[cote]) {
        dRayon.copy(main.rayon.dir).applyQuaternion(qIncl.copy(qGrip).invert());
        const a = Math.atan2(-dRayon.z, -dRayon.y);
        if (Number.isFinite(a)) inclinaison[cote] += (THREE.MathUtils.clamp(a, 0, 1.2) - inclinaison[cote]) * 0.1;
      }
      main.cible.quat.copy(qGrip).multiply(qIncl.setFromAxisAngle(AXE_X, inclinaison[cote]));
      if (mesurerVitesse) {
        vBrute.copy(grip.position).sub(ancienneMain[cote]).divideScalar(dt).applyQuaternion(rig.quaternion);
        main.vitesseMain.lerp(vBrute, 0.5);
        ancienneMain[cote].copy(grip.position);
      }
      main.modePC = false;
    } else if (ciblesForcees[cote]) {
      main.cible.pos.copy(ciblesForcees[cote].pos);
      main.cible.quat.copy(ciblesForcees[cote].quat);
      main.vitesseMain.set(0, 0, 0);
      main.modePC = true;
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
  pouvoirs.lacherTout();
  inventaire.vider();
  catalogue.vider();   // les objets apparus depuis l'inventaire disparaissent
  for (const o of objets) replacer(o);
  message('Tous les objets sont revenus à leur place');
}

// Sous l'eau : brume verte et courte portée
const BRUME_EAU = new THREE.Color(0x163f4a);
const brumeAir = { couleur: new THREE.Color(), near: 0, far: 0, fond: null, ciel: false };
let sousLEau = false;
function majSousEau(t) {
  const dessous = t.y < NIVEAU_LAC - 0.05 && dansLeLac(t.x, t.z);
  if (dessous === sousLEau) return;
  sousLEau = dessous;
  if (dessous) {
    Object.assign(brumeAir, { near: scene.fog.near, far: scene.fog.far, fond: scene.background, ciel: ciel.visible });
    brumeAir.couleur.copy(scene.fog.color);
    scene.fog.color.copy(BRUME_EAU); scene.fog.near = 0.3; scene.fog.far = 24;
    scene.background = BRUME_EAU; ciel.visible = false;
  } else {
    scene.fog.color.copy(brumeAir.couleur); scene.fog.near = brumeAir.near; scene.fog.far = brumeAir.far;
    scene.background = brumeAir.fond; ciel.visible = brumeAir.ciel;
  }
}

renderer.xr.addEventListener('sessionstart', () => { tangage = 0; document.exitPointerLock?.(); message('Bienvenue ! Y : inventaire   X : super-pouvoirs', 5); });
renderer.xr.addEventListener('sessionend', () => { camera.position.set(0, 1.65, 0); camera.quaternion.identity(); });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- Boucle de jeu ---
const horloge = new THREE.Clock();
const evenements = new RAPIER.EventQueue(true);
const avant = { saut: false, reset: false, retour: false, modeRotation: false, tourne: false,
  ouvrirInventaire: false, ouvrirPouvoirs: false, ouvrirOptions: false, basculer: false, clic: false };
const AUCUNE_GACHETTE = { left: 0, right: 0 };
const escalade = new THREE.Vector3(), tmp = new THREE.Vector3(), tete = new THREE.Vector3();
let rotationFluide = false, accroupi = 0;
let images = 0, debutMesure = performance.now(), ips = 0, tempsJeu = 0;

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
  if (e.retour && !avant.retour) teleporter('hall');
  if (e.reset && !avant.reset) toutReplacer();
  for (const [cle, onglet] of [['ouvrirInventaire', 'inventaire'], ['ouvrirPouvoirs', 'pouvoirs'], ['ouvrirOptions', 'options']]) {
    if (e[cle] && !avant[cle]) { interfaceVR.basculer(onglet); if (interfaceVR.ouvert) pouvoirs.lacherTout(); }
  }
  if (e.basculer && !avant.basculer) { pouvoirs.basculer(); message(`Pouvoir : ${pouvoirs.nom()}`); }
  // Panneau ouvert : la gâchette droite sert à cliquer, pas à utiliser un objet ni un pouvoir
  const clicPanneau = interfaceVR.ouvert && e.clic && !avant.clic;
  if (interfaceVR.ouvert) e.mains.right.gachette = 0;
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
  const effet = pouvoirs.maj(dt, interfaceVR.ouvert ? AUCUNE_GACHETTE : { left: e.mains.left.gachette, right: e.mains.right.gachette });
  joueur.maj(dt, { stick: e.stick, course: e.course, saut: e.saut && !avant.saut, accroupi,
    escalade: accrochees ? escalade.divideScalar(accrochees) : null, ...effet });

  // Les mains visent la nouvelle position des manettes
  rig.updateMatrixWorld(true);
  majCibles(e, enVR, dt, false);
  interfaceVR.maj(mains.right.rayon, clicPanneau);
  inventaire.maj(dt, enVR);
  for (const cote of ['left', 'right']) {
    const m = mains[cote];
    if (!m.active) continue;
    m.majEntrees(e.mains[cote]);
    m.majAttraction(dt);
    m.piloter(dt);
  }
  piloterObjetsTenus(dt);
  joueur.teteMonde(tete);
  for (const p of personnages) p.maj(dt, tete);
  Object.assign(avant, { saut: e.saut, reset: e.reset, retour: e.retour, modeRotation: e.modeRotation, ouvrirInventaire: e.ouvrirInventaire,
    ouvrirPouvoirs: e.ouvrirPouvoirs, ouvrirOptions: e.ouvrirOptions, basculer: e.basculer, clic: e.clic });

  // Physique
  // Flottaison dans le lac (objets et corps tombés)
  for (const o of objets) if (!o.range && o.volume) flotter(o.corps, o.volume, dt, o);
  for (const p of personnages) if (p.parties) for (const part of p.parties) flotter(part.corps, part.volume, dt, part);
  tempsJeu += dt;

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
  placerSoleil(tmp);
  majForet(tete, tempsJeu);
  majHerbe(tempsJeu, tete, tmp);
  if (images % 4 === 0) majSousBois(tete);
  if (images % 4 === 2) majSolides(tmp);
  soleil.target.updateMatrixWorld();
  ciel.position.copy(tete);
  majMessage(dt);
  majEffets(dt);
  majSousEau(tete);
  if (images % 6 === 0) masquerLointains(tete);
  animerEau(tempsJeu);
  renderer.render(scene, camera);
  majAuditeur(camera);

  // Images par seconde mesurées en temps réel (le pas de physique, lui, est plafonné)
  images++;
  const maintenantMs = performance.now();
  if (maintenantMs - debutMesure >= 1000) {
    ips = Math.round((images * 1000) / (maintenantMs - debutMesure));
    images = 0;
    debutMesure = maintenantMs;
    majCadran();
    qualiteAuto(enVR);
  }
}
// Avant de commencer : on envoie toutes les textures à la carte graphique et on prépare tous les matériaux,
// sinon le jeu se figerait une fraction de seconde la première fois qu'on regarde quelque chose de nouveau
if (ecranChargement) ecranChargement.textContent = 'Préparation des graphismes…';
await new Promise((ok) => setTimeout(ok, 30));
for (const m of listeMains) horsReflet.add(m.visuel.groupe);
capturerReflets(renderer);
const texturesVues = new Set();
scene.traverse((o) => {
  for (const m of [o.material, o.customDepthMaterial].flat()) {
    if (!m) continue;
    for (const v of Object.values(m)) if (v?.isTexture && !texturesVues.has(v)) { texturesVues.add(v); renderer.initTexture(v); }
  }
});
try { await renderer.compileAsync(scene, camera); } catch (e) { console.warn(e); }
renderer.setAnimationLoop(() => boucle());

document.getElementById('chargement')?.remove();
// Outils de test depuis la console : jeu.simuler(72) fait avancer le jeu d'une seconde
window.jeu = {
  world, joueur, mains, objets, renderer, scene, rig, camera, inventaire, message, pouvoirs, interface: interfaceVR, catalogue, teleporter, sommet,
  get personnages() { return personnages; },
  get ips() { return ips; },
  simuler: (n, dt = 1 / 72) => { for (let i = 0; i < n; i++) boucle(dt); },
  // jeu.forcerCible('right', {x,y,z}, quaternion) ; jeu.forcerCible('right', null) pour revenir à la normale
  forcerCible: (cote, pos, quat = qCam.clone().multiply(MAIN_PC)) => {
    ciblesForcees[cote] = pos ? { pos: new THREE.Vector3(pos.x, pos.y, pos.z), quat: new THREE.Quaternion().copy(quat) } : null;
  },
};
