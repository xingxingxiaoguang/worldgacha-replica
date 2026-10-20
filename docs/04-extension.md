# 04 · 二创指南

## 三条路线

| 路线 | 改动面 | 适合 | 发布 |
|---|---|---|---|
| **Mod** | 运行时打补丁 | 调色、相机、UI、导出、新场景类型 | 依赖原版，不能单独发布 |
| **Fork 拆解版** | 直接改 `study/modules/*.js` | 改生成算法、渲染 pass | 仍是原版派生，不能发布 |
| **净室 `mini/`** | 从零写的代码 | 要发布的作品、商业项目 | ✅ 归你 |

先想清楚目标：**自己玩/学习 → Mod 最快；要做作品 → 从 `mini/` 开始。**

---

## 1. Mod 机制

`study/play.html?mods=a,b,c` 会在应用启动后依次加载 `mods/a.js` 等普通脚本。

```js
// mods/hello.js
(async () => {
  const wg = await WGMod.settle();   // 等首次生成结束
  console.log(wg.S, wg.R);
  WGMod.toast('hello');
})();
```

`WGMod` API：

| 成员 | 说明 |
|---|---|
| `WGMod.ready()` | 等到 `window.__wg` 和 `__wg.R` 存在 |
| `WGMod.settle()` | 再等到 `#busy` 隐藏（推荐） |
| `WGMod.toast(text, ms)` | 左下角提示 |
| `WGMod.log(...)` | 带前缀的 console |
| `WGMod.loaded` | 已加载的 mod 名 |

加载器本身在 `mods/loader.js`，不到 100 行，可以按需改。

> 为什么都要 `await`：首次生成是异步的（Worker + 3D 构建）。太早改相机会被生成结束时的默认镜头覆盖。

---

## 2. 可以挂接的表面

### 2.1 外观（即时生效）

```js
const { VIEW } = await WGMod.settle();
VIEW.mode = 'linetone';   // color / colorline / line / linetone / clay
VIEW.lw = 1.4;
VIEW.outline.k = 1.8;
VIEW.beta = 0.5;
VIEW.toneS = 1.2;
VIEW.toneC = 'stipple';
VIEW.patSeed = 12345;
VIEW.air.ao = 0.6;
VIEW.air.haze = 0.4;
VIEW.lightAz = 300;
VIEW.lightEl = 35;
VIEW.render();
```

### 2.2 地面色（需要重建）

```js
Object.assign(RK3D.COL, { sea: '#3f6f9a', wood: '#3d5c39', ground: '#d9d3c3' });
wg.rebuild3d();     // 颜色在 build 时写进网格
```

13 个键：`sea, water, road, platform, rail, walk, path, paved, wood, green, ground, curb, skirt`。

### 2.3 相机

`CAMS` 由 `WG3D.cams(R)` 生成，下拉框只显示 `CAM_ORDER` 里的键，文字来自 `t('cam_'+key)`。

```js
const orig = WG3D.cams;
WG3D.cams = (R) => ({ ...orig(R), sky: { pos: [0, 260, 380], target: [0, 10, 0], lens: 18 } });
CAM_ORDER.push('sky');
I18N.zh['cam_sky'] = '航拍';
renderCams();       // 重建 CAMS + <select>
applyCam('sky');
```

`I18N` 的键是语言码（`ja`, `en`, `zh-Hans`, `zh-Hant`, `ko`, `hi`, `th`, `es`, `fr`）。

### 2.4 导出

```js
const { svg, stats } = await RKSVG.exportSVG(VIEW, 1600, 1000, undefined, 'my mod');
hgDownload(new Blob([svg], { type: 'image/svg+xml' }), 'out.svg');
```

`hgDownload(data, filename, mime)` 是全局工具；`VIEW.snapshot(w, h)` 返回 PNG 的 data URL。

### 2.5 风格包

```js
WGSET.list();    // [{key:'aqua'},{key:'castle'}, ...]
WGSET.get('castle');
```

`WGSET.register(key, { near, far })` 是注册新城镇几何包的地方。`near/far` 分别是近景/远景构建函数。这是最高阶的扩展之一，建议先读 `45-castle.js` 和 `44-rkjp-aqua.js`。

### 2.6 生成（有坑）

**世界生成默认跑在 Worker 里**，而 Worker 是独立打包的 `world_worker.js`，里面有自己的一份 `WGE`。所以：

