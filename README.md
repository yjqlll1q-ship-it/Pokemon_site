# 宝可梦图鉴

一个宝可梦资料站，四个功能：

1. **图鉴首页（= 宝可梦详情主界面）** —— 打开就是一只宝可梦的完整资料：概览 + 4 个分栏
   （基本信息 / 能力值 / 图鉴描述 / 进化链）+ 右侧信息面板 + **叫声按钮**。
   切换宝可梦时**整页主题色跟着这只宝可梦的本体色变**（静态预渲染）。
   带额外形态的（洛托姆 6 个 / 皮卡丘 17 个 / 超级进化 / 地区形态…共 103 只）还会多出
   **形态列表**与**「近年来常见的形态」横条**，点一下就能换形态（见「形态」一节）。
2. **图鉴查询** —— 前三个世代全部 386 只，按属性 / 世代 / 种族值 / 特性 / 蛋群多条件搜索、排序、分页（走本地 SQLite）。
   点结果卡片跳到整页详情（与首页同一份实现）。
3. **自定义网页背景** —— 右下角浮动控件，选一张本地图片当整站背景（可调铺法 / 不透明度 / 模糊 / 淡化）。
   图片**只存在浏览器本地**（IndexedDB），不上传、不进仓库、不进构建产物。
4. **侧栏另四项图鉴**（地区 / 招式 / 道具 / 特性）—— 外壳与路由已就位，内容是占位页。

- 框架：Next.js 16（App Router）+ React 19 + TypeScript
- 样式：**Tailwind CSS v4**（`@theme` 定义设计 token，`@utility` 收口复合样式）+ 一套设计变量
- 数据：构建前一次性从 PokéAPI 固化成 `data/pokedex.json`，再由它灌出 `data/pokedex.db`。
  运行时**不请求任何第三方**，查询全部走本地数据库（叫声音频除外，见「叫声」一节）。

> **关于「零后端」**：这个站原先刻意做成零后端（规划里将来直接静态托管）。做图鉴查询时这个前提被
> 主动放弃了 —— 多条件组合筛选、分页、聚合计数都要在服务端算才合理，把 386 只的数据全塞进浏览器
> 只会让首屏和内存一起变差。现在的形态是折中：**`/` 与 `/pokemon/[id]` 都是静态预渲染**
> （431 条详情路径在构建期生成），只有 4 个 `/api/*` 路由是动态的。

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
| `npm run data` | 按 `BASE_FORMS` 重新抓取数据（增量，已有图片/形态立绘跳过） |
| `npm run data:force` | 同上，但强制重下图片 |
| `npm run data:check` | 数据体检：中文名、属性、分类、蛋群、种族值、立绘、**形态**是否齐全 |
| `npm run db` | 由 `data/pokedex.json` 灌出 `data/pokedex.db`（需先停服务，见下） |
| `npm run db:check` | 数据库体检（60 项）：表结构、外键、语义层已知答案、**宣传语（可 NULL 但不许空串）** |
| `npm run ui:check` | 详情主界面端到端（83 项，需先起服务）：主题色随宝可梦变 / 外壳同色 / 白字对比度 / 侧栏高亮 / 叫声 / **形态** / **宣传飘带** / **属性图标（三处实现一致性）** / 移动端 |
| `npm run pokedex:check` | 图鉴查询页端到端（需先起服务）：搜索 / 筛选 / 排序 / 分页 / 跳整页详情 / 深链还原 / 移动端 |
| `npm run api:check` | 4 个 API 路由的端到端（需先起服务）；加 `--self-test` 可做反向验证 |
| `npm run bg:check` | 背景功能端到端（需先起服务）：坏文件拦截 / 参数生效 / 刷新后仍在 / 移除还原 / 移动端；设 `BG_TEST_IMAGE=<绝对路径>` 用真图再跑一遍 |
| `npm run bundle:check` | 客户端包审计：图鉴描述文本**一条都不许**出现在 `.next/static/**/*.js` 里（含反向验证） |
| `npm run review:shots` | 只出一组「给人看」的评审截图（`shots/r*-*.png`），不做判定 |
| `npm run style:regress` | 非破坏性样式回归：把当前状态快照成 `style-snapshot.json`，与 `baseline-current.json` 比对（**不会覆盖** `baseline-after.json`） |
| `npm run style:baseline` | 把当前状态写进 `baseline-current.json`（**只在该次改动是刻意的时候用**，见下） |

> `ui:check` / `pokedex:check` 都用本机 Chrome/Edge 走 CDP 驱动真实浏览器，断言口径是
> 「用户能不能做到这件事」而不是「代码有没有执行」，同时输出截图到 `shots/`。
> 几个看门狗式的断言：伊布的进化线必须有 9 个节点 / 8 条分支；切到另一只宝可梦后
> **侧栏选中项的实际渲染色也跟着变**（只量容器上的 CSS 变量会漏掉「外壳没换色」）；
> **实心按钮与选中 Tab 的白字对比度 ≥ 4.5**（黄色主题最容易翻车，所以专门在皮卡丘页量一遍）；
> 点火属性后**屏幕上的每一张卡都真的有火属性**
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
  layout.tsx           全站骨架（背景层 + 应用外壳 AppShell；不直接渲染顶栏/页脚）
  page.tsx             首页 = 默认宝可梦的详情主界面（DEFAULT_ID = 479 洛托姆，静态预渲染）
  pokemon/[id]/page.tsx 每一只的详情页：generateStaticParams 生成全部 431 条路径，dynamicParams=false
  pokedex/page.tsx     图鉴查询页外壳（静态），交互全在 PokedexQuery 里
  regions/ moves/ items/ abilities/page.tsx   侧栏另四项图鉴（占位）
  api/pokedex/route.ts         GET 多条件搜索
  api/pokedex/[id]/route.ts    GET 单只详情（含完整进化链）
  api/facets/route.ts          GET 筛选面（各属性/世代计数、种族值区间）
  api/types/route.ts           GET 18 种属性的分类档案（计数 + 相性）
  globals.css          Tailwind 入口 + 全部设计 token（@theme / @utility / @layer base）
