# 宝可梦图鉴

一个宝可梦资料站，两个功能：

1. **首页「最初的伙伴」** —— 点击宝可梦 → 弹出属性面板与完整进化分支（静态预渲染）。
2. **图鉴查询** —— 前三个世代全部 386 只，按属性 / 世代 / 种族值 / 特性 / 蛋群多条件搜索、排序、分页（走本地 SQLite）。

- 框架：Next.js 16（App Router）+ React 19 + TypeScript
- 样式：**Tailwind CSS v4**（`@theme` 定义设计 token，`@utility` 收口复合样式）+ 一套设计变量
- 数据：构建前一次性从 PokéAPI 固化成 `data/pokedex.json`，再由它灌出 `data/pokedex.db`。
  运行时**不请求任何第三方**，查询全部走本地数据库。

> **关于「零后端」**：这个站原先刻意做成零后端（规划里将来直接静态托管）。做图鉴查询时这个前提被
> 主动放弃了 —— 多条件组合筛选、分页、聚合计数都要在服务端算才合理，把 386 只的数据全塞进浏览器
> 只会让首屏和内存一起变差。现在的形态是折中：**首页仍然是静态预渲染**（`/` 是 Static），
> 查询页是静态外壳 + 4 个动态 API 路由。

---

## 快速开始

**本机（Windows）直接双击：**

| 文件 | 作用 |
| --- | --- |
| `start.bat` | 生产模式启动（`next start`，端口 3000）。缺 `.next` 会自动先构建；端口被旧进程占着会自动清掉 |
| `dev.bat` | 开发模式启动（`next dev` + Turbopack，端口 3000） |
| `stop.bat` | 停掉 3000 端口上的服务；`stop.bat 3101` 可指定别的端口 |

三个 `.bat` 都只是跳板，真正的逻辑在 `tools/launch.ps1`（唯一可测入口，参数 `prod` / `dev` / `stop`）。

> **为什么必须有这几个文件：本机的 Node 不在系统 PATH 里。**
> 机器上只有一份 Node —— WorkBuddy 随包托管的那份
> （`%USERPROFILE%\.workbuddy\binaries\node\versions\<版本>`），而它只在 WorkBuddy 自己的会话里被注入。
> 自己开一个 cmd 窗口敲 `npm start` 会直接报「npm 不是内部或外部命令」，
> 看起来就是「项目启动不了」，其实跟项目代码无关。
> `launch.ps1` 优先用 PATH 里的 Node（将来装了系统级 Node 会自动改用它），
> 找不到才回退到托管版，并通过 `versions\current` 这个稳定指针定位版本目录（跨 WorkBuddy 升级不会失效）。

> **启动器为什么给子进程设 `NODE_NO_WARNINGS=1`：**
> `/api/*` 第一次碰数据库时，`node:sqlite` 会往 **stderr** 打一行 ExperimentalWarning。
> 这行本身无害，但只要调用方把两个流合并（`powershell ... *>&1`），
> PowerShell 就会把它变成 `NativeCommandError` 记录；配合 `$ErrorActionPreference = 'Stop'`
> 就是**终止性错误** —— 启动器整个被中断，正在跑的服务跟着被杀掉（实测：首次查库后 2 秒内服务消失）。
> 所以：警告在子进程里关掉，同时启动器自身用 `Continue` 跑子命令，
> 任何子进程 stderr 都不再能让启动器退出。代价是**开发模式的 Turbopack 警告也一并静音** ——
> 需要看警告时用 `npm run dev` 手动起。

**手动跑（前提是 Node 已在 PATH 里）：**

```bash
npm install
npm run dev          # http://localhost:3000
```

常用脚本：

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 本地开发 |
| `npm run build` / `npm start` | 生产构建 / 启动 |
| `npm run typecheck` | TypeScript 检查 |
| `npm run data` | 按 `BASE_FORMS` 重新抓取数据（增量，已有图片跳过） |
| `npm run data:force` | 同上，但强制重下图片 |
| `npm run data:check` | 数据体检：中文名、属性、分类、蛋群、种族值、立绘是否齐全 |
| `npm run db` | 由 `data/pokedex.json` 灌出 `data/pokedex.db`（需先停服务，见下） |
| `npm run db:check` | 数据库体检（56 项）：表结构、外键、语义层已知答案 |
| `npm run ui:check` | 首页端到端（需先起服务）：点开 → 属性 + 全部进化分支 |
| `npm run pokedex:check` | 图鉴查询页端到端（需先起服务）：搜索 / 筛选 / 排序 / 分页 / 弹窗 / 深链还原 / 移动端 |
| `npm run api:check` | 4 个 API 路由的端到端（需先起服务）；加 `--self-test` 可做反向验证 |

