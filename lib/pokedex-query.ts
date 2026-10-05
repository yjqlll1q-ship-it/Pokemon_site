/**
 * lib/pokedex-query.ts
 * ---------------------------------------------------------------------------
 * 图鉴查询的**查询层**：把 URL 上的筛选条件翻译成 SQL。
 *
 * 分工：
 *   - lib/db.ts      只管连接与执行
 *   - 本文件         只管「条件 → SQL」与「行 → 视图对象」
 *   - app/api/**     只管解析请求参数与组织响应
 *
 * 所有条件都是**参数化**的（`?` 占位），不做字符串拼值；
 * 只有「列名 / 排序方向」这类无法参数化的东西走白名单映射，
 * 拼进 SQL 的一定是代码里写死的常量。
 *
 * 服务端专用。
 */

import { all, one } from './db';
import type { EvoLine, EvoMembers, EvoNode } from './evolution';
// 只取类型：import type 会被编译期抹掉，不会把全量 JSON 拖进来
import type { Pokemon } from './pokedex';
// 前后端共用的契约类型集中在 lib/api-types.ts，这里只做实现与再导出
import type {
  AppliedParams as NormalizedParams,
  DetailResponse,
  Facets,
  PokemonListItem,
  SearchResponse,
  SortKey,
  StatColumnKey,
  TagKey,
  TypeProfile,
} from './api-types';

export type {
  DetailResponse,
  Facets,
  NormalizedParams,
  PokemonListItem,
  SearchResponse,
  SortKey,
  StatColumnKey,
  TagKey,
  TypeProfile,
};

/* -------------------------------------------------------------------------- */
/* 参数与返回类型                                                               */
/* -------------------------------------------------------------------------- */

export const SORT_KEYS = {
  id: 'p.id',
  total: 'p.stat_total',
  hp: 'p.stat_hp',
  attack: 'p.stat_attack',
  defense: 'p.stat_defense',
  spAttack: 'p.stat_sp_attack',
  spDefense: 'p.stat_sp_defense',
  speed: 'p.stat_speed',
  height: 'p.height_m',
  weight: 'p.weight_kg',
  capture: 'p.capture_rate',
  name: 'p.name_zh',
} as const satisfies Record<SortKey, string>;

export const SORT_LABELS: { key: SortKey; label: string }[] = [
  { key: 'id', label: '图鉴编号' },
  { key: 'total', label: '种族值总和' },
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: '攻击' },
  { key: 'defense', label: '防御' },
  { key: 'spAttack', label: '特攻' },
  { key: 'spDefense', label: '特防' },
  { key: 'speed', label: '速度' },
  { key: 'height', label: '身高' },
  { key: 'weight', label: '体重' },
  { key: 'capture', label: '捕获率' },
  { key: 'name', label: '名称' },
];

/** 单项种族值的合法 key（对应 pokemon 表的列） */
export const STAT_COLUMNS = {
  hp: 'stat_hp',
  attack: 'stat_attack',
  defense: 'stat_defense',
  spAttack: 'stat_sp_attack',
  spDefense: 'stat_sp_defense',
  speed: 'stat_speed',
} as const satisfies Record<StatColumnKey, string>;

const TAGS = ['legendary', 'mythical', 'baby'] as const satisfies readonly TagKey[];

export const TAG_LABELS: Record<TagKey, string> = {
  legendary: '传说的宝可梦',
  mythical: '幻之宝可梦',
  baby: '幼年形态',
};

/**
 * 外部输入（来自 URL 查询串或 JSON 请求体）可能是任意字符串/数组。
 * 这里刻意把类型放宽到「未知」，由 normalizeParams 统一收敛 ——
 * 免得 API 层为了哄类型系统写一堆假断言。
 */
type NumericInput = number | string | null | undefined;
type SloppyList = string | (string | number)[] | null | undefined;

