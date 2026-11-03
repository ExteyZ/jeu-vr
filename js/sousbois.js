// Sous-bois et rochers : vraies plantes, pierres et bois morts scannés (Poly Haven), posés selon le milieu :
// fougères, souches, troncs morts et rochers moussus en forêt ; pissenlits et herbes folles en prairie ;
// orties et buissons en lisière ; gros blocs et faces rocheuses dans les pentes.
// Les modèles trop détaillés sont allégés au chargement (MeshoptSimplifier). Seuls ceux qui sont proches sont affichés.
import * as THREE from 'three';
import { MeshoptSimplifier } from 'https://cdn.jsdelivr.net/npm/meshoptimizer@0.22.0/meshopt_simplifier.module.js';
import { RAPIER, scene, ajouterSolideLointain } from './monde.js';
import { PROFIL, ULTRA } from './profil.js';
import { INTERIEUR, hauteurSol, densiteForet, zoneLibre, aleatoire, fbm, lisse, distanceLac, NIVEAU_LAC } from './terrain.js';
import { ressources } from './ressources.js';
import { horsReflet } from './eau.js';

// milieu : où pousse l'espèce ; densite : nombre par m² là où le milieu est idéal ; portee : distance d'affichage (m)
// triangles : taille maximale du modèle après allègement ; solide : on peut se cogner dessus / monter dessus
const ESPECES = [
  { id: 'fern_02', milieu: 'foret', densite: 0.08, echelle: [1.3, 2.3], portee: 55, triangles: 3000 },
  { id: 'dry_branches_medium_01', milieu: 'foret', densite: 0.008, echelle: [0.8, 1.3], portee: 45, triangles: 3000, couche: true },
  { id: 'rock_moss_set_01', milieu: 'foret', densite: 0.0035, echelle: [0.8, 1.6], portee: 90, triangles: 6000, enfonce: 0.12, pente: true },
  { id: 'rock_moss_set_02', milieu: 'foret', densite: 0.0035, echelle: [0.8, 1.6], portee: 90, triangles: 6000, enfonce: 0.12, pente: true },
  { id: 'tree_stump_01', milieu: 'foret', densite: 0.0016, echelle: [0.9, 1.3], portee: 90, triangles: 5000, enfonce: 0.08, solide: 'cylindre' },
  { id: 'tree_stump_02', milieu: 'foret', densite: 0.0016, echelle: [0.9, 1.3], portee: 90, triangles: 5000, enfonce: 0.08, solide: 'cylindre' },
  { id: 'dead_tree_trunk', milieu: 'foret', densite: 0.0012, echelle: [0.9, 1.3], portee: 110, triangles: 7000, enfonce: 0.1, pente: true, solide: 'enveloppe' },
  { id: 'pine_roots', milieu: 'foret', densite: 0.0012, echelle: [0.8, 1.2], portee: 70, triangles: 6000, enfonce: 0.1, pente: true },
  { id: 'shrub_04', milieu: 'lisiere', densite: 0.01, echelle: [0.8, 1.5], portee: 70, triangles: 8000 },
  { id: 'nettle_plant', milieu: 'lisiere', densite: 0.02, echelle: [0.8, 1.4], portee: 40, triangles: 5000 },
  { id: 'weed_plant_02', milieu: 'prairie', densite: 0.012, echelle: [0.9, 1.5], portee: 40, triangles: 4000 },
  { id: 'dandelion_01', milieu: 'prairie', densite: 0.03, echelle: [0.9, 1.4], portee: 35, triangles: 4000 },
  { id: 'rock_07', milieu: 'partout', densite: 0.0012, echelle: [0.6, 2.2], portee: 130, triangles: 4000, enfonce: 0.25, pente: true, solide: 'enveloppe' },
  { id: 'rock_09', milieu: 'partout', densite: 0.0012, echelle: [0.6, 2.2], portee: 130, triangles: 4000, enfonce: 0.25, pente: true, solide: 'enveloppe' },
  { id: 'boulder_01', milieu: 'rocheux', densite: 0.0008, echelle: [0.5, 1.6], portee: 170, triangles: 3000, enfonce: 0.2, pente: true, solide: 'enveloppe' },
  { id: 'rock_face_01', milieu: 'falaise', densite: 0.0014, echelle: [0.8, 2.5], portee: 200, triangles: 3000, enfonce: 0.3, pente: true, solide: 'enveloppe' },
  { id: 'rock_face_02', milieu: 'falaise', densite: 0.0014, echelle: [0.8, 2.5], portee: 200, triangles: 3000, enfonce: 0.3, pente: true, solide: 'enveloppe' },
];
const CASE = 32;
const HAUT = new THREE.Vector3(0, 1, 0);

