# Complexe Delta VR

Un jeu de physique en réalité virtuelle (WebXR) pour Meta Quest, qui marche directement dans le navigateur du casque.
Adresse : **exteyz.github.io**

- Mains physiques à 5 doigts : elles se bloquent contre les murs, poussent les objets, sentent leur poids
  et referment les doigts autour de ce qu'elles tiennent.
- Lancers, escalade, attraction d'objets à distance, inventaire sur le corps (hanches, dos, poitrine).
- Une carte avec un hall, une cour, un entrepôt avec mezzanine, des bureaux (portes, tiroirs, frigo) et un parcours.
- Des habitants (hommes et femmes) qui marchent, parlent, réagissent et tombent comme de vrais corps.
- Sons d'impact selon la matière, en 3D.

## Commandes (manettes Quest)

| Commande | Action |
| --- | --- |
| Gâchette du majeur | Attraper / grimper |
| Gâchette de l'index | Utiliser l'objet tenu (lampe, lance-balles) |
| Joystick gauche | Marcher (clic = courir) |
| Joystick droit | Tourner ; vers le bas = s'accroupir |
| A | Sauter |
| B | Tout remettre en place |
| X | Revenir au hall |
| Y | Rotation fluide ou par crans |

- **Ranger un objet** : lâche-le près d'une hanche, d'une épaule (dans le dos) ou de la poitrine. Serre la main au même endroit pour le reprendre.
- **Attirer un objet** : vise-le main serrée (il s'entoure de jaune), puis donne un coup de poignet vers toi.

## Code

- `js/monde.js` : moteur physique (Rapier) et création des objets
- `js/mains.js` : mains physiques, doigts, attraction à distance
- `js/joueur.js` : corps du joueur (collisions, gravité, saut, escalade, accroupi)
- `js/inventaire.js` : emplacements sur le corps
- `js/personnages.js` : habitants (animations, dialogues, réactions, chute physique)
- `js/sons.js` : sons d'impact et voix
- `js/carte.js` : la carte et tous ses objets
- `js/materiaux.js` : textures dessinées par le code (objets simples)
- `js/ressources.js` : chargement du ciel photo, des matériaux et des modèles réalistes
- `js/main.js` : rendu, contrôles et boucle de jeu

## Ressources et crédits

- Moteur 3D : [three.js](https://threejs.org) (MIT) ; physique : [Rapier](https://rapier.rs) (Apache 2.0)
- Ciel photo, matériaux et objets 3D : [Poly Haven](https://polyhaven.com) (CC0)
- Mains : modèle « generic-hand » de [WebXR Input Profiles](https://github.com/immersive-web/webxr-input-profiles) (MIT)
- Voiture : modèle Ferrari des exemples three.js
- Personnages : [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) (MIT), préparés par
  le workflow `.github/workflows/personnages.yml` (textures réduites en 1024 px dans `assets/personnages`)
