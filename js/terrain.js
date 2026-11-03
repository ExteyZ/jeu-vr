// La vallée suisse : relief (prairies, montagnes enneigées), lac, forêts de sapins et rochers.
// Le Complexe Delta est posé à plat au fond de la vallée ; le lac s'étend au nord.
import * as THREE from 'three';
import { RAPIER, world, scene, infos, CG_MONDE } from './monde.js';

export const NIVEAU_LAC = -2.5;
export const LAC = { cx: 0, cz: -430, rx: 380, rz: 210 };
export const VILLAGE = { x: 445, z: -300 };
const VALLEE = { x: 0, z: -230 };
const COMPLEXE = { x0: -40, x1: 38, z0: -34, z1: 30 };

// --- Bruit procédural (valeur lissée + fractales) ---
function hash2(ix, iz) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
function bruit(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  const ab = a + (b - a) * sx, cd = c + (d - c) * sx;
  return ab + (cd - ab) * sz;
}
function fbm(x, z, octaves) {
  let s = 0, a = 0.5, f = 1, t = 0;
  for (let i = 0; i < octaves; i++) { s += a * bruit(x * f, z * f); t += a; a *= 0.5; f *= 2.03; }
  return s / t;
}
// Crêtes de montagne (bruit "ridged")
function crete(x, z, octaves) {
  let s = 0, a = 0.5, f = 1, t = 0, poids = 1;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(bruit(x * f, z * f) * 2 - 1);
    n *= n * poids;
    poids = Math.min(1, n * 1.6);
    s += a * n; t += a; a *= 0.5; f *= 2.07;
  }
  return s / t;
}
const lisse = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const aleatoire = (i) => hash2(i * 7919, i * 104729 + 13);

export function distanceLac(x, z) {
  return Math.hypot((x - LAC.cx) / LAC.rx, (z - LAC.cz) / LAC.rz);   // 1 = sur la rive
}

// Hauteur du sol en (x, z)
export function hauteur(x, z) {
  // Prairies vallonnées
  let h = (fbm(x / 170, z / 170, 4) - 0.5) * 16 + (fbm(x / 38 + 50, z / 38, 3) - 0.5) * 2.5;
  // Montagnes, de plus en plus hautes en s'éloignant du fond de la vallée
  const r = Math.hypot(x - VALLEE.x, (z - VALLEE.z) / 1.4);
  const m = lisse(430, 1300, r);
  if (m > 0) h += m * (crete(x / 950 + 3.1, z / 950 - 7.7, 6) * 1050 + fbm(x / 240, z / 240, 4) * 160);
  // Lac : un bassin profond, et des rives toujours au-dessus de l'eau
  const dl = distanceLac(x, z);
  if (dl < 1) {
    h = NIVEAU_LAC - 0.8 - 40 * Math.pow(lisse(1, 0.15, dl), 0.8);
  } else {
    h = Math.max(h, NIVEAU_LAC + 0.45);
    if (dl < 1.35) h = NIVEAU_LAC + 0.45 + (h - NIVEAU_LAC - 0.45) * lisse(1, 1.35, dl);
  }
  // Le complexe est construit sur un terrain parfaitement plat
  const dx = Math.max(COMPLEXE.x0 - x, 0, x - COMPLEXE.x1), dz = Math.max(COMPLEXE.z0 - z, 0, z - COMPLEXE.z1);
  const w = 1 - lisse(0, 35, Math.hypot(dx, dz));
  h = h * (1 - w);
  // Le village est sur un replat
  const dv = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
  const wv = 1 - lisse(70, 140, dv);
  if (wv > 0) h = h * (1 - wv) + Math.max(NIVEAU_LAC + 3, hauteurBrute(VILLAGE.x, VILLAGE.z)) * wv;
  return h;
}
function hauteurBrute(x, z) { return (fbm(x / 170, z / 170, 4) - 0.5) * 16; }

export function pente(x, z) {
  const e = 2;
  const nx = hauteur(x - e, z) - hauteur(x + e, z), nz = hauteur(x, z - e) - hauteur(x, z + e);
  const n = new THREE.Vector3(nx, 2 * e, nz).normalize();
  return 1 - n.y;
}

