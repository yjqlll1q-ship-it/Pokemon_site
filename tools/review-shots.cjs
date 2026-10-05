/* 评审截图：一次性产出一组「给人看」的整屏截图，用于和参考图/上一轮对比校准。
   与 *-check.cjs 的区别：那些是断言门禁，本脚本只出图，不做判定。
   用法：node tools/review-shots.cjs            （服务需已在 3000 端口运行）
        node tools/review-shots.cjs --out shots  --port 3000
*/
const path = require('path');
const fs = require('fs');
const { launch, sleep } = require('./cdp-lib.cjs');

const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i > -1 ? process.argv[i + 1] : d;
};
const PORT = arg('port', '3000');
const OUT = path.resolve(arg('out', 'shots'));
const BASE = `http://127.0.0.1:${PORT}`;
const TAG = arg('tag', 'r2');
const DESKTOP = [1440, 900];
const MOBILE = [390, 844];

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const b = await launch({ port: 9377, url: BASE + '/', waitMs: 30000 });
  const made = [];
  const shot = async (name) => {
    await settleImages();
    const p = path.join(OUT, `${TAG}-${name}.png`);
    const ok = await b.screenshot(p);
    if (ok) made.push(p);
    return ok;
  };
  /**
   * 截图前等所有图片真的解码完。
   *
   * 不等的后果实测过：首页那张图在两次连拍之间会差 123 个像素
   * （包围盒 x1356–1396 / y100–131，正好是右面板顶部那个 48px 小立绘）——
   * `loading="lazy"` 的图片偶尔还没上屏就截了。截图不稳定会让「像素差」这类判据
   * 变成掷骰子，所以统一等一次。
   */
  const settleImages = async () => {
    for (let i = 0; i < 40; i++) {
      const pending = await b.ev(
        `[...document.images].filter((im) => !im.complete || im.naturalWidth === 0).length`,
      );
      if (pending === 0) return;
      await sleep(150);
    }
  };
  /** 整页截图：内容比视口高时（进化链宽树）用，避免被折叠线截断 */
  const shotFull = async (name) => {
    await settleImages();
    const m = await b.send('Page.getLayoutMetrics', {});
    const cs = m.result && m.result.cssContentSize;
    if (!cs) return shot(name);
    const r = await b.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: cs.width, height: Math.ceil(cs.height), scale: 1 },
    });
    const p = path.join(OUT, `${TAG}-${name}.png`);
    if (r.result && r.result.data) {
      fs.writeFileSync(p, Buffer.from(r.result.data, 'base64'));
      made.push(p);
      return true;
    }
    return false;
  };
  /**
   * 按「元素 + 外扩留白」截图。
   * 用于交付时突出单点改动：属性图标、宣传飘带这类小元素，
   * 整屏截图里只有几十像素，YJ 放大也看不清细节。
   * 外扩 pad 是为了让元素周围的上下文（标签底色、卡片边）一起进画面。
   */
  const shotEl = async (name, selector, pad = 12) => {
    await settleImages();
    const box = await b.ev(`(() => {
      const e = document.querySelector(${JSON.stringify(selector)});
      if (!e) return null;
      e.scrollIntoView({ block: 'center' });
      const r = e.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    })()`);
    if (!box) {
      console.log(`[review-shots] 跳过 ${name}：选择器落空 ${selector}`);
      return false;
    }
    await sleep(400);
    /* scrollIntoView 之后再量一次 —— 滚动会改变 rect，用滚动前的坐标会截到别处 */
    const after = await b.ev(`(() => {
      const e = document.querySelector(${JSON.stringify(selector)});
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    })()`);
    if (!after) return false;
    const clip = {
      x: Math.max(0, after.x - pad),
      y: Math.max(0, after.y - pad),
      width: after.w + pad * 2,
      height: after.h + pad * 2,
      scale: 2, // 2 倍缩放：小图标在 1x 下看不出笔画
    };
    const r = await b.send('Page.captureScreenshot', { format: 'png', clip });
    const p = path.join(OUT, `${TAG}-${name}.png`);
    if (r.result && r.result.data) {
      fs.writeFileSync(p, Buffer.from(r.result.data, 'base64'));
      made.push(p);
      return true;
    }
    return false;
  };
  const go = async (url, w, h) => {    await b.setViewport(w, h);
    await b.send('Page.navigate', { url });
    for (let t = 0; t < 60; t++) {
      const st = await b.ev('document.readyState');
      if (st === 'complete') break;
      await sleep(300);
    }
    await sleep(900);

    /*
     * 页面真的渲染出应用外壳才算就绪。
     *
     * 只看 readyState 会把「127.0.0.1 拒绝了我们的连接请求」这张 chrome 错误页
     * 当成加载成功 —— 实测踩过一次：服务被宿主回收之后，脚本照样拍满 12 张，
     * 还打印「产出 12 张 / 无控制台报错」，直到翻图才发现全是错误页。
     * 出评审截图是给人看的，拍到错误页比报错更糟 —— 报错至少知道要重跑。
     */
    const shell = await b.ev(`!!document.querySelector('[data-testid="app-rail"]')`);
    if (!shell) {
      throw new Error(
        `页面没有渲染出应用外壳（${url}）。最常见的原因：3000 端口的服务没在跑。`,
      );
    }
  };
  const clickTab = async (label) => {
    const ok = await b.ev(
      `(()=>{const l=[...document.querySelectorAll('[data-testid="tabbar"] button')];
        const t=l.find(e=>e.textContent.trim().includes(${JSON.stringify(label)}));
        if(!t)return false;t.click();return true;})()`,
    );
    await sleep(700);
    return ok;
  };
  /** 点某个形态（按 slug）；页面没有形态块时返回 false */
  const pickForm = async (slug) => {
    const ok = await b.ev(
      `(()=>{const t=document.querySelector('[data-testid="form-list"] [data-form-slug="' + ${JSON.stringify(slug)} + '"]');
        if(!t)return false;t.scrollIntoView({block:'center'});t.click();return true;})()`,
    );
    await sleep(800);
    return ok;
  };

  try {
    // 1. 首页（洛托姆，红）
    await go(BASE + '/', DESKTOP[0], DESKTOP[1]);
    await shot('01-home-lotom');

    // 2. 妙蛙种子（绿）——详情默认 Tab
    await go(BASE + '/pokemon/1', DESKTOP[0], DESKTOP[1]);
    await shot('02-detail-bulbasaur');

    // 3. 妙蛙种子 —— 进化链 Tab（宽树），整页截图
    if (await clickTab('进化')) await shotFull('03-bulbasaur-evolution');

    // 4. 耿鬼（紫）——验证外壳换色是否跟着走
    await go(BASE + '/pokemon/94', DESKTOP[0], DESKTOP[1]);
    await shot('04-detail-gengar');

    // 5. 伊布（棕）——分支进化
    await go(BASE + '/pokemon/133', DESKTOP[0], DESKTOP[1]);
    await shot('05-detail-eevee');
    if (await clickTab('进化')) await shotFull('06-eevee-evolution');

    // 6. 顶栏全局搜索下拉展开
    await go(BASE + '/pokemon/25', DESKTOP[0], DESKTOP[1]);
    const typed = await b.ev(
      `(()=>{const i=document.querySelector('[data-testid="global-search"]');
        if(!i)return false;i.focus();
        const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
        s.call(i,'伊布');i.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`,
    );
    if (typed) {
      await sleep(900);
      await shot('07-topbar-search');
    }

    // 7. 图鉴页
    await go(BASE + '/pokedex', DESKTOP[0], DESKTOP[1]);
    await shot('08-pokedex');

    // 8. 形态：有形态的（洛托姆 6 / 皮卡丘 17）与切换后的画面
    await go(BASE + '/pokemon/479', DESKTOP[0], DESKTOP[1]);
    if (await pickForm('rotom-heat')) await shot('11-rotom-form-heat');
    await go(BASE + '/pokemon/25', DESKTOP[0], DESKTOP[1]);
    await shot('12-pikachu-forms');

    // 9. 移动端
    await go(BASE + '/pokemon/25', MOBILE[0], MOBILE[1]);
    await shot('09-mobile-detail');
    await go(BASE + '/', MOBILE[0], MOBILE[1]);
    await shot('10-mobile-home');

    /*
     * 10. 单点特写（2 倍缩放）。
     * 本轮三处改动里有两条是「几十像素的小元素」—— 宣传飘带与属性图标。
     * 整屏截图 1440×900 下它们各占不到 2% 面积，YJ 放大也看不出笔画与配色，
     * 「截图驱动对齐」在这种尺寸上会失效。所以额外按元素框拍一组特写，
     * 让「图标长什么样、颜色对不对、飘带斜切够不够」能直接看图判断。
     */
    await go(BASE + '/pokemon/479', DESKTOP[0], DESKTOP[1]);
    await shotEl('13-el-ribbon', '[data-testid="side-intro"]', 10);
    await shotEl('14-el-type-badges', '[data-testid="type-row"]', 14);

    // 属性分类页：18 个属性图标同屏，这是「一眼看全 18 种图形」的唯一位置
    await go(BASE + '/pokedex', DESKTOP[0], DESKTOP[1]);
    /*
     * 「按属性」是 tab，**不在这一屏默认渲染**（默认是「列表」）。
     * 不点它，`[data-testid="type-gallery"]` 恒落空 —— 脚本只会打一行
     * 「跳过 15-…：选择器落空」，图少一张但不报错，很容易被当成拍过了。
     */
    await b.click('[data-testid="view-types"]');
    await sleep(1800);
    const galleryFamily = await b.ev(`document.querySelectorAll('[data-testid="type-card"]').length`);
    if (galleryFamily < 18) console.log(`[review-shots] 警告：属性分类页只渲染出 ${galleryFamily} 张卡片`);
    await shotEl('15-el-type-gallery', '[data-testid="type-gallery"]', 10);
    await shotEl('16-el-type-card', '[data-testid="type-card"]', 10);
    // 筛芯片：未选中（浅底主色图标）与选中（实心深底白图标）两种状态各拍一张
    await shotEl('17-el-type-chips', '[data-testid="type-chips"]', 12);
    await b.ev(
      `(() => { const c = document.querySelectorAll('[data-testid="type-chips"] [data-testid="type-chip"]'); c[5] && c[5].click(); return true; })()`,
    );
    await sleep(900);
    await shotEl('18-el-type-chips-on', '[data-testid="type-chips"]', 12);


    // 11. 地区图鉴（2026-10-05 加）
    await go(BASE + '/regions', DESKTOP[0], DESKTOP[1]);
    await shot('19-regions');
    await shotEl('20-el-region-card', '[data-testid="region-card"]', 10);
    await go(BASE + '/regions/4', DESKTOP[0], DESKTOP[1]);
    await shot('21-region-sinnoh');
    await go(BASE + '/pokemon/445', DESKTOP[0], DESKTOP[1]);
    await shot('22-detail-garchomp');

    console.log('[review-shots] 产出 ' + made.length + ' 张：');
    made.forEach((p) => console.log('  ' + path.relative(process.cwd(), p)));
    if (b.consoleErrors.length) {
      console.log('[review-shots] 页面控制台报错 ' + b.consoleErrors.length + ' 条：');
      b.consoleErrors.slice(0, 10).forEach((e) => console.log('  ' + e));
    } else {
      console.log('[review-shots] 无控制台报错。');
    }
  } finally {
    b.close();
    await sleep(400);
  }
}

main().catch((e) => {
  console.error('[review-shots] 失败：', e.message);
  process.exit(1);
});
