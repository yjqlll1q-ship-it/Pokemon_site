import type { ReactNode } from 'react';
import type { PokemonTypeName } from '@/lib/typeColors';

/**
 * 18 种属性的图标。
 *
 * 与 AppRail 的 `ICONS` 同一取舍：**全部内联 SVG、纯几何形状、`stroke: currentColor`**，
 * 不引图标库 —— 省一个依赖，也免掉「图标库版本一变、形状全变」的回归。
 *
 * 结构是 `Record<属性key, ReactNode>`，key 与 `lib/typeColors.ts` 的 `KNOWN_TYPES`
 * **一一对应**（那个数组是权威清单，`PokemonTypeName` 类型直接约束本文件，
 * 漏一个会在 `npm run typecheck` 报错，不会静默少一个图标）。
 *
 * 只产出 `<path>` / `<circle>` / `<line>` 这类子节点，**不带 `<svg>` 外壳** ——
 * 外层的 viewBox / strokeWidth / 尺寸由消费方给（见 TypeBadge 与下面的 `TypeGlyph`）。
 * 这样同一套图形既能用在 12px 的标签里，也能直接放到别处放大。
 *
 * 尺寸提醒：这套图形是**为 11~12px 设计的**，笔画密集处按 24 格视口画，
 * 每根线至少占 2 格 —— 再细在小尺寸下会糊成一团（实测 1 格的细节在 12px 上不可见）。
 */
