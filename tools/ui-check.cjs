/**
 * tools/ui-check.cjs
 * ---------------------------------------------------------------------------
 * 在真实浏览器里验证本站唯一的核心功能：
 *   点开宝可梦 → 看到它的属性 + 全部进化分支（含分支路线、条件、跳转）。
 *
 * 跑之前先起服务：npm run dev（或 npm start）
 * 然后：node tools/ui-check.cjs
 *
 * 断言口径对准用户目的，而不是对准实现：
 *   ✓ 首页能看到 10 只；立绘真的加载出来了（naturalWidth > 0，不是碎图）
 *   ✓ 点妙蛙种子能看到「草/毒」两个属性和 3 个形态
 *   ✓ 点伊布能看到 9 个形态、8 条分支，每条分支都有进化条件文字
 *   ✓ 点分支上的形态能切过去，并能返回
 *   ✓ 窄屏不出现横向滚动条
 */
const path = require('path');
const fs = require('fs');
const { launch, sleep } = require('./cdp-lib.cjs');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000/';
const SHOTS = path.join(__dirname, '..', 'shots');
const PORT = 9311;

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? '  ✓' : '  ✗'} ${name}${detail ? `  [${detail}]` : ''}`);
}

const cardById = (id) => `[data-testid="pokemon-card"][data-pokemon-id="${id}"]`;
const evoById = (id) => `[data-testid="evo-node"][data-pokemon-id="${id}"]`;

const COUNT = {
  cards: `document.querySelectorAll('[data-testid="pokemon-card"]').length`,
  evoNodes: `document.querySelectorAll('[data-testid="evo-node"]').length`,
  evoConditions: `document.querySelectorAll('[data-testid="evo-condition"]').length`,
  typeBadges: `document.querySelectorAll('[data-testid="detail"] [data-testid="type-badge"]').length`,
  typeLabels: `[...document.querySelectorAll('[data-testid="detail"] [data-testid="type-badge"]')].map(e=>e.textContent.trim()).join('/')`,
  title: `(document.querySelector('#pokemon-detail-title')||{}).textContent||''`,
  dialog: `!!document.querySelector('[role="dialog"]')`,
  overflow: `document.documentElement.scrollWidth - document.documentElement.clientWidth`,
  gridCols: `getComputedStyle(document.querySelector('[data-testid="grid"]')).gridTemplateColumns.split(' ').filter(Boolean).length`,
  spritesOk: `[...document.querySelectorAll('[data-testid="pokemon-card"] img')].every(i=>i.complete&&i.naturalWidth>0)`,
  statTotal: `(document.querySelector('[data-testid="stat-total"] strong')||{}).textContent||''`,
  hasBack: `!!document.querySelector('[data-testid="back"]')`,
  bodyLocked: `document.body.dataset.scrollLocked === 'true'`,
  cardFooter: (id) =>
    `((document.querySelector('[data-testid="pokemon-card"][data-pokemon-id="${id}"] [data-testid="card-foot"]')||{}).textContent||'').replace(/\\s+/g,' ')`,
};

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const b = await launch({ port: PORT, url: BASE, windowSize: '1440,960' });
  // 显式指定视口：命令行 --window-size 给的是外框尺寸，实际内容区会小一截，不指定就测不准
  await b.setViewport(1280, 860);

  /* ------------------------------- 桌面端 ------------------------------- */
  console.log('\n[1] 桌面端 · 首屏');
  check('首页渲染出 10 个宝可梦按钮', (await b.ev(COUNT.cards)) === 10, String(await b.ev(COUNT.cards)));
  check('10 张立绘全部真实加载（非碎图/占位）', (await b.ev(COUNT.spritesOk)) === true);
  check('无横向溢出', (await b.ev(COUNT.overflow)) <= 1, `${await b.ev(COUNT.overflow)}px`);
  // 卡片上的路线数必须等于真实末梢条数，不能算成「岔口数-1」这种没意义的数
  const eeveeFoot = await b.ev(COUNT.cardFooter(133));
  check('伊布卡片标「8 条路线」（不是 7）', eeveeFoot.includes('8 条路线'), eeveeFoot);
  const bulbaFoot = await b.ev(COUNT.cardFooter(1));
  check('单线进化的妙蛙种子不标路线数', !bulbaFoot.includes('路线'), bulbaFoot);
  const oddishFoot = await b.ev(COUNT.cardFooter(43));
  check('走路草（真 2 分支）标「2 条路线」', oddishFoot.includes('2 条路线'), oddishFoot);
  await b.screenshot(path.join(SHOTS, '01-home-desktop.png'));

  /*
   * 悬停反馈必须用「几何」来验，不能读 transform 字符串：
   * Tailwind v4 的 hover:-translate-y-* / scale-* 落到的是独立的 translate / scale
   * 属性，不再是 transform 矩阵。只读 transform 会永远读到 none，看着像没问题、
   * 实际悬停反馈可能已经丢了。
   */
  console.log('\n[1b] 悬停反馈 · 卡片抬起 + 立绘放大');
  const hovProbe = `(() => {
    const c = document.querySelectorAll('[data-testid="pokemon-card"]')[0];
    const r = c.getBoundingClientRect();
    const s = c.querySelector('span:nth-child(2) img').getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, top: r.top, spriteW: s.width };
  })()`;
  const hov0 = await b.ev(hovProbe);
  await sleep(300);
  await b.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: hov0.cx,
    y: hov0.cy,
    buttons: 0,
  });
  await sleep(800);
  const hov1 = await b.ev(hovProbe);
  const lift = hov0.top - hov1.top;
  check(
    '悬停时卡片向上抬起（≈3px）',
    lift >= 2 && lift <= 5,
    `top ${hov0.top.toFixed(1)} → ${hov1.top.toFixed(1)}，抬起 ${lift.toFixed(1)}px`,
  );
  const zoom = hov1.spriteW / hov0.spriteW;
  check(
    '悬停时立绘放大（≈×1.045）',
    zoom >= 1.02 && zoom <= 1.08,
    `宽 ${hov0.spriteW.toFixed(1)} → ${hov1.spriteW.toFixed(1)}，倍率 ${zoom.toFixed(3)}`,
  );
  // 把鼠标挪开，避免影响后面的截图与弹窗点击
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2, buttons: 0 });
  await sleep(400);
  await b.ev('window.scrollTo(0, 0)');
  await sleep(200);

  /* ------------------------- 单线进化：妙蛙种子 ------------------------- */
  console.log('\n[2] 单线进化 · 妙蛙种子 #1');
  await b.click(cardById(1));
  check('弹窗已打开', (await b.ev(COUNT.dialog)) === true);
  check('标题是妙蛙种子', (await b.ev(COUNT.title)) === '妙蛙种子', await b.ev(COUNT.title));
  check('显示 2 个属性（草 / 毒）', (await b.ev(COUNT.typeBadges)) === 2, await b.ev(COUNT.typeLabels));
  check('进化线上有 3 个形态', (await b.ev(COUNT.evoNodes)) === 3, String(await b.ev(COUNT.evoNodes)));
  check('每条进化都带条件文字', (await b.ev(COUNT.evoConditions)) === 2, String(await b.ev(COUNT.evoConditions)));
  check('种族值总和 318', (await b.ev(COUNT.statTotal)) === '318', await b.ev(COUNT.statTotal));
  check('打开弹窗后页面滚动被锁', (await b.ev(COUNT.bodyLocked)) === true);
  // 核心诉求是"点开就能看到进化"，所以必须要求进化区不用滚动就在视口内
  const evoVisible = await b.ev(`(()=>{
    const evo=document.querySelector('[data-testid="evolution"]');
    const panel=document.querySelector('[role="dialog"]');
    if(!evo||!panel) return null;
    const e=evo.getBoundingClientRect(), p=panel.getBoundingClientRect();
    return { top:Math.round(e.top), bottom:Math.round(e.bottom), panelBottom:Math.round(p.bottom),
             fullyVisible: e.bottom <= p.bottom + 1 };
  })()`);
  check(
    '打开即能看到完整进化区（无需滚动）',
    evoVisible && evoVisible.fullyVisible === true,
    evoVisible ? `进化区底部 ${evoVisible.bottom} / 面板底部 ${evoVisible.panelBottom}` : 'n/a',
  );
  await b.screenshot(path.join(SHOTS, '02-detail-bulbasaur.png'));

  console.log('\n[3] 关闭');
  await b.pressKey('Escape', 'Escape', 27);
  check('Esc 能关闭弹窗', (await b.ev(COUNT.dialog)) === false);
  check('关闭后恢复页面滚动', (await b.ev(COUNT.bodyLocked)) === false);

  /* --------------------------- 分支进化：伊布 --------------------------- */
  console.log('\n[4] 分支进化 · 伊布 #133');
  await b.click(cardById(133));
  check('标题是伊布', (await b.ev(COUNT.title)) === '伊布', await b.ev(COUNT.title));
  check('进化线上有 9 个形态（1 + 8 分支）', (await b.ev(COUNT.evoNodes)) === 9, String(await b.ev(COUNT.evoNodes)));
  check('8 条分支各自标了进化条件', (await b.ev(COUNT.evoConditions)) === 8, String(await b.ev(COUNT.evoConditions)));
  await b.screenshot(path.join(SHOTS, '03-detail-eevee-branch.png'));

  // 伊布 9 个形态必然撑高，只要求"进化区标题 + 第一个节点"不用滚动就能看见
  const evoTop = await b.ev(`(()=>{
    const root=document.querySelector('[data-testid="evolution"] [data-testid="evo-node"]');
    if(!root) return null;
    const r=root.getBoundingClientRect();
    return { top:Math.round(r.top), vh:window.innerHeight };
  })()`);
  check(
    '分支最多的伊布，打开即能看到进化树首个节点',
    evoTop && evoTop.top < evoTop.vh,
    evoTop ? `节点顶部 ${evoTop.top} / 视口高 ${evoTop.vh}` : 'n/a',
  );

  const condTexts = await b.ev(
    `[...document.querySelectorAll('[data-testid="evo-condition"]')].map(e=>e.textContent.trim())`,
  );
  check(
    '分支条件里出现「使用「水之石」」这类具体条件',
    Array.isArray(condTexts) && condTexts.some((t) => t.includes('水之石')),
    condTexts ? condTexts.slice(0, 3).join(' | ') : 'n/a',
  );
  check(
    '分支条件里出现「妖精属性招式」（多语言字段正确）',
    Array.isArray(condTexts) && condTexts.some((t) => t.includes('妖精属性招式')),
    '',
  );

  console.log('\n[5] 进化树内跳转');
  await b.click(evoById(134));
  check('点分支节点切到水伊布', (await b.ev(COUNT.title)) === '水伊布', await b.ev(COUNT.title));
  check('出现「返回上一只」', (await b.ev(COUNT.hasBack)) === true);
  check('水伊布这条线仍是 9 个形态', (await b.ev(COUNT.evoNodes)) === 9);
  await b.screenshot(path.join(SHOTS, '04-detail-vaporeon.png'));

  await b.click('[data-testid="back"]');
  check('返回后回到伊布', (await b.ev(COUNT.title)) === '伊布', await b.ev(COUNT.title));
  check('返回后不再显示返回按钮', (await b.ev(COUNT.hasBack)) === false);

  await b.pressKey('Escape', 'Escape', 27);
  check('弹窗已关闭', (await b.ev(COUNT.dialog)) === false);

  /* ---------------------------- 分支最多的验证 --------------------------- */
  console.log('\n[6] 三叉分支 · 无畏小子 #236');
  await b.click(cardById(236));
  check('标题是无畏小子', (await b.ev(COUNT.title)) === '无畏小子', await b.ev(COUNT.title));
  check('4 个形态（无畏小子 + 3 分支）', (await b.ev(COUNT.evoNodes)) === 4, String(await b.ev(COUNT.evoNodes)));
  await b.pressKey('Escape', 'Escape', 27);

  /* ------------------------------- 移动端 ------------------------------- */
  console.log('\n[7] 移动端 390×844');
  await b.setViewport(390, 844);
  check('移动端无横向溢出', (await b.ev(COUNT.overflow)) <= 1, `${await b.ev(COUNT.overflow)}px`);
  check('网格至少 2 列', (await b.ev(COUNT.gridCols)) >= 2, String(await b.ev(COUNT.gridCols)));
  await b.screenshot(path.join(SHOTS, '05-home-mobile.png'));

  const widthOnMobile = await b.ev(
    `(()=>{const c=document.querySelector('[data-testid="pokemon-card"]');const r=c.getBoundingClientRect();return Math.round(r.width);})()`,
  );
  check('卡片宽度合理（>=148px）', widthOnMobile >= 148, `${widthOnMobile}px`);

  await b.click(cardById(133));
  check('移动端也能打开弹窗', (await b.ev(COUNT.dialog)) === true);
  const panelW = await b.ev(
    `(()=>{const d=document.querySelector('[role="dialog"]');return Math.round(d.getBoundingClientRect().width);})()`,
  );
  check('弹窗宽度不超出视口', panelW <= 391, `${panelW}px`);
  await b.screenshot(path.join(SHOTS, '06-detail-mobile.png'));

  console.log('\n[8] 控制台异常');
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