// --- Relief : maillage + collision (une zone détaillée et un grand anneau lointain) ---
function grille(centreX, centreZ, taille, segments, abaisserInterieur = null) {
  const n = segments + 1;
  const hauteurs = new Float32Array(n * n);
  const pas = taille / segments;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      const x = centreX - taille / 2 + k * pas, z = centreZ - taille / 2 + i * pas;
      let y = hauteur(x, z);
      if (abaisserInterieur && Math.abs(x - abaisserInterieur.x) < abaisserInterieur.demi - pas && Math.abs(z - abaisserInterieur.z) < abaisserInterieur.demi - pas) y -= 12;
      hauteurs[i * n + k] = y;
    }
  }
  return { hauteurs, n, pas };
}

function maillageRelief(g, centreX, centreZ, taille, materiau) {
  const geo = new THREE.PlaneGeometry(taille, taille, g.n - 1, g.n - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    // PlaneGeometry tournée : les sommets vont de -z à +z ligne par ligne, et de -x à +x
    const k = i % g.n, ligne = Math.floor(i / g.n);
    pos.setXYZ(i, centreX - taille / 2 + k * g.pas, g.hauteurs[ligne * g.n + k], centreZ - taille / 2 + ligne * g.pas);
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, materiau);
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);
  return mesh;
}

function collisionRelief(g, centreX, centreZ, taille) {
  // Rapier : hauteurs rangées colonne par colonne (lignes = axe X, colonnes = axe Z)
  const n = g.n, h = new Float32Array(n * n);
  for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) h[k * n + i] = g.hauteurs[i * n + k];
  const corps = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(centreX, 0, centreZ));
  const c = world.createCollider(RAPIER.ColliderDesc.heightfield(n - 1, n - 1, h, { x: taille, y: 1, z: taille })
    .setFriction(0.9).setCollisionGroups(CG_MONDE), corps);
  infos.set(c.handle, { decor: { colliders: [c], son: 'herbe' } });
  return c;
}

// Matériau du relief : mélange herbe / roche / neige / sable selon l'altitude et la pente
function materiauRelief(textures) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.tHerbe = { value: textures.herbe };
    shader.uniforms.tRoche = { value: textures.roche };
    shader.uniforms.tSable = { value: textures.sable };
    shader.uniforms.niveauLac = { value: NIVEAU_LAC };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMonde;\nvarying vec3 vNormaleMonde;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMonde = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvNormaleMonde = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tHerbe; uniform sampler2D tRoche; uniform sampler2D tSable; uniform float niveauLac;
varying vec3 vMonde; varying vec3 vNormaleMonde;
float bruitDoux(vec2 p) { return sin(p.x * 0.013 + sin(p.y * 0.021) * 2.0) * 0.5 + sin(p.y * 0.017 + p.x * 0.004) * 0.5; }`)
      .replace('#include <map_fragment>', `
