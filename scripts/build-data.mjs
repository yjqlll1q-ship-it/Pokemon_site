/**
 * build-data.mjs
 * ---------------------------------------------------------------------------
 * 把 PokéAPI 的数据固化成静态 JSON，并把官方立绘下载到 public/sprites/。
 *
 * 本版范围：**第一~第四世代（全国图鉴 #1–493）全部宝可梦**。
 *   为了进化链完整，链上出现的第五世代及以后成员（如 Rhyperior 之后的跨代进化）
 *   也会一并抓下来，但它们带 generation=5+，不进图鉴查询的默认结果集。
 *
 * 形态（forms）：另有 40 只带额外形态（超级进化、地区形态、超极巨化、洛托姆的家电形态…），
 *   每只写进 `forms` 数组（首位是基本形态），立绘落在 public/sprites/forms/{形态id}.png。
 *   没有额外形态的宝可梦 `forms` 是**空数组**，前端据此整块不渲染。
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
/** 形态立绘单独一层目录：它们没有独立图鉴编号（用的是 10000+ 的形态 id），混在编号图里会误读 */
const FORM_SPRITE_DIR = path.join(SPRITE_DIR, 'forms');
const CACHE_DIR = path.join(ROOT, '.cache', 'pokeapi');

const FORCE = process.argv.includes('--force');
const API = 'https://pokeapi.co/api/v2';

/** 抓取范围：全国图鉴 #1–493 = 第一~第四世代 */
const SCOPE_MIN = 1;
const SCOPE_MAX = 493;

/**
 * 额外纳入数据的「吉祥物」编号。
 * #479 洛托姆是本站首页整机造型的灵感来源，也是详情主界面的默认展示对象。
 * 它在第四世代范围内（#387–493）后本就属于 inScope；这个数组保留是为了
 * 万一以后把 SCOPE_MAX 调回去时它不会从数据里消失。
 */
const EXTRA_IDS = [479];

/**
 * 宣传语（右侧信息卡顶部那条飘带上的短句）。
 *
 * **默认没有**：PokéAPI 里不存在这类文案，所以本站不为「每一只」造句子 ——
 * 没登记的宝可梦就是不渲染飘带，这是正常状态，不是缺数据。
 * 要让某一只带上飘带，就在这里按全国图鉴编号登记一句。
 *
 * 文案要求（配合 PromoRibbon 的排版）：**一句、不超过约 14 个汉字**，
 * 不带句末标点 —— 飘带是单行不换行的斜切条，超长会被裁掉。
 *
 * 注意：这**不是**图鉴描述（flavorZh 是从 PokéAPI 抓的原文）。
 * 这里是人工撰写的一句「宣传语」，性质等同于 slogan，所以刻意做成
 * 「登记制」而不是「必须填」—— 否则就变成第二份要人工维护的全量内容。
 */
const TAGLINE_ZH = {
  479: '无处不在的电子伙伴！',
};

/**
 * 首页「最初的伙伴」展示的 10 条进化线。
 * 挑选标准：覆盖单线进化与多分支进化（Eevee 8 分支、Tyrogue 3 分支、Wurmple 双分支）。
 * 图鉴查询页不看这个，它是全量的。
 */
const BASE_FORMS = [1, 4, 7, 43, 60, 133, 172, 236, 265, 280];

/**
 * 精灵图统一来源：官方立绘，保证全站画风一致。
 *
 * **必须给多个源**：GitHub 的 raw 域名在国内网络下经常被直接重置（ECONNRESET），
 * 而 jsDelivr 是同一份仓库的 CDN 镜像、同样按文件路径取，内容一致。
 * 顺序 = 优先级：raw 优先（就是权威源），失败依次退到 jsDelivr 的两个接入点。
 *
 * 两种规格：
 *   art   官方立绘（有透明底、约 475px、单张 ~130KB）→ 详情页大图、列表缩略图
 *   thumb 96px 像素图（单张 3~8KB）→ **只给形态列表 / 形态横条这种小尺寸位置用**
 */
const SPRITE_PATHS = {
  art: 'sprites/pokemon/other/official-artwork',
  thumb: 'sprites/pokemon',
};
const spriteUrls = (id, kind = 'art') => {
  const p = SPRITE_PATHS[kind];
  return [
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/${p}/${id}.png`,
    `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/${p}/${id}.png`,
    `https://gcore.jsdelivr.net/gh/PokeAPI/sprites@master/${p}/${id}.png`,
  ];
};

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

/**
 * 下载一张图；urls 是**候选源列表**，按序尝试，第一个成功的写盘。
 * 非 FORCE 且本地已有大小合理的文件时直接跳过（增量构建才不会重下 430 张图）。
 */
