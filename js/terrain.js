// La vallée suisse : relief (prairies, forêts, montagnes, cirque de falaises) et grand lac.
// La ville est posée à plat sur la rive sud du lac ; un hameau de chalets monte sur la colline derrière.
// Les arbres sont dans arbres.js, l'herbe dans herbe.js, les plantes et rochers dans sousbois.js, la ville dans ville.js.
import * as THREE from 'three';
import { RAPIER, world, scene, infos, CG_MONDE } from './monde.js';
import { PROFIL, ULTRA } from './profil.js';

export const NIVEAU_LAC = -2.5;
export const LAC = { cx: 0, cz: -560, rx: 760, rz: 420 };   // 1,5 km sur 840 m
// La ville : terrain plat (niveau 0, le quai domine l'eau de 2,5 m), de la rive jusqu'au pied de la colline
export const VILLE = { x0: -310, x1: 310, z1: -20 };
export const BELVEDERE = { x: 450, z: -60, h: 55 };   // colline à l'est de la ville, avec vue sur le lac et les falaises
const VALLEE = { x: 0, z: -330 };
// Zone détaillée (2,8 km de côté : le lac, ses falaises et la ville) : relief fin, collisions précises, forêt et végétation
export const INTERIEUR = { x: 0, z: -640, taille: 2800 };
// Rive sud du lac (le quai de la ville) : z de la rive pour une position x
export const riveSud = (x) => LAC.cz + LAC.rz * Math.sqrt(Math.max(0, 1 - (x / LAC.rx) ** 2));
// Hameau de chalets sur la colline derrière la ville
export const HAMEAU = [[-250, 30, 0.2], [-175, 48, -0.1], [-95, 26, 0.05], [95, 34, -0.08], [170, 52, 0.12], [250, 28, -0.2],
  [-60, 85, 0.3], [60, 92, -0.25], [-210, 110, 0.1], [215, 118, -0.05]].map(([x, z, r], i) => ({ x, z, rot: Math.PI + r, l: 8 + (i % 3), p: 7 + (i % 2) * 1.5 }));

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
export function fbm(x, z, octaves) {
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
export const lisse = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const aleatoire = (i) => hash2(i * 7919, i * 104729 + 13);

export function distanceLac(x, z) {
  return Math.hypot((x - LAC.cx) / LAC.rx, (z - LAC.cz) / LAC.rz);   // 1 = sur la rive
}

// Hauteur du sol en (x, z)
export function hauteur(x, z) {
  // Prairies vallonnées ; au sud de la ville, la campagne monte doucement en collines
  let h = hauteurCampagne(x, z);
  // Lac : un bassin profond, et des rives toujours au-dessus de l'eau
  const dl = distanceLac(x, z);
  if (dl < 1) {
    h = NIVEAU_LAC - 0.8 - 45 * Math.pow(lisse(1, 0.25, dl), 0.5);   // les rives plongent vite (lac de montagne)
  } else {
    h = Math.max(h, NIVEAU_LAC + 0.45);
    if (dl < 1.35) h = NIVEAU_LAC + 0.45 + (h - NIVEAU_LAC - 0.45) * lisse(1, 1.35, dl);
    const c = montagnesDuLac(x, z, dl);
    if (c > 0) h = Math.max(h, NIVEAU_LAC + 0.45 + c);
  }
  // Hautes montagnes lointaines, tout autour de la vallée
  const rv = Math.hypot(x - VALLEE.x, (z - VALLEE.z) / 1.3);
  const m = lisse(1250, 2700, rv);
  if (m > 0) h = Math.max(h, m * (crete(x / 1400 + 3.1, z / 1400 - 7.7, 5) * 1500 + fbm(x / 320, z / 320, 4) * 240) + (crete(x / 90 + 11, z / 90 - 4, 3) - 0.35) * 50 * m);
  // Belvédère : une colline boisée au bord du lac, d'où l'on voit tout le lac et le cirque de falaises
  const db = Math.hypot(x - BELVEDERE.x, z - BELVEDERE.z);
  if (db < 170) h = Math.max(h, NIVEAU_LAC + BELVEDERE.h * Math.pow(lisse(170, 0, db), 1.7) + (fbm(x / 30, z / 30, 2) - 0.5) * 4 * lisse(170, 60, db));
  // La ville est bâtie sur un terrain plat au niveau 0 (le quai domine le lac de 2,5 m)
  // (seulement sur la rive sud : le rectangle de la ville va du milieu du lac jusqu'au pied de la colline)
  if (dl >= 1) {
    const dx = Math.max(VILLE.x0 - x, 0, x - VILLE.x1), dz = Math.max(LAC.cz - z, 0, z - VILLE.z1);
    const w = 1 - lisse(0, 50, Math.hypot(dx, dz));
    h = h * (1 - w);
  }
  // Chaque chalet du hameau est posé sur un petit replat
  for (const c of HAMEAU) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < 16) { const w = 1 - lisse(7, 16, d); h = h * (1 - w) + hauteurCampagne(c.x, c.z) * w; }
  }
  return h;
}
function hauteurCampagne(x, z) {
  return (fbm(x / 170, z / 170, 4) - 0.5) * 16 + (fbm(x / 38 + 50, z / 38, 3) - 0.5) * 2.5 + 26 * lisse(-40, 260, z) * (0.6 + 0.4 * fbm(x / 120 + 3, z / 120, 2));
}

