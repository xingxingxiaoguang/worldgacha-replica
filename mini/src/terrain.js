// Analytic terrain: coast + hills + one river, then a flattened town plateau.
// The height function is the single source of truth for meshes and placement.
import { fbm2, ridged2, smoothstep, lerp, clamp } from './rng.js';

export const SIZE = 2200;      // metres across
export const SEA_LEVEL = 0;
export const TOWN = { x: 150, z: -140, r: 300, y: 9 };

export function createTerrain(seed) {
  const off = (seed % 997) * 0.37;

  // river: a sine curve running north -> sea
  function riverX(z) {
    return -240 + Math.sin(z * 0.0042 + 1.1) * 130 + Math.sin(z * 0.011) * 22;
  }

  function baseHeight(x, z) {
    // sea lies to the south (z > coast); land rises inland (negative z)
    const coast = 330 + Math.sin(x * 0.0028 + off) * 90 + Math.sin(x * 0.009) * 18;
    const land = smoothstep(coast + 90, coast - 150, z); // 1 inland, 0 at sea

    const hills = fbm2(x * 0.0017 + off, z * 0.0017 - off, seed, 5) * 0.5 + 0.5;
    const mount = ridged2(x * 0.00085 - off, z * 0.00085 + off, seed + 77, 4);
    const inland = smoothstep(0.15, 0.95, -z / 1100);
    let h = land * (6 + hills * 62 + mount * 210 * inland) - (1 - land) * 26;

    // river valley
    const d = Math.abs(x - riverX(z));
    const w = 12 + clamp((z + 900) / 1800, 0, 1) * 26;
    const carve = smoothstep(w + 46, w - 6, d);
    h -= carve * 15 * land + carve * 4;

    return h;
  }

  function height(x, z) {
    let h = baseHeight(x, z);

    // town plateau: flatten a disc, keep a soft rim
    const d = Math.hypot(x - TOWN.x, z - TOWN.z) / TOWN.r;
    const flat = smoothstep(1.0, 0.72, d);
    h = lerp(h, TOWN.y, flat * 0.94);

    // shallow bay in front of the town
    const bay = smoothstep(520, 250, Math.hypot(x - TOWN.x, z - (TOWN.z + 380)));
    h -= bay * 10;

    return h;
  }

  function normal(x, z, e = 3) {
    const hl = height(x - e, z);
    const hr = height(x + e, z);
    const hd = height(x, z - e);
    const hu = height(x, z + e);
    const nx = hl - hr;
    const nz = hd - hu;
    const ny = 2 * e;
    const len = Math.hypot(nx, ny, nz) || 1;
    return [nx / len, ny / len, nz / len];
  }

  function slope(x, z) {
    const n = normal(x, z, 4);
    return 1 - n[1];
  }

  return { seed, height, normal, slope, riverX, baseHeight };
}

// --- mesh ------------------------------------------------------------------
export function buildTerrainMesh(THREE, terrain, seg = 200) {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  const grass = new THREE.Color('#93a86b');
  const dark = new THREE.Color('#5f7a4c');
  const rock = new THREE.Color('#8d8778');
  const sand = new THREE.Color('#cfc19a');
  const mud = new THREE.Color('#6f7a63');

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrain.height(x, z);
    pos.setY(i, h);

    const s = terrain.slope(x, z);
    if (h < 1.2) c.copy(mud).lerp(sand, smoothstep(-1, 1.6, h));
    else {
      c.copy(grass).lerp(dark, clamp(fbm2(x * 0.006, z * 0.006, 11, 3) * 0.5 + 0.5, 0, 1) * 0.65);
      c.lerp(rock, smoothstep(0.22, 0.55, s));
      c.lerp(sand, smoothstep(4.5, 1.2, h) * 0.7);
      c.lerp(new THREE.Color('#e8e4d8'), smoothstep(150, 240, h) * 0.55);
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  return mesh;
}

export function buildWater(THREE) {
  const geo = new THREE.PlaneGeometry(SIZE * 1.6, SIZE * 1.6);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ color: '#4b7ea6', transparent: true, opacity: 0.94 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = SEA_LEVEL + 0.05;
  mesh.name = 'sea';
  return mesh;
}
