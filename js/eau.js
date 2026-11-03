// Le lac : surface qui ondule et reflète le ciel, et flottaison (poussée d'Archimède + freinage dans l'eau).
import * as THREE from 'three';
import { scene, GRAVITE } from './monde.js';
import { NIVEAU_LAC, LAC, distanceLac } from './terrain.js';
import { jouerSon } from './sons.js';

const RHO_EAU = 1000;
let normales = null;

export function construireEau(textureNormales) {
  const geo = new THREE.CircleGeometry(1, 128);
  geo.rotateX(-Math.PI / 2);
  geo.scale(LAC.rx * 1.08, 1, LAC.rz * 1.08);
  geo.translate(LAC.cx, NIVEAU_LAC, LAC.cz);
  const mat = new THREE.MeshStandardMaterial({ color: 0x1b4a5c, roughness: 0.05, metalness: 0.15, transparent: true, opacity: 0.9, envMapIntensity: 1.4 });
  if (textureNormales) {
    normales = textureNormales;
    normales.wrapS = normales.wrapT = THREE.RepeatWrapping;
    normales.repeat.set(70, 40);
    mat.normalMap = normales;
    mat.normalScale.set(0.45, 0.45);
  }
  const eau = new THREE.Mesh(geo, mat);
  eau.receiveShadow = true;
  eau.renderOrder = 1;
  scene.add(eau);
}

export function animerEau(temps) {
  if (normales) normales.offset.set(temps * 0.0035, temps * 0.0021);
}

export function dansLeLac(x, z) {
  return distanceLac(x, z) < 1.04;
}

// Fait flotter un corps : volume = volume d'eau qu'il déplace quand il est entièrement immergé (m³)
export function flotter(corps, volume, dt, objet = null) {
  const c = corps.worldCom();
  if (c.y > NIVEAU_LAC + 2 || !dansLeLac(c.x, c.z)) { if (objet) objet.dansLEau = false; return; }
  const demi = Math.max(0.05, Math.cbrt(volume) * 0.5);
  const immersion = THREE.MathUtils.clamp((NIVEAU_LAC - (c.y - demi)) / (2 * demi), 0, 1);
  if (immersion <= 0) { if (objet) objet.dansLEau = false; return; }
  if (objet && !objet.dansLEau) {
    const v = corps.linvel();
    const vitesse = Math.hypot(v.x, v.y, v.z);
    if (vitesse > 1.5) jouerSon('eau', { x: c.x, y: NIVEAU_LAC, z: c.z }, Math.min(1, vitesse / 8));
    objet.dansLEau = true;
  }
  corps.applyImpulse({ x: 0, y: RHO_EAU * GRAVITE * volume * immersion * dt, z: 0 }, true);
  // L'eau freine les mouvements (et les rotations)
  const v = corps.linvel(), w = corps.angvel();
  const k = Math.min(0.9, 2.2 * immersion * dt), kr = Math.min(0.9, 1.6 * immersion * dt);
  corps.setLinvel({ x: v.x * (1 - k), y: v.y * (1 - k * 1.5), z: v.z * (1 - k) }, true);
  corps.setAngvel({ x: w.x * (1 - kr), y: w.y * (1 - kr), z: w.z * (1 - kr) }, true);
}
