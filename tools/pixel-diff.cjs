/**
 * tools/pixel-diff.cjs
 * ---------------------------------------------------------------------------
 * 逐像素比对两张截图，作为「视觉零回归」的最终兜底证据。
 *
 * 为什么还要它：计算样式快照（style-snapshot）只覆盖预先挑好的元素和属性，
 * 挑漏的东西（某条边框、某个 scale/translate、圆角形状差异）看不出来。
 * 截图比对不挑，整屏每个像素都算。
 *
 * 实现上的一个坑：不要把 PNG 转成 base64 塞进 CDP 的求值表达式 —— 图一大会
 * 被截断/抛异常，而且报错形式很误导（返回对象字段全是 undefined）。
 * 这里改成脚本自己起一个极小的静态服务把图喂给浏览器，表达式里只留 URL。
 *
 * 用法：node tools/pixel-diff.cjs <before.png> <after.png> [diff输出.png] [容差0-255]
 * 退出码：0 = 通过；1 = 有超阈差异；2 = 脚本异常
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { launch } = require('./cdp-lib.cjs');

const PORT = 9333;
const SRV_PORT = 9334;
const TOL = Number(process.argv[5] || 8);
// 超阈像素占比上限（万分之一，足够严）
const MAX_RATIO = Number(process.env.PIXEL_MAX_RATIO || 0.0001);

const JOB = (urlA, urlB, tol) => `(async () => {
  const load = (src) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('图片解码失败: ' + src));
    im.src = src;
  });
  const [A, B] = await Promise.all([load(${JSON.stringify(urlA)}), load(${JSON.stringify(urlB)})]);
  if (A.width !== B.width || A.height !== B.height) {
    return { sizeMismatch: true, aw: A.width, ah: A.height, bw: B.width, bh: B.height };
  }
  const w = A.width, h = A.height;
  const grab = (im) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0);
    return g.getImageData(0, 0, w, h).data;
  };
  const da = grab(A), db = grab(B);
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const og = out.getContext('2d');
  const od = og.createImageData(w, h);
  let diffPx = 0, maxDelta = 0;
  const hist = {};
  /*
   * 除了「差多少」，还要能回答「差在哪」。
   * 只报一个百分比时，0.3% 既可能是无害的图片重采样，也可能是某个角标整体消失。
   * 这里同时收集差异的包围盒与行带直方图（每 40px 一带），
   * 用来判断变化是不是集中在预期的那块区域（例如新加的一段文字）。
   */
  let minX = w, minY = h, maxX = -1, maxY = -1;
  const bands = {};
  for (let i = 0; i < da.length; i += 4) {
    const dr = Math.abs(da[i] - db[i]);
    const dg = Math.abs(da[i + 1] - db[i + 1]);
    const dbl = Math.abs(da[i + 2] - db[i + 2]);
    const dA = Math.abs(da[i + 3] - db[i + 3]);
    const d = Math.max(dr, dg, dbl, dA);
    if (d > maxDelta) maxDelta = d;
    if (d > ${tol}) {
      diffPx++;
      const px = (i >> 2) % w;
      const py = ((i >> 2) / w) | 0;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      const band = ((py / 40) | 0) * 40;
      bands[band] = (bands[band] || 0) + 1;
      const bucket = d <= 16 ? '9-16' : d <= 48 ? '17-48' : d <= 128 ? '49-128' : '129-255';
      hist[bucket] = (hist[bucket] || 0) + 1;
      od.data[i] = 255; od.data[i + 1] = 0; od.data[i + 2] = 0; od.data[i + 3] = 255;
    } else {
      const g = Math.round((da[i] + da[i + 1] + da[i + 2]) / 3);
      od.data[i] = g; od.data[i + 1] = g; od.data[i + 2] = g; od.data[i + 3] = 40;
    }
  }
  og.putImageData(od, 0, 0);
  return {
    w, h, totalPx: w * h, diffPx, maxDelta, hist, bands,
    bbox: maxX < 0 ? null : [minX, minY, maxX, maxY],
    diffPng: out.toDataURL('image/png'),
  };
})()`;

/** 只服务一个空页面 + 两张图的最小静态服务。
 *  页面必须同源：跨域图片画到 canvas 上会污染画布，getImageData 直接抛 SecurityError。 */
function serve(pairs) {
  const srv = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/page.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('<!doctype html><meta charset="utf-8"><title>pixel-diff</title><body></body>');
      return;
    }
    const hit = pairs.find((p) => req.url === '/' + p.name);
    if (!hit) {
      res.writeHead(404).end('no');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(hit.file));
  });
  return new Promise((res) => srv.listen(SRV_PORT, '127.0.0.1', () => res(srv)));
}

async function main() {
  const beforePng = process.argv[2];
  const afterPng = process.argv[3];
  const outPng = process.argv[4];
  if (!beforePng || !afterPng) {
    console.error('用法: node tools/pixel-diff.cjs <before.png> <after.png> [diff.png] [tol]');
    process.exit(2);
  }
  if (!fs.existsSync(beforePng) || !fs.existsSync(afterPng)) {
    console.error('图不存在: ' + (!fs.existsSync(beforePng) ? beforePng : afterPng));
    process.exit(2);
  }

  const srv = await serve([
    { name: 'a.png', file: beforePng },
    { name: 'b.png', file: afterPng },
  ]);

  let b;
  try {
    b = await launch({ port: PORT, url: `http://127.0.0.1:${SRV_PORT}/page.html`, windowSize: '600,400' });
    const r = await b.ev(JOB(`http://127.0.0.1:${SRV_PORT}/a.png`, `http://127.0.0.1:${SRV_PORT}/b.png`, TOL));

    if (!r) {
      console.error('浏览器没有返回结果');
      process.exit(2);
    }
    if (r.error) {
      console.error('浏览器内异常: ' + r.error);
      process.exit(2);
    }
    if (r.sizeMismatch) {
      console.log(`${path.basename(beforePng)}: 尺寸不一致 ${r.aw}x${r.ah} vs ${r.bw}x${r.bh} → 判不通过`);
      process.exit(1);
    }

    const ratio = r.diffPx / r.totalPx;
    const pass = ratio <= MAX_RATIO;
    console.log(`${path.basename(beforePng)} vs ${path.basename(afterPng)}`);
    console.log(`  画布 ${r.w}x${r.h}  总像素 ${r.totalPx}`);
    console.log(`  超出容差(${TOL})的像素 ${r.diffPx}（${(ratio * 100).toFixed(4)}%）  最大通道差 ${r.maxDelta}`);
    console.log(`  差异强度分布 ${JSON.stringify(r.hist || {})}`);
    if (r.bbox) {
      const [x0, y0, x1, y1] = r.bbox;
      console.log(`  差异包围盒 x ${x0}–${x1} / y ${y0}–${y1}（宽 ${x1 - x0 + 1} 高 ${y1 - y0 + 1}）`);
      const bands = Object.entries(r.bands || {})
        .map(([k, v]) => [Number(k), v])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
      console.log(`  差异最集中的行带（y 起点: 像素数） ${bands.map(([y, v]) => `${y}:${v}`).join('  ')}`);
    } else {
      console.log('  差异包围盒 ——（无超阈像素）');
    }
    console.log(`  阈值 ${(MAX_RATIO * 100).toFixed(4)}%  →  ${pass ? '通过' : '不通过'}`);

    if (outPng && r.diffPng) {
      fs.writeFileSync(outPng, Buffer.from(String(r.diffPng).split(',')[1], 'base64'));
      console.log(`  差异图：${outPng}（红=超阈差异，灰=一致）`);
    }
    process.exit(pass ? 0 : 1);
  } finally {
    if (b) b.close();
    srv.close();
  }
}

main().catch((e) => {
  console.error('pixel-diff 异常:', e);
  process.exit(2);
});
