// Matériaux et textures dessinées par le code (pas besoin de fichiers images)
import * as THREE from 'three';

function texture(taille, dessin, hauteur = taille) {
  const c = document.createElement('canvas');
  c.width = taille;
  c.height = hauteur;
  dessin(c.getContext('2d'), taille, hauteur);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function grain(g, n, l, h, couleurs, tailleMax = 3) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = couleurs[i % couleurs.length];
    const s = 1 + Math.random() * tailleMax;
    g.fillRect(Math.random() * l, Math.random() * h, s, s);
  }
}

function planches(g, n, base, nb) {
  g.fillStyle = base; g.fillRect(0, 0, n, n);
  for (let y = 0; y < n; y += 4) {
    g.fillStyle = `rgba(70,40,15,${0.04 + Math.random() * 0.12})`;
    g.fillRect(0, y, n, 2);
  }
  g.fillStyle = 'rgba(55,32,12,0.55)';
  for (let y = 0; y <= n; y += n / nb) g.fillRect(0, y - 2, n, 4);
}

// tuile = taille (en m) d'un motif sur le décor
function mat(options, tuile = 1, extra = {}) {
  const m = new THREE.MeshStandardMaterial(options);
  m.userData.tuile = tuile;
  Object.assign(m.userData, extra);
  return m;
}