> `ui:check` / `pokedex:check` 都用本机 Chrome/Edge 走 CDP 驱动真实浏览器，断言口径是
> 「用户能不能做到这件事」而不是「代码有没有执行」，同时输出截图到 `shots/`。
> 两个看门狗式的断言：伊布必须有 9 个形态 / 8 条分支；点火属性后**屏幕上的每一张卡都真的有火属性**
> （只查数量的话，一个「把条件忽略掉」的 bug 也能让结果非空而通过）。
>
> **`npm run db` 之前必须先停掉服务**：Windows 上运行中的进程会锁住 `data/pokedex.db`，
> 替换时直接 `EBUSY`。脚本会打印这句提示，但顺序还是得人来做：
> 停服务 → `npm run db` → `npm start`。
>
> **Node 版本要求 ≥ 22.5**：数据库驱动用的是 Node 内置的 `node:sqlite`（零 npm 依赖、无需原生编译），
> 22.22 上直接可用，不用带 `--experimental-sqlite`，只会在 stderr 打一行 ExperimentalWarning。

---

## 目录结构

```
start.bat dev.bat stop.bat    Windows 双击入口（跳板，逻辑在 tools/launch.ps1）
app/
  layout.tsx           全站骨架（顶栏 + 页脚）
  page.tsx             首页：读静态数据 → 交给交互组件（静态预渲染）
  pokedex/page.tsx     图鉴查询页外壳（静态），交互全在 PokedexQuery 里
  api/pokedex/route.ts         GET 多条件搜索
  api/pokedex/[id]/route.ts    GET 单只详情（含完整进化链）
  api/facets/route.ts          GET 筛选面（各属性/世代计数、种族值区间）
  api/types/route.ts           GET 18 种属性的分类档案（计数 + 相性）
  globals.css          Tailwind 入口 + 全部设计 token（@theme / @utility / @layer base）
components/
  PokedexExplorer.tsx  首页交互主体：网格 + 弹窗状态
  PokedexQuery.tsx     查询页交互主体：筛选状态 + 请求 + 分页 + 详情弹窗
  PokedexResultCard.tsx 查询结果卡片（分类 + 种族值总和）
  TypeGallery.tsx      「按属性」视图：18 张属性卡（计数 + 弱点/抗性/免疫/招式克制）
  PokemonCard.tsx      首页网格里的宝可梦按钮
  PokemonDetail.tsx    弹窗内容：属性面板 + 进化区
  EvolutionTree.tsx    进化链渲染（单线横向 / 有分支自动转缩进树）
  Modal.tsx            通用弹窗外壳：Esc、遮罩点击、滚动锁、焦点管理
  TypeBadge.tsx  StatBars.tsx  SiteHeader.tsx  SiteFooter.tsx
lib/
  pokedex.ts           静态数据的唯一入口 + 进化线派生计算（服务端专用）
  db.ts                数据库连接（单例、只读）
  pokedex-query.ts     条件 → SQL、行 → 视图对象（服务端专用）
  api-types.ts         前后端共用的契约类型（**只有类型，没有值**）
  evolution.ts         进化树的纯计算（不 import 任何数据，客户端组件要用）
  typeColors.ts        属性 → CSS 变量映射
  site.ts              站名与导航配置
data/
  pokedex.json         生成物：430 只（范围内 386）+ 202 条进化线 + 18 属性
  pokedex.db           生成物：由上面那份 JSON 灌出的 SQLite（约 1.9 MB）
scripts/
  build-data.mjs       抓 PokéAPI → pokedex.json（带 .cache/pokeapi 磁盘缓存）
  build-db.mjs         pokedex.json → pokedex.db（写 .tmp 再改名，先自检）
  check-data.mjs       数据体检
  check-db.mjs         数据库体检（56 项）
public/sprites/        430 张官方立绘（约 55 MB，本地托管）
tools/
  launch.ps1           启动器本体：定位 Node → 清端口 → 按需构建 → 前台起服务（prod / dev / stop）
  cdp-lib.cjs          最小 CDP 客户端（本机 Chrome/Edge，零依赖）
  ui-check.cjs         首页端到端 + 截图（38 项）
  pokedex-check.cjs    查询页端到端 + 截图（53 项）
  api-check.cjs        API 端到端（72 项，含 --self-test 反向验证）
  tw-compile.cjs       只编译 Tailwind 一层
  tw-audit.cjs         审计「写了但没生成」的 utility
  style-snapshot.cjs   采集关键元素的计算样式 → JSON
  style-diff.cjs       比对两份快照，输出报告 + 退出码
  pixel-diff.cjs       两张截图的像素级比对（含差异包围盒 + 行带直方图）
  pixel-shift-map.cjs  pixel-diff 报差异时，判断「是纯 1px 平移（栅格化取整）还是真改了样式」
shots/                 端到端脚本产出的截图
```

