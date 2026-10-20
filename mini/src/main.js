// MINI WORLD — a clean-room, minimal take on the World Gacha pipeline:
// seed → analytic terrain → street grid → massing → deferred ink render → PNG.
import { InkRenderer } from './ink.js';
import { createTerrain, buildTerrainMesh, buildWater, TOWN } from './terrain.js';
import { createTown } from './town.js';
import { buildTownMesh } from './build.js';

const THREE = window.HG_THREE;
const canvas = document.getElementById('view');
const ink = new InkRenderer(THREE, canvas);

ink.scene.add(new THREE.HemisphereLight(0xe6eef5, 0x5c5346, 1.15));
const sun = new THREE.DirectionalLight(0xfff3df, 3.2);
sun.position.set(-380, 560, 300);
ink.scene.add(sun);
ink.scene.add(new THREE.AmbientLight(0xffffff, 0.22));

const controls = new window.HG_OrbitControls(ink.camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 30;
controls.maxDistance = 2400;

let world = [];
let current = { seed: 0, town: null };

const CAMERAS = {
  aerial: { pos: [TOWN.x + 360, TOWN.y + 330, TOWN.z + 760], target: [TOWN.x, TOWN.y + 4, TOWN.z - 60], fov: 34 },
  high: { pos: [TOWN.x - 120, TOWN.y + 760, TOWN.z + 640], target: [TOWN.x, TOWN.y, TOWN.z], fov: 30 },
  street: { pos: [TOWN.x - 70, TOWN.y + 1.7, TOWN.z + 120], target: [TOWN.x + 60, TOWN.y + 4, TOWN.z - 40], fov: 55 },
  top: { pos: [TOWN.x, TOWN.y + 900, TOWN.z + 1], target: [TOWN.x, TOWN.y, TOWN.z], fov: 26 },
};

function applyCamera(name) {
  const c = CAMERAS[name];
  if (!c) return;
  ink.camera.position.set(...c.pos);
  ink.camera.fov = c.fov;
  ink.camera.updateProjectionMatrix();
  controls.target.set(...c.target);
  controls.update();
}

function disposeWorld() {
  for (const m of world) {
    ink.scene.remove(m);
    m.geometry.dispose();
    if (m.material) m.material.dispose();
  }
  world = [];
}

function generate(seed) {
  disposeWorld();
  const terrain = createTerrain(seed);
  const town = createTown(seed);

  const ground = buildTerrainMesh(THREE, terrain, 190);
  const water = buildWater(THREE);
  const city = buildTownMesh(THREE, town, terrain);
  ink.scene.add(ground, water, city);
  world = [ground, water, city];

  current = { seed, town };
  document.getElementById('stat').textContent =
    `seed ${seed} · ${town.buildings.length} buildings · ${town.roads.length} roads`;
  const input = document.getElementById('seed');
  if (input.value !== String(seed)) input.value = String(seed);
}

function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  ink.setSize(w, h);
}

let raf = 0;
function loop() {
  raf = requestAnimationFrame(loop);
  controls.update();
  ink.render();
}

// --- UI --------------------------------------------------------------------
const seedInput = document.getElementById('seed');
const modeSel = document.getElementById('mode');

document.getElementById('gen').addEventListener('click', () => {
  const v = seedInput.value.trim();
  const seed = /^\d+$/.test(v) ? Number(v) : Math.floor(Math.random() * 1e9);
  generate(seed);
});

document.getElementById('dice').addEventListener('click', () => {
  seedInput.value = String(Math.floor(Math.random() * 1e9));
  generate(Number(seedInput.value));
});

modeSel.addEventListener('change', () => {
  ink.mode = modeSel.value;
});

document.getElementById('cam').addEventListener('change', (e) => applyCamera(e.target.value));

document.getElementById('lw').addEventListener('input', (e) => {
  ink.lineW = Number(e.target.value);
  document.getElementById('lwv').textContent = ink.lineW.toFixed(1);
});

document.getElementById('png').addEventListener('click', () => {
  const url = ink.snapshot(2400, 1600);
  const a = document.createElement('a');
  a.href = url;
  a.download = `miniworld_${current.seed}.png`;
  a.click();
});

window.addEventListener('resize', resize);

resize();
applyCamera('aerial');

// URL overrides (handy for reproducible screenshots)
const q = new URLSearchParams(location.search);
if (q.get('mode')) {
  ink.mode = q.get('mode');
  modeSel.value = q.get('mode');
}
if (q.get('seed')) seedInput.value = q.get('seed');

generate(/^\d+$/.test(seedInput.value) ? Number(seedInput.value) : Math.floor(Math.random() * 1e9));
window.mini = { ink, THREE, controls, camera: ink.camera, get current() { return current; }, generate };
loop();
