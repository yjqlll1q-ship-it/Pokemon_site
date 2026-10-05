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
  /*
   * 叫声地址：详情页的「播放叫声」按钮靠它。前端按这个 URL 直接拉 CDN 音频，
   * 缺了按钮就点不动，所以必须逐条保证有值。
   */
  if (!p.cryUrl) problems.push(`#${id} 缺少叫声地址（cryUrl）`);
  if (!p.eggGroups?.length) problems.push(`#${id} 缺少蛋群`);
  try {
    const s = await stat(path.join(ROOT, 'public', p.sprite));
    if (s.size < 1024) problems.push(`#${id} 立绘异常（${s.size} 字节）`);
  } catch {
    problems.push(`#${id} 立绘缺失：${p.sprite}`);
  }

  /* ---------------------------- 形态（forms） ---------------------------- */
  /*
   * 形态是「有就渲染、没有就不渲染」，所以**最容易出的错是静默的**：
   * 字段缺失 / 表单只有 1 条 / 立绘没下 / 中文名退回英文 —— 页面都照样出，
   * 只是形态那一块不见了或变成英文。逐条卡住。
   */
  if (!Array.isArray(p.forms)) {
    problems.push(`#${id} 缺少 forms 字段（无形态时也必须是空数组）`);
    continue;
  }
  if (p.forms.length === 0) continue;

  if (p.forms.length < 2) problems.push(`#${id} forms 只有 ${p.forms.length} 条，不该单独渲染`);
  const defaults = p.forms.filter((f) => f.isDefault);
  if (defaults.length !== 1) problems.push(`#${id} 基本形态不唯一（${defaults.length} 个）`);
  if (!p.forms[0]?.isDefault) problems.push(`#${id} forms[0] 不是基本形态`);

  /*
   * 基本形态那一份必须与宝可梦自身的数据一致 —— 它俩数据同源（都来自 /pokemon/{id}），
   * 一旦哪天给基本形态单独请求一次，两份就可能对不上（种族值/属性漂移），
   * 表现是「切到基本形态后数值和默认看到的不一样」。这条能当场抓住。
   */
  const base = p.forms[0];
  if (base && base.statTotal !== p.statTotal) {
    problems.push(`#${id} 基本形态种族值总和 ${base.statTotal} ≠ 本体 ${p.statTotal}`);
  }
  if (base && JSON.stringify(base.types) !== JSON.stringify(p.types)) {
    problems.push(`#${id} 基本形态属性 [${base.types}] ≠ 本体 [${p.types}]`);
  }
  if (base && JSON.stringify(base.stats) !== JSON.stringify(p.stats)) {
    problems.push(`#${id} 基本形态各项种族值 ≠ 本体`);
  }

  for (const f of p.forms) {
    const tag = `#${id} 形态「${f.slug ?? '?'}」`;
    if (!f.slug) problems.push(`${tag} 缺少 slug`);
    if (!f.nameZh) problems.push(`${tag} 缺少中文名`);
    if (!f.label) problems.push(`${tag} 缺少形态标签`);
    if (!f.types?.length) problems.push(`${tag} 缺少属性`);
    if (!f.typeNamesZh?.length) problems.push(`${tag} 缺少属性中文名`);
    if (f.dexNumber !== Number(id)) problems.push(`${tag} 图鉴编号 ${f.dexNumber} 与本体不一致`);
    if (!f.stats?.hp) problems.push(`${tag} 缺少种族值`);
    else {
      const sum = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'].reduce(
        (a, k) => a + (f.stats[k] ?? 0),
        0,
      );
      if (sum !== f.statTotal) problems.push(`${tag} 种族值总和 ${f.statTotal} ≠ 逐项相加 ${sum}`);
    }
    /*
     * 中文名必须真的是中文：FORM_LABEL_ZH 里没命中的后缀会退回英文，
     * 而「退回英文」这件事本身不报错。抓到一次就说明该补表了。
     */
    if (f.nameZh && !/[\u4e00-\u9fa5]/.test(f.nameZh)) {
      problems.push(`${tag} 中文名里没有汉字（${f.nameZh}），FORM_LABEL_ZH 需要补 key`);
    }
    for (const [kind, file] of [['立绘', f.sprite], ['缩略图', f.thumb]]) {
      if (!file) {
        problems.push(`${tag} 缺少${kind}路径`);
        continue;
      }
      try {
        const s = await stat(path.join(ROOT, 'public', file));
        if (s.size < 64) problems.push(`${tag} ${kind}异常（${s.size} 字节）`);
      } catch {
        problems.push(`${tag} ${kind}缺失：${file}`);
      }
    }
  }
}

