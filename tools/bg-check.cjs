/**
 * tools/bg-check.cjs
 * ---------------------------------------------------------------------------
 * 「自定义网页背景」的端到端验证（需先起服务）。
 *
 * 断言口径一律是「用户能不能做到」，不是「函数有没有被调用」：
 *   - 选一张本地图片 → 背景真的上屏了吗？
 *   - 刷新之后还在吗？
 *   - 不合格的文件（超大 / SVG / 伪装成 png 的文本 / 尺寸超限）被挡住了吗，
 *     而且**没有把上一张好图顶掉**？
 *   - 移除之后真的还原了吗？
 *
 * 测试图由脚本自己生成（Node 内置 zlib 手写 PNG），不依赖仓库里放二进制素材；
 * 想用真实照片再跑一遍，设 BG_TEST_IMAGE=<绝对路径>。
 *
 * 输出截图到 shots/bg-*.png。其中 bg-05-off.png 与 bg-04-on.png
 * 是一对（只差背景开关），配套跑：
 *   PIXEL_MAX_RATIO=0.5 node tools/pixel-diff.cjs shots/bg-05-off.png shots/bg-04-on.png shots/bg-diff.png 8
 * 退出码 0 表示「超过 50% 的像素变了」—— 即背景确实画到了屏幕上，
 * 而不是被 body 的纸色盖住（负 z-index 层最典型的失败模式）。
 * 注意这一对是**正向对照**：它「通过」的含义是差异足够大，与零回归的判定方向相反。
 *
 * 断言条数：常规 49 项；设了 BG_TEST_IMAGE 会多出 [10] 那一节，共 53 项。
 * 文件名按面板状态命名（bg-01-home-default / 02-panel-open / 03-rejected / 04-on /
 * 05-off / 06-real-photo / 07-mobile / 08-pokedex），改流程时记得同步改这段注释。
 *
 * 退出码：0 = 全部通过；1 = 有断言失败；2 = 脚本异常
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');
const { launch, sleep } = require('./cdp-lib.cjs');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const SHOTS = path.resolve(__dirname, '..', 'shots');
const FIX = path.join(os.tmpdir(), 'pokemon-bg-fixtures');
const CDP_PORT = Number(process.env.CDP_PORT || 9335);
const REAL_IMAGE = process.env.BG_TEST_IMAGE || '';

let passed = 0;
const failures = [];
function ok(label, cond, extra) {
  if (cond) {
    passed++;
    console.log('  ✓ ' + label);
  } else {
    failures.push(label + (extra === undefined ? '' : '  → ' + JSON.stringify(extra)));
    console.log('  ✗ ' + label + (extra === undefined ? '' : '  → ' + JSON.stringify(extra)));
  }
}

/* -------------------------------------------------------------------------- */
/* 手写 PNG：不引任何依赖，测试素材自给自足                                     */
/* -------------------------------------------------------------------------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
/** 把裸扫描线数据封成 PNG */
function buildPng(width, height, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** pixelFn(x,y) -> [r,g,b] */
function makePng(width, height, pixelFn) {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const p = pixelFn(x, y);
      raw[o++] = p[0] & 255;
      raw[o++] = p[1] & 255;
      raw[o++] = p[2] & 255;
    }
  }
  return buildPng(width, height, raw);
}

/**
 * 真随机像素的 PNG。
 *
 * 为什么不用自写 PRNG 生成「看起来随机」的像素：JS 里 `seed * 1103515245` 很快就
 * 超出 2^53，精度丢失后序列退化成短周期，deflate 一压就没了 —— 实测 2000×1200
 * 只压到 56 KB，根本够不到 5 MB 这条线，于是「超大文件应被拒绝」的用例会静默失效
 * （文件被当成合格图收下），失败信息还会指向别的地方。
 * crypto.randomBytes 是真随机，deflate 压不动。
 */
function makeNoisePng(width, height) {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  const noise = crypto.randomBytes(width * height * 3);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    noise.copy(raw, y * stride + 1, y * width * 3, (y + 1) * width * 3);
  }
  return buildPng(width, height, raw);
}

/** 一眼能认出是测试图的图：青-品红渐变 + 黑格线 */
const stripePixel = (x, y) => [
  (x * 255) / 2000,
  (y * 255) / 1200,
  Math.abs(((x + y) % 200) < 100 ? 220 : 40),
];

