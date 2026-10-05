import type { ReactNode } from 'react';

/**
 * 面板标题栏用的小图标。
 *
 * 全部内联 SVG、`stroke: currentColor` —— 与 AppRail / AppTopBar 同一取舍：
 * 不引图标库，省一个依赖，也免掉「图标库版本一变、形状全变」的回归。
 *
 * 尺寸 13px 是配合 `panel-icon`（22px 圆形底）量出来的：
 * 再大会顶到圆边，再小在 22px 的底上会显得空。
 */
export function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[13px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** 图鉴介绍：摊开的书 */
export function BookIcon() {
  return (
    <Glyph>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H12v18H6.5A1.5 1.5 0 0 1 5 19.5z" />
      <path d="M19 4.5A1.5 1.5 0 0 0 17.5 3H12v18h5.5A1.5 1.5 0 0 0 19 19.5z" />
    </Glyph>
  );
}

/** 特性：星 */
export function StarIcon() {
  return (
    <Glyph>
      <path d="m12 3 2.7 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17.3 6.5 20.2l1.1-6.2L3 9.6l6.3-.9z" />
    </Glyph>
  );
}

/** 进化链：向右的箭头 */
export function ArrowIcon() {
  return (
    <Glyph>
      <path d="M4 12h14" />
      <path d="m13.5 7.5 4.5 4.5-4.5 4.5" />
    </Glyph>
  );
}

/** 形态：四宫格（形态之间是并列关系，不是线性关系，所以不用箭头） */
export function GridIcon() {
  return (
    <Glyph>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </Glyph>
  );
}
