/**
 * check-db.mjs
 * ---------------------------------------------------------------------------
 * 数据库体检。建库之后跑一次，确认灌进去的数据真的对。
 *
 *   npm run db:check
 *
 * 设计原则：**断言要能失败**。
 * 每条检查都有明确的口径与期望值，故意破坏数据（少灌一只、删掉一个属性关联、
 * 把索引去掉）时必须能 FAIL —— 否则它只是一段安慰性输出。
 *
 * 覆盖三层：
 *   1. 结构层：表/索引在不在，外键有没有违规
 *   2. 数据层：范围完整性、属性/特性/蛋群关联、种族值算术
 *   3. 语义层：拿几个「已知答案」的查询验结果（世代人数、关键词命中、区间筛选）
 */

import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DB_FILE = process.env.POKEDEX_DB ?? path.join(ROOT, 'data', 'pokedex.db');

if (!existsSync(DB_FILE)) {
  console.error(`[check-db] 找不到 ${DB_FILE}，请先执行 npm run db`);
  process.exit(1);
}

const db = new DatabaseSync(DB_FILE, { readOnly: true });

let pass = 0;
const failures = [];

const check = (label, fn) => {
  let actual;
  try {
    actual = fn();
  } catch (err) {
    failures.push(`${label} —— 抛异常: ${err.message}`);
    return;
  }
  if (actual === true) {
    pass++;
  } else {
    failures.push(`${label} —— 实际: ${JSON.stringify(actual)}`);
  }
};

const count = (sql, ...p) => db.prepare(sql).get(...p).c;
const scalar = (sql, ...p) => Object.values(db.prepare(sql).get(...p))[0];

/* -------------------------------------------------------------------------- */
/* 1. 结构层                                                                    */
/* -------------------------------------------------------------------------- */

const EXPECTED_TABLES = [
  'pokemon', 'type', 'type_effect', 'pokemon_type', 'ability', 'pokemon_ability',
  'egg_group', 'pokemon_egg_group', 'generation', 'chain', 'evolution',
];
const EXPECTED_INDEXES = [
  'idx_pokemon_scope_gen', 'idx_pokemon_stat_total', 'idx_pokemon_name_zh',
  'idx_pokemon_name_en', 'idx_pokemon_chain', 'idx_pokemon_evofrom',
  'idx_ptype_type', 'idx_pability_slug', 'idx_pegg_slug', 'idx_evolution_chain',
  'idx_teffect_defend',
];

for (const t of EXPECTED_TABLES) {
  check(`表存在: ${t}`, () => count("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name=?", t) === 1);
}
for (const i of EXPECTED_INDEXES) {
  check(`索引存在: ${i}`, () => count("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='index' AND name=?", i) === 1);
}

check('integrity_check 通过', () => scalar('PRAGMA integrity_check') === 'ok');
check('无外键违规', () => db.prepare('PRAGMA foreign_key_check').all().length === 0);

/* -------------------------------------------------------------------------- */
/* 2. 数据层                                                                    */
/* -------------------------------------------------------------------------- */

check('范围内共 386 只', () => {
  const n = count('SELECT COUNT(*) AS c FROM pokemon WHERE in_scope = 1');
  return n === 386 ? true : `实际 ${n}`;
});
check('范围内的编号恰好是 1–386（无缺号/重号）', () => {
  const rows = db.prepare('SELECT id FROM pokemon WHERE in_scope = 1 ORDER BY id').all().map((r) => r.id);
  if (rows.length !== 386) return `行数 ${rows.length}`;
  for (let i = 0; i < 386; i++) if (rows[i] !== i + 1) return `第 ${i} 项是 #${rows[i]}`;
  return true;
});
check('18 种属性齐全', () => count('SELECT COUNT(*) AS c FROM type') === 18);
check('每种属性至少有 1 只', () => {
  const bad = db.prepare(`
    SELECT t.slug AS slug FROM type t
    WHERE NOT EXISTS (SELECT 1 FROM pokemon_type pt WHERE pt.type_slug = t.slug)
  `).all();
  return bad.length === 0 ? true : bad.map((b) => b.slug);
});
check('范围内每只都有 1–2 个属性', () => {
  const bad = db.prepare(`
    SELECT p.id AS id, COUNT(pt.slot) AS n FROM pokemon p
    LEFT JOIN pokemon_type pt ON pt.pokemon_id = p.id
    WHERE p.in_scope = 1 GROUP BY p.id HAVING n = 0 OR n > 2
  `).all();
  return bad.length === 0 ? true : bad.slice(0, 5);
});
check('范围内每只都有至少 1 个特性', () => {
  const bad = db.prepare(`
    SELECT p.id AS id FROM pokemon p
    WHERE p.in_scope = 1
      AND NOT EXISTS (SELECT 1 FROM pokemon_ability pa WHERE pa.pokemon_id = p.id)
  `).all();
  return bad.length === 0 ? true : bad.slice(0, 5).map((b) => b.id);
});
/*
 * 叫声地址：详情页「播放叫声」按钮的数据来源。空值不会让页面崩，
 * 只会让按钮点了没声音 —— 属于「看着正常其实没数据」，必须盯住。
 */
