// Deterministic A/B check: original bundle vs. split study build.
// Opens both pages in one headless Chrome, applies the same state + camera,
// hashes the generated world data, and screenshots the canvas.
//
// Usage: node verify/compare.mjs [type] [seed]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPE = process.argv[2] || 'castle';
const SEED = Number(process.argv[3] || 424242);
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const OUT = 'verify/out';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 9500 + Math.floor(Math.random() * 300);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'wgreplica-compare-'));

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--window-size=1600,1000',
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] }
);
let chromeErr = '';
chrome.stderr.on('data', (d) => (chromeErr += d));

async function waitVersion() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return r.json();
    } catch {}
    await sleep(150);
  }
  throw new Error('chrome did not start:\n' + chromeErr.slice(-1500));
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`timeout: ${method}`));
        }
      }, 240000);
    });
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(d.text + ' ' + (d.exception && d.exception.description ? d.exception.description : ''));
    }
    return r.result && r.result.value;
  }
}

const done = (code) => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(code);
};

const PREP = `(async (type, seed) => {
  const st = WGE.defaultState(type, seed);
  await window.__wg.set(st);
  // let the worker + 3D build settle
  for (let i = 0; i < 240; i++) {
    const busy = document.getElementById('busy');
    if (window.__wg.R && busy && busy.hidden) break;
    await new Promise(r => setTimeout(r, 250));
  }
  window.__wg.applyCam('overview');
  VIEW.patSeed = 1234567;          // pattern placement is otherwise random
  VIEW.render();
  await new Promise(r => setTimeout(r, 1500));
  return { seed: window.__wg.S.seed, type: window.__wg.S.type, mode: VIEW.mode };
})(${JSON.stringify(TYPE)}, ${SEED})`;

const DIGEST = `(() => {
  // Stable digest over the generated world description (numbers only).
  let h1 = 0x811c9dc5, h2 = 0x9e3779b9, count = 0;
  const mix = (v) => {
    const n = Math.round(Number(v) * 1000) | 0;
    h1 = Math.imul(h1 ^ n, 16777619) >>> 0;
    h2 = (Math.imul(h2 ^ n, 2246822519) + count) >>> 0;
    count++;
  };
  const seen = new Set();
  const walk = (o, depth) => {
    if (o == null || depth > 8) return;
    if (typeof o === 'number') { mix(o); return; }
    if (typeof o === 'string' || typeof o === 'boolean') { mix(o.length || (o ? 1 : 0)); return; }
    if (ArrayBuffer.isView(o)) { for (let i = 0; i < o.length; i += 1) mix(o[i]); return; }
    if (Array.isArray(o)) { mix(o.length); for (let i = 0; i < o.length && i < 400; i++) walk(o[i], depth + 1); return; }
    if (typeof o === 'object') {
      if (seen.has(o)) return;
      seen.add(o);
      const keys = Object.keys(o).sort();
      mix(keys.length);
      for (const k of keys) { mix(k.length); if (k === 'mesh' || k === 'material' || k === 'geometry' || k === 'ms' || k === 'cached' || k === 'stats' || k === 't' || k === 'time') continue; walk(o[k], depth + 1); }
    }
  };
  walk(window.__wg.R, 0);
  return { h1: h1.toString(16), h2: h2.toString(16), count };
})()`;

async function openPage(wsUrl, url) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url });
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (await cdp.evaluate('!!window.__wg').catch(() => false)) break;
    await sleep(300);
  }
  return cdp;
}

(async () => {
  await waitVersion();
  fs.mkdirSync(OUT, { recursive: true });
  const results = {};
  for (const [name, url] of [
    ['vendor', `${BASE}/vendor/`],
    ['study', `${BASE}/study/`],
  ]) {
    const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const cdp = await openPage(t.webSocketDebuggerUrl, url);
    const info = await cdp.evaluate(PREP);
    const digest = await cdp.evaluate(DIGEST);
    const rect = await cdp.evaluate(`(() => {
      const c = document.querySelector('canvas');
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    })()`);
    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: { ...rect, scale: 1 },
      captureBeyondViewport: false,
    });
    const png = Buffer.from(shot.data, 'base64');
    const file = path.join(OUT, `${name}-${TYPE}-${SEED}.png`);
    fs.writeFileSync(file, png);
    results[name] = { info, digest, file, sha: crypto.createHash('sha256').update(png).digest('hex') };
    console.log(name, JSON.stringify(info), JSON.stringify(digest), results[name].sha.slice(0, 16));
  }
  const a = results.vendor, b = results.study;
  console.log('R digest equal :', a.digest.h1 === b.digest.h1 && a.digest.h2 === b.digest.h2 && a.digest.count === b.digest.count);
  console.log('pixels equal   :', a.sha === b.sha);
  fs.writeFileSync(path.join(OUT, 'compare.json'), JSON.stringify(results, null, 2));
  done(0);
})().catch((e) => {
  console.error('ERROR', e.message);
  done(1);
});