export interface SearchParams {
  /** 关键词：中文名 / 英文名 / 日文名 / 分类 / 编号 */
  q?: string | null;
  /** 属性筛选 */
  types?: SloppyList;
  /** any = 拥有其中任一属性；all = 必须同时拥有列出的全部属性 */
  typeMode?: string | null;
  /** 排除属性：拥有其中任一属性的都不返回 */
  excludeTypes?: SloppyList;
  /** 世代（1 / 2 / 3） */
  generations?: SloppyList;
  /** 种族值总和区间 */
  statTotalMin?: NumericInput;
  statTotalMax?: NumericInput;
  /** 单项种族值区间 */
  statKey?: string | null;
  statMin?: NumericInput;
  statMax?: NumericInput;
  /** 特性（slug，任一匹配即可） */
  abilities?: SloppyList;
  /** 蛋群（slug，任一匹配即可） */
  eggGroups?: SloppyList;
  /** 特殊标记：命中其中任一即可 */
  tags?: SloppyList;
  sort?: string | null;
  order?: string | null;
  page?: NumericInput;
  pageSize?: NumericInput;
}

/* 列表项 / 响应体 / 筛选面的结构定义见 lib/api-types.ts */

/* -------------------------------------------------------------------------- */
/* 参数归一化                                                                   */
/* -------------------------------------------------------------------------- */

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
};

const optionalInt = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const slugArray = (v: unknown): string[] => {
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  return arr
    .map((s) => String(s).trim().toLowerCase())
    .filter((s) => /^[a-z0-9-]{1,40}$/.test(s));
};

const intArray = (v: unknown): number[] => {
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  return arr
    .map((s) => Number.parseInt(String(s).trim(), 10))
    .filter((n) => Number.isFinite(n));
};

const uniq = <T>(arr: T[]): T[] => [...new Set(arr)];

/** 把外部输入（可能来自 URL）收敛成一个明确、可信的对象 */
export function normalizeParams(input: SearchParams): NormalizedParams {
  const typeMode = input.typeMode === 'all' ? 'all' : 'any';
  const order = input.order === 'desc' ? 'desc' : 'asc';
  const sort: SortKey =
    typeof input.sort === 'string' && input.sort in SORT_KEYS ? (input.sort as SortKey) : 'id';
  const statKey: StatColumnKey | null =
    typeof input.statKey === 'string' && input.statKey in STAT_COLUMNS
      ? (input.statKey as StatColumnKey)
      : null;

  const tags = uniq(
    slugArray(input.tags).filter((t): t is TagKey => (TAGS as readonly string[]).includes(t)),
  );

  // 区间上下界传反了就自动交换，不让用户面对「空结果」猜原因
  let statTotalMin = optionalInt(input.statTotalMin);
  let statTotalMax = optionalInt(input.statTotalMax);
  if (statTotalMin != null && statTotalMax != null && statTotalMin > statTotalMax) {
    [statTotalMin, statTotalMax] = [statTotalMax, statTotalMin];
  }
  let statMin = optionalInt(input.statMin);
  let statMax = optionalInt(input.statMax);
  if (statMin != null && statMax != null && statMin > statMax) {
    [statMin, statMax] = [statMax, statMin];
  }

  // 指定了单项区间却没给 statKey 时，默认按「种族值总和」那套不管用，
  // 这里直接退回「没有单项条件」，避免悄悄筛一个用户没选的属性
  if (!statKey) {
    statMin = null;
    statMax = null;
  }

  return {
    q: (input.q ?? '').trim().slice(0, 40),
    types: uniq(slugArray(input.types)),
    typeMode,
    excludeTypes: uniq(slugArray(input.excludeTypes)),
    generations: uniq(intArray(input.generations)).filter((g) => g >= 1 && g <= 4),
    statTotalMin,
    statTotalMax,
    statKey,
    statMin,
    statMax,
    abilities: uniq(slugArray(input.abilities)),
    eggGroups: uniq(slugArray(input.eggGroups)),
    tags,
    sort,
    order,
    page: clampInt(input.page, 1, 10_000, 1),
    pageSize: clampInt(input.pageSize, 12, 200, 48),
  };
}

/* -------------------------------------------------------------------------- */
/* 条件 → WHERE 片段                                                            */
/* -------------------------------------------------------------------------- */

/** LIKE 的通配符要转义，否则用户输入的 % 会变成「匹配一切」 */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

interface Where {
  sql: string;
  params: unknown[];
}

