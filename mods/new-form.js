/*!
 * mod: new-form
 * Adds a whole new terrain archetype ("mesa" / 台地) at runtime and switches to it.
 *
 * This is the deepest practical hook: scenes are data-driven, so a new form is
 *   FORMS[type] + TYPES + TOWN_CFG + TUNE + i18n + renderTypes()
 *
 * Generation normally runs in a Worker that has its own copy of WGE, so we
 * first take the generator over on the main thread (WGRUN.run). Expect a short
 * freeze while it runs (~1–3 s on a normal machine, longer under SwiftShader).
 */
(async () => {
  await WGMod.settle();

  // 1. main-thread generation, so our new form exists in the engine we can touch
  WGRUN.run = async (S) => WGE.generate(S);

  const smoothstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  // 2. a new archetype: a stepped table-land with a flat top
  WGE.FORMS.mesa = {
    params(rng) {
      return {
        th: rng() * 360,
        coastV: -9000,
        coastD: 9000,
        mtnH: 0,
        inflow: 0,
        ns: 1,
      };
    },
    height(d, x, z) {
      const r = Math.hypot(x, z);
      const top = smoothstep(760, 420, r);       // 1 on the plateau
      const rim = smoothstep(980, 700, r) * 26;  // outer talus
      const wob = Math.sin(x * 0.006) * Math.cos(z * 0.005) * 10;
      return 10 + top * 46 + rim + wob * (1 - top * 0.6);
    },
  };

  // 3. register it like any built-in type
  if (!WGE.TYPES.includes('mesa')) WGE.TYPES.push('mesa');
  WGE.TOWN_CFG.mesa = {
    ...WGE.TOWN_CFG.rural,
    paddy: false,
    rail: 'none',
    castle: false,
    temples: 1,
    maxSl: 14,
  };
  WGE.TUNE.mesa = { ...WGE.TUNE.rural };

  for (const lang of Object.keys(I18N)) {
    if (I18N[lang]) I18N[lang].type_mesa = lang === 'ja' ? '台地の町' : lang === 'en' ? 'Mesa town' : '台地小镇';
  }

  // 4. rebuild the type tabs, then generate
  document.getElementById('types').innerHTML = '';
  renderTypes();

  WGMod.toast('new-form: 台地を追加（主线程で生成）');
  await window.__wg.set(WGE.defaultState('mesa', 20261019));
  WGMod.log('generated', window.__wg.S.type, 'hi', window.__wg.R.hi.toFixed(1));
})();