components/
  AppShell.tsx         应用外壳：左侧导航 + 主内容区（挂在 layout 上，全站共用；托管侧栏开合状态）
  AppRail.tsx          左侧竖导航（6 项，内联 SVG 图标；桌面是悬浮圆角卡，窄屏折叠成顶部横条）
  AppTopBar.tsx        顶栏：搜索防抖下拉 + 最近浏览 + 折叠侧栏（两颗圆形按钮都是真功能）
  icons.tsx            面板标题用的小图标（内联 SVG，不引图标库）
  typeIcons.tsx        18 个属性图标（内联 SVG）+ TypeGlyph 外壳；三处属性标签共用
  PokemonScreen.tsx    详情主界面：概览 + 4 Tab + 右侧信息面板 + 叫声按钮
  FormList.tsx         「基本信息」右列的形态列表（小卡 + 两行文字，选中态可切换，超出滚动）
  FormStrip.tsx        右面板「近年来常见的形态」横向轮播（上图下文卡 + 左右翻页按钮）
  PanelHeading.tsx     面板内小节标题：默认是主题色小色条，传 icon 时切成圆形图标标题栏
  PromoRibbon.tsx      右侧信息卡顶部的宣传飘带（通栏斜切色带；无文案时整块不渲染）
  CryButton.tsx        叫声按钮（每次点击现建一个 Audio，三态 idle/playing/failed）
  PokedexQuery.tsx     查询页交互主体：筛选状态 + 请求 + 分页（点卡片跳整页详情）
  PokedexResultCard.tsx 查询结果卡片（分类 + 种族值总和）
  TypeGallery.tsx      「按属性」视图：18 张属性卡（计数 + 弱点/抗性/免疫/招式克制）
  EvolutionTree.tsx    进化链渲染（单线横向 / 有分支自动转缩进树；compact 走纵向列表）
  ComingSoon.tsx       占位页（侧栏未完成的四项图鉴共用）
  SiteBackground.tsx   自定义背景：背景层 + 右下角浮动控件（客户端组件）
  TypeBadge.tsx  StatBars.tsx
lib/
  pokedex.ts           静态数据的唯一入口 + 进化线派生计算 + getAllIds()（服务端专用）
  detail.ts            详情页数据装配：id → { pokemon, line, members }（服务端专用）
  db.ts                数据库连接（单例、只读）
  pokedex-query.ts     条件 → SQL、行 → 视图对象（服务端专用）
  api-types.ts         前后端共用的契约类型（**只有类型，没有值**）
  evolution.ts         进化树的纯计算（不 import 任何数据，客户端组件要用）
  forms.ts             形态的类型与视图解析（同样不 import 任何数据；见「形态」一节）
  typeColors.ts        属性 → CSS 变量映射（18 种属性色）
  themeColors.ts       本体色 → 主题色变量映射（10 种，整页换色的唯一入口）
  siteBackground.ts    背景功能：格式/体积/像素校验、IndexedDB 图片存取、设置持久化（**仅客户端**）
  recent.ts            最近浏览（localStorage 读写 + 自定义事件；不 import 任何数据，**仅客户端**）
  site.ts              站名与导航配置（含图标名）
data/
  pokedex.json         生成物：431 只（范围内 386）+ 202 条进化线 + 18 属性 + 246 个形态（约 1.05 MB）
  pokedex.db           生成物：由上面那份 JSON 灌出的 SQLite（约 0.46 MB；**不含形态**，见下）
scripts/
  build-data.mjs       抓 PokéAPI → pokedex.json（带 .cache/pokeapi 磁盘缓存；立绘三源回退）
  build-db.mjs         pokedex.json → pokedex.db（写 .tmp 再改名，先自检）
  check-data.mjs       数据体检
  check-db.mjs         数据库体检（58 项）
public/sprites/        431 张官方立绘（约 55 MB，本地托管）
public/sprites/forms/  形态立绘 492 张 = 246 个形态 × 2（官方大图 33 MB + 96px 缩略图 1.5 MB）
tools/
  launch.ps1           启动器本体：定位 Node → 清端口 → 按需构建 → 前台起服务（prod / dev / stop）
  cdp-lib.cjs          最小 CDP 客户端（本机 Chrome/Edge，零依赖）
  ui-check.cjs         详情主界面端到端 + 截图（62 项，含主题色 / 对比度 / 形态 / 侧栏跳动）
  pokedex-check.cjs    查询页端到端 + 截图（52 项）
  api-check.cjs        API 端到端（72 项，含 --self-test 反向验证）
  bg-check.cjs         背景功能端到端 + 截图（49 项，带真图 53 项）
  bundle-check.cjs     客户端包审计：图鉴描述不许泄漏到浏览器 JS（含反向验证）
  review-shots.cjs     只出评审截图，不做判定（`npm run review:shots`）
  tw-compile.cjs       只编译 Tailwind 一层
  tw-audit.cjs         审计「写了但没生成」的 utility（当前 97 项全命中）
  style-snapshot.cjs   采集关键元素的计算样式 → JSON
  style-diff.cjs       比对两份快照，输出报告 + 退出码
  pixel-diff.cjs       两张截图的像素级比对（含差异包围盒 + 行带直方图）
  pixel-shift-map.cjs  pixel-diff 报差异时，判断「是纯 1px 平移（栅格化取整）还是真改了样式」
