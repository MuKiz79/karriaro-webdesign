/*
 * Karriaro — Werkschau-Drohnenschwarm 3D (Sprint 227)
 *
 * Echter 3D-WebGL-Partikelschwarm (Three.js, self-hosted) — glühende „Drohnen",
 * die zwischen dem Phyllotaxis-Siegel (Blüte) und einer Rakete morphen, in
 * Markenfarben (Creme/Gold auf Navy). Adaptiert die Referenz-Demo
 * (rakete/demos/drohnenschwarm.html) für die Karriaro-Marke + die boxed Bühne.
 *
 * Guards: Bootstrap injiziert dieses Modul NUR auf Desktop ohne reduzierte
 *   Bewegung / ohne Touch → Mobil lädt Three.js NIE (Poster bleibt, Budget safe).
 *   WebGL-Preflight + try/catch → bei fehlendem WebGL bleibt das Poster stehen,
 *   ohne console.error (schützt das Smoke-Gate). Loop pausiert außerhalb
 *   Viewport / bei inaktivem Tab.
 */
import * as THREE from '/js/three.module.js';

const canvas = document.getElementById('kr-swarm');
const box = document.getElementById('kr-canvas-box');

// ── WebGL-Preflight (verhindert Three's internes console.error bei No-WebGL) ──
function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

if (canvas && box && webglOK()) {
  try { init(); } catch (e) { /* Poster bleibt sichtbar; kein console.error */ }
}

