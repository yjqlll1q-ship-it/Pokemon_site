import TypeBadge from './TypeBadge';

/**
 * 宝可梦卡片的内容部分（**不含交互包裹**）。
 *
 * 站内有两个位置要渲染同一种卡片：
 *   · 图鉴查询页 —— 客户端组件，外层是 `<button onClick>`（`PokedexResultCard`）
 *   · 地区图鉴页 —— 服务端渲染，外层是 `<Link href>`（可直接爬、可分享）
 *
 * 两者的差别只有「怎么点」，视觉完全一样，所以把内容抽到这里，
 * 交互外壳留给调用方 —— 这样两处的样式只会有一套，改一处两处都变。
 *
 * ⚠️ 调用方**必须**在最外层注入 `style={typeTintStyle(pokemon.types[0])}`：
 * 下面的 `before:tint-halo` 光晕与 hover 描边都读 `--tint`，不注入会静默退化。
 */
export interface CardPokemon {
  dexNumber: number;
  nameZh: string;
  types: string[];
  typeNamesZh: string[];
  genusZh: string;
  statTotal: number;
  sprite: string;
  isLegendary: boolean;
  isMythical: boolean;
  /** 分类为空时的兜底文案用（分类缺失不该发生，见 db:check 的「每只都有分类」） */
  generation: number;
}

const dexLabel = (n: number) => `#${String(n).padStart(4, '0')}`;

export default function PokemonCardShell({ pokemon }: { pokemon: CardPokemon }) {
  return (
    <>
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
    </>
  );
}
