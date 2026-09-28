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

/** 首页的采集点 */
const HOME = [
  ['body', 'body'],
  ['header', 'header'],
  ['headerInner', 'header > div'],
  ['brandMark', 'header > div > a > span:first-child'],
  ['brandMark::after', 'header > div > a > span:first-child', '::after'],
  ['brandName', 'header > div > a > span:nth-child(2) > strong'],
  ['brandTagline', 'header > div > a > span:nth-child(2) > em'],
  ['navLink', 'header nav a'],
  ['main', 'main'],
  ['pageTitle', 'main h1'],
  ['pageLead', 'main p'],
  ['grid', '[data-testid="grid"]'],
  ['cardLi', '[data-testid="grid"] > li'],
  ['card', '[data-testid="pokemon-card"]'],
  ['cardDex', '[data-testid="pokemon-card"] > span:nth-child(1)'],
  ['cardStage', '[data-testid="pokemon-card"] > span:nth-child(2)'],
  ['cardStageGlow::before', '[data-testid="pokemon-card"] > span:nth-child(2)', '::before'],
  ['cardSprite', '[data-testid="pokemon-card"] > span:nth-child(2) img'],
  ['cardName', '[data-testid="pokemon-card"] > span:nth-child(3)'],
  ['cardTypes', '[data-testid="pokemon-card"] > span:nth-child(4)'],
  ['cardBadge', '[data-testid="pokemon-card"] [data-testid="type-badge"]'],
  ['cardBadgeDot', '[data-testid="pokemon-card"] [data-testid="type-badge"] > i'],
  ['cardFooter', '[data-testid="pokemon-card"] > span:nth-child(5)'],
  ['footer', 'footer'],
  ['footerInner', 'footer > div'],
  ['footerP', 'footer > div > p'],
];

/** 弹窗（妙蛙种子，单线进化）的采集点 */
const DETAIL = [
  ['backdrop', 'div:has(> [role="dialog"])'],
  ['panel', '[role="dialog"]'],
  ['detail', '[data-testid="detail"]'],
  ['bar', '[data-testid="detail"] > header'],
  ['closeBtn', '[data-testid="close"]'],
  ['hero', '[data-testid="detail"] > div:nth-child(2)'],
  ['artWrap', '[data-testid="detail"] > div:nth-child(2) > div:nth-child(1)'],
  ['artGlow', '[data-testid="detail"] > div:nth-child(2) > div:nth-child(1) > div'],
  ['art', '[data-testid="detail"] > div:nth-child(2) > div:nth-child(1) > img'],
  ['info', '[data-testid="detail"] > div:nth-child(2) > div:nth-child(2)'],
  ['dex', '[data-testid="detail"] > div:nth-child(2) > div:nth-child(2) > p:nth-child(1)'],
  ['title', '#pokemon-detail-title'],
  ['sub', '[data-testid="detail"] > div:nth-child(2) > div:nth-child(2) > p:nth-child(3)'],
  ['genus', '[data-testid="detail"] > div:nth-child(2) > div:nth-child(2) > p:nth-child(3) > span:nth-child(2)'],
  ['detailBadge', '[data-testid="detail"] [data-testid="type-badge"]'],
  ['facts', '[data-testid="detail"] dl'],
  ['factsRow', '[data-testid="detail"] dl > div'],
  ['factsDt', '[data-testid="detail"] dl > div > dt'],
  ['factsDd', '[data-testid="detail"] dl > div > dd'],
  ['flavor', '[data-testid="detail"] dl + p'],
  ['statWrap', 'div:has(> [data-testid="stat-total"])'],
  ['statRow', 'div:has(> [data-testid="stat-total"]) li:nth-child(1)'],
  ['statTrack', 'div:has(> [data-testid="stat-total"]) li:nth-child(1) > span:nth-child(2)'],
  ['statFill', 'div:has(> [data-testid="stat-total"]) li:nth-child(1) > span:nth-child(2) > span'],
  ['statValue', 'div:has(> [data-testid="stat-total"]) li:nth-child(1) > span:nth-child(3)'],
  ['statTotal', '[data-testid="stat-total"]'],
  ['statTotalStrong', '[data-testid="stat-total"] > strong'],
  ['evoSection', '[data-testid="evolution"]'],
  ['evoTitle', '[data-testid="evolution"] > h3'],
  ['evoNote', '[data-testid="evolution"] > h3 > span'],
  ['linear', '[data-testid="evolution"] ol'],
  ['linearItem', '[data-testid="evolution"] ol > li'],
  ['evoStep', '[data-testid="evolution"] ol > li:nth-child(2) > span'],
  ['evoStepText', '[data-testid="evolution"] ol > li:nth-child(2) > span > span:first-child'],
  ['evoStepArrow', '[data-testid="evolution"] ol > li:nth-child(2) > span > span:nth-child(2)'],
  ['evoStepArrow::after', '[data-testid="evolution"] ol > li:nth-child(2) > span > span:nth-child(2)', '::after'],
  ['evoNode', '[data-testid="evo-node"]'],
  ['evoNodeCurrent', '[data-testid="evo-node"][aria-current="true"]'],
  ['evoThumb', '[data-testid="evo-node"] > img'],
  ['evoNodeInfo', '[data-testid="evo-node"] > span'],
  ['evoNodeDex', '[data-testid="evo-node"] > span > span:first-child'],
  ['evoNodeName', '[data-testid="evo-node"] > span > span:nth-child(2)'],
  ['evoHint', '[data-testid="evolution"] p'],
];

