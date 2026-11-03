// Sons fabriqués par le code (aucun fichier audio) : chocs selon la matière, en 3D, et voix des personnages.
import * as THREE from 'three';

let ctx = null, sortie = null, bruit = null, actifs = 0;
const MAX_SONS = 12;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  sortie = ctx.createDynamicsCompressor();
  sortie.connect(ctx.destination);
  bruit = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = bruit.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, initAudio);

const pL = new THREE.Vector3(), qL = new THREE.Quaternion(), sL = new THREE.Vector3(), av = new THREE.Vector3(), ht = new THREE.Vector3();
export function majAuditeur(camera) {
  if (!ctx) return;
  camera.matrixWorld.decompose(pL, qL, sL);
  av.set(0, 0, -1).applyQuaternion(qL);
  ht.set(0, 1, 0).applyQuaternion(qL);
  const l = ctx.listener;
  if (l.positionX) {
    l.positionX.value = pL.x; l.positionY.value = pL.y; l.positionZ.value = pL.z;
    l.forwardX.value = av.x; l.forwardY.value = av.y; l.forwardZ.value = av.z;
    l.upX.value = ht.x; l.upY.value = ht.y; l.upZ.value = ht.z;
  } else {
    l.setPosition(pL.x, pL.y, pL.z);
    l.setOrientation(av.x, av.y, av.z, ht.x, ht.y, ht.z);
  }
}

function sortie3D(pos, volume) {
  const g = ctx.createGain();
  g.gain.value = volume;
  const p = ctx.createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = 1.5;
  p.rolloffFactor = 1.1;
  if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
  else p.setPosition(pos.x, pos.y, pos.z);
  g.connect(p).connect(sortie);
  return g;
}

function souffle(t, out, { freq, q = 1, duree, filtre = 'bandpass', gain = 1 }) {
  const s = ctx.createBufferSource();
  s.buffer = bruit;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = filtre; f.frequency.value = freq; f.Q.value = q;
  const e = ctx.createGain();
  e.gain.setValueAtTime(gain, t);
  e.gain.exponentialRampToValueAtTime(0.001, t + duree);
  s.connect(f).connect(e).connect(out);
  s.start(t, Math.random() * 0.5);
  s.stop(t + duree + 0.02);
}

function ton(t, out, { freq, freqFin, duree, gain = 1, forme = 'sine', attaque = 0 }) {
  const o = ctx.createOscillator();
  o.type = forme;
  o.frequency.setValueAtTime(freq, t);
  if (freqFin) o.frequency.exponentialRampToValueAtTime(freqFin, t + duree);
  const e = ctx.createGain();
  if (attaque) { e.gain.setValueAtTime(0.001, t); e.gain.exponentialRampToValueAtTime(gain, t + attaque); }
  else e.gain.setValueAtTime(gain, t);
  e.gain.exponentialRampToValueAtTime(0.001, t + duree);
  o.connect(e).connect(out);
  o.start(t);
  o.stop(t + duree + 0.02);
}

const alea = (a, b) => a + Math.random() * (b - a);
const RECETTES = {
  bois: (t, o) => { souffle(t, o, { freq: alea(800, 1400), q: 3, duree: 0.09 }); ton(t, o, { freq: alea(170, 300), duree: 0.12, gain: 0.6 }); return 0.15; },
  carton: (t, o) => { souffle(t, o, { freq: 380, q: 0.8, duree: 0.08, filtre: 'lowpass', gain: 1.3 }); return 0.1; },
  metal: (t, o) => {
    const f = alea(260, 650);
    [1, 2.76, 5.4, 8.93].forEach((k, n) => ton(t, o, { freq: f * k, duree: 0.9 - n * 0.17, gain: 0.32 / (n + 1) }));
    souffle(t, o, { freq: 3200, duree: 0.03, gain: 0.5 });
    return 0.9;
  },
  caoutchouc: (t, o) => { ton(t, o, { freq: alea(190, 240), freqFin: 105, duree: 0.08, gain: 0.8 }); souffle(t, o, { freq: 1200, q: 2, duree: 0.02, gain: 0.3 }); return 0.1; },
  plastique: (t, o) => { souffle(t, o, { freq: alea(1600, 2400), q: 4, duree: 0.05 }); ton(t, o, { freq: alea(500, 800), duree: 0.05, gain: 0.3 }); return 0.07; },
  pierre: (t, o) => { souffle(t, o, { freq: 600, duree: 0.07, filtre: 'lowpass' }); ton(t, o, { freq: 90, duree: 0.08, gain: 0.5 }); return 0.1; },
  herbe: (t, o) => { souffle(t, o, { freq: 260, duree: 0.09, filtre: 'lowpass', gain: 0.9 }); return 0.1; },
  chair: (t, o) => { souffle(t, o, { freq: 250, q: 0.7, duree: 0.12, filtre: 'lowpass', gain: 1.3 }); ton(t, o, { freq: 75, duree: 0.15, gain: 0.7 }); return 0.16; },
  rangement: (t, o) => { souffle(t, o, { freq: 900, q: 1.5, duree: 0.12, gain: 0.6 }); ton(t, o, { freq: 520, freqFin: 380, duree: 0.08, gain: 0.25 }); return 0.13; },
  tir: (t, o) => { souffle(t, o, { freq: 1500, q: 0.7, duree: 0.06, gain: 1.1 }); ton(t, o, { freq: 320, freqFin: 120, duree: 0.07, gain: 0.5, forme: 'triangle' }); return 0.08; },
  clic: (t, o) => { souffle(t, o, { freq: 4000, q: 3, duree: 0.02, gain: 0.8 }); return 0.03; },
  eau: (t, o) => {
    souffle(t, o, { freq: 700, q: 0.8, duree: 0.35, filtre: 'lowpass', gain: 1.4 });
    for (let i = 0; i < 4; i++) ton(t + 0.05 + i * alea(0.04, 0.09), o, { freq: alea(500, 900), freqFin: alea(1100, 1600), duree: 0.06, gain: 0.25 });
    return 0.5;
  },
  feu: (t, o) => { souffle(t, o, { freq: 900, q: 0.6, duree: 0.45, filtre: 'bandpass', gain: 1.1 }); ton(t, o, { freq: 140, freqFin: 70, duree: 0.4, gain: 0.4, forme: 'sawtooth' }); return 0.5; },
  explosion: (t, o) => {
    souffle(t, o, { freq: 180, q: 0.5, duree: 1.1, filtre: 'lowpass', gain: 2.2 });
    souffle(t, o, { freq: 1800, q: 0.7, duree: 0.25, gain: 0.8 });
    ton(t, o, { freq: 60, freqFin: 28, duree: 0.9, gain: 1.1 });
    return 1.2;
  },
  toile: (t, o) => { souffle(t, o, { freq: 3200, q: 1.5, duree: 0.12, gain: 0.9 }); ton(t, o, { freq: 1400, freqFin: 400, duree: 0.1, gain: 0.25, forme: 'triangle' }); return 0.15; },
  magie: (t, o) => {
    [220, 277, 330].forEach((f, i) => ton(t + i * 0.04, o, { freq: f, freqFin: f * 0.5, duree: 0.7, gain: 0.22, forme: 'triangle', attaque: 0.05 }));
    souffle(t, o, { freq: 500, q: 2, duree: 0.6, gain: 0.4 });
    return 0.8;
  },
  vent: (t, o) => { souffle(t, o, { freq: 400, q: 0.4, duree: 0.6, filtre: 'lowpass', gain: 0.8 }); return 0.6; },
};