// Montagnes autour du lac (comme au lac d'Oeschinen), selon la distance à la rive :
// - au fond (nord) : un talus d'éboulis boisé, puis un cirque de falaises calcaires en gradins (une paroi, une vire
//   herbeuse, une paroi...), creusé de couloirs et avancé en contreforts, et au-dessus des sommets enneigés ;
// - sur les côtés : de grandes pentes boisées, une barre rocheuse, puis des crêtes ;
// - côté ville (sud) : rien, la vue reste dégagée.
function montagnesDuLac(x, z, dl) {
  const dx = x - LAC.cx, dz = z - LAC.cz, r = Math.hypot(dx, dz);
  const s = -dz / r;                                    // 1 = fond du lac, 0 = côtés, -1 = ville
  const present = lisse(-0.6, -0.15, s);
  if (present <= 0) return 0;
  const d = r - r / dl;                                 // distance à la rive (m)
  const fond = lisse(0, 0.72, s);
  const le = Math.atan2(dx, -dz) * 760;                // position le long de la rive (m)
  const irr = fbm(x / 170 + 5, z / 170 - 9, 3) - 0.5;
  // Contreforts (la paroi avance) et couloirs (elle recule), allongés dans le sens de la pente, et bords cassés
  const contrefort = fbm(le / 240 + 11, d / 700, 2) - 0.5;
  const couloir = Math.pow(1 - Math.abs(fbm(le / 85 + 3, d / 420 + 1, 2) * 2 - 1), 6);
  const casse = (crete(x / 38 + 7, z / 38 - 3, 3) - 0.45) * 16 + (bruit(x / 12, z / 12) - 0.5) * 5;
  const dd = d + contrefort * 170 + irr * 110 - couloir * 85 + casse;
  return present * ((fond > 0 ? fond * paroi(x, z, le, dd) : 0) + (fond < 1 ? (1 - fond) * flanc(x, z, le, dd) : 0));
}

// Blocs et fissures sur les parois rocheuses (poids = 0 hors des parois)
const blocs = (x, z, poids) => poids > 0 ? ((crete(x / 26 + 7, z / 26 - 3, 3) - 0.45) * 14 + (bruit(x / 8, z / 8) - 0.5) * 5) * poids : 0;

