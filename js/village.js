// Le village suisse au bord du lac (chalets), le ponton avec sa barque, et le panneau de la sortie du complexe.
import * as THREE from 'three';
import { scene, creerObjet, ajouterDecor, fusionnerDecor } from './monde.js';
import { hauteur, VILLAGE, NIVEAU_LAC, LAC, aleatoire } from './terrain.js';
import { textureEnseigne } from './materiaux.js';
import { ressources } from './ressources.js';
import { materiauxCarte, objetModele } from './carte.js';

const B = (taille, materiau, extra = {}) => ({ type: 'boite', taille, materiau, ...extra });
const C = (rayon, hauteur, materiau, extra = {}) => ({ type: 'cylindre', rayon, hauteur, materiau, ...extra });
let M;

export function construireVillage() {
  const P = ressources.materiaux;
  const base = materiauxCarte();
  const teinter = (m, c) => { if (!m) return null; const n = m.clone(); n.color.set(c); n.userData = { ...m.userData }; return n; };
  M = {
    pierre: P.pierre ?? base.beton,
    planches: teinter(P.planches, 0x9a6b45) ?? base.bois,
    boisSombre: teinter(P.planches, 0x5a3a24) ?? base.bois,
    toit: teinter(P.toit, 0x7a5a4a) ?? base.tour,
    blanc: base.blanc,
    verre: base.verreSombre,
    volets: [base.couleur(0x2e6b3a, 0.7), base.couleur(0xa3322c, 0.7), base.couleur(0x34556e, 0.7)],
    fleurs: base.couleur(0xd8283a, 0.6),
    feuilles: base.couleur(0x3f7a2e, 0.9),
    pignon: (P.planches ?? base.bois).clone(),
  };

  // Chalets disposés en arc, façade tournée vers le lac
  positionsChalets().forEach(({ x, z, rot, l, p }, i) => chalet(x, z, rot, { l, p, volets: M.volets[i % 3] }));
  // Fontaine de village et bancs
  const yv = hauteur(VILLAGE.x, VILLAGE.z);
  creerObjet({ pos: [VILLAGE.x, yv, VILLAGE.z], son: 'pierre', formes: [
    C(1.4, 0.7, M.pierre, { pos: [0, 0.35, 0] }), C(0.18, 1.6, M.pierre, { pos: [0, 0.8, 0] }), C(0.4, 0.12, M.pierre, { pos: [0, 1.6, 0] }),
  ] });
  ajouterDecor(new THREE.CylinderGeometry(1.25, 1.25, 0.02, 24), base.eau, [VILLAGE.x, yv + 0.62, VILLAGE.z]);
  for (const [dx, dz, r] of [[4, 0, -Math.PI / 2], [-4, 0, Math.PI / 2], [0, 4, Math.PI]]) {
    objetModele('painted_wooden_bench', [VILLAGE.x + dx, hauteur(VILLAGE.x + dx, VILLAGE.z + dz), VILLAGE.z + dz], { rot: [0, r, 0], hauteur: 0.85 });
  }

  ponton();
  panneauSortie();
  fusionnerDecor();   // assemble les chalets, la fontaine et le ponton (sinon ils resteraient invisibles)
}

// Emplacement des chalets (aussi utilisé pour ne pas faire pousser d'herbe dedans)
export function positionsChalets() {
  return Array.from({ length: 8 }, (_, i) => {
    const a = -1.0 + i * 0.32;
    const x = VILLAGE.x + Math.cos(a) * (40 + (i % 2) * 22), z = VILLAGE.z + Math.sin(a) * (40 + (i % 2) * 22);
    const vers = new THREE.Vector2(LAC.cx - x, LAC.cz - z).normalize();
    return { x, z, rot: Math.atan2(vers.x, vers.y) + (aleatoire(i) - 0.5) * 0.3, l: 8 + aleatoire(i + 3) * 3, p: 7 + aleatoire(i + 5) * 2 };
  });
}

