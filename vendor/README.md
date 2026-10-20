# vendor/ — 原版离线镜像

这里是从 <https://tools.oyasumi-gamedev.com/worldgacha/> 下载的原始文件，仅用于**本机离线研究**。

| 文件 | 大小 | SHA-256 |
|---|---|---|
| `index.html` | 1,217,329 B | `778e6fa9b5ad79ba75ec6043a8c9b421fc2a8b40a9463e192c294d8ae69c9457` |
| `lib/three_hg.js` | 722,887 B | `2647db1537fd1d51ee3f70e52fddab35e21e48598fd54e72f09313896a863080` |
| `lib/world_worker.js` | 204,211 B | `dc61e38a7328087debaa006435fe21f9c537c9523f6c480ccad554dd53442d6f` |
| `lib/LICENSE_three.txt` | 1,081 B | three.js 的 MIT 许可证 |

## 不要提交

`.gitignore` 已排除本目录。原版是 **All rights reserved**，禁止再分发；请勿 `git add -f`。

## 重新获取

```bash
curl -o vendor/index.html 'https://tools.oyasumi-gamedev.com/worldgacha/'
curl -o vendor/lib/three_hg.js 'https://tools.oyasumi-gamedev.com/worldgacha/lib/three_hg.js?v=2647db15'
curl -o vendor/lib/world_worker.js 'https://tools.oyasumi-gamedev.com/worldgacha/lib/world_worker.js?v=dc61e38a'
curl -o vendor/lib/LICENSE_three.txt 'https://tools.oyasumi-gamedev.com/worldgacha/lib/LICENSE_three.txt?v=4c40a1ef'
shasum -a 256 vendor/index.html vendor/lib/*
```

哈希对不上说明线上版本已更新——先跑 `node verify/compare.mjs`，再决定是否重新拆解。