function paroi(x, z, le, dd) {
  // Talus d'éboulis au pied (100 m de haut, de plus en plus raide)
  let h = 100 * Math.pow(Math.min(1, Math.max(0, dd) / 280), 1.7);
  let p = 280, roc = 0;
  // Trois gradins : une paroi presque verticale (~68°), puis une vire en pente douce (herbe, quelques sapins).
  // Leur hauteur change beaucoup le long du cirque, et par endroits la vire disparaît (deux parois n'en font qu'une)
  for (let i = 0; i < 3; i++) {
    const v = lisse(0.3, 0.7, fbm(le / 170 + i * 17.3, i * 5.1 + dd / 900, 2));
    const haut = (130 - i * 15) * (0.3 + 1.2 * v), large = haut * 0.4;
    const t = (dd - p) / large;
    h += haut * lisse(0, 1, t);
    if (t > 0 && t < 1) roc = Math.max(roc, Math.sin(t * Math.PI));
    p += large;
    const vire = 12 + 120 * lisse(0.3, 0.72, fbm(le / 130 + i * 9.7, 2.3 + i, 2));
    h += (8 + 20 * v) * lisse(p, p + vire, dd);
    p += vire;
  }
  // Couches inclinées (pendage) : les gradins montent et descendent le long du cirque
  h += Math.max(0, 60 + le * 0.04 + (fbm(le / 500 + 1, 0.3, 2) - 0.5) * 120) * lisse(220, 420, dd);
  // Au-dessus : arêtes, pics et névés
  h += lisse(p - 20, p + 1500, dd) * (300 + 220 * fbm(le / 600 + 2, 7.7, 2))
    + crete(x / 700 + 1.7, z / 700 + 4.1, 5) * 520 * lisse(p + 300, p + 1900, dd)
    + (crete(x / 260 + 5.3, z / 260 - 2.2, 4) - 0.4) * 130 * lisse(p, p + 500, dd);
  return h + blocs(x, z, roc);
}

function flanc(x, z, le, dd) {
  // Rive, grande pente boisée (~30°), une barre rocheuse à mi-hauteur, puis les crêtes
  let h = 45 * Math.pow(Math.min(1, Math.max(0, dd) / 160), 1.4) + 300 * lisse(60, 760, dd);
  const v = fbm(le / 260 + 4, 1.7, 2), barre = 25 + 60 * v, pb = 300 + 140 * fbm(le / 400, 3.3, 2);
  const t = (dd - pb) / (barre * 0.4);
  h += barre * lisse(0, 1, t);
  h += lisse(500, 1700, dd) * (480 + crete(x / 650 + 5, z / 650, 5) * 750);
  h += (fbm(x / 90, z / 90, 3) - 0.5) * 30 * lisse(100, 400, dd);
  return h + blocs(x, z, t > 0 && t < 1 ? Math.sin(t * Math.PI) * v : 0);
}

export function pente(x, z) {
  const e = 2;
  const nx = hauteur(x - e, z) - hauteur(x + e, z), nz = hauteur(x, z - e) - hauteur(x, z + e);
  const n = new THREE.Vector3(nx, 2 * e, nz).normalize();
  return 1 - n.y;
}

// Endroits où l'on ne met ni arbres ni végétation haute (ville, lac, chalets)
export function zoneLibre(x, z, marge = 25) {
  if (x > VILLE.x0 - marge && x < VILLE.x1 + marge && z < VILLE.z1 + marge && z > riveSud(x) - 10) return false;
  if (distanceLac(x, z) < 1.08) return false;
  for (const c of HAMEAU) if (Math.hypot(x - c.x, z - c.z) < 12 + marge * 0.2) return false;
  return true;
}

// Densité de forêt (0 = prairie, 1 = forêt dense) : des massifs de sapins, jusqu'à la limite des arbres
export function densiteForet(x, z, y = hauteur(x, z)) {
  let f = fbm(x / 110 + 17, z / 110 - 3, 3) + (fbm(x / 23 + 4, z / 23 + 9, 2) - 0.5) * 0.12;
  // Forêts sombres et denses sur les rives du lac, au pied des falaises et sur les pentes des côtés (pas côté ville)
  const dl = distanceLac(x, z), s = -(z - LAC.cz) / Math.max(1, Math.hypot(x - LAC.cx, z - LAC.cz));
  const fond = lisse(0, 0.72, s);
  f += 0.3 * lisse(1.9, 1.12, dl) * (1 - lisse(LAC.cz + 40, LAC.cz + 150, z));
  f += 0.22 * lisse(-0.6, -0.15, s) * (1 - fond) * lisse(1.04, 1.25, dl);
  // Au fond du lac : des sapins sur le talus et la première vire, plus haut seulement de l'herbe sur les vires
  const sommetBelvedere = 1 - lisse(85, 130, Math.hypot(x - BELVEDERE.x, z - BELVEDERE.z));   // vue dégagée sur le belvédère
  return lisse(0.44, 0.58, f) * (1 - lisse(300, 380, y)) * (1 - fond * lisse(170, 270, y)) * (1 - sommetBelvedere);
}