export function jouerSon(type, pos, intensite = 1) {
  if (!ctx || ctx.state !== 'running' || actifs >= MAX_SONS || !RECETTES[type]) return;
  const out = sortie3D(pos, 0.12 + 0.88 * intensite);
  const duree = RECETTES[type](ctx.currentTime, out);
  actifs++;
  setTimeout(() => { actifs--; out.disconnect(); }, (duree + 0.15) * 1000);
}

// --- Voix ---
// On utilise la synthèse vocale du navigateur si elle existe ; sinon, un "babillage" synthétique.
let voixFR = [];
const synthese = 'speechSynthesis' in window ? window.speechSynthesis : null;
function chargerVoix() { voixFR = synthese.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('fr')); }
if (synthese) { chargerVoix(); synthese.addEventListener?.('voiceschanged', chargerVoix); }

const PRENOMS_F = /female|femme|amelie|amélie|audrey|marie|julie|hortense|denise|celine|céline|léa|virginie|aurelie|aurélie|eloise|éloïse|vivienne|brigitte|sylvie/i;
const PRENOMS_H = /\bmale\b|homme|thomas|paul|henri|claude|nicolas|remy|rémy|antoine|guillaume|jerome|jérôme|mathieu|yves|olivier/i;

export function parler(texte, { feminin, hauteur = 1 }, pos, urgent = false) {
  if (synthese && voixFR.length) {
    if (synthese.speaking && !urgent) { babiller(texte, feminin, hauteur, pos); return; }
    if (urgent) synthese.cancel();
    const u = new SpeechSynthesisUtterance(texte);
    u.lang = 'fr-FR';
    u.voice = voixFR.find((v) => (feminin ? PRENOMS_F : PRENOMS_H).test(v.name)) ?? voixFR[0];
    u.pitch = THREE.MathUtils.clamp(hauteur * (feminin ? 1.15 : 0.85), 0.1, 2);
    u.rate = 1.05;
    synthese.speak(u);
  } else babiller(texte, feminin, hauteur, pos);
}

const VOYELLES = { a: [800, 1200], e: [450, 1900], i: [300, 2300], o: [480, 850], u: [330, 750] };
function babiller(texte, feminin, hauteur, pos) {
  if (!ctx || ctx.state !== 'running') return;
  const lettres = texte.toLowerCase().normalize('NFD').replace(/[^aeiou]/g, '').slice(0, 14);
  const f0 = (feminin ? 215 : 120) * hauteur;
  const out = sortie3D(pos, 0.5);
  let t = ctx.currentTime;
  for (const v of lettres) {
    const [f1, f2] = VOYELLES[v];
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * alea(0.92, 1.1), t);
    const b1 = ctx.createBiquadFilter(); b1.type = 'bandpass'; b1.frequency.value = f1; b1.Q.value = 6;
    const b2 = ctx.createBiquadFilter(); b2.type = 'bandpass'; b2.frequency.value = f2; b2.Q.value = 8;
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.001, t);
    e.gain.exponentialRampToValueAtTime(0.9, t + 0.02);
    e.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(b1).connect(e); o.connect(b2).connect(e); e.connect(out);
    o.start(t); o.stop(t + 0.12);
    t += alea(0.11, 0.15);
  }
  setTimeout(() => out.disconnect(), (t - ctx.currentTime + 0.3) * 1000);
}