function buildWhere(p: NormalizedParams): Where {
  const clauses: string[] = ['p.in_scope = 1'];
  const params: unknown[] = [];

  if (p.q) {
    const like = likePattern(p.q);
    const parts = [
      'p.name_zh LIKE ? ESCAPE \'\\\'',
      'p.name_en LIKE ? ESCAPE \'\\\'',
      'p.name_ja LIKE ? ESCAPE \'\\\'',
      'p.genus_zh LIKE ? ESCAPE \'\\\'',
    ];
    params.push(like, like, like, like);
    if (/^\d+$/.test(p.q)) {
      /*
       * 纯数字：按图鉴编号命中。
       * 两个坑：
       *  1. 用户会敲前导零（占位提示里就写着「025」），所以必须把 '025' 归一到 25 再比，
       *     直接拿字符串比 '025' = '25' 永远不成立。
       *  2. 只能比 dex_number，不能比主键 —— 现在两者恰好相等，但语义上「编号」是图鉴号。
       */
      const n = Number.parseInt(p.q, 10);
      parts.push('p.dex_number = ?', 'CAST(p.dex_number AS TEXT) LIKE ?');
      params.push(n, `${n}%`);
    }
    clauses.push(`(${parts.join(' OR ')})`);
  }

  if (p.types.length) {
    const holes = p.types.map(() => '?').join(', ');
    if (p.typeMode === 'all') {
      /*
       * 「同时拥有全部属性」用 GROUP BY + HAVING 数不同的属性个数，
       * 比自连接 N 次清楚。count 用 DISTINCT 是防重（同一属性不会在
       * pokemon_type 里出现两次，但 DISTINCT 让意图明确）。
       */
      clauses.push(`p.id IN (
        SELECT pt.pokemon_id FROM pokemon_type pt
        WHERE pt.type_slug IN (${holes})
        GROUP BY pt.pokemon_id
        HAVING COUNT(DISTINCT pt.type_slug) = ?
      )`);
      params.push(...p.types, p.types.length);
    } else {
      clauses.push(`EXISTS (
        SELECT 1 FROM pokemon_type pt
        WHERE pt.pokemon_id = p.id AND pt.type_slug IN (${holes})
      )`);
      params.push(...p.types);
    }
  }

  if (p.excludeTypes.length) {
    const holes = p.excludeTypes.map(() => '?').join(', ');
    clauses.push(`NOT EXISTS (
      SELECT 1 FROM pokemon_type pt
      WHERE pt.pokemon_id = p.id AND pt.type_slug IN (${holes})
    )`);
    params.push(...p.excludeTypes);
  }

  if (p.generations.length) {
    clauses.push(`p.generation IN (${p.generations.map(() => '?').join(', ')})`);
    params.push(...p.generations);
  }

  if (p.statTotalMin != null) {
    clauses.push('p.stat_total >= ?');
    params.push(p.statTotalMin);
  }
  if (p.statTotalMax != null) {
    clauses.push('p.stat_total <= ?');
    params.push(p.statTotalMax);
  }

  if (p.statKey && (p.statMin != null || p.statMax != null)) {
    const col = STAT_COLUMNS[p.statKey]; // 白名单常量，不是用户输入
    if (p.statMin != null) {
      clauses.push(`p.${col} >= ?`);
      params.push(p.statMin);
    }
    if (p.statMax != null) {
      clauses.push(`p.${col} <= ?`);
      params.push(p.statMax);
    }
  }

  if (p.abilities.length) {
    const holes = p.abilities.map(() => '?').join(', ');
    clauses.push(`EXISTS (
      SELECT 1 FROM pokemon_ability pa
      WHERE pa.pokemon_id = p.id AND pa.ability_slug IN (${holes})
    )`);
    params.push(...p.abilities);
  }

  if (p.eggGroups.length) {
    const holes = p.eggGroups.map(() => '?').join(', ');
    clauses.push(`EXISTS (
      SELECT 1 FROM pokemon_egg_group pg
      WHERE pg.pokemon_id = p.id AND pg.egg_group_slug IN (${holes})
    )`);
    params.push(...p.eggGroups);
  }

  if (p.tags.length) {
    const parts: string[] = [];
    for (const t of p.tags) {
      if (t === 'legendary') parts.push('p.is_legendary = 1');
      if (t === 'mythical') parts.push('p.is_mythical = 1');
      if (t === 'baby') parts.push('p.is_baby = 1');
    }
    if (parts.length) clauses.push(`(${parts.join(' OR ')})`);
  }

  return { sql: clauses.join('\n    AND '), params };
}

/* -------------------------------------------------------------------------- */
/* 属性联表（避免 N+1）                                                          */
/* -------------------------------------------------------------------------- */

