// Matériaux et textures dessinées par le code (pas besoin de fichiers images)
import * as THREE from 'three';

function texture(taille, dessin, repeat = [1, 1], hauteur = taille) {
  const c = document.createElement('canvas');
  c.width = taille;
  c.height = hauteur;
  dessin(c.getContext('2d'), taille, hauteur);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  return t;
}

function grain(g, n, taille, couleurs, tailleMax = 3) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = couleurs[i % couleurs.length];
    const s = 1 + Math.random() * tailleMax;
    g.fillRect(Math.random() * taille, Math.random() * taille, s, s);
  }
}

export function creerMateriaux() {
  const sol = texture(256, (g, n) => {
    g.fillStyle = '#7d838b'; g.fillRect(0, 0, n, n);
    grain(g, 2500, n, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.06)']);
    g.strokeStyle = 'rgba(30,35,40,0.55)'; g.lineWidth = 3; g.strokeRect(0, 0, n, n);
  }, [16, 16]);

  const mur = texture(256, (g, n) => {
    g.fillStyle = '#d4d8de'; g.fillRect(0, 0, n, n);
    grain(g, 1500, n, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.08)']);
    g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 2; g.strokeRect(0, 0, n, n);
  }, [8, 2]);

  const bois = texture(256, (g, n) => {
    g.fillStyle = '#a7743f'; g.fillRect(0, 0, n, n);
    for (let y = 0; y < n; y += 4) {
      g.fillStyle = `rgba(70,40,15,${0.05 + Math.random() * 0.12})`;
      g.fillRect(0, y, n, 2);
    }
    g.fillStyle = 'rgba(60,35,12,0.6)';
    for (let y = 0; y <= n; y += n / 4) g.fillRect(0, y - 2, n, 4);
  });

  const caisse = texture(256, (g, n) => {
    g.fillStyle = '#b07d48'; g.fillRect(0, 0, n, n);
    for (let y = 0; y < n; y += 4) {
      g.fillStyle = `rgba(70,40,15,${0.04 + Math.random() * 0.1})`;
      g.fillRect(0, y, n, 2);
    }
    g.strokeStyle = '#6e4521'; g.lineWidth = 22; g.strokeRect(11, 11, n - 22, n - 22);
    g.beginPath(); g.moveTo(22, 22); g.lineTo(n - 22, n - 22); g.stroke();
  });

  const carton = texture(128, (g, n) => {
    g.fillStyle = '#c69c6d'; g.fillRect(0, 0, n, n);
    grain(g, 400, n, ['rgba(90,60,30,0.12)']);
    g.fillStyle = 'rgba(225,205,160,0.9)'; g.fillRect(n * 0.4, 0, n * 0.2, n);
  });

  const metal = texture(256, (g, n) => {
    g.fillStyle = '#5d646c'; g.fillRect(0, 0, n, n);
    grain(g, 1200, n, ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.1)'], 2);
    g.strokeStyle = '#3d4248'; g.lineWidth = 18; g.strokeRect(9, 9, n - 18, n - 18);
    g.fillStyle = '#9aa1a8';
    for (const x of [24, n - 24]) for (const y of [24, n - 24]) { g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#e8b23a'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center';
    g.fillText('50 KG', n / 2, n / 2 + 12);
  });

  return {
    sol: new THREE.MeshStandardMaterial({ map: sol, roughness: 0.9 }),
    mur: new THREE.MeshStandardMaterial({ map: mur, roughness: 0.95 }),
    bois: new THREE.MeshStandardMaterial({ map: bois, roughness: 0.75 }),
    caisse: new THREE.MeshStandardMaterial({ map: caisse, roughness: 0.8 }),
    carton: new THREE.MeshStandardMaterial({ map: carton, roughness: 0.9 }),
    metal: new THREE.MeshStandardMaterial({ map: metal, roughness: 0.45, metalness: 0.6 }),
    fonte: new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.5, metalness: 0.7 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.25, metalness: 0.9 }),
    tour: new THREE.MeshStandardMaterial({ color: 0x8c6a52, roughness: 0.9 }),
    sac: new THREE.MeshStandardMaterial({ color: 0x8e2b2b, roughness: 0.6 }),
    corde: new THREE.MeshStandardMaterial({ color: 0xd8c9a3, roughness: 0.9 }),
    couleur: (c, rugosite = 0.6) => new THREE.MeshStandardMaterial({ color: c, roughness: rugosite }),
  };
}

// Panneau avec du texte (consignes)
export function texturePanneau(titre, lignes) {
  return texture(1024, (g, l, h) => {
    g.fillStyle = '#1f2a37'; g.fillRect(0, 0, l, h);
    g.fillStyle = '#f2b134'; g.fillRect(0, 0, l, 10);
    g.fillStyle = '#ffffff'; g.font = 'bold 54px sans-serif';
    g.fillText(titre, 40, 85);
    g.font = '34px sans-serif'; g.fillStyle = '#d7e0ea';
    lignes.forEach((ligne, i) => g.fillText(ligne, 40, 155 + i * 50));
  }, [1, 1], 512);
}
