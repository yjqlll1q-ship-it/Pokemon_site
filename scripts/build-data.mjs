/**
 * build-data.mjs
 * ---------------------------------------------------------------------------
 * 把 PokéAPI 的数据固化成静态 JSON，并把官方立绘下载到 public/sprites/。
 *
 * 本版范围：**第一~第三世代（全国图鉴 #1–386）全部宝可梦**。
 *   为了进化链完整，链上出现的第四世代及以后成员（Tangrowth / Magnezone / Budew …）
 *   也会一并抓下来，但它们带 generation=4+，不进图鉴查询的默认结果集。
 *
 * 为什么这么做：
 *   1. 站点不在运行时请求第三方 API（首屏快、不怕对方限流、数据可复现）。
 *   2. 数据结构完全由我们掌控：
 *        data/pokedex.json  → 前端与建库脚本共用的唯一契约
 *        data/pokedex.db    → 由 scripts/build-db.mjs 从这里灌出来
 *   3. 要扩到更多世代 = 调大 SCOPE_MAX，重跑本脚本即可。
 *
 * 用法:
 *   node scripts/build-data.mjs          # 增量：已有缓存/图片会跳过
 *   node scripts/build-data.mjs --force  # 强制重新抓取与重下图片
 *
 * 数据来源: PokéAPI v2 (https://pokeapi.co)
 *           立绘: PokeAPI/sprites (official-artwork)
 *
 * 缓存：所有 API 响应按 URL 的 sha1 落在 .cache/pokeapi/ 下（已 gitignore）。
 *       中途断掉直接重跑即可，只补缺的部分。
 */

import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const SPRITE_DIR = path.join(ROOT, 'public', 'sprites');
const CACHE_DIR = path.join(ROOT, '.cache', 'pokeapi');

const FORCE = process.argv.includes('--force');
const API = 'https://pokeapi.co/api/v2';

/** 抓取范围：全国图鉴 #1–386 = 第一~第三世代 */
const SCOPE_MIN = 1;
const SCOPE_MAX = 386;

/**
 * 首页「最初的伙伴」展示的 10 条进化线。
 * 挑选标准：覆盖单线进化与多分支进化（Eevee 8 分支、Tyrogue 3 分支、Wurmple 双分支）。
 * 图鉴查询页不看这个，它是全量的。
 */
const BASE_FORMS = [1, 4, 7, 43, 60, 133, 172, 236, 265, 280];

/** 精灵图统一来源：官方立绘，保证全站画风一致 */
const spriteUrl = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

/* -------------------------------------------------------------------------- */
/* 网络层：带重试的 fetch + 两级缓存（内存 + 磁盘）                              */
/* -------------------------------------------------------------------------- */

const jsonCache = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cacheFile = (url) => path.join(CACHE_DIR, `${createHash('sha1').update(url).digest('hex')}.json`);

async function fetchJson(url, retries = 5) {
  if (jsonCache.has(url)) return jsonCache.get(url);

  const file = cacheFile(url);
  if (!FORCE) {
    try {
      const cached = JSON.parse(await readFile(file, 'utf8'));
      jsonCache.set(url, cached);
      return cached;
    } catch {
      /* 没缓存，继续走网络 */
    }
  }

  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'pokedex-site-build' } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = await res.json();
      jsonCache.set(url, json);
      await writeFile(file, JSON.stringify(json), 'utf8');
      return json;
    } catch (err) {
      lastErr = err;
      await sleep(500 * (i + 1));
    }
  }
  throw new Error(`请求失败 ${url}: ${lastErr?.message}`);
}

