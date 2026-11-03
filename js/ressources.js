// Chargement des ressources réalistes : ciel photo (HDRI), matériaux photo (PBR) et modèles 3D.
// Sources libres : Poly Haven (CC0) et les exemples three.js (Ferrari).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const PH = 'https://dl.polyhaven.org/file/ph-assets/';
const THREE_EXEMPLES = 'https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/models/gltf/';

// Matériaux photo : id Poly Haven, taille réelle d'un motif (m), cartes à charger
export const MATERIAUX_PH = {
  herbe: { id: 'leafy_grass', tuile: 2.5 },
  pave: { id: 'herringbone_pavement', tuile: 2 },
  beton: { id: 'concrete_floor_worn_001', tuile: 3 },
  brique: { id: 'brick_wall_02', tuile: 2.5 },
  platre: { id: 'plastered_wall_04', tuile: 2.5, cartes: ['diff', 'nor_gl'] },
  marbre: { id: 'marble_01', tuile: 2 },
  parquet: { id: 'laminate_floor_02', tuile: 2 },
  plafond: { id: 'ceiling_interior', tuile: 2, cartes: ['diff'] },
  planches: { id: 'brown_planks_05', tuile: 2, cartes: ['diff', 'nor_gl'] },
  betonMur: { id: 'concrete_wall_004', tuile: 3, cartes: ['diff', 'nor_gl'] },
  // Vallée suisse
  roche: { id: 'aerial_rocks_02', tuile: 4, cartes: ['diff', 'nor_gl'] },
  sable: { id: 'gravelly_sand', tuile: 2, cartes: ['diff'] },
  pierre: { id: 'rock_wall_04', tuile: 2, cartes: ['diff', 'nor_gl'] },
  toit: { id: 'clay_roof_tiles_02', tuile: 2, cartes: ['diff', 'nor_gl'] },
};

// Modèles 3D Poly Haven utilisés dans la carte
export const MODELES_PH = [
  'wooden_crate_02', 'Barrel_01', 'old_tyre', 'plastic_crate_02', 'cardboard_box_01',
  'sledgehammer_01', 'wooden_hammer_01', 'baseball_bat', 'football', 'metal_toolbox',
  'painted_wooden_bench', 'wooden_picnic_table', 'potted_plant_04', 'planter_box_01', 'shrub_03',
  'metal_office_desk', 'modern_arm_chair_01', 'Sofa_01', 'Television_01', 'television_02', 'vintage_microwave',
  'metal_trash_can', 'WetFloorSign_01', 'portable_generator', 'street_lamp_02',
];

export const ressources = { modeles: new Map(), materiaux: {}, ferrari: null, environnement: null, ciel: null, normalesEau: null };

const chargeurTextures = new THREE.TextureLoader();
chargeurTextures.setCrossOrigin('anonymous');

function textureAsync(url, couleur) {
  return new Promise((ok) => {
    chargeurTextures.load(url, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      if (couleur) t.colorSpace = THREE.SRGBColorSpace;
      ok(t);
    }, undefined, () => ok(null));
  });
}

async function materiauPH(nom, { id, tuile, cartes = ['diff', 'nor_gl', 'arm'] }) {
  const url = (c) => `${PH}Textures/jpg/1k/${id}/${id}_${c}_1k.jpg`;
  const [diff, nor, arm] = await Promise.all([
    textureAsync(url('diff'), true),
    cartes.includes('nor_gl') ? textureAsync(url('nor_gl')) : null,
    cartes.includes('arm') ? textureAsync(url('arm')) : null,
  ]);
  const m = new THREE.MeshStandardMaterial({ map: diff, normalMap: nor, roughness: 1, metalness: 0 });
  if (arm) { m.aoMap = arm; m.roughnessMap = arm; m.metalnessMap = arm; m.aoMapIntensity = 0.8; }
  else m.roughness = 0.85;
  m.name = nom;
  m.userData.tuile = tuile;
  return m;
}

// Charge tout, en appelant progression(fraction) au fur et à mesure
export async function chargerRessources(renderer, progression = () => {}) {
  const taches = [];
  let finies = 0;
  // Chaque ressource a 40 s maximum : sur une connexion lente, le jeu démarre quand même (avec des remplacements)
  const suivre = (p) => Promise.race([p.catch((e) => console.warn(e)), new Promise((ok) => setTimeout(ok, 40000))])
    .finally(() => progression(++finies / taches.length));

  taches.push(suivre(new RGBELoader().loadAsync(`${PH}HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr`).then((hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    ressources.environnement = pmrem.fromEquirectangular(hdr).texture;
    ressources.ciel = hdr;
    pmrem.dispose();
  }).catch((e) => console.warn('Ciel photo indisponible', e))));

  for (const [nom, def] of Object.entries(MATERIAUX_PH)) {
    taches.push(suivre(materiauPH(nom, def).then((m) => { ressources.materiaux[nom] = m; })));
  }

  // Sur Poly Haven, les textures d'un modèle sont rangées dans Models/jpg/1k/<id>/ et pas à côté du .gltf
  const gestionnaire = new THREE.LoadingManager();
  gestionnaire.setURLModifier((url) => url.replace(/\/Models\/gltf\/1k\/([^/]+)\/textures\//, '/Models/jpg/1k/$1/'));
  const gltf = new GLTFLoader(gestionnaire);
  const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
  gltf.setDRACOLoader(draco);
  for (const id of MODELES_PH) {
    taches.push(suivre(gltf.loadAsync(`${PH}Models/gltf/1k/${id}/${id}_1k.gltf`)
      .then((g) => ressources.modeles.set(id, g.scene))
      .catch((e) => console.warn('Modèle indisponible :', id, e))));
  }

  taches.push(suivre(gltf.loadAsync(THREE_EXEMPLES + 'ferrari.glb').then((g) => { ressources.ferrari = g.scene; })
    .catch((e) => console.warn('Voiture indisponible', e))));
  taches.push(suivre(textureAsync('https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/textures/waternormals.jpg')
    .then((t) => { ressources.normalesEau = t; })));

  await Promise.all(taches);
  return ressources;
}

// Copie d'un modèle, avec ses dimensions (boîte englobante dans son propre repère)
export function copieModele(id, echelle = 1) {
  const source = ressources.modeles.get(id);
  if (!source) return null;
  const copie = source.clone(true);
  copie.scale.multiplyScalar(echelle);
  copie.updateMatrixWorld(true);
  const boite = new THREE.Box3().setFromObject(copie);
  // Les petits objets ne projettent pas d'ombre (gros gain de rapidité sur le Quest, invisible à l'œil)
  const taille = boite.getSize(new THREE.Vector3());
  const ombre = Math.max(taille.x, taille.y, taille.z) > 0.35;
  copie.traverse((o) => { if (o.isMesh) { o.castShadow = ombre; o.receiveShadow = true; } });
  return { modele: copie, boite };
}
