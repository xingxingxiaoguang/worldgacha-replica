# 01 · 架构

## 1. 运行形态

ワールドガチャ 是一个**纯前端单页应用**：

- 一个 HTML 文件，内联约 1 MB 的经典脚本；
- 一个 `lib/three_hg.js`（three.js r170 + OrbitControls，MIT，打包成全局 `window.HG_THREE`）；
- 一个 `lib/world_worker.js`（204 KB，内含同一套生成引擎，独立打包）；
- 没有后端、没有外部数据、没有字体/贴图请求（favicon 除外）。

所有地形、城镇、建筑都由**种子 + 解析式 + 过程网格**在本地算出来。

```
┌────────────────────────── 主线程 ──────────────────────────┐
│  UI (DOM)  ←→  S (状态)  ←→  URL hash / Embed postMessage  │
│                 │                                          │
│           WGRUN.run(S)                                     │
│                 │ postMessage({id,S})                      │
│                 ▼                                          │
│        ┌── Worker: WGE.generate(S) ──┐                    │
│        │   地形 → 侵蚀 → 水文 → 城镇   │                    │
│        └───────────┬─────────────────┘                    │
│                    │ {id,R} + transferables                │
│                    ▼                                       │
│   R (世界数据) ──→ WGOUT.make() ──→ OUT (近景细节)          │
│        │                    │                              │
│        ├──→ MAP (2D 俯视图)  └──→ WG3D.build(VIEW,R,OUT)   │
│        │                                │                  │
│        └──→ RKSVG.exportSVG()           ▼                  │
│                                   three.js 场景            │
│                                        │                   │
│                                   VIEW.render()            │
│                                        ▼                   │
│                              G-buffer → 线/网点合成         │
└────────────────────────────────────────────────────────────┘
```

## 2. 代码分层

原版把职责收在几个大写命名空间里，拆解后仍是同一套边界：

| 层 | 命名空间 | 职责 |
|---|---|---|
| 数学 | `EKE` | 整数哈希、xorshift、value noise、fbm、ridged、smoothstep、clamp |
| 世界生成 | `WGE` | 场景设计、地形、侵蚀、水文、城镇、参数节点、状态规范化 |
| 城镇几何 | `RKCITY` / `RKSKEL` / `HGKOUKA` | 城市体块、街道骨架、建筑/植被实例化 |
| 建筑风格包 | `RKJP` / `RKCH` / `RKITAL` / `WGCASTLE` / `WGAQUA` | 日式、瑞士、意大利、城郭、水都 |
| 3D 编排 | `WG3D` / `RK3D` | 场景构建、LOD、森林、相机、光照 |
| 视图 | `HGView` / `RKView` / `HGNav` / `WGMap` | 渲染器、相机、行走、俯视图 |
| 线/网点 | `HGLINE` / `HGPAT` / `HGKOUKA` | 延迟线提取、网点图案、建筑纹理 |
| 导出 | `RKSVG` / `hgExportGLB` / `hgExportOBJ` / `hgExportFBX` / `EKPNG` | SVG / glTF / OBJ / FBX / PNG |
| 状态/链接 | `WGLINK` / `WGEMB` | URL hash 编解码、嵌入模式 |

## 3. 模块执行顺序

`study/modules/` 的编号就是**加载顺序**。每个文件开头保留了它对应的原始顶层语句编号（`#12`、`#15[3:4]` 等）。