/** 小并发池：对 PokéAPI 友好一点 */
async function mapPool(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

async function download(url, file) {
  if (!FORCE) {
    try {
      const s = await stat(file);
      if (s.size > 1024) return 'cached';
    } catch {
      /* 不存在，继续下载 */
    }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`立绘下载失败 ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(file, buf);
  return 'downloaded';
}

/* -------------------------------------------------------------------------- */
/* 多语言 helper                                                               */
/* -------------------------------------------------------------------------- */

const pickZh = (names, fallback = '') => {
  if (!Array.isArray(names)) return fallback;
  // 注意：PokéAPI v2 的语言代码是全小写（zh-hans），别写成 zh-Hans，否则永远匹配不到。
  const byLang = (code) => names.find((n) => n.language?.name?.toLowerCase() === code);
  return (byLang('zh-hans') || byLang('zh-hant') || byLang('en'))?.name ?? fallback;
};

/**
 * 分类（「种子宝可梦」这种）取自 species.genera，条目形状是 `{ genus, language }` ——
 * **不是** names 那种 `{ name, language }`。
 * 曾经直接拿取名字的 helper 去取分类，字段名对不上，430 只的分类全成了空字符串；
 * 表现是「按分类搜索」搜不到、卡片副标题退回显示世代。所以这里单列一个取值函数。
 */
const pickGenus = (genera) => {
  if (!Array.isArray(genera)) return '';
  const byLang = (code) => genera.find((g) => g.language?.name?.toLowerCase() === code);
  return (byLang('zh-hans') || byLang('zh-hant') || byLang('en'))?.genus ?? '';
};

/**
 * PokéAPI 的 location 资源多数没有中文名（只有 fr/de/en）。
 * 这里只对我们用得到的少数地点做人工补齐，避免出现"在Eterna Forest"这种半截中文。
 */
const LOCATION_ZH = {
  'eterna-forest': '百代森林',
  'sinnoh-route-217': '217 号道路',
};

const titleize = (slug) =>
  slug.split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');

/** 精灵/道具/招式/地点/特性/蛋群的中文名，按需查一次并缓存 */
const zhNameCache = new Map();
async function zhName(kind, slug) {
  if (!slug) return '';
  if (kind === 'location' && LOCATION_ZH[slug]) return LOCATION_ZH[slug];
  const key = `${kind}/${slug}`;
  if (zhNameCache.has(key)) return zhNameCache.get(key);
  let name = titleize(slug);
  try {
    const data = await fetchJson(`${API}/${kind}/${slug}`);
    name = pickZh(data.names, name) || name;
  } catch {
    /* 查不到就用英文兜底 */
  }
  zhNameCache.set(key, name);
  return name;
}

/* -------------------------------------------------------------------------- */
/* 属性：中文名 + 相克关系（相克表直接来自 /type/{slug} 的 damage_relations）      */
/* -------------------------------------------------------------------------- */

const TYPE_SLUGS = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison',
  'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark',
  'steel', 'fairy',
];

const typeZhCache = new Map();
async function typeZh(slug) {
  if (typeZhCache.has(slug)) return typeZhCache.get(slug);
  let name = titleize(slug);
  try {
    const data = await fetchJson(`${API}/type/${slug}`);
    name = pickZh(data.names, name) || name;
  } catch {
    /* ignore */
  }
  typeZhCache.set(slug, name);
  return name;
}

/**
 * 属性表：中文名 + 相克。
 * 注意 PokéAPI 的 damage_relations 是「从进攻方看」的：
 *   double_damage_from = 用该属性的招式打过来是 2 倍 → 也就是这个属性的**弱点**
 */
async function buildTypes() {
  return mapPool(TYPE_SLUGS, 4, async (slug) => {
    const data = await fetchJson(`${API}/type/${slug}`);
    const rel = data.damage_relations ?? {};
    const names = (list) => (list ?? []).map((t) => t.name);
    return {
      slug,
      nameZh: pickZh(data.names, titleize(slug)) || titleize(slug),
      weakTo: names(rel.double_damage_from),
      resists: names(rel.half_damage_from),
      immuneTo: names(rel.no_damage_from),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* 世代                                                                        */
/* -------------------------------------------------------------------------- */

const GENERATION_KEYS = ['generation-i', 'generation-ii', 'generation-iii'];
const REGION_FALLBACK = { 1: '关都', 2: '城都', 3: '丰缘' };
const GEN_RANGE = { 1: [1, 151], 2: [152, 251], 3: [252, 386] };

async function buildGenerations() {
  return mapPool(GENERATION_KEYS, 3, async (key, i) => {
    const id = i + 1;
    let nameZh = `第${['一', '二', '三'][i]}世代`;
    let regionZh = REGION_FALLBACK[id];
    try {
      const g = await fetchJson(`${API}/generation/${id}`);
      nameZh = pickZh(g.names, nameZh) || nameZh;
      const regionName = g.main_region?.name;
      if (regionName) regionZh = await zhName('region', regionName);
    } catch {
      /* 用兜底 */
    }
    return { id, key, nameZh, regionZh, start: GEN_RANGE[id][0], end: GEN_RANGE[id][1] };
  });
}

/* -------------------------------------------------------------------------- */
/* 进化条件 → 人话                                                             */
/* -------------------------------------------------------------------------- */

const GENDER_TXT = { 1: '仅雌性', 2: '仅雄性', 3: '无性别' };
const TIME_TXT = { day: '白天', night: '夜晚', dusk: '黄昏' };

async function conditionText(detail) {
  const parts = [];
  const t = detail.trigger?.name;

  if (t === 'level-up') {
    if (typeof detail.min_level === 'number') parts.push(`等级 ${detail.min_level}`);
    if (detail.min_happiness) parts.push('亲密度足够');
    if (detail.min_affection) parts.push('友好度足够');
    if (detail.min_beauty) parts.push('美丽度足够');
    if (detail.time_of_day) parts.push(TIME_TXT[detail.time_of_day] ?? detail.time_of_day);
    if (detail.known_move) parts.push(`学会「${await zhName('move', detail.known_move.name)}」`);
    if (detail.known_move_type) parts.push(`学会${await typeZh(detail.known_move_type.name)}属性招式`);
    if (detail.held_item) parts.push(`携带「${await zhName('item', detail.held_item.name)}」`);
    if (detail.location) parts.push(`在${await zhName('location', detail.location.name)}`);
    if (detail.needs_overworld_rain) parts.push('下雨时');
    if (detail.turn_upside_down) parts.push('倒置主机');
    if (typeof detail.relative_physical_stats === 'number') {
      const map = { 1: '攻击 > 防御', 0: '攻击 = 防御', '-1': '攻击 < 防御' };
      parts.push(map[detail.relative_physical_stats] ?? '');
    }
    if (detail.party_species) parts.push(`队伍中带有${await zhName('pokemon-species', detail.party_species.name)}`);
  } else if (t === 'use-item') {
    parts.push(`使用「${await zhName('item', detail.item?.name ?? '')}」`);
  } else if (t === 'trade') {
    parts.push(detail.held_item
      ? `通信交换（携带「${await zhName('item', detail.held_item.name)}」）`
      : '通信交换');
  } else if (t === 'shed') {
    parts.push('队伍留有空位且携带精灵球时升级');
  } else if (t === 'spin') {
    parts.push('旋转并升级');
  } else if (t === 'tower-of-darkness' || t === 'tower-of-waters') {
    parts.push('完成相应修行后升级');
  } else if (t === 'three-critical-hits') {
    parts.push('一场战斗命中 3 次要害');
  } else if (t === 'agile-style-move' || t === 'strong-style-move') {
    parts.push('使用对应风格招式 20 次');
  } else if (t) {
    parts.push(t.replace(/-/g, ' '));
  }

  if (detail.gender != null && GENDER_TXT[detail.gender]) parts.push(GENDER_TXT[detail.gender]);

  const text = parts.filter(Boolean).join(' · ');
  return text || '特殊条件';
}

/* -------------------------------------------------------------------------- */
/* 组装单只宝可梦的展示数据                                                     */
/* -------------------------------------------------------------------------- */

const STAT_LABEL = {
  hp: 'HP',
  attack: '攻击',
  defense: '防御',
  'special-attack': '特攻',
  'special-defense': '特防',
  speed: '速度',
};
const STAT_ORDER = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];

/** generation-iii → 3 */
const genNumber = (name) => {
  const m = /generation-([ivx]+)$/.exec(name ?? '');
  if (!m) return 0;
  const roman = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9 };
  return roman[m[1]] ?? 0;
};

async function buildPokemon(speciesId, chainIdBySpecies) {
  const [pokemon, species] = await Promise.all([
    fetchJson(`${API}/pokemon/${speciesId}`),
    fetchJson(`${API}/pokemon-species/${speciesId}`),
  ]);

  const types = [...pokemon.types]
    .sort((a, b) => a.slot - b.slot)
    .map((t) => t.type.name);

  const stats = {};
  for (const s of pokemon.stats) {
    if (STAT_ORDER.includes(s.stat.name)) stats[s.stat.name] = s.base_stat;
  }
  const statsZh = {};
  for (const s of pokemon.stats) {
    if (STAT_LABEL[s.stat.name]) statsZh[STAT_LABEL[s.stat.name]] = s.base_stat;
  }
  const statTotal = STAT_ORDER.reduce((sum, k) => sum + (stats[k] ?? 0), 0);

  const abilities = await mapPool(pokemon.abilities, 4, async (a) => ({
    slug: a.ability.name,
    nameZh: await zhName('ability', a.ability.name),
    hidden: a.is_hidden,
  }));

  const flavorEntry =
    species.flavor_text_entries.find(
      (f) => f.language.name.toLowerCase() === 'zh-hans' && f.version?.name === 'sword',
    ) ??
    species.flavor_text_entries.find((f) => f.language.name.toLowerCase() === 'zh-hans') ??
    species.flavor_text_entries.find((f) => f.language.name.toLowerCase() === 'zh-hant') ??
    species.flavor_text_entries.find((f) => f.language.name.toLowerCase() === 'en');

  const eggGroups = await mapPool(species.egg_groups ?? [], 3, async (g) => ({
    slug: g.name,
    nameZh: await zhName('egg-group', g.name),
  }));

  const generation = genNumber(species.generation?.name);

  return {
    id: speciesId,
    name: pokemon.name,
    nameZh: pickZh(species.names, titleize(pokemon.name)),
    nameJa: species.names.find((n) => n.language.name.toLowerCase() === 'ja-hrkt')?.name ?? '',
    dexNumber: speciesId,
    types,
    typeNamesZh: await mapPool(types, 4, (t) => typeZh(t)),
    stats,
    statsZh,
    statTotal,
    abilities,
    heightM: pokemon.height / 10,
    weightKg: pokemon.weight / 10,
    genusZh: pickGenus(species.genera),
    flavorZh: (flavorEntry?.flavor_text ?? '').replace(/[\n\f\r\u000c]/g, '').trim(),
    sprite: `/sprites/${speciesId}.png`,
    colorKey: species.color?.name ?? 'normal',
    isBaby: species.is_baby,
    evolvesFrom: species.evolves_from_species?.name ?? null,
    /* ---- 图鉴查询新增 ---- */
    evolvesFromId: null, // 稍后由进化链回填
    generation,
    inScope: speciesId >= SCOPE_MIN && speciesId <= SCOPE_MAX,
    chainId: chainIdBySpecies.get(speciesId) ?? null,
    captureRate: species.capture_rate ?? null,
    baseHappiness: species.base_happiness ?? null,
    eggGroups,
    isLegendary: Boolean(species.is_legendary),
    isMythical: Boolean(species.is_mythical),
  };
}

/* -------------------------------------------------------------------------- */
/* 进化树                                                                      */
/* -------------------------------------------------------------------------- */

const idFromUrl = (url) => Number(url.split('/').filter(Boolean).pop());

/** 递归展开一条进化链；allIds 收集链上出现的所有图鉴编号 */
async function buildTree(chainNode, allIds) {
  const speciesId = idFromUrl(chainNode.species.url);
  allIds.add(speciesId);

  const children = [];
  const detailsList = chainNode.evolves_to ?? [];
  const texts = await mapPool(detailsList, 3, async (child) =>
    conditionText(child.evolution_details?.[0] ?? {}),
  );
  const dupes = texts.reduce((m, t) => m.set(t, (m.get(t) ?? 0) + 1), new Map());

  for (let i = 0; i < detailsList.length; i++) {
    const child = detailsList[i];
    let condition = texts[i];
    // Wurmple 这类同条件随机分支，补一句说明
    if (detailsList.length > 1 && dupes.get(condition) > 1) {
      condition = `${condition} · 随机分支`;
    }
    const childId = idFromUrl(child.species.url);
    children.push({
      id: childId,
      condition,
      children: await buildTree(child, allIds),
    });
  }

  return children;
}

/** 把「父 → 子」的边摊平，供建库时写入 evolution 表 */
function collectEdges(nodes, fromId, out) {
  for (const node of nodes) {
    out.push({ fromId, toId: node.id, condition: node.condition });
    collectEdges(node.children, node.id, out);
  }
  return out;
}

/* -------------------------------------------------------------------------- */

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(SPRITE_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });

  const scopeIds = [];
  for (let i = SCOPE_MIN; i <= SCOPE_MAX; i++) scopeIds.push(i);
  console.log(`[build-data] 范围 #${SCOPE_MIN}–#${SCOPE_MAX}（${scopeIds.length} 只），开始抓取…`);

  /* --- 1. 世代与属性元数据 --- */
  const [generations, types] = await Promise.all([buildGenerations(), buildTypes()]);
  console.log(`[build-data] 世代 ${generations.length} 个 / 属性 ${types.length} 种`);

  /* --- 2. 找出范围内所有宝可梦所属的进化链 --- */
  const chainUrls = new Map(); // chainId -> url
  const chainIdBySpecies = new Map();

  await mapPool(scopeIds, 6, async (id) => {
    const species = await fetchJson(`${API}/pokemon-species/${id}`);
    const url = species.evolution_chain?.url;
    if (!url) return null;
    const chainId = idFromUrl(url);
    chainUrls.set(chainId, url);
    chainIdBySpecies.set(id, chainId);
    return chainId;
  });
  console.log(`[build-data] 涉及 ${chainUrls.size} 条进化链`);

  /* --- 3. 展开进化链，收集链上全部成员 --- */
  const allIds = new Set(scopeIds);
  const lines = [];

  const chainEntries = [...chainUrls.entries()].sort((a, b) => a[0] - b[0]);
  await mapPool(chainEntries, 5, async ([chainId, url]) => {
    const chain = await fetchJson(url);
    const rootId = idFromUrl(chain.chain.species.url);
    const tree = await buildTree(chain.chain, allIds);
    return lines.push({ key: chain.chain.species.name, chainId, rootId, tree });
  });

  // 回填 chainId：链上超出范围的成员也要能查到所属链
  for (const line of lines) {
    const walk = (nodes) => {
      for (const n of nodes) {
        if (!chainIdBySpecies.has(n.id)) chainIdBySpecies.set(n.id, line.chainId);
        walk(n.children);
      }
    };
    if (!chainIdBySpecies.has(line.rootId)) chainIdBySpecies.set(line.rootId, line.chainId);
    walk(line.tree);
  }

  lines.sort((a, b) => a.rootId - b.rootId);

  const ids = [...allIds].sort((a, b) => a - b);
  console.log(`[build-data] 链上共 ${ids.length} 只（其中范围内 ${scopeIds.length} 只），下载立绘…`);

  /* --- 4. 立绘 --- */
  await mapPool(ids, 8, async (id) => {
    const r = await download(spriteUrl(id), path.join(SPRITE_DIR, `${id}.png`));
    process.stdout.write(r === 'cached' ? '.' : '+');
    return id;
  });
  process.stdout.write('\n');

  /* --- 5. 逐只组装数据 --- */
  console.log('[build-data] 拉取宝可梦明细…');
  const pokemon = {};
  let done = 0;
  await mapPool(ids, 6, async (id) => {
    pokemon[id] = await buildPokemon(id, chainIdBySpecies);
    if (++done % 50 === 0) process.stdout.write(`  ${done}/${ids.length}\n`);
  });

  /* --- 6. 回填 evolvesFromId（用进化树的边，比 slug 更可靠） --- */
  const edges = [];
  for (const line of lines) collectEdges(line.tree, line.rootId, edges);
  for (const e of edges) {
    if (pokemon[e.toId]) pokemon[e.toId].evolvesFromId = e.fromId;
  }

  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const payload = {
    generatedAt: now.toISOString(),
    // 页面直接显示这个字符串：由构建机本地时区算出，服务端/客户端渲染结果一致
    generatedAtText: `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`,
    source: 'PokéAPI v2 · sprites: PokeAPI/sprites (official-artwork)',
    scope: { min: SCOPE_MIN, max: SCOPE_MAX },
    baseForms: BASE_FORMS,
    generations,
    types,
    pokemon,
    lines,
  };

  await writeFile(
    path.join(DATA_DIR, 'pokedex.json'),
    JSON.stringify(payload, null, 2),
    'utf8',
  );

  const bytes = (await stat(path.join(DATA_DIR, 'pokedex.json'))).size;
  console.log(
    `[build-data] 完成 → data/pokedex.json（${ids.length} 只 / ${lines.length} 条进化链 / ` +
      `${types.length} 属性 / ${(bytes / 1024).toFixed(0)} KB）`,
  );
}

main().catch((err) => {
  console.error('[build-data] 失败:', err);
  process.exit(1);
});
