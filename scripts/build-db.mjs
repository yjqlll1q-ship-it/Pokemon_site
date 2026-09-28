/**
 * build-db.mjs
 * ---------------------------------------------------------------------------
 * 把 data/pokedex.json 灌进 SQLite 数据库 data/pokedex.db。
 *
 * 为什么是「JSON 先、DB 后」而不是「DB 里直接放原始数据」：
 *   1. JSON 是抓取层的产物（可读、可 diff、可当备份），DB 是查询层的产物；
 *      重新建库不碰网络，秒级完成 —— 改 schema 不用重抓 386 只宝可梦。
 *   2. 换存储（Postgres / DuckDB）时只需要换这个脚本，抓取逻辑一行不动。
 *
 * 驱动用 Node 内置的 node:sqlite（Node ≥ 22.5 自带，无需原生编译、零 npm 依赖）。
 *
 * 用法:
 *   node scripts/build-db.mjs
 *
 * 建库策略：先写到 pokedex.db.tmp，全部成功后再 rename 覆盖。
 * 这样运行中的服务永远不会读到写了一半的数据库。
 */

import { DatabaseSync } from 'node:sqlite';
import { readFile, rename, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const JSON_FILE = path.join(ROOT, 'data', 'pokedex.json');
const DB_FILE = path.join(ROOT, 'data', 'pokedex.db');
const TMP_FILE = DB_FILE + '.tmp';

/* -------------------------------------------------------------------------- */
/* schema                                                                      */
/* -------------------------------------------------------------------------- */

const SCHEMA = `
CREATE TABLE generation (
  id         INTEGER PRIMARY KEY,
  name_zh    TEXT    NOT NULL,
  region_zh  TEXT    NOT NULL,
  dex_start  INTEGER NOT NULL,
  dex_end    INTEGER NOT NULL
);

CREATE TABLE type (
  slug       TEXT    PRIMARY KEY,
  name_zh    TEXT    NOT NULL,
  sort_order INTEGER NOT NULL
);

/* 属性相克矩阵。只存非 1 倍的格子：
   attack_type 的招式打 defend_type 的倍率 */
CREATE TABLE type_effect (
  attack_type TEXT NOT NULL,
  defend_type TEXT NOT NULL,
  multiplier  REAL NOT NULL,
  PRIMARY KEY (attack_type, defend_type)
);

CREATE TABLE pokemon (
  id              INTEGER PRIMARY KEY,      -- 全国图鉴编号
  name_en         TEXT    NOT NULL,
  name_zh         TEXT    NOT NULL,
  name_ja         TEXT    NOT NULL DEFAULT '',
  dex_number      INTEGER NOT NULL,
  generation      INTEGER NOT NULL,
  in_scope        INTEGER NOT NULL,          -- 1 = 前三世代（#1–386），图鉴查询默认只看这些
  genus_zh        TEXT    NOT NULL DEFAULT '',
  flavor_zh       TEXT    NOT NULL DEFAULT '',
  height_m        REAL    NOT NULL,
  weight_kg       REAL    NOT NULL,
  capture_rate    INTEGER,
  base_happiness  INTEGER,
  color           TEXT    NOT NULL DEFAULT 'normal',
  is_baby         INTEGER NOT NULL DEFAULT 0,
  is_legendary    INTEGER NOT NULL DEFAULT 0,
  is_mythical     INTEGER NOT NULL DEFAULT 0,
  stat_hp         INTEGER NOT NULL,
  stat_attack     INTEGER NOT NULL,
  stat_defense    INTEGER NOT NULL,
  stat_sp_attack  INTEGER NOT NULL,
  stat_sp_defense INTEGER NOT NULL,
  stat_speed      INTEGER NOT NULL,
  stat_total      INTEGER NOT NULL,
  evolves_from_id INTEGER REFERENCES pokemon(id),
  chain_id        INTEGER REFERENCES chain(id),
  sprite          TEXT    NOT NULL
);

CREATE TABLE chain (
  id      INTEGER PRIMARY KEY,               -- PokéAPI 的 evolution_chain id
  root_id INTEGER NOT NULL REFERENCES pokemon(id)
);

CREATE TABLE pokemon_type (
  pokemon_id INTEGER NOT NULL REFERENCES pokemon(id),
  slot       INTEGER NOT NULL,               -- 1 = 主属性
  type_slug  TEXT    NOT NULL REFERENCES type(slug),
  PRIMARY KEY (pokemon_id, slot)
);

CREATE TABLE ability (
  slug    TEXT PRIMARY KEY,
  name_zh TEXT NOT NULL
);

CREATE TABLE pokemon_ability (
  pokemon_id   INTEGER NOT NULL REFERENCES pokemon(id),
  slot         INTEGER NOT NULL,
  ability_slug TEXT    NOT NULL REFERENCES ability(slug),
  is_hidden    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (pokemon_id, slot)
);

CREATE TABLE egg_group (
  slug    TEXT PRIMARY KEY,
  name_zh TEXT NOT NULL
);

CREATE TABLE pokemon_egg_group (
  pokemon_id     INTEGER NOT NULL REFERENCES pokemon(id),
  egg_group_slug TEXT    NOT NULL REFERENCES egg_group(slug),
  PRIMARY KEY (pokemon_id, egg_group_slug)
);

CREATE TABLE evolution (
  from_id    INTEGER NOT NULL REFERENCES pokemon(id),
  to_id      INTEGER NOT NULL REFERENCES pokemon(id),
  condition  TEXT    NOT NULL,
  chain_id   INTEGER NOT NULL REFERENCES chain(id),
  PRIMARY KEY (from_id, to_id)
);

/* ---- 索引：图鉴查询页每一种筛选/排序都要能走到索引 ---- */
CREATE INDEX idx_pokemon_scope_gen   ON pokemon(in_scope, generation, id);
CREATE INDEX idx_pokemon_stat_total  ON pokemon(in_scope, stat_total);
CREATE INDEX idx_pokemon_name_zh     ON pokemon(name_zh);
CREATE INDEX idx_pokemon_name_en     ON pokemon(name_en);
CREATE INDEX idx_pokemon_chain       ON pokemon(chain_id);
CREATE INDEX idx_pokemon_evofrom     ON pokemon(evolves_from_id);
CREATE INDEX idx_ptype_type          ON pokemon_type(type_slug, pokemon_id);
CREATE INDEX idx_pability_slug       ON pokemon_ability(ability_slug, pokemon_id);
CREATE INDEX idx_pegg_slug           ON pokemon_egg_group(egg_group_slug, pokemon_id);
CREATE INDEX idx_evolution_chain     ON evolution(chain_id);
CREATE INDEX idx_teffect_defend      ON type_effect(defend_type, attack_type);
`;

/* -------------------------------------------------------------------------- */
/* 小工具                                                                       */
/* -------------------------------------------------------------------------- */

const int = (v) => (v ? 1 : 0);
const num = (v, fallback = null) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);