shots/                 端到端脚本产出的截图
```

> **数据分三层，别串线**：
> `scripts/build-data.mjs`（抓取）→ `data/pokedex.json` ⇄ `lib/pokedex.ts` + `lib/detail.ts`（详情页静态读）；
> `scripts/build-db.mjs` → `data/pokedex.db` ⇄ `lib/db.ts` + `lib/pokedex-query.ts`（查询走这里）。
> **组件一律不许直接 import JSON，也不许 import `lib/db.ts` / `lib/pokedex-query.ts`** ——
> 后者会把 `node:sqlite` 拖进客户端包。客户端只认 `lib/api-types.ts` 里的类型。
>
> 注意：`/api/pokedex/[id]` 读的是**数据库**（`rowToPokemon`），详情页读的是 **JSON**。
> 给详情加字段时两边都要动，漏一边就会出现「页面有、接口没有」（或反过来）。
>
> **唯一的已知例外是 `forms`**：数据库里没有形态表（形态对列表页的筛选/排序毫无用处），
> 所以 `rowToPokemon` 固定返回 `forms: []`。今天没有影响 —— 详情页走的是 JSON 那条路，形态是齐的。
> 但**如果以后要把 `/api/pokedex/[id]` 接到详情页，必须先把形态灌进数据库**，
> 否则皮卡丘（17 个形态）、洛托姆（6 个）这类页面会**静默地少掉整块形态 UI**，不报任何错。

> **设计变量只有一处出处**：`app/globals.css` 的 `@theme`。改配色 / 圆角 / 阴影 / 字体只动那里，全站生效。
> 组件里不再有任何 `.css` 文件，也不再 import CSS —— 样式全部以 utility 形式写在 JSX 上。

---

## 怎么加一只新宝可梦

**只改一处数据，前端一行代码都不用动**：

```js
// scripts/build-data.mjs
const BASE_FORMS = [1, 4, 7, 43, 60, 133, 172, 236, 265, 280 /* ← 加图鉴编号 */];
// 不在「整条进化链能不能走通」范围内的单只（例如首页默认展示的洛托姆 #479）
const EXTRA_IDS = [479];
```

```bash
npm run data && npm run data:check && npm run db && npm run db:check
```

脚本会自动把**整条进化链**（含所有分支和进化条件）拉下来、下载对应立绘、写进 JSON 与 SQLite。
新增的编号会：
- 自动出现在查询页（查询是 SQL 直查，没有写死的清单）；
- 自动获得 `/pokemon/<id>` 静态页（`generateStaticParams` 读 `getAllIds()`）；
- 自动获得主题色（`colorKey` 落在那 10 种官方本体色里就生效，未知值回退红色）；
- **自动带上形态**：新编号只要在 PokéAPI 里有 `varieties`，就会被抓下来（含形态立绘与缩略图），
  前端一行不用动；中文形态标签查 `FORM_LABEL_ZH`，查不到显示英文原文而不是报错。

若加了脚本里没处理过的进化条件类型（`evolution_details` 里的新 trigger），在 `conditionText()` 里补一条分支即可，其它保持原样兜底。

## 怎么加新功能

1. **新页面**：在 `app/` 下加目录，导航项加到 `lib/site.ts` 的 `SITE.nav`（含 `icon`，图标画在 `AppRail.tsx` 的 `ICONS` 里）。
   整个页面会自带应用外壳（左侧导航 + 深蓝底纹），不用自己搭。
2. **新静态数据**：只动 `scripts/build-data.mjs` 的输出结构 + `lib/pokedex.ts` 的类型与读取函数。
3. **新可筛选字段**：`build-data.mjs` 抓字段 → `build-db.mjs` 建列/建表 → `check-db.mjs` 加断言 →
   `lib/pokedex-query.ts` 的 `buildWhere` 加条件 + `api-types.ts` 加契约字段 → 前端加控件。
   五处缺一处就会「界面有控件但筛不出来」，所以 `api:check` 里每个新条件都要配一条断言。
4. **改详情版式**：只改 `components/PokemonScreen.tsx` 一处 —— 详情只有这一份实现，
   首页（`/`）与 `/pokemon/[id]` 共用，查询页点卡片也跳到它。
5. **换配色**：只改 `app/globals.css` 里的 `@theme`；文件末尾预留了暗色主题的覆盖写法。
   改「整页主题色」只改 `:root` 里的 `--poke-*`（10 色 × 4 档）。

---

## 整页主题色（切宝可梦 → 整站换色）

**数据来源**：PokéAPI 的 `species.color`（`colorKey`，10 种：red / blue / yellow / green /
black / brown / purple / gray / pink / white），构建期写进 `data/pokedex.json`。

**为什么用「本体色」而不是「属性色」**：参考图里洛托姆整页是红色，而它属性是电(黄)+幽灵(紫) ——
说明取的是这只宝可梦的本体色。属性色（`lib/typeColors.ts`，18 种）另有用途：属性标签、种族值条。

**四档变量**（`lib/themeColors.ts` → `pokeThemeStyle()`）：

| 变量 | 用途 |
| --- | --- |
| `--poke` | 装饰色块、外壳斜切底纹（**不做文字底**） |
| `--poke-hi` | 渐变亮端、悬停 |
| `--poke-deep` | **实心按钮 / 选中态的底**、斜切收尾 |
| `--poke-soft` | 浅底块 |

**两个必须遵守的点**：

1. **注入位置有两处，缺一不可**。详情容器上挂一份（后代消费），同时用 `applyPokeTheme()`
   写到 `<html>` 上 —— 左侧导航与外壳底纹是详情容器的**祖先**，CSS 变量只向下继承，
   只挂容器会导致「面板全紫、侧栏还是红的」。离开详情页要 `resetPokeTheme()` 还原。
   `ui-check` 里量的是**侧栏选中项的实际渲染色**与根元素 `--poke`，不看类名，所以这条不会被绕过。
2. **实心色块上的字用 deep 档**。主色是高饱和的中间调（见「配色方案」），白字压上去普遍不达标
   （实测 13px 白字对比度：电 1.66 / 冰 1.55 / 虫 1.98 / 地面 2.02 / 草 2.05，
   要 ≥4.5 才过 AA）。deep 档全部 ≥5.03（18 个 `--type-*-deep` 最低 5.03，
   10 个 `--poke-*-deep` 最低 5.06，逐项验算过）。
   `ui-check` 直接量 WCAG 对比度，并把最容易翻车的**黄色页**作为断言点。
   **注意提饱和会让原本达标的主色变不达标**：电属性主色从 `#F2C40D` 那档调到 S90% 后
   白字对比度反而更低，deep 档必须跟着重算 —— 这一版就是这么加上 `--type-*-deep` 这一组的
   （原来文件里根本没有它，全靠 `color-mix()` 现场掺深）。

## 主题色之外的第四档：为什么 `black / gray / white` 的 deep 是灰阶

`--poke-black / gray / white` 的 deep 档**刻意不用各自色相压深，而是三个无彩度灰阶**：
`#26262C < #3F434A < #6A6F77`（按亮度递增，两两对比度 ≥1.5）。

