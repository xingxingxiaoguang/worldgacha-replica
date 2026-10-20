# 世界扭蛋 · 复刻与二创实验室

对 [ワールドガチャ / World Gacha](https://tools.oyasumi-gamedev.com/worldgacha/)（© MIYADAIKU）的**本地复刻 + 可读化拆解 + 扩展实验场 + 净室重建**。

目标不是"打包一份盗版"，而是把这座 1 MB 的单页程序拆成能读、能改、能验证的工程，让你在自己的机器上学习它的做法，并有一个版权干净的起点做二创。

> **公开仓库说明**：本仓库**不包含** `vendor/`（原版镜像）与 `study/`（拆解结果）——它们派生自 All-rights-reserved 的原版，只在本地保留。公开部分是可发布的 `mini/`、`mods/`、`docs/` 与工具脚本。想要完整实验环境，请自行从原站获取快照后运行 `scripts/split.mjs`（见 `docs/05-license.md`）。

---

## 四套东西

| 入口 | 是什么 | 能不能发布 |
|---|---|---|
| `vendor/` | 线上原版离线镜像（HTML + worker + three.js） | ❌ 仅本地研究，勿提交/分发 |
| `study/` | 原版按 150 条顶层语句切成 **38 个可读模块**，逐字节等价 | ❌ 派生自原版，同样受限 |
| `study/play.html?mods=…` | 同上 + `mods/loader.js`，用外挂脚本改调色/相机/导出 | ❌ 依赖原版 |
| `mini/` | **净室重写**的最小实现（地形→街区→体块→线/网点） | ✅ 这部分的代码归你 |

---

## 快速开始

```bash
# 任意静态服务器即可；仓库自带一个零依赖的
node scripts/serve.mjs 4173
```

然后打开：

- <http://127.0.0.1:4173/vendor/> — 原版离线镜像
- <http://127.0.0.1:4173/study/> — 拆解后的可读版（行为与原版一致）
- <http://127.0.0.1:4173/study/play.html?mods=ink-theme,sky-cam,svg-shot> — 带示例 Mod
- <http://127.0.0.1:4173/mini/> — 净室重建的最小世界

> 必须用 http(s) 打开：`file://` 下 Worker 和动态 import 都会被浏览器拦住。

重新生成 `study/`（需要 `acorn` + `prettier`，脚本会自动找 npx 缓存）：

```bash
node scripts/split.mjs
```

---

## 为什么可以确认"复刻成功"

`verify/compare.mjs` 会在同一个无头 Chrome 里打开原版和拆解版，载入**同一个种子**，等生成结束后比较：

1. 世界数据摘要（去掉 `ms` / `stats` 这类计时字段）
2. 画布截图的 SHA-256

实测（`castle` / seed `424242`，4 km、512 网格）：

```
vendor {"seed":424242,"type":"castle","mode":"linetone"} {"h1":"3cd61b04","h2":"c6194072","count":2219045} 70966983e36447f0
study  {"seed":424242,"type":"castle","mode":"linetone"} {"h1":"3cd61b04","h2":"c6194072","count":2219045} 70966983e36447f0
R digest equal : true
pixels equal   : true
```

同一次无头会话中，两张画布截图**逐字节相同**。拆解没有改变任何语义。

> 像素哈希是「同一会话内 A/B」的判据；不同次启动之间，驱动/时序可能让绝对哈希变化（世界数据摘要仍然稳定）。

复现：

```bash
node verify/compare.mjs castle 424242
```

---

## 拆解结果

| 指标 | 数值 |
|---|---|
| 页面 | 1,217,329 B（SHA-256 `778e6fa9…`） |
| 内联主脚本 | 1,053,626 字符 / 150 条顶层语句 |
| 拆出的模块 | 38 个，共约 1.9 MB（格式化后） |
| 运行时库 | `three_hg.js` 722,887 B（three.js r170 + OrbitControls，MIT） |
| 生成 Worker | `world_worker.js` 204,211 B（内含同一套 `WGE` 引擎） |
| 场景类型 | 9 种（河畔/坡道/郊外/田园/温泉/城下町/都心/高楼街/瀑布水都） |
| 数值节点 | 7 组、88 个参数 |
| 建筑包 | 日式 / 瑞士 / 意大利 / 城郭 / 水都 |
| 相机预设 | 33 个 |

模块清单见 [`study/manifest.json`](study/manifest.json)，架构说明见 [`docs/01-architecture.md`](docs/01-architecture.md)。

---

## 目录

```
worldgacha-replica/
├── vendor/                 原版离线镜像（.gitignore，勿分发）
├── study/                  拆解后的可读版（38 个模块 + play.html）
│   ├── modules/            01-i18n-base.js … 90-boot.js
│   ├── worker/             worker 的可读版
│   └── manifest.json       模块 ↔ 原语句映射、哈希、行数
├── mods/                   Mod 加载器 + 三个示例
├── mini/                   净室重建（你自己的 MIT 起点）
├── docs/                   架构 / 生成 / 渲染 / 扩展 / 授权
├── scripts/
│   ├── serve.mjs           零依赖静态服务器
│   └── split.mjs           从 vendor 生成 study
├── verify/
│   ├── shot.mjs            无头截图
│   ├── eval.mjs            在页面里执行表达式
│   └── compare.mjs         原版 vs 拆解版一致性检查
├── index.html              本地导航页
└── package.json
```

---

## 三条二创路线

### 1. 外挂 Mod（最快，适合改外观/交互）

`study/play.html?mods=ink-theme,sky-cam,svg-shot` 已经能跑。一个 Mod 就是一个普通脚本：

```js
(async () => {
  const wg = await WGMod.settle();       // 等首次生成结束
  Object.assign(RK3D.COL, { wood: '#3d5c39', ground: '#d9d3c3' });
  wg.VIEW.outline.k = 1.75;
  wg.rebuild3d();                        // 地面颜色是烘焙进网格的
})();
```

可改的表面：`RK3D.COL`（13 种地面色）、`VIEW.*`（显示模式/线宽/网点/光）、`WG3D.cams`（相机）、`RKSVG`（导出）、`CAM_ORDER + I18N`（菜单）。

详见 [`docs/04-extension.md`](docs/04-extension.md)。

> 注意：**世界生成发生在 Worker 里**，主线程改 `WGE` 不会影响生成结果。要改地形/城镇算法，见文档里的"接管 WGRUN"技巧。

### 2. Fork 拆解版（适合改生成算法）

直接改 `study/modules/15-town-layout.js` 等文件。保存后刷新即可，无需构建。
但请注意：worker 里有一份独立的引擎副本；改主线程算法后，要么同步改 `vendor/lib/world_worker.js`，要么用文档里的方法绕过 worker。

### 3. 净室重建（适合要发布的作品）

`mini/` 是从零写的：解析地形、街道网格、体块、窗户、屋顶，以及 G-buffer 线稿 + 网点。代码短、可读、可商用（随你）。它不复制原版任何代码或素材，只复现了"做法"。

---

## 授权边界（重要）

原版页头明确写着：

> © 2026 MIYADAIKU (oyasumi-gamedev.com). All rights reserved.
> 無断の複製・再配布・改変して配ることを禁じます。

即：**禁止未经许可复制、再分发、修改后分发**。

因此：

- `vendor/`、`study/` 只用于你本机的私人学习，**不要**提交到公开仓库、不要部署到公网、不要打包进作品。
- 想公开发布二创，请用 `mini/` 重写，或联系作者取得许可。
- 文档与拆解方法（事实、接口、算法描述）可以自由使用；代码与素材不行。

详见 [`docs/05-license.md`](docs/05-license.md)。

---

## 已验证 / 未验证

**已验证**

- 离线镜像可独立运行（无外部请求，除 favicon）。
- 拆解版与原版：同种子下世界数据一致、渲染像素逐字节一致。
- 三个示例 Mod 可加载并生效（调色、相机、SVG 按钮）。
- `mini/` 可生成、可切换 4 种显示模式、可导出 PNG。

**未验证 / 已知差异**

- 只对比了 `castle` 一种场景；其他 8 种建议各跑一次 `compare.mjs`。
- 主流浏览器/显卡的像素一致性未逐一测试（本机 SwiftShader 下一致）。
- 原版的雾、AO、树木 LOD、人群等只在文档层面描述，未逐项数值核对。
- `mini/` 是教学级实现：没有侵蚀、没有铁路、没有 LOD、建筑语法也更简单。

---

## 下一步可以做什么

- 给 `mini/` 加"河堤/水都"或"坡道町"的地形模板；
- 把 `mods/` 里的调色板做成 JSON 主题包，运行时切换；
- 用 `RKSVG` 导出矢量线稿，接到自己的排版/上色流程；
- 把原版的 33 个相机预设导出成数据，做自己的取景器；
- 若要做商业二创：以 `mini/` 为骨架，逐步替换算法与美术，保留"种子→地形→城镇→线稿"的管线。
