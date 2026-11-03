// Chargement des ressources réalistes : ciel photo (HDRI), matériaux photo (PBR) et modèles 3D.
// Sources libres : Poly Haven (CC0) et les exemples three.js (Ferrari).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { PROFIL, ULTRA } from './profil.js';

const PH = 'https://dl.polyhaven.org/file/ph-assets/';
const RES = PROFIL.textures;
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
  // Vallée suisse : les sols du relief
  solVert: { id: 'forrest_ground_01', tuile: 3, cartes: ['diff', 'nor_gl'] },
  foret: { id: 'forest_ground_04', tuile: 2.5, cartes: ['diff', 'nor_gl'] },
  mousse: { id: 'rocky_terrain_02', tuile: 4, cartes: ['diff', 'nor_gl'] },
  roche: { id: 'marble_cliff_05', tuile: 6, cartes: ['diff', 'nor_gl'] },   // calcaire gris des falaises
  neige: { id: 'snow_02', tuile: 3, cartes: ['diff'] },
  galets: { id: 'dry_river_pebbles', tuile: 2, cartes: ['diff'] },
  // Écorce des sapins, pierre et tuiles des chalets
  ecorce: { id: 'pine_bark', tuile: 1.5 },
  pierre: { id: 'rock_wall_04', tuile: 2, cartes: ['diff', 'nor_gl'] },
  toit: { id: 'clay_roof_tiles_02', tuile: 2, cartes: ['diff', 'nor_gl'] },
};

// Plantes, rochers et bois morts Poly Haven pour le sous-bois (textures 1k : ils sont nombreux)
export const NATURE_PH = [
  'fern_02', 'shrub_04', 'nettle_plant', 'weed_plant_02', 'dandelion_01',
  'rock_moss_set_01', 'rock_moss_set_02', 'rock_07', 'rock_09', 'boulder_01', 'rock_face_01', 'rock_face_02',
  'tree_stump_01', 'tree_stump_02', 'dead_tree_trunk', 'dry_branches_medium_01', 'pine_roots',
];

// Modèles 3D Poly Haven utilisés dans la carte
export const MODELES_PH = [
  'wooden_crate_02', 'Barrel_01', 'old_tyre', 'plastic_crate_02', 'cardboard_box_01',
  'sledgehammer_01', 'wooden_hammer_01', 'baseball_bat', 'football', 'metal_toolbox',
  'painted_wooden_bench', 'wooden_picnic_table', 'potted_plant_04', 'planter_box_01', 'shrub_03',
  'metal_office_desk', 'modern_arm_chair_01', 'Sofa_01', 'Television_01', 'television_02', 'vintage_microwave',
  'metal_trash_can', 'WetFloorSign_01', 'portable_generator', 'street_lamp_02',
];

export const ressources = { modeles: new Map(), nature: new Map(), materiaux: {}, ferrari: null, environnement: null, ciel: null,
  normalesEau: null, rameaux: null };

const chargeurTextures = new THREE.TextureLoader();
chargeurTextures.setCrossOrigin('anonymous');

function textureAsync(url, couleur) {
  return new Promise((ok) => {
    chargeurTextures.load(url, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = ULTRA ? 8 : 4;
      if (couleur) t.colorSpace = THREE.SRGBColorSpace;
      ok(t);
    }, undefined, () => ok(null));
  });
}

async function materiauPH(nom, { id, tuile, cartes = ['diff', 'nor_gl', 'arm'] }) {
  const url = (c) => `${PH}Textures/jpg/${RES}/${id}/${id}_${c}_${RES}.jpg`;
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

// Ciel photo : ciel bleu dégagé de fin de matinée (soleil assez haut, les falaises sont bien éclairées)
const CIEL = 'qwantani_mid_morning_puresky';

// Le soleil est le point le plus lumineux du ciel photo : on en déduit sa direction, pour que les ombres du jeu
// tombent dans le même sens que la lumière du ciel
function trouverSoleil(hdr) {
  try {
    const { data, width: L, height: H } = hdr.image;
    const lire = data instanceof Uint16Array ? (i) => THREE.DataUtils.fromHalfFloat(data[i]) : (i) => data[i];
    let max = -1, meilleur = 0;
    for (let y = 0; y < H / 2; y += 2) for (let x = 0; x < L; x += 2) {
      const i = (y * L + x) * 4, lum = lire(i) * 0.2126 + lire(i + 1) * 0.7152 + lire(i + 2) * 0.0722;
      if (lum > max) { max = lum; meilleur = y * L + x; }
    }
    const u = ((meilleur % L) + 0.5) / L, v = 1 - (Math.floor(meilleur / L) + 0.5) / H;   // image retournée (flipY)
    const theta = (u - 0.5) * 2 * Math.PI, lat = (v - 0.5) * Math.PI;
    const d = new THREE.Vector3(Math.cos(theta) * Math.cos(lat), Math.sin(lat), Math.sin(theta) * Math.cos(lat));
    return d.y > 0.25 ? d.normalize() : null;
  } catch {
    return null;
  }
}

// Charge tout, en appelant progression(fraction) au fur et à mesure
export async function chargerRessources(renderer, progression = () => {}) {
  const taches = [];
  let finies = 0;
  // Chaque ressource a 40 s maximum : sur une connexion lente, le jeu démarre quand même (avec des remplacements)
  const suivre = (p) => Promise.race([p.catch((e) => console.warn(e)), new Promise((ok) => setTimeout(ok, 40000))])
    .finally(() => progression(++finies / taches.length));

  taches.push(suivre(new RGBELoader().loadAsync(`${PH}HDRIs/hdr/${PROFIL.ciel}/${CIEL}_${PROFIL.ciel}.hdr`).then((hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    ressources.directionSoleil = trouverSoleil(hdr);
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

  for (const id of NATURE_PH) {
    taches.push(suivre(gltf.loadAsync(`${PH}Models/gltf/1k/${id}/${id}_1k.gltf`)
      .then((g) => ressources.nature.set(id, g.scene))
      .catch((e) => console.warn('Plante ou rocher indisponible :', id, e))));
  }
  // Rameaux de sapin (planche de 7 rameaux photo, avec transparence et relief) : on en fabrique les sapins
  const rameau = (c) => `${PH}Models/jpg/${RES}/fir_tree_01/fir_tree_01_twig_${c}_${RES}.jpg`;
  taches.push(suivre(Promise.all([textureAsync(rameau('diff'), true), textureAsync(rameau('nor_gl')), textureAsync(rameau('alpha'))])
    .then(([couleur, normales, alpha]) => {
      if (!couleur || !alpha) return;
      for (const t of [couleur, normales, alpha]) if (t) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      ressources.rameaux = { couleur, normales, alpha };
    })));

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
