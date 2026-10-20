// Split the shipped single-file page into ordered, readable study modules.
//
// The original page embeds one ~1 MB classic script.  Every top-level statement
// is independent (the minifier only grouped declarations), so slicing at
// statement / declarator boundaries and loading the slices as ordered classic
// <script> tags preserves execution order and semantics exactly.
//
// Usage:
//   node scripts/split.mjs [--no-pretty]
//
// Parser/formatter resolution order: ACORN_PATH / PRETTIER_PATH env vars, a
// local node_modules install, then npx's package cache.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const PRETTY = !process.argv.includes('--no-pretty');

function resolvePkg(name, envVar) {
  if (process.env[envVar]) return process.env[envVar];
  try {
    return require.resolve(name);
  } catch {}
  // npx cache fallback (developer convenience, not required at runtime)
  const cache = path.join(process.env.HOME || '', '.npm/_npx');
  if (fs.existsSync(cache)) {
    for (const dir of fs.readdirSync(cache)) {
      const p = path.join(cache, dir, 'node_modules', name);
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error(
    `cannot resolve ${name}. Install it (npm i -D ${name}) or set ${envVar} to its package directory.`
  );
}

const acorn = require(resolvePkg('acorn', 'ACORN_PATH'));
let prettier = null;
if (PRETTY) {
  try {
    prettier = require(resolvePkg('prettier', 'PRETTIER_PATH'));
  } catch (e) {
    console.warn('[split] prettier unavailable, writing original formatting:', e.message);
  }
}

// ---------------------------------------------------------------------------
// Plan: original top-level statement indices -> study module.
// `stmts` keeps whole statements.  `decls` slices one multi-declarator
// statement as [statementIndex, fromDeclarator, toDeclaratorExclusive].
// ---------------------------------------------------------------------------
const PLAN = [
  { file: '00-lang-bootstrap.js', raw: 'bootstrap', title: 'Language / embed bootstrap' },
  { file: '01-i18n-base.js', stmts: [0, 1, 2, 3, 4, 5], title: 'i18n base (ja) + t()' },
  { file: '02-i18n-en.js', stmts: [6], title: 'English strings' },
  { file: '10-math.js', stmts: [7, 8], title: 'Deterministic math, hash, noise (EKE)' },
  { file: '11-worldgen-core.js', stmts: [9, 10], title: 'World engine core (WGE)' },
  { file: '12-city.js', stmts: [11], title: 'City blocks / walls / roofs (RKCITY)' },
  { file: '13-town-cfg.js', stmts: [12], title: 'Town archetype table (WGE.TOWN_CFG)' },
  { file: '14-skeleton.js', stmts: [13], title: 'Street skeleton (RKSKEL)' },
  { file: '15-town-layout.js', stmts: [14], title: 'Roads, blocks, lots (WGE town layout)' },
  { file: '20-far-props.js', decls: [[15, 0, 2]], title: 'Far terrain (RKFAR) + props (RKPROPS)' },
  { file: '21-run-out.js', decls: [[15, 2, 4]], title: 'Worker runner (WGRUN) + world output (WGOUT)' },
  { file: '22-horizon-png-crowd.js', decls: [[15, 4, 7]], title: 'Skyline (RKHOR), PNG encoder (EKPNG), crowd (RKCROWD)' },
  { file: '23-rk3d.js', decls: [[15, 7, 9]], title: 'Main 3D scene builder (RK3D)' },
  { file: '24-line-region-facade.js', decls: [[15, 9, 12]], title: 'Line renderer (HGLINE), region map, facades' },
  { file: '25-kaoku-pattern-plant.js', decls: [[15, 12, 15]], title: 'Buildings (HGKOUKA), patterns, plants' },
  { file: '30-export.js', stmts: [16, 17, 18, 19, 20, 21, 22, 23, 24, 25], title: 'GLB / OBJ / FBX / ZIP / download' },
  { file: '31-import.js', decls: [[26, 0, 1]], title: 'Detail importer (RKIMP)' },
  { file: '32-cull.js', decls: [[26, 1, 2]], title: 'Occlusion / culling (RKCULL)' },
  { file: '40-view-base.js', stmts: [27, 28, 29, 30, 31, 32, 33], title: 'View base classes + map (HGView/RKView/HGNav/WGMap)' },
  { file: '41-wg3d.js', decls: [[34, 0, 1]], title: '3D orchestrator (WG3D)' },
  { file: '42-sets-ital.js', decls: [[34, 1, 3]], title: 'Set registry (WGSET) + Italian town pack' },
  { file: '43-rkch.js', decls: [[34, 3, 4]], title: 'Swiss / CH town pack (RKCH)' },
  { file: '44-rkjp-aqua.js', decls: [[34, 4, 6]], title: 'Japanese town pack (RKJP) + water town (WGAQUA)' },
  { file: '45-castle.js', stmts: [35, 36, 37], title: 'Castle town pack (WGCASTLE)' },
  { file: '50-state.js', stmts: [38, 39, 40, 41, 42, 43, 44, 45, 46, 47], title: 'App state, history, status, near field' },
  { file: '51-controls.js', stmts: [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66], title: 'make(), type picker, numeric nodes, undo' },
  { file: '52-paint.js', stmts: [67, 68, 69, 70, 71, 72, 73, 74, 75], title: 'Map paint tools + tree style' },
  { file: '53-camera.js', stmts: [76, 77, 78, 79, 80, 81, 82, 83, 84], title: 'Camera presets / walking' },
  { file: '54-display-mode.js', stmts: [85, 86, 87, 88, 89, 90, 91, 92, 93], title: 'Display modes, outline, memo' },
  { file: '55-forest.js', stmts: [94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107], title: 'Forest density / impostors' },
  { file: '56-look.js', stmts: [108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128], title: 'Lite, patterns, beta, air, sun, lens' },
  { file: '57-nav.js', stmts: [129, 130, 131, 132], title: 'Walk navigation UI' },
  { file: '60-export-ui.js', stmts: [133, 134, 135, 136, 137, 138, 139, 140, 141, 142], title: 'PNG / GLB / link / JSON export UI' },
  { file: '61-language.js', stmts: [143, 144, 145, 146], title: 'Language switching' },
  { file: '62-svg.js', decls: [[147, 0, 1]], title: 'SVG exporter (RKSVG)' },
  { file: '63-embed.js', decls: [[147, 1, 2]], title: 'Embed bridge (WGEMB)' },
  { file: '64-embed-boot.js', stmts: [148], title: 'Embed message handlers' },
  { file: '90-boot.js', stmts: [149], title: 'Boot sequence' },
];

const html = fs.readFileSync(path.join(ROOT, 'vendor/index.html'), 'utf8');

// --- locate the three script tags
const bootOpen = html.indexOf('<script>');
const bootClose = html.indexOf('</script>', bootOpen) + '</script>'.length;
const bootSource = html.slice(bootOpen + '<script>'.length, html.indexOf('</script>', bootOpen));

const extOpen = html.indexOf('<script src="lib/three_hg.js', bootClose);
const extClose = html.indexOf('</script>', extOpen) + '</script>'.length;

const appOpen = html.indexOf('<script>', extClose);
const appClose = html.indexOf('</script>', appOpen) + '</script>'.length;
const appSource = html.slice(appOpen + '<script>'.length, html.indexOf('</script>', appOpen));

if (!(bootOpen < bootClose && bootClose < extOpen && extOpen < appOpen && appOpen < appClose)) {
  throw new Error('unexpected script layout in vendor/index.html');
}

const ast = acorn.parse(appSource, { ecmaVersion: 2024, sourceType: 'script' });
console.log(`[split] parsed ${ast.body.length} top-level statements, ${appSource.length} chars`);

const outDir = path.join(ROOT, 'study/modules');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const manifest = [];

function stmtSource(st) {
  return appSource.slice(st.start, st.end);
}

for (const mod of PLAN) {
  const chunks = [];
  const symbols = [];
  const used = [];

  if (mod.raw === 'bootstrap') {
    chunks.push(bootSource);
    used.push('bootstrap');
  }

  for (const idx of mod.stmts || []) {
    const st = ast.body[idx];
    if (!st) throw new Error(`missing statement #${idx} for ${mod.file}`);
    chunks.push(stmtSource(st));
    used.push(`#${idx}`);
    if (st.type === 'VariableDeclaration') {
      for (const d of st.declarations) if (d.id.type === 'Identifier') symbols.push(d.id.name);
    } else if (st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') {
      if (st.id) symbols.push(st.id.name);
    }
  }

  for (const [si, from, to] of mod.decls || []) {
    const st = ast.body[si];
    if (!st || st.type !== 'VariableDeclaration') throw new Error(`statement #${si} is not a declaration`);
    for (let i = from; i < to; i++) {
      const d = st.declarations[i];
      if (!d) throw new Error(`missing declarator ${si}[${i}] for ${mod.file}`);
      const name = appSource.slice(d.id.start, d.id.end);
      const init = appSource.slice(d.init.start, d.init.end);
      chunks.push(`const ${name} = ${init};`);
      symbols.push(d.id.name);
    }
    used.push(`#${si}[${from}:${to}]`);
  }

  const banner = `/*!
 * World Gacha — study module: ${mod.title}
 * ${mod.file}
 *
 * Extracted verbatim from the shipped page (© 2026 MIYADAIKU / oyasumi-gamedev.com,
 * all rights reserved). Private study only — do not redistribute.
 * Original top-level units: ${used.join(', ')}
 */
`;
  // The shipped page is one classic script starting with "use strict", so every
  // statement ran in strict mode.  Re-assert it per module so splitting cannot
  // silently change semantics (the bootstrap IIFE has its own scope).
  const strict = mod.raw === 'bootstrap' ? '' : '"use strict";\n';
  const original = banner + strict + chunks.join('\n\n') + '\n';
  let output = original;
  if (prettier) {
    try {
      output = await prettier.format(original, {
        parser: 'babel',
        printWidth: 96,
        tabWidth: 2,
        semi: true,
        singleQuote: false,
        trailingComma: 'none',
      });
    } catch (e) {
      console.warn(`[split] prettier failed on ${mod.file}: ${e.message}`);
    }
  }

  fs.writeFileSync(path.join(outDir, mod.file), output);
  manifest.push({
    file: mod.file,
    title: mod.title,
    source: used,
    symbols,
    bytes: Buffer.byteLength(output),
    lines: output.split('\n').length,
    sha256: sha(output),
  });
  console.log(
    `[split] ${mod.file.padEnd(30)} ${String(output.split('\n').length).padStart(6)} lines  ${(
      output.length / 1024
    ).toFixed(1)} KiB  ${symbols.slice(0, 6).join(', ')}${symbols.length > 6 ? '…' : ''}`
  );
}

fs.writeFileSync(
  path.join(ROOT, 'study/manifest.json'),
  JSON.stringify(
    {
      source: {
        page: 'https://tools.oyasumi-gamedev.com/worldgacha/',
        vendorSha256: sha(html),
        appScriptBytes: Buffer.byteLength(appSource),
        statements: ast.body.length,
      },
      modules: manifest,
    },
    null,
    2
  ) + '\n'
);

// --- study/lib + rewritten study/index.html
fs.mkdirSync(path.join(ROOT, 'study/lib'), { recursive: true });
for (const f of ['three_hg.js', 'world_worker.js', 'LICENSE_three.txt']) {
  fs.copyFileSync(path.join(ROOT, 'vendor/lib', f), path.join(ROOT, 'study/lib', f));
}

const tags = manifest.map((m) => `<script src="modules/${m.file}"></script>`).join('\n');
const studyHtml =
  html.slice(0, bootOpen) +
  '<script src="modules/00-lang-bootstrap.js"></script>' +
  html.slice(bootClose, appOpen) +
  tags +
  html.slice(appClose);

fs.writeFileSync(path.join(ROOT, 'study/index.html'), studyHtml);

// play.html = identical app + the optional mod loader (see mods/loader.js)
const playHtml = studyHtml.replace(
  '</body>',
  '<script src="../mods/loader.js"></script>\n</body>'
);
fs.writeFileSync(path.join(ROOT, 'study/play.html'), playHtml);

console.log(`[split] wrote study/index.html + study/play.html with ${manifest.length} module scripts`);
