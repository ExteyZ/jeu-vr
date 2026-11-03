// Catalogue de l'inventaire : objets qu'on fait apparaître devant soi (les plus anciens disparaissent au-delà de 30).
import * as THREE from 'three';
import { objets, supprimerObjet, creerObjet } from './monde.js';
import { objetModele, caisse, carton, balle, baril, marteau, lampeTorche, materiauxCarte } from './carte.js';
import { jouerSon } from './sons.js';
import { corpsTenus } from './mains.js';
import { petites } from './effets.js';

const MAX_APPARUS = 30;
const tete = new THREE.Vector3(), devant = new THREE.Vector3();

export function creerCatalogue(joueur) {
  const apparus = [];
  const M = () => materiauxCarte();
  const boule = (rayon, couleur, masse, nom, son, rebond) => (p) =>
    creerObjet({ pos: p, masse, son, rebond, nom, formes: [{ type: 'boule', rayon, materiau: M().couleur(couleur, 0.25) }] });
  // Chaque recette reçoit la position du bas de l'objet
  const recettes = [
    ['Balle', (p) => balle([p[0], p[1] + 0.1, p[2]], 0xe74c3c, 0.1, 0.4)],
    ['Ballon de foot', (p) => objetModele('football', p, { masse: 0.43, taille: 0.22, forme: 'boule', rebond: 0.7, son: 'caoutchouc', nom: 'ballon de foot' })
      ?? boule(0.11, 0xffffff, 0.43, 'ballon de foot', 'caoutchouc', 0.7)([p[0], p[1] + 0.11, p[2]])],
    ['Caisse', (p) => caisse([p[0], p[1] + 0.21, p[2]])],
    ['Carton', (p) => carton([p[0], p[1] + 0.15, p[2]])],
    ['Batte', (p) => objetModele('baseball_bat', p, { masse: 0.9, taille: 0.84, son: 'bois', nom: 'batte' })],
    ['Marteau', (p) => marteau([p[0], p[1] + 0.05, p[2]])],
    ['Masse', (p) => objetModele('sledgehammer_01', p, { masse: 5, taille: 0.9, son: 'metal', nom: 'masse' })],
    ['Lampe', (p) => lampeTorche([p[0], p[1] + 0.1, p[2]])],
    ['Baril', (p) => baril([p[0], p[1] + 0.44, p[2]], M().acierOrange)],
    ['Pneu', (p) => objetModele('old_tyre', p, { masse: 9, taille: 0.65, son: 'caoutchouc', nom: 'pneu', rebond: 0.35 })],
    ['Chaise', (p) => objetModele('modern_arm_chair_01', p, { masse: 12, hauteur: 0.95, son: 'plastique', nom: 'chaise', friction: 0.4 })],
    ['Boule de bowling', boule(0.11, 0x1d1f3a, 6, 'boule de bowling', 'pierre', 0.1)],
  ];
  const liste = recettes.map(([nom, recette]) => ({
    nom,
    creer() {
      joueur.teteMonde(tete);
      joueur.directionRegard(devant);
      const p = tete.clone().addScaledVector(devant, 1.1);
      p.y -= 0.9;
      const avant = objets.length;
      const o = recette([p.x, p.y, p.z]) ?? objets[objets.length - 1];
      if (!o || objets.length === avant) return null;   // modèle indisponible
      o.depart.pos = [p.x, p.y + 0.3, p.z];   // "tout remettre en place" le ramène ici
      apparus.push(o);
      // Au-delà de 30, le plus ancien objet libre (ni tenu, ni rangé) disparaît
      if (apparus.length > MAX_APPARUS) {
        const i = apparus.findIndex((a) => !a.range && !corpsTenus.has(a.corps.handle));
        if (i >= 0) supprimerObjet(apparus.splice(i, 1)[0]);
      }
      petites.emettre(p.clone().setY(p.y + 0.3), 25, { couleur: 0xbfe6ff, vitesse: 1.2, duree: 0.5, rayon: 0.2 });
      jouerSon('magie', p, 0.4);
      return o;
    },
  }));
  // Fait disparaître tous les objets apparus (sauf ceux qu'on tient)
  liste.vider = () => {
    for (let i = apparus.length - 1; i >= 0; i--) {
      if (corpsTenus.has(apparus[i].corps.handle)) continue;
      supprimerObjet(apparus[i]);
      apparus.splice(i, 1);
    }
  };
  return liste;
}
