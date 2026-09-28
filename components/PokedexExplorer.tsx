'use client';

import { useCallback, useMemo, useState } from 'react';
import type { EvoLine, EvoMembers } from '@/lib/evolution';
import type { Pokemon } from '@/lib/pokedex';
import PokemonCard from './PokemonCard';
import Modal from './Modal';
import PokemonDetail from './PokemonDetail';

/** 卡片上要展示的进化线摘要，由服务端算好传进来，客户端不再重复遍历 */
export interface LineSummary {
  size: number;
  routes: number;
}

interface Props {
  /** 首页要展示的「最初形态」图鉴编号 */
  baseFormIds: number[];
  /** 编号 → 完整资料（只含首页这 10 条进化线上的形态，不是全量 386 只） */
  pokemonById: Record<number, Pokemon>;
  /** 编号 → 该编号所属的进化线 */
  lineById: Record<number, EvoLine>;
  /** 进化树渲染所需的形态展示信息 */
  members: EvoMembers;
  /** 最初形态编号 → 该进化线的规模摘要 */
  summaries: Record<number, LineSummary>;
}

const TITLE_ID = 'pokemon-detail-title';

/**
 * 首页交互主体：宝可梦按钮网格 + 资料弹窗。
 * 弹窗里点进化树上的形态会切换当前宝可梦，用一个栈记录浏览路径以便回退。
 *
 * 所有数据都由服务端组件以 props 传入 —— 本组件**不 import 任何数据源**，
 * 否则 data/pokedex.json（现在有 386 只）会被整份打进浏览器包。
 */
export default function PokedexExplorer({
  baseFormIds,
  pokemonById,
  lineById,
  members,
  summaries,
}: Props) {
  /** 浏览栈：空数组 = 弹窗关闭 */
  const [stack, setStack] = useState<number[]>([]);

  const currentId = stack.length ? stack[stack.length - 1] : null;

  const open = useCallback((id: number) => setStack([id]), []);
  const close = useCallback(() => setStack([]), []);
  const back = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const dive = useCallback(
    (id: number) => setStack((s) => (s[s.length - 1] === id ? s : [...s, id])),
    [],
  );

  const current = useMemo(
    () => (currentId == null ? null : pokemonById[currentId] ?? null),
    [currentId, pokemonById],
  );
  const line = useMemo(() => (currentId == null ? null : lineById[currentId] ?? null), [currentId, lineById]);

  return (
    <>
      <ul
        className="grid grid-cols-[repeat(auto-fill,minmax(178px,1fr))] gap-4 max-[520px]:grid-cols-[repeat(auto-fill,minmax(148px,1fr))] max-[520px]:gap-3"
        data-testid="grid"
      >
        {baseFormIds.map((id) => {
          const p = pokemonById[id];
          if (!p) return null;
          const s = summaries[id];
          return (
            <PokemonCard
              key={id}
              pokemon={p}
              lineSize={s?.size ?? 1}
              routeCount={s?.routes ?? 1}
              onOpen={open}
            />
          );
        })}
      </ul>

      {current && line && (
        <Modal onClose={close} labelledBy={TITLE_ID} scrollKey={current.id}>
          <PokemonDetail
            pokemon={current}
            line={line}
            members={members}
            titleId={TITLE_ID}
            canGoBack={stack.length > 1}
            onBack={back}
            onSelect={dive}
            onClose={close}
          />
        </Modal>
      )}
    </>
  );
}
