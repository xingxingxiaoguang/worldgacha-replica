/*!
 * mod: svg-shot
 * Adds a floating button that exports the current view as vector SVG through
 * the app's own RKSVG exporter. Demonstrates adding UI + calling an internal
 * subsystem from a mod.
 */
(async () => {
  const wg = await WGMod.settle();
  const VIEW = wg.VIEW;

  const btn = document.createElement('button');
  btn.textContent = 'SVG';
  btn.title = '現在の視点を SVG で書き出す (mod)';
  Object.assign(btn.style, {
    position: 'fixed',
    right: '18px',
    bottom: '18px',
    zIndex: 9998,
    width: '54px',
    height: '54px',
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,.25)',
    background: '#e07b39',
    color: '#141820',
    font: '700 14px/1 system-ui, sans-serif',
    cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(0,0,0,.35)',
  });

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = '…';
    try {
      const { svg, stats } = await RKSVG.exportSVG(VIEW, 1600, 1000, undefined, 'World Gacha + svg-shot mod');
      hgDownload(new Blob([svg], { type: 'image/svg+xml' }), 'worldgacha-mod.svg');
      WGMod.toast(`SVG: ${stats.segments} segments / ${stats.edges} edges`);
    } catch (e) {
      console.error(e);
      WGMod.toast('SVG export failed: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });

  document.body.appendChild(btn);
  WGMod.toast('svg-shot: 右下の SVG ボタン');
})();
