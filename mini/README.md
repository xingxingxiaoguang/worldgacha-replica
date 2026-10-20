# mini/ — 净室重建

一个从零写的、能跑的最小版本，用来演示 ワールドガチャ 的核心管线：

```
种子 → 解析式地形 → 街道网格 → 地块/体块 → G-buffer 线稿 + 网点 → PNG
```

它**不包含**原版的任何代码或素材，只复现"做法"。代码归你，可自由修改/发布。

## 运行

```bash
node ../scripts/serve.mjs 4173
# 打开 http://127.0.0.1:4173/mini/
```

URL 参数（方便截图/对比）：

```
/mini/?seed=424242&mode=linetone
```

`mode` 可取 `color` / `colorline` / `line` / `linetone`。

## 文件

| 文件 | 职责 | 大约行数 |
|---|---|---|
| `src/rng.js` | 整数哈希、mulberry32、value noise、fbm、ridged | 70 |
| `src/terrain.js` | 解析高度场（海岸+丘陵+河谷+台地）、地形网格、海面 | 130 |
| `src/town.js` | 街道网格、街区、地块、建筑体块、树 | 110 |
| `src/build.js` | 把体块/屋顶/窗/道路/树合并成一个顶点色网格 | 190 |
| `src/ink.js` | 颜色/法线/深度 G-buffer + 屏幕空间线 + 45° 网点 | 200 |
| `src/main.js` | 场景、光照、OrbitControls、UI、导出 | 150 |

## 管线

```
height(x,z) = 海岸衰减 + fbm 丘陵 + ridged 山脊 − 河槽 + 台地压平

town:
  干道 2 条 + 街道 10×10
  每个街区 → 公园（13%）或 1–3 栋建筑
  建筑 = 体块 + 山墙屋顶 + 长边窗

render:
  pass1  normal → rtNormal
  pass2  color  → rtColor + depthTexture
  pass3  全屏合成：
         深度二阶差分 | 法线断裂 | 背景轮廓 → 线
         亮度 → 45° 网点
```

## 怎么改成你的东西

### 换地形

改 `terrain.js` 的 `baseHeight()`。比如做"火山口"：

```js
const r = Math.hypot(x, z);
h = 80 * smoothstep(600, 200, r) - 40 * smoothstep(260, 60, r);
```

高度函数是唯一真相：地形网格、建筑落位、相机都读它。

### 换街区

`town.js` 里现在是正交网格。改成放射状：

```js
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  roads.push({ x1: cx, z1: cz, x2: cx + Math.cos(a) * 280, z2: cz + Math.sin(a) * 280, w: 8, kind: 'street' });
}
```

### 换建筑

`build.js` 的 `addBuilding()`：现在是"盒子 + 山墙 + 两排窗"。加阳台、女儿墙、店招都在这里。

### 换画风

`ink.js` 的 fragment shader：

- 线的阈值：`smoothstep(0.006, 0.035, …)`
- 法线折线：`smoothstep(0.12, 0.42, nd)`
- 网点：`pow(1-l, 2.2) * 0.85`、`toneScale`
- 纸色/墨色：`paper` / `ink` uniform

### 加显示模式

`ink.js` 里 `mode` 是 int：0 彩色、1 彩色+线、2 线、3 线+网点。加一个"水彩"就是再加一个分支 + uniform。

## 与原版的差距

| 项 | 原版 | mini |
|---|---|---|
| 场景类型 | 9 种，各有专有地形钩子 | 1 种（海岸+丘陵+河） |
| 侵蚀 | 水滴侵蚀 + 二次笔迹侵蚀 | 无 |
| 水文 | 优先淹没 + 汇流 + 提河 + 湖泊 | 一条解析河 |
| 城镇 | 11 阶段、铁路、车站、特殊设施、郊外 | 网格 + 体块 |
| 建筑 | 5 个风格包、语法表、LOD 实例化 | 1 种 |
| 渲染 | 5 模式、AO/雾/太阳/两点透视、33 相机 | 4 模式、1 相机组 |
| 导出 | PNG/SVG/GLB/FBX/OBJ/高度图/链接/JSON | PNG |
| 性能 | 513² 网格、1,349 栋建筑、~2 s | 200² 网格、~130 栋、<0.2 s |

## 许可

`mini/` 的代码以 MIT 提供。`mini/lib/three_hg.js` 是 three.js r170 + OrbitControls（MIT），随目录自带；发布时保留 `lib/LICENSE_three.txt`。
