'use client';

import { useEffect, useState, type ReactNode } from 'react';
import AppRail from './AppRail';
import AppTopBar from './AppTopBar';
import BgDecor from './BgDecor';

/** 侧栏展开状态存这里 */
const RAIL_KEY = 'pokedex:rail';

/**
 * 全站外壳（参考稿的「左竖导航 + 顶栏 + 主内容区」）。
 *
 * 放在 app/layout.tsx 里包住所有页面，这样加新页面不用重复搭外壳 ——
 * 页面只管往 children 里塞自己的内容（children 仍是服务端组件，本组件只做状态托管）。
 *
 * 底色由 app-frame 提供（浅色底，见 globals.css），装饰图形由 BgDecor 画
 * （斜切条纹 + 精灵球圆环 + 点阵圆，见该组件注释）。页面内容以白色卡片浮在
 * 这两层之上。
 *
 * 侧栏的展开状态放在这一层：顶栏的汉堡按钮是它的**触发方**，导航栏是它的**消费方**，
 * 两者是兄弟节点 —— 状态只能提到共同祖先。存 localStorage 而不是内存，
 * 是为了刷新后保持用户的选择。
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const [railOpen, setRailOpen] = useState(true);

  /* 首帧把上次的选择读回来。放在 effect 里而不是 useState 初值：
     初值不能用 localStorage（服务端渲染时没有 window，会 hydration 不一致）。 */
  useEffect(() => {
    try {
      if (window.localStorage.getItem(RAIL_KEY) === 'closed') setRailOpen(false);
    } catch {
      /* 隐私模式读不到，保持默认展开 */
    }
  }, []);

  const toggleRail = () => {
    setRailOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(RAIL_KEY, next ? 'open' : 'closed');
      } catch {
        /* 存不下就算了，本次会话内仍然生效 */
      }
      return next;
    });
  };

  return (
    <div className="app-frame flex min-h-screen flex-col min-[901px]:flex-row">
      <BgDecor />
      <AppRail open={railOpen} />
      {/* min-w-0：让内部的长表格 / 网格能在窄屏正常收缩，不会把外壳撑破 */}
      <div className="flex min-w-0 flex-1 flex-col" data-testid="app-main">
        <AppTopBar railOpen={railOpen} onToggleRail={toggleRail} />
        {children}
      </div>
    </div>
  );
}