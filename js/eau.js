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

// Reflet "miroir" sur l'écran du PC : à chaque image, on dessine la vallée vue depuis sous la surface (caméra
// symétrique par rapport à l'eau), en deux fois plus petit ; l'eau affiche cette image, déformée par les vaguelettes.
// (Dans le casque, on garde la sonde de reflets : beaucoup moins coûteuse.)
const reflet = { cible: null, camera: new THREE.PerspectiveCamera(), matrice: { value: new THREE.Matrix4() }, texture: { value: null }, actif: { value: 0 } };
const plan = new THREE.Plane(), clip = new THREE.Vector4(), q4 = new THREE.Vector4(), oeil = new THREE.Vector3(), vise = new THREE.Vector3();
const rotation = new THREE.Matrix4(), HAUT = new THREE.Vector3(0, 1, 0), surface = new THREE.Vector3(), taille = new THREE.Vector2();
export function majRefletMiroir(renderer, camera, actif) {
  reflet.actif.value = 0;
  if (!actif || !materiauEau || !ULTRA) return;
  camera.updateMatrixWorld();
  oeil.setFromMatrixPosition(camera.matrixWorld);
  if (oeil.y < NIVEAU_LAC + 0.05) return;   // sous l'eau
  renderer.getDrawingBufferSize(taille);
  const l = Math.max(1, Math.round(taille.x / 2)), h = Math.max(1, Math.round(taille.y / 2));
  if (!reflet.cible) { reflet.cible = new THREE.WebGLRenderTarget(l, h, { type: THREE.HalfFloatType }); reflet.texture.value = reflet.cible.texture; }
  else if (reflet.cible.width !== l || reflet.cible.height !== h) reflet.cible.setSize(l, h);
  // Caméra symétrique : sous l'eau, regardant vers le haut
  const c = reflet.camera;
  rotation.extractRotation(camera.matrixWorld);
  vise.set(0, 0, -1).applyMatrix4(rotation).add(oeil);
  c.position.set(oeil.x, 2 * NIVEAU_LAC - oeil.y, oeil.z);
  c.up.set(0, 1, 0).applyMatrix4(rotation);
  c.up.y = -c.up.y;
  c.lookAt(vise.x, 2 * NIVEAU_LAC - vise.y, vise.z);
  c.updateMatrixWorld();
  c.projectionMatrix.copy(camera.projectionMatrix);
  reflet.matrice.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(c.projectionMatrix).multiply(c.matrixWorldInverse);
  // Plan de coupe "oblique" : on ne dessine que ce qui est au-dessus de l'eau
  plan.setFromNormalAndCoplanarPoint(HAUT, surface.set(0, NIVEAU_LAC, 0)).applyMatrix4(c.matrixWorldInverse);
  clip.set(plan.normal.x, plan.normal.y, plan.normal.z, plan.constant);
  const e = c.projectionMatrix.elements;
  q4.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
  clip.multiplyScalar(2 / clip.dot(q4));
  e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - 0.003; e[14] = clip.w;
  // Dessin (sans l'eau elle-même, ni l'herbe et les petites plantes ; les ombres sont déjà calculées)
  const eau = scene.getObjectByName('lac'), caches = [...horsReflet].filter((o) => o.visible);
  eau.visible = false;
  caches.forEach((o) => { o.visible = false; });
  const ombres = renderer.shadowMap.autoUpdate, avant = renderer.getRenderTarget();
  renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(reflet.cible);
  renderer.clear();
  renderer.render(scene, c);
  renderer.setRenderTarget(avant);
  renderer.shadowMap.autoUpdate = ombres;
  eau.visible = true;
  caches.forEach((o) => { o.visible = true; });
  reflet.actif.value = 1;
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
    mat.normalScale.set(0.11, 0.11);
  }
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tempsEau = tempsEau;
    shader.uniforms.matriceReflet = reflet.matrice;
    shader.uniforms.tReflet = reflet.texture;
    shader.uniforms.refletActif = reflet.actif;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aProfondeur;\nvarying float vProfondeur;\nuniform mat4 matriceReflet;\nvarying vec4 vCoordReflet;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvProfondeur = aProfondeur;\nvCoordReflet = matriceReflet * modelMatrix * vec4(transformed, 1.0);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vProfondeur;\nuniform float tempsEau;\nuniform sampler2D tReflet;\nuniform float refletActif;\nvarying vec4 vCoordReflet;')
      // Reflet miroir (écran du PC) à la place de la sonde, décalé par les vaguelettes
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
#if defined( RE_IndirectSpecular )
if (refletActif > 0.5) {
  vec2 decalage = (normal.xy - nonPerturbedNormal.xy) * 0.07;
  radiance = texture2D(tReflet, vCoordReflet.xy / vCoordReflet.w + decalage).rgb;
}
#endif`)
      // Une vaguelette ne peut pas refléter le fond du lac : le reflet reste au-dessus de l'horizon (montagnes, ciel)
      .replace('#include <envmap_physical_pars_fragment>', THREE.ShaderChunk.envmap_physical_pars_fragment.replace(
        'reflectVec = inverseTransformDirection( reflectVec, viewMatrix );',
        'reflectVec = inverseTransformDirection( reflectVec, viewMatrix );\n\t\treflectVec = normalize( vec3( reflectVec.x, max( reflectVec.y, 0.012 ), reflectVec.z ) );'))
      .replace('#include <color_fragment>', `#include <color_fragment>
float fond = smoothstep(0.0, 7.0, vProfondeur);
// Eau de glacier : turquoise sur les bords (les fines particules de roche diffusent la lumière), bleu-vert profond au large
diffuseColor.rgb *= mix(vec3(0.03, 0.16, 0.15), vec3(0.002, 0.018, 0.026), fond);
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
