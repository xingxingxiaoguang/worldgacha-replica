// Launch headless Chrome (SwiftShader WebGL) and capture a page once it settles.
// Usage: node verify/shot.mjs <url> <out.png> [width] [height] [waitMs]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL_TO_OPEN = process.argv[2];
const OUT = process.argv[3];
const WIDTH = Number(process.argv[4] || 1600);
const HEIGHT = Number(process.argv[5] || 1000);
const WAIT_MS = Number(process.argv[6] || 90000);
if (!URL_TO_OPEN || !OUT) {
  console.error('usage: node verify/shot.mjs <url> <out.png> [w] [h] [waitMs]');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 9500 + Math.floor(Math.random() * 300);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'wgreplica-chrome-'));

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    `--window-size=${WIDTH},${HEIGHT}`,
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
  throw new Error('chrome did not start:\n' + chromeErr.slice(-2000));
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
      }, 180000);
    });
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
    return r.result && r.result.value;
  }
}

const done = (code) => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(code);
};

(async () => {
  await waitVersion();
  const target = await (
    await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })
  ).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  cdp.send('Log.enable').catch(() => {});
  const logs = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Log.entryAdded') logs.push(msg.params.entry);
  });
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send('Page.navigate', { url: URL_TO_OPEN });

  const deadline = Date.now() + WAIT_MS;
  let last = null;
  while (Date.now() < deadline) {
    last = await cdp
      .evaluate(`(() => {
        const t = document.body ? document.body.innerText : '';
        const busy = /生成中|読み込み中|Loading|生成しています|busy/i.test(t);
        return { busy, ready: document.readyState, hasApp: !!window.__wg, len: t.length };
      })()`)
      .catch(() => null);
    if (last && last.ready === 'complete' && !last.busy) break;
    await sleep(700);
  }
  await sleep(2500);
  const shot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  const info = await cdp.evaluate(`({
    title: document.title,
    w: innerWidth, h: innerHeight,
    hasWG: !!window.__wg,
    canvas: (()=>{const c=document.querySelector('canvas');return c?[c.width,c.height]:null})()
  })`);
  console.log('saved', OUT, JSON.stringify(info), 'busy:', last && last.busy);
  const errs = logs.filter((l) => l.level === 'error').slice(0, 8);
  for (const e of errs) console.log('PAGE-ERROR', e.text, e.url || '');
  done(0);
})().catch((e) => {
  console.error('ERROR', e.message);
  done(1);
});
