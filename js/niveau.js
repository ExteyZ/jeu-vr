// La salle de test : un bac à sable pour essayer toute la physique.
import * as THREE from 'three';
import { RAPIER, world, scene, creerObjet } from './monde.js';
import { creerMateriaux, texturePanneau } from './materiaux.js';

const boite = (taille, materiau, extra = {}) => ({ type: 'boite', taille, materiau, ...extra });

export function construireNiveau() {
  const M = creerMateriaux();
  const animations = [];

  // --- Sol et murs (salle de 16 x 16 m) ---
  creerObjet({ pos: [0, -0.1, 0], formes: [boite([16, 0.2, 16], M.sol, { ombre: false })], friction: 0.9 });
  creerObjet({ pos: [0, 2, -8.2], formes: [boite([16.8, 4, 0.4], M.mur)] });
  creerObjet({ pos: [0, 2, 8.2], formes: [boite([16.8, 4, 0.4], M.mur)] });
  creerObjet({ pos: [-8.2, 2, 0], formes: [boite([0.4, 4, 16], M.mur)] });
  creerObjet({ pos: [8.2, 2, 0], formes: [boite([0.4, 4, 16], M.mur)] });

  // --- Table avec des petits objets ---
  const pieds = [[-0.72, -0.32], [0.72, -0.32], [-0.72, 0.32], [0.72, 0.32]]
    .map(([x, z]) => boite([0.06, 0.72, 0.06], M.bois, { pos: [x, -0.39, z] }));
  creerObjet({ pos: [0, 0.75, 2.6], formes: [boite([1.6, 0.06, 0.8], M.bois), ...pieds] });

  for (const p of [[-0.6, 0.885, 2.5], [-0.37, 0.885, 2.5], [-0.485, 1.09, 2.5], [-0.55, 0.885, 2.78]])
    creerObjet({ pos: p, masse: 0.4, formes: [boite([0.2, 0.2, 0.2], M.carton)], nom: 'carton' });
  creerObjet({ pos: [0.1, 0.85, 2.72], masse: 0.25, rebond: 0.8, formes: [{ type: 'boule', rayon: 0.065, materiau: M.couleur(0xd63c3c, 0.5) }], nom: 'balle' });
  creerObjet({ pos: [0.3, 0.85, 2.5], masse: 0.25, rebond: 0.8, formes: [{ type: 'boule', rayon: 0.065, materiau: M.couleur(0x3c7bd6, 0.5) }], nom: 'balle' });
  creerObjet({ pos: [0.55, 0.845, 2.75], masse: 0.9, formes: [boite([0.12, 0.12, 0.12], M.bois)], nom: 'cube' });
  creerObjet({ pos: [0.62, 0.84, 2.45], masse: 0.3, formes: [{ type: 'cylindre', rayon: 0.045, hauteur: 0.11, materiau: M.couleur(0xf0efe8, 0.3) }], nom: 'tasse' });
  creerObjet({ pos: [0.05, 0.81, 2.32], masse: 0.9, formes: [boite([0.9, 0.045, 0.045], M.bois)], nom: 'baton' });

  // --- Objets au sol ---
  // Haltère de 12 kg (barre + deux disques)
  const surX = [0, 0, Math.PI / 2];
  creerObjet({
    pos: [1.4, 0.1, 3.7], masse: 12, nom: 'haltere', formes: [
      { type: 'cylindre', rayon: 0.017, hauteur: 0.44, rot: surX, materiau: M.chrome },
      { type: 'cylindre', rayon: 0.1, hauteur: 0.07, rot: surX, pos: [-0.17, 0, 0], materiau: M.fonte },
      { type: 'cylindre', rayon: 0.1, hauteur: 0.07, rot: surX, pos: [0.17, 0, 0], materiau: M.fonte },
    ],
  });
  // Longue planche de 6 kg (essaie de la tenir par un bout, puis à deux mains)
  creerObjet({ pos: [-1.6, 0.025, 3.8], masse: 6, formes: [boite([2, 0.04, 0.22], M.bois)], nom: 'planche' });

  // Pyramide de caisses en bois (8 kg chacune)
  const C = 0.42, E = 0.44;
  const rangs = [[-E, 0], [0, 0], [E, 0], [-E / 2, 1], [E / 2, 1], [0, 2]];
  for (const [dx, etage] of rangs)
    creerObjet({ pos: [-3.2 + dx, C / 2 + etage * (C + 0.005), 0], masse: 8, formes: [boite([C, C, C], M.caisse)], nom: 'caisse' });

  // Caisse en métal de 50 kg : trop lourde pour une main, possible à deux
  creerObjet({ pos: [3.2, 0.3, 0.6], masse: 50, friction: 0.6, formes: [boite([0.7, 0.6, 0.6], M.metal)], nom: 'caisse-metal' });

  // Boule de bowling (6 kg)
  creerObjet({ pos: [-3.0, 0.11, -2.4], masse: 6, rebond: 0.1, formes: [{ type: 'boule', rayon: 0.11, materiau: M.couleur(0x1d1f3a, 0.2) }], nom: 'bowling' });

  // --- Bascule (planche sur un pivot) ---
  const support = creerObjet({ pos: [-4.5, 0.25, -3.5], formes: [boite([0.3, 0.5, 0.5], M.fonte)] });
  const bascule = creerObjet({ pos: [-4.5, 0.55, -3.5], masse: 12, formes: [boite([3.2, 0.06, 0.45], M.bois)], nom: 'bascule' });
  const pivot = world.createImpulseJoint(
    RAPIER.JointData.revolute({ x: 0, y: 0.27, z: 0 }, { x: 0, y: -0.03, z: 0 }, { x: 0, y: 0, z: 1 }),
    support.corps, bascule.corps, true);
  pivot.setContactsEnabled(false);

  // --- Sac de frappe suspendu (25 kg) ---
  creerObjet({ pos: [4, 2.1, -3], formes: [boite([1.6, 0.1, 0.1], M.fonte)] });
  const poutre = creerObjet({ pos: [3.25, 1.025, -3], formes: [boite([0.1, 2.05, 0.1], M.fonte)] });
  creerObjet({ pos: [4.75, 1.025, -3], formes: [boite([0.1, 2.05, 0.1], M.fonte)] });
  const HAUT_SAC = 0.375 + 0.18, CORDE = 0.3;
  const sac = creerObjet({ pos: [4, 2.05 - CORDE - HAUT_SAC, -3], masse: 25, amortissement: 0.6, nom: 'sac',
    formes: [{ type: 'capsule', rayon: 0.18, hauteur: 0.75, materiau: M.sac }] });
  world.createImpulseJoint(
    RAPIER.JointData.spherical({ x: 0.75, y: 1.025, z: 0 }, { x: 0, y: HAUT_SAC + CORDE, z: 0 }),
    poutre.corps, sac.corps, true);
  const corde = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 8), M.corde);
  scene.add(corde);
  const accrocheCorde = new THREE.Vector3(4, 2.05, -3), basCorde = new THREE.Vector3(), haut = new THREE.Vector3(0, 1, 0);
  animations.push(() => {
    basCorde.set(0, HAUT_SAC, 0).applyQuaternion(sac.groupe.quaternion).add(sac.groupe.position);
    corde.position.copy(accrocheCorde).add(basCorde).multiplyScalar(0.5);
    corde.scale.y = accrocheCorde.distanceTo(basCorde);
    corde.quaternion.setFromUnitVectors(haut, basCorde.clone().sub(accrocheCorde).normalize().negate());
  });

  // --- Plateforme avec escalier et rampe ---
  creerObjet({ pos: [-1, 0.75, -7], formes: [boite([4, 1.5, 2], M.mur)] });
  for (let k = 1; k <= 5; k++) {
    const h = 1.5 - k * 0.25;
    creerObjet({ pos: [-2.4, h / 2, -6 + 0.35 * (k - 0.5)], formes: [boite([1.2, h, 0.35], M.bois)] });
  }
  const pente = Math.atan2(1.5, 4), longueur = Math.hypot(1.5, 4);
  creerObjet({ pos: [0.4, 0.75 - 0.05 * Math.cos(pente), -4 - 0.05 * Math.sin(pente)], rot: [pente, 0, 0],
    formes: [boite([1.2, 0.1, longueur], M.bois)] });

  // --- Tour d'escalade (3,5 m) avec des prises de couleur ---
  creerObjet({ pos: [6, 1.75, -7.25], formes: [boite([3, 3.5, 1.5], M.tour)] });
  const couleurs = [0xe74c3c, 0xf1c40f, 0x2ecc71, 0x3498db, 0x9b59b6, 0xe67e22];
  const prises = [];
  for (let i = 0; i < 14; i++) {
    const y = 0.5 + i * 0.22;
    const x = 6 + (i % 2 ? 0.35 : -0.35) + Math.sin(i * 1.7) * 0.25;
    prises.push(boite([0.14, 0.06, 0.1], M.couleur(couleurs[i % couleurs.length], 0.8), { pos: [x - 6, y - 1.75, 0.8] }));
  }
  creerObjet({ pos: [6, 1.75, -7.25], formes: prises, friction: 1.2 });
  // Récompense en haut : un gros ballon léger
  creerObjet({ pos: [6, 3.75, -7.4], masse: 0.3, rebond: 0.7, formes: [{ type: 'boule', rayon: 0.25, materiau: M.couleur(0xf2b134, 0.5) }], nom: 'ballon' });

  // --- Panneau des commandes ---
  const panneau = new THREE.Mesh(new THREE.PlaneGeometry(2, 1),
    new THREE.MeshBasicMaterial({ map: texturePanneau('Bac à sable physique', [
      'Gâchette du majeur : attraper / grimper',
      'Joystick gauche : marcher (clic = courir)',
      'Joystick droit : tourner',
      'A : sauter      B : tout remettre en place',
      'Caisse de 50 kg : il faut les deux mains !',
      'Escalade : attrape les prises de la tour',
    ]) }));
  panneau.position.set(-2.6, 1.6, 2.4);
  panneau.rotation.y = 0.45;
  scene.add(panneau);

  return { animations };
}
