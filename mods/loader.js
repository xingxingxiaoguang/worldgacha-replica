/*!
 * WGMod — tiny mod loader for the World Gacha study build.
 *
 * Open  /study/play.html?mods=ink-theme,sky-cam,svg-shot
 * Each name loads ../mods/<name>.js as a classic script after the app boots.
 *
 * A mod is just a classic script: it can read the app's global lexical
 * bindings (WGE, VIEW, RK3D, WG3D, RKSVG, …) and the window.__wg handle.
 * No bundler, no build step, no patching of the original bundle.
 */
(() => {
  const params = new URLSearchParams(location.search);
  const names = (params.get('mods') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(fn, timeout = 180000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try {
        if (fn()) return true;
      } catch {}
      await sleep(120);
    }
    return false;
  }

  function toast(text, ms = 2800) {
    let el = document.getElementById('wgmod-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'wgmod-toast';
      Object.assign(el.style, {
        position: 'fixed',
        left: '16px',
        bottom: '16px',
        zIndex: 9999,
        padding: '8px 14px',
        borderRadius: '8px',
        background: 'rgba(20,24,32,.9)',
        color: '#f2efe8',
        font: '13px/1.5 system-ui, sans-serif',
        boxShadow: '0 4px 18px rgba(0,0,0,.35)',
        pointerEvents: 'none',
        opacity: '0',
        transition: 'opacity .18s ease',
      });
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.style.opacity = '0'), ms);
  }

  window.WGMod = {
    version: '1.0',
    requested: names.slice(),
    loaded: [],
    async ready() {
      await waitFor(() => window.__wg && window.__wg.R);
      return window.__wg;
    },
    async settle() {
      // wait until the current busy banner is gone and a world exists
      await this.ready();
      await waitFor(() => {
        const b = document.getElementById('busy');
        return !b || b.hidden;
      }, 60000);
      return window.__wg;
    },
    toast,
    log(...args) {
      console.log('%c[WGMod]', 'color:#e07b39;font-weight:600', ...args);
    },
  };

  if (!names.length) return;

  (async () => {
    const ok = await waitFor(() => !!window.__wg);
    if (!ok) {
      console.warn('[WGMod] app never exposed window.__wg');
      return;
    }
    for (const name of names) {
      await new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = new URL('../mods/' + name + '.js', location.href).href;
        s.async = false;
        s.onload = () => {
          window.WGMod.loaded.push(name);
          console.log('[WGMod] loaded', name);
          resolve();
        };
        s.onerror = () => {
          console.warn('[WGMod] missing mod:', name, s.src);
          resolve();
        };
        document.head.appendChild(s);
      });
    }
  })();
})();
