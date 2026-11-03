# Complexe Delta VR

Un jeu de physique en réalité virtuelle (WebXR) pour Meta Quest, qui marche directement dans le navigateur du casque.
Adresse : **exteyz.github.io**

- Une vallée suisse immense, inspirée du lac d'Oeschinen : un lac turquoise d'eau de glacier au pied d'un cirque de
  falaises calcaires en couches (corniches herbeuses, neige en altitude), un belvédère avec vue sur le lac,
  des forêts de sapins, une barque qui flotte,
  un ponton et un village de chalets. Le Complexe Delta (hall, cour, entrepôt, bureaux, parcours) est au fond de la vallée.
- Mains physiques à 5 doigts, comme dans Bonelab : chaque doigt suit le capteur de la manette sous lui (index posé ou non
  sur la gâchette, pouce posé ou levé, majeur, annulaire et auriculaire avec la gâchette du majeur), donc on peut pointer,
  faire un pouce levé ou serrer le poing ; les doigts s'écartent main ouverte. Elles se bloquent contre les murs, poussent les objets, sentent leur poids
  et referment les doigts autour de ce qu'elles tiennent.
- Lancers, escalade, attraction d'objets à distance, inventaire sur le corps (hanches, dos, poitrine) et sac à dos.
- Super-pouvoirs : feu bleu, super-héros (vol, force), toile, nécromancie (lévitation), super vitesse.
- Des habitants (hommes et femmes) qui marchent, parlent, réagissent et tombent comme de vrais corps, avec des muscles
  qui se raidissent puis se relâchent.
- Sons d'impact selon la matière, en 3D.

## Graphismes : deux modes

Le jeu choisit tout seul :

- **Ultra** quand la page est ouverte sur un PC (casque branché par Quest Link ou Air Link) : c'est la carte graphique
  du PC qui dessine. Vrais sapins en 3D (rameaux et écorce photo), herbe dense jusqu'à 80 m, fougères, rochers moussus,
  troncs morts, fleurs, galets sur les rives, relief fin avec sept sols photo en 2K et leur relief, ombres douces sur 70 m,
  ombres des montagnes sur toute la vallée, herbe jusqu'à 140 m, ciel photo 4K,
  lac qui reflète la vallée. Sur l'écran du PC (sans casque), l'image passe en plus par un post-traitement
  « cinéma » : ombre des creux et des contacts, lueurs, étalonnage des couleurs.
  Premier lancement : environ 350 Mo à télécharger (ensuite gardés par le navigateur).
- **Quest** quand la page est ouverte dans le navigateur du casque seul : même monde, plus léger.

On peut forcer un mode avec l'adresse : `?qualite=ultra` ou `?qualite=quest`.

**Jouer en Ultra** : fermer les autres jeux, brancher le casque au PC et lancer Quest Link (dans l'application Meta
Quest Link du PC, Réglages → Général → « OpenXR Runtime » doit être réglé sur Meta Quest Link), ouvrir
exteyz.github.io dans Chrome ou Edge sur le PC, puis appuyer sur « ENTER VR ».

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
et téléportation (hall, ponton, village, belvédère, sommet).

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
- `js/profil.js` : choix du mode graphique (Ultra sur PC, Quest dans le casque seul) ; `js/rendu.js` : post-traitement sur l'écran du PC
- `js/terrain.js` : relief de la vallée et ses sols ; `js/eau.js` : lac, reflets et flottaison ; `js/village.js` : chalets, ponton et barque
- `js/arbres.js` : sapins réalistes et leurs imposteurs ; `js/herbe.js` : herbe ; `js/sousbois.js` : plantes, rochers et bois morts
- `js/personnages.js` : habitants (animations, dialogues, réactions, chute physique)
- `js/sons.js` : sons d'impact et voix
- `js/carte.js` : le Complexe Delta et tous ses objets
- `js/materiaux.js` : textures dessinées par le code (objets simples)
- `js/ressources.js` : chargement du ciel photo, des matériaux et des modèles réalistes
- `js/main.js` : rendu, contrôles et boucle de jeu

## Ressources et crédits

- Moteur 3D : [three.js](https://threejs.org) (MIT) ; physique : [Rapier](https://rapier.rs) (Apache 2.0)
- Ciel photo, matériaux et objets 3D : [Poly Haven](https://polyhaven.com) (CC0), dont les rameaux du modèle `fir_tree_01`
  (sapins), les plantes, rochers et bois morts de la vallée
- Allègement des modèles au chargement : [meshoptimizer](https://github.com/zeux/meshoptimizer) (MIT)
- Mains : modèle « generic-hand » de [WebXR Input Profiles](https://github.com/immersive-web/webxr-input-profiles) (MIT)
- Voiture : modèle Ferrari des exemples three.js
- Personnages : [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) (MIT) ; modèles et animations chargés
  depuis le dépôt Microsoft, textures réduites en 1024 px dans `assets/personnages`