原因：按色相压深会让它们**互相靠拢甚至变色** —— `black` 压深落到 `#404059`（变蓝紫）、
`white` 落到 `#5C6F8A`（变蓝），两者亮度比只有 1.01，选中态与未选中态完全分不出来。
灰阶还能保证「深色底上的白字」对比度稳定（black 15.04 / gray 9.94 / white 5.06）。

## 叫声

`cryUrl` 由 `scripts/build-data.mjs` 写进数据契约（取 `pokemon.cries.latest`，缺则按编号拼
PokeAPI/cries 仓库的 raw 地址），运行时由 `CryButton` **直接引 CDN 播放，不下载、不进构建产物**。

- 代价：离线或该 CDN 不可达时播不出声 —— 按钮会进 `failed` 态并给出文字提示，不会静默失败、不会卡住。
- 因此前端**没有任何音频文件**，仓库与构建体积不受影响。
- `ui-check` 的判据是「点了之后按钮进入 playing / failed / idle 之一」，即「不会卡在中间态」。

---

## 形态（forms）

**数据来源**：PokéAPI 的 `pokemon-species.varieties`。构建期写进 `data/pokedex.json` 的
`pokemon[id].forms`（**没有额外形态时是空数组，不是 null**，首位一定是基本形态）。

覆盖面是数据自动决定的，不是人工挑的：431 只里 **103 只有额外形态、共 246 个**——
超级进化 47、阿罗拉 18、伽勒尔 15、超极巨化 12、洗翠 7、洛托姆的家电形态 5、
代欧奇希斯 4、飘浮泡泡 3、皮卡丘 17（换装 + 帽子 + 超极巨）、帕底亚肯泰罗 3 种……

**中文名是自己拼的**：PokéAPI 的 `/pokemon-form/{slug}` 只有 fr/de/en 三种语言名，
**没有中文**，所以 `build-data.mjs` 里维护了一张 `FORM_LABEL_ZH`（后缀 → 完整形态标签）。
显示格式是 `种族名（形态标签）`，如「洛托姆（加热形态）」。表里没命中的后缀**退回英文原文**、
不抛错，所以以后扩世代不用先补表也能跑；`data:check` 里有一条断言专门卡「形态名里得真有汉字」，
退回英文时立刻报出来。

**UI 有两块，都只在 `forms.length > 1` 时渲染**：
| 位置 | 组件 | 说明 |
| --- | --- | --- |
| 「基本信息」Tab 右列 | `FormList` | 固定高度 + 细滚动条（洛托姆 6 / 皮卡丘 17，自适应高度会把主面板撑长） |
| 右侧信息面板 | `FormStrip` | 「近年来常见的形态」横向轮播 + 左右翻页按钮 |

点形态**只改本地 state**：标题带形态标签、属性 badge、种族值、身高体重、立绘全部跟着换；
**不换 URL、不重新请求**。外壳主题色仍按 `species.colorKey`（物种级），只有属性色 `--tint` 跟着形态走。

**两个刻意的技术决定**：
1. **缩略图用 96px 像素图，不用官方立绘**（`forms[].thumb` vs `forms[].sprite`）。
   官方立绘单张约 130 KB，形态列表一屏露 4 张、皮卡丘有 17 张 —— 用小图这一页少下 2 MB。
   `ui-check` 有一条断言直接卡「缩略图路径必须是 `-thumb.png`」。
2. **立绘下载有三源回退**：`raw.githubusercontent.com` → `cdn.jsdelivr.net` → `gcore.jsdelivr.net`
   （同一份仓库的镜像）。GitHub 的 raw 域名在国内网络下经常被直接重置（ECONNRESET），
   只配一个源会让 `npm run data` 直接失败。判断下载是否成功只看 **PNG 文件头**，
   不看体积 —— 96px 的 #50 地鼠只有 439 字节，用「大于 N 字节」去卡会把正常图误杀。

**代价（明确写出来）**：形态立绘给仓库加了 **246×2 = 492 个文件、32.3 MB**（`data:check` 实测口径）。
这是「把形态做全」的直接成本；如果哪天只想留基本形态，把 `buildForms()` 的返回值改成 `[]`
并删掉 `public/sprites/forms/` 即可，前端一行都不用改（空数组 = 不渲染）。

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

## 配色方案（不是自己拍的，是查出来再定饱和度的）

参考来源：

1. 官方 Pokémon 品牌色：黄 `#FFCB05` / 蓝 `#3D7DCA` / 深蓝 `#003A70`
   —— brandpalettes.com/pokemon-color-codes
2. 精灵球红 `#EE1515`（schemecolor.com/pokemon-colors）
3. 属性色：Bulbapedia《Help:Color templates》中朱紫世代官方属性色（如草 `#3FA129`、水 `#2980EF`）
4. 本体色：《List of Pokémon by color》的游戏内图鉴调色板

**落地原则：色相严格锁官方值，饱和度分两组。**

**2026-09-29 第四轮：口径从「统一降饱和」改成「高饱和」。**

上一版把 18 个属性色与 10 个本体色**一律**压到 S 30%~45%（莫兰迪风），代价是
属性辨识度被抹掉了 —— 参考稿里的属性标签是「一眼能分出是哪个属性」的鲜明色块。

这一版改成两组处理，**不是把所有色都硬拔到高饱和**：

| 组 | 判据 | 处理 | 结果 |
| --- | --- | --- | --- |
| 彩度组 | 官方 S ≥ 60% | 抬到 **S 82%~90%**，色相与明度锁官方原值 | 火 / 水 / 电 / 草 / 冰 / 格斗 / 毒 / 地面 / 飞行 / 超能力 / 虫 / 龙 / 妖精 13 个 |
| 低彩度组 | 官方 S < 60% | **保留官方原值**（21%~68%），不拔 | 一般 / 岩石 / 幽灵 / 恶 / 钢 5 个 |

为什么不能「一律 70%~90%」：`一般` 官方 `#A8A77A` 是灰绿（S 21%），硬拔到 85% 变成
`#E4E125` 的亮黄绿；`钢` `#B7B7CE` 拔完是 `#4949DF` 的纯蓝；`恶` `#705746` 拔完变橙棕。
**色相保真优先于饱和度数值** —— 那 5 个属性看起来"不够鲜艳"是正确结果，不是漏改。
（这三个反例就是当时算出来的实际值，不是估计。）