// Convient-il à l'espèce ? (0 à 1)
function convenance(milieu, x, z, y, penteSol, foret) {
  if (y < NIVEAU_LAC + 0.7 || distanceLac(x, z) < 1.02) return 0;
  const montagne = 1 - lisse(330, 430, y);
  switch (milieu) {
    case 'foret': return lisse(0.3, 0.7, foret) * (1 - lisse(0.4, 0.6, penteSol)) * montagne;
    case 'lisiere': return Math.max(0, 1 - Math.abs(foret - 0.35) * 3) * (1 - lisse(0.3, 0.45, penteSol)) * montagne;
    case 'prairie': return (1 - lisse(0.1, 0.4, foret)) * (1 - lisse(0.2, 0.35, penteSol)) * (1 - lisse(250, 340, y)) * lisse(0.35, 0.65, fbm(x / 25 + 9, z / 25, 2));
    case 'rocheux': return 0.15 + 0.85 * lisse(0.12, 0.3, penteSol);
    case 'falaise': return lisse(0.28, 0.45, penteSol);
    default: return 0.3 + 0.7 * lisse(0.08, 0.25, penteSol);
  }
}

// Allège une géométrie (garde la forme, enlève des triangles)
function alleger(geo, triangles) {
  const actuels = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
  if (actuels <= triangles || !MeshoptSimplifier.supported) return geo;
  if (!geo.index) geo.setIndex(Array.from({ length: geo.attributes.position.count }, (_, i) => i));
  const p = geo.attributes.position, pos = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { pos[i * 3] = p.getX(i); pos[i * 3 + 1] = p.getY(i); pos[i * 3 + 2] = p.getZ(i); }
  const cible = Math.max(3, Math.floor(triangles) * 3);
  const [idx] = MeshoptSimplifier.simplify(new Uint32Array(geo.index.array), pos, 3, cible, 0.08);
  geo.setIndex(new THREE.Uint32BufferAttribute(idx, 1));
  return geo;
}

// Prépare un modèle : ses morceaux (géométrie + matériau), posé à l'origine, base au sol
function preparer(espece) {
  const racine = ressources.nature.get(espece.id);
  if (!racine) return null;
  racine.updateMatrixWorld(true);
  const morceaux = [];
  let total = 0;
  racine.traverse((o) => { if (o.isMesh) total += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  racine.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const n = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    alleger(geo, (espece.triangles * n) / total);
    const mat = o.material.clone();
    if (mat.alphaTest > 0 || mat.transparent) { mat.transparent = false; mat.alphaTest = Math.max(0.4, mat.alphaTest); mat.alphaToCoverage = ULTRA; mat.side = THREE.DoubleSide; }
    morceaux.push({ geo, mat });
  });
  const boite = new THREE.Box3();
  for (const m of morceaux) { m.geo.computeBoundingBox(); boite.union(m.geo.boundingBox); }
  const centre = boite.getCenter(new THREE.Vector3());
  for (const m of morceaux) { m.geo.translate(-centre.x, -boite.min.y, -centre.z); m.geo.computeBoundingSphere(); }
  const taille = boite.getSize(new THREE.Vector3());
  // Points pour la collision (enveloppe convexe d'une version très allégée)
  let points = null;
  if (espece.solide === 'enveloppe') {
    const tous = [];
    for (const m of morceaux) {
      const g = alleger(m.geo.clone(), 150), p = g.attributes.position, utilises = new Set(g.index.array);
      for (const i of utilises) tous.push(p.getX(i), p.getY(i), p.getZ(i));
    }
    points = new Float32Array(tous);
  }
  return { morceaux, taille, points };
}

let sousBois = null;
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qPente = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), n = new THREE.Vector3();

