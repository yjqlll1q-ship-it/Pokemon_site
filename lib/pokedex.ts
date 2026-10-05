/**
 * lib/pokedex.ts
 * ---------------------------------------------------------------------------
 * **服务端**数据入口：读 data/pokedex.json（抓取层的产物）。
 *
 * 用法分两条路，不要混：
 *   - 静态资料（首页「最初的伙伴」、详情弹窗的展示数据）→ 走本文件，构建期就算好；
 *   - 图鉴查询（493 只、多条件筛选）→ 走数据库，见 lib/pokedex-query.ts 与 /api/*。
 *
 * 本文件**只能在服务端使用**：它 import 了全量 JSON。
 * 客户端组件要的数据一律由服务端算好后以 props 传下去，
 * 否则整个数据集会被打进浏览器 JS。
 *
 * 重新抓取：
 *   npm run data        # 增量
 *   npm run data:force  # 全量
 *   npm run db          # 抓完重建数据库
 */

import raw from '@/data/pokedex.json';
import { flattenLine, type EvoLine, type EvoMember, type EvoMembers, type EvoNode } from './evolution';
import type { PokemonForm } from './forms';

/* ---------------------------------- 类型 ---------------------------------- */

export interface Ability {
  slug: string;
  nameZh: string;
  /** 特性说明（中文；缺失时为空串） */
  descZh: string;
  hidden: boolean;
}

export interface EggGroup {
  slug: string;
  nameZh: string;
}

export interface Pokemon {
  id: number;
  /** 英文 slug，用作稳定 key */
  name: string;
  nameZh: string;
  nameJa: string;
  dexNumber: number;
  /** 属性英文 key，如 ['grass','poison'] */
  types: string[];
  /** 属性中文名，与 types 同序 */
  typeNamesZh: string[];
  /** 种族值，key 为英文（hp / attack / ...） */
  stats: Record<string, number>;
  statsZh: Record<string, number>;
  statTotal: number;
  abilities: Ability[];
  heightM: number;
  weightKg: number;
  /** 分类，如"种子宝可梦" */
  genusZh: string;
  flavorZh: string;
  /**
   * 宣传语（右侧信息卡顶部那条飘带上的短句），如「无处不在的电子伙伴！」。
   *
   * **可选**：数据源（PokéAPI）里没有这类文案，所以我们不凭空造。
   * 有值就渲染飘带，**没有值整块不渲染**（不报错、不留白、不占位）——
   * 见 components/PromoRibbon.tsx 与 PokemonScreen 的 side-intro。
   *
   * 要批量补文案：在 scripts/build-data.mjs 的 TAGLINE_ZH 里按 id 或 slug 登记；
   * 不登记的宝可梦就是「没有飘带」，这是正常状态而非缺数据。
   */
  taglineZh?: string;
  /** 本地立绘路径（475px 官方 artwork） */
  sprite: string;
  /**
   * 96px 缩略图 —— **卡片 / 列表这类小尺寸位置用它**。
   * 与大图同一套命名（`{id}-thumb.png`），DB 侧（rowToPokemon）按同样规则派生。
   */
  thumb: string;
  /** 叫声地址（PokeAPI cries CDN，前端直接播放） */
  cryUrl: string;
  colorKey: string;
  isBaby: boolean;
  evolvesFrom: string | null;
  /* ---- 图鉴查询相关 ---- */
  evolvesFromId: number | null;
  /** 1~4；超出前四世代的进化链成员会是 5 或更大 */
  generation: number;
  /** 是否落在前四世代（#1–493）内 */
  inScope: boolean;
  chainId: number | null;
  captureRate: number | null;
  baseHappiness: number | null;
  eggGroups: EggGroup[];
  isLegendary: boolean;
  isMythical: boolean;
  /**
   * 额外形态（超级进化 / 地区形态 / 洛托姆的家电形态…）。
   * **没有额外形态时是空数组**，不是 null —— 前端按 forms.length 判断整块渲不渲染。
   * 首位一定是基本形态（isDefault: true）。
   */
  forms: PokemonForm[];
}

export interface TypeMeta {
  slug: string;
  nameZh: string;
  weakTo: string[];
  resists: string[];
  immuneTo: string[];
}

export interface GenerationMeta {
  id: number;
  key: string;
  nameZh: string;
  regionZh: string;
  start: number;
  end: number;
}

interface PokedexFile {
  generatedAt: string;
  generatedAtText: string;
  source: string;
  scope: { min: number; max: number };
  baseForms: number[];
  generations: GenerationMeta[];
  types: TypeMeta[];
  pokemon: Record<string, Pokemon>;
  lines: EvoLine[];
}

const pokedex = raw as unknown as PokedexFile;