一并对齐的两个连带动过的地方：
`--stat-*` 六色原为「单独一组未降饱和值」（S 45%~71%），属性色提饱和后会出现
**层次倒挂**（能力值条比属性标签更灰），同步提到 S 76%~80%；
品牌四色（深蓝 / 蓝 / 黄 / 红）也从降饱和值改回接近官方原色。

| 用途 | 变量 | 值 | 来源 |
| --- | --- | --- | --- |
| 页面底色 | `--color-paper` | `#F1F4FA` | 冷调纸白（原 `#F6F4EF` 暖米） |
| 卡片 | `--color-surface` | `#FFFFFF` | 纯白（原 `#FFFDF9` 暖白） |
| 次级面 | `--color-surface-2` | `#F4F6FB` | 卡内小卡 / 右侧信息面板 |
| 正文 | `--color-ink` | `#25313D` | `#003A70` 去饱和 |
| 品牌深蓝 | `--color-navy` | `#0B3E65` | `#003A70` S80% |
| 品牌蓝 | `--blue` | `#2A85DF` | `#3D7DCA` S74% |
| 品牌黄 | `--yellow` | `#F3C716` | `#FFCB05` S90% |
| 精灵球红 | `--red` | `#ED1912` | `#EE1515` S86% |
| 属性色 | `--type-*` | 18 项 + 18 项 `-deep` | Bulbapedia 官方属性色，按上表分两组 |
| 本体色（整页主题） | `--poke-*` | 10 色 × 4 档 | 游戏内图鉴调色板，同样分两组 |
| 外壳底色 | `--navy` 及其派生 | — | 参考图的深蓝外壳，斜切色块用 `--poke` 实时合成 |

属性 badge 的底色/字色/描边都由单个 `--tint` 用 `color-mix()` 派生，所以新增属性只需要加一行变量。
主题色同理：`--poke` 四档 + `color-mix()` 派生描边 / 浅底 / 阴影。
**落地位置**：所有 token 都在 `app/globals.css` 的 `@theme { … }` 里；18 个 `--type-*`、
18 个 `--type-*-deep` 与 10×4 个 `--poke-*` 放在普通 `:root`
（它们只被内联的 `--tint` / `--poke` 消费，不按名字出现在任何规则里，放进 `@theme` 会被 Tailwind 的
「未使用主题变量不输出」优化裁掉，那样属性色与主题色会静默失效）。

**属性图标**：18 个属性各有内联 SVG（`components/typeIcons.tsx`，纯几何、`stroke="currentColor"`、不引图标库），
形状定义在 `TYPE_ICONS`（`Record<PokemonTypeName, ReactNode>`，漏一个 typecheck 就报错），
外壳是 `TypeGlyph`。加属性只需在 `:root` 加一行变量 + 在 `TYPE_ICONS` 加一个图标。
**三处属性标签都复用它**：详情页胶囊（`TypeBadge`，solid 档白图标 / soft 档主色图标）、
属性分类页（`TypeGallery`：卡片头 16px、相性胶囊 11px）、图鉴筛选芯片（`PokedexQuery`，
选中态实心深底 → 图标跟着变白）。这三处是**独立实现**，只验其中一处另外两处退化成圆点也照样全绿
（`ui:check` 的 `[5e]` 段就是为此而设）。

**主题色的四档是有对比度要求的**（详见「整页主题色」一节）：`--poke` 只用来上色块，
任何**压白字的实心底**都必须用 `--poke-deep`。
18 个 `--type-*-deep` 与 10 个 `--poke-*-deep` 的白字对比度**逐项验算过**，
最低分别是 5.03 与 5.06（AA 要求 4.5），全部达标 —— 改这些值时必须重算，不能凭感觉调深一档。

---

## 样式体系（Tailwind v4）

约定只有三条：

| 情况 | 写法 |
| --- | --- |
| 普通样式 | 直接写 utility 到 `className`，不出 `.css` 文件 |
| 设计变量（颜色/圆角/阴影/字体/动画） | `app/globals.css` 的 `@theme`，按 Tailwind 命名空间命名（`--color-*` → `bg-*`/`text-*`/`border-*`，`--radius-*` → `rounded-*`，…） |
| 复合样式（自绘图形伪元素、`--tint` / `--poke` 派生配方、必须 sRGB 插值的渐变） | `app/globals.css` 的 `@utility`，名字语义化（`type-chip` / `tint-node-active` / `brand-mark` / `app-frame` / `panel-card` …） |

外壳与主题色相关的复合样式集中在 `app/globals.css` 的「3c. 图鉴应用外壳」一节：
`app-frame`（深蓝底 + 两道斜切色块，纯 CSS 画）、`app-rail` / `rail-link` / `rail-link-on`、
`app-topbar` / `topbar-search`、`panel-card`（白卡）、`panel-band`（面板顶部斜切装饰）、
`theme-fill`（主题色实心按钮）、`theme-rule` / `tab-btn-on`、
形态相关的 `form-chip` / `form-chip-on` / `form-scroll` / `strip-track` / `strip-nav`。
它们全部只消费 `--poke` / `--tint` 系列变量，所以「换一套配色」= 改 `:root` 里的 `--poke-*`，
组件一行不用动。

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
4. **依赖 `var(--tint)` / `var(--poke)` 的 `@utility`，变量必须真的在这一元素的祖先链上被注入。**
   变量为空时 `color-mix(in srgb, var(--tint) 45%, …)` 这条声明在计算值阶段被判非法，
   于是**静默**退回「前一个值 / 初始值 / none」——不报错、不警告。
   实测到的两个症状：`.tint-rule` 的色条落成 `currentColor` 的灰、`.tint-halo-strong` 的
   `backgroundImage` 直接是 `none`。详情页因此把 `--poke*` 与 `--tint` **一起**注在
   `[data-testid="pokemon-screen"]` 这一层上（见 `PokemonScreen.tsx` 的 `style`）。
   新增依赖这两个变量的 `@utility` 时，顺手在 `ui-check` 里加一条读计算值的断言。

