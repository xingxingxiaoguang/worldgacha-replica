/*!
 * mod: sky-cam
 * Adds two camera presets ("sky", "dusk") by wrapping WG3D.cams and
 * re-rendering the preset dropdown. Demonstrates monkey-patching an
 * exported namespace without touching the bundle.
 */
(async () => {
  await WGMod.settle();

  const original = WG3D.cams;
  WG3D.cams = function (R) {
    const cams = original(R);
    cams.sky = { pos: [0, 260, 380], target: [0, 12, 0], lens: 18 };
    cams.dusk = { pos: [-320, 70, 250], target: [20, 14, 20], lens: 45 };
    return cams;
  };

  // the dropdown is driven by CAM_ORDER + i18n keys, so extend both
  if (!CAM_ORDER.includes('sky')) CAM_ORDER.push('sky', 'dusk');
  const labels = { ja: ['空撮', '夕景'], en: ['Aerial', 'Dusk'], 'zh-Hans': ['航拍', '黄昏'], 'zh-Hant': ['空拍', '黃昏'], ko: ['항공', '황혼'] };
  for (const [lang, [sky, dusk]] of Object.entries(labels)) {
    if (I18N[lang]) Object.assign(I18N[lang], { cam_sky: sky, cam_dusk: dusk });
  }

  renderCams();      // global: rebuild CAMS + <select>
  applyCam('sky');   // global: move the camera
  WGMod.toast('sky-cam: sky / dusk を追加');
  WGMod.log('cams', Object.keys(CAMS).join(', '));
})();
