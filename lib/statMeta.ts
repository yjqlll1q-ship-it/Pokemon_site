/**
 * lib/statMeta.ts
 * ---------------------------------------------------------------------------
 * 种族值的**展示元数据**：六项能力的 key、中文标签、以及每项对应的条色变量。
 *
 * 为什么单独一个文件、不放 lib/pokedex.ts：
 * `lib/pokedex.ts` import 了全量 `data/pokedex.json`，是**服务端专属**模块。
 * 客户端组件（`StatBars` 通过 `PokemonScreen`）只要从它 import 一个常量，
 * 整个 431 只的数据集就会被一起打进浏览器 JS —— 而且**不会报错**，只是包悄悄变大。
 * 这个文件是实测踩出来的：修之前客户端分块里能数出 431 次 `cryUrl`。
 *
 * 所以：本文件**不许 import 任何数据**，只放常量与纯映射，
 * 与 lib/evolution.ts 是同一类「客户端安全」模块。
 * 门禁：`npm run bundle:check`（构建后扫客户端分块，禁止出现任何图鉴描述文本）。
 */

import type { CSSProperties } from 'react';

/** 六项种族值。key 与 `Pokemon.stats` 的键一致（PokéAPI 的写法，特攻带连字符） */
export const STAT_LABELS: { key: string; label: string; colorKey: StatColorKey }[] = [
  { key: 'hp', label: 'HP', colorKey: 'hp' },
  { key: 'attack', label: '攻击', colorKey: 'attack' },
  { key: 'defense', label: '防御', colorKey: 'defense' },
  { key: 'special-attack', label: '特攻', colorKey: 'spAttack' },
  { key: 'special-defense', label: '特防', colorKey: 'spDefense' },
  { key: 'speed', label: '速度', colorKey: 'speed' },
];

/**
 * 六项能力的条色 key，与 globals.css 的 `--stat-<key>` 一一对应。
 * 色值本身不在这里（单一出处仍是 globals.css），这里只保证拼不出错名字。
 */
export const STAT_COLOR_KEYS = [
  'hp',
  'attack',
  'defense',
  'spAttack',
  'spDefense',
  'speed',
] as const;

export type StatColorKey = (typeof STAT_COLOR_KEYS)[number];

const KNOWN = new Set<string>(STAT_COLOR_KEYS);

/** 形如 "var(--stat-attack)"；未知 key 回退到中性灰，不会出现空样式 */
export function statColorVar(key: string): string {
  return `var(--stat-${KNOWN.has(key) ? key : 'fallback'})`;
}

/** 供内联 style 使用：把这一行的条色写进 `--stat`，后代消费 */
export function statColorStyle(key: string): CSSProperties {
  return { '--stat': statColorVar(key) } as CSSProperties;
}
