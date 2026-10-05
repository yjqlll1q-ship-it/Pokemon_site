/**
 * tools/ui-check.cjs
 * ---------------------------------------------------------------------------
 * 在真实浏览器里验证本站的核心功能（**重构后的「详情主界面」版**）。
 *
 * 跑之前先起服务：npm start（或 npm run dev）
 * 然后：node tools/ui-check.cjs
 *
 * 断言口径对准用户目的，而不是对准实现：
 *   ✓ 首页打开就是一只宝可梦的完整资料（属性 / 种族值 / 特性 / 立绘）
 *   ✓ 侧栏 6 项导航，当前页有高亮
 *   ✓ 切换宝可梦 → 整页主题色**真的**变了（比较 --poke 的计算值，不看类名）
 *   ✓ 有声叫按钮，且点了不会卡住
 *   ✓ 点进化链上的形态能切过去（URL 与标题同时变）
 *   ✓ 图鉴查询页能出结果
 *   ✓ 窄屏不出现横向滚动条
 */
const path = require('path');
const fs = require('fs');
const { launch, sleep } = require('./cdp-lib.cjs');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const SHOTS = path.join(__dirname, '..', 'shots');
const PORT = 9311;

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? '  ✓' : '  ✗'} ${name}${detail ? `  [${detail}]` : ''}`);
}

/**
 * `rgb(r, g, b)` → `#rrggbb`。
 * 用于把**计算后**的颜色（getComputedStyle 一律回 rgb 形式）与
 * **CSS 变量原值**（`--tint` 是十六进制字符串）比对上：
 * 两边格式不同，直接 === 永远是 false，会得到一个恒绿的假断言。
 */
