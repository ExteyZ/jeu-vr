// Forêts de sapins réalistes. Chaque sapin est construit comme dans les jeux : un tronc en écorce photo,
// et des étages de branches tombantes couvertes de vrais rameaux de sapin (planche photo Poly Haven avec transparence).
// De près on affiche les vrais arbres 3D ; de loin, une "photo" de chaque arbre prise au chargement (imposteur).
import * as THREE from 'three';
import { RAPIER, scene, ajouterSolideLointain } from './monde.js';
import { PROFIL, ULTRA } from './profil.js';
import { INTERIEUR, hauteur, hauteurSol, densiteForet, zoneLibre, aleatoire, pente, NIVEAU_LAC } from './terrain.js';
import { ressources } from './ressources.js';

const HAUTEURS = [13, 18, 24, 30];          // les quatre modèles de sapin (m)
const HAUT = new THREE.Vector3(0, 1, 0);
export const vent = { value: 0 };            // temps, pour le balancement des branches

// Position des rameaux dans la planche de Poly Haven (repérés à l'œil, si la détection automatique échoue)
const RAMEAUX_SECOURS = [[195, 45, 435, 325], [545, 95, 610, 240], [665, 40, 960, 380], [395, 295, 470, 395],
  [505, 262, 645, 410], [310, 405, 660, 795], [650, 460, 980, 855]]
  .map(([x0, y0, x1, y1]) => ({ u0: x0 / 1024, u1: x1 / 1024, v0: 1 - y1 / 1024, v1: 1 - y0 / 1024, ratio: (x1 - x0) / (y1 - y0), taille: (x1 - x0) * (y1 - y0) }));

// Repère chaque rameau dans le masque de transparence de la planche (morceaux blancs séparés)
function decouperRameaux(image) {
  try {
    const N = 256;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(image, 0, 0, N, N);
    const d = g.getImageData(0, 0, N, N).data;
    const plein = new Uint8Array(N * N);
    for (let y = 0; y < 222; y++) for (let x = 46; x < N; x++) if (d[(y * N + x) * 4] > 110) plein[y * N + x] = 1;
    // On épaissit un peu pour que les aiguilles d'un même rameau se touchent
    const epais = new Uint8Array(N * N);
    for (let y = 2; y < N - 2; y++) for (let x = 2; x < N - 2; x++) {
      for (let k = 0; k < 25; k++) if (plein[(y + (k % 5) - 2) * N + x + Math.floor(k / 5) - 2]) { epais[y * N + x] = 1; break; }
    }
    const vu = new Uint8Array(N * N), rameaux = [];
    for (let i = 0; i < N * N; i++) {
      if (!epais[i] || vu[i]) continue;
      let x0 = N, y0 = N, x1 = 0, y1 = 0, n = 0;
      const pile = [i];
      vu[i] = 1;
      while (pile.length) {
        const j = pile.pop(), x = j % N, y = (j - x) / N;
        n++;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        for (const k of [j - 1, j + 1, j - N, j + N]) if (epais[k] && !vu[k]) { vu[k] = 1; pile.push(k); }
      }
      if (n > 120) rameaux.push({ u0: x0 / N, u1: (x1 + 1) / N, v0: 1 - (y1 + 1) / N, v1: 1 - y0 / N, ratio: (x1 - x0 + 1) / (y1 - y0 + 1), taille: n });
    }
    return rameaux.length >= 4 ? rameaux : RAMEAUX_SECOURS;
  } catch {
    return RAMEAUX_SECOURS;
  }
}

// Planche de secours dessinée (si les photos de Poly Haven n'ont pas pu être chargées)
function rameauxDessines() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.lineCap = 'round';
  for (let k = 0; k < 2; k++) {
    const x0 = 64 + k * 128;
    g.strokeStyle = '#4a3a28'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x0, 250); g.lineTo(x0, 10); g.stroke();
    for (let y = 20; y < 245; y += 3) {
      for (const s of [-1, 1]) {
        g.strokeStyle = `hsl(${105 + Math.random() * 25}, 40%, ${18 + Math.random() * 18}%)`;
        g.lineWidth = 2;
        const l = 18 + (y / 250) * 34 * Math.random();
        g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + s * l, y - 8 - Math.random() * 6); g.stroke();
      }
    }
  }
  const couleur = new THREE.CanvasTexture(c);
  couleur.colorSpace = THREE.SRGBColorSpace;
  return { couleur, alpha: null, normales: null, rameaux: [{ u0: 0, u1: 0.5, v0: 0, v1: 1, ratio: 0.5, taille: 1 }, { u0: 0.5, u1: 1, v0: 0, v1: 1, ratio: 0.5, taille: 1 }] };
}