// Coque de barque en bois : effilée à la proue, tableau arrière, fond qui remonte aux extrémités
function coqueBarque(L, B, D) {
  const NS = 24, NT = 14, pos = [], uv = [], idx = [];
  const lisse = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i <= NS; i++) {
    const s = -1 + (2 * i) / NS;   // -1 = arrière, +1 = proue
    const demi = (B / 2) * (1 - lisse(0.25, 1, s) * 0.97) * (1 - lisse(-0.55, -1, s) * 0.45);
    const tonture = 0.1 * Math.pow(Math.max(0, s), 2) + 0.04 * Math.pow(Math.max(0, -s), 2);   // le bord remonte aux bouts
    const quille = 0.12 * Math.pow(Math.abs(s), 3.5);                                       // le fond remonte aux bouts
    for (let k = 0; k <= NT; k++) {
      const t = -1 + (2 * k) / NT, a = (t * Math.PI) / 2;
      pos.push(Math.sin(a) * demi, -(D - quille) * Math.pow(Math.cos(a), 1.3) + tonture + D / 2, (s * L) / 2);
      uv.push(t * 1.5, s * 2.2);
    }
  }
  for (let i = 0; i < NS; i++) for (let k = 0; k < NT; k++) {
    const a = i * (NT + 1) + k, b = a + NT + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Un chalet suisse : socle en pierre, étage en bois, toit à deux pans, balcon, fenêtres à volets et géraniums
function chalet(x, z, rotY, { l = 9, p = 7.5, volets }) {
  const y0 = Math.min(hauteur(x - l / 2, z), hauteur(x + l / 2, z), hauteur(x, z - p / 2), hauteur(x, z + p / 2)) - 0.3;
  const H1 = 2.9, H2 = 2.7, PENTE = 0.5;
  const f = [];
  f.push(B([l, H1, p], M.pierre, { pos: [0, H1 / 2, 0] }));
  f.push(B([l, H2, p], M.planches, { pos: [0, H1 + H2 / 2, 0] }));
  // Toit avec débord
  const demi = p / 2 + 0.9, monte = demi * Math.tan(PENTE);
  for (const s of [1, -1]) f.push(B([l + 1.8, 0.16, demi / Math.cos(PENTE) + 0.12], M.toit, { pos: [0, H1 + H2 + monte / 2 + 0.06, (s * demi) / 2], rot: [s * PENTE, 0, 0] }));
  f.push(B([l + 1.82, 0.14, 0.3], M.boisSombre, { pos: [0, H1 + H2 + monte + 0.08, 0] }));
  f.push(B([0.7, 1.6, 0.7], M.pierre, { pos: [l * 0.25, H1 + H2 + monte * 0.75, -p * 0.12] }));
  // Balcon en façade (+z)
  f.push(B([l * 0.8, 0.12, 1.3], M.boisSombre, { pos: [0, H1 + 0.06, p / 2 + 0.65] }));
  for (let i = 0; i <= 26; i++) f.push(B([0.06, 0.9, 0.04], M.planches, { pos: [-l * 0.4 + (i * l * 0.8) / 26, H1 + 0.57, p / 2 + 1.27] }));
  for (const s of [1, -1]) for (let i = 0; i <= 4; i++) f.push(B([0.04, 0.9, 0.06], M.planches, { pos: [s * l * 0.4, H1 + 0.57, p / 2 + 0.05 + i * 0.3] }));
  f.push(B([l * 0.8 + 0.1, 0.08, 0.1], M.boisSombre, { pos: [0, H1 + 1.04, p / 2 + 1.27] }));
  for (const s of [1, -1]) f.push(B([0.14, H1, 0.14], M.boisSombre, { pos: [s * l * 0.38, H1 / 2, p / 2 + 1.2] }));
  // Porte d'entrée
  f.push(B([1.05, 2.1, 0.1], M.boisSombre, { pos: [-l * 0.28, 1.05, p / 2 + 0.03] }));
  f.push(B([0.06, 0.06, 0.06], M.blanc, { pos: [-l * 0.28 + 0.38, 1.0, p / 2 + 0.11] }));

  // Fenêtres sur trois façades, aux deux étages
  const fleurs = [];
  const face = (cote, u, v, w) => {
    if (cote === '+z') return { pos: [u, v, p / 2 + w], rot: [0, 0, 0] };
    if (cote === '+x') return { pos: [l / 2 + w, v, -u], rot: [0, Math.PI / 2, 0] };
    return { pos: [-(l / 2 + w), v, u], rot: [0, -Math.PI / 2, 0] };
  };
  const fenetre = (cote, u, v) => {
    f.push(B([1.0, 1.2, 0.06], M.blanc, face(cote, u, v, 0.03)));
    f.push(B([0.86, 1.06, 0.02], M.verre, { ...face(cote, u, v, 0.065), visuel: true }));
    for (const s of [1, -1]) f.push(B([0.48, 1.2, 0.04], volets, face(cote, u + s * 0.76, v, 0.04)));
    f.push(B([1.05, 0.22, 0.24], M.boisSombre, face(cote, u, v - 0.72, 0.12)));
    for (let k = 0; k < 6; k++) fleurs.push(face(cote, u - 0.42 + k * 0.17, v - 0.55, 0.13 + (k % 2) * 0.06).pos);
  };
  for (const u of [l * 0.12, l * 0.32]) fenetre('+z', u, 1.5);
  for (const u of [-l * 0.3, 0, l * 0.3]) fenetre('+z', u, H1 + 1.4);
  for (const cote of ['+x', '-x']) for (const u of [-p * 0.22, p * 0.22]) { fenetre(cote, u, 1.5); fenetre(cote, u, H1 + 1.4); }

  creerObjet({ pos: [x, y0, z], rot: [0, rotY, 0], son: 'bois', formes: f });

  // Pignons triangulaires (décor) et géraniums
  const q = new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rotY);
  const versMonde = (pt) => new THREE.Vector3(...pt).applyQuaternion(q).add(new THREE.Vector3(x, y0, z));
  const triangle = new THREE.Shape();
  triangle.moveTo(-p / 2, 0); triangle.lineTo(p / 2, 0); triangle.lineTo(0, (p / 2) * Math.tan(PENTE)); triangle.closePath();
  for (const s of [1, -1]) {
    const geo = new THREE.ExtrudeGeometry(triangle, { depth: 0.2, bevelEnabled: false });
    geo.translate(0, 0, -0.1);
    geo.rotateY(Math.PI / 2);
    const pm = versMonde([s * (l / 2 - 0.1), H1 + H2, 0]);
    ajouterDecor(geo, M.pignon, [pm.x, pm.y, pm.z], [0, rotY, 0]);
  }
  for (const pt of fleurs) {
    const pm = versMonde(pt);
    ajouterDecor(new THREE.SphereGeometry(0.09, 6, 4), M.fleurs, [pm.x, pm.y + 0.05, pm.z]);
    ajouterDecor(new THREE.SphereGeometry(0.1, 6, 4), M.feuilles, [pm.x, pm.y - 0.04, pm.z]);
  }
}