/** 伊布弹窗里分支树的采集点 */
const BRANCH = [
  ['evoSection', '[data-testid="evolution"]'],
  ['wrap', '[data-testid="evolution"] > div'],
  ['branchNode', '[data-testid="evolution"] > div > div'],
  ['childrenUl', '[data-testid="evolution"] ul'],
  ['childItem', '[data-testid="evolution"] ul > li'],
  ['childItem::before', '[data-testid="evolution"] ul > li', '::before'],
  ['cond', '[data-testid="evolution"] ul > li > span'],
  ['hint', '[data-testid="evolution"] > div > p'],
];

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

  snap.__doc = await b.ev(`({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyFont: getComputedStyle(document.body).fontFamily,
    bodySize: getComputedStyle(document.body).fontSize,
    bodyLineHeight: getComputedStyle(document.body).lineHeight,
  })`);

  snap.home = await b.ev(SNAP_FN(HOME));

  // 卡片 hover 态：真的把鼠标移上去，再读计算样式（比 forcePseudoState 更接近真实）
  const cardBox = await b.ev(`(()=>{const e=document.querySelector('[data-testid="pokemon-card"]');
    e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  await sleep(400);
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cardBox.x, y: cardBox.y, buttons: 0 });
  await sleep(800);
  snap.cardHover = await b.ev(`(()=>{
    const c=document.querySelector('[data-testid="pokemon-card"]');
    const s=c.querySelector('span:nth-child(2) img');
    const g=(e,p)=>getComputedStyle(e)[p];
    return {borderColor:g(c,'borderTopColor'),boxShadow:g(c,'boxShadow'),transform:g(c,'transform'),
            spriteTransform:g(s,'transform')};
  })()`);
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 3, y: 3, buttons: 0 });
  await b.ev('window.scrollTo(0,0)');
  await sleep(400);

  // 妙蛙种子弹窗（单线进化）
  await b.click('[data-testid="pokemon-card"][data-pokemon-id="1"]');
  snap.detail = await b.ev(SNAP_FN(DETAIL));
  await b.pressKey('Escape', 'Escape', 27);
  await sleep(300);

  // 伊布弹窗（8 分支，走 childrenWide 两列布局）
  await b.click('[data-testid="pokemon-card"][data-pokemon-id="133"]');
  snap.branch = await b.ev(SNAP_FN(BRANCH));
  snap.branchConds = await b.ev(
    `[...document.querySelectorAll('[data-testid="evo-condition"]')].map(e=>e.textContent.trim())`,
  );
  await b.pressKey('Escape', 'Escape', 27);
  await sleep(300);

  // 移动端
  await b.setViewport(390, 844);
  snap.mobile = await b.ev(`({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    gridCols: getComputedStyle(document.querySelector('[data-testid="grid"]')).gridTemplateColumns,
    gridGap: getComputedStyle(document.querySelector('[data-testid="grid"]')).gap,
    cardW: Math.round(document.querySelector('[data-testid="pokemon-card"]').getBoundingClientRect().width*100)/100,
    mainPad: getComputedStyle(document.querySelector('main')).padding,
    mainTitleSize: getComputedStyle(document.querySelector('main h1')).fontSize,
    headerPad: getComputedStyle(document.querySelector('header > div')).padding,
    taglineDisplay: getComputedStyle(document.querySelector('header > div > a > span:nth-child(2) > em')).display,
    footerPad: getComputedStyle(document.querySelector('footer > div')).padding,
  })`);
  await b.click('[data-testid="pokemon-card"][data-pokemon-id="133"]');
  snap.mobileDialog = await b.ev(`(()=>{
    const bd=document.querySelector('div:has(> [role="dialog"])');
    const p=document.querySelector('[role="dialog"]');
    const d=document.querySelector('[data-testid="detail"]');
    const hero=d.children[1];
    const g=(e,p)=>getComputedStyle(e)[p];
    return {backdropPad:g(bd,'padding'),backdropAlign:g(bd,'alignItems'),
            panelW:Math.round(p.getBoundingClientRect().width*100)/100,
            panelMaxH:g(p,'maxHeight'),panelRadius:g(p,'borderRadius'),
            detailPad:g(d,'padding'),heroCols:g(hero,'gridTemplateColumns'),
            artWrapMaxW:g(hero.children[0],'maxWidth')};
  })()`);

  const errs = b.consoleErrors.filter((e) => !/favicon|404/.test(e));
  snap.__consoleErrors = errs;
  b.close();

  fs.writeFileSync(OUT, JSON.stringify(snap, null, 1), 'utf8');
  console.log('written: ' + OUT);
  console.log('console errors: ' + errs.length);
  console.log('home targets: ' + Object.keys(snap.home || {}).length);
  console.log('detail targets: ' + Object.keys(snap.detail || {}).length);
}

main().catch((e) => {
  console.error('snapshot failed:', e);
  process.exit(2);
});
