/**
 * tools/style-snapshot.cjs
 * ---------------------------------------------------------------------------
 * 把关键元素的计算样式 dump 成 JSON，用来做「重构前后零视觉回归」的量化对照。
 *
 * 为什么需要它：肉眼看截图，两个色值差 2% 是看不出来的；而 CSS Modules →
 * Tailwind 这类改造，风险恰恰在「某个 utility 静默没生效、样式悄悄丢了」。
 * 把 getComputedStyle 的真实结果落成文件做 diff，才叫证据。
 *
 * 用法：node tools/style-snapshot.cjs <输出文件.json>
 * 前置：先把服务起起来（npm start / npm run dev）
 *
 * 两个刻意的设计：
 *  1. 选择器一律用结构（nth-child）和 data-testid，不用 class 名 ——
 *     class 名在改造前后会整体换掉，用 class 选就丧失了可比性。
 *  2. 属性不做任何过滤，原样全采 —— 一旦过滤掉「等于默认值」的项，
 *     「某个属性被打回默认值」这种最典型的回归反而看不见了。降噪放到 diff 里做。
 */
const fs = require('fs');
const path = require('path');
const { launch, sleep } = require('./cdp-lib.cjs');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000/';
const PORT = 9317;
const OUT = process.argv[2] || path.join(__dirname, '..', 'style-snapshot.json');

/** 要采集的计算属性 */
const PROPS = [
  'display', 'position', 'boxSizing',
  'width', 'height', 'aspectRatio',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'gap', 'rowGap', 'columnGap', 'gridTemplateColumns', 'gridAutoFlow',
  'flexDirection', 'flexWrap', 'flexGrow', 'flexShrink', 'flexBasis',
  'alignItems', 'justifyContent', 'textAlign',
  'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
  'fontVariantNumeric', 'whiteSpace', 'textDecorationLine',
  'color', 'backgroundColor', 'backgroundImage',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderTopStyle', 'borderTopColor', 'borderLeftColor', 'borderRadius',
  'boxShadow', 'opacity', 'zIndex', 'overflowX', 'overflowY',
  'filter', 'backdropFilter', 'transform', 'objectFit',
  'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'inset', 'top', 'right', 'bottom', 'left', 'content', 'visibility',
];

/** 顶部栏 + 左侧竖导航（外壳在每一页都在，采一次即可） */
const SHELL = [
  ['main', '[data-testid="app-main"]'],
  ['rail', '[data-testid="app-rail"]'],
  ['railBrand', '[data-testid="app-rail"] > a'],
  ['railBrandMark', '[data-testid="app-rail"] > a > span:first-child'],
  ['railBrandMark::after', '[data-testid="app-rail"] > a > span:first-child', '::after'],
  ['railNav', '[data-testid="app-rail"] nav'],
  ['railLink', '[data-testid="app-rail"] nav a'],
  ['railLinkOn', '[data-testid="app-rail"] nav a[aria-current="page"]'],
  ['topbar', '[data-testid="app-topbar"]'],
  ['searchInput', '[data-testid="global-search"]'],
];