> **数据分三层，别串线**：
> `scripts/build-data.mjs`（抓取）→ `data/pokedex.json` ⇄ `lib/pokedex.ts`（首页静态读）；
> `scripts/build-db.mjs` → `data/pokedex.db` ⇄ `lib/db.ts` + `lib/pokedex-query.ts`（查询走这里）。
> **组件一律不许直接 import JSON，也不许 import `lib/db.ts` / `lib/pokedex-query.ts`** ——
> 后者会把 `node:sqlite` 拖进客户端包。客户端只认 `lib/api-types.ts` 里的类型。

> **设计变量只有一处出处**：`app/globals.css` 的 `@theme`。改配色 / 圆角 / 阴影 / 字体只动那里，全站生效。
> 组件里不再有任何 `.css` 文件，也不再 import CSS —— 样式全部以 utility 形式写在 JSX 上。

---

## 怎么加一只新宝可梦

只改一处，然后跑一次脚本：

```js
// scripts/build-data.mjs
const BASE_FORMS = [1, 4, 7, 43, 60, 133, 172, 236, 265, 280 /* ← 加图鉴编号 */];
```

```bash
npm run data && npm run data:check
```

脚本会自动把**整条进化链**（含所有分支和进化条件）拉下来，并下载对应立绘。前端不用改任何代码——首页列表按 `BASE_FORMS` 顺序渲染。
若加了脚本里没处理过的进化条件类型（`evolution_details` 里的新 trigger），在 `conditionText()` 里补一条分支即可，其它保持原样兜底。

## 怎么加新功能

1. **新页面**：在 `app/` 下加目录，导航项加到 `lib/site.ts` 的 `SITE.nav`。
2. **新静态数据**：只动 `scripts/build-data.mjs` 的输出结构 + `lib/pokedex.ts` 的类型与读取函数。
3. **新可筛选字段**：`build-data.mjs` 抓字段 → `build-db.mjs` 建列/建表 → `check-db.mjs` 加断言 →
   `lib/pokedex-query.ts` 的 `buildWhere` 加条件 + `api-types.ts` 加契约字段 → 前端加控件。
   五处缺一处就会「界面有控件但筛不出来」，所以 `api:check` 里每个新条件都要配一条断言。
4. **新弹窗**：`Modal.tsx` 是与业务无关的外壳，传 `labelledBy` + `scrollKey` 即可复用。
5. **换配色**：只改 `app/globals.css` 里的 `@theme`；文件末尾预留了暗色主题的覆盖写法。

---

## API 契约

四个路由都是 `force-dynamic`，`/api/*` 不进静态产物。

| 路由 | 说明 |
| --- | --- |
| `GET /api/pokedex` | 多条件搜索。参数：`q` `types` `typeMode`(`any`/`all`) `excludeTypes` `generations` `statTotalMin/Max` `statKey` `statMin/Max` `abilities` `eggGroups` `tags` `sort` `order` `page` `pageSize`。列表类参数用逗号分隔 |
| `GET /api/pokedex/{id}` | 单只详情 + 所属进化链 + 链上成员展示信息。非数字→400，不存在→404 |
| `GET /api/facets` | 筛选面：总只数、世代/属性/特性/蛋群计数、种族值区间、排序选项、标记计数 |
| `GET /api/types` | 18 种属性的分类档案：范围内只数 + 弱点 / 抗性 / 免疫 / 招式克制 |

实现上的三条约定：

- **参数一律归一化**（`normalizeParams`）：非法值退回默认、区间上下界传反自动交换、
  `pageSize` 夹在 12–200、指定了单项种族值区间但没给 `statKey` 就当没这个条件 ——
  宁可忽略一个条件，也不要悄悄筛一个用户没选的东西。
