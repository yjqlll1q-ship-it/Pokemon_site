/**
 * check-data.mjs —— 数据体检：确认 data/pokedex.json 与 public/sprites 完整、可用。
 * 每次跑完 npm run data 后执行，或接到 CI 里当守门员。
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await readFile(path.join(ROOT, 'data', 'pokedex.json'), 'utf8'));

const problems = [];
const lines = [];

const fmt = (n) =>
  n.id + (n.condition ? `<${n.condition}>` : '') + (n.children.length ? `(${n.children.map(fmt).join(', ')})` : '');

for (const line of data.lines) {
  const root = data.pokemon[line.rootId];
  if (!root) problems.push(`进化线 ${line.key} 找不到最初形态 #${line.rootId}`);
  lines.push(`${root?.nameZh ?? line.key} #${line.rootId} — ${line.tree.map(fmt).join(' | ')}`);
}

for (const [id, p] of Object.entries(data.pokemon)) {
  if (!p.nameZh) problems.push(`#${id} 缺少中文名`);
  if (!p.types?.length) problems.push(`#${id} 缺少属性`);
  if (!p.flavorZh) problems.push(`#${id} 缺少图鉴说明`);
  if (!p.stats?.hp) problems.push(`#${id} 缺少种族值`);
  /*
   * 分类是「按分类搜索」和卡片副标题的唯一来源。
   * 它在 PokéAPI 里叫 genera[].genus（不是 names[].name），字段名写错时会静默变成空串 ——
   * 页面照样能渲染，只是搜索搜不到、卡片退回显示世代。所以这里必须逐条卡住。
   */
  if (!p.genusZh) problems.push(`#${id} 缺少分类（genusZh）`);
  if (!p.eggGroups?.length) problems.push(`#${id} 缺少蛋群`);
  try {
    const s = await stat(path.join(ROOT, 'public', p.sprite));
    if (s.size < 1024) problems.push(`#${id} 立绘异常（${s.size} 字节）`);
  } catch {
    problems.push(`#${id} 立绘缺失：${p.sprite}`);
  }
}

/* 分类必须真的「分类」，不能 430 只共用同一个值 */
const genusSet = new Set(Object.values(data.pokemon).map((p) => p.genusZh).filter(Boolean));
if (genusSet.size < 50) problems.push(`分类种类只有 ${genusSet.size} 种，疑似取值失败`);

const spriteFiles = await readdir(path.join(ROOT, 'public', 'sprites'));
const totalBytes = (
  await Promise.all(spriteFiles.map(async (f) => (await stat(path.join(ROOT, 'public', 'sprites', f))).size))
).reduce((a, b) => a + b, 0);

console.log(`进化线 ${data.lines.length} 条 / 宝可梦 ${Object.keys(data.pokemon).length} 只`);
lines.forEach((l) => console.log('  ' + l));
console.log(`立绘 ${spriteFiles.length} 张，合计 ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`数据生成时间 ${data.generatedAt}`);
console.log(problems.length ? `\n发现 ${problems.length} 个问题：\n` + problems.map((p) => '  ✗ ' + p).join('\n') : '\n✓ 全部检查通过');
process.exit(problems.length ? 1 : 0);