/* 分类必须真的「分类」，不能 430 只共用同一个值 */
const genusSet = new Set(Object.values(data.pokemon).map((p) => p.genusZh).filter(Boolean));
if (genusSet.size < 50) problems.push(`分类种类只有 ${genusSet.size} 种，疑似取值失败`);

/*
 * 特性说明覆盖率。抓取失败会静默退化成空串（组件照样渲染，只是没有说明文字），
 * 所以这里卡一个下限：正常应接近 100%。
 */
const allAbilities = Object.values(data.pokemon).flatMap((p) => p.abilities ?? []);
const abilityWithDesc = allAbilities.filter((a) => a.descZh).length;
if (allAbilities.length && abilityWithDesc / allAbilities.length < 0.8) {
  const pct = ((abilityWithDesc / allAbilities.length) * 100).toFixed(0);
  problems.push(`特性说明覆盖率仅 ${pct}%（${abilityWithDesc}/${allAbilities.length}），疑似抓取失败`);
}

/*
 * 只数 .png —— public/sprites 下面还挂着 forms 子目录，
 * 不过滤的话 readdir 会把目录本身也算成一张「立绘」（之前就这么多报了 1 张）。
 */
const spriteFiles = (await readdir(path.join(ROOT, 'public', 'sprites'))).filter((f) =>
  f.toLowerCase().endsWith('.png'),
);
/*
 * 大图与缩略图分开统计：缩略图是**新增的一整套**（每只两张），
 * 混在一起数会让「立绘张数」直接翻倍、看不出哪边缺了。
 * 两者都必须与宝可梦数量严格相等 —— 少一张就是某只的图没下下来。
 */
const artFiles = spriteFiles.filter((f) => !f.endsWith('-thumb.png'));
const thumbFileList = spriteFiles.filter((f) => f.endsWith('-thumb.png'));
const spriteCount = Object.keys(data.pokemon).length;
if (artFiles.length !== spriteCount) {
  problems.push(`本体立绘 ${artFiles.length} 张 ≠ 宝可梦 ${spriteCount} 只`);
}
if (thumbFileList.length !== spriteCount) {
  problems.push(`本体缩略图 ${thumbFileList.length} 张 ≠ 宝可梦 ${spriteCount} 只（列表小图会 404）`);
}
const totalBytes = (
  await Promise.all(spriteFiles.map(async (f) => (await stat(path.join(ROOT, 'public', 'sprites', f))).size))
).reduce((a, b) => a + b, 0);

/*
 * 形态立绘单独统计。它会明显推高仓库体积（每个形态两张：大图 + 缩略图），
 * 所以把数字打出来，体积失控时一眼能看见。
 */
let formCount = 0;
let formSpecies = 0;
for (const p of Object.values(data.pokemon)) {
  if (p.forms?.length) {
    formSpecies++;
    formCount += p.forms.length;
  }
}
const formFiles = await readdir(path.join(ROOT, 'public', 'sprites', 'forms')).catch(() => []);
const formBytes = (
  await Promise.all(
    formFiles.map(async (f) => (await stat(path.join(ROOT, 'public', 'sprites', 'forms', f))).size),
  )
).reduce((a, b) => a + b, 0);
if (formFiles.length !== formCount * 2) {
  problems.push(`形态立绘文件数 ${formFiles.length} ≠ 形态数 ${formCount} × 2（大图 + 缩略图）`);
}

console.log(`进化线 ${data.lines.length} 条 / 宝可梦 ${Object.keys(data.pokemon).length} 只`);
lines.forEach((l) => console.log('  ' + l));
console.log(
  `立绘 ${artFiles.length} 张（大图）+ ${thumbFileList.length} 张（96px 缩略图），合计 ${(totalBytes / 1024 / 1024).toFixed(1)} MB`,
);
console.log(
  `形态 ${formSpecies} 只带额外形态 / 共 ${formCount} 个，立绘 ${formFiles.length} 张，` +
    `合计 ${(formBytes / 1024 / 1024).toFixed(1)} MB`,
);
console.log(`数据生成时间 ${data.generatedAt}`);
console.log(problems.length ? `\n发现 ${problems.length} 个问题：\n` + problems.map((p) => '  ✗ ' + p).join('\n') : '\n✓ 全部检查通过');
process.exit(problems.length ? 1 : 0);