// Ponton en bois qui avance dans le lac, avec une barque qui flotte
function ponton() {
  const x = 40, z0 = -208, z1 = -262, y = NIVEAU_LAC + 0.7;
  const long = z0 - z1;
  creerObjet({ pos: [x, y, (z0 + z1) / 2], son: 'bois', formes: [B([2.6, 0.14, long], M.planches)] });
  // Rampe d'accès depuis la rive
  const yRive = hauteur(x, z0 + 4);
  const dy = y + 0.07 - yRive, a = Math.atan2(dy, 4);
  creerObjet({ pos: [x, (y + 0.07 + yRive) / 2 - 0.07, z0 + 2], rot: [a, 0, 0], son: 'bois', formes: [B([2.6, 0.14, Math.hypot(4, dy)], M.planches)] });
  for (let zz = z0 - 1; zz > z1; zz -= 3.2) {
    for (const s of [1, -1]) ajouterDecor(new THREE.CylinderGeometry(0.11, 0.11, 6, 8), M.boisSombre, [x + s * 1.2, y - 3, zz]);
  }
  for (const s of [1, -1]) creerObjet({ pos: [x + s * 1.2, y + 0.45, z1 + 0.3], formes: [C(0.12, 0.9, M.boisSombre)] });
  // Barque (coque creuse) : elle flotte grâce à l'eau qu'elle déplace
  // (formes de collision invisibles : la vraie coque est un modèle courbe posé par-dessus)
  const barque = creerObjet({ pos: [x + 2.6, NIVEAU_LAC + 0.25, z1 + 6], masse: 70, son: 'bois', nom: 'barque', amortissement: 0.3, formes: [
    B([1.0, 0.06, 3.2], M.boisSombre, { pos: [0, -0.2, 0], cache: true }),
    B([0.06, 0.4, 3.0], M.planches, { pos: [0.6, 0.02, -0.1], cache: true }), B([0.06, 0.4, 3.0], M.planches, { pos: [-0.6, 0.02, -0.1], cache: true }),
    B([0.5, 0.4, 0.06], M.planches, { pos: [0, 0.02, 1.7], cache: true }), B([1.0, 0.4, 0.06], M.planches, { pos: [0, 0.02, -1.75], cache: true }),
  ] });
  const coque = new THREE.Mesh(coqueBarque(3.6, 1.3, 0.5), (() => { const m = M.planches.clone(); m.side = THREE.DoubleSide; return m; })());
  coque.castShadow = coque.receiveShadow = true;
  const details = [
    // Plat-bord, bancs, tableau arrière et deux rames posées dans la barque
    [new THREE.BoxGeometry(1.16, 0.05, 0.28), M.boisSombre, [0, 0.0, 0.35], [0, 0, 0]],
    [new THREE.BoxGeometry(0.96, 0.05, 0.3), M.boisSombre, [0, 0.0, -1.05], [0, 0, 0]],
    [new THREE.BoxGeometry(0.82, 0.42, 0.05), M.boisSombre, [0, 0.0, -1.79], [0, 0, 0]],
    [new THREE.CylinderGeometry(0.025, 0.025, 2.3, 8), M.boisSombre, [0.32, 0.08, 0.1], [Math.PI / 2, 0, 0.06]],
    [new THREE.BoxGeometry(0.16, 0.015, 0.5), M.planches, [0.38, 0.08, -1.0], [0, 0.06, 0]],
    [new THREE.CylinderGeometry(0.025, 0.025, 2.3, 8), M.boisSombre, [-0.32, 0.08, 0.1], [Math.PI / 2, 0, -0.06]],
    [new THREE.BoxGeometry(0.16, 0.015, 0.5), M.planches, [-0.38, 0.08, -1.0], [0, -0.06, 0]],
  ].map(([g, m, p, r]) => { const o = new THREE.Mesh(g, m); o.position.set(...p); o.rotation.set(...r); o.castShadow = true; return o; });
  const bord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(
    [[-0.41, -1.8], [-0.62, -0.9], [-0.66, 0.2], [-0.46, 1.2], [0, 1.82], [0.46, 1.2], [0.66, 0.2], [0.62, -0.9], [0.41, -1.8]]
      .map(([bx, bz]) => new THREE.Vector3(bx, 0.26 + 0.1 * Math.pow(Math.max(0, bz / 1.8), 2), bz))), 40, 0.03, 6), M.boisSombre);
  barque.groupe.add(coque, bord, ...details);
  barque.volume = 1.6;
  barque.demiHauteur = 0.15;   // du centre de gravité (bas) au fond de la coque : elle s'enfonce de quelques centimètres
  barque.tailleMax = 99;   // trop grande pour l'inventaire
}

function panneauSortie() {
  const x = 15, z = -31;
  creerObjet({ pos: [x, 0, z], formes: [C(0.06, 2.4, M.boisSombre, { pos: [0, 1.2, 0] })] });
  for (const [texte, y, rot] of [['LAC  ▲  200 m', 2.1, 0], ['VILLAGE  ▶  450 m', 1.65, -0.5]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshStandardMaterial({ map: textureEnseigne(texte, '#5a3a24', '#f4e7cf'), side: THREE.DoubleSide }));
    m.position.set(x, y, z - 0.08);
    m.rotation.y = rot;
    scene.add(m);
  }
}