---

## 自定义网页背景

右下角常驻一个控制按钮，点开可以选一张本地图片当整站背景。限制不是自己拍的，是对着别家同类功能定的：

| 项 | 取值 | 依据 |
| --- | --- | --- |
| 体积上限 | **5 MB** | 爱数系统图片配置、Zaveit 自定义页都是 5 MB；SiteSwan / Cloudflare Images 放到 10 MB。取严的一档 |
| 接受格式 | jpg / jpeg / png / webp / gif / avif / bmp，`accept` 与校验层同源 | 上述几家的合集；**不收 SVG**（能内嵌脚本，当背景也没有任何优点） |
| 像素上限 | 单边 ≤ 12000px | 对齐 Cloudflare Images，防止手机原图把内存打爆 |
| 建议宽度 | ≥ 1920px，不足只提示不拦 | 铺满会发虚，但那是用户的取舍 |
| 落地形态 | 原文件存 IndexedDB，设置存 localStorage | 纯客户端：不上传、不进仓库、不进 `.next` 产物。换浏览器/换机器就是没有背景 |
| 默认值 | 铺法 `cover` / 不透明度 100% / 模糊 0 / 淡化 52% | 淡化是压在图上的一层**纸色**（`--color-paper`），不是深色遮罩 —— 本站深字浅底，压暗底只会让正文更糊；深色遮罩是「白字压暗底」站点的惯例，套过来是反的 |

三个已经用断言钉住的坑：

1. **层必须真的能被看见**：背景层是 `fixed inset-0 -z-10`。`body` 有不透明纸色底，
   一旦层被画到纸色之下，DOM 断言照样全绿、屏幕上一片空白。所以判据落在**像素**上：
   开关 ON / OFF 两张截图跑 `pixel-diff`，实测 **54.80%** 像素变化（阈值 50%）——
   若层被盖住，这个数只会等于右下角那个小按钮的面积（≈0.001%）。**这一对是正向对照，
   「通过」的含义是差异足够大，与零回归的判定方向相反。**
2. **坏文件不能顶掉上一张好图**：拒绝路径一律不写状态。测试里每拒绝一种坏文件
   （超 5 MB / SVG / 伪装成 png 的文本 / 单边超 12000px），就复查一次现有背景还在。
   另有一个坑是测试侧的：手写 PRNG 生成的「超大图」会被 deflate 压到几十 KB，
   于是「超限应被拒绝」的用例静默失效 —— 改用 `crypto.randomBytes` 真随机像素才压不动。
3. **滑块的测试写法**：React 给受控 input 挂了 value 拦截器，`el.value = '40'` 会被记成
   「值没变」、`onChange` 不触发，症状看起来像「产品参数没生效」。必须走原生 setter + 派发
   `input`/`change`（`bg-check.cjs` 里的 `SET_VAL`）。

一个**不是 bug** 的观感问题值得记一笔：铺上照片后，卡片那一带会读成一大块白板。
实测卡片带平均亮度只变 4.7，而左右留白区变 70.8 —— 因为卡片本身是不透明暖白、缝隙又窄，
照片只在缝隙和留白处透出来。这是既有卡片设计在照片背景下的表现，不是背景层的问题。

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
| 1 | `npm run tw:audit` | 组件里写的 utility / `@utility`，编译产物里**真的存在**吗（101 条） |
| 2 | `npm run typecheck` + `npm run build` | 类型与构建是否通过 |
| 3 | `npm run data:check` + `npm run db:check` | 数据与库本身是否完整（中文名 / 分类 / 蛋群 / 立绘 / **形态** / 外键 / 语义层已知答案 / **宣传语列**） |
| 4 | `npm run api:check` | 4 个 API 路由的返回**是不是用户要的东西**（72 条：火属性筛选后每只都有火、世代人数 151/100/135、`025` 与 `0025` 都命中 #25、排序结果真的递减…） |
| 5 | `npm run ui:check` | 详情主界面是否可用（83 条：首页就是详情、侧栏 6 项与高亮、**主题色随宝可梦变且外壳也换**、**实心色块上的白字对比度 ≥4.5**、进化节点跳转、Tab、叫声按钮、**形态切换真的换数据且缩略图走小图**、**宣传飘带（登记过才出现 / 白字 5.64）**、**属性图标（18 个属性的图形源码级互不相同 / 三处属性标签逐处验）**、**侧栏真的是悬浮卡且折叠/展开可用**、**最近浏览真的记下了刚看的那只**、移动端 390×844 无横向溢出） |
| 6 | `npm run pokedex:check` | 查询页功能是否可用（52 条：搜索、属性筛选、世代+种族值+排序、分页不重叠、点卡片跳整页详情、属性视图、深链还原、移动端） |
| 6b | `npm run bg:check` | 背景功能是否可用（49 条，带真图 53 条：坏文件被挡且不顶掉好图、参数真的落到计算值、刷新后仍在、移除后干净还原、浮动控件不挡分页、移动端不溢出） |
| 6c | `npm run bundle:check` | 客户端包**有没有把服务端数据漏出去**（428 条图鉴描述做探针，扫 `.next/static/**/*.js`；另配反向验证） |
| 7 | `npm run style:regress` | 每个关键元素、每个计算属性的值是否逐项一致（非破坏性，见下） |
| 8 | `npm run px:diff` | 整屏每个像素是否一致（挑不出「没被第 7 层覆盖到」的差异） |

第 7 层的正常做法是：**改造前**用 `node tools/style-snapshot.cjs baseline-before.json` 存一份，
改造后再存 `baseline-after.json`，然后 diff。采样刻意用 `data-testid` 与结构选择器、不用 class 名
（class 名在改造前后会整体换掉，用它选就丧失可比性），属性也不做「等于默认值就丢弃」的过滤
（那会让「某属性被打回默认值」这种最典型的回归正好隐身）。