function hasard(graine) {
  let s = graine >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// --- Construction d'un sapin ---
function construireSapin(H, graine, rameaux) {
  const rnd = hasard(graine * 7919 + 17);
  const grands = rameaux.filter((r) => r.taille >= rameaux[Math.min(3, rameaux.length - 1)].taille);
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const w = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3(), dehors = new THREE.Vector3();

  // Un rameau = un rectangle de la planche photo, de la base (tige) vers la pointe
  function rameau(base, f, L, ombre, choix = grands) {
    const r = choix[Math.floor(rnd() * choix.length)];
    const W = L * r.ratio;
    w.crossVectors(f, HAUT);
    if (w.lengthSq() < 1e-4) w.set(1, 0, 0);
    w.normalize().applyAxisAngle(f, (rnd() - 0.5) * 1.1);   // un peu de roulis : visibles aussi de côté
    n.crossVectors(w, f).normalize();
    if (n.y < 0) n.negate();
    // Normale "feuillage" : vers l'extérieur de l'arbre et vers le ciel (éclairage doux et volumineux)
    dehors.set(base.x, 0, base.z);
    if (dehors.lengthSq() < 1e-4) dehors.set(f.x, 0, f.z);
    dehors.normalize().multiplyScalar(0.75).add(HAUT.clone().multiplyScalar(0.55)).addScaledVector(n, 0.35).normalize();
    b.copy(base).addScaledVector(f, -L * 0.06);
    const i0 = pos.length / 3;
    const coins = [[-0.5, 0, r.u0, r.v0], [0.5, 0, r.u1, r.v0], [0.5, 1, r.u1, r.v1], [-0.5, 1, r.u0, r.v1]];
    for (const [cw, cl, cu, cv] of coins) {
      // La pointe du rameau retombe un peu
      pos.push(b.x + w.x * cw * W + f.x * cl * L, b.y + w.y * cw * W + f.y * cl * L - cl * cl * L * 0.12, b.z + w.z * cw * W + f.z * cl * L);
      nor.push(dehors.x, dehors.y, dehors.z);
      uv.push(cu, cv);
      const o = ombre * (0.88 + cl * 0.12);
      col.push(o * (0.92 + rnd() * 0.1), o, o * (0.9 + rnd() * 0.12));
    }
    idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }

  const yBas = H * (0.14 + rnd() * 0.08);
  const Lmax = H * 0.2;
  const p = new THREE.Vector3(), q = new THREE.Vector3(), tangente = new THREE.Vector3(), f = new THREE.Vector3();
  for (let y = yBas; y < H - 0.5; y += 0.4 + rnd() * 0.22) {
    const t = (y - yBas) / (H - yBas);   // 0 en bas de la couronne, 1 à la cime
    const nb = 5 + Math.floor(rnd() * 3);
    const decalage = rnd() * Math.PI * 2;
    for (let k = 0; k < nb; k++) {
      const a = decalage + (k / nb) * Math.PI * 2 + (rnd() - 0.5) * 0.6;
      const L = (Lmax * Math.pow(1 - t, 0.9) + 0.3) * (0.8 + rnd() * 0.35);
      const chute = 0.06 + 0.34 * (1 - t) + rnd() * 0.1;
      const dx = Math.cos(a), dz = Math.sin(a);
      const point = (s, out) => out.set(dx * s * L, y - chute * s * L - 0.1 * L * s * s * (1 - t), dz * s * L);
      const nbr = Math.max(1, Math.round(L / 0.5));
      for (let i = 1; i <= nbr; i++) {
        const s = i / nbr;
        point(s, p);
        tangente.subVectors(point(Math.min(1, s + 0.05), q), point(Math.max(0, s - 0.05), f)).normalize();
        const taille = (0.55 + rnd() * 0.45) * (1 - 0.4 * t) * Math.min(1, 0.55 + L * 0.22);
        // Ombre interne : plus sombre près du tronc et en bas de l'arbre
        const ombre = (0.42 + 0.58 * (0.25 + 0.75 * s)) * (0.72 + 0.28 * t);
        for (const cote of [-1, 1]) {
          f.copy(tangente).applyAxisAngle(HAUT, cote * (0.7 + rnd() * 0.45));
          f.y -= 0.04 + rnd() * 0.12;
          rameau(p, f.normalize(), taille, ombre);
        }
        if (i === nbr) rameau(p, tangente, taille * 1.15, ombre);
      }
    }
  }
  // Cime : quelques rameaux dressés
  for (let k = 0; k < 5; k++) {
    const a = rnd() * Math.PI * 2;
    f.set(Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35).normalize();
    rameau(p.set(0, H - 0.9 - rnd() * 0.3, 0), f, 0.7 + rnd() * 0.3, 0.95, rameaux);
  }
  const feuillage = new THREE.BufferGeometry();
  feuillage.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  feuillage.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  feuillage.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  feuillage.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  feuillage.setIndex(idx);
  feuillage.computeBoundingSphere();

  // Tronc : cône irrégulier, évasé au pied, qui s'enfonce un peu dans le sol (pentes)
  const r0 = H * 0.016 + 0.07, RADIAL = 10, ANNEAUX = Math.ceil(H / 1.2) + 1;
  const tp = [], tn = [], tu = [], ti = [];
  for (let j = 0; j <= ANNEAUX; j++) {
    const v = j / ANNEAUX, yy = -0.6 + v * (H + 0.6);
    const r = Math.max(0.012, r0 * Math.pow(Math.max(0, 1 - yy / H), 0.85) * (1 + 0.55 * Math.exp(-Math.max(0, yy) * 2.2)));
    for (let i = 0; i <= RADIAL; i++) {
      const a = (i / RADIAL) * Math.PI * 2;
      const bosse = 1 + 0.05 * Math.sin(a * 3 + graine) * Math.sin(yy * 1.7 + graine);
      tp.push(Math.cos(a) * r * bosse, yy, Math.sin(a) * r * bosse);
      tn.push(Math.cos(a), 0.12, Math.sin(a));
      tu.push((i / RADIAL) * Math.max(1, Math.round(r0 * 9)), yy / 1.4);
    }
  }
  for (let j = 0; j < ANNEAUX; j++) for (let i = 0; i < RADIAL; i++) {
    const a = j * (RADIAL + 1) + i, c = a + RADIAL + 1;
    ti.push(a, c, a + 1, a + 1, c, c + 1);
  }
  const tronc = new THREE.BufferGeometry();
  tronc.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
  tronc.setAttribute('normal', new THREE.Float32BufferAttribute(tn, 3));
  tronc.setAttribute('uv', new THREE.Float32BufferAttribute(tu, 2));
  tronc.setIndex(ti);
  tronc.computeVertexNormals();
  tronc.computeBoundingSphere();
  return { feuillage, tronc, H, rayon: Lmax + 0.6, r0 };
}

// De loin, la transparence des rameaux se "dilue" (textures réduites) et les branches disparaîtraient :
// on renforce l'opacité selon le niveau de réduction de la texture (technique utilisée dans les jeux)
export function opaciteLointaine(fragmentShader, texture, uv) {
  return fragmentShader.replace('#include <alphatest_fragment>', `{
  vec2 tailleTex = vec2(textureSize(${texture}, 0));
  vec2 ddx = dFdx(${uv} * tailleTex), ddy = dFdy(${uv} * tailleTex);
  float niveau = max(0.0, 0.5 * log2(max(dot(ddx, ddx), dot(ddy, ddy))));
  diffuseColor.a *= 1.0 + niveau * 0.32;
}
#include <alphatest_fragment>`);
}

// Balancement au vent (et feuillage éclairé des deux côtés de la même façon)
function animerFeuillage(materiau, souplesse) {
  materiau.onBeforeCompile = (shader) => {
    shader.fragmentShader = opaciteLointaine(shader.fragmentShader, 'alphaMap', 'vAlphaMapUv');
    shader.uniforms.temps = vent;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float temps;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
vec3 racineArbre = instanceMatrix[3].xyz;
#else
vec3 racineArbre = vec3(0.0);
#endif
float phaseVent = racineArbre.x * 0.071 + racineArbre.z * 0.053;
float plie = (max(0.0, position.y) * 0.004 + length(position.xz) * 0.014) * ${souplesse.toFixed(2)};
transformed.x += sin(temps * 1.1 + phaseVent) * plie * (0.7 + 0.3 * sin(temps * 2.7 + position.y * 0.6 + phaseVent * 3.0));
transformed.z += cos(temps * 0.83 + phaseVent * 1.3) * plie * 0.6;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
  };
}

// --- "Photo" de chaque sapin, prise au chargement, pour les arbres lointains ---
function photographier(renderer, modeles, materiauxPhoto, taille) {
  const largeurCase = taille / 2;
  const cible = new THREE.WebGLRenderTarget(largeurCase * modeles.length, taille, {
    colorSpace: THREE.SRGBColorSpace, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, samples: 4,
  });
  const scenePhoto = new THREE.Scene();
  const ancienneCible = renderer.getRenderTarget(), ancienFond = renderer.getClearColor(new THREE.Color()), ancienAlpha = renderer.getClearAlpha();
  const xr = renderer.xr.enabled;
  renderer.xr.enabled = false;
  renderer.setRenderTarget(cible);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  modeles.forEach((m, i) => {
    const hautBoite = m.H + 0.8, largeurBoite = hautBoite / 2;
    const camera = new THREE.OrthographicCamera(-largeurBoite / 2, largeurBoite / 2, hautBoite - 0.5, -0.5, 0.1, 100);
    camera.position.set(0, 0, 50);
    const troncs = new THREE.Mesh(m.tronc, materiauxPhoto.tronc), feuilles = new THREE.Mesh(m.feuillage, materiauxPhoto.feuillage);
    scenePhoto.add(troncs, feuilles);
    cible.viewport.set(i * largeurCase, 0, largeurCase, taille);
    cible.scissor.set(i * largeurCase, 0, largeurCase, taille);
    cible.scissorTest = true;
    renderer.setRenderTarget(cible);
    renderer.render(scenePhoto, camera);
    scenePhoto.remove(troncs, feuilles);
  });
  cible.scissorTest = false;
  renderer.setRenderTarget(ancienneCible);
  renderer.setClearColor(ancienFond, ancienAlpha);
  renderer.xr.enabled = xr;
  return cible.texture;
}

// Trois panneaux croisés, de 0,5 × 1 (mis à l'échelle de chaque arbre)
function geometrieImposteur() {
  const plans = [0, Math.PI / 3, (2 * Math.PI) / 3].map((a) => {
    const g = new THREE.PlaneGeometry(0.5, 1, 1, 2);
    g.translate(0, 0.5, 0);
    g.rotateY(a);
    return g;
  });
  const pos = [], nor = [], uv = [], idx = [];
  let base = 0;
  for (const g of plans) {
    for (let i = 0; i < g.attributes.position.count; i++) {
      const x = g.attributes.position.getX(i), y = g.attributes.position.getY(i), z = g.attributes.position.getZ(i);
      pos.push(x, y, z);
      const n = new THREE.Vector3(x, 0.6, z).normalize();
      nor.push(n.x, n.y, n.z);
      uv.push(g.attributes.uv.getX(i), g.attributes.uv.getY(i));
    }
    for (const i of g.index.array) idx.push(i + base);
    base += g.attributes.position.count;
  }
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  r.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  r.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  r.setIndex(idx);
  return r;
}

// --- Placement : massifs de sapins, avec un écart minimal entre les troncs ---
function placerArbres(nombre) {
  const arbres = [], grille = new Map(), CASE = 4;
  const cle = (x, z) => `${Math.floor(x / CASE)},${Math.floor(z / CASE)}`;
  const tropPres = (x, z) => {
    for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) {
      for (const a of grille.get(`${Math.floor(x / CASE) + i},${Math.floor(z / CASE) + k}`) ?? []) if (Math.hypot(a.x - x, a.z - z) < 3.2) return true;
    }
    return false;
  };
  for (let essai = 1; arbres.length < nombre && essai < nombre * 30; essai++) {
    const x = INTERIEUR.x - INTERIEUR.taille / 2 + 4 + aleatoire(essai) * (INTERIEUR.taille - 8);
    const z = INTERIEUR.z - INTERIEUR.taille / 2 + 4 + aleatoire(essai + 99991) * (INTERIEUR.taille - 8);
    if (!zoneLibre(x, z)) continue;
    const y = hauteurSol(x, z);
    if (y < NIVEAU_LAC + 1.2) continue;
    const d = densiteForet(x, z, y);
    if (aleatoire(essai + 7) > d * 0.95 + 0.006) continue;   // des forêts, et quelques arbres isolés
    if (tropPres(x, z) || pente(x, z) > 0.5) continue;
    const a = { x, y, z, v: Math.min(3, Math.floor(aleatoire(essai + 3) * (2.2 + d * 1.8))), s: 0.85 + aleatoire(essai + 5) * 0.3, rot: aleatoire(essai + 9) * 6.283 };
    arbres.push(a);
    const c = cle(x, z);
    if (!grille.has(c)) grille.set(c, []);
    grille.get(c).push(a);
  }
  return arbres;
}

