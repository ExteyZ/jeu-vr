// Inventaire sur le corps : on range un objet en le lâchant près d'une hanche, d'une épaule (dans le dos)
// ou de la poitrine, et on le reprend en serrant la main au même endroit.
import * as THREE from 'three';
import { scene, vibrer } from './monde.js';
import { jouerSon } from './sons.js';

// Positions par rapport aux yeux, dans le repère du corps (-Z = devant)
const EMPLACEMENTS = [
  { nom: 'hanche gauche', pos: [-0.21, -0.75, -0.02] },
  { nom: 'hanche droite', pos: [0.21, -0.75, -0.02] },
  { nom: 'dos gauche', pos: [-0.17, -0.15, 0.14] },
  { nom: 'dos droit', pos: [0.17, -0.15, 0.14] },
  { nom: 'poitrine', pos: [0, -0.42, -0.15] },
];
const DIST_RANGER = 0.2, DIST_SORTIR = 0.17, DIST_AFFICHAGE = 0.45;
const MASSE_MAX = 12, TAILLE_MAX = 0.95;

const geoAnneau = new THREE.TorusGeometry(0.065, 0.006, 6, 24);
const tete = new THREE.Vector3(), devant = new THREE.Vector3(), qTete = new THREE.Quaternion(), qCorps = new THREE.Quaternion();
const poing = new THREE.Vector3();

export class Inventaire {
  constructor(rig, camera, mains) {
    this.rig = rig;
    this.camera = camera;
    this.mains = mains;
    this.lacet = 0;
    this.repere = new THREE.Object3D();
    scene.add(this.repere);
    this.emplacements = EMPLACEMENTS.map((e) => {
      const anneau = new THREE.Mesh(geoAnneau, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }));
      anneau.position.set(...e.pos);
      anneau.rotation.x = Math.PI / 2;
      anneau.visible = false;
      this.repere.add(anneau);
      return { ...e, anneau, objet: null, monde: new THREE.Vector3(), quatLocal: new THREE.Quaternion() };
    });
  }

  // Le corps suit l'orientation de la tête, mais avec du retard (comme un vrai torse)
  maj(dt, enVR) {
    tete.copy(this.camera.position).applyMatrix4(this.rig.matrixWorld);
    qTete.copy(this.rig.quaternion).multiply(this.camera.quaternion);
    devant.set(0, 0, -1).applyQuaternion(qTete);
    const lacetTete = Math.atan2(-devant.x, -devant.z);
    let ecart = lacetTete - this.lacet;
    ecart = Math.atan2(Math.sin(ecart), Math.cos(ecart));
    this.lacet += ecart * Math.min(1, dt * (Math.abs(ecart) > 0.6 ? 5 : 1));
    this.repere.position.copy(tete);
    this.repere.rotation.set(0, this.lacet, 0);
    this.repere.updateMatrixWorld(true);

    for (const e of this.emplacements) {
      e.anneau.getWorldPosition(e.monde);
      let proche = Infinity, porte = false;
      for (const m of this.mains) {
        if (!m.active) continue;
        proche = Math.min(proche, m.poing(poing).distanceTo(e.monde));
        porte ||= !!m.objetTenu;
      }
      const visible = enVR && proche < DIST_AFFICHAGE && (porte || e.objet);
      e.anneau.visible = !!visible;
      if (visible) {
        const actif = proche < (e.objet ? DIST_SORTIR : DIST_RANGER);
        e.anneau.material.opacity = actif ? 0.85 : 0.3;
        e.anneau.material.color.set(actif ? 0xffd040 : e.objet ? 0x7fd4ff : 0xffffff);
      }
    }
  }

  // Appelé quand une main lâche un objet
  ranger(main, objet) {
    if (objet.masse > MASSE_MAX || objet.tailleMax > TAILLE_MAX || objet.range) return false;
    const v = objet.corps.linvel();
    if (Math.hypot(v.x, v.y, v.z) > 1.5) return false;   // un objet lancé n'est pas rangé, même s'il passe près du corps
    main.poing(poing);
    const e = this.plusProche(poing, DIST_RANGER, false);
    if (!e) return false;
    e.objet = objet;
    objet.range = e;
    objet.corps.setEnabled(false);
    this.repere.getWorldQuaternion(qCorps);
    e.quatLocal.copy(qCorps.invert()).multiply(objet.groupe.quaternion);
    vibrer(main.cote, 0.5, 50);
    jouerSon('rangement', e.monde, 0.6);
    return true;
  }

  // Appelé quand une main se serre : renvoie l'objet sorti de l'inventaire, s'il y en a un à portée
  sortir(main) {
    main.poing(poing);
    const e = this.plusProche(poing, DIST_SORTIR, true);
    if (!e) return null;
    const objet = e.objet;
    e.objet = null;
    objet.range = null;
    objet.corps.setTranslation(objet.groupe.position, true);
    objet.corps.setRotation(objet.groupe.quaternion, true);
    objet.corps.setLinvel({ x: 0, y: 0, z: 0 }, true);
    objet.corps.setAngvel({ x: 0, y: 0, z: 0 }, true);
    objet.corps.setEnabled(true);
    jouerSon('rangement', e.monde, 0.4);
    return objet;
  }

  plusProche(p, distMax, occupe) {
    let meilleur = null;
    for (const e of this.emplacements) {
      if (!!e.objet !== occupe) continue;
      const d = e.monde.distanceTo(p);
      if (d < distMax) { distMax = d; meilleur = e; }
    }
    return meilleur;
  }

  // Les objets rangés suivent le corps
  afficher() {
    this.repere.getWorldQuaternion(qCorps);
    for (const e of this.emplacements) {
      if (!e.objet) continue;
      e.objet.groupe.position.copy(e.monde);
      e.objet.groupe.quaternion.copy(qCorps).multiply(e.quatLocal);
    }
  }

  vider() {
    for (const e of this.emplacements) {
      if (e.objet) { e.objet.range = null; e.objet = null; }
    }
    for (let i = 0; i < this.sac.length; i++) {
      if (this.sac[i]) { this.sac[i].range = null; this.sac[i].groupe.visible = true; this.sac[i] = null; }
    }
  }

  // --- Sac à dos (12 places), utilisé depuis l'interface ---
  get sac() { return (this._sac ??= new Array(12).fill(null)); }

  rangerDansSac(main) {
    const objet = main.objetTenu;
    if (!objet || objet.ragdoll || objet.masse > 40 || objet.tailleMax > 2.5) return false;
    const i = this.sac.indexOf(null);
    if (i < 0) return false;
    main.lacher();
    this.sac[i] = objet;
    objet.range = { nom: 'sac' };
    objet.corps.setEnabled(false);
    objet.groupe.visible = false;
    jouerSon('rangement', main.cible.pos, 0.7);
    return true;
  }

  sortirDuSac(i, main) {
    const objet = this.sac[i];
    if (!objet) return null;
    this.sac[i] = null;
    objet.range = null;
    objet.groupe.visible = true;
    // L'objet apparaît dans la main (ou juste devant si elle est déjà prise)
    const p = main.poing(new THREE.Vector3());
    if (main.tenu) p.addScaledVector(main.rayon.dir, 0.5);
    objet.corps.setTranslation(p, true);
    objet.corps.setLinvel({ x: 0, y: 0, z: 0 }, true);
    objet.corps.setAngvel({ x: 0, y: 0, z: 0 }, true);
    objet.corps.setEnabled(true);
    objet.groupe.position.copy(p);
    if (!main.tenu && main.active) main.saisir(objet.corps, objet);
    jouerSon('rangement', p, 0.5);
    return objet;
  }
}
