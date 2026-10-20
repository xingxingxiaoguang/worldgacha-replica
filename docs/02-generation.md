# 02 · 世界是怎么生成的

一句话：**种子 → 解析式地形 → 水滴侵蚀 → 优先淹没水文 → 街道图 → 地块与建筑**。全程没有外部数据。

## 0. 总流水线

```
S (种子/类型/尺寸/覆写)
 │
 ├─ 0. design     每种场景一个 params()，摇出海岸线、山高、河道…
 ├─ 1. height     解析式高度场（513² 采样）
 ├─ 2. erosion    水滴侵蚀 + 坡度平滑
 ├─ 3. hydrology  优先淹没 → 汇流 → 提河 → 平滑 → 湖泊
 ├─ 4. surface    海/湖/林/沙滩栅格 + 等值线多边形
 ├─ 5. town       分区 → 铁路 → 干道 → 车站 → 街道 → 水田 → 图 → 特殊设施 → 建筑 → 区域
 └─ 6. assemble   打包成 R，transfer 给主线程
```

`WGE.generate(S)` 的内部函数依次是 `o()`（design）、`n()`（地形+侵蚀，带缓存）、`r()`（水文+地表）、`i()`（总装）。三个名字在压缩代码里看不出含义，按调用关系对应即可。

## 1. 场景设计（design）

9 种场景，每种是一个 `FORMS[type]` 对象：

| 类型 | 中文 | 专有钩子 |
|---|---|---|
| `river` | 河畔小镇 | `riverU`, `coastAt` |
| `slope` | 坡道小镇 | `coastAt`, `fixOrigin` |
| `suburb` | 郊外住宅区 | `riverU` |
| `rural` | 田园村落 | `riverU` |
| `onsen` | 山间温泉街 | `riverU` |
| `castle` | 城下町 | `riverU`, `castleAt` |
| `downtown` | 都心商业街 | `riverU`, `floorAt`, `tribUV` |
| `skyscraper` | 摩天楼街 | `bwayU`, `inPark` |
| `falls` | 瀑布上的水都 | `fitGola`, `edgeAt`, `lagAt`, `outO` |

每个对象至少实现：

```js
{
  params(rng) -> design,     // 摇参数
  height(design, x, z, wx, wz) -> number
}
```

`design` 里常见字段：

```
th        场景朝向（0–359°，整个地形会绕原点旋转）
coastV    海岸线基准位置（负值 = 南侧）
coastWig  海岸线摆动幅度
riverA    河幅基准
riverF    河道频率
rw[]      河宽控制点
mtnH      山高
plainW    平原宽度
ravines[] 沟壑
islands[] 岛屿
tribs[]   支流
yato[]    谷地
```

`WGE.design(type, rng, overrides)` 的流程：

```
d = FORMS[type].params(rng)
若 chaos > 0：对 ravine/island/trib/yato 的数量与幅度做扰动
应用 num 覆写（88 个参数里属于 design 的 33 个）
FORMS[type].fitGola?.(d) 或 fixOrigin?.(d)
记录 ct=cos(th), st=sin(th)
```

坐标旋转：

```
u =  x·cos(th) + z·sin(th)
v =  x·sin(th) − z·cos(th)
```

## 2. 高度场

```js
function heightAt(design, x, z) {
  const [u, v] = rotate(design, x, z);
  const n = 1600 * (design.ns || 1);
  const wx = u + design.warp * fbm(u / n,        v / n,        3, seed);
  const wy = v + design.warp * fbm(u / n + 31.7, v / n - 12.3, 3, seed + 7);
  let h = FORMS[design.type].height(design, u, v, wx, wy);
  if (design.minH != null) h = softMin(h, design.minH, 4);   // 软下限
  if (design.anom) h = anomH(design.anom, u, v, h);          // 随机度异常
  return h;
}
```

要点：

- **不是噪声堆叠**，而是每种场景一个解析式（海岸 + 山谷 + 台地 + 河槽），再用 fbm 做 domain warp。
- 采样 513×513 = 263,169 个点，格距 `size / res = 4000 / 512 = 7.8125 m`。
- `minH` 用 4 m 的软过渡，避免城镇区域出现负高度。
- `anom`（随机度 > 0 时）会在高度上叠加局部异常，制造"地貌怪点"。

## 3. 侵蚀

每种场景一套水滴参数（`WGE.TUNE`）：