// --- Relief : maillage + collision (une zone détaillée et un grand anneau lointain) ---
const grilles = [];
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
  const g = { hauteurs, n, pas, x0: centreX - taille / 2, z0: centreZ - taille / 2, taille };
  grilles.push(g);
  return g;
}

// Hauteur exacte de la surface affichée (mêmes triangles que le maillage) : pour poser arbres et plantes
export function hauteurSol(x, z) {
  for (const g of grilles) {
    const fx0 = (x - g.x0) / g.pas, fz0 = (z - g.z0) / g.pas;
    const k = Math.floor(fx0), l = Math.floor(fz0);
    if (k < 0 || l < 0 || k >= g.n - 1 || l >= g.n - 1) continue;
    const fx = fx0 - k, fz = fz0 - l, H = g.hauteurs, n = g.n;
    const ha = H[l * n + k], hb = H[(l + 1) * n + k], hc = H[(l + 1) * n + k + 1], hd = H[l * n + k + 1];
    return fx + fz <= 1 ? ha + (hd - ha) * fx + (hb - ha) * fz : hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fz);
  }
  return hauteur(x, z);
}
export const grilleInterieure = () => grilles[0];

// Le maillage est découpé en carreaux : la carte graphique ne dessine que ceux qui sont dans le champ de vision
// (et, pour les ombres, seulement ceux qui sont autour du joueur)
function maillageRelief(g, materiau, carreaux) {
  const H = g.hauteurs, n = g.n, total = n * n;
  const position = new Float32Array(total * 3), normale = new Float32Array(total * 3);
  // Nature du sol à chaque sommet : densité de forêt, variation des prairies (plus ou moins vertes),
  // et ombre des creux (ravins, pieds de falaises : plus bas que leurs alentours, donc moins éclairés par le ciel)
  const sol = new Float32Array(total * 3);
  const r = g.pas < 10 ? 4 : 2, r2 = Math.max(1, r >> 1);
  const lire = (kk, ll) => H[Math.min(n - 1, Math.max(0, ll)) * n + Math.min(n - 1, Math.max(0, kk))];
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (let ligne = 0; ligne < n; ligne++) for (let k = 0; k < n; k++) {
    const i = ligne * n + k, x = g.x0 + k * g.pas, z = g.z0 + ligne * g.pas, y = H[i];
    position[i * 3] = x; position[i * 3 + 1] = y; position[i * 3 + 2] = z;
    const nx = lire(k - 1, ligne) - lire(k + 1, ligne), nz = lire(k, ligne - 1) - lire(k, ligne + 1), ny = 2 * g.pas, l = Math.hypot(nx, ny, nz);
    normale[i * 3] = nx / l; normale[i * 3 + 1] = ny / l; normale[i * 3 + 2] = nz / l;
    sol[i * 3] = zoneLibre(x, z, 4) ? densiteForet(x, z, y) : 0;
    sol[i * 3 + 1] = fbm(x / 60 + 31, z / 60 - 12, 3);
    let somme = 0;
    for (const [dx, dz] of DIRS) somme += lire(k + dx * r, ligne + dz * r) + lire(k + dx * r2, ligne + dz * r2);
    const creux = (somme / 16 - y) / (g.pas * r);
    sol[i * 3 + 2] = 1 - Math.min(0.55, Math.max(0, creux) * 1.7) + Math.min(0.08, Math.max(0, -creux) * 0.4);
  }
  const soleil = g.soleil ?? new Float32Array(total).fill(1);
  const s = (n - 1) / carreaux, m = s + 1, bord = [];
  // Sommets du bord d'un carreau (dans l'ordre), recopiés plus bas pour faire une "jupe" qui cache les fentes
  // entre deux carreaux dessinés avec des niveaux de détail différents
  for (let b = 0; b < m; b++) bord.push([0, b]);
  for (let a = 1; a < m; a++) bord.push([a, s]);
  for (let b = s - 1; b >= 0; b--) bord.push([s, b]);
  for (let a = s - 1; a > 0; a--) bord.push([a, 0]);
  const nb = m * m + bord.length, jupe = g.pas < 10 ? 40 : 120;
  // Triangles (mêmes diagonales que hauteurSol et la collision), pour chaque niveau de détail : un sommet sur 1, 2 ou 4
  const niveaux = [1, 2, 4].map((k) => {
    const idx = [];
    for (let a = 0; a < s; a += k) for (let b = 0; b < s; b += k) {
      const A = a * m + b, B = A + k * m, C = B + k, D = A + k;
      idx.push(A, B, D, B, C, D);
    }
    for (let i = 0; i < bord.length; i++) {
      const [a0, b0] = bord[i];
      if ((a0 % k) || (b0 % k)) continue;
      let j = i + 1;
      while (j < i + bord.length && (bord[j % bord.length][0] % k || bord[j % bord.length][1] % k)) j++;
      const [a2, b2] = bord[j % bord.length];
      const E0 = a0 * m + b0, E1 = a2 * m + b2, L0 = m * m + i, L1 = m * m + (j % bord.length);
      idx.push(E0, L0, E1, E1, L0, L1, E0, E1, L0, E1, L1, L0);   // (les deux côtés)
    }
    return new THREE.BufferAttribute(nb < 65536 ? new Uint16Array(idx) : new Uint32Array(idx), 1);
  });
  for (let ci = 0; ci < carreaux; ci++) for (let ck = 0; ck < carreaux; ck++) {
    const p = new Float32Array(nb * 3), no = new Float32Array(nb * 3), so = new Float32Array(nb * 3), su = new Float32Array(nb);
    const copier = (src, dst, dy = 0) => {
      for (let c = 0; c < 3; c++) { p[dst * 3 + c] = position[src * 3 + c]; no[dst * 3 + c] = normale[src * 3 + c]; so[dst * 3 + c] = sol[src * 3 + c]; }
      p[dst * 3 + 1] -= dy;
      su[dst] = soleil[src];
    };
    for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) copier((ci * s + a) * n + ck * s + b, a * m + b);
    bord.forEach(([a, b], i) => copier((ci * s + a) * n + ck * s + b, m * m + i, jupe));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(no, 3));
    geo.setAttribute('aSol', new THREE.BufferAttribute(so, 3));
    geo.setAttribute('aSoleil', new THREE.BufferAttribute(su, 1));
    geo.setIndex(niveaux[0]);
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, materiau);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    carreauxRelief.push({ mesh, niveaux, boite: geo.boundingBox, taille: s * g.pas, niveau: 0 });
  }
}

