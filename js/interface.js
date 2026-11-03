// Interface en VR : un panneau flottant (Inventaire, Pouvoirs, Options) qu'on utilise avec un pointeur laser.
import * as THREE from 'three';
import { scene } from './monde.js';
import { LISTE_POUVOIRS } from './pouvoirs.js';
import { jouerSon } from './sons.js';
import { LUEUR } from './effets.js';
import { PROFIL, ULTRA } from './profil.js';

const L = 1024, H = 640;                 // taille de l'image du panneau (pixels)
const LARG = 0.9, HAUT = (LARG * H) / L; // taille du panneau (mètres)
const OR = '#f2b134', FOND = 'rgba(16,22,30,0.93)', CARTE = 'rgba(44,56,72,0.95)', SURVOL = 'rgba(70,92,120,0.98)';
const tete = new THREE.Vector3(), devant = new THREE.Vector3(), q = new THREE.Quaternion();

export class Interface {
  constructor({ joueur, camera, rig, mains, inventaire, pouvoirs, catalogue, actions }) {
    Object.assign(this, { joueur, camera, rig, mains, inventaire, pouvoirs, catalogue, actions });
    this.toile = document.createElement('canvas');
    this.toile.width = L; this.toile.height = H;
    this.texture = new THREE.CanvasTexture(this.toile);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.panneau = new THREE.Mesh(new THREE.PlaneGeometry(LARG, HAUT), new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false }));
    this.panneau.renderOrder = 1000;
    this.panneau.visible = false;
    this.panneau.userData.sansAO = true;
    scene.add(this.panneau);
    // Pointeur laser
    this.laser = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 1, 5, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fe0ff, depthTest: false, transparent: true }));
    this.laser.renderOrder = 1001;
    this.point = new THREE.Sprite(new THREE.SpriteMaterial({ map: LUEUR, color: 0xffffff, depthTest: false }));
    this.point.scale.setScalar(0.025);
    this.point.renderOrder = 1002;
    this.laser.visible = this.point.visible = false;
    this.laser.userData.sansAO = true;
    scene.add(this.laser, this.point);
    this.ouvert = false;
    this.onglet = 'inventaire';
    this.boutons = [];
    this.survol = null;
    this.info = '';
    this.reglages = { rotation: 'crans', qualite: 'auto' };
  }

  basculer(onglet) {
    if (this.ouvert && this.onglet === onglet) this.fermer();
    else this.ouvrir(onglet);
  }

  ouvrir(onglet) {
    this.onglet = onglet;
    this.joueur.teteMonde(tete);
    this.joueur.directionRegard(devant);
    this.panneau.position.copy(tete).addScaledVector(devant, 0.72);
    this.panneau.position.y -= 0.12;
    this.panneau.lookAt(tete);
    this.ouvert = true;
    this.panneau.visible = true;
    this.info = '';
    this.dessiner();
    jouerSon('clic', this.panneau.position, 0.5);
  }

  fermer() {
    this.ouvert = false;
    this.panneau.visible = this.laser.visible = this.point.visible = false;
  }

  // rayon = { origine, dir } (main droite en VR, regard sur PC) ; clic = vrai à l'instant où l'on appuie
  maj(rayon, clic) {
    if (!this.ouvert) return;
    // Le panneau reste là où on l'a ouvert : il se ferme si l'on s'en éloigne
    if (this.joueur.teteMonde(tete).distanceTo(this.panneau.position) > 2.5) { this.fermer(); return; }
    this.panneau.updateMatrixWorld();
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(this.panneau.getWorldQuaternion(q));
    const denom = rayon.dir.dot(n);
    let cible = null;
    if (Math.abs(denom) > 1e-4) {
      const t = this.panneau.position.clone().sub(rayon.origine).dot(n) / denom;
      if (t > 0 && t < 4) {
        const p = rayon.origine.clone().addScaledVector(rayon.dir, t);
        const local = this.panneau.worldToLocal(p.clone());
        const x = (local.x / LARG + 0.5) * L, y = (0.5 - local.y / HAUT) * H;
        if (x >= 0 && x <= L && y >= 0 && y <= H) {
          cible = this.boutons.find((b) => x >= b.x && x <= b.x + b.l && y >= b.y && y <= b.y + b.h) ?? null;
          this.laser.visible = this.point.visible = true;
          this.relier(rayon.origine, p);
          this.point.position.copy(p);
        } else this.laser.visible = this.point.visible = false;
      }
    }
    if (cible?.cle !== this.survol?.cle) { this.survol = cible; this.dessiner(); }
    if (clic && cible) {
      jouerSon('clic', this.panneau.position, 0.7);
      cible.action();
      if (this.ouvert) this.dessiner();
    }
  }

  relier(a, b) {
    const d = new THREE.Vector3().subVectors(b, a);
    this.laser.position.copy(a).addScaledVector(d, 0.5);
    this.laser.scale.set(1, d.length(), 1);
    this.laser.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  }

  // --- Dessin ---
  bouton(g, cle, x, y, l, h, texte, action, { actif = false, taille = 26, sousTexte = null, desactive = false } = {}) {
    const survole = this.survol?.cle === cle;
    g.fillStyle = desactive ? 'rgba(40,46,56,0.6)' : survole ? SURVOL : CARTE;
    g.beginPath(); g.roundRect(x, y, l, h, 12); g.fill();
    if (actif) { g.strokeStyle = OR; g.lineWidth = 4; g.stroke(); }
    g.fillStyle = desactive ? '#7d8794' : '#ffffff';
    g.font = `${taille}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(texte, x + l / 2, y + h / 2 - (sousTexte ? 12 : 0), l - 12);
    if (sousTexte) { g.font = '18px sans-serif'; g.fillStyle = '#b8c4d2'; g.fillText(sousTexte, x + l / 2, y + h / 2 + 18, l - 12); }
    if (!desactive) this.boutons.push({ cle, x, y, l, h, action });
  }

  dessiner() {
    const g = this.toile.getContext('2d');
    g.clearRect(0, 0, L, H);
    g.fillStyle = FOND;
    g.beginPath(); g.roundRect(0, 0, L, H, 28); g.fill();
    this.boutons = [];
    [['inventaire', '🎒 Inventaire'], ['pouvoirs', '✨ Pouvoirs'], ['options', '⚙️ Options']].forEach(([id, nom], i) => {
      this.bouton(g, 'onglet-' + id, 24 + i * 250, 18, 236, 58, nom, () => { this.onglet = id; this.info = ''; }, { actif: this.onglet === id, taille: 28 });
    });
    this.bouton(g, 'fermer', L - 84, 18, 60, 58, '✕', () => this.fermer(), { taille: 30 });
    if (this.onglet === 'inventaire') this.dessinerInventaire(g);
    else if (this.onglet === 'pouvoirs') this.dessinerPouvoirs(g);
    else this.dessinerOptions(g);
    if (this.info) { g.fillStyle = OR; g.font = '22px sans-serif'; g.textAlign = 'center'; g.fillText(this.info, L / 2, H - 20, L - 40); }
    this.texture.needsUpdate = true;
  }

  titre(g, texte, x, y) {
    g.fillStyle = OR; g.font = 'bold 24px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(texte, x, y);
  }

  dessinerInventaire(g) {
    // Sur le corps
    this.titre(g, 'Sur toi', 30, 106);
    this.inventaire.emplacements.forEach((e, i) => {
      g.fillStyle = CARTE; g.beginPath(); g.roundRect(30, 126 + i * 42, 300, 36, 8); g.fill();
      g.fillStyle = '#b8c4d2'; g.font = '19px sans-serif'; g.textAlign = 'left'; g.fillText(e.nom, 42, 144 + i * 42);
      g.fillStyle = '#ffffff'; g.textAlign = 'right'; g.fillText(e.objet ? e.objet.nom : '—', 318, 144 + i * 42, 140);
    });
    // Sac à dos
    this.titre(g, 'Sac à dos', 360, 106);
    this.inventaire.sac.forEach((o, i) => {
      const x = 360 + (i % 4) * 160, y = 124 + Math.floor(i / 4) * 66;
      if (o) this.bouton(g, 'sac-' + i, x, y, 150, 58, o.nom, () => {
        const main = this.mains.right.tenu ? this.mains.left : this.mains.right;
        this.inventaire.sortirDuSac(i, main);
        this.info = `Sorti du sac : ${o.nom}`;
      }, { taille: 20, sousTexte: 'prendre' });
      else this.bouton(g, 'sac-' + i, x, y, 150, 58, 'vide', () => {}, { taille: 18, desactive: true });
    });
    for (const [cote, nom, x] of [['left', 'main gauche', 30], ['right', 'main droite', 200]]) {
      const tenu = this.mains[cote].objetTenu;
      this.bouton(g, 'ranger-' + cote, x, 345, 160, 46, tenu ? `Ranger (${nom})` : `${nom} vide`, () => {
        this.info = this.inventaire.rangerDansSac(this.mains[cote]) ? `Rangé dans le sac : ${tenu.nom}` : 'Impossible : main vide, objet trop gros ou sac plein';
      }, { taille: 17, desactive: !tenu || tenu.ragdoll });
    }
    // Catalogue : faire apparaître des objets
    this.titre(g, 'Faire apparaître', 30, 420);
    this.catalogue.forEach((c, i) => {
      const x = 30 + (i % 6) * 162, y = 440 + Math.floor(i / 6) * 62;
      this.bouton(g, 'cat-' + i, x, y, 154, 54, c.nom, () => { c.creer(); this.info = `Nouvel objet : ${c.nom}`; }, { taille: 20 });
    });
  }

  dessinerPouvoirs(g) {
    LISTE_POUVOIRS.forEach((p, i) => {
      const x = 30 + (i % 3) * 325, y = 100 + Math.floor(i / 3) * 200;
      this.bouton(g, 'pouvoir-' + p.id, x, y, 310, 185, `${p.icone}  ${p.nom}`, () => {
        this.pouvoirs.choisir(p.id);
        this.actions.message(`Pouvoir : ${p.nom}`);
      }, { actif: this.pouvoirs.actif === p.id, taille: 32 });
    });
    const montre = LISTE_POUVOIRS.find((p) => 'pouvoir-' + p.id === this.survol?.cle) ?? LISTE_POUVOIRS.find((p) => p.id === this.pouvoirs.actif);
    g.fillStyle = '#ffffff'; g.font = '24px sans-serif'; g.textAlign = 'center';
    g.fillText(montre.desc, L / 2, 520, L - 60);
    g.fillStyle = '#b8c4d2'; g.font = '20px sans-serif';
    g.fillText('Le pouvoir s\'utilise avec la gâchette de l\'index d\'une main vide.  B : activer / couper vite.', L / 2, 565, L - 60);
  }

  dessinerOptions(g) {
    const r = this.reglages;
    this.titre(g, 'Confort', 30, 106);
    this.bouton(g, 'rotation', 30, 126, 300, 60, `Rotation : ${r.rotation === 'crans' ? 'par crans' : 'fluide'}`, () => {
      r.rotation = r.rotation === 'crans' ? 'fluide' : 'crans';
      this.actions.rotation(r.rotation);
    }, { taille: 22 });
    this.bouton(g, 'qualite', 350, 126, 300, 60, `Qualité : ${{ auto: 'automatique', haute: 'haute', basse: 'basse' }[r.qualite]}`, () => {
      r.qualite = { auto: 'haute', haute: 'basse', basse: 'auto' }[r.qualite];
      this.actions.qualite(r.qualite);
    }, { taille: 22 });
    this.bouton(g, 'reset', 670, 126, 320, 60, 'Tout remettre en place', () => { this.actions.replacer(); this.info = 'Objets remis en place'; }, { taille: 22 });
    this.titre(g, 'Se téléporter', 30, 226);
    [['place', 'Place du village'], ['port', 'Port'], ['hameau', 'Chalets'], ['belvedere', 'Belvédère du lac'], ['sommet', 'Sommet']].forEach(([id, nom], i) => {
      this.bouton(g, 'tp-' + id, 30 + (i % 3) * 330, 246 + Math.floor(i / 3) * 76, 310, 64, nom, () => { this.actions.teleporter(id); this.fermer(); }, { taille: 24 });
    });
    g.fillStyle = '#b8c4d2'; g.font = '20px sans-serif'; g.textAlign = 'left';
    ['Y : inventaire   X : pouvoirs   B : pouvoir on/off', 'A : sauter   joystick droit bas : s\'accroupir', 'Gâchette du majeur : attraper   index : utiliser / pouvoir'].forEach((l, i) => g.fillText(l, 30, 430 + i * 34));
    g.fillStyle = ULTRA ? '#5be37d' : '#f2b134';
    g.fillText(ULTRA ? `Graphismes : ${PROFIL.nom} (carte graphique du PC)` : `Graphismes : ${PROFIL.nom} — pour le mode Ultra, joue par le PC (Quest Link)`, 30, 545, L - 60);
  }
}