check('范围内每只都有叫声地址（cry_url）', () => {
  const n = count("SELECT COUNT(*) AS c FROM pokemon WHERE in_scope = 1 AND (cry_url IS NULL OR cry_url = '')");
  return n === 0 ? true : `${n} 只缺少叫声地址`;
});
/* 特性说明：详情页「特性」板块要显示的文字，抓取失败会静默变空串 */
check('特性说明（ability.desc_zh）覆盖率 ≥ 85%', () => {
  const total = count('SELECT COUNT(*) AS c FROM ability');
  const withDesc = count("SELECT COUNT(*) AS c FROM ability WHERE desc_zh IS NOT NULL AND desc_zh <> ''");
  const ratio = total ? withDesc / total : 0;
  return ratio >= 0.85 ? true : `${withDesc}/${total} = ${(ratio * 100).toFixed(0)}%`;
});
check('属性槽位是 1 和 2，且同属性不重复占槽', () => {
  const bad = db.prepare(`
    SELECT COUNT(*) AS c FROM (
      SELECT pokemon_id FROM pokemon_type GROUP BY pokemon_id, type_slug HAVING COUNT(*) > 1
    ) UNION ALL
    SELECT COUNT(*) AS c FROM pokemon_type WHERE slot NOT IN (1, 2)
  `).all();
  return bad.every((r) => r.c === 0) ? true : bad;
});
check('种族值每项都在 1–255 之间', () => {
  const bad = db.prepare(`
    SELECT COUNT(*) AS c FROM pokemon
    WHERE stat_hp NOT BETWEEN 1 AND 255 OR stat_attack NOT BETWEEN 1 AND 255
       OR stat_defense NOT BETWEEN 1 AND 255 OR stat_sp_attack NOT BETWEEN 1 AND 255
       OR stat_sp_defense NOT BETWEEN 1 AND 255 OR stat_speed NOT BETWEEN 1 AND 255
  `).get().c;
  return bad === 0 ? true : bad;
});
check('种族值总和 = 六项之和', () => {
  const bad = db.prepare(`
    SELECT COUNT(*) AS c FROM pokemon
    WHERE stat_total <> stat_hp + stat_attack + stat_defense + stat_sp_attack + stat_sp_defense + stat_speed
  `).get().c;
  return bad === 0 ? true : bad;
});
check('每条进化边的两端都存在', () => {
  const bad = db.prepare(`
    SELECT COUNT(*) AS c FROM evolution e
    LEFT JOIN pokemon a ON a.id = e.from_id
    LEFT JOIN pokemon b ON b.id = e.to_id
    WHERE a.id IS NULL OR b.id IS NULL
  `).get().c;
  return bad === 0 ? true : bad;
});
check('每条进化边都带有非空条件说明', () => {
  const bad = count("SELECT COUNT(*) AS c FROM evolution WHERE condition IS NULL OR TRIM(condition) = ''");
  return bad === 0 ? true : bad;
});
check('每条链的根节点存在，且在该链内没有入边', () => {
  const bad = db.prepare(`
    SELECT c.id AS id FROM chain c
    LEFT JOIN pokemon p ON p.id = c.root_id
    WHERE p.id IS NULL
       OR EXISTS (SELECT 1 FROM evolution e WHERE e.chain_id = c.id AND e.to_id = c.root_id)
  `).all();
  return bad.length === 0 ? true : bad.slice(0, 5).map((b) => b.id);
});
check('没有自环进化边（from = to）', () => count('SELECT COUNT(*) AS c FROM evolution WHERE from_id = to_id') === 0);
check('属性相克矩阵无重复格', () => {
  const bad = db.prepare(`
    SELECT COUNT(*) AS c FROM (
      SELECT attack_type, defend_type FROM type_effect
      GROUP BY attack_type, defend_type HAVING COUNT(*) > 1
    )
  `).get().c;
  return bad === 0 ? true : bad;
});
check('相克倍率只有 0 / 0.5 / 2 三种取值', () => {
  const bad = db.prepare('SELECT DISTINCT multiplier AS m FROM type_effect').all().map((r) => r.m).sort();
  return bad.every((m) => m === 0 || m === 0.5 || m === 2) ? true : bad;
});
check('每个世代的行数与范围一致', () => {
  const rows = db.prepare(`
    SELECT g.id AS id, g.dex_start AS s, g.dex_end AS e, COUNT(p.id) AS n
    FROM generation g LEFT JOIN pokemon p ON p.generation = g.id AND p.in_scope = 1
    GROUP BY g.id ORDER BY g.id
  `).all();
  const bad = rows.filter((r) => r.n !== r.e - r.s + 1);
  return bad.length === 0 ? true : bad;
});