- **SQL 全参数化**：条件值走 `?` 占位；只有「列名 / 排序方向」走白名单映射（`SORT_KEYS` /
  `STAT_COLUMNS`，都是 `as const satisfies` 过的常量），拼进 SQL 的一定是代码里写死的字符串。
  `LIKE` 的 `%` `_` `\` 都做了转义，否则用户输入的 `%` 会变成「匹配一切」。
- **树的结构**：`line.tree` 是**根节点的子节点数组**，根节点自身不在 `tree` 里（根由 `line.rootId`
  单独表达，前端 `getLineRoot()` 把两者拼成一棵树）。写断言时容易在这里搞反。

---

## 配色方案（不是自己拍的，是查出来再降饱和的）

参考来源：

1. 官方 Pokémon 品牌色：黄 `#FFCB05` / 蓝 `#3D7DCA` / 深蓝 `#003A70`
   —— brandpalettes.com/pokemon-color-codes
2. 精灵球红 `#EE1515`（schemecolor.com/pokemon-colors）
3. 属性色：Bulbapedia《Help:Color templates》中朱紫世代官方属性色（如草 `#3FA129`、水 `#2980EF`）
4. 降饱和处理思路：莫兰迪色系（饱和度压到 30%~45%、掺灰），
   并对照了宝可梦同人站 ColorDex 的"混合色"版本（pokemonaah.net/art/colordex）

**落地原则：色相保留官方识别度，饱和度 / 明度统一压低，底色用米灰而不是纯白。**

| 用途 | 变量 | 值 | 来源 |
| --- | --- | --- | --- |
| 页面底色 | `--bg` | `#F6F4EF` | 莫兰迪燕麦色提亮 |
| 卡片 | `--surface` | `#FFFDF9` | 暖白，避免纯白刺眼 |
| 正文 | `--ink` | `#25313D` | `#003A70` 去饱和 |
| 品牌深蓝 | `--navy` | `#2C4A6B` | `#003A70` 降饱和提亮 |
| 品牌蓝 | `--blue` | `#6F9AC4` | `#3D7DCA` 降饱和 |
| 品牌黄 | `--yellow` | `#D3B055` | `#FFCB05` 降饱和 |
| 精灵球红 | `--red` | `#C0574C` | `#EE1515` 降饱和 |
| 属性色 | `--type-*` | 18 项 | Bulbapedia 官方属性色统一降饱和 |

属性 badge 的底色/字色/描边都由单个 `--tint` 用 `color-mix()` 派生，所以新增属性只需要加一行变量。
**落地位置**：所有 token 都在 `app/globals.css` 的 `@theme { … }` 里；18 个 `--type-*` 放在普通 `:root`
（它们只被内联的 `--tint` 消费，不按名字出现在任何规则里，放进 `@theme` 会被 Tailwind 的
「未使用主题变量不输出」优化裁掉，那样属性色会静默失效）。

---

## 样式体系（Tailwind v4）

约定只有三条：

| 情况 | 写法 |
| --- | --- |
| 普通样式 | 直接写 utility 到 `className`，不出 `.css` 文件 |
| 设计变量（颜色/圆角/阴影/字体/动画） | `app/globals.css` 的 `@theme`，按 Tailwind 命名空间命名（`--color-*` → `bg-*`/`text-*`/`border-*`，`--radius-*` → `rounded-*`，…） |
| 复合样式（自绘图形伪元素、`--tint` 派生配方、必须 sRGB 插值的渐变） | `app/globals.css` 的 `@utility`，名字语义化（`type-chip` / `tint-node-active` / `brand-mark` …） |

**三个已经踩过的坑，改样式前先看一眼：**

1. **Tailwind 内置的 `drop-shadow-*` / `backdrop-blur-*` / `tabular-nums` 在本机 Chrome 114 上会静默失效。**
   它们生成的是「空格分隔的 `var(--tw-xxx,)` 链」，只要链里出现用 `@property` 注册过、又没被赋值的
   变量，整条声明就被判为无效，计算值退回 `none` / `normal` —— 投影和等宽数字会悄悄丢掉且不报错。
   所以直接用 `filter: drop-shadow(...)` 这类等价声明写成 `@utility`（`sprite-shadow` / `art-shadow` /
   `thumb-shadow` / `num-tabular`），不要用内置版本。
