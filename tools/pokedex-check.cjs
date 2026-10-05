/**
 * pokedex-check.cjs
 * ---------------------------------------------------------------------------
 * 图鉴查询页的端到端验证。**需要先起服务**：
 *
 *   npm start
 *   npm run pokedex:check
 *   BASE_URL=http://127.0.0.1:3100/ npm run pokedex:check
 *
 * 断言口径对准「用户真的能做到这件事」，不是对准实现：
 *   - 不是「筛选按钮存在」，而是「点了火属性之后，屏幕上的每一张卡都真的有火属性」
 *   - 不是「搜索框能输入」，而是「输入『皮卡丘』之后列表只剩皮卡丘」
 *   - 不是「点击有响应」，而是「点卡片真的弹出这只宝可梦的资料和进化线」
 *
 * 每个「筛掉了东西」的判断都同时验证两件事：结果数量变了 + 留下来的每一项都满足条件。
 * 只查数量的话，一个「把条件忽略掉」的 bug（返回全部）也能让「结果非空」通过。
 */

const fs = require('fs');
const path = require('path');
const { launch, sleep } = require('./cdp-lib.cjs');

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const SHOTS = path.join(__dirname, '..', 'shots');
const CDP_PORT = Number(process.env.PX_CDP_PORT || 9321);

let pass = 0;
const failures = [];

function ok(label, cond, detail) {
  if (cond) {
    pass++;
  } else {
    failures.push(`${label}${detail === undefined ? '' : ` —— ${JSON.stringify(detail)}`}`);
  }
}

/* --------------------------- 页面内取数的小工具 --------------------------- */

/** 结果卡片：编号数组 */
const IDS = `[...document.querySelectorAll('[data-testid=result-card]')].map(c=>Number(c.dataset.pokemonId))`;

/** 顶部「共 N 只」里的数字 */
const TOTAL = `(()=>{const t=document.querySelector('[data-testid=result-count]');
  const m=t&&t.textContent.match(/共\\s*(\\d+)/);return m?Number(m[1]):null;})()`;

/** 卡片里不含指定属性 → 返回违规卡的编号数组，全合规返回 0 */
const CARDS_MISSING_TYPE = (t) =>
  `(()=>{const bad=[...document.querySelectorAll('[data-testid=result-card]')]
     .filter(c=>!c.querySelector('[data-testid=type-badge][data-type="${t}"]'));
   return bad.length?bad.map(c=>Number(c.dataset.pokemonId)):0;})()`;

/** 设置 React 受控输入的值：必须走原生 setter + input 事件，否则 React 收不到 */
const SET_INPUT = (sel, val) => `(()=>{const el=document.querySelector('${sel}');
  const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  s.call(el, ${JSON.stringify(val)});el.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`;

/** 命令式点击（按钮上直接派发 click，避免滚动坐标问题） */
const CLICK = (sel) => `(()=>{const e=document.querySelector('${sel}');if(!e)return false;e.click();return true;})()`;

async function waitFor(b, expr, timeout = 9000, interval = 150) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeout) {
    last = await b.ev(expr);
    if (last) return last;
    await sleep(interval);
  }
  return last;
}

