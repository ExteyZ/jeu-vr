# Complexe Delta VR

Un jeu de physique en réalité virtuelle (WebXR) pour Meta Quest, qui marche directement dans le navigateur du casque.
Adresse : **exteyz.github.io**

- Une vallée suisse immense : montagnes, forêts de sapins, un grand lac où l'on nage, une barque qui flotte,
  un ponton et un village de chalets. Le Complexe Delta (hall, cour, entrepôt, bureaux, parcours) est au fond de la vallée.
- Mains physiques à 5 doigts : elles se bloquent contre les murs, poussent les objets, sentent leur poids
  et referment les doigts autour de ce qu'elles tiennent.
- Lancers, escalade, attraction d'objets à distance, inventaire sur le corps (hanches, dos, poitrine) et sac à dos.
- Super-pouvoirs : feu bleu, super-héros (vol, force), toile, nécromancie (lévitation), super vitesse.
- Des habitants (hommes et femmes) qui marchent, parlent, réagissent et tombent comme de vrais corps, avec des muscles
  qui se raidissent puis se relâchent.
- Sons d'impact selon la matière, en 3D.

## Commandes (manettes Quest)

| Commande | Action |
| --- | --- |
| Gâchette du majeur | Attraper / grimper |
| Gâchette de l'index | Utiliser l'objet tenu, ou lancer le pouvoir (main vide), ou cliquer sur le panneau |
| Joystick gauche | Marcher, nager (clic = courir) |
| Joystick droit | Tourner ; vers le bas = s'accroupir |
| A | Sauter |
| B | Pouvoir activé / coupé |
| Y | Panneau : inventaire, sac à dos, objets à faire apparaître |
| X | Panneau : super-pouvoirs |

Le panneau a aussi un onglet **Options** : rotation fluide ou par crans, qualité d'image, tout remettre en place,
et téléportation (hall, ponton, village, sommet).

- **Ranger un objet** : lâche-le près d'une hanche, d'une épaule (dans le dos) ou de la poitrine. Serre la main au même endroit pour le reprendre.
- **Attirer un objet** : vise-le main serrée (il s'entoure de jaune), puis donne un coup de poignet vers toi.

## Code

- `js/monde.js` : moteur physique (Rapier) et création des objets
- `js/mains.js` : mains physiques, doigts, attraction à distance
- `js/joueur.js` : corps du joueur (collisions, élan, saut, escalade, vol, toile, nage)
- `js/inventaire.js` : emplacements sur le corps et sac à dos
- `js/interface.js` : panneau VR (inventaire, pouvoirs, options) avec pointeur laser
- `js/catalogue.js` : objets qu'on fait apparaître depuis l'inventaire
- `js/pouvoirs.js` : super-pouvoirs ; `js/effets.js` : particules, lueurs, rayons
- `js/terrain.js` : relief de la vallée, forêts, rochers ; `js/eau.js` : lac et flottaison ; `js/village.js` : chalets et ponton
- `js/personnages.js` : habitants (animations, dialogues, réactions, chute physique)
- `js/sons.js` : sons d'impact et voix
- `js/carte.js` : le Complexe Delta et tous ses objets
- `js/materiaux.js` : textures dessinées par le code (objets simples)
- `js/ressources.js` : chargement du ciel photo, des matériaux et des modèles réalistes
- `js/main.js` : rendu, contrôles et boucle de jeu

## Ressources et crédits

- Moteur 3D : [three.js](https://threejs.org) (MIT) ; physique : [Rapier](https://rapier.rs) (Apache 2.0)
- Ciel photo, matériaux et objets 3D : [Poly Haven](https://polyhaven.com) (CC0)
- Mains : modèle « generic-hand » de [WebXR Input Profiles](https://github.com/immersive-web/webxr-input-profiles) (MIT)
- Voiture : modèle Ferrari des exemples three.js
- Personnages : [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) (MIT) ; modèles et animations chargés
  depuis le dépôt Microsoft, textures réduites en 1024 px dans `assets/personnages`