const typeNamesCache = () => {
  const rows = all<{ slug: string; name_zh: string }>('SELECT slug, name_zh FROM type');
  return Object.fromEntries(rows.map((r) => [r.slug, r.name_zh]));
};

function attachTypes(ids: number[]): Record<number, { types: string[]; names: string[] }> {
  const out: Record<number, { types: string[]; names: string[] }> = {};
  if (!ids.length) return out;

  const names = typeNamesCache();
  const holes = ids.map(() => '?').join(', ');
  const rows = all<{ pokemon_id: number; type_slug: string }>(
    `SELECT pokemon_id, type_slug FROM pokemon_type
     WHERE pokemon_id IN (${holes}) ORDER BY pokemon_id, slot`,
    ...ids,
  );

  for (const r of rows) {
    const bucket = (out[r.pokemon_id] ??= { types: [], names: [] });
    bucket.types.push(r.type_slug);
    bucket.names.push(names[r.type_slug] ?? r.type_slug);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* 主查询                                                                       */
/* -------------------------------------------------------------------------- */

export function searchPokemon(input: SearchParams): SearchResponse {
  const p = normalizeParams(input);
  const where = buildWhere(p);

  const total =
    one<{ c: number }>(`SELECT COUNT(*) AS c FROM pokemon p WHERE ${where.sql}`, ...where.params)
      ?.c ?? 0;

  const pageCount = Math.max(1, Math.ceil(total / p.pageSize));
  const page = Math.min(p.page, pageCount);
  const offset = (page - 1) * p.pageSize;

  const orderCol = SORT_KEYS[p.sort];
  const dir = p.order === 'desc' ? 'DESC' : 'ASC';

  const rows = all<Record<string, unknown>>(
    `SELECT
        p.id, p.name_zh, p.name_en, p.name_ja, p.dex_number, p.generation, p.genus_zh,
        p.stat_hp, p.stat_attack, p.stat_defense,
        p.stat_sp_attack, p.stat_sp_defense, p.stat_speed, p.stat_total,
        p.sprite, p.is_legendary, p.is_mythical, p.is_baby
      FROM pokemon p
      WHERE ${where.sql}
      -- 次级排序固定用编号，保证同一批数据每次翻页顺序稳定
      ORDER BY ${orderCol} ${dir}, p.id ASC
      LIMIT ? OFFSET ?`,
    ...where.params,
    p.pageSize,
    offset,
  );

  const ids = rows.map((r) => Number(r.id));
  const typeMap = attachTypes(ids);

  const items: PokemonListItem[] = rows.map((r) => {
    const t = typeMap[Number(r.id)] ?? { types: [], names: [] };
    return {
      id: Number(r.id),
      nameZh: String(r.name_zh),
      nameEn: String(r.name_en),
      nameJa: String(r.name_ja),
      dexNumber: Number(r.dex_number),
      generation: Number(r.generation),
      genusZh: String(r.genus_zh),
      types: t.types,
      typeNamesZh: t.names,
      statTotal: Number(r.stat_total),
      stats: {
        hp: Number(r.stat_hp),
        attack: Number(r.stat_attack),
        defense: Number(r.stat_defense),
        'special-attack': Number(r.stat_sp_attack),
        'special-defense': Number(r.stat_sp_defense),
        speed: Number(r.stat_speed),
      },
      sprite: String(r.sprite),
      isLegendary: Boolean(r.is_legendary),
      isMythical: Boolean(r.is_mythical),
      isBaby: Boolean(r.is_baby),
    };
  });

  return { total, page, pageSize: p.pageSize, pageCount, items, applied: p };
}

/* -------------------------------------------------------------------------- */
/* 筛选面（下拉框/芯片上的计数）                                                  */
/* -------------------------------------------------------------------------- */

/*
 * 说明：这里的 SQL 直接把列别名写成 camelCase（AS nameZh / AS regionZh），
 * 让行对象天生就是前端的契约形状，省掉一层「snake_case → camelCase」的映射 ——
 * 少一层映射就少一处漏字段的机会。
 */
export function getFacets(): Facets {
  const total = one<{ c: number }>('SELECT COUNT(*) AS c FROM pokemon WHERE in_scope = 1')?.c ?? 0;

  const generations = all<{ id: number; nameZh: string; regionZh: string; count: number }>(
    `SELECT g.id, g.name_zh AS nameZh, g.region_zh AS regionZh, COUNT(p.id) AS count
     FROM generation g
     LEFT JOIN pokemon p ON p.generation = g.id AND p.in_scope = 1
     GROUP BY g.id ORDER BY g.id`,
  );

  // 属性按「官方属性表的顺序」排（type.sort_order），不是按计数，避免顺序跳来跳去
  const types = all<{ slug: string; nameZh: string; count: number }>(
    `SELECT t.slug, t.name_zh AS nameZh, COUNT(p.id) AS count
     FROM type t
     JOIN pokemon_type pt ON pt.type_slug = t.slug
     JOIN pokemon p ON p.id = pt.pokemon_id AND p.in_scope = 1
     GROUP BY t.slug ORDER BY t.sort_order`,
  );

  const abilities = all<{ slug: string; nameZh: string; count: number }>(
    `SELECT a.slug, a.name_zh AS nameZh, COUNT(p.id) AS count
     FROM ability a
     JOIN pokemon_ability pa ON pa.ability_slug = a.slug
     JOIN pokemon p ON p.id = pa.pokemon_id AND p.in_scope = 1
     GROUP BY a.slug ORDER BY count DESC, a.name_zh`,
  );

  const eggGroups = all<{ slug: string; nameZh: string; count: number }>(
    `SELECT g.slug, g.name_zh AS nameZh, COUNT(p.id) AS count
     FROM egg_group g
     JOIN pokemon_egg_group pg ON pg.egg_group_slug = g.slug
     JOIN pokemon p ON p.id = pg.pokemon_id AND p.in_scope = 1
     GROUP BY g.slug ORDER BY count DESC, g.name_zh`,
  );

  const statTotal = one<{ min: number; max: number }>(
    'SELECT MIN(stat_total) AS min, MAX(stat_total) AS max FROM pokemon WHERE in_scope = 1',
  ) ?? { min: 0, max: 0 };

  const tagCount = (col: string) =>
    one<{ c: number }>(`SELECT COUNT(*) AS c FROM pokemon WHERE in_scope = 1 AND ${col} = 1`)?.c ?? 0;

  const scope = one<{ min: number; max: number }>(
    'SELECT MIN(id) AS min, MAX(id) AS max FROM pokemon WHERE in_scope = 1',
  ) ?? { min: 1, max: 493 };

  return {
    total,
    scope: { min: scope.min, max: scope.max },
    generations,
    types,
    abilities,
    eggGroups,
    statTotal,
    sortOptions: SORT_LABELS,
    tags: [
      { key: 'legendary', label: TAG_LABELS.legendary, count: tagCount('is_legendary') },
      { key: 'mythical', label: TAG_LABELS.mythical, count: tagCount('is_mythical') },
      { key: 'baby', label: TAG_LABELS.baby, count: tagCount('is_baby') },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* 详情：单只 + 所属进化链                                                       */
/* -------------------------------------------------------------------------- */

/**
 * 返回结构见 lib/api-types.ts 的 DetailResponse：
 * pokemon 与 data/pokedex.json 里的单只结构同构，前端 PokemonScreen 可以直接吃。
 *
 * **唯一的例外是 forms**：这条路径固定给空数组（数据库里没有形态表），
 * 详情页用的是静态数据，形态齐全。见 rowToPokemon 里的说明。
 */

/** 英文种族值 key ↔ pokemon 表的列名 */
const STAT_EN = [
  ['hp', 'stat_hp'],
  ['attack', 'stat_attack'],
  ['defense', 'stat_defense'],
  ['special-attack', 'stat_sp_attack'],
  ['special-defense', 'stat_sp_defense'],
  ['speed', 'stat_speed'],
] as const;

const STAT_ZH_LABEL: Record<string, string> = {
  hp: 'HP',
  attack: '攻击',
  defense: '防御',
  'special-attack': '特攻',
  'special-defense': '特防',
  speed: '速度',
};

/** 数据库行 → 与静态数据同构的 Pokemon 对象 */
function rowToPokemon(
  row: Record<string, unknown>,
  typeInfo: { types: string[]; names: string[] },
  abilities: { slug: string; nameZh: string; descZh: string; hidden: boolean }[],
  eggGroups: { slug: string; nameZh: string }[],
): Pokemon {
  const stats: Record<string, number> = {};
  const statsZh: Record<string, number> = {};
  for (const [en, col] of STAT_EN) {
    const v = Number(row[col] ?? 0);
    stats[en] = v;
    statsZh[STAT_ZH_LABEL[en]] = v;
  }

  return {
    id: Number(row.id),
    name: String(row.name_en),
    nameZh: String(row.name_zh),
    nameJa: String(row.name_ja ?? ''),
    dexNumber: Number(row.dex_number),
    types: typeInfo.types,
    typeNamesZh: typeInfo.names,
    stats,
    statsZh,
    statTotal: Number(row.stat_total),
    abilities,
    heightM: Number(row.height_m),
    weightKg: Number(row.weight_kg),
    genusZh: String(row.genus_zh ?? ''),
    flavorZh: String(row.flavor_zh ?? ''),
    /*
     * 宣传语是**可选**字段：DB 里没有这一行就是 NULL。
     * 这里刻意不写成 `String(row.tagline_zh ?? '')` —— 那会把 NULL 变成空串，
     * 而空串是 truthy 的，前端 `{taglineZh && <PromoRibbon …/>}` 会渲染出一条空白飘带。
     * 给 undefined（等价于「字段不存在」）才是正确的降级。
     */
    taglineZh: row.tagline_zh == null ? undefined : String(row.tagline_zh),
    sprite: String(row.sprite),
    /*
     * 缩略图不在 DB 里单列一列 —— 它和 sprite 是同一套命名规则（`{id}-thumb.png`），
     * 按 id 派生即可。写死 DB 列反而多一处要同步的地方（build-data 改了命名，
     * 这里不跟就会 404）。
     */
    thumb: `/sprites/${Number(row.id)}-thumb.png`,
    cryUrl: String(row.cry_url ?? ''),
    colorKey: String(row.color ?? 'normal'),
    isBaby: Boolean(row.is_baby),
    evolvesFrom: row.evolves_from_name == null ? null : String(row.evolves_from_name),
    evolvesFromId: row.evolves_from_id == null ? null : Number(row.evolves_from_id),
    generation: Number(row.generation),
    inScope: Boolean(row.in_scope),
    chainId: row.chain_id == null ? null : Number(row.chain_id),
    captureRate: row.capture_rate == null ? null : Number(row.capture_rate),
    baseHappiness: row.base_happiness == null ? null : Number(row.base_happiness),
    eggGroups,
    isLegendary: Boolean(row.is_legendary),
    isMythical: Boolean(row.is_mythical),
    /*
     * 形态**不随查询路径返回**：数据库里没有形态表（形态对列表页的筛选/排序毫无用处，
     * 灌进来只是让 246 行数据多占一份）。详情页走的是静态数据那条路，形态是齐的。
     *
     * 这里给空数组而不是省略字段，是因为 UI 的口径就是「空数组 = 没有额外形态」。
     * ⚠️ 所以：**如果以后要把 /api/pokedex/[id] 接到详情页**，必须先把形态灌进数据库，
     * 否则皮卡丘（17 个形态）、洛托姆（6 个）这类页面会静默地少掉整块形态 UI，
     * 不报任何错。详见 README「形态」一节。
     */
    forms: [],
  };
}

/** 由 evolution 的边还原成一棵以链根为起点的树 */
function buildTreeFromEdges(
  edges: { from_id: number; to_id: number; condition: string }[],
  rootId: number,
): EvoNode[] {
  const byFrom = new Map<number, { to_id: number; condition: string }[]>();
  for (const e of edges) {
    const list = byFrom.get(e.from_id) ?? [];
    list.push({ to_id: e.to_id, condition: e.condition });
    byFrom.set(e.from_id, list);
  }
  const build = (id: number): EvoNode[] =>
    (byFrom.get(id) ?? []).map((e) => ({
      id: e.to_id,
      condition: e.condition,
      children: build(e.to_id),
    }));
  return build(rootId);
}

export function getPokemonDetail(id: number): DetailResponse | null {
  const row = one<Record<string, unknown>>(
    `SELECT p.*, e.name_en AS evolves_from_name
     FROM pokemon p
     LEFT JOIN pokemon e ON e.id = p.evolves_from_id
     WHERE p.id = ?`,
    id,
  );
  if (!row) return null;

  const abilities = all<{ slug: string; name_zh: string; desc_zh: string; is_hidden: number }>(
    `SELECT a.slug, a.name_zh, a.desc_zh, pa.is_hidden
     FROM pokemon_ability pa JOIN ability a ON a.slug = pa.ability_slug
     WHERE pa.pokemon_id = ? ORDER BY pa.slot`,
    id,
  ).map((a) => ({ slug: a.slug, nameZh: a.name_zh, descZh: a.desc_zh, hidden: Boolean(a.is_hidden) }));

  const eggGroups = all<{ slug: string; name_zh: string }>(
    `SELECT g.slug, g.name_zh
     FROM pokemon_egg_group pg JOIN egg_group g ON g.slug = pg.egg_group_slug
     WHERE pg.pokemon_id = ? ORDER BY g.name_zh`,
    id,
  ).map((g) => ({ slug: g.slug, nameZh: g.name_zh }));

  const typeMap = attachTypes([id]);
  const pokemon = rowToPokemon(row, typeMap[id] ?? { types: [], names: [] }, abilities, eggGroups);

  /* ---- 所属进化链 ---- */
  const chainId = pokemon.chainId;
  let line: EvoLine = { key: pokemon.name, chainId: null, rootId: pokemon.id, tree: [] };
  const members: EvoMembers = {
    [pokemon.id]: {
      id: pokemon.id,
      nameZh: pokemon.nameZh,
      dexNumber: pokemon.dexNumber,
      sprite: pokemon.sprite,
      types: pokemon.types,
    },
  };

  if (chainId != null) {
    const rootId =
      one<{ root_id: number }>('SELECT root_id FROM chain WHERE id = ?', chainId)?.root_id ?? pokemon.id;

    const edges = all<{ from_id: number; to_id: number; condition: string }>(
      'SELECT from_id, to_id, condition FROM evolution WHERE chain_id = ?',
      chainId,
    );

    const roster = all<{ id: number; name_zh: string; dex_number: number; sprite: string; name_en: string }>(
      'SELECT id, name_zh, name_en, dex_number, sprite FROM pokemon WHERE chain_id = ? ORDER BY id',
      chainId,
    );
    const rosterTypes = attachTypes(roster.map((r) => r.id));
    for (const r of roster) {
      members[r.id] = {
        id: r.id,
        nameZh: r.name_zh,
        dexNumber: r.dex_number,
        sprite: r.sprite,
        types: rosterTypes[r.id]?.types ?? [],
      };
    }

    const root = roster.find((r) => r.id === rootId);
    line = {
      key: root?.name_en ?? pokemon.name,
      chainId,
      rootId,
      tree: buildTreeFromEdges(edges, rootId),
    };
  }

  return { pokemon, line, members };
}

/* -------------------------------------------------------------------------- */
/* 属性分类浏览                                                                  */
/* -------------------------------------------------------------------------- */

/* 返回结构见 lib/api-types.ts 的 TypeProfile */

export function getTypeProfiles(): TypeProfile[] {
  const names = typeNamesCache();
  const base = all<{ slug: string; name_zh: string; count: number }>(
    `SELECT t.slug, t.name_zh, COUNT(p.id) AS count
     FROM type t
     JOIN pokemon_type pt ON pt.type_slug = t.slug
     JOIN pokemon p ON p.id = pt.pokemon_id AND p.in_scope = 1
     GROUP BY t.slug ORDER BY t.sort_order`,
  );

  const effects = all<{ attack_type: string; defend_type: string; multiplier: number }>(
    'SELECT attack_type, defend_type, multiplier FROM type_effect',
  );

  const label = (slug: string) => ({ slug, nameZh: names[slug] ?? slug });

  return base.map((t) => ({
    slug: t.slug,
    nameZh: t.name_zh,
    count: t.count,
    weakTo: effects.filter((e) => e.defend_type === t.slug && e.multiplier === 2).map((e) => label(e.attack_type)),
    resists: effects.filter((e) => e.defend_type === t.slug && e.multiplier === 0.5).map((e) => label(e.attack_type)),
    immuneTo: effects.filter((e) => e.defend_type === t.slug && e.multiplier === 0).map((e) => label(e.attack_type)),
    strongAgainst: effects.filter((e) => e.attack_type === t.slug && e.multiplier === 2).map((e) => label(e.defend_type)),
  }));
}