/** 详情主界面（首页 = #479 洛托姆；无进化线） */
const DETAIL = [
  ['screen', '[data-testid="pokemon-screen"]'],
  ['main', '[data-testid="detail-main"]'],
  ['hero', '[data-testid="detail-main"] > div:nth-child(1)'],
  ['band', '[data-testid="detail-main"] > div:nth-child(1) > span'],
  ['dexBadge', '[data-testid="dex-badge"]'],
  ['title', '[data-testid="pokemon-screen"] h1'],
  ['nameSub', '[data-testid="name-sub"]'],
  ['typeRow', '[data-testid="type-row"]'],
  ['typeBadge', '[data-testid="type-row"] [data-testid="type-badge"]'],
  /* 属性图标的外层容器（2026-09-29 由「圆点」改成「图标」）。
     采它的 color 而不是尺寸 —— 图标是 stroke="currentColor" 的 SVG，
     颜色变化全在 color 上（solid 档继承胶囊的白、soft 档是 --tint 主色）。
     名字仍叫 typeBadgeDot 会让下一个人以为还是圆点，故改名为 typeBadgeIcon。 */
  ['typeBadgeIcon', '[data-testid="type-row"] [data-testid="type-badge"] > i'],
  ['typeBadgeSvg', '[data-testid="type-row"] [data-testid="type-badge"] svg'],
  ['genus', '[data-testid="genus"]'],
  ['facts', '[data-testid="facts"]'],
  ['factsRow', '[data-testid="facts"] > div'],
  ['factsDt', '[data-testid="facts"] > div > dt'],
  ['factsDd', '[data-testid="facts"] > div > dd'],
  ['artPlate', '[data-testid="art-plate"]'],
  ['art', '[data-testid="art-plate"] img'],
  ['cryBtn', '[data-testid="cry-button"]'],
  ['tabbar', '[data-testid="tabbar"]'],
  ['tabBtn', '[data-testid="tabbar"] > button'],
  ['tabBtnOn', '[data-testid="tab-basic"]'],
  ['panel', '[data-testid="detail-panel"]'],
  ['sideIntro', '[data-testid="side-intro"]'],
  ['sideIntroH', '[data-testid="side-intro"] > h3'],
  ['sideAbility', '[data-testid="side-ability"]'],
  ['statBar', '[data-testid="stat-bar"]'],
  ['statTrack', '[data-testid="stat-bar"] > span:nth-child(2)'],
  ['statFill', '[data-testid="stat-bar"] > span:nth-child(2) > span'],
  ['statValue', '[data-testid="stat-bar"] > span:nth-child(3)'],
  ['statTotal', '[data-testid="stat-total"]'],
  ['statTotalStrong', '[data-testid="stat-total"] > strong'],
];

/** 详情页右侧面板里的紧凑进化链（伊布：#133，8 条分支 → 纵向列表） */
const BRANCH = [
  ['sideEvo', '[data-testid="side-evo"]'],
  ['list', '[data-testid="side-evo"] ol'],
  ['item', '[data-testid="side-evo"] ol > li'],
  ['cond', '[data-testid="side-evo"] ol > li > span'],
  ['node', '[data-testid="evo-node"]'],
  ['nodeThumb', '[data-testid="evo-node"] img'],
];

/**
 * 形态（forms）：首页洛托姆有 6 个形态，是形态 UI 唯一稳定的采集对象。
 * 选中态与未选中态都要采 —— 两者的描边色/底色不同，只采一个的话
 * 「选中态样式丢了」查不出来。
 *
 * ⚠️ 未选中态必须用 `:not([data-form-on])` 限定：`[data-form-slug]` 的**第一个**
 * 匹配就是选中项，直接用它当「未选中」会采到同一个元素，两份快照看起来都正常
 * 但实际漏测（这个坑已经踩过一次）。
 */
const NO_ON = ':not([data-form-on])';
const FORMS = [
  ['section', '[data-testid="form-list"]'],
  ['list', '[data-testid="form-list"] ul'],
  ['itemOff', `[data-testid="form-list"] [data-form-slug]${NO_ON}`],
  ['itemOn', '[data-testid="form-list"] [data-form-on]'],
  ['itemThumb', '[data-testid="form-list"] [data-form-slug] img'],
  ['itemLabel', '[data-testid="form-list"] [data-form-slug] > span'],
  ['strip', '[data-testid="side-forms"]'],
  ['stripTrack', '[data-testid="form-strip"]'],
  ['stripItemOff', `[data-testid="form-strip"] [data-form-slug]${NO_ON}`],
  ['stripItemOn', '[data-testid="form-strip"] [data-form-on]'],
  ['stripNav', '[data-testid="side-forms"] button'],
  ['head', '[data-testid="side-intro"] > div'],
  ['headName', '[data-testid="side-head-name"]'],
];

/** 伊布「进化链」Tab 里的宽树（分支多 → 两列 grid） */
const EVOWIDE = [
  ['section', '[data-testid="evolution"]'],
  ['list', '[data-testid="evolution"] ul'],
  ['item', '[data-testid="evolution"] ul > li'],
  ['item::before', '[data-testid="evolution"] ul > li', '::before'],
  ['cond', '[data-testid="evo-condition"]'],
  ['node', '[data-testid="evolution"] [data-testid="evo-node"]'],
  ['nodeThumb', '[data-testid="evolution"] [data-testid="evo-node"] img'],
  ['hint', '[data-testid="evolution"] > div > p'],
];

