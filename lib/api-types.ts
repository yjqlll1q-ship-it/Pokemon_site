/**
 * lib/api-types.ts
 * ---------------------------------------------------------------------------
 * 前后端共用的**接口契约类型**。
 *
 * 单独放一个文件的原因：客户端组件需要这些类型，但绝不能碰
 * lib/pokedex-query.ts（那个模块 import 了 node:sqlite，是服务端专属）。
 * 契约集中在这里，前后端引用的是同一份定义，改字段不会两边不一致。
 *
 * 本文件不允许出现任何值（只有类型），也不 import 任何数据。
 */

import type { EvoLine, EvoMembers } from './evolution';
import type { Pokemon } from './pokedex';

/* ------------------------------ 列表查询 ------------------------------ */

export type SortKey =
  | 'id' | 'total' | 'hp' | 'attack' | 'defense' | 'spAttack' | 'spDefense'
  | 'speed' | 'height' | 'weight' | 'capture' | 'name';

export type StatColumnKey = 'hp' | 'attack' | 'defense' | 'spAttack' | 'spDefense' | 'speed';

export type TagKey = 'legendary' | 'mythical' | 'baby';

export interface PokemonListItem {
  id: number;
  nameZh: string;
  nameEn: string;
  nameJa: string;
  dexNumber: number;
  generation: number;
  genusZh: string;
  /** 属性英文 key */
  types: string[];
  /** 属性中文名，与 types 同序 */
  typeNamesZh: string[];
  statTotal: number;
  /** 种族值，key 为英文（hp / attack / ...） */
  stats: Record<string, number>;
  sprite: string;
  isLegendary: boolean;
  isMythical: boolean;
  isBaby: boolean;
}

/** 服务端回显的、已经归一化过的生效条件 */
export interface AppliedParams {
  q: string;
  types: string[];
  typeMode: 'any' | 'all';
  excludeTypes: string[];
  generations: number[];
  statTotalMin: number | null;
  statTotalMax: number | null;
  statKey: StatColumnKey | null;
  statMin: number | null;
  statMax: number | null;
  abilities: string[];
  eggGroups: string[];
  tags: TagKey[];
  sort: SortKey;
  order: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export interface SearchResponse {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  items: PokemonListItem[];
  applied: AppliedParams;
}

/* ------------------------------ 筛选面 ------------------------------ */

export interface Facets {
  total: number;
  scope: { min: number; max: number };
  generations: { id: number; nameZh: string; regionZh: string; count: number }[];
  types: { slug: string; nameZh: string; count: number }[];
  abilities: { slug: string; nameZh: string; count: number }[];
  eggGroups: { slug: string; nameZh: string; count: number }[];
  statTotal: { min: number; max: number };
  sortOptions: { key: SortKey; label: string }[];
  tags: { key: TagKey; label: string; count: number }[];
}

/* ------------------------------ 属性分类 ------------------------------ */

export interface TypeRef {
  slug: string;
  nameZh: string;
}

export interface TypeProfile extends TypeRef {
  count: number;
  weakTo: TypeRef[];
  resists: TypeRef[];
  immuneTo: TypeRef[];
  strongAgainst: TypeRef[];
}

/* ------------------------------- 详情 ------------------------------- */

export interface DetailResponse {
  /** 与 data/pokedex.json 里的单只结构同构，可直接交给 PokemonScreen 渲染 */
  pokemon: Pokemon;
  line: EvoLine;
  members: EvoMembers;
}

/* ------------------------------ 错误响应 ------------------------------ */

export interface ApiError {
  error: string;
  hint?: string;
}