> **日常回归不要用 `npm run style:snap`。** 它按设计就是把当前状态覆盖写入 `baseline-after.json`，
> 那是「CSS Modules → Tailwind」这一对 before/after 的专用产物。用 `npm run style:regress`：
> 当前状态存进 `style-snapshot.json`，再和 `baseline-current.json` 比，两份历史基线都不动。
> （这条是踩出来的 —— 用 style:snap 做了一次日常检查，把重构完成时的 `baseline-after.json`
> 和 `style-diff-report.md` 覆盖掉了，靠 F 盘迁移前留下的旧副本才还原回去。）

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
>
> **第三个前置条件：截图前必须等图片真的解码完。**
> `tools/review-shots.cjs` 的 `settleImages()` 每次截图前轮询 `[...document.images]`，
> 直到没有 `!complete || naturalWidth === 0` 的图（最多 40 × 150ms），`shot` 与 `shotFull` 都先过它。
> 不等的后果实测过：首页那张图在两次连拍之间会差 **123 个像素**，`pixel-diff` 定位到的包围盒是
> x1356–1396 / y100–131 —— 正好是右面板顶部那个 48px 小立绘，它当时还挂着 `loading="lazy"`。
> 去掉 lazy + 加 `settleImages` 后，首页**连续三轮截图逐字节一致**（md5 相同）。
> 同一构建连拍三轮后仍有微小抖动的是两张：耿鬼页 16 像素 / 最大通道差 7、
> 图鉴页 24 像素 / 最大通道差 1，两者**超出容差(8)的像素均为 0**，量级 0.002% 以下，
> 属抗锯齿取整噪声，不是布局或内容差异 —— 用零容差跑能看到差异包围盒是一条 4×30 的竖边
> 与一片稀疏噪点，没有任何成块变化。

> **第 4/6 层还有一个专属的反向验证**：`node tools/api-check.cjs --self-test` 会故意断言一个
> 不可能成立的条件，**要求框架报 FAIL**。框架连明显的错都抓不到，就没有资格说「通过」。
> 这一条是冲着「全绿但没在测东西」去的 —— 事实上它抓出过一个真 bug：分类列（`genus_zh`）
> 整列为空（取值时字段名写错，`genera` 里叫 `genus` 不是 `name`），
> 页面照样渲染，只是「按分类搜索」静默搜不到、卡片副标题退回显示世代。

> **2026-09-29 加形态时的反向验证记录**（注入缺陷 → 确认断言真的 FAIL → 还原，共两轮）：
>
> | 注入的缺陷 | 抓住它的断言 |
> | --- | --- |
> | 形态缩略图改用 130KB 官方立绘（`f.thumb` → `f.sprite`） | ✗ 形态缩略图走 96px 小图（不是 130KB 官方立绘）`[大图 6 张 / 共 6]` |
> | 形态卡去掉选中态样式（`form-chip-on` 换成 `form-chip`） | ✗ 选中的形态与其它形态描边可区分 `[rgb(229,224,213) ≠ rgb(229,224,213)]` |
> | 主标题不用形态视图（`view.nameZh` → `pokemon.nameZh`） | ✗ 点形态后标题带上形态标签 `[洛托姆]` |
> | 去掉 `pickedSlug` 的跨物种校验 | **没抓住 —— 这条缺陷根本触发不了。** 实测 Next 在路由参数变化时会重建页面组件，state 本来就归零。所以那几条「跨物种跳转后选中项回到基本形态」是**端到端行为**断言，不是那段防御代码的回归测试。代码留着做保险（注释已如实标注），断言也留着，但不假装它能证明校验生效。 |
>
> 这一轮还顺手查出并修掉一个**静默**缺陷：`--tint`（属性色）从来没注入到详情页根节点上，
> 于是 `.tint-rule`（简介左侧色条）落到 `currentColor` 的灰、`.tint-halo-strong`（立绘光晕）
> 直接是 `backgroundImage: none` —— 两个都「看起来像设计如此」。现在 `ui-check` 有三条断言盯着：
> `--tint` 非空、立绘光晕不是 `none`、以及**简介色条跟着主属性走**（洛托姆电 ≠ 妙蛙种子草）。

> **改动确实会动布局时，第 7 层的读法**：加形态那轮 `style:regress` 报了 10 条差异，
> 每一条都能对上账、且都不是「样式写丢了」：
> - `branch.*` 的 `top` 统一 +245px —— 伊布有「搭档形态」，右侧面板多出一整块「近年来常见的形态」；
> - `__doc` 高度 860 → 897（右侧信息块多了「名字 + 编号 + 小立绘」标题行），
>   因此页面开始出现纵向滚动条，`clientWidth` 1280 → 1265（正好是滚动条宽度）；
> - `mobile` 高度 1459 → 1992 —— 移动端首页（洛托姆）多出形态列表 + 形态横条两块。
>
> **`shell` / `lotom` / `bulba` 三个组的 78 个采集点是零差异的**，也就是说这次改动
> 在各元素的计算样式上没有任何附带损伤。确认无误后归档旧基线为 `baseline-before-forms.json`，
> 再跑 `npm run style:baseline` 刷新 `baseline-current.json`（并新增了 `forms` 组 13 个采集点）。

---

## 数据来源与版权

- 文字资料、属性、种族值、分类、蛋群、进化条件、**形态**：PokéAPI v2（https://pokeapi.co）
- 立绘：PokeAPI/sprites 的 `official-artwork`（官方 artwork），431 只**画风完全一致**
- 形态缩略图：同一仓库的 96px 像素图；形态中文名由本项目自己的 `FORM_LABEL_ZH` 映射
  （PokéAPI 的 `pokemon-form` 没有中文名）
- 立绘下载走三源回退（GitHub raw → jsDelivr ×2），国内网络下 raw 域名经常被重置
- 叫声：PokeAPI/cries 的 `latest/*.ogg`（运行时光标引 CDN，不下载）
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
- **不引入 UI 组件库**：组件总数 12 个、样式诉求高度定制（进化树连线、`--tint` / `--poke` 派生），
  引组件库是净负担。样式层用 Tailwind CSS v4，但**只用它的 token 体系与工具类**，
  不引任何插件与预设主题 —— 设计变量仍然只有一处出处。
- **详情只保留一套实现**：首页（`/`）就是默认那只的详情，`/pokemon/[id]` 是同一份
  `PokemonScreen`，查询页点卡片也跳过去。原先查询页另有一个 Modal + 内嵌详情，
  两套版式意味着改一次要改两处，已经删掉。