async function download(urls, file) {
  if (!FORCE) {
    try {
      const s = await stat(file);
      if (s.size > 1024) return 'cached';
    } catch {
      /* 不存在，继续下载 */
    }
  }
  const list = Array.isArray(urls) ? urls : [urls];
  let lastErr;
  for (const url of list) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      // 挡住「拿回一个 HTML 错误页」这种假成功：只认 PNG 文件头（89 50 4E 47）。
      // 不能用体积当判据 —— 96px 的 #50 地鼠只有 439 字节，比一个错误页还小，
      // 用「大于 N 字节」去卡会把正常图误杀（实测第一版就卡在 512 上）。
      if (buf.length < 64 || buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
        throw new Error(`内容不是 PNG（${buf.length} 字节）`);
      }
      await writeFile(file, buf);
      return 'downloaded';
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`立绘下载失败 ${Array.isArray(urls) ? urls[0] : urls}: ${lastErr?.message}`);
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

/**
 * 特性说明（详情页「漂浮 / 不会受到地面属性的招式攻击」那句）。
 * PokéAPI 的特性说明分散在两个字段：
 *   - flavor_text_entries：有中文（zh-hans），但文字里夹着换行/换页符；
 *   - effect_entries：只有英文，但 short_effect 更规整。
 * 优先中文 flavor_text，缺了再退英文 short_effect，最后空串（组件按「无说明」处理）。
 */
