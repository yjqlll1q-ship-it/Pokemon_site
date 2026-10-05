'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EvoLine, EvoMembers } from '@/lib/evolution';
import { defaultForm, hasForms, resolveView } from '@/lib/forms';
import type { Pokemon } from '@/lib/pokedex';
import { pushRecent } from '@/lib/recent';
import { applyPokeTheme, pokeThemeStyle, resetPokeTheme } from '@/lib/themeColors';
import { typeTintStyle } from '@/lib/typeColors';
import TypeBadge from './TypeBadge';
import StatBars from './StatBars';
import EvolutionTree from './EvolutionTree';
import CryButton from './CryButton';
import FormList from './FormList';
import FormStrip from './FormStrip';
import PromoRibbon from './PromoRibbon';
import { ArrowIcon, BookIcon, StarIcon } from './icons';
import PanelHeading from './PanelHeading';

interface Props {
  pokemon: Pokemon;
  line: EvoLine;
  /** 进化链上各形态的展示信息（调用方给，组件不读全局数据） */
  members: EvoMembers;
}

const TABS = [
  { key: 'basic', label: '基本信息' },
  { key: 'stats', label: '能力值' },
  { key: 'dex', label: '图鉴描述' },
  { key: 'evo', label: '进化链' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/**
 * 宝可梦详情主界面（参考稿的三栏版式：左导航在外壳里，这里是「主面板 + 右侧信息面板」）。
 *
 * 全部内容都从传入的 pokemon/line/members 派生 —— 组件里不出现任何具体宝可梦的
 * 名字或编号，加新宝可梦只需要数据里有它，这里一行都不用改。
 *
 * 整块的主题色由 pokemon.colorKey 决定（pokeThemeStyle 注入 --poke 系列变量），
 * 所以「切换宝可梦 → 整页换色」是数据驱动的，也没有额外的配色表要维护。
 *
 * 形态（pokemon.forms）：有额外形态的宝可梦才多出「形态列表」与「近年来常见的形态」两块，
 * 切换形态只改本地 state（立绘 / 属性 / 种族值 / 身高体重跟着换），**不换 URL、不重新请求**；
 * 没有形态的宝可梦走的是完全没有分支的旧路径。
 *
 * 版式对齐参考稿（2026-09-29 第三轮）：头部立绘放大到接近卡片半宽、
 * 简介 / 能力值各自包一层 sub-card、右面板每张卡带圆形图标标题栏。
 */
export default function PokemonScreen({ pokemon, line, members }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('basic');

  /**
   * 当前选中的形态 slug。
   *
   * 取值时**再校验一次是否属于当前这只**。这是**防御性**的：
   * 实测（2026-09-29）从 /pokemon/479 选好「加热形态」再用顶栏搜索跳 /pokemon/25，
   * Next 会按路由参数重建页面组件，state 本来就回到 null —— 也就是说这条分支
   * 当前走不到。留着是因为它只有两行，而一旦以后把选择状态抬到 store / context
   * （或路由段结构变化导致组件不再重建），没有它就会出现「皮卡丘页面上选中的是
   * 洛托姆的形态」这种**不报错的错状态**。
   * 校验放在渲染期而不是 useEffect，避免多一帧的错状态。
   */
  const [pickedSlug, setPickedSlug] = useState<string | null>(null);
  const forms = pokemon.forms ?? [];
  const withForms = hasForms(forms);
  const formSlug = withForms
    ? (pickedSlug && forms.some((f) => f.slug === pickedSlug)
        ? pickedSlug
        : (defaultForm(forms)?.slug ?? ''))
    : '';

  /* 主面板展示的那一份视图：基本形态 = 宝可梦本身，选了别的形态 = 形态那一份 */
  const view = resolveView(pokemon, forms, formSlug);

  /**
   * 把主题色抬到 <html> 上：左侧导航的选中态与外壳斜切块是详情容器的祖先，
   * 只靠下面那层内联变量读不到，整页换色会「只换一半」。
   * 离开详情页（换到 /pokedex 等）时还原成 :root 默认色。
   */
  useEffect(() => {
    applyPokeTheme(pokemon.colorKey);
    return resetPokeTheme;
  }, [pokemon.colorKey]);

  /**
   * 记一次浏览（顶栏「时钟」按钮那个下拉）。
   * 形态切换不写 —— 用户看的是「这只宝可梦」，不是「这个形态」。
   */
  useEffect(() => {
    pushRecent({
      id: pokemon.id,
      nameZh: pokemon.nameZh,
      sprite: `/sprites/${pokemon.id}.png`,
    });
  }, [pokemon.id, pokemon.nameZh]);

  /** 切到另一只：走路由，URL 可分享、可刷新，主题色随新页面一起变 */
  const goTo = (id: number) => {
    if (id === pokemon.id) return;
    router.push(`/pokemon/${id}`);
  };

  /* 强调色取**当前形态**的主属性：飘浮泡泡切到雨天形态，色条与能力值就跟着转水蓝 */
  const tint = view.types[0] ?? 'normal';
  const hasLine = line.tree.length > 0;

  const statsBlock = (
    <section className="sub-card min-w-0 p-4" data-testid="stats-card">
      <PanelHeading>能力值</PanelHeading>
      <StatBars stats={view.stats} total={view.statTotal} tintType={tint} />
    </section>
  );

  const introBlock = (
    <section className="sub-card min-w-0 p-4" data-testid="intro-card">
      <PanelHeading>宝可梦简介</PanelHeading>
      <DexIntro text={pokemon.flavorZh} clamp />
    </section>
  );

  return (
    <div
      /*
       * 版心 1400px：参考稿在 1440 视口下，卡片距窗口边约 35px。
       * 右列 460px —— 参考稿右侧那一栏约占 32% 宽（1440 下约 460）。
       * 460 是**反推出来的**，为了让「近年来常见的形态」一屏正好放下 4 张卡：
       *   460 − 40(卡片左右内边距) − 52(两个翻页按钮) − 16(两处 gap-2)
       *   = 352，再减 3 个 gap-2.5(30) = 322，÷4 ≈ 80.5 → 卡片取 80。
       * 之前卡片 104 + 面板 420 只能露出 3 张，第 2 张起两行文字被挤掉一行。
       */
      className="mx-auto grid w-full max-w-[1400px] grid-cols-[minmax(0,1fr)_460px] items-start gap-5 px-5 py-5 max-[1240px]:grid-cols-[minmax(0,1fr)_394px] max-[1120px]:grid-cols-1 max-[520px]:gap-4 max-[520px]:px-3 max-[520px]:py-4"
      /*
       * 这一层要注入两组变量，缺一不可：
       *   --poke* 全站主题色（跟着 species.colorKey 走，外壳换色也靠它）
       *   --tint  属性色（简介左侧色条 tint-rule、卡片立绘光晕 tint-halo 靠它派生）
       * 曾经只注了 --poke*，于是 `.tint-rule` 里的 color-mix(..., var(--tint))
       * 因为变量为空被判为非法声明，**静默**退化：色条变成 currentColor 的灰、
       * 光晕直接 backgroundImage: none。
       * 注：立绘底板（art-plate）2026-10-05 起改成素板、不再吃 --tint，
       * 所以它那层光晕已删除；这条约束现在由 tint-rule 兜着（ui-check 有断言）。
       */
      style={{ ...pokeThemeStyle(pokemon.colorKey), ...typeTintStyle(tint) }}
      data-testid="pokemon-screen"
      data-color-key={pokemon.colorKey}
    >
      {/* ============================ 主面板 ============================ */}
      <section className="panel-card overflow-hidden" data-testid="detail-main">
        {/* 头部：左信息 + 右大立绘，右上角一块主题色斜切装饰 */}
        <div className="relative px-7 pt-7 pb-6 max-[520px]:px-4 max-[520px]:pt-5">
          <span
            aria-hidden="true"
            className="panel-band absolute top-0 right-0 h-[104px] w-[300px] [clip-path:polygon(26%_0,100%_0,100%_100%,0_100%)] max-[720px]:hidden"
          />

          <div className="relative grid grid-cols-[minmax(0,1fr)_336px] items-center gap-6 max-[860px]:grid-cols-1">
            <div className="flex min-w-0 flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex w-fit items-center rounded-md bg-ink px-2 py-[3px] font-mono text-[12px] font-semibold tracking-[0.06em] text-white"
                  data-testid="dex-badge"
                >
                  No.{pokemon.dexNumber}
                </span>
                {view.subLabel && (
                  <span
                    className="form-chip-on inline-flex w-fit items-center rounded-md border px-2 py-[3px] text-[11.5px] font-semibold"
                    data-testid="form-badge"
                  >
                    {view.subLabel}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-0.5">
                <h1 className="text-[34px] leading-[1.15] font-bold tracking-[0.01em] max-[520px]:text-[26px]">
                  {view.nameZh}
                </h1>
                <p className="text-[13px] text-ink-3" data-testid="name-sub">
                  {pokemon.nameJa}
                  {pokemon.nameJa && pokemon.name ? ' / ' : ''}
                  <span className="capitalize">{pokemon.name}</span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5" data-testid="type-row">
                {view.types.map((t, i) => (
                  <TypeBadge key={t} type={t} label={view.typeNamesZh[i] ?? t} variant="solid" />
                ))}
              </div>
              {pokemon.genusZh && (
                <p className="m-0 text-[12.5px] text-ink-2" data-testid="genus">
                  {pokemon.genusZh}
                </p>
              )}

              <dl
                className="m-0 grid grid-cols-[auto_auto_minmax(0,1fr)] gap-x-7 gap-y-1.5 pt-1 max-[520px]:grid-cols-2"
                data-testid="facts"
              >
                <div>
                  <dt className="text-[10.5px] text-ink-3">身高</dt>
                  <dd className="m-0 text-[14px] font-semibold num-tabular">{view.heightM} m</dd>
                </div>
                <div>
                  <dt className="text-[10.5px] text-ink-3">体重</dt>
                  <dd className="m-0 text-[14px] font-semibold num-tabular">{view.weightKg} kg</dd>
                </div>
                <div className="min-w-0 max-[520px]:col-span-full">
                  <dt className="text-[10.5px] text-ink-3">特性</dt>
                  <dd className="m-0 text-[13.5px] font-medium">
                    {pokemon.abilities.length ? (
                      pokemon.abilities.map((a, i) => (
                        /*
                         * 「名字（隐藏）」整体不拆行：第三列窄，直接塞字符串会把
                         * 「（隐藏）」拆成「（隐 / 藏）」两行（实测烈咬陆鲨就是这样）。
                         * 断行只允许发生在「/」分隔处，读起来才是一组一组的。
                         */
                        <span key={a.slug} className="whitespace-nowrap">
                          {i > 0 && <span className="text-ink-3"> / </span>}
                          {a.nameZh}
                          {a.hidden ? '（隐藏）' : ''}
                        </span>
                      ))
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
              </dl>

              <div className="pt-1.5">
                <CryButton cryUrl={pokemon.cryUrl} nameZh={pokemon.nameZh} />
              </div>
            </div>

            {/* 立绘：参考稿里它浮在一块「素板」上 —— 暖白纸面 + 极轻的径向暗化，
                主题色只在右上角那块斜切装饰（上面的 panel-band）里出现。
                底板本身不再吃 --poke / --tint（2026-10-05 按参考稿改），
                所以这里也没有那层属性色光晕了。 */}
            <div
              className="art-plate relative grid aspect-[4/5] place-items-center overflow-hidden rounded-lg max-[860px]:mx-auto max-[860px]:w-full max-[860px]:max-w-[280px]"
              data-testid="art-plate"
            >
              <img
                className="art-shadow relative h-auto w-[86%] object-contain"
                src={view.sprite}
                alt={`${view.nameZh}官方立绘`}
                width={288}
                height={288}
                decoding="async"
                data-testid="art-image"
              />
            </div>
          </div>
        </div>

        {/* Tab 栏：参考稿是通栏方形分片，选中片填主题色（不是圆角 pill） */}
        <div
          className="flex border-t border-line"
          role="tablist"
          aria-label="资料分栏"
          data-testid="tabbar"
        >
          {TABS.map((t, i) => {
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.key)}
                data-testid={`tab-${t.key}`}
                className={[
                  'flex-1 px-3 py-3 text-[13.5px] font-semibold transition-[background-color,color] duration-150',
                  i > 0 ? 'border-l border-line' : '',
                  on ? 'tab-btn-on' : 'text-ink-2 hover:bg-surface-2',
                ].join(' ')}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab 内容 */}
        <div className="border-t border-line px-6 py-5 max-[520px]:px-4" data-testid="detail-panel">
          {tab === 'basic' && (
            /*
             * 参考稿里这一页是「左：简介 + 能力值竖排 / 右：形态列表」。
             * 没有额外形态的宝可梦（431 只里的绝大多数）右列整块不存在，
             * 硬留一栏会白白浪费一半宽度 —— 所以两种列宽分开写：
             *   有形态 → 1fr + 280px（右列整列给形态）
             *   无形态 → 1fr + 1fr（左右平铺，与改造前一致）
             *
             * 280px 是量出来的、不是拍的：数据里最长的形态名是
             * 「阿勃梭鲁（超级 Z 形态）」（13 字），形态项现在是「小卡 + 两行字」，
             * 文字区需要约 182px，加上缩略图 52、gap 20、内边距 20 正好 274，
             * 取 280 留一点余量。再窄就会开始出现省略号。
             *
             * 两种分支的**子元素个数刻意保持一致**（都是 2 个直接子节点）：
             * 无形态那条路径不套多余的一层 div，否则详情页的 DOM 会比改造前深一级，
             * 样式快照里按结构定位的采集点会全部落空（落空是静默的，只会 diff 出 0 差异）。
             */
            <div
              className={[
                'grid gap-x-6 gap-y-5 max-[860px]:grid-cols-1',
                withForms ? 'grid-cols-[minmax(0,1fr)_280px]' : 'grid-cols-2',
              ].join(' ')}
            >
              {withForms ? (
                <>
                  <div className="flex min-w-0 flex-col gap-5">
                    {introBlock}
                    {statsBlock}
                  </div>
                  <FormList forms={forms} value={formSlug} onSelect={setPickedSlug} />
                </>
              ) : (
                <>
                  {introBlock}
                  {statsBlock}
                </>
              )}
            </div>
          )}

          {tab === 'stats' && <div className="max-w-[560px]">{statsBlock}</div>}

          {tab === 'dex' && (
            <div className="sub-card max-w-[760px] p-4">
              <DexIntro text={pokemon.flavorZh} big />
            </div>
          )}

          {tab === 'evo' && (
            <div data-testid="evolution">
              {hasLine ? (
                <EvolutionTree line={line} currentId={pokemon.id} members={members} onSelect={goTo} />
              ) : (
                <p className="text-[13.5px] text-ink-3">这只宝可梦没有进化形态。</p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ========================= 右侧信息面板 ========================= */}
      <aside className="flex flex-col gap-4">
        <section className="panel-card-soft px-5 py-4" data-testid="side-intro">
          {/*
           * 宣传飘带（参考稿顶部那条红色斜切角标）。
           * 只在数据里有宣传语时出现 —— 没有就是「没有这一块」，不占位不留白。
           *
           * 取 `pokemon.taglineZh` 而不是 `view.*`：宣传语是**这只宝可梦**的，
           * 切形态（如洛托姆→加热形态）不该换掉它。而名字那行用 view.nameZh，
           * 因为那个要跟着形态变（带出「（加热形态）」后缀）。
           */}
          {pokemon.taglineZh ? <PromoRibbon text={pokemon.taglineZh} /> : null}

          {/* 标题行：名字 + 编号（参考稿里小立绘不在这行，在下方图鉴介绍的右侧） */}
          <div className="mb-3 flex items-center border-b border-line pb-3">
            <p className="truncate text-[15px] font-bold" data-testid="side-head-name">
              {view.nameZh}
            </p>
            <p className="m-0 ml-auto shrink-0 pl-3 font-mono text-[11.5px] text-ink-3">
              No.{pokemon.dexNumber}
            </p>
          </div>

          <PanelHeading icon={<BookIcon />}>图鉴介绍</PanelHeading>
          {/* 小立绘在介绍文字右侧（参考稿版式），跟 view.sprite 走 —— 切形态跟着换 */}
          <div className="flex items-start gap-3">
            <p className="min-w-0 flex-1 text-[13px] leading-[1.75] text-ink-2">
              {pokemon.flavorZh || '暂无图鉴介绍。'}
            </p>
            <img
              className="size-12 shrink-0 object-contain"
              src={view.sprite}
              alt={`${view.nameZh}缩略立绘`}
              width={48}
              height={48}
              decoding="async"
            />
          </div>
        </section>

        <section className="panel-card-soft px-5 py-4" data-testid="side-ability">
          <PanelHeading icon={<StarIcon />}>特性</PanelHeading>
          <ul className="flex flex-col gap-2.5">
            {pokemon.abilities.map((a) => (
              <li key={a.slug}>
                <p className="text-[13.5px] font-semibold">
                  {a.nameZh}
                  {a.hidden && <span className="ml-1.5 text-[11px] font-normal text-ink-3">隐藏特性</span>}
                </p>
                <p className="text-[12.5px] leading-[1.7] text-ink-2">{a.descZh || '—'}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* 「近年来常见的形态」——只在这只真有额外形态时出现 */}
        {withForms && <FormStrip forms={forms} value={formSlug} onSelect={setPickedSlug} />}

        {hasLine && (
          <section className="panel-card-soft px-5 py-4" data-testid="side-evo">
            <PanelHeading icon={<ArrowIcon />}>进化链</PanelHeading>
            <EvolutionTree line={line} currentId={pokemon.id} members={members} onSelect={goTo} compact />
          </section>
        )}
      </aside>
    </div>
  );
}

/**
 * 图鉴文字块（basic 与 dex 两个 Tab 共用）。
 * clamp=true 时只露 4 行 —— 「基本信息」页是概览，「图鉴描述」页才给全文。
 *
 * 底色交给外层的 sub-card，这里只留左侧那条属性色条：两块叠底色会变成三层灰，
 * 反而看不出层次。
 */
function DexIntro({ text, big = false, clamp = false }: { text: string; big?: boolean; clamp?: boolean }) {
  return (
    <p
      className={[
        'tint-rule m-0 border-l-[3px] pl-3 leading-[1.8] text-ink-2',
        big ? 'text-[14px]' : 'text-[13px]',
        clamp ? 'intro-clamp' : '',
      ].join(' ')}
    >
      {text || '暂无图鉴描述。'}
    </p>
  );
}