2. **`@utility` 的产物排在内置 utility 之前。** 所以自定义 utility 里的
   `background-color` / `border-color` / `box-shadow` 会被同一元素上的 `bg-*` / `border-*` / `shadow-*`
   覆盖掉。典型症状：`tint-node-active` 的「当前形态」高亮整块消失。规则是
   **不要把它和 `bg-*` / `border-*` / `shadow-*` 写在同一个元素上**（见 `EvolutionTree.tsx` 里
   `isCurrent` 分支的拆法）。
3. **Tailwind v4 的 hover 位移/缩放用的是独立的 `translate` / `scale` 属性，不是 `transform`。**
   只读 `transform` 的检查脚本会看到 `none`，从而漏掉 hover 反馈。`ui-check.cjs` 因此改成
   直接量「鼠标移上去前后卡片的 `top` 和立绘宽度」。

---

## 怎么验证（量化门禁）

这套门禁有两个用途，同一套工具、两种口径：

1. **功能正确性**：改了功能之后，用户要能做到的事是不是真的做到了。
2. **视觉零回归**：做了「不该改变外观」的改造时，是不是真的一点没变。

第 2 种最初是为「CSS Modules → Tailwind」这种一次性重构建的：风险不是写错，
而是**某个 utility 静默没生效、样式悄悄丢了**。肉眼看截图对 2% 的色差无能为力，
所以做成可量化的门禁，按顺序跑：

| 层 | 工具 | 回答的问题 |
| --- | --- | --- |
| 1 | `npm run tw:audit` | 组件里写的 utility / `@utility`，编译产物里**真的存在**吗 |
| 2 | `npm run typecheck` + `npm run build` | 类型与构建是否通过 |
| 3 | `npm run data:check` + `npm run db:check` | 数据与库本身是否完整（中文名 / 分类 / 蛋群 / 立绘 / 外键 / 语义层已知答案） |
| 4 | `npm run api:check` | 4 个 API 路由的返回**是不是用户要的东西**（72 条：火属性筛选后每只都有火、世代人数 151/100/135、`025` 与 `0025` 都命中 #25、排序结果真的递减…） |
| 5 | `npm run ui:check` | 首页功能是否可用（38 条：属性、9 形态 8 分支、跳转、返回、窄屏无横向滚动、hover 位移 3px / 缩放 1.045×） |
| 6 | `npm run pokedex:check` | 查询页功能是否可用（53 条：搜索、属性筛选、世代+种族值+排序、分页不重叠、详情弹窗与进化树跳转、属性视图、深链还原、移动端） |
| 7 | `npm run style:snap` + `npm run style:diff` | 每个关键元素、每个计算属性的值是否逐项一致 |
| 8 | `npm run px:diff` | 整屏每个像素是否一致（挑不出「没被第 7 层覆盖到」的差异） |

第 7 层的正常做法是：**改造前**用 `node tools/style-snapshot.cjs baseline-before.json` 存一份，
改造后再存 `baseline-after.json`，然后 diff。采样刻意用 `data-testid` 与结构选择器、不用 class 名
（class 名在改造前后会整体换掉，用它选就丧失可比性），属性也不做「等于默认值就丢弃」的过滤
（那会让「某属性被打回默认值」这种最典型的回归正好隐身）。

第 8 层用 `npm run px:diff a.png b.png diff.png 8`，`diff.png` 里红=超阈差异、灰=一致。
Tailwind 改造后的实测结果：**6 张截图全部逐像素一致（最大通道差 0）**，文件大小也与基线逐一相同 ——
即改造后与改造前的渲染结果在任何一层口径上都不存在差异。