function rgbToHexish(css) {
  const n = (String(css).match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  if (n.length < 3) return null;
  return '#' + n.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/* 一次取回「详情主界面」这一屏的关键事实 */
const PROBE = `(() => {
  const s = document.querySelector('[data-testid="pokemon-screen"]');
  const cs = s ? getComputedStyle(s) : null;
  const rail = document.querySelector('[data-testid="app-rail"]');
  const img = s ? s.querySelector('img') : null;
  const on = rail ? rail.querySelector('a[aria-current="page"]') : null;
  // 实心色块上的白字到底读不读得清 —— 直接量 WCAG 对比度，不看设计意图。
  // 亮色主题（黄 / 白 / 灰 / 粉）最容易翻车，所以每只宝可梦都量一遍。
  const lum = (css) => {
    const n = (css.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
    if (n.length < 3) return null;
    const lin = n.map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  };
  const ratio = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const f = lum(cs.color);
    const b = lum(cs.backgroundColor);
    if (f === null || b === null) return null;
    return Math.round(((Math.max(f, b) + 0.05) / (Math.min(f, b) + 0.05)) * 100) / 100;
  };
  return {
    screen: !!s,
    title: s && s.querySelector('h1') ? s.querySelector('h1').textContent.trim() : null,
    colorKey: s ? s.dataset.colorKey : null,
    poke: cs ? cs.getPropertyValue('--poke').trim() : null,
    // 整页换色必须连外壳一起换：外壳（侧栏 / 底纹）是详情容器的祖先，
    // CSS 变量不会向上继承，所以单独取根元素与侧栏选中项的实际渲染色来判。
    rootPoke: getComputedStyle(document.documentElement).getPropertyValue('--poke').trim(),
    railOnBg: on ? getComputedStyle(on).backgroundColor : '',
    contrast: {
      cry: ratio(document.querySelector('[data-testid="cry-button"]')),
      tab: ratio(document.querySelector('[role="tab"][aria-selected="true"]')),
      rail: ratio(on),
    },
    cry: !!document.querySelector('[data-testid="cry-button"]'),
    search: !!document.querySelector('[data-testid="global-search"]'),
    // 六条种族值必须各有各的颜色（参考图是红橙黄绿蓝紫），单色也「能跑」，所以要量颜色集合
    statColors: [...document.querySelectorAll('[data-testid="stat-bar"]')]
      .map(e => { const f = e.querySelector('span:nth-child(2) > span'); return f ? getComputedStyle(f).backgroundColor : null; }),
    tabCount: document.querySelectorAll('[data-testid="tabbar"] > button').length,
    tabOnBg: (() => { const t = document.querySelector('[data-testid="tabbar"] > button[aria-selected="true"]'); return t ? getComputedStyle(t).backgroundColor : null; })(),
    railLinks: rail ? rail.querySelectorAll('nav a').length : 0,
    railOn: on ? on.textContent.trim() : '',
    typeBadges: document.querySelectorAll('[data-testid="pokemon-screen"] [data-testid="type-badge"]').length,
    statBars: document.querySelectorAll('[data-testid="stat-bar"]').length,
    spriteOk: !!(img && img.complete && img.naturalWidth > 0),
    sideAbility: !!document.querySelector('[data-testid="side-ability"]'),
    evoNodes: document.querySelectorAll('[data-testid="evo-node"]').length,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,

    /* ---- 形态（forms） ---- */
    formList: !!document.querySelector('[data-testid="form-list"]'),
    formItems: document.querySelectorAll('[data-testid="form-list"] [data-form-slug]').length,
    formSelected: (() => {
      const e = document.querySelector('[data-testid="form-list"] [data-form-on]');
      return e ? e.dataset.formSlug : null;
    })(),
    formListScrolls: (() => {
      const u = document.querySelector('[data-testid="form-list"] ul');
      return u ? u.scrollHeight > u.clientHeight + 1 : null;
    })(),
    formThumbs: [...document.querySelectorAll('[data-testid="form-list"] img')].map((i) => i.getAttribute('src')),
    formThumbsOk: (() => {
      const im = [...document.querySelectorAll('[data-testid="form-list"] img')];
      return im.length > 0 && im.every((i) => i.complete && i.naturalWidth > 0);
    })(),
    strip: !!document.querySelector('[data-testid="side-forms"]'),
    stripItems: document.querySelectorAll('[data-testid="form-strip"] [data-form-slug]').length,
    formBadge: (() => {
      const e = document.querySelector('[data-testid="form-badge"]');
      return e ? e.textContent.trim() : null;
    })(),
    /* 选中态与未选中态必须**肉眼可区分**（描边色不同），只判「有没有选中」不够 */
    formOnBorder: (() => {
      const e = document.querySelector('[data-testid="form-list"] [data-form-on]');
      return e ? getComputedStyle(e).borderTopColor : null;
    })(),
    formOffBorder: (() => {
      const e = document.querySelector('[data-testid="form-list"] [data-form-slug]:not([data-form-on])');
      return e ? getComputedStyle(e).borderTopColor : null;
    })(),
    artSrc: (() => {
      const i = document.querySelector('[data-testid="art-image"]');
      return i ? i.getAttribute('src') : null;
    })(),
    typeNames: [...document.querySelectorAll('[data-testid="type-row"] [data-testid="type-badge"]')].map((e) =>
      e.textContent.trim(),
    ),
    statTotal: (() => {
      const e = document.querySelector('[data-testid="stat-total"] strong');
      return e ? Number(e.textContent.trim()) : null;
    })(),
    sideHead: (() => {
      const e = document.querySelector('[data-testid="side-head-name"]');
      return e ? e.textContent.trim() : null;
    })(),

    /* ---- 宣传飘带（2026-09-29 加） ----
     * 口径是「用户目的」而不是「元素在不在」：
     *   · 登记过宣传语的宝可梦 → 飘带出现，且**文字非空、白字读得清**；
     *   · 没登记的 → 整块不存在（不是一条空白红条）。
     * 早期版本会犯的错：把 taglineZh 判成 '' 而不是 undefined，
     * 结果渲染出一条空白飘带 —— 元素在、断言过，但用户看到的是一块莫名的红条。
     */
    ribbon: (() => {
      const e = document.querySelector('[data-testid="promo-ribbon"]');
      if (!e) return null;
      const cs = getComputedStyle(e);
      return {
        text: e.textContent.trim(),
        bg: cs.backgroundColor,
        color: cs.color,
        clip: cs.clipPath,
        height: Math.round(e.getBoundingClientRect().height * 100) / 100,
      };
    })(),

    /* ---- 属性标签的图标（2026-09-29：圆点 → 图标） ----
     * 原版是纯色圆点，现在是属性图标。这里量三件事：
     *   · 每个标签都有图标（数量与徽章数相等）；
     *   · 图标是 <svg> 且**真的画了图形**（有子节点，不是空 svg）；
     *   · solid 档图标色=白（与胶囊白字一致）、soft 档图标色=主属性色。
     */
    typeIcons: [...document.querySelectorAll('[data-testid="type-row"] [data-testid="type-badge"]')].map((b) => {
      const i = b.querySelector('[data-testid="type-icon"]');
      const svg = i ? i.querySelector('svg') : null;
      return {
        type: b.dataset.type,
        variant: b.dataset.variant,
        hasIcon: !!i,
        svgPaths: svg ? svg.children.length : 0,
        iconColor: i ? getComputedStyle(i).color : null,
        badgeColor: getComputedStyle(b).color,
      };
    }),

    /*
     * 属性色（--tint）的落地检查。
     * 它曾经**没有**注入到详情页根节点，导致 .tint-rule 里的
     * color-mix(..., var(--tint)) 被判非法、静默退化：简介左侧色条变
     * currentColor 的灰。这个计算值必须单独采，才可能在下一次改坏时立刻看见。
     *
     * 注：立绘底板（art-plate）2026-10-05 按参考稿改成素板，不再吃 --tint，
     * 原来那条 plateHalo 断言（采 [data-testid=art-plate] 的子 div 的
     * backgroundImage）随之删除 —— 元素已经不存在，留着只会变成一条
     * 「采不到东西但照样打印 ✓」的假绿断言。
     */
    rootTint: cs ? cs.getPropertyValue('--tint').trim() : null,
    introRule: (() => {
      const e = document.querySelector('[data-testid="detail-panel"] p');
      return e ? getComputedStyle(e).borderLeftColor : null;
    })(),

    /* ---- 顶栏与外壳（2026-09-29 第三轮：对齐对照稿时新增的交互） ---- */
    recentBtn: !!document.querySelector('[data-testid="topbar-recent"]'),
    railToggle: !!document.querySelector('[data-testid="topbar-rail-toggle"]'),
    /* 侧栏是「悬浮圆角卡」而不是贴边通高条 —— 用几何量它，别只看有没有这个元素 */
    railBox: (() => {
      const r = document.querySelector('[data-testid="app-rail"]');
      if (!r) return null;
      const rect = r.getBoundingClientRect();
      return { left: Math.round(rect.left), radius: getComputedStyle(r).borderTopLeftRadius };
    })(),
    /* display:none 之后 rect.width 是 0，用它判「真的隐藏了」 */
    railHidden: (() => {
      const r = document.querySelector('[data-testid="app-rail"]');
      return r ? r.getBoundingClientRect().width === 0 : null;
    })(),
    recentItems: document.querySelectorAll('[data-testid="recent-item"]').length,
  };
})()`;

const PATH_AND_TITLE = `(() => ({
  path: location.pathname,
  title: (document.querySelector('[data-testid="pokemon-screen"] h1') || {}).textContent || '',
}))()`;

const PATH_ONLY = `location.pathname`;

/**
 * 用顶栏搜索走一次**客户端路由**跳到目标宝可梦。
 *
 * 走 router.push 而不是 `location.href`，是为了覆盖「客户端跳转」这条路径
 * （整页加载会忽略掉这条路才有的问题）。
 *
 * 注：2026-09-29 实测，从 A 只跳到 B 只时 Next 会按路由参数**重建**页面组件，
 * 形态选择状态本来就归零。所以下面那几条「跨物种跳转后选中项回到基本形态」的断言
 * 测的是**端到端行为**，不是 PokemonScreen 里那段防御性校验 ——
 * 把校验删掉它们照样通过（已用注入缺陷法确认过）。
 */
async function searchAndEnter(b, name) {
  await b.ev(`(() => {
    const i = document.querySelector('[data-testid="global-search"]');
    if (!i) return false;
    i.focus();
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(i, ${JSON.stringify(name)});
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  for (let i = 0; i < 20; i++) {
    const n = await b.ev(`document.querySelectorAll('[data-testid="search-item"]').length`);
    if (n > 0) break;
    await sleep(300);
  }
  await b.pressKey('Enter', 'Enter', 13);
  await sleep(1700);
}

async function goto(b, p) {
  await b.ev(`location.href=${JSON.stringify(p)}`);
  await sleep(1500);
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const b = await launch({ port: PORT, url: BASE + '/', windowSize: '1440,960' });
  // 显式指定视口：--window-size 给的是外框尺寸，实际内容区会小一截
  await b.setViewport(1280, 860);

  /* ------------------------- [1] 首页 = 详情主界面 ------------------------- */
  console.log('\n[1] 首页详情主界面');
  await goto(b, '/');
  const home = await b.ev(PROBE);
  check('首页直接是宝可梦详情', home.screen === true);
  check('默认展示 #479 洛托姆', home.title === '洛托姆', String(home.title));
  check('侧栏有 6 个导航项', home.railLinks === 6, String(home.railLinks));
  check('侧栏高亮「图鉴首页」', home.railOn === '图鉴首页', home.railOn);
  check('属性标签 2 个（电 / 幽灵）', home.typeBadges === 2, String(home.typeBadges));
  check('种族值 6 条', home.statBars === 6, String(home.statBars));
  check('立绘真实加载（非碎图）', home.spriteOk === true);
  check('有叫声按钮', home.cry === true);
  check('顶栏有搜索框', home.search === true);
  check('Tab 是通栏 4 片', home.tabCount === 4, String(home.tabCount));
  check(
    '选中的 Tab 片是实心主题色（不是只变字色）',
    !!home.tabOnBg && home.tabOnBg !== 'rgba(0, 0, 0, 0)',
    String(home.tabOnBg),
  );
  check(
    '六条种族值各有各的颜色',
    new Set(home.statColors.filter(Boolean)).size === 6,
    `${home.statColors.length} 条 / ${new Set(home.statColors.filter(Boolean)).size} 种色`,
  );
  check('右侧有特性面板', home.sideAbility === true);
  check('桌面端无横向溢出', home.overflow <= 1, `${home.overflow}px`);
  check(
    '实心色块上的白字读得清（对比度 ≥ 4.5）',
    Math.min(home.contrast.cry, home.contrast.tab, home.contrast.rail) >= 4.5,
    `叫一声 ${home.contrast.cry} / 选中 Tab ${home.contrast.tab} / 侧栏选中项 ${home.contrast.rail}`,
  );
  await b.screenshot(path.join(SHOTS, '01-home-desktop.png'));

  /* --------------------- [2] 切换宝可梦 → 主题色跟着变 --------------------- */
  console.log('\n[2] 主题色随宝可梦切换');
  await goto(b, '/pokemon/25');
  const pk = await b.ev(PROBE);
  check('切到皮卡丘', pk.title === '皮卡丘', String(pk.title));
  check(
    '主题色变成皮卡丘的黄色（≠ 洛托姆的红）',
    pk.colorKey === 'yellow' && pk.poke !== home.poke,
    `${home.poke} → ${pk.poke}`,
  );
  check(
    '侧栏选中项底色跟着换（外壳也换色，不只是面板）',
    pk.railOnBg !== home.railOnBg && pk.rootPoke === pk.poke,
    `侧栏 ${home.railOnBg} → ${pk.railOnBg}；根 --poke ${pk.rootPoke}`,
  );
  check(
    '黄色主题（最亮的配色）下白字仍达标',
    Math.min(pk.contrast.cry, pk.contrast.tab, pk.contrast.rail) >= 4.5,
    `叫一声 ${pk.contrast.cry} / 选中 Tab ${pk.contrast.tab} / 侧栏选中项 ${pk.contrast.rail}`,
  );
  await goto(b, '/pokemon/1');
  const bulba = await b.ev(PROBE);
  check(
    '再切妙蛙种子，主题色又变（绿）',
    bulba.colorKey === 'green' && bulba.poke !== pk.poke,
    `${pk.poke} → ${bulba.poke}`,
  );

  /* ------------------------ [3] 进化链点击可切换 ------------------------ */
  console.log('\n[3] 进化链跳转');
  await goto(b, '/pokemon/1');
  const b1 = await b.ev(PROBE);
  check('妙蛙种子详情打开', b1.title === '妙蛙种子', String(b1.title));
  check('页面上有进化节点', b1.evoNodes >= 2, String(b1.evoNodes));
  await b.click('[data-testid="evo-node"][data-pokemon-id="2"]');
  await sleep(1300);
  const jumped = await b.ev(PATH_AND_TITLE);
  check('点进化节点切到妙蛙草', jumped.title.trim() === '妙蛙草', String(jumped.title));
  check('URL 同步变成 /pokemon/2', jumped.path === '/pokemon/2', String(jumped.path));
  const afterJump = await b.ev(PROBE);
  check(
    '路由跳转（非整页刷新）后外壳与面板仍同色',
    !!afterJump.rootPoke && afterJump.rootPoke === afterJump.poke,
    `根 ${afterJump.rootPoke} / 面板 ${afterJump.poke}`,
  );
  await b.screenshot(path.join(SHOTS, '02-evo-jump.png'));

  /* ----------------------------- [4] Tab 切换 ----------------------------- */
  console.log('\n[4] 详情分栏 Tab');
  await b.click('[data-testid="tab-evo"]');
  await sleep(600);
  const tabOn = await b.ev(
    `(() => { const t = document.querySelector('[data-testid="tab-evo"]'); return t ? t.getAttribute('aria-selected') === 'true' : null; })()`,
  );
  check('点「进化链」Tab 能切过去', tabOn === true, String(tabOn));

  /* ------------------------------ [5] 叫声 ------------------------------ */
  console.log('\n[5] 叫声按钮');
  await b.click('[data-testid="cry-button"]');
  await sleep(600);
  const cryState = await b.ev(
    `(() => { const c = document.querySelector('[data-testid="cry-button"]'); return c ? c.dataset.state : null; })()`,
  );
  check(
    '叫声按钮点了不卡住（进入播放/失败/空闲态）',
    ['playing', 'failed', 'idle'].includes(cryState),
    String(cryState),
  );

  /* --------------------- [5b] 顶栏搜索：输名字 → 跳详情 --------------------- */
  console.log('\n[5b] 顶栏全局搜索');
  await goto(b, '/');
  await b.ev(`(() => {
    const i = document.querySelector('[data-testid="global-search"]');
    // 必须先真的聚焦：CDP 的按键事件是派发给「当前焦点元素」的，
    // 只设值不聚焦的话，下面的 Enter 会打到 body 上，看起来像「回车没反应」。
    i.focus();
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(i, '皮卡丘');
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  let hits = 0;
  for (let i = 0; i < 20; i++) {
    hits = await b.ev(`document.querySelectorAll('[data-testid="search-item"]').length`);
    if (hits > 0) break;
    await sleep(300);
  }
  check('输入「皮卡丘」下拉出结果', hits > 0, String(hits));
  const hit0 = await b.ev(
    `(() => { const b = document.querySelector('[data-testid="search-item"]'); return b ? {id: b.dataset.pokemonId, text: b.textContent.trim()} : null; })()`,
  );
  check('第一条就是 #25 皮卡丘', !!hit0 && hit0.id === '25', hit0 ? hit0.text : 'null');

  // 回车直接进那只的详情
  await b.pressKey('Enter', 'Enter', 13);
  await sleep(1700);
  const searched = await b.ev(PATH_AND_TITLE);
  check(
    '回车跳到 /pokemon/25 且标题是皮卡丘',
    searched.path === '/pokemon/25' && searched.title.trim() === '皮卡丘',
    `${searched.path} / ${searched.title.trim()}`,
  );

  /* ------------------- [5c] 形态：有才出现，切换真换数据 ------------------- */
  console.log('\n[5c] 形态（forms）');
  await goto(b, '/pokemon/479'); // 洛托姆：6 个形态（基本 + 5 个家电形态）
  const r0 = await b.ev(PROBE);
  check(
    '有形态的宝可梦出现「形态」列表（6 项）',
    r0.formList === true && r0.formItems === 6,
    `list=${r0.formList} / ${r0.formItems} 项`,
  );
  check(
    '右侧信息面板出现「近年来常见的形态」横条（6 项）',
    r0.strip === true && r0.stripItems === 6,
    `strip=${r0.strip} / ${r0.stripItems} 项`,
  );
  check('默认停在基本形态', r0.formSelected === 'rotom', String(r0.formSelected));
  check('右面板信息块顶部有名字 + 编号行', r0.sideHead === '洛托姆', String(r0.sideHead));

  /*
   * 属性色（--tint）必须真的注入到详情页根节点。
   * 空值不报错，只会让简介左侧色条（tint-rule）悄悄退化成 currentColor 的灰 ——
   * 所以既要断言变量有值，也要断言它派生出来的计算样式是个真颜色。
   */
  check('详情页根节点注入了属性色 --tint', !!r0.rootTint, String(r0.rootTint));
  check(
    '简介左侧色条（--tint 派生）是实色，没有退化成灰',
    !!r0.introRule && !/^(transparent|currentcolor)$/i.test(r0.introRule),
    String(r0.introRule),
  );

  /*
   * 缩略图必须走 96px 的小图。这一栏一屏露出 4 张、皮卡丘有 17 张，
   * 用 130KB 的官方立绘就是白烧 0.5~2MB。判「不是大图」比判「是 -thumb」更贴近意图。
   */
  const bigThumbs = (r0.formThumbs || []).filter((s) => !/-thumb\.png$/.test(s || ''));
  check(
    '形态缩略图走 96px 小图（不是 130KB 官方立绘）',
    r0.formThumbs.length === 6 && bigThumbs.length === 0,
    `大图 ${bigThumbs.length} 张 / 共 ${r0.formThumbs.length}`,
  );
  check('形态缩略图都真的加载出来了', r0.formThumbsOk === true);
  check('形态多于可视高度时列表可滚动', r0.formListScrolls === true, String(r0.formListScrolls));
  check(
    '选中的形态与其它形态描边可区分',
    !!r0.formOnBorder && !!r0.formOffBorder && r0.formOnBorder !== r0.formOffBorder,
    `${r0.formOnBorder} ≠ ${r0.formOffBorder}`,
  );

  await b.click('[data-testid="form-list"] [data-form-slug="rotom-heat"]');
  await sleep(700);
  const r1 = await b.ev(PROBE);
  check('点形态后标题带上形态标签', r1.title === '洛托姆（加热形态）', String(r1.title));
  check('主面板出现形态徽标', r1.formBadge === '加热形态', String(r1.formBadge));
  check('立绘换成该形态的图', r1.artSrc === '/sprites/forms/10008.png', String(r1.artSrc));
  check('属性跟着换（电 / 幽灵 → 电 / 火）', r1.typeNames.join('/') === '电/火', r1.typeNames.join('/'));
  check('种族值跟着换（440 → 520）', r0.statTotal === 440 && r1.statTotal === 520, `${r0.statTotal} → ${r1.statTotal}`);
  const stillPath = await b.ev(PATH_ONLY);
  check('切形态是同页切换、不换 URL', stillPath === '/pokemon/479', String(stillPath));
  await b.screenshot(path.join(SHOTS, '04-form-heat.png'));

  /*
   * 带着形态选择**客户端跳转**到另一只宝可梦：形态相关的 UI 必须全部换成新物种的。
   * 走 router.push（顶栏搜索），覆盖「整页加载」测不到的这条路径。
   * 实测 Next 会重建页面组件、状态归零，所以这几条是端到端行为断言。
   */
  await searchAndEnter(b, '皮卡丘');
  const r2 = await b.ev(PROBE);
  check('跨宝可梦客户端跳转后标题回到「皮卡丘」', r2.title === '皮卡丘', String(r2.title));
  check('皮卡丘的形态列表是自己的 17 项', r2.formItems === 17, String(r2.formItems));
  check('跨宝可梦跳转后选中项回到基本形态', r2.formSelected === 'pikachu', String(r2.formSelected));
  check('跨宝可梦跳转后形态徽标不残留', r2.formBadge === null, String(r2.formBadge));

  /* ---- 没有额外形态的宝可梦：形态相关的 UI 整块都不该出现 ---- */
  await goto(b, '/pokemon/1');
  const r3 = await b.ev(PROBE);
  check(
    '无额外形态的宝可梦不出现形态列表与横条',
    r3.formList === false && r3.strip === false,
    `list=${r3.formList} strip=${r3.strip}`,
  );
  check('无额外形态的宝可梦主面板仍是本体数据', r3.statTotal === 318 && r3.artSrc === '/sprites/1.png', `${r3.statTotal} / ${r3.artSrc}`);
  check(
    '简介左侧色条跟着主属性走（洛托姆电 ≠ 妙蛙种子草）',
    !!r3.introRule && r3.introRule !== r0.introRule,
    `${r0.introRule} → ${r3.introRule}`,
  );

  /* ---------------- [5d] 宣传飘带 + 属性图标（2026-09-29 加） ---------------- */
  console.log('\n[5d] 宣传飘带与属性图标');
  await goto(b, '/pokemon/479'); // 洛托姆：登记过宣传语
  const d0 = await b.ev(PROBE);
  check(
    '登记过宣传语的宝可梦出现飘带',
    !!d0.ribbon && d0.ribbon.text.length > 0,
    d0.ribbon ? `「${d0.ribbon.text}」` : 'null',
  );
  check(
    '飘带用斜切角标（clip-path，不是普通矩形）',
    !!d0.ribbon && d0.ribbon.clip !== 'none' && d0.ribbon.clip.includes('polygon'),
    String(d0.ribbon && d0.ribbon.clip).slice(0, 32),
  );
  /* 飘带是「深色实心 + 白字」，必须真的读得清 —— 这是本站的铁律（见 globals.css） */
  const ribbonContrast = await b.ev(`(() => {
    const lum = (css) => {
      const n = (css.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
      if (n.length < 3) return null;
      const lin = n.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
      return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    };
    const e = document.querySelector('[data-testid="promo-ribbon"]');
    if (!e) return null;
    const cs = getComputedStyle(e);
    const f = lum(cs.color), bg = lum(cs.backgroundColor);
    if (f === null || bg === null) return null;
    return Math.round(((Math.max(f, bg) + 0.05) / (Math.min(f, bg) + 0.05)) * 100) / 100;
  })()`);
  check(
    '飘带白字读得清（对比度 ≥ 4.5）',
    ribbonContrast >= 4.5,
    String(ribbonContrast),
  );

  /* 属性图标：每个标签都要有，且 svg 里真的画了东西 */
  check(
    '每个属性标签都有图标',
    d0.typeIcons.length > 0 && d0.typeIcons.every((t) => t.hasIcon),
    `${d0.typeIcons.length} 个标签 / 缺图标 ${d0.typeIcons.filter((t) => !t.hasIcon).length} 个`,
  );
  /*
   * 实心属性胶囊的白字必须读得清。
   *
   * 这条是**补上来的漏判**：原先只验了「有白字对比度断言」的按钮与 Tab，
   * 属性胶囊走的是 `type-chip-solid` 的 color-mix 现场掺深配方，没被覆盖。
   * 2026-09-29 提饱和时它就真翻车了 —— 主色变亮变艳，62% 掺深挡不住白字，
   * 18 个属性里 12 个掉到 4.5 以下（最差的冰 3.23），而当时全部门禁仍然全绿。
   * 现在按**每一种属性**都量一遍：只要有一个不达标就报出来。
   *
   * ⚠️ 解析色值必须同时支持两种格式，否则会得到一个「看起来很高」的假通过值：
   *   · `rgb(255, 255, 255)`        —— 分量是 0~255
   *   · `color(srgb 0.4856 0.4304 0.1388)` —— 分量是 **0~1**（color-mix 的返回值就是这个）
   * 早期版本一律按 0~255 处理，于是 `0.4856` 被当成 0.48/255 的纯黑，
   * 算出来 electric 的对比度是 **20.95** —— 一个物理上不可能的数，
   * 但它 ≥4.5，断言照样通过。所以断言里额外卡了「上限不可能超过 21」这个常识边界。
   */
  const capsuleContrast = await b.ev(`(() => {
    const lum = (css) => {
      const n = (css.match(/[\\d.]+/g) || []).map(Number).slice(0, 3);
      if (n.length < 3) return null;
      /*
       * 两种格式，分量的量纲不同：
       *   · rgb 形式        —— 分量 0~255，除 255
       *   · color(srgb ...) —— 分量**已经是 0~1**，直接用
       * color-mix 的返回值是后者。搞反了会得到 20+ 的假对比度，
       * 所以断言里同时卡了「不许超过 21」这个物理上限。
       */
      const isSrgbFn = /color\\s*\\(/.test(css);
      const lin = n.map((v) => {
        const c = isSrgbFn ? v : v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    };
    /*
     * 造一个真的进 DOM 的实心胶囊，把 18 个 --tint 逐个喂进去量。
     * 详情页一屏只有 1~2 个属性，只看页面上那两个等于没验。
     */
    const host = document.createElement('div');
    host.style.cssText =
      'position:fixed;left:0;top:0;z-index:-1;opacity:0.01;pointer-events:none;';
    document.body.appendChild(host);
    const tints = [
      'normal','fire','water','electric','grass','ice','fighting','poison','ground',
      'flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy',
    ];
    const src = document.documentElement;
    const all = [];
    for (const t of tints) {
      const el = document.createElement('span');
      el.className = 'type-chip-solid';
      el.textContent = 'X';
      const tint = getComputedStyle(src).getPropertyValue('--type-' + t).trim();
      el.style.setProperty('--tint', tint);
      host.appendChild(el);
      const cs = getComputedStyle(el);
      const f = lum(cs.color), bg = lum(cs.backgroundColor);
      if (f !== null && bg !== null) {
        const r = (Math.max(f, bg) + 0.05) / (Math.min(f, bg) + 0.05);
        all.push([t, Math.round(r * 100) / 100, cs.backgroundColor]);
      }
      host.removeChild(el);
    }
    document.body.removeChild(host);
    all.sort((a, z) => a[1] - z[1]);
    return all;
  })()`);
  check(
    '实心属性胶囊的白字全部 ≥4.5（18 个属性逐个量）',
    capsuleContrast.length === 18 &&
      capsuleContrast.every((r) => r[1] >= 4.5) &&
      /* 对比度不可能超过 21（纯黑对纯白）。超过说明色值解析错了，不是「很好」 */
      capsuleContrast.every((r) => r[1] <= 21),
    `最低 ${capsuleContrast[0] && capsuleContrast[0][0]} ${capsuleContrast[0] && capsuleContrast[0][1]}` +
      ` / 最高 ${capsuleContrast[capsuleContrast.length - 1] && capsuleContrast[capsuleContrast.length - 1][0]} ` +
      `${capsuleContrast[capsuleContrast.length - 1] && capsuleContrast[capsuleContrast.length - 1][1]}（共 ${capsuleContrast.length} 个）`,
  );
  check(
    '图标是内联 SVG 且真的画了图形（不是空 svg）',
    d0.typeIcons.every((t) => t.svgPaths >= 1),
    `最少子节点数 ${Math.min(...d0.typeIcons.map((t) => t.svgPaths))}`,
  );
  /*
   * 18 个属性的图标必须彼此不同。
   * 页面上一屏只渲染 1~2 个属性，所以**不能**从 DOM 里采 ——
   * 那样只能证明「这两个不一样」。正确做法是直接读 typeIcons.tsx 的源码，
   * 按属性 key 切块后比对每块的图形描述：源码级唯一性才是真的唯一性。
   */
  const iconSrc = fs.readFileSync(path.join(__dirname, '..', 'components', 'typeIcons.tsx'), 'utf8');
  const iconKeys = [
    'normal','fire','water','electric','grass','ice','fighting','poison','ground',
    'flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy',
  ];
  const shapes = new Map();
  for (const k of iconKeys) {
    // 匹配 `key: <jsx>,` 到下一个 key 或结尾
    const re = new RegExp(`^\\s{2}${k}:\\s*([\\s\\S]*?)(?=\\n\\s{2}(?:${iconKeys.join('|')}):|\\n\\};)`, 'm');
    const m = iconSrc.match(re);
    if (m) shapes.set(k, m[1].replace(/\s+/g, ' ').trim());
  }
  const uniqShapes = new Set(shapes.values());
  check(
    '18 个属性各有各的图标（源码级比对，不是只看页面上的两个）',
    shapes.size === 18 && uniqShapes.size === 18,
    `定义 ${shapes.size} 个 / 去重后 ${uniqShapes.size} 个`,
  );

  /* 没登记宣传语的宝可梦：飘带整块不该出现 */
  await goto(b, '/pokemon/1');
  const d1 = await b.ev(PROBE);
  check(
    '没登记宣传语的宝可梦不渲染飘带（不是空白红条）',
    d1.ribbon === null,
    d1.ribbon ? `不该有：「${d1.ribbon.text}」` : 'null',
  );
  check(
    '没飘带的卡片：名字行仍然正常',
    d1.sideHead === '妙蛙种子',
    String(d1.sideHead),
  );

  /*
   * 属性标签在本站有**三处**实现（详情页胶囊 / 属性分类页 / 图鉴筛芯片），
   * 它们各自独立，不是同一个组件 —— 只验详情页那一处，另外两处还是圆点也照样全绿。
   *
   * 属性分类页（TypeGallery）挂在「按属性」这个 tab 后面，**默认不渲染**：
   * 不先点 `view-types` 就采，得到的是 0 张卡片，
   * 断言会以「0 张卡片」这种看不出根因的形式失败（第一次就是这么踩的）。
   */
  console.log('\n[5e] 属性图标三处实现的一致性');
  await goto(b, '/pokedex');
  await b.click('[data-testid="view-types"]');
  await sleep(1200);
  /* 等 18 张卡片真的出来再采 —— 卡片数据是 fetch /api/types 之后才渲染的 */
  let galCards = 0;
  for (let i = 0; i < 20; i++) {
    galCards = await b.ev(`document.querySelectorAll('[data-testid="type-card"]').length`);
    if (galCards >= 18) break;
    await sleep(300);
  }
  const gal = await b.ev(`(() => {
    const cards = [...document.querySelectorAll('[data-testid="type-card"]')];
    const svgs = [...document.querySelectorAll('[data-testid="type-card"] svg')];
    /*
     * 卡片头图标的尺寸：按 data-testid="type-icon" 取，**不能**用
     * cards[i].querySelector('svg') —— 卡片头外面还包着一层 flex 容器，
     * 而相性行（弱点 / 抗性 / 免疫 / 招式克制）里的胶囊图标在 DOM 里排得更靠前，
     * 于是「卡片头」会采到 11px 的相性图标，尺寸分级看起来就像没做。
     */
    const headSizes = cards.map((c) => {
      const head = c.querySelector('[data-testid="type-icon"] svg');
      return head ? Number(head.getAttribute('width')) : 0;
    });
    const pills = [...document.querySelectorAll('[data-testid="type-gallery"] .type-chip')];
    const pillWithIcon = pills.filter((p) => p.querySelector('[data-testid="type-icon"] svg'));
    const pillSizes = [
      ...new Set(
        pills
          .map((p) => {
            const s = p.querySelector('[data-testid="type-icon"] svg');
            return s ? Number(s.getAttribute('width')) : 0;
          })
          .filter(Boolean),
      ),
    ].sort((a, z) => a - z);
    return {
      cards: cards.length,
      headSvgs: svgs.length,
      headSizes: [...new Set(headSizes)].sort((a, z) => a - z),
      pillSizes,
      pills: pills.length,
      pillWithIcon: pillWithIcon.length,
      chips: document.querySelectorAll('[data-testid="type-chip"]').length,
      chipsWithIcon: [...document.querySelectorAll('[data-testid="type-chip"]')].filter((c) =>
        c.querySelector('[data-testid="type-icon"] svg'),
      ).length,
      /* 颜色语义：卡片头图标 = 主属性色；未选中的筛芯片图标也 = 主属性色 */
      headIconColor: (() => {
        const i = cards[0] && cards[0].querySelector('[data-testid="type-icon"]');
        return i ? getComputedStyle(i).color : null;
      })(),
      cardTint: cards[0] ? getComputedStyle(cards[0]).getPropertyValue('--tint').trim() : null,
    };
  })()`);
  /* 卡片数必须是 18：这一屏是「同屏能看全 18 个属性图标」的唯一位置 */
  check(
    '属性分类页 18 张卡片都渲染出图标',
    gal.cards === 18 && gal.headSvgs >= 18,
    `${gal.cards} 张卡片 / ${gal.headSvgs} 个 svg`,
  );
  check(
    '类型卡片头图标比相性行图标大一档（16 vs 11）',
    gal.headSizes.length === 1 &&
      gal.headSizes[0] === 16 &&
      gal.pillSizes.length === 1 &&
      gal.pillSizes[0] === 11,
    `卡片头 ${gal.headSizes.join('/')} vs 相性胶囊 ${gal.pillSizes.join('/')}`,
  );
  check(
    '相性胶囊（弱点 / 抗性 / 免疫 / 招式克制）也接了图标',
    gal.pills > 0 && gal.pills === gal.pillWithIcon,
    `${gal.pills} 个胶囊 / 缺图标 ${gal.pills - gal.pillWithIcon} 个`,
  );
  check(
    '图鉴筛选芯片也接了图标',
    gal.chips === 18 && gal.chips === gal.chipsWithIcon,
    `${gal.chips} 个芯片 / 缺图标 ${gal.chips - gal.chipsWithIcon} 个`,
  );
  check(
    '卡片头图标用的是主属性色（--tint），不是继承的灰字色',
    !!gal.headIconColor && !!gal.cardTint && rgbToHexish(gal.headIconColor) === gal.cardTint.toLowerCase(),
    `图标 ${gal.headIconColor} vs --tint ${gal.cardTint}`,
  );
  /* 选中态：实心深底上图标必须变白，否则等于没图标 */
  const chipOn = await b.ev(`(() => {
    const c = document.querySelector('[data-testid="type-chip"]');
    if (!c) return null;
    c.click();
    return true;
  })()`);
  await sleep(700);
  const chipOnIcon = await b.ev(`(() => {
    const c = document.querySelector('[data-testid="type-chip"][aria-pressed="true"]');
    if (!c) return null;
    const i = c.querySelector('[data-testid="type-icon"]');
    return { text: c.textContent.trim(), icon: i ? getComputedStyle(i).color : null, bg: getComputedStyle(c).backgroundColor };
  })()`);
  check(
    '筛芯片选中（实心深底）后图标变白，不是深色叠深色',
    !!chipOn && !!chipOnIcon && chipOnIcon.icon === 'rgb(255, 255, 255)',
    chipOnIcon ? `${chipOnIcon.text} → 图标 ${chipOnIcon.icon} / 底 ${chipOnIcon.bg}` : '找不到选中态芯片',
  );


  /* ---------------- [5f] 地区图鉴（2026-10-05 加） ---------------- */
  console.log('\n[5f] 地区图鉴');
  await goto(b, '/regions');
  /*
   * 地区卡由 pokedex.json 的 generations 生成 —— 有几个世代就有几张卡。
   * 断言写「恰好 4」而不是「> 0」：世代配置加了却只渲染出一张，同样是坏的。
   */
  const regions = await b.ev(`(() => {
    const cards = [...document.querySelectorAll('[data-testid="region-card"]')];
    return cards.map((c) => ({
      id: c.getAttribute('data-region-id'),
      name: c.querySelector('h2') ? c.querySelector('h2').textContent.trim() : '',
      count: (c.textContent.match(/共\\s*(\\d+)\\s*只/) || [])[1] || null,
      imgs: c.querySelectorAll('img').length,
    }));
  })()`);
  check(
    '地区图鉴渲染出 4 个地区的卡片',
    regions.length === 4,
    `实际 ${regions.length}：${regions.map((r) => r.name).join(' / ')}`,
  );
  check(
    '每张地区卡都有地区名、计数与代表宝可梦（图片非空）',
    regions.length > 0 && regions.every((r) => r.name && r.count && r.imgs > 0),
    regions.map((r) => `${r.name}:${r.count}只/${r.imgs}图`).join(' '),
  );
  /* 关都（第一世代）恒为 151 只 —— 拿一个不会变的硬事实当锚点 */
  check(
    '关都地区计数正确（151 只）',
    !!regions[0] && regions[0].count === '151',
    String(regions[0] && regions[0].count),
  );
  const rg0 = await b.ev(PROBE);
  check('侧栏高亮「地区图鉴」', rg0.railOn === '地区图鉴', rg0.railOn);
  await b.screenshot(path.join(SHOTS, '13-regions-desktop.png'));

  /* ---- 地区详情：列表数量必须与该地区总数一致 ---- */
  await goto(b, '/regions/4');
  const rg4 = await b.ev(`(() => {
    const cards = document.querySelectorAll('[data-testid="region-pokemon-card"]');
    const title = document.querySelector('[data-testid="region-title"]');
    const count = document.querySelector('[data-testid="region-count"]');
    const first = cards[0];
    return {
      title: title ? title.textContent.trim() : null,
      cards: cards.length,
      count: count ? (count.textContent.match(/(\\d+)/) || [])[1] : null,
      firstId: first ? first.getAttribute('data-pokemon-id') : null,
      firstHref: first ? first.getAttribute('href') : null,
    };
  })()`);
  check('第四世代地区页标题是「神奥」', rg4.title === '神奥', String(rg4.title));
  check(
    '神奥地区列出全部 107 只，且与页头计数一致',
    rg4.cards === 107 && rg4.count === '107',
    `列表 ${rg4.cards} 张 / 页头 ${rg4.count}`,
  );
  check(
    '地区内的卡片指向整页详情（href=/pokemon/[id]）',
    !!rg4.firstHref && /^\/pokemon\/\d+$/.test(rg4.firstHref),
    String(rg4.firstHref),
  );
  check('神奥首只是 #387（按编号升序）', rg4.firstId === '387', String(rg4.firstId));
  await b.screenshot(path.join(SHOTS, '14-region-sinnoh.png'));

  console.log('\n[6] 图鉴查询页');
  await goto(b, '/pokedex');
  let cards = 0;
  for (let i = 0; i < 20; i++) {
    cards = await b.ev(`(() => { const g = document.querySelector('[data-testid="result-grid"]'); return g ? g.children.length : 0; })()`);
    if (cards > 0) break;
    await sleep(300);
  }
  check('查询页渲染出结果卡片', cards > 0, String(cards));
  const q = await b.ev(PROBE);
  check('侧栏高亮「宝可梦」', q.railOn === '宝可梦', q.railOn);
  check(
    '离开详情页后外壳主题色还原成默认',
    q.rootPoke === home.rootPoke && !!q.rootPoke,
    `皮卡丘页 ${pk.rootPoke} → 查询页 ${q.rootPoke}`,
  );
  await b.screenshot(path.join(SHOTS, '03-pokedex-desktop.png'));

  /* ---- 点结果卡片：必须跳到整页详情，而不是弹出旧弹窗 ---- */
  const firstId = await b.ev(
    `(() => { const c = document.querySelector('[data-testid="result-card"]'); return c ? c.dataset.pokemonId : null; })()`,
  );
  await b.click('[data-testid="result-card"]');
  await sleep(1800);
  const opened = await b.ev(PATH_AND_TITLE);
  check(
    '点结果卡片跳到整页详情（不再是弹窗）',
    !!firstId && opened.path === `/pokemon/${firstId}` && opened.title.trim().length > 0,
    `${opened.path} / ${opened.title.trim()}`,
  );
  const modalLeft = await b.ev(`!!document.querySelector('[role="dialog"]')`);
  check('页面上不再有详情弹窗', modalLeft === false);

  /* --------------------------- [7] 顶栏与外壳 --------------------------- */
  /*
   * 对照稿右上角那两颗圆形按钮做成了**真功能**（时钟 = 最近浏览、汉堡 = 折叠侧栏）。
   * 这两块没有别的门禁盯着，所以断言写在「功能能不能用」这一层：
   * 点一下侧栏真的消失、再点真的回来；访问过的宝可梦真的进了下拉。
   * 只判「按钮存在」等于没测。
   */
  console.log('\n[7] 顶栏与外壳');
  await goto(b, '/pokemon/25');
  const shell = await b.ev(PROBE);
  check('顶栏有「最近浏览」按钮', shell.recentBtn === true);
  check('顶栏有「折叠左侧导航」按钮', shell.railToggle === true);
  check(
    '左侧导航是悬浮卡（有左外边距 + 圆角）',
    !!shell.railBox && shell.railBox.left >= 8 && parseFloat(shell.railBox.radius) >= 12,
    shell.railBox ? `left ${shell.railBox.left}px / 圆角 ${shell.railBox.radius}` : 'null',
  );

  await b.click('[data-testid="topbar-rail-toggle"]');
  await sleep(500);
  const collapsed = await b.ev(PROBE);
  check('点折叠后侧栏真的隐藏了', collapsed.railHidden === true);
  await b.click('[data-testid="topbar-rail-toggle"]');
  await sleep(500);
  const reopened = await b.ev(PROBE);
  check('再点一次侧栏恢复', reopened.railHidden === false);

  await b.click('[data-testid="topbar-recent"]');
  await sleep(500);
  const recent = await b.ev(PROBE);
  check('访问过的宝可梦进了「最近浏览」', recent.recentItems >= 1, `${recent.recentItems} 条`);
  const recentFirst = await b.ev(
    `(() => { const e = document.querySelector('[data-testid="recent-item"]'); return e ? e.dataset.pokemonId : null; })()`,
  );
  check('最近浏览第一条就是刚看的那只', recentFirst === '25', String(recentFirst));
  await b.click('[data-testid="topbar-recent"]');
  await sleep(300);

  /* ------------------------------ [8] 移动端 ------------------------------ */
  console.log('\n[8] 移动端 390×844');
  await b.setViewport(390, 844);
  await goto(b, '/');
  const m = await b.ev(PROBE);
  check('移动端无横向溢出', m.overflow <= 1, `${m.overflow}px`);
  check('移动端仍显示详情主界面', m.screen === true);
  check('移动端侧栏仍在（折叠为顶栏，导航项齐全）', m.railLinks === 6, String(m.railLinks));
  await b.screenshot(path.join(SHOTS, '04-home-mobile.png'));

  /* ------------------------------ [9] 控制台 ------------------------------ */
  console.log('\n[9] 控制台异常');
  const errs = b.consoleErrors.filter((e) => !/favicon|404/.test(e));
  check('运行期无 JS 异常 / console.error', errs.length === 0, errs.slice(0, 2).join(' ;; '));

  b.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length} / ${results.length} 项通过`);
  if (failed.length) {
    console.log('失败项：\n' + failed.map((f) => '  ✗ ' + f.name).join('\n'));
  }
  console.log(`截图目录：${SHOTS}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('测试脚本异常：', e);
  process.exit(2);
});
