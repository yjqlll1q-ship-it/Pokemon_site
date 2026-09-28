/**
 * tools/pixel-shift-map.cjs
 * ---------------------------------------------------------------------------
 * 当 pixel-diff 报出「有差异」时，用它回答下一个问题：**差在哪、是哪一类差异**。
 *
 * 为什么需要它：pixel-diff 只给「多少个像素超阈 + 一张红点图」。但「1px 亚像素
 * 取整」和「真的掉了边框/改了颜色」在红点图上长得几乎一样，靠肉眼判断会得出
 * 错误结论。这个工具把整屏切成瓦片，对每块求出「能让差异最小化的整数位移」：
 *
 *   - 若某个非零位移能把残差压到接近 0 → 该块是**纯平移**（栅格化取整，非样式回归）
 *   - 若最佳位移仍是 (0,0) 且残差大 → 颜色/尺寸/描边真的变了 → 需要修
 *
 * 实测用途（CSS Modules → Tailwind 改造）：把 0.31% 的整屏差异定位到「伊布立绘
 * 自身的 img 框内、按 1px 垂直补偿后残差 0.004/255」，从而判定为非视觉回归。
 *
 * 用法: node tools/pixel-shift-map.cjs <a.png> <b.png> [瓦片=32] [步长=16] [阈值=3]
 * 退出码：恒为 0（这是诊断工具，判定留给报告）
 */
const fs = require('fs');
const http = require('http');
const { launch } = require('./cdp-lib.cjs');

const PORT = Number(process.env.SM_CDP_PORT || 9381);
const SRV = Number(process.env.SM_SRV_PORT || 9380);

const JOB = (a, b, TS, ST, TH) => `(async () => {
  const load = (src) => new Promise((res, rej) => {
    const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src;
  });
  const [A, B] = await Promise.all([load(${JSON.stringify(a)}), load(${JSON.stringify(b)})]);
  const W = A.width, H = A.height;
  const grab = (im) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0);
    return g.getImageData(0, 0, W, H).data;
  };
  const da = grab(A), db = grab(B);
  const TS = ${TS}, ST = ${ST}, TH = ${TH};
  const shifts = [[0,0],[0,-1],[0,1],[-1,0],[1,0],[1,-1],[-1,-1]];
  const idx = (x, y) => (y * W + x) * 4;
  const tiles = [];
  for (let ty = 0; ty + TS <= H; ty += ST) {
    for (let tx = 0; tx + TS <= W; tx += ST) {
      const res = [];
      for (const [dx, dy] of shifts) {
        let s = 0, n = 0;
        for (let y = ty + 2; y < ty + TS - 2; y++) {
          for (let x = tx + 2; x < tx + TS - 2; x++) {
            const px = x + dx, py = y + dy;
            if (px < 0 || py < 0 || px >= W || py >= H) { s += 300; n++; continue; }
            const i = idx(x, y), j = idx(px, py);
            s += Math.abs(da[i]-db[j]) + Math.abs(da[i+1]-db[j+1]) + Math.abs(da[i+2]-db[j+2]);
            n++;
          }
        }
        res.push({ dx, dy, m: s / n / 3 });
      }
      res.sort((p, q) => p.m - q.m);
      if (res[0].m > TH) tiles.push({ tx, ty, best: res[0], base: res.find((r) => r.dx === 0 && r.dy === 0), second: res[1] });
    }
  }
  tiles.sort((p, q) => q.base.m - p.base.m);
  return { W, H, total: tiles.length, tiles: tiles.slice(0, 60).map((t) => ({
    x: t.tx, y: t.ty,
    base: Math.round(t.base.m * 100) / 100,
    best: t.best.dx + ',' + t.best.dy,
    bestM: Math.round(t.best.m * 100) / 100,
    second: t.second.dx + ',' + t.second.dy,
    secondM: Math.round(t.second.m * 100) / 100,
  })) };
})()`;

function serve(files) {
  const srv = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/p.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('<!doctype html><meta charset="utf-8"><body></body>'); return;
    }
    const hit = files.find((f) => req.url === '/' + f.name);
    if (!hit) { res.writeHead(404).end('no'); return; }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(hit.file));
  });
  return new Promise((r) => srv.listen(SRV, '127.0.0.1', () => r(srv)));
}

async function main() {
  const [aPng, bPng, ts, st, th] = process.argv.slice(2);
  if (!aPng || !bPng) {
    console.error('用法: node tools/pixel-shift-map.cjs <a.png> <b.png> [瓦片=32] [步长=16] [阈值=3]');
    process.exit(2);
  }
  const srv = await serve([{ name: 'a.png', file: aPng }, { name: 'b.png', file: bPng }]);
  let br;
  try {
    br = await launch({ port: PORT, url: `http://127.0.0.1:${SRV}/p.html`, windowSize: '600,400' });
    const r = await br.ev(JOB(`http://127.0.0.1:${SRV}/a.png`, `http://127.0.0.1:${SRV}/b.png`, Number(ts || 32), Number(st || 16), Number(th || 3)));
    const pad = (s, n) => String(s).padEnd(n);
    console.log(`画布 ${r.W}x${r.H}  超阈瓦片 ${r.total} 个（按原始位置差异降序，最多列 60）`);
    console.log(pad('瓦片(x,y)', 14) + pad('原位置差', 10) + pad('最佳位移', 10) + pad('最佳残差', 10) + pad('次佳位移', 10) + '次佳残差');
    let pure = 0;
    for (const t of r.tiles) {
      const isPure = t.best !== '0,0' && t.bestM < t.base * 0.2;
      if (isPure) pure++;
      console.log(pad(`(${t.x},${t.y})`, 14) + pad(t.base, 10) + pad(t.best, 10) + pad(t.bestM, 10) + pad(t.second, 10) + t.secondM + (isPure ? '   <== 纯平移' : ''));
    }
    console.log(`其中「纯平移」瓦片 ${pure} 个；纯平移 = 该块差异可被整数位移消掉，属于栅格化取整，不是样式回归`);
  } finally { if (br) br.close(); srv.close(); }
}
main().catch((e) => { console.error(e); process.exit(2); });
