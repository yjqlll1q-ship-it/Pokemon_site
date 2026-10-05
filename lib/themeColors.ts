/**
 * lib/themeColors.ts
 * ---------------------------------------------------------------------------
 * 宝可梦「本体色」→ 全站主题色变量的映射。
 *
 * 与 lib/typeColors.ts 的分工：
 *   - typeColors：**属性色**（18 种），用于属性标签、种族值条这种「按属性上色」的地方；
 *   - themeColors：**本体色**（10 种），用于整页主题（侧栏、面板主色、Tab 选中态、
 *     斜切色块）。参考图里洛托姆整页是红色，而它属性是电(黄)+幽灵(紫) ——
 *     说明参考图用的是本体色，不是属性色。
 *
 * 颜色本体写在 app/globals.css 的 :root（--poke-*，单一数据源），
 * 这里只负责把 PokéAPI 的 colorKey 安全地拼成 CSS 变量名，防止拼错导致样式失效。
 *
 * 通用性：加一只宝可梦不用改这个文件 —— 只要它的 colorKey 落在这 10 种里即可；
 * 落到未知值会回退到红色，不会出现空样式。
 */

import type { CSSProperties } from 'react';

/** PokéAPI species.color 的全部取值，与 globals.css 的 --poke-<key> 一一对应 */
const KNOWN_COLORS = [
  'red',
  'blue',
  'yellow',
  'green',
  'black',
  'brown',
  'purple',
  'gray',
  'pink',
  'white',
] as const;

export type PokeColorKey = (typeof KNOWN_COLORS)[number];

const KNOWN = new Set<string>(KNOWN_COLORS);

/** 未知/缺失的 colorKey 回退到红色（参考图的主色，最不容易出错） */
export const POKE_COLOR_FALLBACK: PokeColorKey = 'red';

/** 把任意字符串收敛成已知的本体色 key */
export function toPokeColorKey(colorKey: string | null | undefined): PokeColorKey {
  return colorKey && KNOWN.has(colorKey) ? (colorKey as PokeColorKey) : POKE_COLOR_FALLBACK;
}

/**
 * 供内联 style 使用：把四档主题色变量写进 style 对象。
 * 挂在一个容器上，它的所有后代都能用 var(--poke) / var(--poke-deep) …
 */
export function pokeThemeStyle(colorKey: string | null | undefined): CSSProperties {
  const k = toPokeColorKey(colorKey);
  return {
    '--poke': `var(--poke-${k})`,
    '--poke-hi': `var(--poke-${k}-hi)`,
    '--poke-deep': `var(--poke-${k}-deep)`,
    '--poke-soft': `var(--poke-${k}-soft)`,
  } as CSSProperties;
}

/** 四档主题色变量名。顺序固定，根级注入与还原共用同一份清单。 */
export const POKE_VAR_NAMES = ['--poke', '--poke-hi', '--poke-deep', '--poke-soft'] as const;

/**
 * 把主题色写到根元素（<html>）上 —— 让**应用外壳**也换色。
 *
 * 为什么必须写到根：外壳（左侧竖导航的选中态、外壳底的两道斜切块）是详情容器的
 * **祖先**，而 CSS 自定义属性只向下继承 —— 变量挂在详情容器上，外壳根本读不到，
 * 结果就是「面板全紫、侧栏仍是红的」。写到 :root 之后整页才真正跟随宝可梦。
 *
 * 只在浏览器端生效（服务端渲染时 document 不存在，直接跳过），
 * 因此不会有 hydration 不一致：首屏由 :root 的默认色兜底，挂载后一帧内换色。
 */
export function applyPokeTheme(colorKey: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  const style = pokeThemeStyle(colorKey) as Record<string, string>;
  for (const name of POKE_VAR_NAMES) {
    document.documentElement.style.setProperty(name, style[name]);
  }
}

/** 还原成 app/globals.css 里 :root 的默认主题（离开详情页时调用） */
export function resetPokeTheme(): void {
  if (typeof document === 'undefined') return;
  for (const name of POKE_VAR_NAMES) {
    document.documentElement.style.removeProperty(name);
  }
}