/* --------------------------------- 主体 --------------------------------- */

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  console.log(`[pokedex-check] 目标 ${BASE}\n`);

  const b = await launch({
    port: CDP_PORT,
    url: `${BASE}/pokedex`,
    windowSize: '1440,960',
  });

  try {
    await b.setViewport(1440, 960);

    /* ---------------------- [1] 首屏：默认列表 ---------------------- */
    const firstLoad = await waitFor(b, `document.querySelectorAll('[data-testid=result-card]').length>0`);
    ok('[1] 首屏渲染出结果卡片', firstLoad === true, firstLoad);

    const total0 = await b.ev(TOTAL);
    ok('[1] 首屏显示共 493 只命中前四世代全部', total0 === 493, total0);

    const ids0 = await b.ev(IDS);
    ok('[1] 首屏每页 48 张卡', ids0.length === 48, ids0.length);
    ok('[1] 默认按编号升序，首卡是 #1', ids0[0] === 1, ids0[0]);
    ok('[1] 默认列表是连续编号', ids0.every((v, i) => v === i + 1), ids0.slice(0, 6));

    const chips = await b.ev(
      `(()=>[...document.querySelectorAll('[data-testid=type-chip]')].map(e=>e.dataset.type))()`,
    );
    ok('[1] 属性芯片共 18 个', chips.length === 18, chips.length);
    ok('[1] 属性芯片包含火/水/超能', ['fire', 'water', 'psychic'].every((t) => chips.includes(t)), chips);

    const nameZh = await b.ev(
      `(()=>{const c=document.querySelector('[data-testid=result-card]');return c?c.textContent:'';})()`,
    );
    ok('[1] 卡片上有中文名与种族值', /种族值/.test(nameZh), nameZh.slice(0, 40));

    await b.screenshot(path.join(SHOTS, 'p1-pokedex-list.png'));

    /* ---------------------- [2] 关键词搜索 ---------------------- */
    await b.ev(SET_INPUT('[data-testid=search-input]', '皮卡丘'));
    const q1 = await waitFor(b, `${TOTAL}===1 && ${TOTAL}`);
    ok('[2] 搜索「皮卡丘」结果变为 1 只', q1 === 1, q1);
    const qIds = await b.ev(IDS);
    ok('[2] 搜到的确实是 #25', qIds[0] === 25, qIds);
    const qText = await b.ev(
      `(()=>{const c=document.querySelector('[data-testid=result-card]');return c?c.textContent:'';})()`,
    );
    ok('[2] 卡片上显示的是皮卡丘', qText.includes('皮卡丘'), qText.slice(0, 30));

    // 反向：不存在的关键词必须清空列表，而不是「忽略关键词」
    await b.ev(SET_INPUT('[data-testid=search-input]', 'zzz不存在zzz'));
    const q2 = await waitFor(b, `${TOTAL}===0 && ${TOTAL}`, 9000);
    ok('[2] 不存在的关键词结果为 0（不是忽略条件）', q2 === 0, q2);

    await b.ev(CLICK('[data-testid=search-input] ~ button'));
    const q3 = await waitFor(b, `${TOTAL}===493 && ${TOTAL}`);
    ok('[2] 清空搜索后恢复 493 只', q3 === 493, q3);

    /* ---------------------- [3] 按属性筛选 ---------------------- */
    const fireCount = await b.ev(
      `(()=>{const e=[...document.querySelectorAll('[data-testid=type-chip]')].find(c=>c.dataset.type==='fire');
        const m=e&&e.textContent.match(/(\\d+)/);return m?Number(m[1]):null;})()`,
    );
    await b.ev(CLICK('[data-testid=type-chip][data-type=fire]'));
    const fireTotal = await waitFor(b, `${TOTAL}===${fireCount} && ${TOTAL}`);
    ok(
      `[3] 点火属性后结果等于芯片上的计数（${fireCount}）`,
      fireTotal === fireCount,
      [fireTotal, fireCount],
    );
    ok(
      '[3] 点火属性后屏幕上的每一张卡都真的有火属性',
      (await b.ev(CARDS_MISSING_TYPE('fire'))) === 0,
      await b.ev(CARDS_MISSING_TYPE('fire')),
    );

    // 再加一个水属性，切到「全部」模式
    await b.ev(CLICK('[data-testid=type-chip][data-type=water]'));
    const anyTotal = await waitFor(b, `${TOTAL}!==${fireTotal} && ${TOTAL}`);
    ok('[3] 火+水（任一）结果比只有火时多', anyTotal > fireTotal, [anyTotal, fireTotal]);

    const bothBad = await b.ev(
      `(()=>{const bad=[...document.querySelectorAll('[data-testid=result-card]')]
         .filter(c=>!(c.querySelector('[data-testid=type-badge][data-type="fire"]')
                   && c.querySelector('[data-testid=type-badge][data-type="water"]')));
       return bad.length?bad.map(c=>Number(c.dataset.pokemonId)):0;})()`,
    );
    await b.ev(CLICK('[data-testid=type-mode-all]'));
    const allTotal = await waitFor(b, `${TOTAL}!==${anyTotal} && ${TOTAL}`);
    ok('[3] 切「全部」后结果变少（条件更严）', allTotal < anyTotal, [allTotal, anyTotal]);
    /*
     * 分段控件的「当前选的是哪个」必须能读出来。
     * 只断言「点了之后结果变少」是不够的：按钮本身没状态的话，
     * 用户看不出自己现在处在哪个模式，读屏也读不出来。
     */
    const modeState = await b.ev(
      `(()=>{const n1=document.querySelector('[data-testid=type-mode-any]');
        const n2=document.querySelector('[data-testid=type-mode-all]');
        return [n1&&n1.getAttribute('aria-pressed'), n2&&n2.getAttribute('aria-pressed')];})()`,
    );
    ok('[3] 「任一/全部」有可读的选中状态（aria-pressed）', JSON.stringify(modeState) === '["false","true"]', modeState);
    ok(
      '[3] 「全部」模式下每一张卡同时拥有火和水',
      (await b.ev(
        `(()=>{const bad=[...document.querySelectorAll('[data-testid=result-card]')]
           .filter(c=>!(c.querySelector('[data-testid=type-badge][data-type="fire"]')
                     && c.querySelector('[data-testid=type-badge][data-type="water"]')));
         return bad.length?bad.map(c=>Number(c.dataset.pokemonId)):0;})()`,
      )) === 0,
      bothBad,
    );

    await b.ev(CLICK('[data-testid=reset]'));
    const resetTotal = await waitFor(b, `${TOTAL}===493 && ${TOTAL}`);
    ok('[3] 清除全部筛选后回到 493 只', resetTotal === 493, resetTotal);

    /* ---------------------- [4] 世代 / 种族值 / 排序 ---------------------- */
    await b.ev(CLICK('[data-testid=advanced-toggle]'));
    const panelOpen = await waitFor(b, `!!document.querySelector('[data-testid=advanced-panel]')`);
    ok('[4] 「更多筛选」面板能展开', panelOpen === true, panelOpen);

    await b.ev(CLICK('[data-testid=gen-1]'));
    const gen1Total = await waitFor(b, `${TOTAL}===151 && ${TOTAL}`);
    ok('[4] 选第一世代后 151 只', gen1Total === 151, gen1Total);

    const gen1Max = await b.ev(`(()=>{const n=${IDS};return n.length?Math.max(...n):null;})()`);
    ok('[4] 第一世代结果里最大编号 ≤ 151', gen1Max !== null && gen1Max <= 151, gen1Max);

    await b.ev(CLICK('[data-testid=reset]'));
    await waitFor(b, `${TOTAL}===493 && ${TOTAL}`);

    // 种族值总和 ≥ 600 + 按总和降序
    await b.ev(SET_INPUT('[data-testid=stat-total-min]', '600'));
    await waitFor(b, `(()=>{const t=document.querySelector('[data-testid=result-count]');return t&&!/493/.test(t.textContent);})()`);
    const highTotal = await b.ev(TOTAL);
    ok('[4] 种族值总和 ≥600 后结果收敛', highTotal > 0 && highTotal < 493, highTotal);

    const statTexts = await b.ev(
      `(()=>[...document.querySelectorAll('[data-testid=result-card] [data-testid=card-foot]')]
         .map(e=>{const m=e.textContent.match(/(\\d+)\\s*$/);return m?Number(m[1]):null;}))()`,
    );
    ok(
      '[4] 种族值 ≥600: 每张卡上的种族值都达标',
      statTexts.length > 0 && statTexts.every((v) => v !== null && v >= 600),
      statTexts,
    );

    await b.ev(`(()=>{const s=document.querySelector('[data-testid=sort]');
      const set=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;
      set.call(s,'total');s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
    await sleep(700);
    await b.ev(CLICK('[data-testid=order]'));
    await sleep(900);
    const topId = await b.ev(`(()=>{const n=${IDS};return n[0];})()`);
    ok('[4] 按种族值总和降序时，第一名是阿尔宙斯 #493（720）', topId === 493, topId);

    await b.ev(CLICK('[data-testid=reset]'));
    await waitFor(b, `${TOTAL}===493 && ${TOTAL}`);

    /* ---------------------- [5] 分页 ---------------------- */
    const page1 = await b.ev(IDS);
    await b.ev(CLICK('[data-testid=page-next]'));
    const page2 = await waitFor(b, `(()=>{const n=${IDS};return n[0]!==${page1[0]}?n:null;})()`);
    ok('[5] 下一页后首卡换了', page2[0] !== page1[0], [page1[0], page2[0]]);
    ok('[5] 第二页从 #49 开始', page2[0] === 49, page2[0]);
    ok(
      '[5] 两页没有重叠',
      page1.every((id) => !page2.includes(id)),
    );

    await b.ev(CLICK('[data-testid=page-prev]'));
    const back = await waitFor(b, `(()=>{const n=${IDS};return n[0]===1?n:null;})()`);
    ok('[5] 上一页回到 #1', back[0] === 1, back[0]);

    /* ---------- [6] 点卡片 → 整页详情（不是弹窗） ---------- */
    /*
     * 口径：查询页的详情与首页的详情必须是**同一份实现**。
     * 所以这里断言的是「URL 变成 /pokemon/1 且整页详情渲染出来」，
     * 并且**页面上不再存在弹窗**（旧实现是 Modal + 内嵌 PokemonDetail）。
     */
    await b.ev(CLICK('[data-testid=result-card]'));
    const detailUrl = await waitFor(
      b,
      `(()=>location.pathname==='/pokemon/1'?location.pathname:null)()`,
      12000,
    );
    ok('[6] 点结果卡片跳到 /pokemon/1', detailUrl === '/pokemon/1', detailUrl);

    const dialog = await b.ev(`!!document.querySelector('[role=dialog]')`);
    ok('[6] 页面上不再有详情弹窗', dialog === false, dialog);

    const title = await waitFor(
      b,
      `(()=>{const h=document.querySelector('[data-testid=pokemon-screen] h1');return h?h.textContent.trim():null;})()`,
      12000,
    );
    ok('[6] 整页详情标题是妙蛙种子（列表第一只）', title === '妙蛙种子', title);

    /*
     * 详情默认停在「基本信息」Tab，所以 [data-testid=evolution]（Tab 内容）此刻不在 DOM 里 ——
     * 常驻可见的进化链是右侧信息面板 [data-testid=side-evo]。这里断言右侧那个，
     * 「点 Tab 能切出进化链」由 ui-check 负责。
     */
    const hasEvo = await b.ev(`!!document.querySelector('[data-testid=side-evo]')`);
    ok('[6] 右侧信息面板里有进化链', hasEvo === true, hasEvo);

    const evoNodes = await b.ev(`document.querySelectorAll('[data-testid=evo-node]').length`);
    ok('[6] 进化树上有节点（妙蛙种子线 3 个形态）', evoNodes === 3, evoNodes);

    const evoThumbsLoaded = await b.ev(
      `(()=>[...document.querySelectorAll('[data-testid=evo-node] img')].every(i=>i.complete&&i.naturalWidth>0))()`,
    );
    ok('[6] 进化树缩略图全部真实加载（非破图）', evoThumbsLoaded === true, evoThumbsLoaded);

    const statBars = await b.ev(`document.querySelectorAll('[data-testid=stat-bar]').length`);
    ok('[6] 详情里有 6 条种族值', statBars === 6, statBars);

    await b.screenshot(path.join(SHOTS, 'p2-pokedex-detail.png'));

    // 点进化树上的下一个形态 → 换成另一只
    await b.ev(`(()=>{const n=[...document.querySelectorAll('[data-testid=evo-node]')]
      .find(e=>e.dataset.pokemonId!=='1');if(n){n.click();return true;}return false;})()`);
    const switchedUrl = await waitFor(
      b,
      `(()=>location.pathname==='/pokemon/2'?location.pathname:null)()`,
      12000,
    );
    ok('[6] 点进化树上的形态切到妙蛙草', switchedUrl === '/pokemon/2', switchedUrl);

    /* 回到查询页，后面的分节继续在列表上做 */
    await b.send('Page.navigate', { url: `${BASE}/pokedex` });
    await waitFor(b, `document.querySelectorAll('[data-testid=result-card]').length>0`, 12000);

    /* ---------------------- [7] 按属性分类视图 ---------------------- */
    await b.ev(CLICK('[data-testid=view-types]'));
    const gallery = await waitFor(b, `document.querySelectorAll('[data-testid=type-card]').length===18`);
    ok('[7] 「按属性」视图渲染 18 张属性卡', gallery === true, gallery);

    const fireCard = await b.ev(
      `(()=>{const c=document.querySelector('[data-testid=type-card][data-type=fire]');return c?c.textContent:'';})()`,
    );
    ok('[7] 火属性卡上有计数', /共\s*\d+\s*只/.test(fireCard), fireCard.slice(0, 60));
    ok('[7] 火属性卡列出弱点（含水）', fireCard.includes('弱点') && fireCard.includes('水'), fireCard.slice(0, 80));
    ok('[7] 火属性卡列出招式克制', fireCard.includes('招式克制'), fireCard.slice(0, 120));

    await b.screenshot(path.join(SHOTS, 'p3-pokedex-types.png'));

    // 点属性卡 → 回到列表并按该属性筛选
    /*
     * 读芯片计数作为期望值。切回列表视图时旧的 493 条结果会先渲染一帧，
     * 所以不能「等到有卡片」就算数 —— 必须等到计数真的收敛到该属性的数量。
     */
    const psychicCount = await b.ev(
      `(()=>{const e=[...document.querySelectorAll('[data-testid=type-chip]')].find(c=>c.dataset.type==='psychic');
        const m=e&&e.textContent.match(/(\\d+)/);return m?Number(m[1]):null;})()`,
    );
    await b.ev(CLICK('[data-testid=type-card][data-type=psychic]'));
    const backToList = await waitFor(
      b,
      `(()=>{if(!document.querySelector('[data-testid=result-card]'))return null;
        const v=${TOTAL};return v===${psychicCount}?v:null;})()`,
      12000,
    );
    ok(`[7] 点属性卡回到列表并已筛选（${psychicCount}）`, backToList === psychicCount, backToList);
    const badPsychic = await b.ev(CARDS_MISSING_TYPE('psychic'));
    ok('[7] 筛选结果每张卡都是超能属性', badPsychic === 0, badPsychic);

    /* ------------------- [7b] 地址栏深链能否还原筛选 ------------------- */
    /*
     * 整页重新加载（不是前端路由跳转），验证「链接发出去，别人打开看到的是同一批结果」。
     * 期望值 44 是与 /api/pokedex 同参数直接对账得来的，不是从 UI 抄的。
     */
    await b.send('Page.navigate', {
      url: `${BASE}/pokedex?types=fire,water&generations=1&sort=total&order=desc`,
    });
    /*
     * 先确认「已经是新页面了」再断言：导航期间 DOM 还是旧的，
     * 而旧页面（超能筛选）的总数有可能刚好也是 44，直接等数量会读到上一页的结果。
     * URL 里出现 fire 只可能来自新页面，用它当同步点。
     */
    await waitFor(
      b,
      `location.search.includes('fire') && document.readyState === 'complete'`,
      25000,
    );
    const deepTotal = await waitFor(
      b,
      `(()=>{const n=document.querySelectorAll('[data-testid=result-card]').length;if(!n)return null;
        const v=${TOTAL};return v===44?v:null;})()`,
      25000,
    );
    ok('[7b] 深链（火+水 · 一世代 · 按种族值降序）还原出 44 只', deepTotal === 44, deepTotal);

    const deepPressed = await b.ev(
      `(()=>[...document.querySelectorAll('[data-testid=type-chip]')]
         .filter(c=>c.getAttribute('aria-pressed')==='true').map(c=>c.dataset.type).sort())()`,
    );
    ok('[7b] 深链还原后火/水两个芯片都是选中态', JSON.stringify(deepPressed) === '["fire","water"]', deepPressed);

    const deepSorted = await b.ev(
      `(()=>[...document.querySelectorAll('[data-testid=result-card] [data-testid=card-foot]')]
         .map(e=>{const m=e.textContent.match(/(\\d+)\\s*$/);return m?Number(m[1]):null;}))()`,
    );
    ok(
      '[7b] 深链还原后确实按种族值降序',
      deepSorted.length > 1 && deepSorted.every((v, i) => i === 0 || deepSorted[i - 1] >= v),
      deepSorted.slice(0, 5),
    );

    const deepGen1 = await b.ev(
      `(()=>{const n=[...document.querySelectorAll('[data-testid=result-card]')].map(c=>Number(c.dataset.pokemonId));
        return n.length>0 && n.every(id=>id<=151);})()`,
    );
    ok('[7b] 深链还原后只剩第一世代（编号全 ≤151）', deepGen1 === true, deepGen1);

    /* ---------------------- [8] 移动端 ---------------------- */
    await b.setViewport(390, 844);
    await sleep(900);
    const overflow = await b.ev(`document.documentElement.scrollWidth - window.innerWidth`);
    ok('[8] 移动端无横向溢出', overflow <= 1, overflow);
    const cols = await b.ev(
      `(()=>{const g=document.querySelector('[data-testid=result-grid]');
        return g?getComputedStyle(g).gridTemplateColumns.split(' ').length:0;})()`,
    );
    ok('[8] 移动端网格至少 2 列', cols >= 2, cols);
    const chipOk = await b.ev(`document.querySelectorAll('[data-testid=type-chip]').length===18`);
    ok('[8] 移动端属性芯片仍齐全', chipOk === true, chipOk);
    await b.screenshot(path.join(SHOTS, 'p4-pokedex-mobile.png'));

    /* ---------------------- [9] 控制台 ---------------------- */
    ok('[9] 运行期无 JS 异常 / console.error', b.consoleErrors.length === 0, b.consoleErrors.slice(0, 3));

    /* --------------- [10] 接口不可用时必须说人话（排 [9] 之后） --------------- */
    /*
     * 顺序是刻意的：它**必须排在 [9] 之后**。
     * 为了让接口失败，下面主动掐断 /api/*，浏览器会把被拦的请求记成
     * `net::ERR_BLOCKED_BY_CLIENT` 的 console error —— 先跑 [9]，才不会被自己制造的
     * 噪声打成一个假失败。
     *
     * 这一段存在的理由：真实发生过「接口连不上 → 界面显示『共 0 只』→ 用户以为
     * 数据被删了」。所以断言口径是「失败时会不会谎报 0」和「能不能一键恢复」，
     * 不是「有没有一个 error 元素」。
     *
     * 反向验证：不掐断 /api/* 的话，「[10] 出现失败态」必定不成立。
     */
    await b.setViewport(1280, 900);
    await b.send('Network.enable');
    await b.send('Network.setBlockedURLs', { urls: ['*/api/*'] });
    // 用整页导航回到干净地址（不带前几段留下的筛选参数），结果数才是确定的 493
    await b.send('Page.navigate', { url: `${BASE}/pokedex` });
    await sleep(1600);

    const errText = await waitFor(
      b,
      `(()=>{const e=document.querySelector('[data-testid=error]');return e?e.textContent:'';})()`,
      9000,
    );
    ok('[10] 接口不可用时页面给出失败态', /无法连接本地数据服务/.test(errText || ''), errText);

    const countText = await b.ev(
      `(()=>{const t=document.querySelector('[data-testid=result-count]');return t?t.textContent:'';})()`,
    );
    ok(
      '[10] 失败态不谎报「共 0 只」',
      !/共\s*0\s*只/.test(countText) && /数据不可用/.test(countText),
      countText,
    );
    ok(
      '[10] 失败态给出「重试」按钮',
      (await b.ev(`!!document.querySelector('[data-testid=retry]')`)) === true,
    );
    await b.screenshot(path.join(SHOTS, 'p5-pokedex-error.png'));

    // 恢复网络 → 点重试必须真的把数据拉回来，否则「重试」只是个装饰
    await b.send('Network.setBlockedURLs', { urls: [] });
    await b.ev(CLICK('[data-testid=retry]'));
    const backTotal = await waitFor(b, `${TOTAL}===493 && ${TOTAL}`, 12000);
    ok('[10] 点「重试」后数据真的回来了（493 只）', backTotal === 493, backTotal);
    ok(
      '[10] 重试成功后失败态消失',
      (await b.ev(`!document.querySelector('[data-testid=error]')`)) === true,
    );
  } finally {
    b.close();
  }

  console.log(`[pokedex-check] ${pass} / ${pass + failures.length} 项通过`);
  if (failures.length) {
    console.error(`\n未通过 ${failures.length} 项：`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`[pokedex-check] 全部通过\n截图目录：${SHOTS}`);
}

main().catch((err) => {
  console.error('[pokedex-check] 执行失败:', err);
  process.exit(1);
});
