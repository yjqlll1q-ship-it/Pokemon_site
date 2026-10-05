import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import PokemonCardShell from '@/components/PokemonCardShell';
import { getGenerations, getPokemonByGeneration } from '@/lib/pokedex';
import { REGION_INFO } from '@/lib/regionInfo';
import { typeTintStyle } from '@/lib/typeColors';

interface Props {
  // Next 16：动态段 params 是 Promise，必须 await
  params: Promise<{ gen: string }>;
}

/**
 * 预生成全部地区页（当前 4 个）。
 * 加世代后 generateStaticParams 会自动多出一条 —— 页面本身不用改。
 */
export function generateStaticParams() {
  return getGenerations().map((g) => ({ gen: String(g.id) }));
}

/** 只允许预生成过的地区号；其余走 404 */
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gen } = await params;
  const g = getGenerations().find((x) => x.id === Number.parseInt(gen, 10));
  if (!g) return { title: '地区图鉴 | 宝可梦图鉴' };
  return {
    title: `${g.regionZh}地区宝可梦（${g.nameZh}） | 宝可梦图鉴`,
    description: `${g.regionZh}地区的全部宝可梦（全国图鉴 #${g.start}–#${g.end}），共 ${getPokemonByGeneration(g.id).length} 只。`,
  };
}

/**
 * 地区详情页：该地区的全部宝可梦。
 *
 * 服务端渲染 + 静态预生成：列表里的立绘是本地文件，页面本身没有任何客户端请求。
 * 卡片走 PokemonCardShell（与图鉴查询页同一套视觉），交互外壳换成 `<Link>`
 * —— 静态页可爬、可分享、不需要 JS。
 */
export default async function RegionDetailPage({ params }: Props) {
  const { gen } = await params;
  const id = Number.parseInt(gen, 10);
  const g = getGenerations().find((x) => x.id === id);
  if (!g) notFound();

  const list = getPokemonByGeneration(id);
  const info = REGION_INFO[id];

  return (
    <main className="mx-auto w-full max-w-[1320px] flex-1 px-5 py-6 max-[520px]:px-3 max-[520px]:py-4">
      <div className="panel-card px-6 py-5 max-[520px]:px-4 max-[520px]:py-4">
        <Link href="/regions" className="text-[12.5px] text-ink-3 no-underline hover:underline">
          ← 全部地区
        </Link>

        <header className="mt-2.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-[24px] leading-[1.3] font-bold tracking-[0.01em]" data-testid="region-title">
              {g.regionZh}
            </h1>
            <span className="text-[13px] text-ink-3">
              {g.nameZh} · 全国图鉴 #{g.start}–#{g.end}
            </span>
            <span className="ml-auto text-[13px] text-ink-2" data-testid="region-count">
              共 <b className="text-[15px] font-semibold num-tabular">{list.length}</b> 只
            </span>
          </div>

          {info && (
            <p className="mt-2 max-w-[78ch] text-[13px] leading-[1.8] text-ink-2">
              {info.blurb}
              <span className="text-ink-3">
                （原型：{info.basedOn}；首次登场：{info.debut}）
              </span>
            </p>
          )}
        </header>

        <ul
          className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-3"
          data-testid="region-pokemon-list"
        >
          {list.map((p) => (
            <li key={p.id} className="flex">
              <Link
                href={`/pokemon/${p.id}`}
                className="group relative flex w-full flex-col items-center gap-1.5 rounded-md border border-line bg-surface px-3 pt-4 pb-3 no-underline shadow-sm transition-[translate,box-shadow,border-color] duration-[180ms] hover:-translate-y-[3px] hover:tint-edge hover:shadow-md"
                style={typeTintStyle(p.types[0] ?? 'normal')}
                data-testid="region-pokemon-card"
                data-pokemon-id={p.id}
                aria-label={`查看${p.nameZh}的资料`}
              >
                <PokemonCardShell pokemon={p} />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
