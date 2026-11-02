# Bac à sable VR

Un bac à sable physique en réalité virtuelle (WebXR) pour Meta Quest, qui marche directement dans le navigateur du casque.

- Mains physiques : elles se bloquent contre les murs et poussent les objets.
- Les objets ont un vrai poids : la main plie sous les objets lourds, et deux mains portent plus.
- Lancers, escalade, escaliers, rampe, saut.

## Jouer

Ouvre la page du jeu dans le navigateur du Quest, puis appuie sur « ENTER VR ».

| Commande | Action |
| --- | --- |
| Gâchette du majeur | Attraper / grimper |
| Joystick gauche | Marcher (clic = courir) |
| Joystick droit | Tourner |
| A | Sauter |
| B | Tout remettre en place |

## Code

- `js/monde.js` : moteur physique (Rapier) et création des objets
- `js/mains.js` : mains physiques
- `js/joueur.js` : corps du joueur (collisions, gravité, saut, escalade)
- `js/niveau.js` : la salle et ses objets
- `js/materiaux.js` : textures et couleurs
- `js/main.js` : rendu, contrôles et boucle de jeu
