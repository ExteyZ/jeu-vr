// Corps du joueur : une capsule qui suit la tête, bute contre les murs, monte les marches, garde son élan
// (chute, saut, vol, balancement au bout d'une toile), nage dans le lac, et peut être tirée par les mains quand on grimpe.
import * as THREE from 'three';
import { RAPIER, world, CG_JOUEUR, GRAVITE } from './monde.js';
import { corpsTenus } from './mains.js';
import { NIVEAU_LAC } from './terrain.js';
import { dansLeLac } from './eau.js';

const RAYON = 0.2;
const DEMI_HAUTEUR = 0.45;
const CENTRE = DEMI_HAUTEUR + RAYON;    // hauteur du centre de la capsule au-dessus des pieds
const VITESSE = 2.2, VITESSE_COURSE = 4.2, VITESSE_NAGE = 1.6, VITESSE_VOL = 32;
const SAUT = 4.2;

const tete = new THREE.Vector3(), avant = new THREE.Vector3(), droite = new THREE.Vector3(), voulu = new THREE.Vector3();
const qTete = new THREE.Quaternion(), dirStick = new THREE.Vector3(), tmp = new THREE.Vector3();

export class Joueur {
  constructor(rig, camera, depart) {
    this.rig = rig;
    this.camera = camera;
    this.depart = depart.clone();
    this.corps = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(depart.x, depart.y + CENTRE, depart.z));
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(DEMI_HAUTEUR, RAYON)
      .setCollisionGroups(CG_JOUEUR), this.corps);

    this.cc = world.createCharacterController(0.02);
    this.cc.enableAutostep(0.3, 0.15, false);
    this.cc.enableSnapToGround(0.25);
    this.cc.setMaxSlopeClimbAngle(50 * Math.PI / 180);
    this.cc.setApplyImpulsesToDynamicBodies(true);

    this.v = new THREE.Vector3();   // élan (m/s), en plus de la marche au joystick
    this.auSol = false;
    this.grimpait = false;
    this.vGrimpe = new THREE.Vector3();
    this.nage = false;
    rig.position.copy(depart);
  }

  teteMonde(out) {
    return out.copy(this.camera.position).applyMatrix4(this.rig.matrixWorld);
  }

  directionRegard(out, avecHauteur = false) {
    qTete.copy(this.rig.quaternion).multiply(this.camera.quaternion);
    out.set(0, 0, -1).applyQuaternion(qTete);
    if (!avecHauteur) out.y = 0;
    return out.lengthSq() > 1e-6 ? out.normalize() : out.set(0, 0, -1);
  }

  // Tourne d'un coup autour de la tête (pour ne pas se déplacer en tournant)
  tourner(angle) {
    this.rig.updateMatrixWorld(true);
    this.teteMonde(tete);
    this.rig.position.sub(tete).applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle).add(tete);
    this.rig.rotation.y += angle;
  }

  // stick : joystick (-1..1) ; escalade : décalage demandé par les mains accrochées ; accroupi : baisse de la vue (m)
  // vol : { dir, poussee } (super-héros) ; toile : { ancre, longueur } ; planer : chute lente ; multVitesse / multSaut : super vitesse
  maj(dt, { stick, course, saut, escalade, accroupi = 0, vol = null, toile = null, planer = false, multVitesse = 1, multSaut = 1 }) {
    this.rig.updateMatrixWorld(true);
    this.teteMonde(tete);
    const c = this.corps.translation();
    const pieds = c.y - CENTRE;
    this.nage = !escalade && !vol && dansLeLac(c.x, c.z) && pieds < NIVEAU_LAC - 1.0;

    // 1. La capsule rejoint la tête (quand on marche pour de vrai dans la pièce)
    voulu.set(tete.x - c.x, 0, tete.z - c.z);

    // 2. Joystick
    this.directionRegard(avant);
    droite.set(-avant.z, 0, avant.x);
    const vitesse = (course ? VITESSE_COURSE : VITESSE) * multVitesse;
    dirStick.set(0, 0, 0).addScaledVector(droite, stick.x).addScaledVector(avant, -stick.y);

    if (escalade) {
      // Mains accrochées : le corps suit les mains, sans gravité
      voulu.add(escalade);
      this.vGrimpe.copy(escalade).divideScalar(dt);
      this.v.set(0, 0, 0);
      this.grimpait = true;
    } else {
      if (this.grimpait) this.v.copy(this.vGrimpe).clampLength(0, 6);   // on garde l'élan en lâchant la prise
      this.grimpait = false;

      if (vol && vol.poussee > 0.05) {
        // Vol : on accélère vers la direction visée
        this.v.lerp(tmp.copy(vol.dir).multiplyScalar(VITESSE_VOL * vol.poussee * Math.max(1, multVitesse * 0.5)), Math.min(1, dt * 2.2));
        voulu.addScaledVector(dirStick, vitesse * dt);
      } else if (this.nage) {
        // Nage : on avance où l'on regarde, la tête reste hors de l'eau (sauf si l'on plonge)
        this.directionRegard(tmp, true);
        const plonge = -stick.y > 0.3 && tmp.y < -0.5;
        voulu.addScaledVector(droite, stick.x * VITESSE_NAGE * dt).addScaledVector(plonge ? tmp : avant, -stick.y * VITESSE_NAGE * dt);
        this.v.multiplyScalar(1 - Math.min(1, dt * 2.5));
        if (!plonge) this.v.y += (NIVEAU_LAC - 1.45 - pieds) * 3 * dt;
      } else {
        voulu.addScaledVector(dirStick, vitesse * dt);
        if (toile) this.v.addScaledVector(dirStick, 4 * dt);   // on peut s'orienter un peu en se balançant
        if (this.auSol && !toile) {
          const frottement = Math.exp(-dt * 9);
          this.v.x *= frottement; this.v.z *= frottement;
          if (this.v.y <= 0) this.v.y = -0.5;
        } else {
          const air = Math.exp(-dt * 0.15);
          this.v.x *= air; this.v.z *= air;
        }
        if (saut && this.auSol) this.v.y = SAUT * multSaut;
        if (planer && !this.auSol && !toile) {
          // Le super-héros freine vite en l'air, puis redescend en planant
          const frein = Math.exp(-dt * 0.9);
          this.v.x *= frein; this.v.z *= frein;
          this.v.y = this.v.y > 0 ? this.v.y * Math.exp(-dt * 1.5) - GRAVITE * dt : Math.max(this.v.y - GRAVITE * 0.3 * dt, -4);
        } else this.v.y -= GRAVITE * dt;
      }
      voulu.addScaledVector(this.v, dt);
    }

    // 3. Collisions (on ignore les objets qu'on tient pour ne pas "voler" dessus)
    this.cc.computeColliderMovement(this.collider, voulu, undefined, CG_JOUEUR,
      (col) => !corpsTenus.has(col.parent()?.handle));
    const m = this.cc.computedMovement();
    this.auSol = this.cc.computedGrounded();
    const n = new THREE.Vector3(c.x + m.x, c.y + m.y, c.z + m.z);
    if (!escalade) {
      if (this.v.y < 0 && m.y > voulu.y + 1e-4) this.v.y = 0;          // atterrissage
      if (this.v.y > 0 && m.y < voulu.y - 1e-3) this.v.y = 0;          // tête contre un plafond
      const voulH = Math.hypot(voulu.x, voulu.z), faitH = Math.hypot(m.x, m.z);
      if (voulH > 0.01 && faitH < voulH * 0.5) { this.v.x *= 0.5; this.v.z *= 0.5; }   // contre un mur
    }

    // 4. Toile : on ne peut pas s'éloigner du point d'accroche plus que la longueur du fil (balancier)
    if (toile && !escalade) {
      const centreCorde = tmp.copy(n).add({ x: 0, y: 0.7, z: 0 });
      const d = centreCorde.sub(toile.ancre);
      const L = d.length();
      if (L > toile.longueur) {
        d.divideScalar(L);
        n.addScaledVector(d, toile.longueur - L);
        const radiale = this.v.dot(d);
        if (radiale > 0) this.v.addScaledVector(d, -radiale);
      }
    }
    this.corps.setNextKinematicTranslation(n);

    // 5. Le "rig" VR suit le corps : la tête reste au-dessus de la capsule
    this.rig.position.x += n.x - tete.x;
    this.rig.position.z += n.z - tete.z;
    this.rig.position.y = n.y - CENTRE - accroupi;

    if (this.rig.position.y < -80) this.reapparaitre();
  }

  teleporter(x, y, z) {
    this.corps.setTranslation({ x, y: y + CENTRE + 0.05, z }, true);
    this.rig.updateMatrixWorld(true);
    this.teteMonde(tete);
    this.rig.position.x += x - tete.x;
    this.rig.position.z += z - tete.z;
    this.rig.position.y = y;
    this.v.set(0, 0, 0);
  }

  reapparaitre() {
    this.teleporter(this.depart.x, this.depart.y, this.depart.z);
  }

  // Pieds du joueur, en coordonnées du monde
  pieds(out) {
    const c = this.corps.translation();
    return out.set(c.x, c.y - CENTRE, c.z);
  }
}
