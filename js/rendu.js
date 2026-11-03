// Rendu "cinéma" sur l'écran du PC (hors casque) : ombre des creux et des contacts (occlusion ambiante GTAO),
// lueur des zones très lumineuses (bloom), puis étalonnage des couleurs (contraste, couleurs vives, vignettage).
// Dans le casque, l'image est dessinée directement (le post-traitement n'existe pas en réalité virtuelle web).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const ETALONNAGE = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  vec3 col = c.rgb;
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.3);                 // contraste (courbe en S)
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, 1.1);                                         // couleurs plus vives
  col += vec3(0.018, 0.008, -0.012) * smoothstep(0.5, 1.0, l)           // hautes lumières chaudes
       + vec3(-0.008, 0.0, 0.014) * (1.0 - smoothstep(0.0, 0.35, l));  // ombres légèrement bleutées
  vec2 d = vUv - 0.5;
  col *= 1.0 - dot(d, d) * 0.3;                                         // vignettage
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
}`,
};

// Objets à ne pas compter dans l'occlusion ambiante (déplacés par la carte graphique, ou interfaces)
export function sansOcclusion(objet) { objet.userData.sansAO = true; }

export function creerRenduEcran(renderer, scene, camera) {
  const taille = renderer.getDrawingBufferSize(new THREE.Vector2());
  const cible = new THREE.WebGLRenderTarget(taille.x, taille.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, cible);
  composer.addPass(new RenderPass(scene, camera));

  const ao = new GTAOPass(scene, camera, taille.x, taille.y);
  ao.updateGtaoMaterial({ radius: 1.4, distanceExponent: 1.6, thickness: 1.5, scale: 1.2, samples: 12, distanceFallOff: 1 });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  ao.blendIntensity = 0.85;
  const cacher = ao.overrideVisibility.bind(ao);
  ao.overrideVisibility = () => {
    cacher();
    scene.traverse((o) => { if (o.userData.sansAO) o.visible = false; });
  };
  composer.addPass(ao);

  composer.addPass(new UnrealBloomPass(new THREE.Vector2(taille.x, taille.y), 0.22, 0.55, 0.95));
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(ETALONNAGE));

  return {
    composer,
    rendre: () => composer.render(),
    alleger: () => { if (!ao.enabled) return false; ao.enabled = false; return true; },   // coupe l'occlusion ambiante (écran trop lent)
    redimensionner: (l, h) => { composer.setSize(l, h); ao.setSize(l * renderer.getPixelRatio(), h * renderer.getPixelRatio()); },
  };
}
