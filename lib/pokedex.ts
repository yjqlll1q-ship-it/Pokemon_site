/**
 * lib/pokedex.ts
 * ---------------------------------------------------------------------------
 * **服务端**数据入口：读 data/pokedex.json（抓取层的产物）。
 *
 * 用法分两条路，不要混：
 *   - 静态资料（首页「最初的伙伴」、详情弹窗的展示数据）→ 走本文件，构建期就算好；
 *   - 图鉴查询（386 只、多条件筛选）→ 走数据库，见 lib/pokedex-query.ts 与 /api/*。
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

/* ---------------------------------- 类型 ---------------------------------- */

export interface Ability {
  slug: string;
  nameZh: string;
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
  /** 本地立绘路径 */
  sprite: string;
  colorKey: string;
  isBaby: boolean;
  evolvesFrom: string | null;
  /* ---- 图鉴查询相关 ---- */
  evolvesFromId: number | null;
  /** 1 / 2 / 3；超出前三世代的进化链成员会是 4 或更大 */
  generation: number;
  /** 是否落在前三世代（#1–386）内 */
  inScope: boolean;
  chainId: number | null;
  captureRate: number | null;
  baseHappiness: number | null;
  eggGroups: EggGroup[];
  isLegendary: boolean;
  isMythical: boolean;
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

/* --------------------------------- 统计标签 -------------------------------- */

export const STAT_LABELS: { key: string; label: string }[] = [
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: '攻击' },
  { key: 'defense', label: '防御' },
  { key: 'special-attack', label: '特攻' },
  { key: 'special-defense', label: '特防' },
  { key: 'speed', label: '速度' },
];

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

export function getGenerations(): GenerationMeta[] {
  return pokedex.generations;
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
