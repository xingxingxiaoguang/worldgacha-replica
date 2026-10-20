// Merge the whole town into one vertex-coloured mesh (one draw call).
// Boxes, gable roofs, windows, roads, parks and trees are emitted as raw
// triangles so the ink pass sees crisp geometric edges.
import { TOWN } from './terrain.js';

export function buildTownMesh(THREE, town, terrain) {
  const pos = [];
  const nor = [];
  const col = [];
  const idx = [];
  const C = new THREE.Color();

  const pushTri = (a, b, c, color) => {
    const i0 = pos.length / 3;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    C.set(color);
    for (const p of [a, b, c]) {
      pos.push(p[0], p[1], p[2]);
      nor.push(nx, ny, nz);
      col.push(C.r, C.g, C.b);
    }
    idx.push(i0, i0 + 1, i0 + 2);
  };

  const pushQuad = (a, b, c, d, color, outward) => {
    // orient the quad so its normal faces `outward`
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const dot = nx * outward[0] + ny * outward[1] + nz * outward[2];
    if (dot < 0) [b, d] = [d, b];
    pushTri(a, b, c, color);
    pushTri(a, c, d, color);
  };

  const rot = (x, z, r) => [x * Math.cos(r) - z * Math.sin(r), x * Math.sin(r) + z * Math.cos(r)];

  // --- box + gable roof ----------------------------------------------------
  function addBuilding(b) {
    const { x, z, w, d, h, rot: r, wall, roof, roofH } = b;
    const y0 = town.baseY;
    const y1 = y0 + h;
    const hw = w / 2;
    const hd = d / 2;
    const P = (dx, dy, dz) => {
      const [rx, rz] = rot(dx, dz, r);
      return [x + rx, dy, z + rz];
    };
    // 4 walls
    pushQuad(P(-hw, y0, -hd), P(-hw, y1, -hd), P(hw, y1, -hd), P(hw, y0, -hd), wall, [0, 0, -1]);
    pushQuad(P(hw, y0, hd), P(hw, y1, hd), P(-hw, y1, hd), P(-hw, y0, hd), wall, [0, 0, 1]);
    pushQuad(P(hw, y0, -hd), P(hw, y1, -hd), P(hw, y1, hd), P(hw, y0, hd), wall, [1, 0, 0]);
    pushQuad(P(-hw, y0, hd), P(-hw, y1, hd), P(-hw, y1, -hd), P(-hw, y0, -hd), wall, [-1, 0, 0]);

    // gable roof (ridge along local x)
    const r0 = P(-hw - 0.35, y1, -hd - 0.35);
    const r1 = P(hw + 0.35, y1, -hd - 0.35);
    const r2 = P(hw + 0.35, y1, hd + 0.35);
    const r3 = P(-hw - 0.35, y1, hd + 0.35);
    const t0 = P(-hw - 0.35, y1 + roofH, 0);
    const t1 = P(hw + 0.35, y1 + roofH, 0);
    pushQuad(r0, r1, t1, t0, roof, [0, 1, -0.4]);
    pushQuad(r2, r3, t0, t1, roof, [0, 1, 0.4]);
    pushTri(r1, r2, t1, roof);
    pushTri(r3, r0, t0, roof);

    // windows on the two long facades
    const floors = Math.max(1, Math.round(h / 3.1));
    const cols = Math.max(1, Math.floor(w / 3.4));
    for (let f = 1; f < floors; f++) {
      const wy = y0 + f * 3.1 + 0.7;
      for (let c = 0; c < cols; c++) {
        const wx = -hw + (w / (cols + 1)) * (c + 1);
        for (const side of [-1, 1]) {
          const zz = side * (hd + 0.05);
          const a = P(wx - 0.7, wy, zz);
          const bb = P(wx - 0.7, wy + 1.15, zz);
          const cc = P(wx + 0.7, wy + 1.15, zz);
          const dd = P(wx + 0.7, wy, zz);
          pushQuad(a, bb, cc, dd, '#3c4652', [0, 0, side]);
        }
      }
    }
  }

  // --- roads ---------------------------------------------------------------
  function addRoad(r) {
    const y = town.baseY + 0.045;
    const dx = r.x2 - r.x1;
    const dz = r.z2 - r.z1;
    const len = Math.hypot(dx, dz);
    const ux = dx / len;
    const uz = dz / len;
    const px = -uz * (r.w / 2);
    const pz = ux * (r.w / 2);
    const a = [r.x1 + px, y, r.z1 + pz];
    const b = [r.x2 + px, y, r.z2 + pz];
    const c = [r.x2 - px, y, r.z2 - pz];
    const d = [r.x1 - px, y, r.z1 - pz];
    pushQuad(a, b, c, d, r.kind === 'arterial' ? '#62625f' : '#77756f', [0, 1, 0]);
  }

  // --- park / tree ---------------------------------------------------------
  function addPark(p) {
    const y = town.baseY + 0.05;
    const hw = p.w / 2;
    const hd = p.d / 2;
    pushQuad(
      [p.x - hw, y, p.z - hd], [p.x - hw, y, p.z + hd],
      [p.x + hw, y, p.z + hd], [p.x + hw, y, p.z - hd],
      '#8aa363', [0, 1, 0]
    );
  }

  function addTree(t) {
    const y = town.baseY;
    const s = t.s || 1;
    const h = 5.5 * s;
    const w = 2.6 * s;
    // trunk
    const c = [t.x, y + h * 0.25, t.z];
    const r = 0.28 * s;
    for (const [ax, az] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const a = [c[0], y, c[2]];
      const b = [c[0], y + h * 0.5, c[2]];
      const p1 = [c[0] + ax * r, y, c[2] + az * r];
      const p2 = [c[0] - az * r, y, c[2] + ax * r];
      pushTri(a, p1, p2, '#5c4630');
      pushTri(b, p2, p1, '#5c4630');
    }
    // canopy: two stacked pyramids
    for (const [cy, cw, ch] of [[h * 0.45, w, h * 0.55], [h * 0.7, w * 0.72, h * 0.5]]) {
      const apex = [t.x, y + cy + ch, t.z];
      const baseY = y + cy;
      const ring = [[cw, 0], [0, cw], [-cw, 0], [0, -cw]].map(([dx, dz]) => [t.x + dx, baseY, t.z + dz]);
      for (let k = 0; k < 4; k++) pushTri(ring[k], ring[(k + 1) % 4], apex, '#4f7345');
    }
  }

  town.buildings.forEach(addBuilding);
  town.roads.forEach(addRoad);
  town.parks.forEach(addPark);
  town.trees.forEach(addTree);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'town';
  return mesh;
}