| 文件 | 主要符号 | 说明 |
|---|---|---|
| `00-lang-bootstrap.js` | — | 语言探测、`WG_WORKER_V`、embed 标志 |
| `01-i18n-base.js` | `I18N`, `t()`, `applyText()` | 日文词条 + 取词 |
| `02-i18n-en.js` | `I18N.en` | 英文词条（196 KB，其余语言运行时加载？否，全部内联） |
| `10-math.js` | `EKE` | 噪声与随机 |
| `11-worldgen-core.js` | `WGE` | 状态、设计、地形、节点、绘制、侵蚀、水文 |
| `12-city.js` | `RKCITY` | 城市街块/墙面/屋顶几何 |
| `13-town-cfg.js` | `WGE.TOWN_CFG`, `WGE.town` | 9 种城镇配置 + 主城镇生成器 |
| `14-skeleton.js` | `RKSKEL` | 街道骨架/简化 |
| `15-town-layout.js` | `WGE.generate` | 总装：栅格化地表、调用城镇、轮廓多边形 |
| `20-far-props.js` | `RKFAR`, `RKPROPS` | 远景地形、道具 |
| `21-run-out.js` | `WGRUN`, `WGOUT` | Worker 调度、近景细节输出 |
| `22-horizon-png-crowd.js` | `RKHOR`, `EKPNG`, `RKCROWD` | 天际线、PNG 编码、人群 |
| `23-rk3d.js` | `RK3D` | 主 3D 构建器、地面配色 |
| `24-line-region-facade.js` | `HGLINE`, `RKREGION`, `RKFAC` | 线稿着色器、区域图、立面 |
| `25-kaoku-pattern-plant.js` | `HGKOUKA`, `HGPAT`, `RKPLANT` | 建筑/植被实例、网点图案 |
| `30-export.js` | `hgExportGLB/OBJ/FBX/ZIP` | 模型导出 |
| `31-import.js` | `RKIMP` | 细节导入 |
| `32-cull.js` | `RKCULL` | 遮挡剔除 |
| `40-view-base.js` | `HGView`, `RKView`, `HGNav`, `WGMap` | 视图基类、行走、俯视图 |
| `41-wg3d.js` | `WG3D` | 场景编排、LOD、相机、光照 |
| `42-sets-ital.js` | `WGSET`, `RKITAL` | 风格包注册表 + 意大利包 |
| `43-rkch.js` | `RKCH` | 瑞士包 |
| `44-rkjp-aqua.js` | `RKJP`, `WGAQUA` | 日式包 + 水都 |
| `45-castle.js` | `WGCASTLE` | 城郭包 |
| `50-state.js` | `WGLINK`, `VIEW`, `S/R/OUT` | 全局状态、状态栏、近景中心 |
| `51-controls.js` | `make()`, `renderTypes`, `numPanel` | 生成入口、类型页签、数值节点 UI、撤销 |
| `52-paint.js` | `PAINT` | 地图绘制工具 |
| `53-camera.js` | `CAM_ORDER`, `applyCam` | 33 个相机预设、行走 |
| `54-display-mode.js` | `MODES`, `memo` | 5 种显示模式、轮廓、记忆 |
| `55-forest.js` | `forestChanged` | 森林密度/替换 |
| `56-look.js` | `renderPats`, `SUN` | 网点、β、空气、太阳、镜头 |
| `57-nav.js` | `NAV` | 行走导航 UI |
| `60-export-ui.js` | `fileBase`, `exportSize` | PNG/SVG/GLB/FBX/OBJ/链接/JSON |
| `61-language.js` | `LANGS`, `setLang` | 9 语言切换 |
| `62-svg.js` | `RKSVG.exportSVG` | 矢量导出 |
| `63-embed.js` | `WGEMB` | 嵌入桥 |
| `64-embed-boot.js` | — | 嵌入消息处理 |
| `90-boot.js` | — | 启动：语言、渲染模式、链接恢复、暴露 `window.__wg` |

> 拆解原则：只在**顶层语句边界**切片，每个文件重新加 `"use strict";`。因此执行顺序、TDZ、全局词法绑定都与原版一致。

## 4. 数据契约

### 状态 `S`

```js
{
  app: "worldgacha", v: 1,
  type: "castle",          // 9 种之一
  seed: 424242,
  size: 4000,              // 2000 / 4000 / 6000 / 8000 / 10000
  res: 512,                // 256 / 512 / 1024（栅格分辨率）
  town: 1,                 // 0/1 是否生成城镇
  nodeSeeds: {},           // 每个节点独立种子
  num: {},                 // 数值节点覆写
  paint: [],               // 手绘笔迹
  chaos: 0                 // 随机度 0–100（可选）
}
```

