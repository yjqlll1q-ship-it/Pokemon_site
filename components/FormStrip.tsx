'use client';

import { useRef } from 'react';
import type { PokemonForm } from '@/lib/forms';
import { GridIcon } from './icons';
import PanelHeading from './PanelHeading';

interface Props {
  /** 同 FormList：首位是基本形态；长度 < 2 时调用方不应渲染本组件 */
  forms: PokemonForm[];
  value: string;
  onSelect: (slug: string) => void;
}

/** 一次翻动一屏（4 张卡 + 3 个间距）—— 与面板一屏露出的张数对齐，翻页不会有半张卡卡在边上 */
const PAGE = 350;

/**
 * 右侧信息面板的「近年来常见的形态」横向轮播（参考稿那一栏）。
 *
 * 为什么还要一个横条，和左上角的形态列表重复：
 * 列表是「切换形态」的操作入口，横条是「这只还有哪些形态」的概览 ——
 * 参考稿就是这么摆的，而且横条在右侧面板里、列表在被折叠的 Tab 内容里，
 * 不是同一个视觉区块，重复不刺眼。
 *
 * 卡片是「上图下文」（参考稿的做法）：104px 宽、52px 缩略图，
 * 文字同样拆两行（种族名 / 形态标签），与左列列表保持同一套命名口径。
 *
 * 用原生 overflow-x 滚动 + 两个按钮 scrollBy，不引轮播库：
 * 移动端可以直接手指滑，桌面端有按钮，行为一致且没有额外依赖。
 */
export default function FormStrip({ forms, value, onSelect }: Props) {
  const trackRef = useRef<HTMLUListElement>(null);

  const scrollBy = (dx: number) => {
    trackRef.current?.scrollBy({ left: dx, behavior: 'smooth' });
  };

  return (
    <section className="panel-card-soft px-5 py-4" data-testid="side-forms">
      <PanelHeading icon={<GridIcon />}>近年来常见的形态</PanelHeading>

      <div className="flex items-center gap-2">
        <StripNav label="向左查看更多形态" onClick={() => scrollBy(-PAGE)}>
          <path d="m15 5-7 7 7 7" />
        </StripNav>

        <ul
          ref={trackRef}
          className="strip-track flex min-w-0 flex-1 gap-2.5 pb-1"
          data-testid="form-strip"
        >
          {forms.map((f) => {
            const on = f.slug === value;
            return (
              <li key={f.slug} className="shrink-0">
                <button
                  type="button"
                  onClick={() => onSelect(f.slug)}
                  aria-pressed={on}
                  title={f.nameZh}
                  data-form-slug={f.slug}
                  data-form-on={on ? '1' : undefined}
                  className={[
                    'flex w-[80px] flex-col items-center gap-1 rounded-md border px-1 py-2',
                    'transition-[border-color,background-color] duration-150',
                    on ? 'form-chip-on' : 'form-chip',
                  ].join(' ')}
                >
                  <img
                    className="size-11 object-contain"
                    src={f.thumb}
                    alt=""
                    width={44}
                    height={44}
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="w-full truncate text-center text-[11px] leading-[1.3] font-semibold">
                    {baseName(f)}
                  </span>
                  <span
                    className={[
                      'w-full truncate text-center text-[10px] leading-[1.3]',
                      on ? 'text-ink-2' : 'text-ink-3',
                    ].join(' ')}
                  >
                    （{f.label}）
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <StripNav label="向右查看更多形态" onClick={() => scrollBy(PAGE)}>
          <path d="m9 5 7 7-7 7" />
        </StripNav>
      </div>
    </section>
  );
}

/** 与 FormList 同一口径：末尾括号段去掉，标签单独一行显示 */
function baseName(f: PokemonForm): string {
  return f.nameZh.replace(/（[^（）]*）\s*$/, '') || f.nameZh;
}

/** 横条两端的圆形翻页按钮 */
function StripNav({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="strip-nav">
      <svg
        viewBox="0 0 24 24"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}