```js
castle: { k: 0.5, life: 28, rad: 3, talus: 32, soft: 0.35, minA: 250000 }
```

调用：

```js
erodeDroplets(grid, height, {
  k, life, sea, radius, erode, deposit, keep?, lo?, hi?, starts?, seed?
}, rng)
```

- 返回水滴数（本次 131,585）。
- 之后做 `talus` 角的山坡平滑（6 次迭代，0.45 权重）。
- `soft > 0` 时再叠一次大半径低通，得到"圆润的山"。
- 手绘高度/水体后，会在被笔触覆盖的格子周围**再侵蚀一遍**（第二遍只在 touched 区域），避免笔迹像贴纸。

## 4. 水文

这是整个生成器里最"地理"的一段：

```
{F, order} = pfill(H, sea)         // 优先淹没：从海/边界向内灌水，得到每格的水面与溢出顺序
{rec, acc} = flow(F, order)        // 汇流：每格指向最低邻居，累积集水面积
rivers     = rivers(H, rec, acc, { minA })   // 集水面积超过阈值 → 提成折线
rivers     = rivers.map(simplify → chaikin(2))
mainRiver  = mainRiver(design, size)         // 主河额外加 inflow
lakes      = polygons(contours(lakeMask))
```

细节：

- `minA` 是"多小的水算河"的阈值（castle 为 250,000 m²）。
- 河道折线按 `riverWidth(a) = clamp(1.2 + 3.2·√a, 1.5, 90)` 给宽度。
- `chaikin(…, 2)` 两轮切角，避免锯齿。
- 湖由 `contours(…, 0.5)` 提闭合等值线，再 `polygons` 成带洞多边形。
- `tidyCoast` 清理小岛/小湖（`minIsland 4000 m²`, `minLake 20000 m²`）。

结果：17 条河、海拔 35.0–364.6 m。

## 5. 地表分类

两遍栅格规则 + 等值线：

```js
wood[i]  = (slope > 10 || relief > 14) && forestNoise > -0.4 ? 1 : 0
beach[i] = slope < 70 && height < 3.2 && dSea < 7 ? 1 : 0
(height < 4 || dSea < 25 || slope < 30) → wood = 0
```

然后：

```
woods   = polygons(contours(wood,  0.5), 900)
beaches = polygons(contours(beach, 0.5), 200)
sea     = polygons(contours(sea,   0),   2000)
```

`polygons` 负责把栅格等值线变成带洞多边形，`simplify` 按 0.4–0.6 格容差抽稀。

## 6. 城镇

### 6.1 配置表

每种场景一份 `TOWN_CFG`，castle 的实例如下：

```js
{
  rc: 200, rr: 600, rf: 1900,   // 核心/环/外围半径
  sepC: 44, sepR: 64, sepF: 110,// 三圈的道路间距
  maxSl: 11,                     // 最大坡度
  paddy: true,                   // 水田
  rail: "cross",                 // 铁路形态
  exits: "spread",               // 出入口分布
  slK: 7, coreSl: 7,             // 坡度系数
  grade: 0.2, steps: false,      // 坡度/台阶
  siteK: 1,
  castle: true,                  // 城郭
  temples: 4                     // 寺庙数量
}
```

### 6.2 分区

`WGE.TOWN_ZONE = { NONE:0, CORE:1, RES:2, PADDY:3, IND:4, HAMLET:5 }`

先按到中心的距离、坡度、河流距离、铁路距离打一张 zone 栅格，后续所有放置都受它约束。

### 6.3 十一个阶段

`stats.tm` 里记录了累计毫秒，顺序就是阶段顺序：

| # | 阶段 | 做什么 |
|---|---|---|
| 1 | `reach` | 计算城镇可达范围（坡度、海、湖、河过滤） |
| 2 | `zone` | 核心/住宅/水田/工业/聚落分区 |
| 3 | `rail` | 铁路选线（隧道、桥、堑、环线） |
| 4 | `arterials` | 放射状干道 + 环路 |
| 5 | `stations` | 车站选址与站前广场 |
| 6 | `streets` | 街区路网（按三圈间距） |
| 7 | `streets2` | 二级填充、尽端路 |
| 8 | `paddy` | 水田/田埂 |
| 9 | `graph` | 拓扑整理、道路命名、交叉口 |
| 10 | `specials` | 学校、寺庙、神社、公园、礼堂… |
| 11 | `buildings` | 地块切分 + 建筑放置 |
| 12 | `areas` | 街区面、统计 |