### 世界结果 `R`

| 字段 | 类型 | 说明 |
|---|---|---|
| `G` | `{n,size,cell,x0}` | 栅格：513²、7.8125 m/格、原点 |
| `P` | object | 场景设计参数（`th`, `coastV`, `riverA`, `mtnH`…） |
| `H` | `Float32Array(263169)` | 高度场 |
| `sea` / `lake` | `Uint8Array` | 海/湖掩码 |
| `wood` / `beach` / `slope` / `acc` | `Float32Array` | 林地、沙滩、坡度、流向累积 |
| `rivers` | array | 17 条河流（`pts`, `a`, `main`） |
| `town` | object \| null | 道路、铁路、车站、建筑、区域、统计 |
| `lo` / `hi` | number | 最低/最高海拔 |
| `drops` | number | 侵蚀水滴数 |
| `ms` | object | 各阶段耗时 |

### 城镇 `R.town`

```
roads[]    {id, pts, nodes, cls, w, sw, name, art, farm, rural}
rail       {pts, tunnel, bridge, cut, loop, drawn}
station    {x, z, ux, uz, nx, nz}
buildings[] {…}
areas[]    {…}
pois[]     {…}
castle     {cx, cz, axA, axB, a, rI}
stats      {roads, km, buildings, streets, arts, exits, specials[], ms, tm, out, capped}
```

## 5. Worker 协议

```js
// 主线程 → Worker
{ id: 12, S: {...} }

// Worker → 主线程（成功）
{ id: 12, R: {...} }   // transferList: H, sea, lake, wood, beach, slope, acc, town.zone

// 失败
{ id: 12, error: "stack…" }
```

`WGRUN.run(S)` 的行为：

1. 只在 `http(s)` / `app:` 协议下创建 Worker；
2. 20 ms 内没有 Worker 可用 → 主线程直接 `WGE.generate(S)`；
3. 只保留**最后一次**请求（`id !== latest` 时返回 `old` 错误），避免快速换种子时排队；
4. Worker 出错 → 对挂起请求全部降级为主线程，并丢弃 Worker。

这意味着：**主线程里也有完整引擎**。做二创时可以用 `WGRUN.run = S => Promise.resolve(WGE.generate(S))` 完全绕过 Worker，让主线程的修改生效（代价是 UI 会卡住约 2 秒）。

## 6. 链接与嵌入

- 链接：`WGLINK.write(S, cam, view)` 把状态压缩进 `location.hash`；启动时 `WGLINK.read(hash)` 还原。
- 嵌入：`?embed=1` 时页面进入嵌入布局；`?embed=1&render=1` 时只渲染，通过 `postMessage` 与父页面通信（`WGEMB`）。

## 7. 渲染栈（详见 03）

```
scene ──► [normal pass] ──► rtNormal
      └─► [color pass]  ──► rtColor + depthTexture
                                   │
                         全屏合成（HGLINE）
                         ├─ 深度二阶差分 → 轮廓
                         ├─ 法线断裂 → 折线
                         ├─ ID/材质差 → 细节线
                         └─ 亮度 → 45° 网点 / 排线
```

## 8. 性能（castle / 424242 / 4 km / 512）

| 阶段 | 耗时 |
|---|---|
| 地形 | 145 ms |
| 侵蚀 | 338 ms |
| 水文 | 71 ms |
| 地表分类 | 104 ms |
| 城镇 | 1,261 ms |
| **合计** | **1,920 ms** |

城镇内部（累计毫秒）：`reach 533 → zone 688 → rail 691 → arterials 914 → stations 996 → streets 1014 → paddy 1067 → graph 1125 → specials 1129 → buildings 1185 → areas 1259`。

产物规模：673 条道路 / 174.2 km、1,349 栋建筑、39 条街道、4 条干道、4 个出入口；郊外另有 14 个聚落、199 户、314 栋建筑、11.9 km 道路。
