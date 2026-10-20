# 03 · 渲染与导出

## 1. 场景里有什么

`RK3D.build(THREE, R, OUT, opts)` 把世界数据变成 three.js 场景：

| 组 | 内容 |
|---|---|
| `Ground` | 地形网格（按高度/坡度上色）、道路面、铁路、站台、人行道 |
| `Sea` / `Water` | 海面、河面、湖面 |
| `City` | 建筑体块（按风格包合批）、屋顶、窗 |
| `Props` | 电线杆、栅栏、堤防、鸟居、船、人群 |
| `Trees` | 森林（实例化 + LOD 替换） |
| `Far` | 远景地形 / 天际线（`RKFAR`, `RKHOR`） |

`OUT = WGOUT.make(R, CORE, NEAR)` 是"近景细节"层：只在你站的位置附近保留高精度道具，远处退化为贴片。

13 种地面色（`RK3D.COL`）：

```
sea #4a7fae · water #4f86b3 · road #62666d · platform #c0bbb0
rail #8b8178 · walk #c9c6bf · path #d3cab8 · paved #b3b1ab
wood #5f9147 · green #86c060 · ground #c2bfb8 · curb #aeaba4 · skirt #6b5a48
```

## 2. 延迟线稿

这是整个工具最有辨识度的部分：**不是描边后处理，而是 G-buffer + 屏幕空间线提取 + 网点**。

### 2.1 三张缓冲

| 缓冲 | 内容 | 用途 |
|---|---|---|
| `tC` | 颜色 | 彩色模式 / 网点亮度 |
| `tN` | 视空间法线 | 折线、面分界 |
| `tD` | 深度 | 轮廓、遮挡 |
| `tI` | 物体 ID（RGBA 编码） | 同深度不同物体的分界、细节线 |

一次法线 pass + 一次颜色/深度/ID pass，然后一个全屏 shader 合成。

### 2.2 线的判定

对每个像素，沿 4 个方向（0°/90°/±45°）取两侧邻居，做三件事：

1. **轮廓**：邻居是天空/背景，当前不是 → 线。
2. **深度断裂**：比较"预测深度"和"实际深度"。

   ```
   e1 = |z(+d) − (2·z(0) − z(−d))| / z(0)
   e2 = |z(−d) − (2·z(0) − z(+d))| / z(0)
   ```

   这是**二阶差分**：平坦表面（哪怕掠射角）几乎为 0，只有真正的折边/遮挡才会跳变。这一点很关键——很多 Sobel 深度描边在远处地面会糊成一片，就是因为用了一阶差分。

3. **法线断裂**：`1 − max(dot(n0, n±))` 超过阈值 → 折线。
4. **ID 差**：同深度但物体 ID 不同 → 细节线。

轮廓还可以叠一层更粗的 `silAt`（8 方向搜索），由"轮廓"滑块控制（`VIEW.outline.k`，约 1.0–3.0）。

线宽随距离衰减（`lw` → `lwFar`），并有一个 `fadeA/fadeB` 的远景淡出，避免远处糊成黑块。

### 2.3 网点

- 45° 旋转网格：`p = (x+y, x−y)/√2`。
- 覆盖率 `lev` → 半径 `r = √(lev/π)`。
- `dotsT(lev)` 输出 0/1，再按 `toneScale` 抗锯齿；`toneScale` 很小时退化为平涂。
- 另有 `bandT`：一张 RGBA 纹理存 4 个灰度级，按 `lev` 取通道，用来做"排线/砂目"等不同图案。
- 图案由 `HGPAT` 提供（`stipple`, `sparkle`, `shapes`…），可换种子（`VIEW.patSeed`）。

### 2.4 五种显示模式

| 模式 | 输出 |
|---|---|
| `color` | 纯彩色 |
| `colorline` | 彩色 + 线 |
| `line` | 白纸 + 线（可透明背景） |
| `linetone` | 白纸 + 线 + 网点（默认） |
| `clay` | 灰模 |

## 3. 光照与空气

- 半球光 + 平行光（太阳），`VIEW.lightAz/lightEl` 可调。
- `sunReal`：按月份/小时算太阳方位（`sunMonth`, `sunHour`）。
- 天空是 shader 里的渐变 + 太阳高光，不是贴图。
- 雾/空气透视：`VIEW.air.ao`、`VIEW.air.haze`，按距离混合天空色。
- `VIEW.beta`：明暗对比（漫画的"ベタ"感）。
- `season`：植被颜色；`RK3D.setLeaf` 切换叶色。
- `twoPoint`：两点透视（竖线保持垂直），建筑摄影常用。

## 4. 相机

33 个预设（`CAM_ORDER`），按场景类型动态出现：

```
wide, overview, top, castle, castleFar, scramble, scrambleHigh, lane,
plaza, canyon, skyline, brink, canal, grand, campo, fallsBelow, fallsSide,
aerial, street, station, platform, stairs, center, centerLow, centerHigh,
ix0–ix3（交叉口）, eye, sea, river, hill
```

- 每个预设是 `{pos, target, lens}`；`lens` 18–55 mm。
- `eye` 是"站在地上"的视点（眼高 1.55 m）。
- `HGNav` 提供 6 种行走模式（`std`, `mmb`, `alt`, `pen`, `look`, `pad`）。
- 镜头参数（mm）会同步到 `VIEW.setLens()`，影响透视强度。

## 5. LOD 与性能

- 森林：远处用 impostor（贴片），近处换实体树；`WG3D.setOpt({forest, lod, imp})`。
- 远处窗户：`setWinFar(false)` 直接不画。
- 遮挡剔除：`RKCULL`。
- `lite` 模式：降低渲染分辨率/跳过部分 pass。
- 导出大图时用 `WG3D.withAllTrees()` / `withWide()` 临时提高精度。

## 6. 导出

| 按钮 | 产物 | 说明 |
|---|---|---|
| PNG | 2400 / 3600 / 4800 px | 可开"线画透明背景"（alpha） |
| 地图 PNG | 俯视图 | 2D canvas |
| 高度图 | 16-bit PNG | `hm` |
| SVG | 矢量线稿 | `RKSVG.exportSVG(VIEW, w, h)`，按线段输出 `<path>`，含 `stats` |
| GLB | glTF 2.0 | 米制、可带 UV、嵌入版权信息 |
| FBX | .fbx | 顶点数 > 6M 时拒绝 |
| OBJ | .obj | 同上 |
| 链接 | URL hash | 含种子/类型/相机/显示参数 |
| JSON | 状态 | 可再次载入 |

GLB/FBX/OBJ 都会跳过远景（`skipFar`），避免文件过大。

## 7. 渲染相关的可调项

| 变量 | 作用 |
|---|---|
| `VIEW.mode` | 显示模式 |
| `VIEW.lw` | 线宽 |
| `VIEW.outline.k` | 轮廓粗细 |
| `VIEW.beta` | 明暗对比 |
| `VIEW.toneS` / `VIEW.toneC` | 网点强度/图案 |
| `VIEW.patScale` / `VIEW.patSeed` | 网点密度/种子 |
| `VIEW.air.ao` / `.haze` | AO / 空气透视 |
| `VIEW.shadows` | 阴影开关 |
| `VIEW.twoPoint` | 两点透视 |
| `VIEW.lens` | 焦距 |
| `VIEW.lightAz/El` | 太阳方位 |

这些都能从 Mod 里直接改（见 `docs/04-extension.md`）。
