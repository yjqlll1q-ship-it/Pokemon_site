/**
 * lib/typeColors.ts
 * ---------------------------------------------------------------------------
 * 属性 → 颜色变量的映射。
 * 颜色本体写在 app/globals.css 的 :root 里（--type-*，单一数据源），
 * 这里只负责把英文属性名安全地拼成 CSS 变量名，防止拼错导致样式失效。
 */

import type { CSSProperties } from 'react';

/** 与 globals.css 中的 --type-* 一一对应 */
const KNOWN_TYPES = [
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
] as const;

export type PokemonTypeName = (typeof KNOWN_TYPES)[number];

const KNOWN = new Set<string>(KNOWN_TYPES);

/** 返回形如 "var(--type-grass)"；未知属性回退到中性色，不会出现空样式 */
export function typeColorVar(type: string): string {
  return `var(--type-${KNOWN.has(type) ? type : 'fallback'})`;
}

/** 供内联 style 使用：把自定义属性写进 style 对象 */
export function typeTintStyle(type: string): CSSProperties {
  return { '--tint': typeColorVar(type) } as CSSProperties;
}

/** 主属性（第一个属性）的色变量，用于卡片整体色调 */
export function primaryTypeColorVar(types: string[]): string {
  return typeColorVar(types[0] ?? 'normal');
}