export const TYPE_ICONS: Record<PokemonTypeName, ReactNode> = {
  // 一般：一个圆角方块（「素」的意象，不画具体物）
  normal: <rect x="5" y="5" width="14" height="14" rx="3.5" />,

  // 火：火苗（外焰 + 内焰）
  fire: (
    <>
      <path d="M12 3c3 4 5 6 5 9.5a5 5 0 0 1-10 0C7 9.5 9 7 12 3z" />
      <path d="M12 12.5c1.2 1.5 1.8 2.3 1.8 3.4a1.8 1.8 0 1 1-3.6 0c0-1.1.6-1.9 1.8-3.4z" />
    </>
  ),

  // 水：水滴
  water: <path d="M12 3.5c3.4 4.2 5.5 7 5.5 10a5.5 5.5 0 1 1-11 0c0-3 2.1-5.8 5.5-10z" />,

  // 电：闪电（与 AppRail 的「招式」同形，但那条是导航隐喻，这里是属性语义）
  electric: <path d="M13.5 2 5 13.2h5.2L10.5 22 19 10.8h-5.2z" />,

  // 草：叶片（叶身 + 主脉）
  grass: (
    <>
      <path d="M20 4c0 8-4.5 12.5-10 12.5H6.5C6.5 8.5 11 4 20 4z" />
      <path d="M6.5 16.5 15 8" />
    </>
  ),

  // 冰：六角雪花（三根交叉线 + 三个短分叉）
  ice: (
    <>
      <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />
      <path d="M12 6.5 9.6 5M12 6.5 14.4 5" />
    </>
  ),

  // 格斗：拳头（握拳 + 指节）
  fighting: (
    <>
      <path d="M6 11.5V9a1.6 1.6 0 0 1 3.2 0v.6" />
      <path d="M9.2 9.6V7.8a1.6 1.6 0 0 1 3.2 0v1.8" />
      <path d="M12.4 9.6V8.4a1.6 1.6 0 0 1 3.2 0v1.2" />
      <path d="M15.6 9.6a1.6 1.6 0 0 1 3.2 0v3.9c0 3.6-2.4 6-5.9 6-2.4 0-4.3-1-5.6-2.8L5 13.6a1.6 1.6 0 0 1 2.5-2z" />
    </>
  ),

  // 毒：骷髅头（眼窝 + 齿）
  poison: (
    <>
      <path d="M12 3c4.4 0 7.5 2.9 7.5 7 0 2.5-1 4.2-2.4 5.4V18a1 1 0 0 1-1 1H7.9a1 1 0 0 1-1-1v-2.6C5.5 14.2 4.5 12.5 4.5 10c0-4.1 3.1-7 7.5-7z" />
      <circle cx="9.3" cy="10.2" r="1.6" />
      <circle cx="14.7" cy="10.2" r="1.6" />
    </>
  ),

  // 地面：向上堆起的土层（两道折线 + 顶面）
  ground: (
    <>
      <path d="M3 18.5h18" />
      <path d="M4.5 14 9 10l3 2.5L16 8.5l3.5 3" />
      <path d="M9 10V6.5h5V8.5" />
    </>
  ),

  // 飞行：翅膀（一只展翅的轮廓）
  flying: (
    <>
      <path d="M3 12.5c4-4.5 8-6 12-6 3 0 5 .8 6 2-2.5 1.2-4 2.6-4.8 4.2-1.4 3-3.6 5-3.6 5l-1.4-3.4c-1 .8-2 1-3.2.8.6-1.2.6-2.4 0-3.4-1.4.2-2.8 0-4-.8z" />
    </>
  ),

  // 超能：眼睛 + 波纹（意念的意象）
  psychic: (
    <>
      <ellipse cx="12" cy="12" rx="7.5" ry="5.5" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M2.5 5.5c1.6 1.4 1.6 3.6 0 5M21.5 5.5c-1.6 1.4-1.6 3.6 0 5" />
    </>
  ),

  // 虫：甲虫（身体 + 头 + 双触角）
  bug: (
    <>
      <ellipse cx="12" cy="14.2" rx="4.6" ry="5.3" />
      <path d="M12 8.9V6.4" />
      <circle cx="12" cy="5.1" r="1.6" />
      <path d="M7.6 11.2 4.6 9M16.4 11.2 19.4 9" />
      <path d="M12 10.2v9.3" />
    </>
  ),

  // 岩石：一块多面岩（三角轮廓 + 一道切面）
  rock: (
    <>
      <path d="M7 5.5h7.5L20 11l-3 8H7l-3-7z" />
      <path d="M7 5.5 12.5 10l4.5 1M12.5 10v9" />
    </>
  ),

  // 幽灵：幽灵轮廓（罩形 + 波浪下摆 + 两眼）
  ghost: (
    <>
      <path d="M4.5 19V11a7.5 7.5 0 0 1 15 0v8l-2.5-2-2.5 2-2.5-2-2.5 2z" />
      <circle cx="9.5" cy="10.5" r="1.3" />
      <circle cx="14.5" cy="10.5" r="1.3" />
    </>
  ),

  // 龙：龙角 / 鳞脊（一对象征龙的头角）
  dragon: (
    <>
      <path d="M6 20V13c0-4.4 2.7-8 6-8s6 3.6 6 8v7" />
      <path d="M6 13h3M15 13h3" />
      <path d="M12 5V2.5" />
    </>
  ),

  // 恶：一弯月牙（「暗」的意象，不做恐怖元素）
  dark: <path d="M16.5 4.5A8.5 8.5 0 1 0 19 17.4 7 7 0 0 1 16.5 4.5z" />,

  // 钢：齿轮（外圈 + 齿 + 轴心）
  steel: (
    <>
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
    </>
  ),

  // 妖精：四角星（闪光的意象，与「星」区分开：这个是细长的四角）
  fairy: (
    <>
      <path d="M12 2.5c.8 4.6 2.4 6.2 7 7-4.6.8-6.2 2.4-7 7-.8-4.6-2.4-6.2-7-7 4.6-.8 6.2-2.4 7-7z" />
      <path d="M18 17.5c.35 2 .95 2.6 3 3-2.05.4-2.65 1-3 3-.35-2-.95-2.6-3-3 2.05-.4 2.65-1 3-3z" />
    </>
  ),
};

/**
 * 属性图标的外壳。与 `components/icons.tsx` 的 `Glyph` 同构，
 * 只是尺寸与描边按标签的实际大小单独调过。
 *
 * 为什么不用 `Glyph`：那个是 13px / strokeWidth 1.9，配 22px 的圆形图标底。
 * 属性标签是 11px 与 12px 两档文字，图标要更小（10 / 11px）才不撑高胶囊，
 * 描边也要略粗（2.0）—— 否则在 10px 上细线会被抗锯齿吃掉，看起来像脏点。
 */
export function TypeGlyph({
  type,
  size,
}: {
  /** 属性英文 key；未知属性回退到一般系的图标，不会出现空图标 */
  type: string;
  /** 边长（px）。TypeBadge 按 size 档传 10 或 11 */
  size: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="shrink-0"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {TYPE_ICONS[type as PokemonTypeName] ?? TYPE_ICONS.normal}
    </svg>
  );
}