// Niveau de détail de chaque carreau selon sa distance au joueur (appelé à chaque image ; ne change presque jamais)
const carreauxRelief = [];
export function majRelief(pos) {
  for (const c of carreauxRelief) {
    const dx = Math.max(c.boite.min.x - pos.x, 0, pos.x - c.boite.max.x), dz = Math.max(c.boite.min.z - pos.z, 0, pos.z - c.boite.max.z);
    const d = Math.hypot(dx, dz) / c.taille;   // en nombre de carreaux
    const niveau = d < 1 ? 0 : d < 2.6 ? 1 : 2;
    if (niveau !== c.niveau) { c.niveau = niveau; c.mesh.geometry.setIndex(c.niveaux[niveau]); }
    // (l'ombre de contact n'a pas d'intérêt sur le relief lointain)
    c.mesh.userData.sansAO = d > 0.75;
  }
}

function collisionRelief(g) {
  // Rapier : hauteurs rangées colonne par colonne (lignes = axe X, colonnes = axe Z)
  const n = g.n, h = new Float32Array(n * n);
  for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) h[k * n + i] = g.hauteurs[i * n + k];
  const corps = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(g.x0 + g.taille / 2, 0, g.z0 + g.taille / 2));
  const c = world.createCollider(RAPIER.ColliderDesc.heightfield(n - 1, n - 1, h, { x: g.taille, y: 1, z: g.taille })
    .setFriction(0.9).setCollisionGroups(CG_MONDE), corps);
  infos.set(c.handle, { decor: { colliders: [c], son: 'herbe' } });
  return c;
}