function ensureFixtures() {
  fs.mkdirSync(FIX, { recursive: true });
  const out = {};
  const put = (name, buf) => {
    const p = path.join(FIX, name);
    fs.writeFileSync(p, buf);
    out[name] = p;
    return p;
  };

  put('ok-2000x1200.png', makePng(2000, 1200, stripePixel));
  put('small-100x100.png', makePng(100, 100, stripePixel));
  put('wide-20000x1.png', makePng(20000, 1, stripePixel));

  // 超过 5 MB：真随机像素，deflate 压不动 → 落在 7 MB 上下
  const oversize = makeNoisePng(2000, 1200);
  if (oversize.length <= 5 * 1024 * 1024) {
    throw new Error('超限素材只生成到 ' + oversize.length + ' 字节，用例会失真');
  }
  put('oversize-2000x1200.png', oversize);

  // 伪装成 png 的文本
  fs.writeFileSync(path.join(FIX, 'fake.png'), '这不是图片，只是改了扩展名。');
  out['fake.png'] = path.join(FIX, 'fake.png');

  // SVG：唯一能内嵌脚本的图片格式，必须被明确拒绝
  fs.writeFileSync(
    path.join(FIX, 'vector.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>1</script></svg>',
  );
  out['vector.svg'] = path.join(FIX, 'vector.svg');

  return out;
}

/* -------------------------------------------------------------------------- */
/* 浏览器侧小工具                                                              */
/* -------------------------------------------------------------------------- */
async function waitFor(b, expr, timeout = 9000, interval = 120) {
  const t0 = Date.now();
  for (;;) {
    const v = await b.ev(expr);
    if (v) return v;
    if (Date.now() - t0 > timeout) return null;
    await sleep(interval);
  }
}

/** 把真实文件塞进 <input type=file>，走的是浏览器的正经路径（会触发 change） */
async function setFile(b, filePath) {
  await b.send('DOM.enable', {});
  const doc = await b.send('DOM.getDocument', { depth: 1 });
  const rootId = doc.result?.root?.nodeId;
  const q = await b.send('DOM.querySelector', { nodeId: rootId, selector: '[data-testid=bg-file]' });
  const nodeId = q.result?.nodeId;
  if (!nodeId) throw new Error('找不到背景文件输入框（面板可能没打开）');
  await b.send('DOM.setFileInputFiles', { files: [filePath], nodeId });
}

const Q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
const state = `(()=>{const l=${Q('[data-testid=bg-layer]')};return {active:document.body.dataset.siteBg||'',hasLayer:!!l,bg:l?getComputedStyle(l).backgroundImage.slice(0,5):''};})()`;

/**
 * 在页面里装一个「改受控控件值」的工具。
 *
 * **不能**直接 `el.value = '40'` 再 dispatch 事件：React 会给它接管的 input/select
 * 挂一个 value 拦截器（value tracker），直接赋值会被拦截器一并记成「值已经是 40」，
 * 事件冒到根节点时 React 判定「没变化」，onChange 根本不触发。
 * 症状是「测试拨了滑块，计算样式纹丝不动」，看起来像产品坏了 —— 实际是测试没走通。
 * 用原生 setter 绕过拦截器再补发 input/change，才等价于用户拖动。
 * （React 测试生态里 fireEvent.change 就是这么做的。）
 */
const SET_VAL = `window.__setVal=function(sel,v){var el=document.querySelector(sel);if(!el)return false;
  var proto=el.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype;
  var set=Object.getOwnPropertyDescriptor(proto,'value').set;set.call(el,String(v));
  el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
  return true;};1`;

/* -------------------------------------------------------------------------- */
/* 主流程                                                                      */
/* -------------------------------------------------------------------------- */
async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const fx = ensureFixtures();
  console.log('测试素材目录: ' + FIX);
  for (const [k, v] of Object.entries(fx)) {
    console.log(`  ${k.padEnd(24)} ${(fs.statSync(v).size / 1024).toFixed(1)} KB`);
  }

  const b = await launch({ port: CDP_PORT, url: BASE + '/', windowSize: '1440,960' });
  try {
    /* [0] 清场：保证可重复运行 ------------------------------------------- */
    await b.ev(
      `(async()=>{localStorage.clear();await new Promise(r=>{const d=indexedDB.deleteDatabase('pokemon-site');
        d.onsuccess=r;d.onerror=r;d.onblocked=r;});return 1;})()`,
    );
    await b.send('Page.navigate', { url: BASE + '/' });
    await waitFor(b, `document.readyState==='complete'`);
    await sleep(900);

    console.log('\n[1] 初始状态');
    const init = await b.ev(
      `(()=>{const t=${Q('[data-testid=bg-toggle]')};return {toggle:!!t,expanded:t?t.getAttribute('aria-expanded'):null,
        label:t?t.getAttribute('aria-label'):null,panel:!!${Q('[data-testid=bg-panel]')},
        layer:!!${Q('[data-testid=bg-layer]')},flag:document.body.dataset.siteBg||'',
        scrollW:document.documentElement.scrollWidth,innerW:window.innerWidth};})()`,
    );
    ok('[1] 右下角有背景开关', init.toggle === true, init);
    ok('[1] 默认收起（aria-expanded=false）', init.expanded === 'false', init.expanded);
    ok('[1] 开关有可读的无障碍名', init.label === '自定义网页背景', init.label);
    ok('[1] 未开启时没有背景层', init.layer === false && init.flag === 'off', init);
    ok('[1] 桌面端无横向溢出', init.scrollW <= init.innerW + 1, [init.scrollW, init.innerW]);
    await b.screenshot(path.join(SHOTS, 'bg-01-home-default.png'));

    console.log('\n[2] 面板开合');
    await b.click('[data-testid=bg-toggle]');
    ok('[2] 点开后出现面板', (await b.ev(`!!${Q('[data-testid=bg-panel]')}`)) === true);
    ok('[2] aria-expanded 变成 true', (await b.ev(`${Q('[data-testid=bg-toggle]')}.getAttribute('aria-expanded')`)) === 'true');
    ok(
      '[2] 未选图时给出格式与体积说明',
      String(await b.ev(`${Q('[data-testid=bg-empty]')}?.textContent||''`)).includes('5 MB'),
      await b.ev(`${Q('[data-testid=bg-empty]')}?.textContent||''`),
    );
    await b.screenshot(path.join(SHOTS, 'bg-02-panel-open.png'));
    await b.pressKey('Escape', 'Escape', 27);
    ok('[2] Esc 收起面板', (await b.ev(`!!${Q('[data-testid=bg-panel]')}`)) === false);

    /* 负向优先：被拒绝的文件绝不能让已有背景被顶掉 --------------------- */
    console.log('\n[3] 不合格的文件必须被挡住');
    const rejects = [
      { file: fx['oversize-2000x1200.png'], want: '超过', name: '超过 5 MB' },
      { file: fx['vector.svg'], want: 'SVG', name: 'SVG（可内嵌脚本）' },
      { file: fx['fake.png'], want: '无法解码', name: '伪装成 png 的文本' },
      { file: fx['wide-20000x1.png'], want: '单边', name: '单边超过 12000px' },
    ];
    for (const r of rejects) {
      await b.click('[data-testid=bg-toggle]');
      await setFile(b, r.file);
      const msg = await waitFor(b, `${Q('[data-testid=bg-error]')}?.textContent||''`);
      ok(`[3] ${r.name} 被拒绝且给出原因`, !!msg && msg.includes(r.want), msg);
      const st = await b.ev(state);
      ok(`[3] ${r.name} 没有污染已应用的背景`, st.hasLayer === false && st.active === 'off', st);
      await b.pressKey('Escape', 'Escape', 27);
    }
    await b.screenshot(path.join(SHOTS, 'bg-03-rejected.png'));

    console.log('\n[4] 低分辨率：能收下但要提醒');
    await b.click('[data-testid=bg-toggle]');
    await setFile(b, fx['small-100x100.png']);
    const warn = await waitFor(b, `${Q('[data-testid=bg-notice]')}?.textContent||''`);
    ok('[4] 宽度不足时给出提示', !!warn && warn.includes('低于建议'), warn);
    ok('[4] 同时真的应用了背景', (await b.ev(state)).hasLayer === true, await b.ev(state));
    await b.click('[data-testid=bg-remove]');
    await waitFor(b, `${Q('[data-testid=bg-layer]')}===null`);
    ok('[4] 移除后背景层消失', (await b.ev(state)).hasLayer === false);
    await b.pressKey('Escape', 'Escape', 27);

    /* 正向 ------------------------------------------------------------- */
    console.log('\n[5] 选一张合格图片');
    await b.click('[data-testid=bg-toggle]');
    await setFile(b, fx['ok-2000x1200.png']);
    const applied = await waitFor(b, `${Q('[data-testid=bg-meta-size]')}?.textContent||''`);
    ok('[5] 面板回显真实像素与体积', !!applied && applied.includes('2000×1200'), applied);
    ok('[5] 没有报错', (await b.ev(`!!${Q('[data-testid=bg-error]')}`)) === false);
    ok('[5] 没有宽度提醒（2000 ≥ 1920）', (await b.ev(`!!${Q('[data-testid=bg-notice]')}`)) === false);

    const st5 = await b.ev(state);
    ok('[5] body 打上 site-bg=on', st5.active === 'on', st5);
    ok('[5] 背景层用 blob: 图', st5.hasLayer === true && st5.bg === 'url("', st5);
    const layerCss = await b.ev(
      `(()=>{const l=${Q('[data-testid=bg-layer]')};const s=getComputedStyle(l);return {pos:s.position,
        op:s.opacity,size:s.backgroundSize,rep:s.backgroundRepeat,zi:s.zIndex,pe:s.pointerEvents};})()`,
    );
    ok('[5] 背景层铺满视口且不吃鼠标事件',
      layerCss.pos === 'fixed' && layerCss.pe === 'none', layerCss);
    ok('[5] 负 z-index 层（压不到正文）', Number(layerCss.zi) < 0, layerCss.zi);

    console.log('\n[6] 参数生效');
    await b.ev(SET_VAL);
    await b.ev(`window.__setVal('[data-testid=bg-fit]','contain')`);
    await sleep(300);
    ok('[6] 铺法切到 contain',
      (await b.ev(`getComputedStyle(${Q('[data-testid=bg-layer]')}).backgroundSize`)) === 'contain',
      await b.ev(`getComputedStyle(${Q('[data-testid=bg-layer]')}).backgroundSize`));

    await b.ev(`window.__setVal('[data-testid=bg-opacity]','40')`);
    await sleep(300);
    ok('[6] 不透明度 40% 真的落到计算值上',
      Math.abs(Number(await b.ev(`getComputedStyle(${Q('[data-testid=bg-layer]')}).opacity`)) - 0.4) < 0.02,
      await b.ev(`getComputedStyle(${Q('[data-testid=bg-layer]')}).opacity`));

    await b.ev(`window.__setVal('[data-testid=bg-blur]','8')`);
    await sleep(300);
    const blurCss = await b.ev(`getComputedStyle(${Q('[data-testid=bg-layer]')}).filter`);
    ok('[6] 模糊 8px 真的落到计算值上', String(blurCss).includes('blur(8px)'), blurCss);

    // 键盘路径：聚焦后按方向键，走的是浏览器原生默认行为，
    // 不经过上面注入的 setter —— 用它证明「真实用户操作」也通
    await b.ev(`window.__setVal('[data-testid=bg-blur]','0')`);
    await b.ev(`${Q('[data-testid=bg-blur]')}.focus()`);
    await sleep(250);
    const beforeKey = await b.ev(`${Q('[data-testid=bg-blur]')}.value`);
    await b.pressKey('ArrowRight', 'ArrowRight', 39);
    await sleep(350);
    const afterKey = await b.ev(
      `(()=>({v:${Q('[data-testid=bg-blur]')}.value,
        f:getComputedStyle(${Q('[data-testid=bg-layer]')}).filter}))()`,
    );
    ok('[6] 键盘方向键也能改模糊（真实交互路径）',
      afterKey && afterKey.v !== beforeKey && String(afterKey.f).includes('blur('),
      [beforeKey, afterKey]);

    // 换图失败不能把正在用的背景顶掉
    await setFile(b, fx['fake.png']);
    const stillErr = await waitFor(b, `${Q('[data-testid=bg-error]')}?.textContent||''`);
    const survived = await b.ev(
      `(()=>({meta:${Q('[data-testid=bg-meta-size]')}?.textContent||'',
        layer:!!${Q('[data-testid=bg-layer]')},flag:document.body.dataset.siteBg||''}))()`,
    );
    ok('[6] 换图失败时给出错误', !!stillErr && stillErr.includes('无法解码'), stillErr);
    ok('[6] 换图失败不顶掉现有背景',
      survived.layer === true && survived.flag === 'on' && survived.meta.includes('2000×1200'), survived);

    // 还原成默认观感，让截图好看也好比
    await b.ev(`(()=>{window.__setVal('[data-testid=bg-fit]','cover');
      window.__setVal('[data-testid=bg-opacity]','100');
      window.__setVal('[data-testid=bg-blur]','0');return 1;})()`);
    await sleep(400);
    ok('[6] 参数已还原到默认',
      (await b.ev(`getComputedStyle(${Q('[data-testid=bg-layer]')}).filter`)) === 'none',
      await b.ev(`getComputedStyle(${Q('[data-testid=bg-layer]')}).filter`));

    console.log('\n[7] 刷新之后还在吗');
    await b.send('Page.navigate', { url: BASE + '/pokedex' });
    await waitFor(b, `document.readyState==='complete'`);
    const afterReload = await waitFor(b, `${Q('[data-testid=bg-layer]')}?document.body.dataset.siteBg:null`);
    ok('[7] 换页面后背景仍在（读的是 IndexedDB）', afterReload === 'on', afterReload);
    await b.ev(`location.reload()`);
    await waitFor(b, `document.readyState==='complete'`);
    const hardReload = await waitFor(b, `${Q('[data-testid=bg-layer]')}?document.body.dataset.siteBg:null`);
    ok('[7] 硬刷新后背景仍在', hardReload === 'on', hardReload);
    await b.click('[data-testid=bg-toggle]');
    const restoredSize = await waitFor(b, `${Q('[data-testid=bg-meta-size]')}?.textContent||''`);
    ok('[7] 面板里也回显了上次那张图', !!restoredSize && restoredSize.includes('2000×1200'), restoredSize);
    await b.pressKey('Escape', 'Escape', 27);

    /* 截图对：只差背景开关 ---------------------------------------------- */
    console.log('\n[8] 产出 ON / OFF 截图对（供 pixel-diff 证明背景真的画上去了）');
    await b.send('Page.navigate', { url: BASE + '/' });
    await waitFor(b, `document.readyState==='complete'`);
    await waitFor(b, `${Q('[data-testid=bg-layer]')}?1:null`);
    await sleep(700);
    await b.screenshot(path.join(SHOTS, 'bg-04-on.png'));

    await b.click('[data-testid=bg-toggle]');
    await b.ev(`(()=>{const c=${Q('[data-testid=bg-enabled]')};c.click();return 1;})()`);
    await waitFor(b, `${Q('[data-testid=bg-layer]')}===null`);
    await b.pressKey('Escape', 'Escape', 27);
    await sleep(500);
    await b.screenshot(path.join(SHOTS, 'bg-05-off.png'));
    ok('[8] 关掉开关后背景层被移除', (await b.ev(state)).hasLayer === false);

    await b.click('[data-testid=bg-toggle]');
    await b.ev(`(()=>{const c=${Q('[data-testid=bg-enabled]')};c.click();return 1;})()`);
    await waitFor(b, `${Q('[data-testid=bg-layer]')}?1:null`);
    ok('[8] 再打开开关后恢复', (await b.ev(state)).active === 'on');
    await b.pressKey('Escape', 'Escape', 27);
    await sleep(500);

    console.log('\n[9] 移除背景要能干净还原');
    await b.click('[data-testid=bg-toggle]');
    await b.click('[data-testid=bg-remove]');
    await waitFor(b, `${Q('[data-testid=bg-layer]')}===null`);
    const afterRemove = await b.ev(
      `(()=>{const c=${Q('[data-testid=bg-enabled]')};return {layer:!!${Q('[data-testid=bg-layer]')},
        flag:document.body.dataset.siteBg||'',checked:c?c.checked:null,preview:!!${Q('[data-testid=bg-preview]')},
        empty:!!${Q('[data-testid=bg-empty]')}};})()`,
    );
    ok('[9] 层没了、开关回 off', afterRemove.layer === false && afterRemove.flag === 'off', afterRemove);
    ok('[9] 勾选框被复位', afterRemove.checked === false, afterRemove);
    ok('[9] 回到「未选图」的初始说明', afterRemove.empty === true && afterRemove.preview === false, afterRemove);
    const idbLeft = await b.ev(
      `(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('pokemon-site',1);
        q.onsuccess=()=>r(q.result);q.onerror=()=>r(null);});
        if(!db)return -1;const v=await new Promise(r=>{const t=db.transaction('background-image','readonly');
        const g=t.objectStore('background-image').get('current');g.onsuccess=()=>r(g.result);g.onerror=()=>r(null);});
        db.close();return v?1:0;})()`,
    );
    ok('[9] IndexedDB 里的图片也删掉了', idbLeft === 0, idbLeft);
    await b.pressKey('Escape', 'Escape', 27);

    /* 真图（可选） ------------------------------------------------------ */
    if (REAL_IMAGE) {
      console.log('\n[10] 用真实图片再跑一遍: ' + REAL_IMAGE);
      const size = fs.statSync(REAL_IMAGE).size;
      ok('[10] 真实图在 5 MB 以内', size <= 5 * 1024 * 1024, size);
      await b.click('[data-testid=bg-toggle]');
      await setFile(b, REAL_IMAGE);
      const meta = await waitFor(b, `${Q('[data-testid=bg-meta-size]')}?.textContent||''`, 12000);
      ok('[10] 真实图被接受并读出尺寸', !!meta && /\d+×\d+/.test(meta), meta);
      ok('[10] 真实图没有触发错误', (await b.ev(`!!${Q('[data-testid=bg-error]')}`)) === false);
      const realNotice = await b.ev(`${Q('[data-testid=bg-notice]')}?.textContent||''`);
      console.log('      （宽度提醒：' + (realNotice || '无') + '）');
      await b.pressKey('Escape', 'Escape', 27);
      await sleep(600);
      await b.screenshot(path.join(SHOTS, 'bg-06-real-photo.png'));
      const realState = await b.ev(state);
      ok('[10] 真实图真的上屏了', realState.active === 'on' && realState.hasLayer === true, realState);
    }

    /* 移动端 ------------------------------------------------------------ */
    console.log('\n[11] 移动端');
    await b.setViewport(390, 844);
    await sleep(600);
    const mob = await b.ev(
      `(()=>{const t=${Q('[data-testid=bg-toggle]')};const r=t.getBoundingClientRect();
        return {right:Math.round(r.right),bottom:Math.round(r.bottom),w:Math.round(r.width),h:Math.round(r.height),
          innerW:window.innerWidth,innerH:window.innerHeight,
          scrollW:document.documentElement.scrollWidth};})()`,
    );
    ok('[11] 开关完整落在视口内', mob.right <= mob.innerW && mob.bottom <= mob.innerH, mob);
    ok('[11] 触控目标够大（≥40px）', mob.h >= 40, mob.h);
    await b.click('[data-testid=bg-toggle]');
    const panelFit = await b.ev(
      `(()=>{const p=${Q('[data-testid=bg-panel]')};if(!p)return null;const r=p.getBoundingClientRect();
        return {left:Math.round(r.left),right:Math.round(r.right),innerW:window.innerWidth,
          scrollW:document.documentElement.scrollWidth};})()`,
    );
    ok('[11] 面板不超出屏幕左边', !!panelFit && panelFit.left >= 0, panelFit);
    ok('[11] 面板不造成横向溢出',
      !!panelFit && panelFit.right <= panelFit.innerW + 1 && panelFit.scrollW <= panelFit.innerW + 1, panelFit);
    await b.screenshot(path.join(SHOTS, 'bg-07-mobile.png'));
    await b.pressKey('Escape', 'Escape', 27);
    await b.setViewport(1440, 960);
    await sleep(500);

    /* 不能挡住页面本身的操作 -------------------------------------------- */
    console.log('\n[12] 浮动控件不能挡住页面操作');
    await b.send('Page.navigate', { url: BASE + '/pokedex' });
    await waitFor(b, `${Q('[data-testid=result-card]')}?1:null`);
    await sleep(700);
    const firstBefore = await b.ev(`${Q('[data-testid=result-card]')}.textContent`);
    await b.click('[data-testid=page-next]');
    const moved = await waitFor(
      b,
      `${Q('[data-testid=result-card]')}?.textContent!==${JSON.stringify(firstBefore)}?1:null`,
    );
    ok('[12] 分页按钮没被浮动控件挡住', moved === 1, firstBefore);
    await b.screenshot(path.join(SHOTS, 'bg-08-pokedex.png'));

    console.log('\n[13] 控制台');
    const errs = (b.consoleErrors || []).filter((e) => !/favicon/i.test(e));
    ok('[13] 全程没有控制台报错', errs.length === 0, errs.slice(0, 5));

    /* 收尾 -------------------------------------------------------------- */
    console.log(`\n[bg-check] ${passed} / ${passed + failures.length} 项通过`);
    if (failures.length) {
      console.log('未通过：');
      failures.forEach((f) => console.log('  - ' + f));
      process.exit(1);
    }
    return 0;
  } finally {
    b.close();
  }
}

main()
  .then((c) => process.exit(c || 0))
  .catch((e) => {
    console.error('bg-check 异常:', e);
    process.exit(2);
  });
