import type { Metadata } from 'next';
import Link from 'next/link';
import { getGenerations, getPokemonByGeneration, getRegionHighlights } from '@/lib/pokedex';
import { REGION_INFO } from '@/lib/regionInfo';

export const metadata: Metadata = {
  title: '地区图鉴 | 宝可梦图鉴',
  description: '按地区浏览宝可梦：关都、城都、丰缘、神奥，每个地区的登场作品、原型地与全部宝可梦。',
};

/**
 * 地区图鉴（总览）。
 *
 * 数据全部来自 `pokedex.json` 的 `generations`（世代名 / 地区名 / 编号范围）与
 * 每只宝可梦的 `generation` 字段 —— **加世代只需要扩 SCOPE_MAX 与世代配置，
 * 这个页面一行都不用改**（新地区卡会自动出现）。
 *
 * 地区简介是登记制（lib/regionInfo.ts）：没登记的地区只少一段文字，不影响卡片本身。
 */
export default function RegionsPage() {
  const generations = getGenerations();

  return (
    <main className="mx-auto w-full max-w-[1320px] flex-1 px-5 py-6 max-[520px]:px-3 max-[520px]:py-4">
      {/* 白卡包住内容：外壳底色是深蓝，深色文字直接铺上去读不清 */}
      <div className="panel-card px-6 py-5 max-[520px]:px-4 max-[520px]:py-4">
        <header>
          <h1 className="text-[22px] font-bold tracking-[0.01em]" data-testid="regions-title">
            地区图鉴
          </h1>
          <p className="mt-2 max-w-[70ch] text-[13.5px] leading-[1.8] text-ink-2">
            按地区浏览全国图鉴。每个地区收录该世代范围内的全部宝可梦，点进去可以直接看列表。
          </p>
        </header>

        <ul className="mt-5 grid gap-4 lg:grid-cols-2" data-testid="region-list">
          {generations.map((g) => {
            const list = getPokemonByGeneration(g.id);
            const highlights = getRegionHighlights(g.id);
            const info = REGION_INFO[g.id];

            return (
              <li key={g.id} className="flex">
                <Link
                  href={`/regions/${g.id}`}
                  className="group flex w-full flex-col rounded-lg border border-line bg-surface p-4 no-underline shadow-sm transition-[translate,box-shadow,border-color] duration-[180ms] hover:-translate-y-[3px] hover:shadow-md"
                  data-testid="region-card"
                  data-region-id={g.id}
                  aria-label={`查看${g.regionZh}的全部宝可梦`}
                >
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-[19px] leading-[1.4] font-bold text-ink">{g.regionZh}</h2>
                    <span className="text-[12px] text-ink-3">{g.nameZh}</span>
                    <span className="ml-auto flex-none font-mono text-[11px] tracking-[0.03em] text-ink-3 num-tabular">
                      #{g.start}–#{g.end}
                    </span>
                  </div>

                  {info && (
                    <p className="mt-2 text-[13px] leading-[1.75] text-ink-2">{info.blurb}</p>
                  )}

                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div className="flex items-end gap-1.5">
                      {highlights.map((p) => (
                        <img
                          key={p.id}
                          /*
                           * 必须带 thumb-shadow：代表宝可梦里有一批是**接近纯白 / 极浅**的
                           * （雷吉艾斯、由克希、洛奇亚…），白卡上没有投影就基本看不见。
                           * 与进化链的 52px 小图同一口径（EvolutionTree 也是这个类）。
                           */
                          className="size-[52px] shrink-0 object-contain thumb-shadow transition-[scale] duration-[220ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] group-hover:scale-[1.06]"
                          src={p.thumb}
                          alt={p.nameZh}
                          width={52}
                          height={52}
                          loading="lazy"
                          decoding="async"
                        />
                      ))}
                    </div>
                    <span className="flex-none text-[12.5px] font-semibold text-ink-2 group-hover:underline">
                      共 {list.length} 只 →
                    </span>
                  </div>

                  {info && (
                    <p className="mt-2.5 border-t border-dashed border-line pt-2 text-[11.5px] text-ink-3">
                      原型：{info.basedOn} · 首次登场：{info.debut}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