（`tm` 里 12 个键，因为 `streets2` 也算一个。）

### 6.4 道路等级

`RKCITY.CLASSES` 是"宽度, 人行道"表：

```
motorway 15/0 · trunk 12/3 · primary 10.5/3.5 · secondary 9/3
tertiary 7.5/2.5 · unclassified 5.5/0 · residential 5/0
living_street 4.5/0 · service 3.6/0 …
```

城镇里实际产出的道路对象：

```js
{ id, pts:[[x,z]…], nodes, cls, w, sw, name, art, farm, rural }
```

`art` = 干道，`farm` = 农田道，`rural` = 郊外道。

### 6.5 建筑

建筑不是"一栋一栋画"，而是**地块 + 风格包**：

1. 每个街区按临街边切地块（lot）；
2. 依据 zone 决定用途/层数；
3. 调用对应风格包（`RKJP` / `RKCH` / `RKITAL` / `WGCASTLE` / `WGAQUA`）生成体块；
4. `HGKOUKA` 负责墙体/窗户/屋顶的实例化与 LOD。

风格包的核心是一张**建筑语法表**：

```js
{ gh: 楼层高, bay: 开间, win: [窗宽, 窗高, 窗台], wc: 腰墙, ledge: 挑檐 }
```

例如：

```
0: gh 3.2  bay 4.0  win [1.20, 0.90, 1.6]
1: gh 2.9  bay 2.8  win [1.65, 1.10, 0.9]
2: gh 3.0  bay 3.3  win [1.70, 1.30, 0.85]  ledge
3: gh 4.3  bay 3.3  win [2.30, 1.65, 0.85]  ledge
4: gh 5.0  bay 6.0  win [4.00, 1.00, 3.0]
6: gh 4.6  bay 1.6  win [1.50, 3.00, 0.1]   // 町屋
```

这样同一套几何代码可以长出日式町屋、瑞士窄窗、意大利拱窗、城郭石垣。

### 6.6 郊外

`outskirts` 是独立的一层：14 个聚落、199 户、314 栋建筑、11.9 km 道路。它不参与城区路网，只按"到主城距离 + 坡度 + 农田"撒点。

## 7. 确定性与覆写

### 节点种子

```
nodeSeed(S, "design")    = S.nodeSeeds.design ?? hash(S.seed, "design", 11)
nodeSeed(S, "terrain")   = …
nodeSeed(S, "erosion")   = …
nodeSeed(S, "town")      = …
nodeSeed(S, "streets")   = …
nodeSeed(S, "buildings") = …
nodeSeed(S, "outskirts") = …
```

每个节点可以单独换种子，互不影响——这是"只重摇城镇，不重摇山"的实现方式。

### 缓存键

`terrainKey` 只包含会影响地形的字段：

```
type, seed, size, res,
design/terrain/erosion 三个节点种子,
design/terrain/erosion 的 num 覆写,
chaos,
手绘的 h/w 笔迹,
erosion.minA
```

命中就直接复用上一次的高度场（`cached: true`，`ms` 归零）。

### 数值节点

7 组、88 个参数：

| 组 | 数量 | 例子 |
|---|---|---|
| `design` | 33 | `th`, `coastD`, `mtnH`, `plainW`, `riverA`, `capeA`, `strip`, `townH`… |
| `terrain` | 2 | `warp`, `ns` |
| `erosion` | 8 | `k`, `life`, `rad`, `talus`, `soft`, `minA`, `erode`, `deposit` |
| `town` | 24 | `rc`, `rr`, `rf`, `sepC`, `maxSl`, `paddy`, `castle`, `temples`… |
| `streets` | 9 | 街道间距/宽度 |
| `buildings` | 6 | 层数/密度 |
| `outskirts` | 6 | 聚落数量/半径 |

每个参数都有 `{k, min, max, step, u, types?, d(state, design)}`，UI 的滑块就是从这里自动长出来的。覆写存在 `S.num[group][key]`，`WGE.numVal/numGet/numDefault` 负责回退到 `d()`。

### 随机度

`S.chaos`（1–100）：

- `chaosDesign` 扰动设计参数；
- `chaosAnom` 往地形里加异常；
- `chaosNum` 扰动数值节点；
- `chaosRho` 控制扰动强度。

它不换种子，只把同一张地图"摇歪"一点。
