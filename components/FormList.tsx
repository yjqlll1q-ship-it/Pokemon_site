'use client';

import type { PokemonForm } from '@/lib/forms';
import { GridIcon } from './icons';
import PanelHeading from './PanelHeading';

interface Props {
  /**
   * 全部形态，首位是基本形态（由 build-data 保证）。
   * 长度 < 2 时本组件不该被渲染 —— 调用方用 hasForms() 判断。
   */
  forms: PokemonForm[];
  /** 当前展示的形态 slug */
  value: string;
  onSelect: (slug: string) => void;
}

/**
 * 「基本信息」页右列的形态列表（参考稿那一栏）。
 *
 * 形态数量差别很大：洛托姆 6 个、代欧奇希斯 4 个，皮卡丘有 17 个（换装 + 帽子 + 超极巨）。
 * 所以列表固定高度、超出滚动 —— 换成自适应高度的话，皮卡丘那一页会把主面板撑得很长。
 * 300px 是「4 条整卡 + 一点余量」：参考稿那一栏正好露出 4 条。
 *
 * 每一项是一张**小卡**（参考稿的做法）：左边 52px 缩略图，右边两行字 ——
 * 第一行种族名，第二行单独的形态标签。两行都写完整名（「洛托姆（基本形态）」）
 * 会在窄列里被截断，拆开之后每一行都短、也不用缩字号。
 *
 * 缩略图用 96px 像素图（f.thumb，不到 4KB），不是 130KB 的官方立绘：
 * 17 张立绘就是 2.2MB，而这个位置只显示 52px。
 */
export default function FormList({ forms, value, onSelect }: Props) {
  return (
    <section className="min-w-0" data-testid="form-list">
      <PanelHeading icon={<GridIcon />}>形态</PanelHeading>
      <ul className="form-scroll flex max-h-[300px] flex-col gap-2 pr-1">
        {forms.map((f) => {
          const on = f.slug === value;
          return (
            <li key={f.slug}>
              <button
                type="button"
                onClick={() => onSelect(f.slug)}
                aria-pressed={on}
                data-form-slug={f.slug}
                data-form-on={on ? '1' : undefined}
                title={f.nameZh}
                className={[
                  'flex w-full items-center gap-3 rounded-md border px-2.5 py-2 text-left',
                  'transition-[border-color,background-color] duration-150',
                  on ? 'form-chip-on' : 'form-chip',
                ].join(' ')}
              >
                <img
                  className="size-13 shrink-0 object-contain"
                  src={f.thumb}
                  alt=""
                  width={52}
                  height={52}
                  loading="lazy"
                  decoding="async"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] leading-[1.35] font-semibold">
                    {baseName(f)}
                  </span>
                  <span className="truncate text-[11px] leading-[1.4] text-ink-3">
                    （{f.label}）
                  </span>
                </span>
                <svg
                  viewBox="0 0 24 24"
                  className="size-3.5 shrink-0 text-ink-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m9 5 7 7-7 7" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * 「洛托姆（基本形态）」→「洛托姆」。
 * 形态标签已经在第二行单独显示了，第一行再带一遍括号会重复。
 * 用「末尾的括号段」而不是按 f.label 去替换：label 经过 titleize 兜底，
 * 未必与 nameZh 里的那一段逐字相同（例如未收录的后缀）。
 */
function baseName(f: PokemonForm): string {
  return f.nameZh.replace(/（[^（）]*）\s*$/, '') || f.nameZh;
}