export function creerMateriaux() {
  const T = {
    herbe: texture(256, (g, n) => {
      g.fillStyle = '#4f7a35'; g.fillRect(0, 0, n, n);
      grain(g, 5000, n, n, ['#5d8a3e', '#456c2d', '#6b9a48', '#3f6328'], 3);
    }),
    pave: texture(256, (g, n) => {
      g.fillStyle = '#8e8a83'; g.fillRect(0, 0, n, n);
      g.strokeStyle = '#6b6862'; g.lineWidth = 4;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const dx = (y % 2) * 32;
        g.fillStyle = `hsl(35, 5%, ${50 + Math.random() * 10}%)`;
        g.fillRect(x * 64 + dx + 2, y * 64 + 2, 60, 60);
        g.strokeRect(x * 64 + dx, y * 64, 64, 64);
      }
      grain(g, 1500, n, n, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.06)']);
    }),
    carrelage: texture(256, (g, n) => {
      g.fillStyle = '#d9d4cb'; g.fillRect(0, 0, n, n);
      grain(g, 800, n, n, ['rgba(0,0,0,0.04)']);
      g.strokeStyle = '#b5ada1'; g.lineWidth = 4;
      g.strokeRect(0, 0, n / 2, n / 2); g.strokeRect(n / 2, 0, n / 2, n / 2);
      g.strokeRect(0, n / 2, n / 2, n / 2); g.strokeRect(n / 2, n / 2, n / 2, n / 2);
    }),
    beton: texture(256, (g, n) => {
      g.fillStyle = '#7d838b'; g.fillRect(0, 0, n, n);
      grain(g, 2500, n, n, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.06)']);
      g.strokeStyle = 'rgba(30,35,40,0.45)'; g.lineWidth = 3; g.strokeRect(0, 0, n, n);
    }),
    mur: texture(256, (g, n) => {
      g.fillStyle = '#d4d8de'; g.fillRect(0, 0, n, n);
      grain(g, 1500, n, n, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.08)']);
    }),
    brique: texture(256, (g, n) => {
      g.fillStyle = '#9a9188'; g.fillRect(0, 0, n, n);
      for (let y = 0; y < 8; y++) for (let x = -1; x < 4; x++) {
        g.fillStyle = `hsl(${12 + Math.random() * 8}, 45%, ${36 + Math.random() * 10}%)`;
        g.fillRect(x * 64 + (y % 2) * 32 + 3, y * 32 + 3, 58, 26);
      }
    }),
    parquet: texture(256, (g, n) => planches(g, n, '#a2703f', 8)),
    bois: texture(256, (g, n) => planches(g, n, '#a7743f', 4)),
    caisse: texture(256, (g, n) => {
      planches(g, n, '#b07d48', 4);
      g.strokeStyle = '#6e4521'; g.lineWidth = 22; g.strokeRect(11, 11, n - 22, n - 22);
      g.beginPath(); g.moveTo(22, 22); g.lineTo(n - 22, n - 22); g.stroke();
    }),
    carton: texture(128, (g, n) => {
      g.fillStyle = '#c69c6d'; g.fillRect(0, 0, n, n);
      grain(g, 400, n, n, ['rgba(90,60,30,0.12)']);
      g.fillStyle = 'rgba(225,205,160,0.9)'; g.fillRect(n * 0.4, 0, n * 0.2, n);
    }),
    metal: texture(256, (g, n) => {
      g.fillStyle = '#5d646c'; g.fillRect(0, 0, n, n);
      grain(g, 1200, n, n, ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.1)'], 2);
      g.strokeStyle = '#3d4248'; g.lineWidth = 18; g.strokeRect(9, 9, n - 18, n - 18);
      g.fillStyle = '#9aa1a8';
      for (const x of [24, n - 24]) for (const y of [24, n - 24]) { g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#e8b23a'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center';
      g.fillText('50 KG', n / 2, n / 2 + 12);
    }),
    rayures: texture(128, (g, n) => {
      g.fillStyle = '#e8b23a'; g.fillRect(0, 0, n, n);
      g.fillStyle = '#222';
      for (let i = -n; i < n * 2; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 - n, n); g.lineTo(i - n, n); g.fill(); }
    }),
    ecorce: texture(128, (g, n) => {
      g.fillStyle = '#5a4030'; g.fillRect(0, 0, n, n);
      for (let x = 0; x < n; x += 6) { g.fillStyle = `rgba(30,18,10,${Math.random() * 0.4})`; g.fillRect(x, 0, 3, n); }
    }),
    ecran: texture(256, (g, n, h) => {
      const d = g.createLinearGradient(0, 0, n, h);
      d.addColorStop(0, '#1d4f8f'); d.addColorStop(1, '#58a6e8');
      g.fillStyle = d; g.fillRect(0, 0, n, h);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 9; i++) g.fillRect(20, 20 + i * 16, 60 + Math.random() * 150, 7);
    }, 160),
  };

  const metalPeint = (c) => mat({ color: c, roughness: 0.45, metalness: 0.5 });
  return {
    herbe: mat({ map: T.herbe, roughness: 1 }, 2, { son: 'herbe' }),
    pave: mat({ map: T.pave, roughness: 0.9 }, 1.5),
    carrelage: mat({ map: T.carrelage, roughness: 0.6 }, 1),
    beton: mat({ map: T.beton, roughness: 0.9 }, 1.5),
    mur: mat({ map: T.mur, roughness: 0.95 }, 2),
    brique: mat({ map: T.brique, roughness: 0.95 }, 1.2),
    parquet: mat({ map: T.parquet, roughness: 0.7 }, 1.5),
    plafond: mat({ color: 0xe8e8e4, roughness: 1 }, 2, { ombre: false }),
    bois: mat({ map: T.bois, roughness: 0.75 }, 1),
    caisse: new THREE.MeshStandardMaterial({ map: T.caisse, roughness: 0.8 }),
    carton: new THREE.MeshStandardMaterial({ map: T.carton, roughness: 0.9 }),
    metal: new THREE.MeshStandardMaterial({ map: T.metal, roughness: 0.45, metalness: 0.6 }),
    rayures: mat({ map: T.rayures, roughness: 0.6 }, 1),
    ecorce: mat({ map: T.ecorce, roughness: 1 }, 1),
    fonte: mat({ color: 0x2b2e33, roughness: 0.5, metalness: 0.7 }),
    chrome: mat({ color: 0xc9ced4, roughness: 0.25, metalness: 0.9 }),
    acierBleu: metalPeint(0x2f5d8c),
    acierOrange: metalPeint(0xd9752b),
    acierGris: metalPeint(0x6a7178),
    acierVert: metalPeint(0x3f7a4e),
    tour: mat({ color: 0x8c6a52, roughness: 0.9 }, 1),
    sac: mat({ color: 0x8e2b2b, roughness: 0.6 }),
    corde: mat({ color: 0xd8c9a3, roughness: 0.9 }),
    feuillage: mat({ color: 0x3e7a2e, roughness: 0.9, flatShading: true }),
    feuillageClair: mat({ color: 0x5c9a3a, roughness: 0.9, flatShading: true }),
    verre: mat({ color: 0x9fc8e0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35 }, 1, { ombre: false }),
    verreSombre: mat({ color: 0x1c2733, roughness: 0.1, metalness: 0.3 }),
    eau: mat({ color: 0x3a8fc4, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.7 }, 1, { ombre: false }),
    ecran: mat({ map: T.ecran, emissive: 0xffffff, emissiveMap: T.ecran, emissiveIntensity: 0.9, roughness: 0.3 }),
    ecranNoir: mat({ color: 0x0c0f14, roughness: 0.2, metalness: 0.4 }),
    lampe: mat({ color: 0xfff4dd, emissive: 0xfff1d0, emissiveIntensity: 2.2 }, 1, { ombre: false }),
    tissu: mat({ color: 0x3d5a80, roughness: 1 }),
    tissuRouge: mat({ color: 0x9c3d3d, roughness: 1 }),
    caoutchouc: mat({ color: 0x1e1e1e, roughness: 0.9 }),
    blanc: mat({ color: 0xf0efe8, roughness: 0.5 }),
    couleur: (c, rugosite = 0.6) => mat({ color: c, roughness: rugosite }),
  };
}

// Panneau avec du texte (consignes, noms de zones)
export function texturePanneau(titre, lignes, couleur = '#1f2a37') {
  return texture(1024, (g, l, h) => {
    g.fillStyle = couleur; g.fillRect(0, 0, l, h);
    g.fillStyle = '#f2b134'; g.fillRect(0, 0, l, 10);
    g.fillStyle = '#ffffff'; g.font = 'bold 54px sans-serif';
    g.fillText(titre, 40, 85);
    g.font = '32px sans-serif'; g.fillStyle = '#d7e0ea';
    lignes.forEach((ligne, i) => g.fillText(ligne, 40, 150 + i * 44));
  }, 512);
}

export function textureEnseigne(texte, fond = '#1f2a37', couleurTexte = '#f2b134') {
  return texture(1024, (g, l, h) => {
    g.fillStyle = fond; g.fillRect(0, 0, l, h);
    g.fillStyle = couleurTexte; g.font = 'bold 120px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(texte, l / 2, h / 2 + 6);
  }, 256);
}