/* -------------------------------------------------------------------------- */
/* 3. 语义层：已知答案的查询                                                     */
/* -------------------------------------------------------------------------- */

/** 与 lib/pokedex-query.ts 的 buildWhere 等价的查询，用于验证筛选口径 */
const search = (opts = {}) => {
  const clauses = ['p.in_scope = 1'];
  const params = [];
  if (opts.generation) {
    clauses.push('p.generation = ?');
    params.push(opts.generation);
  }
  if (opts.q) {
    clauses.push('(p.name_zh LIKE ? OR p.name_en LIKE ? OR p.name_ja LIKE ? OR p.genus_zh LIKE ?)');
    const like = `%${opts.q}%`;
    params.push(like, like, like, like);
  }
  if (opts.id) {
    clauses.push('p.id = ?');
    params.push(opts.id);
  }
  if (opts.type) {
    clauses.push('EXISTS (SELECT 1 FROM pokemon_type pt WHERE pt.pokemon_id = p.id AND pt.type_slug = ?)');
    params.push(opts.type);
  }
  if (opts.minTotal) {
    clauses.push('p.stat_total >= ?');
    params.push(opts.minTotal);
  }
  if (opts.legendary) clauses.push('p.is_legendary = 1');
  if (opts.mythical) clauses.push('p.is_mythical = 1');
  const sql = `SELECT COUNT(*) AS c FROM pokemon p WHERE ${clauses.join(' AND ')}`;
  return db.prepare(sql).get(...params).c;
};

/** check() 要求返回 true 才算通过，所以每个断言都要显式比较 */
const equals = (label, fn, expected) =>
  check(label, () => {
    const v = fn();
    return v === expected ? true : `实际 ${JSON.stringify(v)}，期望 ${JSON.stringify(expected)}`;
  });

equals('第一世代 151 只', () => search({ generation: 1 }), 151);
equals('第二世代 100 只', () => search({ generation: 2 }), 100);
equals('第三世代 135 只', () => search({ generation: 3 }), 135);
check('三个世代合计 386 只', () => {
  const sum = search({ generation: 1 }) + search({ generation: 2 }) + search({ generation: 3 });
  return sum === 386 ? true : sum;
});
equals('关键词「皮卡丘」命中 1 只', () => search({ q: '皮卡丘' }), 1);
/*
 * 分类列曾经整列为空（取值时字段名写错：genera 里叫 genus，不是 name）。
 * 空值不会让页面崩，只会让「按分类搜索」静默搜不到、卡片副标题退回显示世代 ——
 * 这种「看着正常其实没数据」的空列，必须由断言盯住。
 */
