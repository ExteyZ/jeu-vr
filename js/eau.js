// Le lac : surface qui ondule et reflète le paysage, et flottaison (poussée d'Archimède + freinage dans l'eau).
import * as THREE from 'three';
import { scene, GRAVITE } from './monde.js';
import { NIVEAU_LAC, LAC, distanceLac, hauteurSol } from './terrain.js';
import { jouerSon } from './sons.js';
import { ULTRA } from './profil.js';

const RHO_EAU = 1000;
let normales = null, materiauEau = null;
const tempsEau = { value: 0 };
// Objets qu'on ne met pas dans la photo des reflets (herbe, petites plantes, personnages)
export const horsReflet = new Set();

// Reflets du lac : au chargement, on photographie la vallée dans toutes les directions depuis le milieu du lac
// (sonde de reflets, comme dans les jeux) ; l'eau reflète ensuite montagnes, forêts et ciel sans rien recalculer.
export function capturerReflets(renderer) {
  if (!materiauEau) return;
  const cible = new THREE.WebGLCubeRenderTarget(ULTRA ? 1024 : 256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const sonde = new THREE.CubeCamera(1, 9000, cible);
  sonde.position.set(LAC.cx, NIVEAU_LAC + 2, LAC.cz + LAC.rz * 0.35);
  const caches = [...horsReflet].filter((o) => o.visible);
  caches.forEach((o) => { o.visible = false; });
  const eau = scene.getObjectByName('lac');
  eau.visible = false;
  const xr = renderer.xr.enabled;
  renderer.xr.enabled = false;
  sonde.update(renderer, scene);
  renderer.xr.enabled = xr;
  eau.visible = true;
  caches.forEach((o) => { o.visible = true; });
  materiauEau.envMap = cible.texture;
  materiauEau.envMapIntensity = 1;
  materiauEau.needsUpdate = true;
}

// Surface : couleur selon la profondeur réelle (vert d'eau sur les bords, sombre au large), transparente là où
// c'est peu profond, deux couches de vaguelettes qui se croisent, reflets du paysage et du soleil
export function construireEau(textureNormales) {
  const geo = new THREE.PlaneGeometry(LAC.rx * 2.16, LAC.rz * 2.16, 180, 100);
  geo.rotateX(-Math.PI / 2);
  geo.translate(LAC.cx, NIVEAU_LAC, LAC.cz);
  const pos = geo.attributes.position, profondeur = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) profondeur[i] = Math.max(0, NIVEAU_LAC - hauteurSol(pos.getX(i), pos.getZ(i)));
  geo.setAttribute('aProfondeur', new THREE.BufferAttribute(profondeur, 1));
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, metalness: 0, ior: 1.33, transparent: true, envMapIntensity: 1.25,
    side: THREE.DoubleSide, depthWrite: false });
  materiauEau = mat;
  if (textureNormales) {
    normales = textureNormales;
    normales.wrapS = normales.wrapT = THREE.RepeatWrapping;
    normales.repeat.set(160, 90);
    mat.normalMap = normales;
    mat.normalScale.set(0.16, 0.16);
  }
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tempsEau = tempsEau;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aProfondeur;\nvarying float vProfondeur;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvProfondeur = aProfondeur;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vProfondeur;\nuniform float tempsEau;')
      // Une vaguelette ne peut pas refléter le fond du lac : le reflet reste au-dessus de l'horizon (montagnes, ciel)
      .replace('#include <envmap_physical_pars_fragment>', THREE.ShaderChunk.envmap_physical_pars_fragment.replace(
        'reflectVec = inverseTransformDirection( reflectVec, viewMatrix );',
        'reflectVec = inverseTransformDirection( reflectVec, viewMatrix );\n\t\treflectVec = normalize( vec3( reflectVec.x, max( reflectVec.y, 0.012 ), reflectVec.z ) );'))
      .replace('#include <color_fragment>', `#include <color_fragment>
float fond = smoothstep(0.0, 14.0, vProfondeur);
// Eau de glacier : turquoise sur les bords (les fines particules de roche diffusent la lumière), bleu-vert profond au large
diffuseColor.rgb *= mix(vec3(0.035, 0.2, 0.19), vec3(0.003, 0.035, 0.05), fond);
diffuseColor.a = mix(0.5, 0.97, smoothstep(0.0, 2.5, vProfondeur));
// Écume légère au bord de l'eau
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.55, 0.52), (1.0 - smoothstep(0.0, 0.15, vProfondeur)) * 0.3);`)
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace(
        'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
        `vec3 n1 = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
vec3 n2 = texture2D( normalMap, vNormalMapUv * 0.37 + vec2(-tempsEau * 0.0011, tempsEau * 0.0017) ).xyz * 2.0 - 1.0;
// Au loin, le lac paraît plus calme : il reflète les montagnes comme un miroir
float calme = smoothstep(60.0, 500.0, length(vViewPosition));
vec3 mapN = normalize(vec3((n1.xy + n2.xy) * (1.0 - 0.75 * calme), n1.z * n2.z));`))
      // Vue rasante : l'eau devient un miroir, même là où elle est peu profonde
      .replace('#include <opaque_fragment>', `diffuseColor.a = mix(diffuseColor.a, 1.0, pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 4.0));
#include <opaque_fragment>`);
  };
  const eau = new THREE.Mesh(geo, mat);
  eau.name = 'lac';
  eau.receiveShadow = true;
  eau.renderOrder = 1;
  scene.add(eau);
}

export function animerEau(temps) {
  tempsEau.value = temps;
  if (normales) normales.offset.set(temps * 0.0035, temps * 0.0021);
}

export function dansLeLac(x, z) {
  return distanceLac(x, z) < 1.04;
}

// Fait flotter un corps : volume = volume d'eau qu'il déplace quand il est entièrement immergé (m³)
export function flotter(corps, volume, dt, objet = null) {
  const c = corps.worldCom();
  if (c.y > NIVEAU_LAC + 2 || !dansLeLac(c.x, c.z)) { if (objet) objet.dansLEau = false; return; }
  const demi = objet?.demiHauteur ?? Math.max(0.05, Math.cbrt(volume) * 0.5);   // demi-hauteur de la partie qui plonge
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
