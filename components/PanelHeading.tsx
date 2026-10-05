import type { ReactNode } from 'react';

/**
 * 面板内的小节标题（参考稿里每块都有这一条）。
 *
 * 两种形态，按所在容器选：
 *   · 默认（`icon` 不传）—— 主题色小色条 + 文字。用在主卡片内部的小卡上，
 *     那里已经有 sub-card 的浅底与描边，再加圆形图标会太吵。
 *   · 传 `icon` —— 圆形图标 + 文字 + 下分隔线（`panel-head`）。用在右侧信息面板，
 *     参考稿那几张卡的标题栏就是「图标 + 标题 + 一条线」。
 *
 * 它是纯展示组件（没有 'use client'）—— 由客户端组件引用时会自动进客户端包，
 * 引用的又只有 .theme-rule / .panel-head / .panel-icon 这几个 @utility，不带任何数据。
 */
export default function PanelHeading({
  children,
  icon,
}: {
  children: ReactNode;
  /** 传入时切换成「圆形图标标题栏」；图标本身由调用方给（内联 SVG） */
  icon?: ReactNode;
}) {
  if (icon) {
    return (
      <h3 className="panel-head">
        <i aria-hidden="true" className="panel-icon">
          {icon}
        </i>
        {children}
      </h3>
    );
  }

  return (
    <h3 className="mb-2 flex items-center gap-2 text-[14.5px] font-bold">
      <i aria-hidden="true" className="theme-rule" />
      {children}
    </h3>
  );
}