const abilityDescCache = new Map();
async function abilityDescZh(slug) {
  if (!slug) return '';
  if (abilityDescCache.has(slug)) return abilityDescCache.get(slug);

  let desc = '';
  try {
    const data = await fetchJson(`${API}/ability/${slug}`);
    const ft = data.flavor_text_entries ?? [];
    const byLang = (code) => ft.find((e) => e.language?.name?.toLowerCase() === code);
    const entry = byLang('zh-hans') ?? byLang('zh-hant') ?? byLang('en');
    desc = (entry?.flavor_text ?? '').replace(/[\n\f\r\u000c]/g, '').replace(/\s+/g, ' ').trim();
    if (!desc) {
      const eff = (data.effect_entries ?? []).find((e) => e.language?.name === 'en');
      desc = (eff?.short_effect ?? '').trim();
    }
  } catch {
    /* 查不到就留空，组件按「无说明」渲染，不阻断构建 */
  }

  abilityDescCache.set(slug, desc);
  return desc;
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

const GENERATION_KEYS = ['generation-i', 'generation-ii', 'generation-iii', 'generation-iv'];
const REGION_FALLBACK = { 1: '关都', 2: '城都', 3: '丰缘', 4: '神奥' };
const GEN_RANGE = { 1: [1, 151], 2: [152, 251], 3: [252, 386], 4: [387, 493] };
/** id → 中文数字（兜底世代名用；PokéAPI 有 zh 名时以它为准） */
const GEN_CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

async function buildGenerations() {
  return mapPool(GENERATION_KEYS, 3, async (key, i) => {
    const id = i + 1;
    let nameZh = `第${GEN_CN[i] ?? id}世代`;
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

/** 从 /pokemon/{x} 的响应里取三项种族值字段（基本形态与各形态共用同一套口径） */
function extractStats(pokemon) {
  const stats = {};
  const statsZh = {};
  for (const s of pokemon.stats ?? []) {
    if (STAT_ORDER.includes(s.stat.name)) stats[s.stat.name] = s.base_stat;
    if (STAT_LABEL[s.stat.name]) statsZh[STAT_LABEL[s.stat.name]] = s.base_stat;
  }
  const statTotal = STAT_ORDER.reduce((sum, k) => sum + (stats[k] ?? 0), 0);
  return { stats, statsZh, statTotal };
}

/* -------------------------------------------------------------------------- */
/* 形态（forms）                                                               */
/* -------------------------------------------------------------------------- */

/**
 * 形态名后缀 → 中文「形态标签」。
 *
 * 为什么要有这张表：PokéAPI 的 `/pokemon-form/{slug}` 只提供 fr/de/en 三种语言名，
 * **没有中文**（zh-hans 一律缺失），所以中文形态名只能自己拼。
 * key = variety slug 去掉种族名之后的那一段（rotom-heat → heat、absol-mega-z → mega-z）。
 *
 * 值写的是**完整标签**（含「形态」二字），因为有几类并不适合「XX + 形态」的机械拼法
 * （超级 X 形态、世界帽子形态）。
 *
 * 这张表是「已知后缀的热门集合」而不是白名单：没命中的后缀退回英文原文（titleize），
 * 不抛错 —— 以后调大 SCOPE_MAX 引入新世代时，不用先补表也能跑起来。
 * 判断标准是**有没有中文官方叫法**，有就补，没有就留英文，不自己编。
 */
const FORM_LABEL_ZH = {
  /* 洛托姆的家电形态 */
  heat: '加热形态',
  wash: '清洗形态',
  frost: '结冰形态',
  fan: '旋转形态',
  mow: '切割形态',
  /* 代欧奇希斯 */
  attack: '攻击形态',
  defense: '防御形态',
  speed: '速度形态',
  /* 地区形态 */
  alola: '阿罗拉形态',
  galar: '伽勒尔形态',
  hisui: '洗翠形态',
  paldea: '帕底亚形态',
  /* 超级进化 / 超极巨化 / 原始回归 */
  mega: '超级形态',
  'mega-x': '超级 X 形态',
  'mega-y': '超级 Y 形态',
  'mega-z': '超级 Z 形态',
  gmax: '超极巨形态',
  primal: '原始形态',
  /* 传说宝可梦的其它形态 */
  origin: '起源形态',
  therian: '灵兽形态',
  incarnate: '化身形态',
  blade: '刀锋形态',
  shield: '盾牌形态',
  bloodmoon: '血月形态',
  /* 飘浮泡泡的天气形态 */
  sunny: '晴天形态',
  rainy: '雨天形态',
  snowy: '雪天形态',
  /* 皮卡丘的换装形态（《欧米加红宝石／阿尔法蓝宝石》） */
  'rock-star': '摇滚巨星形态',
  belle: '贵妇形态',
  'pop-star': '偶像形态',
  phd: '博士形态',
  libre: '自由形态',
  cosplay: '换装形态',
  /* 皮卡丘的帽子形态（《究极之日／究极之月》起） */
  'original-cap': '初始帽子形态',
  'hoenn-cap': '丰缘帽子形态',
  'sinnoh-cap': '神奥帽子形态',
  'unova-cap': '合众帽子形态',
  'kalos-cap': '卡洛斯帽子形态',
  'alola-cap': '阿罗拉帽子形态',
  'partner-cap': '搭档帽子形态',
  'world-cap': '世界帽子形态',
  /* 帕底亚肯泰罗的三个品种 */
  'paldea-combat-breed': '帕底亚斗战种',
  'paldea-blaze-breed': '帕底亚火炽种',
  'paldea-aqua-breed': '帕底亚水澜种',
  /* 霸主宝可梦 / 土龙节节 */
  totem: '霸主形态',
  'totem-alola': '阿罗拉霸主形态',
  'three-segment': '三节形态',
  /* 《Let's Go》的搭档 */
  starter: '搭档形态',
};

/** 形态标签：基本形态固定叫法，其余查表，查不到就用英文后缀（不编造中文名） */
function formLabel(suffix, isDefault) {
  if (isDefault) return '基本形态';
  return FORM_LABEL_ZH[suffix] ?? titleize(suffix || 'form');
}

/**
 * 某只宝可梦的全部形态（species.varieties）。
 *
 * 返回空数组 = 这只没有额外形态，前端据此整块不渲染。
 * **首位一定是基本形态**（is_default），前端列表直接按序渲染，不需要再判断。
 * 基本形态的数据直接复用已经抓好的 `pokemon`，不重复请求。
 */
async function buildForms(species, pokemon) {
  const varieties = species.varieties ?? [];
  if (varieties.length <= 1) return [];

  const baseSlug = species.name; // 'rotom' / 'deoxys'
  const baseNameZh = pickZh(species.names, titleize(species.name));

  return mapPool(varieties, 3, async (v) => {
    const slug = v.pokemon.name; // 'rotom-heat' / 'deoxys-normal'
    const formId = idFromUrl(v.pokemon.url); // 10008
    const isDefault = Boolean(v.is_default);
    // 默认形态用已经抓好的那只，别的形态单独请求一次（每只宝可梦最多几只，可接受）
    const data = isDefault ? pokemon : await fetchJson(`${API}/pokemon/${slug}`);

    const suffix = isDefault || slug.startsWith(baseSlug)
      ? slug.slice(baseSlug.length).replace(/^-/, '')
      : slug.split('-').pop();
    const label = formLabel(suffix, isDefault);
    const { stats, statsZh, statTotal } = extractStats(data);
    const types = [...(data.types ?? [])]
      .sort((a, b) => a.slot - b.slot)
      .map((t) => t.type.name);

    return {
      slug,
      /** 完整展示名，如「洛托姆（加热形态）」 */
      nameZh: `${baseNameZh}（${label}）`,
      /** 只到形态那一段，如「加热形态」 */
      label,
      isDefault,
      /** 形态共用一个图鉴编号 */
      dexNumber: species.id,
      /** 官方立绘（主面板用） */
      sprite: `/sprites/forms/${formId}.png`,
      /** 96px 像素图（形态列表 / 横条的缩略图；别在小尺寸位上用 130KB 的大图） */
      thumb: `/sprites/forms/${formId}-thumb.png`,
      types,
      typeNamesZh: await mapPool(types, 4, (t) => typeZh(t)),
      stats,
      statsZh,
      statTotal,
      heightM: (data.height ?? 0) / 10,
      weightKg: (data.weight ?? 0) / 10,
    };
  });
}

async function buildPokemon(speciesId, chainIdBySpecies) {
  const [pokemon, species] = await Promise.all([
    fetchJson(`${API}/pokemon/${speciesId}`),
    fetchJson(`${API}/pokemon-species/${speciesId}`),
  ]);

  const types = [...pokemon.types]
    .sort((a, b) => a.slot - b.slot)
    .map((t) => t.type.name);

  const { stats, statsZh, statTotal } = extractStats(pokemon);

  const abilities = await mapPool(pokemon.abilities, 4, async (a) => ({
    slug: a.ability.name,
    nameZh: await zhName('ability', a.ability.name),
    descZh: await abilityDescZh(a.ability.name),
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

  /* 形态：只有 varieties > 1 的才非空，前端据此决定整块渲不渲染 */
  const forms = await buildForms(species, pokemon);

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
    /*
     * 宣传语：登记过的才有。**值缺失时这个 key 仍然写进去（值为 undefined），
     * JSON.stringify 会自动省略它** —— 前端拿到的就是「字段不存在」，
     * 与「字段为空串」区分开：空串会被渲染成一条空白飘带。
     */
    taglineZh: TAGLINE_ZH[speciesId],
    sprite: `/sprites/${speciesId}.png`,
    /*
     * 96px 缩略图：**卡片 / 列表这类小尺寸位置专用**。
     * 地区图鉴的总览卡上只显示 52px，用 475px 的大图会让首屏多下约 2MB。
     * 命名与 forms 的 thumb 一致（`{id}-thumb.png`），落在同一层目录。
     */
    thumb: `/sprites/${speciesId}-thumb.png`,
    colorKey: species.color?.name ?? 'normal',
    /**
     * 叫声。前端直接拿这个地址播放，**不下载到本地**（YJ 定的：走 CDN）。
     * 地址优先取 PokéAPI pokemon.cries.latest；老缓存里可能没有 cries 字段，
     * 用官方 cries 仓库的固定 URL 兜底（id 就是全国图鉴编号）。
     */
    cryUrl:
      pokemon.cries?.latest ??
      `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${speciesId}.ogg`,
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
    /* ---- 形态（无额外形态时为空数组，不是 null） ---- */
    forms,
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
  for (const id of EXTRA_IDS) allIds.add(id);
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

  /* --- 4. 立绘（基本形态 + 形态两批） ---
     形态立绘要在组装数据之前就下好，否则 buildForms 里算出的 sprite 路径会指向不存在的文件。
     扫 varieties 用的都是已缓存的 pokemon-species，不会额外打网络。 */
  await mkdir(FORM_SPRITE_DIR, { recursive: true });
  const formSpriteIds = new Set();
  await mapPool(ids, 6, async (id) => {
    try {
      const sp = await fetchJson(`${API}/pokemon-species/${id}`);
      const vars = sp.varieties ?? [];
      if (vars.length > 1) for (const v of vars) formSpriteIds.add(idFromUrl(v.pokemon.url));
    } catch {
      /* 单个失败不影响整体；重跑会补上 */
    }
  });

  await mapPool(ids, 8, async (id) => {
    /* 大图 + 缩略图一起下；两个都命中缓存才算「已存在」 */
    const r = await download(spriteUrls(id), path.join(SPRITE_DIR, `${id}.png`));
    const t = await download(spriteUrls(id, 'thumb'), path.join(SPRITE_DIR, `${id}-thumb.png`));
    process.stdout.write(r === 'cached' && t === 'cached' ? '.' : '+');
    return id;
  });
  process.stdout.write('\n');

  const formIds = [...formSpriteIds].sort((a, b) => a - b);
  if (formIds.length) {
    console.log(`[build-data] 含额外形态的宝可梦共 ${formIds.length} 个形态，下载形态立绘（大图 + 缩略图）…`);
    await mapPool(formIds, 6, async (id) => {
      const art = await download(spriteUrls(id, 'art'), path.join(FORM_SPRITE_DIR, `${id}.png`));
      const thumb = await download(
        spriteUrls(id, 'thumb'),
        path.join(FORM_SPRITE_DIR, `${id}-thumb.png`),
      );
      process.stdout.write(art === 'cached' && thumb === 'cached' ? '.' : '+');
      return id;
    });
    process.stdout.write('\n');
  }

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
