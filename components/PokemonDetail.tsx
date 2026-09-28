import type { EvoLine, EvoMembers } from '@/lib/evolution';
import type { Pokemon } from '@/lib/pokedex';
import { typeTintStyle } from '@/lib/typeColors';
import TypeBadge from './TypeBadge';
import StatBars from './StatBars';
import EvolutionTree from './EvolutionTree';

interface Props {
  pokemon: Pokemon;
  line: EvoLine;
  /** 进化树上各形态的展示信息（由调用方提供，组件不读全局数据） */
  members: EvoMembers;
  /** 弹窗标题的 id，Modal 用它做 aria-labelledby */
  titleId: string;
  /** 在进化树里点过别的形态时为 true，可返回上一只 */
  canGoBack: boolean;
  onBack: () => void;
  onSelect: (id: number) => void;
  onClose: () => void;
}

const dexLabel = (n: number) => `#${String(n).padStart(4, '0')}`;

/** 弹窗内容：属性面板 + 完整进化线 */
export default function PokemonDetail({
  pokemon,
  line,
  members,
  titleId,
  canGoBack,
  onBack,
  onSelect,
  onClose,
}: Props) {
  const tint = pokemon.types[0] ?? 'normal';

  return (
    <div
      className="px-5 pt-3 pb-[18px] max-[720px]:px-4 max-[720px]:pt-3 max-[720px]:pb-5"
      style={typeTintStyle(tint)}
      data-testid="detail"
    >
      <header className="mb-1.5 flex min-h-[34px] items-center justify-between gap-3">
        <div className="min-h-px">
          {canGoBack && (
            <button
              type="button"
              className="rounded-full border border-transparent px-2.5 py-[5px] text-[12.5px] text-ink-2 transition-[background,border-color,color] duration-150 hover:border-line hover:bg-surface-2 hover:text-ink"
              onClick={onBack}
              data-testid="back"
            >
              ← 返回上一只
            </button>
          )}
        </div>
        <button
          type="button"
          className="size-8 rounded-full border border-line bg-surface text-[13px] text-ink-2 transition-[background,border-color,color] duration-150 hover:border-line-strong hover:bg-surface-2 hover:text-ink"
          onClick={onClose}
          data-testid="close"
          data-autofocus
          aria-label="关闭"
        >
          ✕
        </button>
      </header>

      <div className="grid grid-cols-[minmax(170px,218px)_1fr] items-start gap-5 max-[720px]:grid-cols-1 max-[720px]:gap-4">
        <div className="art-plate relative grid aspect-square place-items-center overflow-hidden rounded-lg border border-line max-[720px]:mx-auto max-[720px]:max-w-[240px]">
          <div className="tint-halo-strong absolute inset-[4%] rounded-full" aria-hidden="true" />
          <img
            className="relative h-auto w-[78%] object-contain art-shadow"
            src={pokemon.sprite}
            alt={`${pokemon.nameZh}官方立绘`}
            width={288}
            height={288}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-[7px]">
          <p className="font-mono text-[11px] tracking-[0.06em] text-ink-3">
            {dexLabel(pokemon.dexNumber)}
          </p>
          <h2 id={titleId} className="text-[23px] leading-[1.2] font-bold tracking-[0.01em]">
            {pokemon.nameZh}
          </h2>
          <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
            {pokemon.nameJa && <span>{pokemon.nameJa}</span>}
            <span className="border-l border-line-strong pl-2 text-ink-2">{pokemon.genusZh}</span>
            {pokemon.isBaby && (
              <span className="badge-baby rounded-full border border-current px-2 py-px text-[11px]">
                幼年形态
              </span>
            )}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {pokemon.types.map((t, i) => (
              <TypeBadge key={t} type={t} label={pokemon.typeNamesZh[i] ?? t} />
            ))}
          </div>

          <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(88px,auto))] gap-x-6 gap-y-0 [&>div]:py-1">
            <div>
              <dt className="text-[10.5px] tracking-[0.02em] text-ink-3">身高</dt>
              <dd className="m-0 text-[13.5px] font-semibold num-tabular">{pokemon.heightM} m</dd>
            </div>
            <div>
              <dt className="text-[10.5px] tracking-[0.02em] text-ink-3">体重</dt>
              <dd className="m-0 text-[13.5px] font-semibold num-tabular">{pokemon.weightKg} kg</dd>
            </div>
            <div>
              <dt className="text-[10.5px] tracking-[0.02em] text-ink-3">特性</dt>
              <dd className="m-0 text-[13px] font-medium">
                {pokemon.abilities
                  .map((a) => (a.hidden ? `${a.nameZh}（隐藏）` : a.nameZh))
                  .join(' / ') || '—'}
              </dd>
            </div>
          </dl>

          {pokemon.flavorZh && (
            <p className="tint-rule rounded-sm border-l-[3px] bg-surface-2 px-3 py-2 text-[12.5px] leading-[1.7] text-ink-2">
              {pokemon.flavorZh}
            </p>
          )}

          <StatBars stats={pokemon.stats} total={pokemon.statTotal} tintType={tint} />
        </div>
      </div>

      <section
        className="mt-4 border-t border-line pt-3.5"
        aria-labelledby={`${titleId}-evo`}
        data-testid="evolution"
      >
        <h3 id={`${titleId}-evo`} className="mb-2.5 flex items-baseline gap-2.5 text-[14.5px] font-bold">
          进化
          <span className="text-[11.5px] font-normal text-ink-3">完整进化线与分支</span>
        </h3>
        <EvolutionTree line={line} currentId={pokemon.id} members={members} onSelect={onSelect} />
      </section>
    </div>
  );
}