function init() {
  // ── Markenpalette ──────────────────────────────────────────────────────
  const COL = {
    droneCreme: 0xF1EFE7, droneWhite: 0xffffff,
    gold: 0xC9A24B, flame: 0xE0892A, flameHot: 0xF6C453,
    bg: 0x0E141B,
  };
  const GOLDEN_ANGLE = (3 - Math.sqrt(5)) * Math.PI; // 137,50776°
  const FIB = { 1:1,2:1,3:1,5:1,8:1,13:1,21:1,34:1,55:1,89:1,144:1,233:1,377:1,610:1,987:1,1597:1,2584:1,4181:1 };
  const COUNT = 9000;

  // ── Renderer / Szene (in die Box, nicht Vollbild) ──────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  if (!renderer.getContext()) return;
  renderer.setClearColor(0x000000, 0); // transparent → Box-Gradient scheint durch
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(COL.bg, 0.012);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
  camera.position.set(0, 0, 16);

  addStars();

  // ── Zielformen (Punktwolken) ───────────────────────────────────────────
  const bloom = buildBloom(COUNT);
  const rocket = buildRocket(COUNT);
  const SHAPE = { bloom, rocket };
  let current = 'bloom';

  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const velocities = new Float32Array(COUNT * 3);
  const home = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * 40;
    positions[i3 + 1] = (Math.random() - 0.5) * 40;
    positions[i3 + 2] = (Math.random() - 0.5) * 40;
    home[i3] = bloom.pos[i3]; home[i3 + 1] = bloom.pos[i3 + 1]; home[i3 + 2] = bloom.pos[i3 + 2];
    colors[i3] = bloom.col[i3]; colors[i3 + 1] = bloom.col[i3 + 1]; colors[i3 + 2] = bloom.col[i3 + 2];
    seed[i] = Math.random();
  }
  let targetColors = bloom.col;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.11, map: makeDroneSprite(), vertexColors: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);

  // ── Pointer / Interaktion (relativ zur Box) ─────────────────────────────
  const pointer = new THREE.Vector2(0, 0);
  const mouseWorld = new THREE.Vector3(9999, 9999, 9999);
  const raycaster = new THREE.Raycaster();
  const planeZ0 = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  let pointerActive = false, explodeT = 0;

  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    pointerActive = true; wake();
  });
  canvas.addEventListener('pointerleave', () => { pointerActive = false; });
  canvas.addEventListener('pointerdown', () => { explodeT = 1; wake(); });

  // ── Controls ────────────────────────────────────────────────────────────
  const buttons = document.querySelectorAll('[data-form]');
  function setActive(name) {
    buttons.forEach((b) => {
      const on = b.getAttribute('data-form') === name;
      b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function applyShape(name) {
    const shape = SHAPE[name]; if (!shape) return;
    current = name;
    for (let i = 0; i < COUNT * 3; i++) home[i] = shape.pos[i];
    targetColors = shape.col;
    setActive(name);
  }
  buttons.forEach((btn) => btn.addEventListener('click', () => applyShape(btn.getAttribute('data-form'))));

  // ── Animationsloop ───────────────────────────────────────────────────────
  const SPRING = 0.018, DAMP = 0.90, REPEL_RADIUS = 3.2, REPEL_FORCE = 0.9;
  const clock = new THREE.Clock();
  let angY = 0;
  const rot = new THREE.Vector3();
  let running = false, rafId = 0, visible = false;

  function animate() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    // Rakete: volle Y-Drehung (Turntable). Siegel: 3D-Wiegen (±~29° um Y) + leichte
    // Neigung → voluminös/räumlich, aber NIE edge-on (Logo bleibt lesbar).
    angY += dt * 0.25;
    const isRocket = current === 'rocket';
    const ay = isRocket ? angY : Math.sin(t * 0.4) * 0.26;   // Siegel: dezentes Wiegen (~±15°)
    const cy = Math.cos(ay), sy = Math.sin(ay);
    const TILT = isRocket ? 0 : 0.12, ct = Math.cos(TILT), st = Math.sin(TILT);

    if (pointerActive) { raycaster.setFromCamera(pointer, camera); raycaster.ray.intersectPlane(planeZ0, mouseWorld); }
    else mouseWorld.set(9999, 9999, 9999);
    explodeT *= 0.94;

    const colAttr = geometry.attributes.color.array;
    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;
      const hx = home[i3], hy = home[i3 + 1], hz = home[i3 + 2];
      const X = hx * cy + hz * sy, Y = hy, Z = -hx * sy + hz * cy;
      rot.x = X; rot.y = Y * ct - Z * st; rot.z = Y * st + Z * ct;

      const s = seed[i];
      rot.x += Math.sin(t * 1.3 + s * 6.28) * 0.05;
      rot.y += Math.cos(t * 1.1 + s * 6.28) * 0.05;

      let px = positions[i3], py = positions[i3 + 1], pz = positions[i3 + 2];
      let vx = velocities[i3], vy = velocities[i3 + 1], vz = velocities[i3 + 2];
      vx += (rot.x - px) * SPRING; vy += (rot.y - py) * SPRING; vz += (rot.z - pz) * SPRING;

      const dx = px - mouseWorld.x, dy = py - mouseWorld.y, dz = pz - mouseWorld.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < REPEL_RADIUS * REPEL_RADIUS) {
        const d = Math.sqrt(d2) || 0.001, f = (1 - d / REPEL_RADIUS) * REPEL_FORCE;
        vx += (dx / d) * f; vy += (dy / d) * f; vz += (dz / d) * f;
      }
      if (explodeT > 0.01) {
        const len = Math.sqrt(px * px + py * py + pz * pz) || 0.001, f = explodeT * 1.6;
        vx += (px / len) * f; vy += (py / len) * f; vz += (pz / len) * f;
      }

      vx *= DAMP; vy *= DAMP; vz *= DAMP;
      positions[i3] = px + vx; positions[i3 + 1] = py + vy; positions[i3 + 2] = pz + vz;
      velocities[i3] = vx; velocities[i3 + 1] = vy; velocities[i3 + 2] = vz;

      colAttr[i3] += (targetColors[i3] - colAttr[i3]) * 0.04;
      colAttr[i3 + 1] += (targetColors[i3 + 1] - colAttr[i3 + 1]) * 0.04;
      colAttr[i3 + 2] += (targetColors[i3 + 2] - colAttr[i3 + 2]) * 0.04;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(animate);
  }

  function start() { if (running) return; running = true; clock.getDelta(); rafId = requestAnimationFrame(animate); }
  function stop() { running = false; cancelAnimationFrame(rafId); }
  function wake() { /* Platzhalter (kein Showreel) — hält API mit Listenern konsistent */ }

  // ── Layout / Lifecycle ───────────────────────────────────────────────────
  function onResize() {
    const r = box.getBoundingClientRect(), w = Math.max(1, r.width), h = Math.max(1, r.height);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  window.addEventListener('resize', onResize, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(box);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (visible) start(); });
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible && !document.hidden) start(); else stop(); }, { threshold: 0.08 });

  onResize();
  box.classList.add('is-live'); // Poster ausblenden — erst NACH erfolgreicher Init
  setActive('bloom');
  io.observe(box);

  // ── Formgeneratoren ──────────────────────────────────────────────────────
  // Karriaro-SIEGEL als glühende SPIRALARME (Galaxie/Mandala) — dicht UND strukturiert:
  // bold leuchtende Goldwinkel-Spiralarme (golden-glühender Kern → Creme außen) mit
  // dunklen Lücken dazwischen + gestochener Eck-Rahmen (1,12·R). Edel wie die Rakete.
  function buildBloom(n) {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const gold = new THREE.Color(0xFFD24A), creme = new THREE.Color(0xF4F1EA), tmp = new THREE.Color();
    const R = 6.0, s = R * 1.12, L = s * 0.33, ARMS = 5, WIND = 0.78, TH = 0.55;
    // Eck-Rahmen
    const segs = [];
    for (const cc of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const ax = cc[0] * s, ay = cc[1] * s;
      segs.push([ax, ay - cc[1] * L, ax, ay]);
      segs.push([ax, ay, ax - cc[0] * L, ay]);
    }
    const nBr = Math.floor(n * 0.10);
    for (let i = 0; i < nBr; i++) {
      const seg = segs[i % 8], t = Math.random(), j = i * 3;
      pos[j] = seg[0] + (seg[2] - seg[0]) * t + (Math.random() - 0.5) * 0.05;
      pos[j + 1] = seg[1] + (seg[3] - seg[1]) * t + (Math.random() - 0.5) * 0.05;
      pos[j + 2] = (Math.random() - 0.5) * 0.05;
      col[j] = creme.r; col[j + 1] = creme.g; col[j + 2] = creme.b;
    }
    // Glühende Spiralarme: dicht innerhalb der Arme, Lücken dazwischen → Struktur sichtbar
    for (let i = nBr; i < n; i++) {
      const j = i * 3, a = (i - nBr) % ARMS, t = Math.sqrt(Math.random());
      const r = R * t, th = a * (2 * Math.PI / ARMS) + t * WIND * 2 * Math.PI;
      const off = TH * (0.25 + 0.9 * t) * (Math.random() - 0.5) * 2;   // Arm-Dicke (außen dicker)
      const px = -Math.sin(th), py = Math.cos(th);
      pos[j] = Math.cos(th) * r + px * off; pos[j + 1] = Math.sin(th) * r + py * off; pos[j + 2] = (1 - t * t) * 0.5 - 0.1 + (Math.random() - 0.5) * 0.05;
      const cc = tmp.copy(gold).lerp(creme, Math.min(1, t * 1.25));     // goldener Kern → Creme-Spitzen
      col[j] = cc.r; col[j + 1] = cc.g; col[j + 2] = cc.b;
    }
    return { pos, col };
  }

  // Rakete = Referenz-Geometrie (Rumpf/Nase/4 Finnen/Flamme), Markenfarben.
  function buildRocket(n) {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const droneA = new THREE.Color(COL.droneCreme), droneB = new THREE.Color(COL.droneWhite);
    const flame = new THREE.Color(COL.flame), flameHot = new THREE.Color(COL.flameHot);
    const Y = -1;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3, r = Math.random();
      let x, y, z, isFlame = false;
      if (r < 0.42) { const th = Math.random() * Math.PI * 2; x = Math.cos(th); z = Math.sin(th); y = Math.random() * 4 - 2; }
      else if (r < 0.65) { const h = Math.random(), rad = 1 - h, th = Math.random() * Math.PI * 2; x = Math.cos(th) * rad; z = Math.sin(th) * rad; y = 2 + h * 2; }
      else if (r < 0.85) { const fin = Math.floor(Math.random() * 4), a = fin * Math.PI / 2; let u = Math.random(), v = Math.random(); if (u + v > 1) { u = 1 - u; v = 1 - v; } const rr = 1 + 1.4 * v, yy = -0.5 - 1.5 * (u + v); x = Math.cos(a) * rr; z = Math.sin(a) * rr; y = yy; }
      else { isFlame = true; const h = Math.random(), rad = (1 - h) * 0.9 * Math.random(), th = Math.random() * Math.PI * 2; x = Math.cos(th) * rad; z = Math.sin(th) * rad; y = -2 - h * 2.2; }
      pos[i3] = x; pos[i3 + 1] = y + Y; pos[i3 + 2] = z;
      const cc = isFlame ? flame.clone().lerp(flameHot, Math.random()) : droneA.clone().lerp(droneB, Math.random() * 0.6);
      col[i3] = cc.r; col[i3 + 1] = cc.g; col[i3 + 2] = cc.b;
    }
    return { pos, col };
  }

  // Warmes Creme-Glow-Sprite (statt kalt-blau) für additives Leuchten.
  function makeDroneSprite() {
    const s = 64, cv = document.createElement('canvas'); cv.width = cv.height = s;
    const c = cv.getContext('2d'), g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(248,244,235,0.9)');
    g.addColorStop(0.5, 'rgba(225,210,170,0.35)');
    g.addColorStop(1, 'rgba(225,210,170,0)');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; return tex;
  }

  function addStars() {
    const n = 600, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const i3 = i * 3; p[i3] = (Math.random() - 0.5) * 120; p[i3 + 1] = (Math.random() - 0.5) * 120; p[i3 + 2] = -20 - Math.random() * 80; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ size: 0.16, color: COL.gold, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending });
    scene.add(new THREE.Points(g, m));
  }
}
