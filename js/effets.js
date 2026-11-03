// Effets visuels : particules lumineuses (feu bleu, magie, éclats, eau), flash d'explosion, rayons et fils.
import * as THREE from 'three';
import { scene } from './monde.js';

function textureLueur() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const d = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  d.addColorStop(0, 'rgba(255,255,255,1)');
  d.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  d.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = d;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const LUEUR = textureLueur();

// Système de particules : chaque particule a une position, une vitesse, une couleur et une durée de vie
class Particules {
  constructor(max, taille) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.base = new Float32Array(max * 3);
    this.vit = new Float32Array(max * 3);
    this.vie = new Float32Array(max);
    this.duree = new Float32Array(max);
    this.gravite = new Float32Array(max);
    this.suivante = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: taille, map: LUEUR, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -9999;
    scene.add(this.points);
  }

  emettre(origine, nombre, { couleur, vitesse = 1, dispersion = 1, direction = null, duree = 0.8, gravite = 0, rayon = 0 }) {
    const c = new THREE.Color(couleur);
    for (let n = 0; n < nombre; n++) {
      const i = this.suivante;
      this.suivante = (this.suivante + 1) % this.max;
      const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1);
      const dx = Math.sin(b) * Math.cos(a), dy = Math.cos(b), dz = Math.sin(b) * Math.sin(a);
      this.pos[i * 3] = origine.x + dx * rayon; this.pos[i * 3 + 1] = origine.y + dy * rayon; this.pos[i * 3 + 2] = origine.z + dz * rayon;
      const v = vitesse * (0.4 + Math.random() * 0.6);
      this.vit[i * 3] = (direction ? direction.x : 0) * vitesse + dx * v * dispersion;
      this.vit[i * 3 + 1] = (direction ? direction.y : 0) * vitesse + dy * v * dispersion;
      this.vit[i * 3 + 2] = (direction ? direction.z : 0) * vitesse + dz * v * dispersion;
      const variation = 0.75 + Math.random() * 0.5;
      this.base[i * 3] = c.r * variation; this.base[i * 3 + 1] = c.g * variation; this.base[i * 3 + 2] = c.b * variation;
      this.duree[i] = this.vie[i] = duree * (0.6 + Math.random() * 0.8);
      this.gravite[i] = gravite;
    }
  }

  maj(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.vie[i] <= 0) continue;
      this.vie[i] -= dt;
      if (this.vie[i] <= 0) { this.pos[i * 3 + 1] = -9999; this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0; continue; }
      this.vit[i * 3 + 1] -= this.gravite[i] * dt;
      const amorti = 1 - Math.min(1, dt * 1.5);
      this.vit[i * 3] *= amorti; this.vit[i * 3 + 1] *= amorti; this.vit[i * 3 + 2] *= amorti;
      this.pos[i * 3] += this.vit[i * 3] * dt; this.pos[i * 3 + 1] += this.vit[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vit[i * 3 + 2] * dt;
      const f = this.vie[i] / this.duree[i];   // la particule s'éteint en fin de vie (mélange additif : noir = invisible)
      this.col[i * 3] = this.base[i * 3] * f; this.col[i * 3 + 1] = this.base[i * 3 + 1] * f; this.col[i * 3 + 2] = this.base[i * 3 + 2] * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

export const grandes = new Particules(700, 0.45);
export const petites = new Particules(900, 0.12);

// Un seul éclair de lumière, réutilisé (ajouter/enlever des lumières ralentirait le casque)
const flash = new THREE.PointLight(0x6fc8ff, 0, 18, 1.6);
scene.add(flash);
let dureeFlash = 0;
export function eclair(pos, couleur = 0x6fc8ff, intensite = 60) {
  flash.position.copy(pos);
  flash.color.set(couleur);
  flash.intensity = intensite;
  dureeFlash = 0.35;
}

// Rayon ou fil entre deux points (cylindre fin étiré)
export class Rayon {
  constructor(couleur, epaisseur, additif = true) {
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(epaisseur, epaisseur, 1, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: couleur, transparent: true, opacity: additif ? 0.85 : 1, depthWrite: !additif,
        blending: additif ? THREE.AdditiveBlending : THREE.NormalBlending }));
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  relier(a, b) {
    const d = new THREE.Vector3().subVectors(b, a);
    this.mesh.position.copy(a).addScaledVector(d, 0.5);
    this.mesh.scale.set(1, Math.max(0.001, d.length()), 1);
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    this.mesh.visible = true;
  }
  cacher() { this.mesh.visible = false; }
}

export function majEffets(dt) {
  grandes.maj(dt);
  petites.maj(dt);
  if (dureeFlash > 0) {
    dureeFlash -= dt;
    flash.intensity = Math.max(0, flash.intensity * (1 - dt * 9));
    if (dureeFlash <= 0) flash.intensity = 0;
  }
}
