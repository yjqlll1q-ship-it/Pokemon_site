/**
 * 检查 Tailwind 编译产物里，组件用到的关键 utility / @utility 是否都真的生成了。
 * 「类名写了但没生成」是这类改造最典型的静默失败，必须显式查。
 *
 * 用法：node tools/tw-audit.cjs <编译产物.css>
 *
 * 注意 CSS 里的类名会被转义（`.hover\:shadow-md:hover`、`.bg-\(--tint\)`、
 * `.grid-cols-\[32px_1fr_32px\]`），所以必须把「两边」都去掉转义反斜杠后再比对。
 * 早期版本只给 needle 去转义，导致所有带变体/任意值的类被误报为缺失。
 *
 * ---------------------------------------------------------------------------
 * 【2026-09-29 修】原来的脚本有一个**自满足**的漏洞：
 * Tailwind v4 靠扫描项目源码来决定生成哪些内置 utility，而这份清单里
 * 「内置 utility 的字符串」本身就写在 tools/tw-audit.cjs 里，会被一起扫到 ——
 * 于是「清单里有 → 一定被生成 → 一定通过」。组件里真把 `tint-bar` 敲成 `tint-barr`，
 * 而清单里留着 `tint-bar`，审计照样全绿。
 *
 * 现在的口径分两类，都要求「编译产物里有」：
 *   A. `@utility` 名字（在 globals.css 里定义）：Tailwind 对自定义 @utility 是
 *      **无条件输出**的，所以只查产物 —— 实际查的是「定义还在不在」。
 *   B. 内置 utility / 带变体与任意值的类：必须**同时**在产物里、且在
 *      components|app|lib 的源码里真的出现。清单自身再也刷不出来。
 * 另外反向体检：产物里有、却没有任何使用点的 @utility（重构留下的死样式）会被列出来。
 */
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(process.argv[2], 'utf8');
const root = path.join(__dirname, '..');

/** globals.css 里定义了哪些 @utility */
const globalsCss = fs.readFileSync(path.join(root, 'app', 'globals.css'), 'utf8');
const defined = new Set([...globalsCss.matchAll(/^@utility\s+([a-z0-9-]+)/gm)].map((m) => m[1]));

/**
 * 组件 / 页面 / lib 的源码。
 * **故意不含 tools/** —— 清单文件本身一旦被扫进来，第 B 类检查就自满足了。
 */
const sources = [];
for (const dir of ['components', 'app', 'lib']) {
  (function walk(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx|ts)$/.test(e.name)) sources.push(fs.readFileSync(p, 'utf8'));
    }
  })(path.join(root, dir));
}
const srcAll = sources.join('\n');

