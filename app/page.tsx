import Link from 'next/link';
import PokedexExplorer, { type LineSummary } from '@/components/PokedexExplorer';
import { flattenLine, getRouteCount, type EvoLine } from '@/lib/evolution';
import {
  buildLineIndex,
  buildMembersMap,
  getBaseForms,
  getLines,
  getMeta,
  getPokemon,
  type Pokemon,
} from '@/lib/pokedex';

/*
 * 首页是静态预渲染的，所有派生数据都在这里（服务端）算好，
 * 再以普通对象传给客户端组件 —— 客户端不会拿到 data/pokedex.json，
 * 只会拿到这 10 条进化线上真正需要的形态。
 */
export default function Home() {
  const baseForms = getBaseForms();
  const baseFormIds = baseForms.map((p) => p.id);

  // 首页只涉及这 10 条进化线
  const allLines = getLines();
  const lines: EvoLine[] = baseForms
    .map((root) => allLines.find((l) => l.rootId === root.id))
    .filter((l): l is EvoLine => Boolean(l));

  // 卡片上的「共 N 个形态 / M 条路线」在服务端算好，客户端不重复遍历进化树
  const summaries: Record<number, LineSummary> = Object.fromEntries(
    lines.map((line) => [
      line.rootId,
      { size: flattenLine(line).length, routes: getRouteCount(line) },
    ]),
  );

  // 弹窗里可能点到进化线上的任何形态，所以资料要按形态备齐（数量很少，就是这 10 条线的成员）
  const pokemonById: Record<number, Pokemon> = {};
  for (const line of lines) {
    for (const node of flattenLine(line)) {
      if (pokemonById[node.id]) continue;
      const p = getPokemon(node.id);
      if (p) pokemonById[node.id] = p;
    }
  }

  const members = buildMembersMap(lines);
  const lineById = buildLineIndex(lines);
  const meta = getMeta();

  return (
    <main className="mx-auto w-full max-w-[1080px] flex-1 px-6 pt-10 pb-0 max-[520px]:px-4 max-[520px]:pt-[26px]">
      <section className="mb-6 flex flex-col gap-2">
        <h1 className="text-[26px] font-bold tracking-[0.01em] max-[520px]:text-[22px]">
          最初的伙伴
        </h1>
        <p className="max-w-[60ch] text-[13.5px] text-ink-2">
          点开任意一只，查看它的属性、种族值，以及完整的进化链与分支路线。
        </p>
        <p className="text-[13px] text-ink-3">
          想按属性、世代、种族值筛选全部 {meta.inScope} 只宝可梦？{' '}
          <Link href="/pokedex">进入图鉴查询 →</Link>
        </p>
      </section>

      <PokedexExplorer
        baseFormIds={baseFormIds}
        pokemonById={pokemonById}
        lineById={lineById}
        members={members}
        summaries={summaries}
      />
    </main>
  );
}