> **第 8 层有个前提：只适合「不该有任何视觉变化」的改造。**
> 加图鉴入口那次给首页加了一行引导文字 + 改了导航文案，整屏像素差直接飙到 29.75%，
> 看着像全站崩了。第 7 层给的解释很干净：
> - 卡片、立绘框、属性徽章、字体、颜色、内边距、圆角、阴影的**计算属性零差异**；
> - 唯一的变化是**导航文案宽度**，以及**首页内容整体下移 28.79px**（新增那一行的高度），
>   每个采集点的 `__box[top]` 差值都是同一个 28.79；
> - 28.79 是小数，整页因此做了亚像素重采样 —— 文字和立绘的每个像素桶都变了，
>   但尺寸一个没动。立绘「看起来变糊」就是这个原因，不是图换了。
> - 弹窗那几张的差异来自 `modal-veil` 只有 34% 不透明度、背后被下移的页面透过来；
>   模块自身的计算样式零差异。
>
> 所以判定依据是**第 7 层**，不是第 8 层那个百分比。改动落地后 `shots/01–06` 已按新状态重拍
> （旧基线另存为 `shots/base-*.png` 留作对照），计算样式的新基线存成了 `baseline-current.json`
> （由 `node tools/style-snapshot.cjs baseline-current.json` 生成）。
> 以后再动首页，用新基线比才有意义。
>
> **这一层还有一个必须遵守的前置条件：baseline 与对照必须用同一套采集流程。**
> 中途用一段临时脚本（点法、等待时长都和 `ui-check.cjs` 不同）单独重拍过一批截图，
> 其中 2 张在伊布立绘上稳定多出约 0.3% 的像素差，且同一构建连跑两遍也是稳定复现的，
> 看起来很像真回归。改用 `ui-check.cjs` 自己的流程重拍后，差异**完全消失**。
> 结论：截图对比里，「采集流程不同」造成的假阳性远多于真差异；先用同一脚本拍两侧，
> 再谈阈值。若确实出现了残差，用 `node tools/pixel-shift-map.cjs a.png b.png` 逐瓦片
> 拟合整数位移：能把残差压到接近 0 的，是栅格化取整（非样式回归）；压不下去的才需要修。

> **第 4/6 层还有一个专属的反向验证**：`node tools/api-check.cjs --self-test` 会故意断言一个
> 不可能成立的条件，**要求框架报 FAIL**。框架连明显的错都抓不到，就没有资格说「通过」。
> 这一条是冲着「全绿但没在测东西」去的 —— 事实上它抓出过一个真 bug：分类列（`genus_zh`）
> 整列为空（取值时字段名写错，`genera` 里叫 `genus` 不是 `name`），
> 页面照样渲染，只是「按分类搜索」静默搜不到、卡片副标题退回显示世代。

---

## 数据来源与版权

- 文字资料、属性、种族值、分类、蛋群、进化条件：PokéAPI v2（https://pokeapi.co）
- 立绘：PokeAPI/sprites 的 `official-artwork`（官方 artwork），430 只**画风完全一致**
- 宝可梦相关名称与形象版权归任天堂 / 株式会社宝可梦所有，本项目仅用于学习与演示

---

## 刻意的取舍

- **用 Node 内置的 `node:sqlite`，不用 better-sqlite3**：`better-sqlite3` 要下原生模块、
  在 Windows 上还得有编译工具链，一旦安装被中断就会留下截断的 `.node` 文件（排查成本远高于收益）。
  `node:sqlite` 是 Node 22.5+ 自带的，零依赖、零编译，代价只是 stderr 一行 ExperimentalWarning。
  它有一个和 `better-sqlite3` 不同的默认行为要记住：**外键检查默认开启**，
  自引用外键（皮卡丘 ← 皮丘，编号倒序插入）会当场报错；建库脚本因此显式关掉它，
  最后再用 `PRAGMA foreign_key_check` 整体验一遍。
- **不用 `next/image`**：图片走普通 `<img>` + `loading="lazy"`。立绘是本地静态文件，
  用 `next/image` 只会多一层优化服务和一堆配置。
- **不引入 UI 组件库**：组件总数不到 15 个、样式诉求高度定制（进化树连线、`--tint` 派生），
  引组件库是净负担。样式层用 Tailwind CSS v4，但**只用它的 token 体系与工具类**，
  不引任何插件与预设主题 —— 设计变量仍然只有一处出处。
- **首页保持静态预渲染**：图鉴查询走服务端，但首页没必要陪着一起变动态。
  `next build` 的产物里 `/` 与 `/pokedex` 是 Static，只有 4 个 `/api/*` 是 Dynamic。
- **客户端零数据**：首页要用的形态数据在服务端算好、以 props 传下去，客户端组件不 import 任何数据源。
  查询页则是点开哪只才拉哪只的详情 —— 列表里只带卡片要显示的字段。
  这条是硬约束：一旦客户端组件 import 了 `lib/pokedex.ts` 或 `lib/db.ts`，
  386 只的全量数据（或 `node:sqlite`）就会被打进浏览器包，而且不会报错，只是包悄悄变大。
- **一个功能配一个端到端脚本**：`ui-check` / `pokedex-check` / `api-check` 各管一段，
  断言口径都写成「用户能不能做到」，不写成「函数有没有被调用」。
