import type { Pokemon } from '@/lib/pokedex';
import { typeTintStyle } from '@/lib/typeColors';
import TypeBadge from './TypeBadge';

interface Props {
  pokemon: Pokemon;
  /** 该宝可梦进化线里的形态总数，>1 时提示有进化 */
  lineSize: number;
  /** 进化路线数：单线为 1，>1 时提示这条线有多条分支路线 */
  routeCount: number;
  onOpen: (id: number) => void;
}

const dexLabel = (n: number) => `#${String(n).padStart(4, '0')}`;

/** 首页的宝可梦按钮：整块可点，打开资料弹窗 */
export default function PokemonCard({ pokemon, lineSize, routeCount, onOpen }: Props) {
  return (
    <li className="flex">
      <button
        type="button"
        className="group relative flex w-full flex-col items-center gap-2 rounded-md border border-line bg-surface px-[14px] pt-[18px] pb-[14px] shadow-sm transition-[translate,box-shadow,border-color] duration-[180ms] hover:-translate-y-[3px] hover:tint-edge hover:shadow-md active:-translate-y-px"
        style={typeTintStyle(pokemon.types[0] ?? 'normal')}
        onClick={() => onOpen(pokemon.id)}
        data-testid="pokemon-card"
        data-pokemon-id={pokemon.id}
        aria-label={`查看${pokemon.nameZh}的属性和进化`}
      >
        <span className="absolute top-2.5 left-3 font-mono text-[10.5px] tracking-[0.04em] text-ink-3">
          {dexLabel(pokemon.dexNumber)}
        </span>

        {/*
          立绘底座：用主属性色做一圈很淡的光晕（配方见 globals.css 的 @utility tint-halo）。
          圆角写 50% 而不是 rounded-full：这块底座的上下内缩量不同（6% / 2%），
          是个略扁的矩形。此时「50%」是椭圆、而 rounded-full（半径取无穷大后被
          夹到短边一半）是胶囊形，两者在四角并不完全等价。写成 50% 与改造前逐字一致。
        */}
        <span className="relative grid aspect-square max-h-[150px] w-full place-items-center before:absolute before:inset-[6%_6%_2%] before:rounded-[50%] before:tint-halo before:content-['']">
          <img
            className="relative h-full w-auto object-contain sprite-shadow transition-[scale] duration-[220ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] group-hover:scale-[1.045]"
            src={pokemon.sprite}
            alt={`${pokemon.nameZh}官方立绘`}
            width={180}
            height={180}
            loading="lazy"
            decoding="async"
          />
        </span>

        {/* 行高必须写死：text-base 自带 1.5，会顶掉原本继承下来的 1.6，卡片整体矮 1.6px */}
        <span className="text-base leading-[1.6] font-semibold tracking-[0.01em] text-ink">
          {pokemon.nameZh}
        </span>

        <span className="flex flex-wrap justify-center gap-[5px]">
          {pokemon.types.map((t, i) => (
            <TypeBadge key={t} type={t} label={pokemon.typeNamesZh[i] ?? t} size="sm" />
          ))}
        </span>

        <span
          className="mt-0.5 w-full border-t border-dashed border-line pt-2 text-center text-[11.5px] text-ink-3"
          data-testid="card-foot"
        >
          {lineSize > 1 ? `共 ${lineSize} 个形态` : '无进化'}
          {routeCount > 1 ? ` · ${routeCount} 条路线` : ''}
        </span>
      </button>
    </li>
  );
}
