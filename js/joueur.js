// Corps du joueur : une capsule qui suit la tête, bute contre les murs, monte les marches,
// tombe avec la gravité, saute, et peut être tirée par les mains quand on grimpe.
import * as THREE from 'three';
import { RAPIER, world, CG_JOUEUR, GRAVITE } from './monde.js';
import { corpsTenus } from './mains.js';

const RAYON = 0.2;
const DEMI_HAUTEUR = 0.45;
const CENTRE = DEMI_HAUTEUR + RAYON;    // hauteur du centre de la capsule au-dessus des pieds
const VITESSE = 2.2, VITESSE_COURSE = 4.2;
const SAUT = 4.2;

const tete = new THREE.Vector3(), avant = new THREE.Vector3(), droite = new THREE.Vector3(), voulu = new THREE.Vector3();
const qTete = new THREE.Quaternion();

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

    this.vy = 0;
    this.auSol = false;
    this.grimpait = false;
    this.vGrimpe = 0;
    rig.position.copy(depart);
  }

  teteMonde(out) {
    return out.copy(this.camera.position).applyMatrix4(this.rig.matrixWorld);
  }

  directionRegard(out) {
    qTete.copy(this.rig.quaternion).multiply(this.camera.quaternion);
    out.set(0, 0, -1).applyQuaternion(qTete);
    out.y = 0;
    return out.lengthSq() > 1e-6 ? out.normalize() : out.set(0, 0, -1);
  }

  // Tourne d'un coup autour de la tête (pour ne pas se déplacer en tournant)
  tourner(angle) {
    this.rig.updateMatrixWorld(true);
    this.teteMonde(tete);
    this.rig.position.sub(tete).applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle).add(tete);
    this.rig.rotation.y += angle;
  }

  // stick : {x, y} du joystick (-1..1) ; escalade : décalage demandé par les mains accrochées (ou null)
  maj(dt, { stick, course, saut, escalade }) {
    this.rig.updateMatrixWorld(true);
    this.teteMonde(tete);
    const c = this.corps.translation();

    // 1. La capsule rejoint la tête (quand on marche pour de vrai dans la pièce)
    voulu.set(tete.x - c.x, 0, tete.z - c.z);

    // 2. Joystick
    this.directionRegard(avant);
    droite.set(-avant.z, 0, avant.x);
    const vitesse = course ? VITESSE_COURSE : VITESSE;
    voulu.addScaledVector(droite, stick.x * vitesse * dt).addScaledVector(avant, -stick.y * vitesse * dt);

    // 3. Gravité, saut ou escalade
    if (escalade) {
      voulu.add(escalade);
      this.vy = 0;
      this.vGrimpe = escalade.y / dt;
      this.grimpait = true;
    } else {
      if (this.grimpait) this.vy = THREE.MathUtils.clamp(this.vGrimpe, -3, 4.5);   // élan en lâchant la prise
      this.grimpait = false;
      if (this.auSol && this.vy <= 0) this.vy = -0.5;
      if (saut && this.auSol) this.vy = SAUT;
      this.vy -= GRAVITE * dt;
      voulu.y += this.vy * dt;
    }

    // 4. Collisions (on ignore les objets qu'on tient pour ne pas "voler" dessus)
    this.cc.computeColliderMovement(this.collider, voulu, undefined, CG_JOUEUR,
      (col) => !corpsTenus.has(col.parent()?.handle));
    const m = this.cc.computedMovement();
    this.auSol = this.cc.computedGrounded();
    const n = { x: c.x + m.x, y: c.y + m.y, z: c.z + m.z };
    if (!escalade && m.y > voulu.y + 1e-4 && this.vy < 0) this.vy = 0;   // atterrissage
    if (!escalade && voulu.y > 0 && m.y < voulu.y - 1e-3) this.vy = 0;   // tête contre un plafond
    this.corps.setNextKinematicTranslation(n);

    // 5. Le "rig" VR suit le corps : la tête reste au-dessus de la capsule
    this.rig.position.x += n.x - tete.x;
    this.rig.position.z += n.z - tete.z;
    this.rig.position.y = n.y - CENTRE;

    if (this.rig.position.y < -15) this.reapparaitre();
  }

  reapparaitre() {
    this.corps.setTranslation({ x: this.depart.x, y: this.depart.y + CENTRE, z: this.depart.z }, true);
    this.rig.position.copy(this.depart);
    this.vy = 0;
  }
}
