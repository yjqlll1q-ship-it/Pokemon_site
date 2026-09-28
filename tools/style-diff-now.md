# 样式回归对照（改造前 vs 改造后）

- 基线：`baseline-after.json`
- 对照：`tools\snap-now.json`
- **残余差异条数：24**
- 归一化后相等（仅写法差异）：0
- 判定为无影响（边框宽度为 0，肉眼不可见）：0
- 判定为等价（正方形上的圆角写法）：0
- 判定为不可比（判据在 ui-check 的几何断言里）：0
- 基线中就选不到、已跳过的采集点：0

| 位置 | 属性 | 改造前 | 改造后 |
| --- | --- | --- | --- |
| __doc | scrollHeight | `964` | `992` |
| mobile | scrollHeight | `1827` | `1877` |
| home.body | height | `963.516px` | `992.312px` |
| home.body | __box[height] | `963.52` | `992.31` |
| home.navLink | width | `53px` | `93.5px` |
| home.navLink | __box[left] | `1094.5` | `970` |
| home.navLink | __box[width] | `53` | `93.5` |
| home.main | height | `722.75px` | `751.547px` |
| home.main | __box[height] | `722.75` | `751.55` |
| home.grid | __box[top] | `199.78` | `228.58` |
| home.cardLi | __box[top] | `199.78` | `228.58` |
| home.card | __box[top] | `199.78` | `228.58` |
| home.cardDex | __box[top] | `210.78` | `239.58` |
| home.cardStage | __box[top] | `218.78` | `247.58` |
| home.cardStageGlow::before | __box[top] | `218.78` | `247.58` |
| home.cardSprite | __box[top] | `218.78` | `247.58` |
| home.cardName | __box[top] | `376.78` | `405.58` |
| home.cardTypes | __box[top] | `410.38` | `439.17` |
| home.cardBadge | __box[top] | `410.38` | `439.17` |
| home.cardBadgeDot | __box[top] | `418.88` | `447.67` |
| home.cardFooter | __box[top] | `442.38` | `471.17` |
| home.footer | __box[top] | `843.34` | `872.14` |
| home.footerInner | __box[top] | `844.34` | `873.14` |
| home.footerP | __box[top] | `866.34` | `895.14` |