export async function construireSousBois() {
  await MeshoptSimplifier.ready;
  const densiteGlobale = PROFIL.sousBois.densite;
  const especes = [];
  for (const [e, espece] of ESPECES.entries()) {
    const modele = preparer(espece);
    if (!modele) continue;
    const cases = new Map();
    const essais = Math.round(INTERIEUR.taille * INTERIEUR.taille * espece.densite * densiteGlobale);
    for (let i = 0; i < essais; i++) {
      const graine = e * 1000003 + i;
      const x = INTERIEUR.x - INTERIEUR.taille / 2 + aleatoire(graine) * INTERIEUR.taille;
      const z = INTERIEUR.z - INTERIEUR.taille / 2 + aleatoire(graine + 77777) * INTERIEUR.taille;
      if (!zoneLibre(x, z, espece.milieu === 'prairie' ? 3 : 8)) continue;
      const y = hauteurSol(x, z);
      const e2 = 1.5, dx = hauteurSol(x + e2, z) - hauteurSol(x - e2, z), dz = hauteurSol(x, z + e2) - hauteurSol(x, z - e2);
      n.set(-dx, 2 * e2, -dz).normalize();
      const penteSol = 1 - n.y;
      const foret = densiteForet(x, z, y);
      // Les plantes poussent en touffes (bruit), pas partout pareil
      const touffes = espece.milieu === 'foret' || espece.milieu === 'prairie' ? lisse(0.3, 0.7, fbm(x / 9 + e * 13, z / 9 - e * 7, 2)) : 1;
      if (aleatoire(graine + 31) > convenance(espece.milieu, x, z, y, penteSol, foret) * touffes) continue;
      const [a, b] = espece.echelle;
      const echelle = a + Math.pow(aleatoire(graine + 41), 1.6) * (b - a);
      q.setFromAxisAngle(HAUT, aleatoire(graine + 51) * Math.PI * 2);
      if (espece.pente || espece.couche) q.premultiply(qPente.setFromUnitVectors(HAUT, espece.couche ? n : n.clone().lerp(HAUT, 0.4).normalize()));
      m4.compose(p.set(x, y - (espece.enfonce ?? 0.02) * modele.taille.y * echelle, z), q, s.setScalar(echelle));
      const k = `${Math.floor(x / CASE)},${Math.floor(z / CASE)}`;
      if (!cases.has(k)) cases.set(k, []);
      cases.get(k).push(m4.clone());
      // Rochers et troncs sur lesquels on peut monter (rendus solides quand le joueur approche)
      if (espece.solide && modele.taille.y * echelle > 0.25) {
        const son = espece.solide === 'cylindre' || espece.id.includes('trunk') ? 'bois' : 'pierre';
        const t = modele.taille;
        const forme = espece.solide === 'cylindre'
          ? () => RAPIER.ColliderDesc.cylinder(t.y * echelle / 2, Math.max(t.x, t.z) * echelle * 0.35).setTranslation(0, t.y * echelle / 2, 0)
          : () => RAPIER.ColliderDesc.convexHull(modele.points.map((v) => v * echelle)) ?? RAPIER.ColliderDesc.ball(t.y * echelle * 0.4);
        ajouterSolideLointain(p.clone(), q.clone(), forme, son);
      }
    }
    const max = 6000;
    const meshes = modele.morceaux.map(({ geo, mat }) => {
      const inst = new THREE.InstancedMesh(geo, mat, max);
      inst.name = espece.id;
      inst.count = 0;
      inst.castShadow = ULTRA || modele.taille.y > 1;
      inst.receiveShadow = true;
      inst.frustumCulled = false;
      scene.add(inst);
      if (modele.taille.y < 1.2) horsReflet.add(inst);
      return inst;
    });
    especes.push({ espece, cases, meshes, max, portee: espece.portee * (ULTRA ? 1 : 0.5) });
  }
  sousBois = { especes, dernier: new THREE.Vector3(1e9, 0, 1e9) };
  return sousBois;
}

// Affiche ce qui est proche du joueur (appelé régulièrement)
export function majSousBois(pos) {
  if (!sousBois || Math.hypot(pos.x - sousBois.dernier.x, pos.z - sousBois.dernier.z) < 8) return;
  sousBois.dernier.set(pos.x, 0, pos.z);
  const cx = Math.floor(pos.x / CASE), cz = Math.floor(pos.z / CASE);
  for (const e of sousBois.especes) {
    let nb = 0;
    const r = Math.ceil(e.portee / CASE);
    for (let i = -r; i <= r && nb < e.max; i++) for (let k = -r; k <= r && nb < e.max; k++) {
      for (const m of e.cases.get(`${cx + i},${cz + k}`) ?? []) {
        if (Math.hypot(m.elements[12] - pos.x, m.elements[14] - pos.z) > e.portee) continue;
        for (const inst of e.meshes) inst.setMatrixAt(nb, m);
        if (++nb >= e.max) break;
      }
    }
    for (const inst of e.meshes) { inst.count = nb; inst.instanceMatrix.needsUpdate = true; }
  }
}