/**
 * 地区图鉴总览（/regions）。
 *
 * 计数那个 span 没有 data-testid，走结构选（第 3 个子块的第 2 个 span）。
 * 这里刻意**不采卡片编号**：编号是数据，不是样式（data:check 管那件事）。
 */
const REGIONS = [
  ['title', '[data-testid="regions-title"]'],
  ['list', '[data-testid="region-list"]'],
  ['card', '[data-testid="region-card"]'],
  ['cardTitle', '[data-testid="region-card"] h2'],
  ['cardRange', '[data-testid="region-card"] > div:nth-child(1) > span:last-child'],
  ['cardBlurb', '[data-testid="region-card"] > p:nth-child(2)'],
  ['cardThumb', '[data-testid="region-card"] img'],
  ['cardCount', '[data-testid="region-card"] > div:nth-child(3) > span:last-child'],
  ['cardFoot', '[data-testid="region-card"] > p:last-child'],
];

/**
 * 地区详情（/regions/4 神奥）。
 *
 * 第 3 张卡是 #389 土台龟（草/地面，双属性）—— 单属性卡看不出属性胶囊换行/间距，
 * 所以双属性那张必须单独采一次。地区页是新页面，这里不采就等于没门禁。
 */
const REGION_DETAIL = [
  ['title', '[data-testid="region-title"]'],
  ['count', '[data-testid="region-count"]'],
  ['list', '[data-testid="region-pokemon-list"]'],
  ['card', '[data-testid="region-pokemon-card"]'],
  ['cardImg', '[data-testid="region-pokemon-card"] img'],
  ['cardFoot', '[data-testid="region-pokemon-card"] [data-testid="card-foot"]'],
  ['cardFootStrong', '[data-testid="region-pokemon-card"] [data-testid="card-foot"] b'],
  ['badge', '[data-testid="region-pokemon-card"] [data-testid="type-badge"]'],
  ['card2', '[data-testid="region-pokemon-list"] > li:nth-child(3) [data-testid="region-pokemon-card"]'],
  ['badge2', '[data-testid="region-pokemon-list"] > li:nth-child(3) [data-testid="type-badge"]'],
];



/**
 * 主题色 / 属性色的落地检查。
 *
 * `--tint` 曾经**没有**注入到详情页根节点上，于是所有依赖它的 @utility 都静默退化
 * （简介左侧色条落到 currentColor 的灰）。这一处的计算值单独采出来，
 * 才可能在下一次被改回去时立刻看见。
 *
 * 注：原来还采了 `[data-testid="art-plate"] > div` 的 backgroundImage（立绘光晕）。
 * 2026-10-05 立绘底板按参考稿改成素板、不再吃 --tint，那层光晕已删除，
 * 采集点一并移除 —— 留着会变成 `{__missing}` 之后被当成「已跳过」，看不出问题。
 */
const TINT_PROBE = `(() => {
  const screen = document.querySelector('[data-testid="pokemon-screen"]');
  const intro = document.querySelector('[data-testid="detail-panel"] p');
  return {
    tint: screen ? getComputedStyle(screen).getPropertyValue('--tint').trim() : null,
    introRule: intro ? getComputedStyle(intro).borderLeftColor : null,
  };
})()`;

const SNAP_FN = (targets) => `(() => {
  const PROPS = ${JSON.stringify(PROPS)};
  const out = {};
  for (const [name, sel, pseudo] of ${JSON.stringify(targets)}) {
    const el = document.querySelector(sel);
    if (!el) { out[name] = { __missing: sel }; continue; }
    const cs = getComputedStyle(el, pseudo || undefined);
    const rec = {};
    for (const p of PROPS) rec[p] = cs[p];
    const r = el.getBoundingClientRect();
    rec.__box = [Math.round(r.left * 100) / 100, Math.round(r.top * 100) / 100, Math.round(r.width * 100) / 100, Math.round(r.height * 100) / 100];
    out[name] = rec;
  }
  return out;
})()`;

