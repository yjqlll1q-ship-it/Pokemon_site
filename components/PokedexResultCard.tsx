import type { PokemonListItem } from '@/lib/api-types';
import { typeTintStyle } from '@/lib/typeColors';
import PokemonCardShell from './PokemonCardShell';

interface Props {
  pokemon: PokemonListItem;
  onOpen: (id: number) => void;
}

/**
 * 图鉴查询页的结果卡片（客户端）。
 * 展示口径刻意与详情页不同：这里不谈进化线，只给「种族值总和 + 分类」——
 * 查询场景下用户关心的是「值不值」，不是「能进化成几只」。
 * 点它直接跳整页详情（/pokemon/[id]），与首页详情同一份实现。
 *
 * 卡片**内容**在 PokemonCardShell（与地区图鉴页的服务端卡片共用一套视觉），
 * 这里只负责「怎么点」（button + 路由跳转）与 hover 交互。
 */
export default function PokedexResultCard({ pokemon, onOpen }: Props) {
  return (
    <li className="flex">
      <button
        type="button"
        className="group relative flex w-full flex-col items-center gap-1.5 rounded-md border border-line bg-surface px-3 pt-4 pb-3 shadow-sm transition-[translate,box-shadow,border-color] duration-[180ms] hover:-translate-y-[3px] hover:tint-edge hover:shadow-md active:-translate-y-px"
        style={typeTintStyle(pokemon.types[0] ?? 'normal')}
        onClick={() => onOpen(pokemon.id)}
        data-testid="result-card"
        data-pokemon-id={pokemon.id}
        aria-label={`查看${pokemon.nameZh}的资料`}
      >
        <PokemonCardShell pokemon={pokemon} />
      </button>
    </li>
  );
}
