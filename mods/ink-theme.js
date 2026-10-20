/*!
 * mod: ink-theme
 * Recolors the ground palette, thickens the ink outline, strengthens the
 * halftone and re-renders. Demonstrates the simplest 二创 surface:
 * RK3D.COL + the VIEW look parameters.
 */
(async () => {
  const wg = await WGMod.settle();
  const VIEW = wg.VIEW;

  Object.assign(RK3D.COL, {
    wood: '#3d5c39',
    green: '#7ea758',
    ground: '#d9d3c3',
    road: '#6b6863',
    walk: '#e0dbd0',
    paved: '#c4c0b7',
    path: '#d8cfba',
    curb: '#b3afa6',
    skirt: '#5d4c3c',
  });

  VIEW.outline.k = 1.75;   // 輪郭の太さ (1.0–3.0)
  VIEW.beta = 0.55;        // ベタ/トーンのコントラスト
  VIEW.toneS = 1.15;       // トーン倍率
  VIEW.patSeed = 20261019; // 網点の乱数シードを固定
  VIEW.render();

  // ground colors are baked into the mesh at build time
  wg.rebuild3d();
  WGMod.toast('ink-theme: 濃い線 + 暖かい地面');
  WGMod.log('COL', RK3D.COL, 'outline', VIEW.outline.k, 'beta', VIEW.beta);
})();
