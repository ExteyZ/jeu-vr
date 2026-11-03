// Super-pouvoirs, utilisés avec la gâchette de l'index d'une main vide.
import * as THREE from 'three';
import { RAPIER, world, scene, infos, vibrer, GRAVITE } from './monde.js';
import { reglerForce, corpsTenus } from './mains.js';
import { jouerSon } from './sons.js';
import { grandes, petites, eclair, Rayon, LUEUR } from './effets.js';

export const LISTE_POUVOIRS = [
  { id: 'aucun', nom: 'Aucun', icone: '✋', desc: 'Tes mains normales.' },
  { id: 'feu', nom: 'Feu bleu', icone: '🔥', desc: 'Gâchette : lance des boules de feu bleu qui explosent et projettent tout.' },
  { id: 'heros', nom: 'Super-héros', icone: '🦸', desc: 'Gâchette : vole vers où pointe ta main. Force surhumaine, tu planes.' },
  { id: 'toile', nom: 'Toile', icone: '🕸️', desc: 'Gâchette : lance une toile. Sur un mur ou un arbre tu te balances, sur un objet tu le tires.' },
  { id: 'necro', nom: 'Nécromancie', icone: '💀', desc: 'Gâchette : fait léviter objets et corps. Bouge la main pour les guider, lâche pour les lancer.' },
  { id: 'vitesse', nom: 'Super vitesse', icone: '⚡', desc: 'Tu cours 4 fois plus vite et tu sautes 2 fois plus haut.' },
];

const BLEU = 0x5fb8ff, VIOLET = 0xa060ff, VERT_SPECTRAL = 0x6dff9c;
const vA = new THREE.Vector3(), vB = new THREE.Vector3();