async function main() {
  const b = await launch({ port: PORT, url: BASE, windowSize: '1440,960' });
  await b.setViewport(1280, 860);

  const snap = {};

  const goto = async (p) => {
    await b.ev(`location.href=${JSON.stringify(p)}`);
    await sleep(1600);
  };

  snap.__doc = await b.ev(`({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyFont: getComputedStyle(document.body).fontFamily,
    bodySize: getComputedStyle(document.body).fontSize,
    bodyLineHeight: getComputedStyle(document.body).lineHeight,
  })`);

  /* ---- 1. 首页 = 默认那只（#479 洛托姆）的详情 + 外壳 ---- */
  await goto('/');
  snap.shell = await b.ev(SNAP_FN(SHELL));
  snap.lotom = await b.ev(SNAP_FN(DETAIL));
  snap.forms = await b.ev(SNAP_FN(FORMS));
  // 主题色是「随宝可梦变」的，必须单独采下来，否则整页换色回归查不出来
  snap.lotom.__theme = await b.ev(`(()=>{const cs=getComputedStyle(document.documentElement);
    return {poke:cs.getPropertyValue('--poke').trim(),deep:cs.getPropertyValue('--poke-deep').trim()};})()`);
  snap.lotom.__tint = await b.ev(TINT_PROBE);

  /* ---- 2. 妙蛙种子（有单线进化链，进 Tab 看进化树） ---- */
  await goto('/pokemon/1');
  snap.bulba = await b.ev(SNAP_FN(DETAIL));
  snap.bulba.__theme = await b.ev(`(()=>{const cs=getComputedStyle(document.documentElement);
    return {poke:cs.getPropertyValue('--poke').trim(),deep:cs.getPropertyValue('--poke-deep').trim()};})()`);
  snap.bulba.__tint = await b.ev(TINT_PROBE);
  // 妙蛙种子**没有**额外形态：这两处必须是 null，否则说明形态块被无条件渲染了
  snap.noForms = await b.ev(`({
    formList: !!document.querySelector('[data-testid="form-list"]'),
    strip: !!document.querySelector('[data-testid="side-forms"]'),
  })`);

  await b.click('[data-testid="tab-evo"]');
  await sleep(700);
  snap.evoTab = await b.ev(`(()=>{
    const sec=document.querySelector('[data-testid="evolution"]');
    const g=(e,p)=>getComputedStyle(e)[p];
    const r=sec.getBoundingClientRect();
    return {sectionPad:g(sec,'padding'),
            stepArrowW:g(sec.querySelector('[data-testid="evo-node"]'),'width'),
            nodeRadius:g(sec.querySelector('[data-testid="evo-node"]'),'borderRadius'),
            firstNodeBox:[Math.round(r.left*100)/100,Math.round(r.top*100)/100,
                          Math.round(r.width*100)/100,Math.round(r.height*100)/100]};
  })()`);

  /* ---- 3. 伊布（8 条分支）：右侧紧凑链 + Tab 里的宽树 ---- */
  await goto('/pokemon/133');
  snap.branch = await b.ev(SNAP_FN(BRANCH));
  await b.click('[data-testid="tab-evo"]');
  await sleep(800);
  snap.evoWide = await b.ev(SNAP_FN(EVOWIDE));
  snap.branchConds = await b.ev(
    `[...document.querySelectorAll('[data-testid="evo-condition"]')].map(e=>e.textContent.trim())`,
  );

  /* ---- 4. 顶栏搜索下拉 ---- */
  await goto('/');
  await b.ev(`(()=>{const i=document.querySelector('[data-testid="global-search"]');
    i.focus();
    const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    set.call(i,'皮卡丘');i.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
  await sleep(1400);
  snap.search = await b.ev(`(()=>{
    const box=document.querySelector('[data-testid="search-results"]');
    const g=(e,p)=>getComputedStyle(e)[p];
    const r=box.getBoundingClientRect();
    const item=box.querySelector('[data-testid="search-item"]');
    return {panelPad:g(box,'padding'),panelRadius:g(box,'borderRadius'),
            panelShadow:g(box,'boxShadow'),
            panelBox:[Math.round(r.left*100)/100,Math.round(r.top*100)/100,
                      Math.round(r.width*100)/100,Math.round(r.height*100)/100],
            itemCount:box.querySelectorAll('[data-testid="search-item"]').length,
            itemPad:item?g(item,'padding'):null,
            firstName:item?item.textContent.trim():null};
  })()`);

  /* ---- 5. 地区图鉴（总览 + 详情） ---- */
  await goto('/regions');
  snap.regions = await b.ev(SNAP_FN(REGIONS));
  // 地区卡里的代表宝可梦必须走 96px 缩略图；采 naturalWidth 才能发现「又换成大头像了」
  snap.regions.__thumbProbe = await b.ev(
    `[...document.querySelectorAll('[data-testid="region-card"] img')].map(i=>({w:i.naturalWidth,h:i.naturalHeight}))`,
  );

  await goto('/regions/4');
  snap.regionDetail = await b.ev(SNAP_FN(REGION_DETAIL));
  snap.regionDetail.__count = await b.ev(
    `document.querySelector('[data-testid="region-pokemon-list"]').children.length`,
  );

  /* ---- 6. 移动端 390×844 ---- */
  await b.setViewport(390, 844);
  await goto('/');
  snap.mobile = await b.ev(`(()=>{
    const g=(s,p)=>getComputedStyle(document.querySelector(s))[p];
    const w=(s)=>Math.round(document.querySelector(s).getBoundingClientRect().width*100)/100;
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      railDir: g('[data-testid="app-rail"]','flexDirection'),
      railOverflowX: g('[data-testid="app-rail"]','overflowX'),
      railLinkCount: document.querySelectorAll('[data-testid="app-rail"] nav a').length,
      topbarPad: g('[data-testid="app-topbar"]','padding'),
      searchW: w('[data-testid="global-search"]'),
      screenCols: g('[data-testid="pokemon-screen"]','gridTemplateColumns'),
      mainPad: g('[data-testid="detail-main"]','padding'),
      artPlateW: w('[data-testid="art-plate"]'),
      titleSize: g('[data-testid="pokemon-screen"] h1','fontSize'),
      tabBtnW: w('[data-testid="tabbar"] > button'),
    };
  })()`);

  const errs = b.consoleErrors.filter((e) => !/favicon|404/.test(e));
  snap.__consoleErrors = errs;
  b.close();

  fs.writeFileSync(OUT, JSON.stringify(snap, null, 1), 'utf8');

  /* ---- 自检：采集点一个都不许落空 ----
     选择器写错时 SNAP_FN 会记成 { __missing }，然后两份快照「都缺」比较出来零差异 ——
     全绿但其实什么都没测。所以这里主动把落空的采集点报出来。 */
  const groups = {
    shell: snap.shell,
    lotom: snap.lotom,
    bulba: snap.bulba,
    forms: snap.forms,
    branch: snap.branch,
    evoWide: snap.evoWide,
  };
  const missing = [];
  for (const [g, obj] of Object.entries(groups)) {
    for (const [k, v] of Object.entries(obj || {})) {
      if (k.startsWith('__')) continue;
      if (v && v.__missing) missing.push(`${g}.${k} → ${v.__missing}`);
    }
  }

  console.log('written: ' + OUT);
  console.log('console errors: ' + errs.length);
  // 段名从快照动态枚举，不要写死 —— 写死的清单会随快照增段而失真，
  // 让人误以为「只采了这几段」（style-diff.cjs 就曾因写死段名长期空转）。
  const covered = Object.entries(snap)
    .filter(([k]) => k !== '__consoleErrors')
    .map(([k, v]) => k + '=' + (Array.isArray(v) ? '[len ' + v.length + ']' : Object.keys(v).length));
  // 元素采集点计数必须与 style-diff.cjs 的 countTargets 同口径（isElementRecord），
  // 否则两个脚本会打印互相矛盾的数字。
  const isElementRecord = (v) =>
    !!v && typeof v === 'object' && !Array.isArray(v) && ('__box' in v || 'display' in v);
  const totalPoints = Object.entries(snap)
    .filter(([k]) => k !== '__consoleErrors')
    .reduce((n, [, v]) => n + Object.values(v || {}).filter(isElementRecord).length, 0);
  console.log('targets: ' + covered.join(' '));
  console.log('覆盖: ' + covered.length + ' 段 / ' + totalPoints + ' 个元素采集点');
  if (missing.length) {
    console.log('\n!! 落空的采集点（选择器已失效，快照会假绿）:');
    for (const m of missing) console.log('   - ' + m);
    process.exit(3);
  }
  console.log('采集点全部命中。');
}

main().catch((e) => {
  console.error('snapshot failed:', e);
  process.exit(2);
});