- **静态页保持静态**：图鉴查询走服务端，但详情页没必要陪着一起变动态。
  `next build` 的产物里 `/`、`/pokemon/[id]`（431 条）与 `/pokedex` 都是 Static，
  只有 4 个 `/api/*` 是 Dynamic。
- **客户端零数据**：详情页要用的形态数据在服务端算好、以 props 传下去，客户端组件不 import 任何数据源。
  查询页也只走 `/api/*`，列表里只带卡片要显示的字段。
  这条是硬约束：一旦客户端组件 import 了 `lib/pokedex.ts` 或 `lib/db.ts`，
  431 只的全量数据（或 `node:sqlite`）就会被打进浏览器包，而且不会报错，只是包悄悄变大。
- **一个功能配一个端到端脚本**：`ui-check` / `pokedex-check` / `api-check` 各管一段，
  断言口径都写成「用户能不能做到」，不写成「函数有没有被调用」。
- **形态做全，但缩略图用小图**：103 只 / 246 个形态的官方立绘（+32.3 MB）都下了，
  因为「形态」在这类站里是正经内容而不是装饰；但列表与横条一律用 96px 像素图，
  否则光皮卡丘一页就要多下 2 MB。取舍点写在「形态」一节。
- **对齐对照稿（2026-09-29 第三轮，逐区）**：对照稿是 ChatGPT 生成的设计图，数值与部分内容
  是编的（核对过程见「形态」一节），但**版式**是真需求。本轮逐区跟做了：
  - 左侧竖导航 → **带外边距的悬浮圆角卡片**（`ml-4` / `rounded-[20px]` / `h-[calc(100vh-2rem)]` + 投影）；
  - 顶栏右侧两颗圆形按钮 → 做成**真功能**：时钟 = 最近浏览（`lib/recent.ts`，localStorage），
    汉堡 = 折叠左侧导航（状态托管在 `AppShell`，持久化，刷新后保持）；
  - 详情头部立绘 → 从 228px 方框放大到 **336px × `aspect-[4/5]`**，底板改成深蓝 + 主题色斜切；
  - 头部属性徽章 → **实心胶囊 + 白字**（`type-chip-solid`，与图鉴页筛选芯片的 `type-chip` 分开 ——
    筛选芯片一旦实心就分不出「选没选」）；
  - 卡内分层 → 简介 / 能力值各自包一层 `sub-card`；
  - 右侧信息面板 → 全部换 `panel-card-soft`（浅蓝底，比主面板低半档），标题栏改成
    `panel-head`（圆形图标 + 标题 + 下分隔线）；
  - 形态项 → 小卡 + 52px 缩略图 + 两行文字（种族名 / 形态标签）；
  - 「面」这一组从暖米改成冷调蓝白（见「配色方案」）。

  第二轮细节（YJ 在截图上圈出的 4 处）：
  - logo 精灵球 26→30px，描边改 `#101f36`、红色向官方 `#EE1515` 靠一档 ——
    原来描边用的是 `--color-navy`，而侧栏底色就是深蓝，整个球融进背景只剩一坨暗红；
  - 顶栏两颗圆形按钮 → **白底 + 深蓝图标**（原来深底半透明 + 白图标，在深蓝上只剩两个白点）；
  - 「近年来常见的形态」→ 卡片 104→80px、缩略图 52→44、右列 420→460px，**一屏正好 4 张**
    （460 是反推出来的：460 − 40(内边距) − 52(两个按钮) − 16(gap) = 352，减 3 个卡片间距 30 = 322，
    ÷4 ≈ 80.5 → 卡片取 80。此前卡片 104 + 面板 420 只能露 3 张，第 2 张起两行文字被挤掉一行）；
  - 侧栏底部 → 加 `POKÉMON / ALWAYS WITH YOU` + 三道斜线（`rail-slash`，
    用 CSS 斜条纹画，不占图片资源）。
- **仍不跟着做的三处**（照抄会得到错的、或点了没反应的东西）：
  - 对照稿右上角的**设置齿轮**没加 —— 站点没有「设置」这个功能，加了就是死按钮。
    （同一位置的**汉堡与时钟做了**，因为它们有真功能。）
  - 对照稿把洛托姆的各种**形态**画成横向箭头式「进化链」—— 语义是错的（洛托姆不进化）。
    站里保留纵向的**真**进化链，形态另用横条表达。

  **第四轮（2026-09-29，YJ 提的三个差异）**：
  - **全局配色提饱和** —— 18 个属性色 + 10 个本体色从「统一压低」改成「锁官方色相、分两组定饱和度」，
    并新增 18 个 `--type-*-deep`。详见「配色方案」。
  - **属性标签加图标** —— 18 个属性各有内联 SVG（`components/typeIcons.tsx`），
    三处属性标签（详情页胶囊 / 属性分类页 / 图鉴筛选芯片）全部复用。详见「配色方案」末段。
  - **右侧信息卡加宣传飘带** —— 卡片顶部通栏斜切色带（`components/PromoRibbon.tsx` +
    `@utility promo-ribbon`，`clip-path` 斜角收尾，与 `panel-band` 同一手法）。
    数据层是**登记制**：`Pokemon.taglineZh?: string`（可选），
    在 `scripts/build-data.mjs` 的 `TAGLINE_ZH` 里按 id 登记；**没登记的宝可梦整块不渲染**
    （不报错、不留白、不占位 —— 这是正常状态而不是缺数据）。
    数据库那一列刻意允许 `NULL` 而非 `NOT NULL DEFAULT ''`：**空串是 truthy**，
    前端 `{taglineZh && <PromoRibbon/>}` 会把空串渲染成一条空白红条。
    `db:check` 有两条断言卡这件事（列可以为 NULL，但不允许是空串；非空行数 = 1）。
    下面那行「名称 + 编号 + 小立绘」**原样保留**（飘带是压在 header 之前的独立一条，
    不是替换 header）。
    这一条**推翻了第三轮「slogan 没有抄」的决定** —— 当时顾虑「凭空写一句就是第二份要人工维护的内容」，
    登记制把这个成本降到了「一行数据」，代价是绝大多数宝可梦没有飘带，这是可接受的。