- 主线程改 `WGE.TOWN_CFG` / `WGE.FORMS`：**不会**影响生成；
- 要让它生效，先接管生成：

```js
WGRUN.run = async (S) => WGE.generate(S);   // 主线程生成
```

代价：生成时 UI 会卡住约 1–3 秒（正常机器）。做完这一步，`WGE.*` 的所有生成期钩子都可改。

已验证的最小例子见 `mods/new-form.js`：新增一个"台地"场景（`FORMS.mesa` + `TYPES` + `TOWN_CFG` + `TUNE` + 词条），点新页签即可生成。

---

## 3. 配方

### 3.1 换一套配色

见 `mods/ink-theme.js`。要点：

- `VIEW.*` 立即生效；
- `RK3D.COL` 需要 `rebuild3d()`；
- 建筑自身的颜色在风格包里（`RKJP` 等），`RK3D.COL` 只管地面/水/路。

### 3.2 加一个相机 + 菜单项

见 `mods/sky-cam.js`。三个东西必须同时改：`WG3D.cams`、`CAM_ORDER`、`I18N`。

### 3.3 加一个导出按钮

见 `mods/svg-shot.js`。模式：创建 DOM → 调内部 API → `hgDownload`。

### 3.4 新增场景类型

见 `mods/new-form.js`。骨架：

```js
WGRUN.run = async (S) => WGE.generate(S);

WGE.FORMS.mytype = {
  params(rng) {
    return { th: rng()*360, coastV: -9000, coastD: 9000, mtnH: 0, inflow: 0 };
  },
  height(d, x, z) {
    return 20 + 8 * Math.sin(x*0.004) * Math.cos(z*0.004);
  }
};
WGE.TYPES.push('mytype');
WGE.TOWN_CFG.mytype = { ...WGE.TOWN_CFG.rural, paddy: false, rail: 'none' };
WGE.TUNE.mytype = { ...WGE.TUNE.rural };
I18N.zh['type_mytype'] = '我的地形';

document.getElementById('types').innerHTML = '';
renderTypes();
await window.__wg.set(WGE.defaultState('mytype', 123));
```

注意事项：

- `height` 必须自己保证合理范围（海平面是 `WGE.SEA = 0`）；
- 不实现 `riverU` 就没有主河；不实现 `coastAt` 就按 `coastV` 处理海岸；
- `hasSea` 是按类型名硬编码的（river/slope/skyscraper/falls），新类型默认"无海"；
- 城镇仍然可用，但风格由 `TOWN_CFG` 决定，可能需要调 `rc/rr/rf/sepC`。

### 3.5 只改城镇算法（Fork）

改 `study/modules/13-town-cfg.js`（`WGE.town`）或 `15-town-layout.js`（总装）。刷新即可，无需构建。

但如果仍走 Worker，改动不会生效——要么同步改 worker，要么在页面里接管 `WGRUN.run`。

### 3.6 从零做自己的版本

用 `mini/`：`mini/src/terrain.js` 改地形，`town.js` 改街区，`build.js` 改体块，`ink.js` 改线/网点。见 `mini/README.md`。

---

## 4. 调试

```js
window.__wg              // { VIEW, MAP, S, R, OUT, set, applyCam, rebuild3d }
__wg.set(WGE.defaultState('castle', 424242));
__wg.applyCam('overview');
VIEW.snapshot(1600, 1000);
```

- `__wg.S` / `__wg.R` 是最直接的状态/世界快照；
- `__wg.set(S)` 会走完整的生成+构建流程；
- `__wg.rebuild3d()` 只重建 3D，不重新生成世界。

无头验证：

```bash
node verify/shot.mjs  http://127.0.0.1:4173/study/play.html?mods=ink-theme out.png 1600 1000
node verify/eval.mjs  http://127.0.0.1:4173/study/ 'Object.keys(WGE)' 
node verify/compare.mjs castle 424242
```

---

## 5. 稳定性

- 顶层命名空间（`WGE`/`RK3D`/`WG3D`/`VIEW`…）是作者刻意暴露的，跨版本大概率稳定；
- 函数内部的短名（`tt`, `l`, `x`…）是压缩产物，**不要**依赖；
- `WGSET`/`HGPAT`/`RKSVG` 的方法签名可能随版本变，升级前先跑 `verify/compare.mjs`；
- 建议把 `vendor/` 的哈希写进你的项目，升级时对比：页面 `778e6fa9…`、three `2647db15…`、worker `dc61e38a…`。