/* -------------------------------------------------------------------------- */

async function main() {
  await mkdir(path.dirname(DB_FILE), { recursive: true });

  const raw = JSON.parse(await readFile(JSON_FILE, 'utf8'));
  const pokemonList = Object.values(raw.pokemon);
  console.log(
    `[build-db] 读入 ${pokemonList.length} 只 / ${raw.lines.length} 条链 / ${raw.types.length} 属性`,
  );

  await rm(TMP_FILE, { force: true });
  /*
   * enableForeignKeyConstraints: false —— 这是 node:sqlite 的坑：
   * DatabaseSync **默认就开启外键即时校验**（默认 true，和 better-sqlite3 不同，
   * 不写 PRAGMA 也会生效）。而灌数据阶段必然出现「先引用、后插入」：
   *   - pokemon.evolves_from_id 是自引用，且方向不总是指向更小的编号
   *     （皮卡丘 #25 进化自皮丘 #172，按编号顺序插就会先引用 172）；
   *   - chain.root_id 指向 pokemon，而 chain 必须比 pokemon 先插。
   * 即时校验会因此直接报 FOREIGN KEY constraint failed。
   *
   * 所以这里关掉即时校验，改为全部插完后再跑一次 PRAGMA foreign_key_check ——
   * 那是全量校验，比逐条即时校验覆盖面更广，做完再决定是否 `process.exit(1)`。
   */
  const db = new DatabaseSync(TMP_FILE, { enableForeignKeyConstraints: false });
  db.exec('PRAGMA journal_mode = MEMORY'); // 临时库不需要落盘日志，快很多

  db.exec(SCHEMA);

  db.exec('BEGIN');

  /* ---- 世代 ---- */
  {
    const st = db.prepare(
      'INSERT INTO generation (id, name_zh, region_zh, dex_start, dex_end) VALUES (?, ?, ?, ?, ?)',
    );
    for (const g of raw.generations) {
      st.run(g.id, str(g.nameZh), str(g.regionZh), g.start, g.end);
    }
  }

  /* ---- 属性 + 相克矩阵 ---- */
  {
    const stType = db.prepare('INSERT INTO type (slug, name_zh, sort_order) VALUES (?, ?, ?)');
    raw.types.forEach((t, i) => stType.run(t.slug, str(t.nameZh), i));

    /*
     * raw.types[].weakTo 是「从防守方看」的：
     *   d.weakTo 里的 a  =>  a 打 d 是 2 倍
     *   d.resists 里的 a =>  a 打 d 是 0.5 倍
     *   d.immuneTo 里的 a=>  a 打 d 是 0 倍
     * 这里转成「进攻方视角」的矩阵存起来，查询时按 attack_type 取一行
     * 就是「这个属性招式的进攻相性」。
     */
    const stEff = db.prepare(
      'INSERT OR REPLACE INTO type_effect (attack_type, defend_type, multiplier) VALUES (?, ?, ?)',
    );
    for (const d of raw.types) {
      for (const a of d.weakTo ?? []) stEff.run(a, d.slug, 2);
      for (const a of d.resists ?? []) stEff.run(a, d.slug, 0.5);
      for (const a of d.immuneTo ?? []) stEff.run(a, d.slug, 0);
    }
  }

  /* ---- 进化链 ---- */
  {
    const st = db.prepare('INSERT INTO chain (id, root_id) VALUES (?, ?)');
    for (const line of raw.lines) st.run(line.chainId, line.rootId);
  }

  /* ---- 宝可梦 ---- */
  {
    const st = db.prepare(`
      INSERT INTO pokemon (
        id, name_en, name_zh, name_ja, dex_number, generation, in_scope,
        genus_zh, flavor_zh, height_m, weight_kg, capture_rate, base_happiness, color,
        is_baby, is_legendary, is_mythical,
        stat_hp, stat_attack, stat_defense, stat_sp_attack, stat_sp_defense, stat_speed, stat_total,
        evolves_from_id, chain_id, sprite
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const p of pokemonList) {
      const s = p.stats ?? {};
      st.run(
        p.id,
        str(p.name),
        str(p.nameZh),
        str(p.nameJa),
        num(p.dexNumber, p.id),
        num(p.generation, 0),
        int(p.inScope),
        str(p.genusZh),
        str(p.flavorZh),
        num(p.heightM, 0),
        num(p.weightKg, 0),
        num(p.captureRate),
        num(p.baseHappiness),
        str(p.colorKey, 'normal'),
        int(p.isBaby),
        int(p.isLegendary),
        int(p.isMythical),
        num(s.hp, 0),
        num(s.attack, 0),
        num(s.defense, 0),
        num(s['special-attack'], 0),
        num(s['special-defense'], 0),
        num(s.speed, 0),
        num(p.statTotal, 0),
        num(p.evolvesFromId),
        num(p.chainId),
        str(p.sprite),
      );
    }
  }

  /* ---- 属性关联 ---- */
  {
    const st = db.prepare(
      'INSERT INTO pokemon_type (pokemon_id, slot, type_slug) VALUES (?, ?, ?)',
    );
    for (const p of pokemonList) {
      (p.types ?? []).forEach((t, i) => st.run(p.id, i + 1, t));
    }
  }

  /* ---- 特性 ---- */
  {
    const stA = db.prepare('INSERT OR IGNORE INTO ability (slug, name_zh) VALUES (?, ?)');
    const stPa = db.prepare(
      'INSERT INTO pokemon_ability (pokemon_id, slot, ability_slug, is_hidden) VALUES (?, ?, ?, ?)',
    );
    for (const p of pokemonList) {
      (p.abilities ?? []).forEach((a, i) => {
        const slug = str(a.slug);
        if (!slug) return;
        stA.run(slug, str(a.nameZh, slug));
        stPa.run(p.id, i + 1, slug, int(a.hidden));
      });
    }
  }

  /* ---- 蛋群 ---- */
  {
    const stG = db.prepare('INSERT OR IGNORE INTO egg_group (slug, name_zh) VALUES (?, ?)');
    const stPg = db.prepare(
      'INSERT OR IGNORE INTO pokemon_egg_group (pokemon_id, egg_group_slug) VALUES (?, ?)',
    );
    for (const p of pokemonList) {
      for (const g of p.eggGroups ?? []) {
        const slug = str(g.slug);
        if (!slug) continue;
        stG.run(slug, str(g.nameZh, slug));
        stPg.run(p.id, slug);
      }
    }
  }

  /* ---- 进化边（从进化树摊平） ---- */
  {
    const st = db.prepare(
      'INSERT OR REPLACE INTO evolution (from_id, to_id, condition, chain_id) VALUES (?, ?, ?, ?)',
    );
    const edges = [];
    for (const line of raw.lines) {
      const walk = (nodes, fromId) => {
        for (const n of nodes) {
          edges.push([fromId, n.id, str(n.condition, '特殊条件'), line.chainId]);
          walk(n.children, n.id);
        }
      };
      walk(line.tree, line.rootId);
    }
    for (const e of edges) st.run(e[0], e[1], e[2], e[3]);
    console.log(`[build-db] 进化边 ${edges.length} 条`);
  }

  db.exec('COMMIT');

  /* ---- 统计 + 一致性自检（建库即验证） ---- */
  const counts = {};
  for (const t of [
    'pokemon', 'type', 'type_effect', 'pokemon_type', 'ability', 'pokemon_ability',
    'egg_group', 'pokemon_egg_group', 'generation', 'chain', 'evolution',
  ]) {
    counts[t] = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
  }

  const problems = [];
  const expectZero = (label, sql) => {
    const v = db.prepare(sql).get().c;
    if (v !== 0) problems.push(`${label}: ${v}`);
    return v;
  };
  expectZero('孤立的属性关联（指向不存在的宝可梦）', `
    SELECT COUNT(*) AS c FROM pokemon_type pt
    LEFT JOIN pokemon p ON p.id = pt.pokemon_id WHERE p.id IS NULL`);
  expectZero('图鉴查询范围内的宝可梦缺少属性', `
    SELECT COUNT(*) AS c FROM pokemon p WHERE p.in_scope = 1
    AND NOT EXISTS (SELECT 1 FROM pokemon_type pt WHERE pt.pokemon_id = p.id)`);
  expectZero('链上成员缺少 generation', `SELECT COUNT(*) AS c FROM pokemon WHERE generation = 0`);

  const integrity = db.prepare('PRAGMA integrity_check').get();
  const fk = db.prepare('PRAGMA foreign_key_check').all();
  if (fk.length) problems.push(`外键违规 ${fk.length} 条（首条: ${JSON.stringify(fk[0])}）`);

  db.exec('PRAGMA optimize');
  db.close();

  /*
   * Windows 上只要还有进程打开着旧库（最常见的是一直开着的 npm start），
   * 删/改名都会 EBUSY。这不是数据问题，但原文照抛 node 的错误码，
   * 排查者要自己想到「去停服务」。这里把它翻译成一句能直接照做的提示。
   */
  try {
    await rm(DB_FILE, { force: true });
    await rename(TMP_FILE, DB_FILE);
  } catch (e) {
    if (e.code === 'EBUSY' || e.code === 'EPERM' || e.code === 'EACCES') {
      console.error(`\n[build-db] 旧库被占用，无法替换：${DB_FILE}`);
      console.error('  Windows 文件锁：只要有进程开着这个文件（例如正在跑的服务）就会锁住。');
      console.error(`  做法：停掉服务 → 重跑 npm run db → 再启动服务。新库已写好在 ${TMP_FILE}。`);
    }
    throw e;
  }
  // journal_mode=MEMORY 不产生 -wal/-journal 文件，这里只是兜底
  await rm(DB_FILE + '-journal', { force: true });
  await rm(DB_FILE + '-wal', { force: true });
  await rm(DB_FILE + '-shm', { force: true });

  console.log('[build-db] 表行数:', JSON.stringify(counts));
  console.log('[build-db] integrity_check =', integrity.integrity_check, '· 外键违规 =', fk.length);
  if (problems.length) {
    console.error('[build-db] 自检未通过:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
  console.log('[build-db] 完成 → data/pokedex.db');
}

main().catch((err) => {
  console.error('[build-db] 失败:', err);
  process.exit(1);
});