// Arbres lointains sur les pentes des montagnes, hors de la zone détaillée (imposteurs seulement)
function placerArbresLointains(nombre) {
  const arbres = [];
  for (let essai = 1; arbres.length < nombre && essai < nombre * 12; essai++) {
    const a = aleatoire(essai + 300000) * Math.PI * 2, r = 820 + Math.sqrt(aleatoire(essai + 400000)) * 1500;
    const x = INTERIEUR.x + Math.cos(a) * r, z = INTERIEUR.z + Math.sin(a) * r;
    if (Math.abs(x - INTERIEUR.x) < 800 && Math.abs(z - INTERIEUR.z) < 800) continue;
    const yAnalytique = hauteur(x, z);
    if (yAnalytique > 340 || densiteForet(x, z, yAnalytique) < 0.3 + aleatoire(essai) * 0.5) continue;
    arbres.push({ x, y: hauteurSol(x, z), z, v: Math.floor(aleatoire(essai + 3) * 4), s: 0.9 + aleatoire(essai + 5) * 0.4, rot: aleatoire(essai + 9) * 6.283 });
  }
  return arbres;
}

// --- La forêt ---
let foret = null;
const m4 = new THREE.Matrix4(), qr = new THREE.Quaternion(), ve = new THREE.Vector3(), vp = new THREE.Vector3();

