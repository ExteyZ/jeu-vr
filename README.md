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
- `js/materiaux.js` : textures et couleurs
- `js/main.js` : rendu, contrôles et boucle de jeu

Les personnages viennent des exemples officiels de three.js (Soldier, Michelle, Xbot).