vec3 nrm = normalize(vNormaleMonde);
float penteSol = 1.0 - nrm.y;
float variation = bruitDoux(vMonde.xz);
// Herbe : deux échelles mélangées pour casser la répétition, teinte alpine plus verte
vec3 herbe = mix(texture2D(tHerbe, vMonde.xz / 3.0).rgb, texture2D(tHerbe, vMonde.xz / 23.0).rgb, 0.45);
herbe *= mix(vec3(0.72, 0.95, 0.55), vec3(0.85, 1.0, 0.62), variation * 0.5 + 0.5);
// Roche projetée sur trois axes (pas d'étirement sur les falaises)
vec3 poidsAxes = pow(abs(nrm), vec3(4.0)); poidsAxes /= (poidsAxes.x + poidsAxes.y + poidsAxes.z);
vec3 roche = texture2D(tRoche, vMonde.zy / 9.0).rgb * poidsAxes.x + texture2D(tRoche, vMonde.xz / 9.0).rgb * poidsAxes.y + texture2D(tRoche, vMonde.xy / 9.0).rgb * poidsAxes.z;
vec3 sable = texture2D(tSable, vMonde.xz / 2.5).rgb;
vec3 neige = vec3(0.93, 0.95, 1.0) * (0.92 + 0.08 * roche.r);
float wRoche = smoothstep(0.22, 0.42, penteSol + variation * 0.05);
float hauteurNeige = 420.0 + variation * 60.0;
float wNeige = smoothstep(hauteurNeige, hauteurNeige + 90.0, vMonde.y) * (1.0 - smoothstep(0.5, 0.7, penteSol));
float wSable = 1.0 - smoothstep(niveauLac + 0.5, niveauLac + 1.6, vMonde.y);
vec3 couleur = mix(herbe, roche, wRoche);
couleur = mix(couleur, sable, wSable);
couleur = mix(couleur, neige, wNeige);
// Sous l'eau : plus sombre et bleuté
couleur *= mix(vec3(1.0), vec3(0.45, 0.6, 0.65), smoothstep(niveauLac, niveauLac - 6.0, vMonde.y));
diffuseColor.rgb *= couleur;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.55, wNeige);`);
  };
  return m;
}

// --- Sapins (géométrie légère, dessinée en grand nombre d'un coup) ---
function geometrieSapin() {
  const morceaux = [];
  const tronc = new THREE.CylinderGeometry(0.12, 0.22, 2.2, 6);
  tronc.translate(0, 1.1, 0);
  colorer(tronc, 0x4a3426);
  morceaux.push(tronc);
  [[2.6, 3.2, 2.0], [2.1, 3.0, 3.6], [1.6, 2.8, 5.1], [1.05, 2.4, 6.5], [0.55, 1.8, 7.7]].forEach(([r, h, y], i) => {
    const c = new THREE.ConeGeometry(r, h, 8);
    c.translate(0, y, 0);
    colorer(c, i % 2 ? 0x24452b : 0x1e3d26);
    morceaux.push(c);
  });
  const geo = mergeSimple(morceaux);
  return geo;
}
function colorer(geo, c) {
  const col = new THREE.Color(c);
  const n = geo.attributes.position.count;
  const tab = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const ombre = 0.75 + 0.25 * Math.max(0, geo.attributes.position.getY(i) / 9);
    tab[i * 3] = col.r * ombre; tab[i * 3 + 1] = col.g * ombre; tab[i * 3 + 2] = col.b * ombre;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(tab, 3));
}
function mergeSimple(geos) {
  const nonIndexees = geos.map((g) => g.toNonIndexed());
  const total = nonIndexees.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const g of nonIndexees) {
    g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  r.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  r.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return r;
}

function geometrieRocher(graine) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    const d = 0.75 + 0.45 * fbm(v.x * 1.7 + graine, v.z * 1.7 + v.y * 1.3, 3);
    v.multiplyScalar(d);
    v.y *= 0.62;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// --- Construction ---
export function construireTerrain(textures) {
  const materiau = materiauRelief(textures);
  // Zone détaillée (1,6 km, un point tous les 6,25 m) et grand anneau lointain (8 km)
  const INT = { x: 0, z: -200, taille: 1600, seg: 256 };
  const gInt = grille(INT.x, INT.z, INT.taille, INT.seg);
  maillageRelief(gInt, INT.x, INT.z, INT.taille, materiau);
  collisionRelief(gInt, INT.x, INT.z, INT.taille);
  const gExt = grille(INT.x, INT.z, 8000, 128, { x: INT.x, z: INT.z, demi: INT.taille / 2 });
  maillageRelief(gExt, INT.x, INT.z, 8000, materiau);
  collisionRelief(gExt, INT.x, INT.z, 8000);

  planterForet(INT);
  poserRochers(INT, textures);
}

function zoneLibre(x, z) {
  if (x > COMPLEXE.x0 - 25 && x < COMPLEXE.x1 + 25 && z > COMPLEXE.z0 - 25 && z < COMPLEXE.z1 + 25) return false;
  if (distanceLac(x, z) < 1.08) return false;
  if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 120) return false;
  if (Math.abs(x - 40) < 12 && z < -150 && z > -260) return false;   // chemin du ponton
  return true;
}

function planterForet(INT) {
  const geo = geometrieSapin();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  const CHUNKS = 8, tailleChunk = INT.taille / CHUNKS;
  const parChunk = Array.from({ length: CHUNKS * CHUNKS }, () => []);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let essais = 0, plantes = 0;
  while (plantes < 3200 && essais < 40000) {
    essais++;
    const x = INT.x - INT.taille / 2 + aleatoire(essais) * INT.taille;
    const z = INT.z - INT.taille / 2 + aleatoire(essais + 99991) * INT.taille;
    if (!zoneLibre(x, z)) continue;
    const foret = fbm(x / 110 + 17, z / 110 - 3, 3);
    if (foret < 0.5 && aleatoire(essais + 7) > 0.04) continue;   // forêts en massifs, quelques arbres isolés
    const y = hauteur(x, z);
    if (y > 360 || y < NIVEAU_LAC + 1) continue;                 // limite des arbres en altitude
    if (pente(x, z) > 0.45) continue;
    const taille = 0.8 + aleatoire(essais + 3) * 1.1;
    const cx = Math.min(CHUNKS - 1, Math.floor((x - INT.x + INT.taille / 2) / tailleChunk));
    const cz = Math.min(CHUNKS - 1, Math.floor((z - INT.z + INT.taille / 2) / tailleChunk));
    parChunk[cz * CHUNKS + cx].push([x, y - 0.3, z, taille, aleatoire(essais + 5) * 6.28]);
    plantes++;
    // Tronc solide pour les arbres proches du complexe et du lac
    if (Math.hypot(x, z + 200) < 450) {
      const corps = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y + 1.5 * taille, z));
      const c = world.createCollider(RAPIER.ColliderDesc.cylinder(1.5 * taille, 0.25 * taille).setCollisionGroups(CG_MONDE), corps);
      infos.set(c.handle, { decor: { colliders: [c], son: 'bois' } });
    }
  }
  for (const liste of parChunk) {
    if (!liste.length) continue;
    const inst = new THREE.InstancedMesh(geo, mat, liste.length);
    const teinte = new THREE.Color();
    liste.forEach(([x, y, z, t, rot], i) => {
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rot);
      m.compose(p.set(x, y, z), q, s.set(t, t * (0.9 + 0.25 * aleatoire(i)), t));
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, teinte.setHSL(0.33 + aleatoire(i + 1) * 0.06, 0.35, 0.75 + aleatoire(i + 2) * 0.3));
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    scene.add(inst);
  }
}

function poserRochers(INT, textures) {
  const mat = new THREE.MeshStandardMaterial({ map: textures.roche, roughness: 0.9 });
  const geos = [geometrieRocher(1.3), geometrieRocher(7.1), geometrieRocher(13.7)];
  const listes = [[], [], []];
  let essais = 0, poses = 0;
  while (poses < 260 && essais < 20000) {
    essais++;
    const x = INT.x - INT.taille / 2 + aleatoire(essais + 500000) * INT.taille;
    const z = INT.z - INT.taille / 2 + aleatoire(essais + 700000) * INT.taille;
    if (!zoneLibre(x, z)) continue;
    const pt = pente(x, z);
    if (pt < 0.12 && aleatoire(essais) > 0.25) continue;   // plus de rochers dans les pentes
    const y = hauteur(x, z);
    const t = 0.5 + Math.pow(aleatoire(essais + 11), 2) * 3.5;
    listes[essais % 3].push([x, y - t * 0.2, z, t, aleatoire(essais + 13) * 6.28]);
    poses++;
    if (Math.hypot(x, z + 200) < 450 && t > 0.8) {
      const corps = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y - t * 0.2, z));
      const c = world.createCollider(RAPIER.ColliderDesc.ball(t * 0.75).setCollisionGroups(CG_MONDE), corps);
      infos.set(c.handle, { decor: { colliders: [c], son: 'pierre' } });
    }
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  listes.forEach((liste, g) => {
    const inst = new THREE.InstancedMesh(geos[g], mat, liste.length);
    liste.forEach(([x, y, z, t, rot], i) => {
      q.setFromEuler(new THREE.Euler(aleatoire(i) * 0.3, rot, aleatoire(i + 1) * 0.3));
      m.compose(p.set(x, y, z), q, s.set(t, t, t));
      inst.setMatrixAt(i, m);
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    scene.add(inst);
  });
}
