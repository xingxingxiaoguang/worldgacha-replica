// Street grid + lots + simple massing. Pure data; no three.js here.
import { mulberry32, hashString, clamp } from './rng.js';
import { TOWN } from './terrain.js';

export function createTown(seed) {
  const rng = mulberry32((hashString(String(seed)) ^ 0x9e3779b9) >>> 0);
  const { x: cx, z: cz, y: baseY } = TOWN;
  const step = 58;
  const half = 5; // 11 lines each way

  const roads = [];
  const buildings = [];
  const trees = [];
  const parks = [];

  // arterials
  roads.push({ x1: cx - 300, z1: cz + 6, x2: cx + 300, z2: cz + 6, w: 15, kind: 'arterial' });
  roads.push({ x1: cx - 2, z1: cz - 300, x2: cx - 2, z2: cz + 300, w: 15, kind: 'arterial' });

  // grid streets
  for (let i = -half; i <= half; i++) {
    const off = i * step;
    if (Math.abs(off) < 10) continue; // arterial already
    roads.push({ x1: cx + off, z1: cz - 290, x2: cx + off, z2: cz + 290, w: 7.5, kind: 'street' });
    roads.push({ x1: cx - 290, z1: cz + off, x2: cx + 290, z2: cz + off, w: 7.5, kind: 'street' });
  }

  // blocks between streets
  for (let ix = -half; ix < half; ix++) {
    for (let iz = -half; iz < half; iz++) {
      const x0 = cx + ix * step + 5;
      const x1 = cx + (ix + 1) * step - 5;
      const z0 = cz + iz * step + 5;
      const z1 = cz + (iz + 1) * step - 5;
      const r = Math.hypot((x0 + x1) / 2 - cx, (z0 + z1) / 2 - cz);
      if (r > 285) continue;

      const roll = rng();
      if (roll < 0.13) {
        // pocket park
        parks.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0 - 8, d: z1 - z0 - 8 });
        for (let k = 0; k < 3; k++) {
          trees.push({
            x: x0 + 8 + rng() * (x1 - x0 - 16),
            z: z0 + 8 + rng() * (z1 - z0 - 16),
            s: 0.8 + rng() * 0.5,
          });
        }
        continue;
      }

      // 1–3 buildings along the block
      const n = roll < 0.55 ? 2 : roll < 0.85 ? 1 : 3;
      const along = x1 - x0;
      const bw = along / n;
      for (let k = 0; k < n; k++) {
        const w = bw * (0.55 + rng() * 0.2);
        const d = (z1 - z0) * (0.45 + rng() * 0.25);
        const x = x0 + bw * k + bw / 2 + (rng() - 0.5) * 3;
        const z = z0 + (rng() - 0.5) * 5;
        const center = 1 - clamp(r / 285, 0, 1);
        const floors = Math.max(1, Math.round(1 + rng() * 2 + center * 4));
        buildings.push({
          x,
          z,
          w,
          d,
          h: floors * 3.1,
          rot: rng() < 0.5 ? 0 : Math.PI / 2,
          wall: ['#e9e2d3', '#ddd4c2', '#cfc6b4', '#f0ebdf', '#d6cbb8'][(rng() * 5) | 0],
          roof: ['#5b6470', '#6d4a3c', '#4c5866', '#7b6a52'][(rng() * 4) | 0],
          roofH: 1.8 + rng() * 1.6,
        });
      }

      // street trees
      if (rng() < 0.5) trees.push({ x: x0 + rng() * along, z: z0 - 3, s: 0.7 + rng() * 0.4 });
      if (rng() < 0.5) trees.push({ x: x0 + rng() * along, z: z1 + 3, s: 0.7 + rng() * 0.4 });
    }
  }

  return { roads, buildings, trees, parks, baseY, center: { x: cx, z: cz }, radius: 300 };
}
