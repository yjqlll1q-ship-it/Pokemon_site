'use client';

import { useEffect, useState } from 'react';
import type { ApiError, TypeProfile, TypeRef } from '@/lib/api-types';
import { typeTintStyle } from '@/lib/typeColors';
import { TypeGlyph } from './typeIcons';

interface Props {
  /** 点击某个属性 → 用它筛选列表 */
  onPick: (slug: string) => void;
}

/**
 * 一条相性：属性图标 + 属性名，颜色走属性自己的色变量。
 *
 * 2026-09-29：前面的 5px 纯色圆点换成**属性图标**，与 TypeBadge 同一口径。
 * 这里是 18 个属性图标**能同屏看全的唯一位置**（卡片头那 18 个 + 相性行里的交叉引用），
 * 所以圆点换图标在「按属性分类」这一屏上的收益最大。
 * 图标 11px：与 11px 文字同高，不撑高胶囊（原来那 5px 圆点的高度是视觉锚点，
 * 换成 11px 图标后胶囊靠 line-height 1.6 撑住，实测高度不变）。
 */
function TypePill({ item }: { item: TypeRef }) {
  return (
    <span
      className="type-chip inline-flex items-center gap-1 rounded-full border border-current px-[7px] py-px text-[11px] leading-[1.6] font-medium whitespace-nowrap"
      style={typeTintStyle(item.slug)}
    >
      <i className="inline-flex shrink-0 text-(--tint)" aria-hidden="true" data-testid="type-icon">
        <TypeGlyph type={item.slug} size={11} />
      </i>
      {item.nameZh}
    </span>
  );
}

function RelationRow({ label, items, empty }: { label: string; items: TypeRef[]; empty: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-[52px] flex-none pt-0.5 text-[11px] tracking-[0.02em] text-ink-3">{label}</span>
      <span className="flex min-w-0 flex-wrap gap-1">
        {items.length ? items.map((t) => <TypePill key={t.slug} item={t} />) : (
          <span className="text-[11.5px] text-ink-3">{empty}</span>
        )}
      </span>
    </div>
  );
}

/**
 * 「按属性分类」视图。
 * 18 种属性各一张卡：前三世代里有几只 + 防守相性 + 招式克制。
 * 相克数据来自数据库的 type_effect 表（建库时从 PokéAPI 转成进攻方视角的矩阵）。
 * 点卡片任意位置即可按该属性筛选列表。
 */
export default function TypeGallery({ onPick }: Props) {
  const [types, setTypes] = useState<TypeProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/types')
      .then(async (r) => {
        const body = (await r.json()) as { types: TypeProfile[] } | ApiError;
        if (!r.ok) throw new Error('error' in body ? body.error : `HTTP ${r.status}`);
        return body as { types: TypeProfile[] };
      })
      .then((body) => alive && setTypes(body.types))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <p className="rounded-md border border-line bg-surface-2 px-4 py-3 text-[13px] text-ink-2">
        属性数据加载失败：{error}
      </p>
    );
  }

  if (!types) {
    return <p className="px-1 py-6 text-[13px] text-ink-3">正在读取属性数据…</p>;
  }

  return (
    <ul
      className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3 max-[640px]:grid-cols-1"
      data-testid="type-gallery"
    >
      {types.map((t) => (
        <li key={t.slug} className="flex">
          <button
            type="button"
            className="flex w-full flex-col gap-2 rounded-md border border-line bg-surface p-3 text-left shadow-sm transition-[border-color,box-shadow,translate] duration-[160ms] hover:-translate-y-px hover:tint-edge hover:shadow-md"
            style={typeTintStyle(t.slug)}
            onClick={() => onPick(t.slug)}
            data-testid="type-card"
            data-type={t.slug}
            aria-label={`按${t.nameZh}属性筛选`}
          >
            <span className="flex items-center gap-2">
              {/*
               * 卡片头：属性图标 + 属性名（原为 size-3 圆点）。
               * 卡片头用 16px —— 18 张卡片同屏时这一列图标是「一眼扫出属性」的锚点，
               * 与 15px 的属性名等重，比相性行里的 11px 明显大一档。
               */}
              <i className="inline-flex shrink-0 text-(--tint)" aria-hidden="true" data-testid="type-icon">
                <TypeGlyph type={t.slug} size={16} />
              </i>
              <b className="text-[15px] font-bold tracking-[0.01em]">{t.nameZh}</b>
              <span className="ml-auto text-[11.5px] text-ink-3 num-tabular">
                共 {t.count} 只
              </span>
            </span>

            <RelationRow label="弱点" items={t.weakTo} empty="无" />
            <RelationRow label="抗性" items={t.resists} empty="无" />
            <RelationRow label="免疫" items={t.immuneTo} empty="无" />
            <RelationRow label="招式克制" items={t.strongAgainst} empty="无" />
          </button>
        </li>
      ))}
    </ul>
  );
}