export type { EvoLine, EvoNode, EvoMember, EvoMembers };
export type { PokemonForm } from './forms';

/* --------------------------------- 统计标签 -------------------------------- */
/*
 * 六项种族值的展示元数据（key / 中文标签 / 条色）在 lib/statMeta.ts，
 * **不要把它搬回这个文件** —— 客户端组件引一次就会把全量 JSON 拖进浏览器包。
 * 这里只保留服务端读数据需要的东西。
 */

/* --------------------------------- 读取接口 -------------------------------- */

export function getPokemon(id: number): Pokemon | undefined {
  return pokedex.pokemon[String(id)];
}

/** 必存在版本，用于已知一定存在的数据（首屏列表等） */
export function requirePokemon(id: number): Pokemon {
  const p = getPokemon(id);
  if (!p) throw new Error(`pokedex.json 中缺少 #${id} 的数据，请重新执行 npm run data`);
  return p;
}

/** 首页展示的 10 只「最初形态」，按图鉴编号排序 */
export function getBaseForms(): Pokemon[] {
  return pokedex.baseForms.map(requirePokemon);
}

export function getLines(): EvoLine[] {
  return pokedex.lines;
}

/** 数据里全部宝可梦编号（升序）。详情路由的 generateStaticParams 用它预生成页面 */
export function getAllIds(): number[] {
  return Object.keys(pokedex.pokemon)
    .map(Number)
    .sort((a, b) => a - b);
}

export function getGenerations(): GenerationMeta[] {
  return pokedex.generations;
}

/**
 * 某一世代（地区）的宝可梦，按图鉴编号升序。
 *
 * 只取 inScope 的 —— 进化链上更高世代的成员（如伊布线上的仙子伊布 #700）
 * 不是该地区的本土宝可梦，混进来会让「第四世代 107 只」变成 120+。
 */
export function getPokemonByGeneration(gen: number): Pokemon[] {
  return Object.values(pokedex.pokemon)
    .filter((p) => p.inScope && p.generation === gen)
    .sort((a, b) => a.dexNumber - b.dexNumber);
}

/**
 * 地区卡上的「代表宝可梦」：先取该世代的传说 / 幻之宝可梦（辨识度最高，
 * 每代都有且数量稳定），不够 limit 时按编号从小到大用普通宝可梦补齐。
 * 纯数据驱动 —— 加世代不用手工挑图。
 */
export function getRegionHighlights(gen: number, limit = 4): Pokemon[] {
  const list = getPokemonByGeneration(gen);
  const special = list.filter((p) => p.isLegendary || p.isMythical);
  if (special.length >= limit) return special.slice(0, limit);
  const rest = list.filter((p) => !p.isLegendary && !p.isMythical);
  return [...special, ...rest.slice(0, limit - special.length)];
}

export function getTypes(): TypeMeta[] {
  return pokedex.types;
}

export function getMeta() {
  return {
    generatedAt: pokedex.generatedAtText,
    source: pokedex.source,
    scope: pokedex.scope,
    total: Object.keys(pokedex.pokemon).length,
    inScope: Object.values(pokedex.pokemon).filter((p) => p.inScope).length,
  };
}

/* --------------------------- 进化线相关的派生计算 --------------------------- */

const lineByPokemonId = (() => {
  const map = new Map<number, EvoLine>();
  const walk = (line: EvoLine, node: EvoNode) => {
    map.set(node.id, line);
    node.children.forEach((c) => walk(line, c));
  };
  for (const line of pokedex.lines) {
    map.set(line.rootId, line);
    line.tree.forEach((n) => walk(line, n));
  }
  return map;
})();

/** 某只宝可梦属于哪条进化线 */
export function getLineFor(id: number): EvoLine | undefined {
  return lineByPokemonId.get(id);
}

/**
 * 把一批进化线涉及到的全部形态整理成「id → 展示信息」的查找表。
 * 进化树组件拿它渲染节点：客户端不需要再知道任何全量数据。
 */
export function buildMembersMap(lines: EvoLine[]): EvoMembers {
  const out: EvoMembers = {};
  for (const line of lines) {
    for (const node of flattenLine(line)) {
      const p = getPokemon(node.id);
      if (!p) continue;
      out[p.id] = { id: p.id, nameZh: p.nameZh, dexNumber: p.dexNumber, sprite: p.sprite, types: p.types };
    }
  }
  return out;
}

/** 把一批进化线整理成「宝可梦 id → 该 id 所属的进化线」的查找表 */
export function buildLineIndex(lines: EvoLine[]): Record<number, EvoLine> {
  const out: Record<number, EvoLine> = {};
  for (const line of lines) {
    for (const node of flattenLine(line)) out[node.id] = line;
  }
  return out;
}
