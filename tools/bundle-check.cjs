/**
 * tools/bundle-check.cjs
 * ---------------------------------------------------------------------------
 * 「客户端零数据」这条硬约束的**机器门禁**。
 *
 * 为什么需要它：客户端组件一旦从 lib/pokedex.ts 这类服务端模块 import 任何东西
 * （哪怕只是一个常量），Turbopack 就会把整个 data/pokedex.json 一起打进浏览器 JS。
 * 这个失败模式**不报错、不警告**，只是包悄悄变大 —— 靠人看代码看不出来。
 *
 * 实测抓到的案例：`components/StatBars.tsx` 从 '@/lib/pokedex' import 了
 * STAT_LABELS，编译出的客户端分块里能数出 431 次 `cryUrl`（= 431 只全在里面），
 * 单块 569 KB。修法是把这个常量搬进 lib/statMeta.ts（客户端安全模块）。
 *
 * 判据：
 *   1. 任何一只宝可梦的图鉴描述文本都**不许**出现在 .next/static 的 JS 里
 *      —— 这些句子只存在于数据文件里，出现即泄漏；
 *   2. 反向验证：必须能在同一个目录里找到一条**确定属于客户端**的字符串，
 *      否则「一个都没扫到」也会假通过（目录写错、构建没产物）。
 *
 * 用法：node tools/bundle-check.cjs      （需先 npm run build）
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const chunksDir = path.join(root, '.next', 'static');

/* ---------------------------- 1. 收集探针 ---------------------------- */

const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'pokedex.json'), 'utf8'));
const pokemon = Object.values(data.pokemon);

/** 图鉴描述取前 12 个字符做探针：整句更长，命中前缀就足够判定 */
const needles = [];
for (const p of pokemon) {
  const text = String(p.flavorZh || '').replace(/[\s\u3000]/g, '');
  if (text.length >= 12) needles.push(text.slice(0, 12));
}
const uniqNeedles = [...new Set(needles)];

/** 反向验证用的探针：这几串只在客户端组件里出现 */
const CLIENT_PROBES = ['种族值总和', '输入宝可梦名字或编号', '图鉴首页'];

/* ---------------------------- 2. 扫产物 ---------------------------- */

if (!fs.existsSync(chunksDir)) {
  console.error('[bundle-check] 找不到 .next/static —— 先跑 npm run build');
  process.exit(1);
}

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.js$/.test(e.name)) files.push(p);
  }
})(chunksDir);

if (files.length === 0) {
  console.error('[bundle-check] .next/static 下一个 .js 都没有 —— 构建产物不完整');
  process.exit(1);
}

const sources = files.map((f) => ({ file: path.relative(root, f), text: fs.readFileSync(f, 'utf8') }));
const totalBytes = sources.reduce((n, s) => n + Buffer.byteLength(s.text), 0);
const flatAll = sources.map((s) => s.text).join('\n');

/* ---------------------------- 3. 判定 ---------------------------- */

let fail = 0;

// 3a. 泄漏：任何一只的图鉴描述都不该在客户端 JS 里
const leaked = uniqNeedles.filter((n) => flatAll.includes(n));
console.log(`[bundle-check] 客户端 JS 共 ${sources.length} 个文件 / ${(totalBytes / 1024).toFixed(0)} KB`);
console.log(`[bundle-check] 图鉴描述探针 ${uniqNeedles.length} 条（来自 ${pokemon.length} 只）`);
if (leaked.length) {
  fail++;
  console.log(`\n  [FAIL] 客户端包里出现了 ${leaked.length} 条图鉴描述 —— 服务端数据泄漏到浏览器`);
  for (const n of leaked.slice(0, 5)) {
    const hit = sources.find((s) => s.text.includes(n));
    console.log(`     - 「${n}…」出现在 ${hit.file}`);
  }
  console.log('     修法：把客户端组件引用的那个常量搬到客户端安全模块（如 lib/statMeta.ts），');
  console.log('           不要从 lib/pokedex.ts / lib/pokedex-query.ts / lib/db.ts 引任何东西。');
} else {
  console.log('  [ok] 客户端包里没有任何图鉴描述文本（服务端数据没有泄漏）');
}

// 3b. 反向验证：探针必须真的扫到了客户端代码，否则「全绿」可能只是没扫到东西
const probeHits = CLIENT_PROBES.filter((p) => flatAll.includes(p));
if (probeHits.length === 0) {
  fail++;
  console.log('\n  [FAIL] 反向验证失败：连一条确定的客户端字符串都没扫到');
  console.log('     说明扫的目录/产物不对，上面的「没有泄漏」不可信。');
} else {
  console.log(`  [ok] 反向验证：扫到 ${probeHits.length}/${CLIENT_PROBES.length} 条确定的客户端字符串`);
}

// 3c. 体积提示（不判定，只记录，方便看趋势）
const biggest = sources.slice().sort((a, b) => b.text.length - a.text.length)[0];
console.log(`  [info] 最大的分块：${biggest.file} (${(Buffer.byteLength(biggest.text) / 1024).toFixed(0)} KB)`);

console.log(fail ? `\n[bundle-check] 未通过 ${fail} 项` : '\n[bundle-check] 全部通过');
process.exit(fail ? 1 : 0);