export class Pouvoirs {
  constructor({ joueur, mains, personnages }) {
    this.joueur = joueur;
    this.mains = mains;
    this.personnages = personnages;   // fonction qui renvoie la liste des personnages
    this.actif = 'aucun';
    this.dernier = 'feu';
    this.boules = [];
    this.etat = {};
    for (const cote of ['left', 'right']) {
      this.etat[cote] = { gachette: 0, appuie: false, recharge: 0, toile: null, cible: null, distance: 0, rayon: new Rayon(0xffffff, 0.008, false), magie: new Rayon(VIOLET, 0.025) };
    }
    // Boules de feu (réutilisées)
    const geoBoule = new THREE.SphereGeometry(0.16, 12, 8);
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(geoBoule, new THREE.MeshBasicMaterial({ color: 0xbfe6ff })));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: LUEUR, color: BLEU, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.setScalar(1.1);
      g.add(halo);
      g.visible = false;
      scene.add(g);
      this.boules.push({ groupe: g, vitesse: new THREE.Vector3(), vie: 0 });
    }
  }

  choisir(id) {
    this.lacherTout();
    if (id !== 'aucun') this.dernier = id;
    this.actif = id;
    reglerForce(id === 'heros' ? 8 : 1);
  }

  basculer() { this.choisir(this.actif === 'aucun' ? this.dernier : 'aucun'); }

  nom() { return LISTE_POUVOIRS.find((p) => p.id === this.actif)?.nom ?? 'Aucun'; }

  lacherTout() {
    for (const cote of ['left', 'right']) this.relacher(cote);
  }

  relacher(cote) {
    const e = this.etat[cote];
    this.liberer(e.toile?.corps);
    this.liberer(e.cible);
    e.toile = null; e.cible = null;
    e.rayon.cacher(); e.magie.cacher();
  }

  // Un corps tenu par un pouvoir compte comme "tenu" : un personnage ne se relève pas pendant ce temps
  retenir(corps) { if (corps) corpsTenus.set(corps.handle, (corpsTenus.get(corps.handle) ?? 0) + 1); }
  liberer(corps) {
    if (!corps) return;
    const n = (corpsTenus.get(corps.handle) ?? 1) - 1;
    if (n > 0) corpsTenus.set(corps.handle, n); else corpsTenus.delete(corps.handle);
  }

  // Appelé à chaque image avant la physique. gachettes = { left, right } (seulement pour les mains vides)
  // Renvoie ce que le corps du joueur doit faire (vol, toile, vitesse...)
  maj(dt, gachettes) {
    const effet = { vol: null, toile: null, planer: false, multVitesse: 1, multSaut: 1 };
    if (this.actif === 'vitesse') { effet.multVitesse = 4; effet.multSaut = 2.2; }
    if (this.actif === 'heros') { effet.planer = true; effet.multSaut = 1.8; }
    const directionsVol = [];

    for (const cote of ['left', 'right']) {
      const main = this.mains[cote], e = this.etat[cote];
      const g = main.active && !main.tenu ? gachettes[cote] ?? 0 : 0;
      const presse = !e.appuie && g > 0.6, relache = e.appuie && g < 0.3;
      if (presse) e.appuie = true;
      if (relache) { e.appuie = false; this.relacher(cote); }
      e.recharge -= dt;
      const origine = main.poing(vA.clone());
      const dir = main.rayon.dir.clone();

      if (this.actif === 'feu' && e.appuie && e.recharge <= 0) {
        this.lancerBoule(origine, dir, cote);
        e.recharge = 0.28;
      }
      if (this.actif === 'heros' && g > 0.1) directionsVol.push(dir.multiplyScalar(g));
      if (this.actif === 'toile') {
        if (presse) this.lancerToile(cote, origine, dir);
        if (e.toile) {
          if (e.toile.corps) {
            // Toile sur un objet : on le tire vers soi tant qu'on serre
            const t = e.toile.corps.translation();
            e.rayon.relier(origine, vB.set(t.x, t.y, t.z));
            const d = vA.copy(origine).sub(vB);
            if (d.length() > 1.2) e.toile.corps.applyImpulse(d.normalize().multiplyScalar(Math.min(e.toile.corps.mass(), 30) * 22 * dt), true);
          } else {
            e.rayon.relier(origine, e.toile.ancre);
            if (g > 0.9) e.toile.longueur = Math.max(2, e.toile.longueur - 4 * dt);   // gâchette à fond : on remonte la toile
            effet.toile = e.toile;
          }
        }
      }
      if (this.actif === 'necro') {
        if (presse) this.saisirMagie(cote, origine, dir);
        if (e.cible) {
          try { this.guiderMagie(e, origine, dir, dt); } catch { this.relacher(cote); }   // corps disparu entre-temps
        }
      }
    }

    if (directionsVol.length) {
      const dir = directionsVol.reduce((s, d) => s.add(d), new THREE.Vector3());
      const poussee = Math.min(1, dir.length());
      effet.vol = { dir: dir.normalize(), poussee };
      if (Math.random() < 0.3) jouerSon('vent', this.joueur.pieds(vA), 0.15 * poussee);
    }
    this.majBoules(dt);
    return effet;
  }

  // --- Feu bleu ---
  lancerBoule(origine, dir, cote) {
    const b = this.boules.find((x) => x.vie <= 0) ?? this.boules[0];
    b.groupe.position.copy(origine).addScaledVector(dir, 0.25);
    b.vitesse.copy(dir).multiplyScalar(30);
    b.vie = 3;
    b.groupe.visible = true;
    jouerSon('feu', origine, 0.7);
    vibrer(cote, 0.6, 60);
  }

  majBoules(dt) {
    for (const b of this.boules) {
      if (b.vie <= 0) continue;
      b.vie -= dt;
      const avant = vA.copy(b.groupe.position);
      b.vitesse.y -= 1.5 * dt;
      const pas = vB.copy(b.vitesse).multiplyScalar(dt);
      const longueur = pas.length();
      const hit = world.castRay(new RAPIER.Ray(avant, pas.clone().normalize()), longueur, true, undefined, undefined, undefined, undefined,
        (col) => { const i = infos.get(col.handle); return !i?.main && col.parent()?.handle !== this.joueur.corps.handle; });
      petites.emettre(avant, 3, { couleur: BLEU, vitesse: 0.6, duree: 0.4 });
      grandes.emettre(avant, 1, { couleur: 0x2f7dff, vitesse: 0.2, duree: 0.25 });
      if (hit || b.vie <= 0) {
        const point = hit ? avant.clone().addScaledVector(pas.normalize(), hit.timeOfImpact) : avant.clone();
        this.exploser(point);
        b.vie = 0;
        b.groupe.visible = false;
      } else b.groupe.position.add(pas);
    }
  }

  exploser(point) {
    const RAYON = 3.8;
    grandes.emettre(point, 70, { couleur: BLEU, vitesse: 6, duree: 0.7, rayon: 0.3 });
    grandes.emettre(point, 25, { couleur: 0xe8f6ff, vitesse: 3, duree: 0.35 });
    petites.emettre(point, 90, { couleur: 0x9fd8ff, vitesse: 11, duree: 1.0, gravite: 6 });
    eclair(point, BLEU, 90);
    jouerSon('explosion', point, 1);
    // On relève d'abord ce qui est touché : on ne peut pas créer de corps (ragdoll) pendant la recherche
    const touches = new Map();
    world.intersectionsWithShape(point, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(RAYON), (col) => {
      const info = infos.get(col.handle);
      const corps = col.parent();
      if (info && !info.main && corps && !touches.has(corps.handle)) touches.set(corps.handle, { info, corps });
      return true;
    });
    for (const { info, corps } of touches.values()) {
      const c = corps.translation();
      const d = new THREE.Vector3(c.x - point.x, c.y - point.y + 0.6, c.z - point.z);
      const force = 1 - Math.min(1, d.length() / RAYON);
      d.normalize();
      if (info.pnj) info.pnj.passerEnRagdoll(d.multiplyScalar(180 * force), 'chute');
      else if (info.objet && !corps.isFixed() && !info.objet.range) {
        corps.applyImpulse(d.multiplyScalar(corps.mass() * 14 * force), true);
        corps.applyTorqueImpulse({ x: (Math.random() - 0.5) * corps.mass(), y: 0, z: (Math.random() - 0.5) * corps.mass() }, true);
      }
    }
    // Les corps déjà au sol sont projetés aussi
    for (const p of this.personnages()) if (p.parties) for (const part of p.parties) {
      const c = part.corps.translation();
      const d = new THREE.Vector3(c.x - point.x, c.y - point.y + 0.5, c.z - point.z);
      const force = 1 - Math.min(1, d.length() / RAYON);
      if (force > 0) part.corps.applyImpulse(d.normalize().multiplyScalar(part.masse * 9 * force), true);
    }
  }

  // --- Toile ---
  lancerToile(cote, origine, dir) {
    const e = this.etat[cote];
    const hit = world.castRay(new RAPIER.Ray(origine, dir), 90, true, undefined, undefined, undefined, undefined,
      (col) => !infos.get(col.handle)?.main && col.parent()?.handle !== this.joueur.corps.handle);
    jouerSon('toile', origine, 0.8);
    vibrer(cote, 0.5, 40);
    if (!hit) return;
    const point = origine.clone().addScaledVector(dir, hit.timeOfImpact);
    const info = infos.get(hit.collider.handle);
    if (info?.pnj) {
      info.pnj.passerEnRagdoll(dir.clone().multiplyScalar(-40), 'attrape');
      const torse = info.pnj.parties?.find((p) => p.def.nom === 'torse');
      if (torse) { e.toile = { corps: torse.corps }; this.retenir(torse.corps); }
    } else if (info?.objet && !info.objet.range && !hit.collider.parent().isFixed()) {
      e.toile = { corps: hit.collider.parent() };
      this.retenir(e.toile.corps);
    } else {
      e.toile = { ancre: point, longueur: Math.max(2, origine.distanceTo(point)) };
    }
    petites.emettre(point, 12, { couleur: 0xffffff, vitesse: 2, duree: 0.4 });
  }

  // --- Nécromancie : lévitation et contrôle à distance ---
  saisirMagie(cote, origine, dir) {
    const e = this.etat[cote];
    const hit = world.castRay(new RAPIER.Ray(origine, dir), 40, true, undefined, undefined, undefined, undefined,
      (col) => !infos.get(col.handle)?.main && col.parent()?.handle !== this.joueur.corps.handle);
    if (!hit) return;
    const info = infos.get(hit.collider.handle);
    let corps = null;
    if (info?.pnj) {
      info.pnj.passerEnRagdoll(null, 'attrape');
      corps = info.pnj.parties?.find((p) => p.def.nom === 'torse')?.corps;
    } else if (info?.objet && !info.objet.range && !hit.collider.parent().isFixed() && !corpsTenus.has(hit.collider.parent().handle)) {
      corps = hit.collider.parent();
    }
    if (!corps) return;
    e.cible = corps;
    this.retenir(corps);
    e.distance = Math.max(1.5, hit.timeOfImpact);
    jouerSon('magie', origine, 0.8);
    vibrer(cote, 0.5, 80);
  }

  guiderMagie(e, origine, dir, dt) {
    const corps = e.cible;
    const c = corps.worldCom();
    const cible = vB.copy(origine).addScaledVector(dir, e.distance);
    cible.y += Math.sin(performance.now() / 300) * 0.05;   // flotte doucement
    const masse = Math.max(0.2, corps.mass());
    const v = corps.linvel();
    const voulue = cible.sub(vA.set(c.x, c.y, c.z)).multiplyScalar(6).clampLength(0, 25);
    const dv = voulue.sub(vA.set(v.x, v.y, v.z)).add(vA.set(0, GRAVITE * dt, 0)).clampLength(0, (4000 * dt) / masse);
    corps.setLinvel({ x: v.x + dv.x, y: v.y + dv.y, z: v.z + dv.z }, true);
    const w = corps.angvel();
    corps.setAngvel({ x: w.x * 0.95, y: w.y * 0.95, z: w.z * 0.95 }, true);
    e.magie.relier(origine, vA.set(c.x, c.y, c.z));
    if (Math.random() < 0.7) grandes.emettre(vA, 2, { couleur: Math.random() < 0.5 ? VIOLET : VERT_SPECTRAL, vitesse: 0.8, duree: 0.6, rayon: 0.35 });
  }
}