export function construireForet(renderer) {
  const P = ressources.materiaux;
  const planche = ressources.rameaux ? { ...ressources.rameaux, rameaux: decouperRameaux(ressources.rameaux.alpha.image) } : rameauxDessines();
  const modeles = HAUTEURS.map((H, i) => construireSapin(H, i + 1, planche.rameaux));

  const ecorce = P.ecorce ?? new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 0.95 });
  const matTronc = ecorce.clone();
  const matFeuillage = new THREE.MeshStandardMaterial({
    map: planche.couleur, alphaMap: planche.alpha, normalMap: planche.normales, vertexColors: true,
    alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.82, metalness: 0, alphaToCoverage: ULTRA,
    color: new THREE.Color(0.6, 0.68, 0.54), envMapIntensity: 0.45,
  });
  if (planche.normales) matFeuillage.normalScale.set(0.6, 0.6);
  animerFeuillage(matFeuillage, 1);
  const ombreFeuillage = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: planche.alpha ? null : planche.couleur,
    alphaMap: planche.alpha, alphaTest: 0.42, side: THREE.DoubleSide });

  // Photos des arbres pour les imposteurs (couleur seule : la lumière du soleil est ajoutée ensuite)
  const atlas = photographier(renderer, modeles, {
    tronc: new THREE.MeshBasicMaterial({ map: ecorce.map, color: 0x9a9a9a }),
    feuillage: new THREE.MeshBasicMaterial({ map: planche.couleur, alphaMap: planche.alpha, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide }),
  }, PROFIL.arbres.impostor);
  const portee3D = PROFIL.arbres.portee3D;
  const uniformes = { centre3D: { value: new THREE.Vector3(1e9, 0, 1e9) }, portee3D: { value: portee3D } };
  const matImposteur = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.38, side: THREE.DoubleSide, roughness: 0.9, alphaToCoverage: ULTRA });
  matImposteur.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniformes);
    shader.fragmentShader = opaciteLointaine(shader.fragmentShader, 'map', 'vMapUv');
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aVariante;\nuniform vec3 centre3D;\nuniform float portee3D;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
vMapUv.x = (vMapUv.x + aVariante) / ${HAUTEURS.length.toFixed(1)};`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
// Les arbres proches sont affichés en vrai 3D : on cache leur photo
if (distance(instanceMatrix[3].xz, centre3D.xz) < portee3D) transformed *= 0.0;`);
  };

  // Placement et collisions des troncs
  const arbres = placerArbres(PROFIL.arbres.nombre);
  const lointains = placerArbresLointains(ULTRA ? 18000 : 4000);
  for (const a of arbres) {
    const r = modeles[a.v].r0 * a.s * 1.25;
    ajouterSolideLointain({ x: a.x, y: a.y + 2, z: a.z }, null, () => RAPIER.ColliderDesc.cylinder(2.5, r), 'bois');
  }

  // Imposteurs, par paquets de 200 m (pour ne dessiner que ceux qui sont dans le champ de vision)
  const geoImp = geometrieImposteur();
  const paquets = new Map();
  for (const a of [...arbres, ...lointains]) {
    const k = `${Math.floor(a.x / 200)},${Math.floor(a.z / 200)}`;
    if (!paquets.has(k)) paquets.set(k, []);
    paquets.get(k).push(a);
  }
  for (const liste of paquets.values()) {
    const geo = geoImp.clone();
    geo.setAttribute('aVariante', new THREE.InstancedBufferAttribute(new Float32Array(liste.map((a) => a.v)), 1));
    const inst = new THREE.InstancedMesh(geo, matImposteur, liste.length);
    const teinte = new THREE.Color();
    liste.forEach((a, i) => {
      const t = (HAUTEURS[a.v] + 0.8) * a.s;
      m4.compose(vp.set(a.x, a.y - 0.5 * a.s, a.z), qr.setFromAxisAngle(HAUT, a.rot), ve.set(t, t, t));
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, teinte.setHSL(0.27 + aleatoire(i) * 0.05, 0.12, 0.88 + aleatoire(i + 1) * 0.2));
    });
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    scene.add(inst);
  }

  // Vrais arbres 3D autour du joueur (remplis par majForet)
  const vrais = modeles.map((m) => {
    const max = arbres.length;
    const t = new THREE.InstancedMesh(m.tronc, matTronc, max), f = new THREE.InstancedMesh(m.feuillage, matFeuillage, max);
    t.count = f.count = 0;
    t.castShadow = f.castShadow = t.receiveShadow = f.receiveShadow = true;
    f.customDepthMaterial = ombreFeuillage;
    t.frustumCulled = f.frustumCulled = false;
    if (portee3D > 0) scene.add(t, f);
    return { t, f };
  });
  // Arbres rangés par case de 50 m pour retrouver vite ceux qui sont proches
  const cases = new Map();
  for (const a of arbres) {
    const k = `${Math.floor(a.x / 50)},${Math.floor(a.z / 50)}`;
    if (!cases.has(k)) cases.set(k, []);
    cases.get(k).push(a);
  }
  foret = { vrais, cases, uniformes, portee3D, dernier: new THREE.Vector3(1e9, 0, 1e9), modeles, arbres };
  return foret;
}

