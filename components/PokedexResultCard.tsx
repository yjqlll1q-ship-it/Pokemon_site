import type { PokemonListItem } from '@/lib/api-types';
import { typeTintStyle } from '@/lib/typeColors';
import TypeBadge from './TypeBadge';

interface Props {
  pokemon: PokemonListItem;
  onOpen: (id: number) => void;
}

const dexLabel = (n: number) => `#${String(n).padStart(4, '0')}`;

/**
 * 图鉴查询页的结果卡片。
 * 展示口径刻意与详情页不同：这里不谈进化线，只给「种族值总和 + 分类」——
 * 查询场景下用户关心的是「值不值」，不是「能进化成几只」。
 * 点它直接跳整页详情（/pokemon/[id]），与首页详情同一份实现。
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
        <span className="absolute top-2 left-2.5 font-mono text-[10px] tracking-[0.04em] text-ink-3">
          {dexLabel(pokemon.dexNumber)}
        </span>

        {(pokemon.isLegendary || pokemon.isMythical) && (
          <span
            className="badge-baby absolute top-1.5 right-2 rounded-full border border-current px-1.5 text-[9.5px] leading-[1.6]"
            title={pokemon.isMythical ? '幻之宝可梦' : '传说的宝可梦'}
          >
            {pokemon.isMythical ? '幻' : '传'}
          </span>
        )}

        <span className="relative grid aspect-square max-h-[132px] w-full place-items-center before:absolute before:inset-[6%_6%_2%] before:rounded-[50%] before:tint-halo before:content-['']">
          <img
            className="relative h-full w-auto object-contain sprite-shadow transition-[scale] duration-[220ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] group-hover:scale-[1.045]"
            src={pokemon.sprite}
            alt={`${pokemon.nameZh}官方立绘`}
            width={160}
            height={160}
            loading="lazy"
            decoding="async"
          />
        </span>

        <span className="text-[15px] leading-[1.6] font-semibold tracking-[0.01em] text-ink">
          {pokemon.nameZh}
        </span>

        <span className="flex flex-wrap justify-center gap-[5px]">
          {pokemon.types.map((t, i) => (
            <TypeBadge key={t} type={t} label={pokemon.typeNamesZh[i] ?? t} size="sm" />
          ))}
        </span>

        <span
          className="mt-0.5 flex w-full items-baseline justify-between border-t border-dashed border-line pt-1.5 text-[11px] text-ink-3"
          data-testid="card-foot"
        >
          <span className="truncate" title={pokemon.genusZh}>
            {pokemon.genusZh || `第 ${pokemon.generation} 世代`}
          </span>
          <span className="flex-none pl-2">
            种族值 <b className="text-[12px] font-semibold num-tabular text-ink-2">{pokemon.statTotal}</b>
          </span>
        </span>
      </button>
    </li>
  );
}