// Matériau du relief : sept sols photo (prairie, sol forestier vert, aiguilles de sapin, roche moussue, falaise,
// neige, galets) mélangés selon la forêt, la pente et l'altitude, avec leur relief (cartes de normales).
function materiauRelief(t) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  m.defines = { ULTRA: ULTRA ? 1 : 0 };
  m.onBeforeCompile = (shader) => {
    const u = shader.uniforms;
    for (const [nom, mat] of Object.entries(t)) {
      u['c_' + nom] = { value: mat.map };
      u['n_' + nom] = { value: mat.normalMap ?? mat.map };
    }
    u.niveauLac = { value: NIVEAU_LAC };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aSol;\nattribute float aSoleil;\nvarying vec3 vSol;\nvarying float vSoleil;\nvarying vec3 vMonde;\nvarying vec3 vNormaleMonde;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSol = aSol;\nvSoleil = aSoleil;\nvMonde = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvNormaleMonde = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D c_herbe, c_solVert, c_foret, c_mousse, c_roche, c_neige, c_galets;
uniform sampler2D n_herbe, n_foret, n_mousse, n_roche;
uniform float niveauLac;
varying vec3 vSol; varying float vSoleil; varying vec3 vMonde; varying vec3 vNormaleMonde;
vec3 perturbation = vec3(0.0);
// Deux échelles mélangées : moins de répétition visible au loin
vec3 echant(sampler2D t, vec2 p, float s) {
#if ULTRA
  return mix(texture2D(t, p / s).rgb, texture2D(t, p / (s * 4.7)).rgb, 0.35);
#else
  return texture2D(t, p / s).rgb;
#endif
}
vec2 relief(sampler2D t, vec2 p, float s) { return texture2D(t, p / s).xy * 2.0 - 1.0; }`)
      .replace('#include <map_fragment>', `
vec3 nG = normalize(vNormaleMonde);
float penteSol = 1.0 - nG.y;
float foret = vSol.x, variation = vSol.y;
float dist = length(vMonde - cameraPosition);
// Prairie alpine : herbe et sol vert, plus ou moins secs selon l'endroit
vec3 herbe = echant(c_herbe, vMonde.xz, 2.5);
vec3 solVert = echant(c_solVert, vMonde.xz, 3.0);
vec3 prairie = mix(herbe, solVert, smoothstep(0.55, 0.85, variation) * 0.7);
prairie *= mix(vec3(0.21, 0.47, 0.12), vec3(0.31, 0.53, 0.15), smoothstep(0.3, 0.75, variation));
// Sous les sapins : tapis d'aiguilles brunes
vec3 aiguilles = echant(c_foret, vMonde.xz, 2.5);
// Roches : moussue dans les pentes moyennes, falaise grise projetée sur trois axes dans les pentes fortes
vec3 poidsAxes = pow(abs(nG), vec3(4.0)); poidsAxes /= (poidsAxes.x + poidsAxes.y + poidsAxes.z);
vec3 roche = texture2D(c_roche, vMonde.zy / 9.0).rgb * poidsAxes.x + echant(c_roche, vMonde.xz, 9.0) * poidsAxes.y + texture2D(c_roche, vMonde.xy / 9.0).rgb * poidsAxes.z;
// Au loin, la roche est vue à grande échelle (pas de motif répété sur les montagnes)
float loin = smoothstep(120.0, 700.0, dist);
#if ULTRA
vec3 rocheLoin = texture2D(c_roche, vMonde.zy / 310.0).rgb * poidsAxes.x + texture2D(c_roche, vMonde.xz / 310.0).rgb * poidsAxes.y + texture2D(c_roche, vMonde.xy / 310.0).rgb * poidsAxes.z;
roche = mix(roche, mix(vec3(0.27, 0.27, 0.26), rocheLoin * 0.72, 0.45), loin);
// Grandes parois vues de loin : la roche à moyenne échelle dessine des taches, coulures et couches irrégulières
vec3 rocheMoy = texture2D(c_roche, vMonde.zy / 48.0).rgb * poidsAxes.x + texture2D(c_roche, vMonde.xz / 48.0).rgb * poidsAxes.y + texture2D(c_roche, vMonde.xy / 48.0).rgb * poidsAxes.z;
roche *= mix(1.0, 0.35 + 1.5 * dot(rocheMoy, vec3(0.333)), loin * smoothstep(0.4, 0.7, 1.0 - nG.y));
#else
roche = mix(roche, vec3(0.32, 0.31, 0.3), loin * 0.85);
#endif
// Calcaire en couches : bandes plus claires et plus sombres
float strate = 0.94 + 0.06 * sin(vMonde.y * 0.31 + variation * 4.0 + sin(vMonde.x * 0.02) * 1.5) + 0.04 * sin(vMonde.y * 1.13 + vMonde.x * 0.013);
// Coulures sombres sur les parois (eau qui ruisselle, lichens) : la photo de roche très étirée à la verticale
vec2 tangente = normalize(vec2(-nG.z, nG.x) + vec2(0.0001, 0.0));
float coulure = texture2D(c_roche, vec2(dot(vMonde.xz, tangente) / 38.0, vMonde.y / 340.0)).g;
float coulure2 = texture2D(c_roche, vec2(dot(vMonde.xz, tangente) / 11.0 + 0.37, vMonde.y / 95.0)).g;
float paroiRaide = smoothstep(0.42, 0.72, penteSol);
roche *= strate * mix(1.0, (0.45 + 0.75 * smoothstep(0.2, 0.7, coulure)) * (0.8 + 0.3 * coulure2), paroiRaide);
// Calcaire gris, plus beige ou rouillé par endroits
roche *= mix(vec3(0.6, 0.61, 0.63), vec3(0.72, 0.65, 0.55), smoothstep(0.25, 0.75, variation + (coulure2 - 0.5) * 0.6));
vec3 mousse = echant(c_mousse, vMonde.xz, 4.0);
vec3 neige = echant(c_neige, vMonde.xz, 3.0) * 0.9;
vec3 galets = echant(c_galets, vMonde.xz, 2.0) * 0.72;
float wForet = smoothstep(0.25, 0.75, foret);
float wMousse = smoothstep(0.16, 0.3, penteSol + (variation - 0.5) * 0.08);
// En bas des montagnes, seules les vraies falaises sont en roche nue : le reste est vert (comme dans les Alpes)
float altitudeRoche = smoothstep(70.0, 260.0, vMonde.y);
float wRoche = smoothstep(mix(0.5, 0.33, altitudeRoche), mix(0.68, 0.5, altitudeRoche), penteSol + (variation - 0.5) * 0.06);
float hauteurNeige = 560.0 + variation * 240.0;
float wNeige = smoothstep(hauteurNeige, hauteurNeige + 60.0, vMonde.y) * (1.0 - smoothstep(0.18, 0.34, penteSol));   // la neige ne tient pas sur les parois raides
float wGalets = 1.0 - smoothstep(niveauLac + 0.3, niveauLac + 0.75, vMonde.y + (variation - 0.5) * 0.3);
// Vus de loin : les prairies sont plus sombres et les forêts forment des masses vert foncé (la cime des sapins)
prairie *= mix(vec3(1.0), vec3(0.6, 0.74, 0.56), loin);
aiguilles = mix(aiguilles, vec3(0.05, 0.085, 0.045), loin * 0.85);
vec3 couleur = mix(prairie, aiguilles, wForet);
couleur = mix(couleur, mousse, wMousse);
couleur = mix(couleur, roche, wRoche);
couleur = mix(couleur, galets, wGalets);
couleur = mix(couleur, neige, wNeige);
// Grandes taches plus claires / plus sombres (le relief n'a pas partout la même couleur)
float macro = 0.5 + 0.5 * sin(vMonde.x * 0.0061 + sin(vMonde.z * 0.0043) * 2.3) * sin(vMonde.z * 0.0052 + vMonde.x * 0.0017);
couleur *= (0.84 + 0.32 * macro) * vSol.z;   // et l'ombre des creux
// Lumière ambiante plus faible sous les arbres, sol plus sombre sous l'eau
couleur *= 1.0 - 0.18 * wForet;
couleur *= mix(vec3(1.0), vec3(0.42, 0.58, 0.62), smoothstep(niveauLac, niveauLac - 6.0, vMonde.y));
diffuseColor.rgb *= couleur;
#if ULTRA
// Relief des sols (cartes de normales), plus faible au loin
float fondu = 1.0 - smoothstep(25.0, 120.0, dist);
vec2 r = mix(relief(n_herbe, vMonde.xz, 2.5), relief(n_foret, vMonde.xz, 2.5), wForet);
r = mix(r, relief(n_mousse, vMonde.xz, 4.0), wMousse);
r = mix(r, relief(n_roche, vMonde.xz, 9.0), wRoche) * (1.0 - wNeige * 0.7);
perturbation = vec3(r.x, 0.0, -r.y) * 0.9 * fondu;
// Au loin : grand relief des montagnes (ravines, arêtes) donné par la roche vue à très grande échelle
vec2 rl = relief(n_roche, vMonde.xz, 260.0) + relief(n_roche, vMonde.zx + 71.0, 97.0) * 0.6;
perturbation += vec3(rl.x, 0.0, -rl.y) * 0.55 * loin;
#endif`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#if ULTRA
normal = normalize((viewMatrix * vec4(normalize(nG + perturbation), 0.0)).xyz);
#endif`)
      // Ombre des montagnes (calculée au chargement) appliquée à la lumière du soleil
      .replace('#include <lights_fragment_begin>', ombreDesMontagnes('vSoleil'))
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(mix(roughnessFactor, 0.8, wRoche), 0.6, wNeige);`);
  };
  return m;
}

// --- Construction ---
export function construireTerrain(textures, dirSoleil) {
  const materiau = materiauRelief(textures);
  const segments = PROFIL.segmentsRelief;
  const gInt = grille(INTERIEUR.x, INTERIEUR.z, INTERIEUR.taille, segments);
  // Grand anneau lointain (10 km) : les montagnes autour de la vallée
  const segmentsExt = ULTRA ? 400 : 160;
  const gExt = grille(INTERIEUR.x, INTERIEUR.z, 10000, segmentsExt, { x: INTERIEUR.x, z: INTERIEUR.z, demi: INTERIEUR.taille / 2 });
  for (const [g, carreaux] of [[gInt, segments >= 512 ? segments / 128 : 4], [gExt, 4]]) {
    calculerSoleil(g, dirSoleil);
    maillageRelief(g, materiau, carreaux);
    collisionRelief(g);
  }
}

// Morceau de shader : la lumière du soleil est multipliée par la part de soleil (variable GLSL donnée)
export function ombreDesMontagnes(variable) {
  return THREE.ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );',
    `getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= ${variable};`);
}

// Ombres des montagnes : pour chaque point du relief, on avance vers le soleil ; si le relief passe au-dessus
// du rayon, le point est à l'ombre (avec une pénombre douce qui s'élargit avec la distance)
function calculerSoleil(g, d) {
  const n = g.n, soleil = new Float32Array(n * n);
  for (let l = 0; l < n; l++) for (let k = 0; k < n; k++) {
    const x = g.x0 + k * g.pas, z = g.z0 + l * g.pas, y = g.hauteurs[l * n + k] + 0.8;
    let vis = 1;
    for (let t = g.pas * 1.5; t < 3000; t *= 1.14) {
      const ecart = (y + d.y * t - hauteurSol(x + d.x * t, z + d.z * t)) / (t * 0.05 + 1);
      if (ecart < vis) { vis = ecart; if (vis <= 0) break; }
    }
    soleil[l * n + k] = Math.max(0, vis);
  }
  g.soleil = soleil;
}

// Part de soleil reçue en (x, z) (1 = plein soleil, 0 = à l'ombre d'une montagne)
export function soleilEn(x, z) {
  for (const g of grilles) {
    if (!g.soleil) continue;
    const fx = (x - g.x0) / g.pas, fz = (z - g.z0) / g.pas, k = Math.floor(fx), l = Math.floor(fz);
    if (k < 0 || l < 0 || k >= g.n - 1 || l >= g.n - 1) continue;
    const a = fx - k, b = fz - l, S = g.soleil, n = g.n;
    return (S[l * n + k] * (1 - a) + S[l * n + k + 1] * a) * (1 - b) + (S[(l + 1) * n + k] * (1 - a) + S[(l + 1) * n + k + 1] * a) * b;
  }
  return 1;
}