// Choisit les arbres affichés en 3D (appelé régulièrement avec la position du joueur)
export function majForet(pos, t) {
  vent.value = t;
  if (!foret || foret.portee3D <= 0) return;
  if (Math.hypot(pos.x - foret.dernier.x, pos.z - foret.dernier.z) < 6) return;
  foret.dernier.set(pos.x, 0, pos.z);
  foret.uniformes.centre3D.value.set(pos.x, 0, pos.z);
  for (const v of foret.vrais) v.t.count = v.f.count = 0;
  const R = foret.portee3D, n = Math.ceil(R / 50);
  const cx = Math.floor(pos.x / 50), cz = Math.floor(pos.z / 50);
  for (let i = -n; i <= n; i++) for (let k = -n; k <= n; k++) {
    for (const a of foret.cases.get(`${cx + i},${cz + k}`) ?? []) {
      if (Math.hypot(a.x - pos.x, a.z - pos.z) >= R) continue;
      const v = foret.vrais[a.v];
      m4.compose(vp.set(a.x, a.y, a.z), qr.setFromAxisAngle(HAUT, a.rot), ve.set(a.s, a.s, a.s));
      v.t.setMatrixAt(v.t.count++, m4);
      v.f.setMatrixAt(v.f.count++, m4);
    }
  }
  for (const v of foret.vrais) v.t.instanceMatrix.needsUpdate = v.f.instanceMatrix.needsUpdate = true;
}