const must = [
  // ---- A. 自定义 @utility（定义必须还在）----
  'type-chip', 'badge-baby', 'tint-total', 'tint-halo', 'tint-halo-strong',
  'tint-rule', 'tint-edge', 'tint-edge-strong', 'tint-node-active',
  'art-plate', 'brand-mark', 'step-arrow', 'child-rail',
  // 外壳与主题色（重构后新增的一组）
  'app-frame', 'app-rail', 'rail-link', 'rail-link-on',
  'panel-card', 'panel-band', 'theme-fill', 'theme-rule', 'tab-btn-on', 'topbar-search',
  /* 右侧信息卡顶部的宣传飘带（斜切角标，参考稿那条红块） */
  'promo-ribbon',
  // 种族值条六色（每行一个色）
  'stat-bar-fill',
  // 简介截断
  'intro-clamp',
  // 形态（forms）：选中态 / 列表滚动区 / 横条与翻页按钮
  'form-chip', 'form-chip-on', 'form-scroll', 'strip-track', 'strip-nav',
  // 对齐参考稿（2026-09-29 第三轮）：卡内小卡 / 图标标题栏 / 顶栏圆形按钮
  'sub-card', 'panel-head', 'panel-icon', 'topbar-icon', 'panel-card-soft',
  // 左侧竖栏底部的装饰斜线（对照稿左下角那三道 ///）
  'rail-slash',
  // 详情页头部的实心属性胶囊（与筛选芯片的 type-chip 分开，见 globals.css）
  'type-chip-solid',

  // ---- B. 内置 utility / 变体 / 任意值（产物里有 + 源码里真的在用）----
  // 直写声明（Tailwind 内置 var() 链在本机 Chrome 上会静默失效，见 globals.css D 节）
  'sprite-shadow', 'art-shadow', 'thumb-shadow', 'num-tabular',
  'rounded-md', 'rounded-lg', 'rounded-sm', 'rounded-full',
  'shadow-sm', 'shadow-md', 'shadow-lg',
  'bg-surface', 'bg-surface-2', 'bg-paper-soft', 'border-line', 'border-line-strong',
  'text-ink', 'text-ink-2', 'text-ink-3',
  'font-mono', 'whitespace-nowrap', 'not-italic', 'no-underline',
  'grid-cols-[repeat(auto-fill,minmax(140px,1fr))]',
  'grid-cols-[repeat(auto-fill,minmax(158px,1fr))]',
  'grid-cols-[repeat(auto-fill,minmax(300px,1fr))]',
  'grid-cols-[repeat(auto-fit,minmax(216px,1fr))]',
  // 详情页的两处列宽：主区 + 右侧信息面板、头部信息 + 立绘
  'grid-cols-[minmax(0,1fr)_460px]',
  'grid-cols-[minmax(0,1fr)_394px]',
  'grid-cols-[minmax(0,1fr)_336px]',
  // 「基本信息」页：左列（简介 + 能力值）+ 右列（形态）
  'grid-cols-[minmax(0,1fr)_280px]',
  // 种族值条：标签 / 条 / 数值
  'grid-cols-[42px_1fr_38px]',
  // 对齐参考稿（2026-09-29 第三轮）新增的尺寸
  'max-w-[1400px]',
  'size-13',
  'size-11',
  'max-h-[300px]',
  'w-[80px]',
  'min-[901px]:rounded-[20px]',
  'min-[901px]:mr-4',
  'min-[901px]:h-[calc(100vh-2rem)]',
  'aspect-[4/5]',
  'grid-cols-[auto_auto_minmax(0,1fr)]',
  'before:tint-halo', "before:content-['']", 'before:inset-[6%_6%_2%]', 'before:rounded-[50%]',
  'hover:tint-edge', 'hover:tint-edge-strong', 'hover:shadow-md', 'hover:-translate-y-[3px]',
  'group-hover:scale-[1.045]', 'active:-translate-y-px',
  'animate-fade', 'animate-rise',
  'max-[640px]:grid-cols-1', 'max-[860px]:grid-cols-1', 'max-[1120px]:grid-cols-1',
  'max-[1240px]:grid-cols-[minmax(0,1fr)_394px]',
  /*
   * `bg-(--tint)` 2026-09-29 起**从清单移除**。
   *
   * 它的唯一消费者是属性分类页那两处 `size-[5px]` / `size-3` 的纯色圆点，
   * 圆点换成属性图标（`TypeGlyph`，stroke="currentColor" + `text-(--tint)`）之后
   * 整个项目里已经没有元素再用它 —— 留着会让审计永远报一条「清单里有但没人用」的假告警。
   *
   * 注意后续别再拿它当「--tint 有没有生效」的探针：`text-(--tint)` 才是。
   */
  // 属性标签的图标色（三处属性标签共用）：
  //   · soft / 相性胶囊 / 筛芯片未选中 —— 图标单独套主属性色（与胶囊文字色不同），
  //     漏了它图标会静默继承文字色 —— 徽章颜色还在，只是属性辨识度悄悄没了。
  'text-(--tint)',
  // 属性筛芯片**选中态**是实心深底，图标必须跟着变白（否则深底上叠深色图标 = 看不见）。
  // 同样是一个漏了不会报错的类：图标还在、断言「有图标」也过，但用户看不见它。
  'text-white',
  /* 属性图标：TypeBadge / TypePill / 类型卡片 / 筛芯片里，图标外面那层 `<i>`
     （inline-flex + shrink-0）。写死尺寸的 svg 不参与 gap，靠这层撑住图标与文字之间的间距。
     注意 `text-white` 是 **已有** 条目（顶栏与实心芯片在用），这里只是把理由补全 ——
     它同时也是「筛芯片选中态图标变白」的保障。 */
  'inline-flex', 'shrink-0',
  'ease-[cubic-bezier(0.22,0.61,0.36,1)]',
];

// 两侧统一去掉转义反斜杠，再压缩空白
const flat = css.replace(/\\/g, '').replace(/\s+/g, ' ');

const missing = [];
const unused = [];
const found = [];

for (const m of must) {
  const needle = m.replace(/\\/g, '');
  const inCss = flat.includes(needle);
  const isUtilityDef = defined.has(needle);
  const inSrc = srcAll.includes(needle);
  if (inCss && (isUtilityDef || inSrc)) found.push(m);
  else if (!inCss && isUtilityDef) missing.push(m + '（@utility 定义已丢失）');
  else if (!inCss) missing.push(m + '（编译产物里没有）');
  else missing.push(m + '（清单里有，但没有任何组件在用）');
}

/* 反向体检：定义了、但源码里没有任何使用点的 @utility（死样式） */
for (const name of defined) {
  if (!srcAll.includes(name)) unused.push(name);
}

console.log('生成: ' + found.length + ' / ' + must.length);
if (missing.length) {
  console.log('\n!! 缺失（写了但没生成）:');
  for (const m of missing) console.log('   - ' + m);
} else {
  console.log('全部命中。');
}
if (unused.length) {
  console.log('\n提示：以下 @utility 没有任何使用点（死样式，建议删除）:');
  for (const u of unused) console.log('   - ' + u);
}
process.exit(missing.length ? 1 : 0);