check('范围内每只都有分类（genus_zh 非空）', () => {
  const n = count("SELECT COUNT(*) AS c FROM pokemon WHERE in_scope = 1 AND (genus_zh IS NULL OR genus_zh = '')");
  return n === 0 ? true : `${n} 只分类为空`;
});
check('分类至少有 50 种（不是所有宝可梦共用一个值）', () => {
  const n = scalar('SELECT COUNT(DISTINCT genus_zh) FROM pokemon WHERE in_scope = 1');
  return n >= 50 ? true : n;
});
check('按分类「鼠宝可梦」能搜到皮丘/皮卡丘/雷丘', () => {
  const n = search({ q: '鼠宝可梦' });
  return n >= 3 ? true : n;
});
/*
 * 宣传语是「登记制」：build-data.mjs 的 TAGLINE_ZH 里登记过的才有。
 * 这里盯的不是「有没有这一列」，而是**空串与 NULL 不能混**——
 * 空串在前端是 truthy 的，会渲染出一条空白飘带（比不渲染更糟：一块莫名的红条）。
 * 所以口径是「要么有内容，要么是 NULL，不允许出现空串」。
 */
check('宣传语列可以是 NULL，但不允许是空串', () => {
  const n = count("SELECT COUNT(*) AS c FROM pokemon WHERE tagline_zh = ''");
  return n === 0 ? true : `${n} 行是空串（前端会渲染成空白飘带）`;
});
check('宣传语只在登记过的宝可梦上有（当前 1 只）', () => {
  const n = count('SELECT COUNT(*) AS c FROM pokemon WHERE tagline_zh IS NOT NULL');
  return n === 1 ? true : n;
});
check('中文名部分匹配「伊布」命中 >1 只（伊布家族）', () => {
  const n = search({ q: '伊布' });
  return n >= 2 ? true : n;
});
equals('#25 存在', () => search({ id: 25 }), 1);
check('火属性有成员', () => {
  const n = search({ type: 'fire' });
  return n > 0 ? true : n;
});
check('种族值总和 ≥ 600 的至少有 6 只（神兽层）', () => {
  const n = search({ minTotal: 600 });
  return n >= 6 ? true : n;
});
check('传说的宝可梦 > 0 只', () => {
  const n = search({ legendary: true });
  return n > 0 ? true : n;
});
check('幻之宝可梦 > 0 只（梦幻 / 雪拉比 / 基拉祈 / 代欧奇希斯）', () => {
  const n = search({ mythical: true });
  return n >= 4 ? true : n;
});
check('范围外（第四世代）没有被算进 in_scope', () => {
  const n = count('SELECT COUNT(*) AS c FROM pokemon WHERE in_scope = 1 AND id > 386');
  return n === 0 ? true : n;
});
check('存在链上第四世代成员（用于把进化树画完整）', () => {
  const n = count('SELECT COUNT(*) AS c FROM pokemon WHERE in_scope = 0');
  return n > 0 ? true : n;
});

/* -------------------------------------------------------------------------- */

const info = {
  宝可梦总数: count('SELECT COUNT(*) AS c FROM pokemon'),
  其中范围内: count('SELECT COUNT(*) AS c FROM pokemon WHERE in_scope = 1'),
  进化链: count('SELECT COUNT(*) AS c FROM chain'),
  进化边: count('SELECT COUNT(*) AS c FROM evolution'),
  属性: count('SELECT COUNT(*) AS c FROM type'),
  相克格: count('SELECT COUNT(*) AS c FROM type_effect'),
  特性: count('SELECT COUNT(*) AS c FROM ability'),
  蛋群: count('SELECT COUNT(*) AS c FROM egg_group'),
  种族值总和下界: scalar('SELECT MIN(stat_total) AS v FROM pokemon WHERE in_scope = 1'),
  种族值总和上界: scalar('SELECT MAX(stat_total) AS v FROM pokemon WHERE in_scope = 1'),
};

db.close();

console.log('[check-db] 概览:');
for (const [k, v] of Object.entries(info)) console.log(`  ${k}: ${v}`);

if (failures.length) {
  console.error(`\n[check-db] 未通过 ${failures.length} 项（通过 ${pass} 项）:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`\n[check-db] 全部 ${pass} 项检查通过`);
