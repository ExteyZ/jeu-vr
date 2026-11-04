// Profil de qualité : "ultra" quand le jeu tourne sur un PC (casque branché par Quest Link / Air Link,
// la carte graphique du PC calcule l'image), "quest" quand il tourne dans le navigateur du casque seul.
// On peut forcer avec l'adresse : ?qualite=ultra ou ?qualite=quest
const demande = new URLSearchParams(location.search).get('qualite');
const casqueSeul = /OculusBrowser|Quest|Pacific|Android|Mobile/i.test(navigator.userAgent);
export const ULTRA = demande ? demande === 'ultra' : !casqueSeul;

export const PROFIL = ULTRA ? {
  nom: 'Ultra',
  textures: '2k',               // résolution des matériaux photo
  ciel: '4k',                   // résolution du ciel photo
  segmentsRelief: 896,          // zone détaillée de 2,8 km : un point tous les 3,1 m
  ombre: { taille: 4096, portee: 70 },
  herbe: { touffes: 50000, rayon: 30 },
  arbres: { nombre: 26000, portee3D: 62, impostor: 1024 },
  sousBois: { rayon: 90, densite: 1 },
  lampes: true,
} : {
  nom: 'Quest',
  textures: '1k',
  ciel: '1k',
  segmentsRelief: 384,
  ombre: { taille: 1024, portee: 16 },
  herbe: { touffes: 7000, rayon: 11 },
  arbres: { nombre: 4500, portee3D: 0, impostor: 512 },
  sousBois: { rayon: 35, densite: 0.35 },
  lampes: true,
};
