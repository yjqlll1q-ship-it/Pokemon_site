'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { SITE, type NavIcon } from '@/lib/site';

/*
 * 图标全部内联 SVG（stroke 用 currentColor，跟着导航项的文字色走）。
 * 不引图标库：省一个依赖，也免掉「图标库版本一变、形状全变」的回归。
 */
const ICONS: Record<NavIcon, ReactNode> = {
  // 房子
  home: <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  // 精灵球
  pokemon: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h6M15 12h6" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  // 折叠地图
  region: (
    <>
      <path d="M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6z" />
      <path d="M9 3v15M15 6v15" />
    </>
  ),
  // 闪电（招式）
  move: <path d="M13 2 4 13.5h6.5L10 22l9-11.5h-6.5z" />,
  // 背包（道具）
  item: (
    <>
      <path d="M5 8h14l1 12H4z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  // 星（特性）
  ability: <path d="m12 3 2.7 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17.3 6.5 20.2l1.1-6.2L3 9.6l6.3-.9z" />,
};

/**
 * 当前路径是否命中这个导航项。
 * 注意 /pokemon/[id]（详情页）要算在「图鉴首页」名下 —— 它就是首页那个详情主界面
 * 的另一条 URL，否则会出现「所有导航项都没高亮」的空状态。
 */
function useIsOn() {
  const pathname = usePathname();
  return (href: string) =>
    href === '/' ? pathname === '/' || pathname.startsWith('/pokemon') : pathname.startsWith(href);
}

/**
 * 左侧竖导航（参考稿的那一栏）。
 *
 * 桌面端是**悬浮圆角卡**（外边距 + 圆角 + 投影，见 app-rail 与下面的 class），
 * 窄屏折叠成顶部横条 —— 布局切换用 utility 的断点做，不引 JS 判断，避免首屏闪烁。
 *
 * `open` 由 AppShell 托管（顶栏的汉堡按钮改它），只在桌面端生效：
 * 窄屏本来就是横条，没有「折叠侧栏」这个概念。
 *
 * 【2026-10 第四轮：深底→浅底】app-rail 的底色从深蓝实色改成了白色悬浮卡
 * （见 globals.css 对应注释）。这里跟着改的只有两处**写死的白字**——
 * Logo 旁的站名与底部装饰文案，原先假设底是深色所以用 white / white/55 / white/45，
 * 浅色底上这两档白字会直接读不出来，改用 ink 系的语义 token。
 * 导航项的 rail-link / rail-link-on 不在这改，那两个类自己在 globals.css 里
 * 跟着换了配色，组件这边不用动。
 */
export default function AppRail({ open = true }: { open?: boolean }) {
  const isOn = useIsOn();

  return (
    <aside
      className={[
        'app-rail sticky top-4 z-30 flex shrink-0 flex-col gap-5 px-3 py-5',
        /* 窄屏：折叠成顶部横条（不参与「折叠侧栏」，那是桌面端的操作） */
        'max-[900px]:static max-[900px]:flex-row max-[900px]:items-center max-[900px]:gap-2 max-[900px]:overflow-x-auto max-[900px]:px-3 max-[900px]:py-2.5',
        /* 桌面：悬浮圆角卡 —— 参考稿里这一栏不是贴边的通高条，而是浮在外壳上的一块卡片。
           因此去掉 h-screen，换成「视口高 - 上下外边距」，并让 top 与外边距对齐，
           否则吸顶时会跳掉那 16px。
           mr-4 与主内容区的 px-5 合起来约 36px 的外壳留白 —— 参考稿那个间隙约 40px。 */
        'min-[901px]:mr-4 min-[901px]:ml-4 min-[901px]:h-[calc(100vh-2rem)] min-[901px]:w-[180px] min-[901px]:rounded-[20px]',
        open ? '' : 'min-[901px]:hidden',
      ].join(' ')}
      data-testid="app-rail"
      data-rail-open={open ? '1' : '0'}
    >
      <Link
        href="/"
        className="flex items-center gap-2.5 px-2.5 text-inherit no-underline max-[900px]:shrink-0 max-[900px]:px-1"
      >
        <span className="brand-mark" aria-hidden="true" />
        <span className="flex flex-col leading-[1.2] max-[900px]:hidden">
          <strong className="text-[15px] font-bold tracking-[0.02em] text-ink">
            {SITE.name}
          </strong>
          <em className="text-[10px] not-italic tracking-[0.22em] text-ink-3">POKÉDEX</em>
        </span>
      </Link>

      <nav
        className="flex flex-col gap-1.5 max-[900px]:flex-row max-[900px]:gap-1"
        aria-label="主导航"
      >
        {SITE.nav.map((item) => {
          const on = isOn(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={on ? 'page' : undefined}
              className={[
                on ? 'rail-link-on' : 'rail-link',
                'flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium whitespace-nowrap no-underline transition-[background-color,color] duration-150 max-[900px]:px-3 max-[900px]:py-2',
              ].join(' ')}
            >
              <svg
                viewBox="0 0 24 24"
                className="size-[18px] shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {ICONS[item.icon]}
              </svg>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* 底部装饰（参考稿左下角那一段）：只在桌面端出现 —— 窄屏的导航是顶部横条，没有「底部」 */}
      <div
        className="mt-auto hidden flex-col gap-3 px-2.5 pb-1 min-[901px]:flex"
        aria-hidden="true"
      >
        <p className="m-0 text-[10px] leading-[1.7] font-semibold tracking-[0.2em] text-ink-3">
          POKÉMON
          <br />
          ALWAYS WITH YOU
        </p>
        <span className="rail-slash" />
      </div>
    </aside>
  );
}