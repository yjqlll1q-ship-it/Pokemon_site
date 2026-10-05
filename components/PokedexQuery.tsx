'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  ApiError,
  Facets,
  SearchResponse,
  SortKey,
  StatColumnKey,
  TagKey,
} from '@/lib/api-types';
import { typeTintStyle } from '@/lib/typeColors';
import PokedexResultCard from './PokedexResultCard';
import TypeGallery from './TypeGallery';
import { TypeGlyph } from './typeIcons';

/* -------------------------------------------------------------------------- */
/* 筛选状态                                                                     */
/* -------------------------------------------------------------------------- */

interface Filters {
  q: string;
  types: string[];
  /** any = 拥有任一属性；all = 必须同时拥有 */
  typeMode: 'any' | 'all';
  excludeTypes: string[];
  generations: number[];
  tags: TagKey[];
  statTotalMin: string;
  statTotalMax: string;
  statKey: StatColumnKey | '';
  statMin: string;
  statMax: string;
  abilities: string[];
  eggGroups: string[];
  sort: SortKey;
  order: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 48;
const PAGE_SIZES = [24, 48, 96, 192];

const DEFAULTS: Filters = {
  q: '',
  types: [],
  typeMode: 'any',
  excludeTypes: [],
  generations: [],
  tags: [],
  statTotalMin: '',
  statTotalMax: '',
  statKey: '',
  statMin: '',
  statMax: '',
  abilities: [],
  eggGroups: [],
  sort: 'id',
  order: 'asc',
  page: 1,
  pageSize: PAGE_SIZE,
};

const STAT_OPTIONS: { key: StatColumnKey; label: string }[] = [
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: '攻击' },
  { key: 'defense', label: '防御' },
  { key: 'spAttack', label: '特攻' },
  { key: 'spDefense', label: '特防' },
  { key: 'speed', label: '速度' },
];

/** 状态 → 查询串（同时用于请求 API 与同步到地址栏） */
function toQueryString(f: Filters): string {
  const sp = new URLSearchParams();
  if (f.q) sp.set('q', f.q);
  if (f.types.length) sp.set('types', f.types.join(','));
  if (f.typeMode === 'all') sp.set('typeMode', 'all');
  if (f.excludeTypes.length) sp.set('excludeTypes', f.excludeTypes.join(','));
  if (f.generations.length) sp.set('generations', f.generations.join(','));
  if (f.tags.length) sp.set('tags', f.tags.join(','));
  if (f.statTotalMin) sp.set('statTotalMin', f.statTotalMin);
  if (f.statTotalMax) sp.set('statTotalMax', f.statTotalMax);
  if (f.statKey && (f.statMin || f.statMax)) {
    sp.set('statKey', f.statKey);
    if (f.statMin) sp.set('statMin', f.statMin);
    if (f.statMax) sp.set('statMax', f.statMax);
  }
  if (f.abilities.length) sp.set('abilities', f.abilities.join(','));
  if (f.eggGroups.length) sp.set('eggGroups', f.eggGroups.join(','));
  if (f.sort !== DEFAULTS.sort) sp.set('sort', f.sort);
  if (f.order !== DEFAULTS.order) sp.set('order', f.order);
  if (f.page > 1) sp.set('page', String(f.page));
  if (f.pageSize !== PAGE_SIZE) sp.set('pageSize', String(f.pageSize));
  return sp.toString();
}

/** 地址栏 → 状态（分享链接、前进后退都能还原筛选） */
function fromSearchParams(sp: URLSearchParams): Filters {
  const list = (key: string) =>
    sp
      .getAll(key)
      .flatMap((v) => v.split(','))
      .map((s) => s.trim())
      .filter(Boolean);
  const ints = (key: string) => list(key).map(Number).filter(Number.isFinite);
  const statKey = sp.get('statKey') ?? '';

  return {
    ...DEFAULTS,
    q: sp.get('q') ?? '',
    types: list('types'),
    typeMode: sp.get('typeMode') === 'all' ? 'all' : 'any',
    excludeTypes: list('excludeTypes'),
    generations: ints('generations').filter((g) => g >= 1 && g <= 3),
    tags: list('tags').filter((t): t is TagKey =>
      ['legendary', 'mythical', 'baby'].includes(t),
    ),
    statTotalMin: sp.get('statTotalMin') ?? '',
    statTotalMax: sp.get('statTotalMax') ?? '',
    statKey: STAT_OPTIONS.some((s) => s.key === statKey) ? (statKey as StatColumnKey) : '',
    statMin: sp.get('statMin') ?? '',
    statMax: sp.get('statMax') ?? '',
    abilities: list('abilities'),
    eggGroups: list('eggGroups'),
    sort: (sp.get('sort') as SortKey) ?? DEFAULTS.sort,
    order: sp.get('order') === 'desc' ? 'desc' : 'asc',
    page: Math.max(1, Number(sp.get('page') ?? 1) || 1),
    pageSize: PAGE_SIZES.includes(Number(sp.get('pageSize')))
      ? Number(sp.get('pageSize'))
      : PAGE_SIZE,
  };
}

/* -------------------------------------------------------------------------- */
/* 小零件                                                                       */
/* -------------------------------------------------------------------------- */

/** 中性芯片：世代 / 标记这类不属于任何属性的选项 */
function Toggle({
  on,
  children,
  onClick,
  testId,
}: {
  on: boolean;
  children: React.ReactNode;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className={[
        'rounded-full border px-2.5 py-[3px] text-[12px] font-medium transition-[background,border-color,color] duration-[140ms]',
        on
          ? 'border-navy bg-navy text-white'
          : 'border-line-strong bg-surface text-ink-2 hover:border-navy/40 hover:text-ink',
      ].join(' ')}
      onClick={onClick}
      aria-pressed={on}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

const FIELD =
  'h-8 rounded-sm border border-line-strong bg-surface px-2 text-[12.5px] text-ink outline-none transition-colors duration-150 hover:border-navy/40';

function NumberField({
  value,
  onChange,
  placeholder,
  min,
  max,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  testId?: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      className={`${FIELD} w-full num-tabular`}
      value={value}
      min={min}
      max={max}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      data-testid={testId}
    />
  );
}

/** 翻页页码：总页数多时只显示当前附近的窗口 */
function pageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const from = Math.max(2, current - 1);
  const to = Math.min(total - 1, current + 1);
  if (from > 2) out.push('…');
  for (let i = from; i <= to; i++) out.push(i);
  if (to < total - 1) out.push('…');
  out.push(total);
  return out;
}

/* -------------------------------------------------------------------------- */
/* 主体                                                                         */
/* -------------------------------------------------------------------------- */

export default function PokedexQuery() {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(DEFAULTS);
  /** 输入框的即时值；防抖后才进 filters，避免每敲一个字都打一次接口 */
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');

  const [facets, setFacets] = useState<Facets | null>(null);
  const [facetsError, setFacetsError] = useState<string | null>(null);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<'list' | 'types'>('list');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const seeded = useRef(false);

  /* ---- 1. 初次进入：从地址栏还原筛选 ---- */
  useEffect(() => {
    const f = fromSearchParams(new URLSearchParams(window.location.search));
    setFilters(f);
    setQInput(f.q);
    setQ(f.q);
    seeded.current = true;
  }, []);

  /* ---- 2. 筛选变化 → 写回地址栏（可分享、可前进后退） ---- */
  useEffect(() => {
    if (!seeded.current) return;
    const qs = toQueryString({ ...filters, q });
    window.history.replaceState(null, '', qs ? `/pokedex?${qs}` : '/pokedex');
  }, [filters, q]);

  /* ---- 3. 关键词防抖 ---- */
  useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(qInput);
      // 关键词变了必然要回到第一页，否则会停在一个空页上
      setFilters((f) => (f.page === 1 ? f : { ...f, page: 1 }));
    }, 300);
    return () => window.clearTimeout(t);
  }, [qInput]);

  /* ---- 4. 拉筛选面 ---- */
  useEffect(() => {
    let alive = true;
    fetch('/api/facets')
      .then(async (r) => {
        const body = (await r.json()) as Facets | ApiError;
        if (!r.ok) throw new Error('error' in body ? body.error : `HTTP ${r.status}`);
        return body as Facets;
      })
      .then((f) => alive && setFacets(f))
      .catch((e: Error) => alive && setFacetsError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  /* ---- 5. 查询 ---- */
  const queryString = useMemo(() => toQueryString({ ...filters, q }), [filters, q]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/pokedex?${queryString}`, { signal: ctrl.signal })
      .then(async (r) => {
        const body = (await r.json()) as SearchResponse | ApiError;
        if (!r.ok) throw new Error('error' in body ? body.error : `HTTP ${r.status}`);
        return body as SearchResponse;
      })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [queryString]);

  /* ---- 6. 点卡片 → 跳整页详情 ---- */
  /*
   * 这里原来是一个 Modal + 内嵌的 PokemonDetail，跟首页的整页详情两套版式。
   * 现在统一成「跳 /pokemon/[id]」：同一份 PokemonScreen、同一条 URL 规则，
   * 详情只有一处实现，改版式不用改两个地方。
   */
  const open = useCallback((id: number) => router.push(`/pokemon/${id}`), [router]);

  /* ---- 派生：生效筛选数 / 分页窗口 ---- */
  const activeCount = useMemo(() => {
    const f = filters;
    return [
      f.types.length > 0,
      f.excludeTypes.length > 0,
      f.generations.length > 0,
      f.tags.length > 0,
      Boolean(f.statTotalMin || f.statTotalMax),
      Boolean(f.statKey && (f.statMin || f.statMax)),
      f.abilities.length > 0,
      f.eggGroups.length > 0,
      f.typeMode === 'all',
    ].filter(Boolean).length;
  }, [filters]);

  const patch = useCallback((p: Partial<Filters>) => {
    // 任何筛选变动都要回到第一页（除了单纯翻页本身）
    setFilters((f) => ({ ...f, ...p, page: 'page' in p ? (p.page as number) : 1 }));
  }, []);

  const toggleIn = <T,>(arr: T[], v: T): T[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  const reset = useCallback(() => {
    setFilters(DEFAULTS);
    setQInput('');
    setQ('');
  }, []);

  const pickType = useCallback(
    (slug: string) => {
      setView('list');
      setFilters((f) => ({ ...f, types: [slug], excludeTypes: [], page: 1 }));
    },
    [],
  );

  const anyError = facetsError ?? error;

  return (
    <>
      <section className="mb-5 flex flex-col gap-2">
        <h1 className="text-[26px] font-bold tracking-[0.01em] max-[520px]:text-[22px]">图鉴查询</h1>
        <p className="max-w-[68ch] text-[13.5px] text-ink-2">
          覆盖第一至第三世代（全国图鉴 #{facets?.scope.min ?? 1}–#{facets?.scope.max ?? 386}，共{' '}
          {facets?.total ?? '…'} 只）。可按属性、世代、种族值、特性、蛋群多条件组合筛选，
          结果来自本地 SQLite 数据库。
        </p>
      </section>

      {/* ---------------- 搜索框 + 视图切换 ---------------- */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <input
            type="search"
            className="h-10 w-full rounded-sm border border-line-strong bg-surface pr-9 pl-3 text-[14px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-3 hover:border-navy/40"
            placeholder="搜索名称 / 编号 / 分类，例如「皮卡丘」「025」「鼠宝可梦」"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            data-testid="search-input"
            aria-label="搜索宝可梦"
          />
          {qInput && (
            <button
              type="button"
              className="absolute top-1/2 right-2 size-6 -translate-y-1/2 rounded-full text-[13px] text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
              onClick={() => setQInput('')}
              aria-label="清空搜索"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex rounded-sm border border-line-strong bg-surface p-0.5" role="tablist">
          {(['list', 'types'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              className={[
                'rounded-[6px] px-3 py-[6px] text-[12.5px] font-medium transition-[background,color] duration-150',
                view === v ? 'bg-navy text-white' : 'text-ink-2 hover:text-ink',
              ].join(' ')}
              onClick={() => setView(v)}
              data-testid={`view-${v}`}
            >
              {v === 'list' ? '列表' : '按属性'}
            </button>
          ))}
        </div>
      </div>

      {/* ---------------- 属性筛选 ---------------- */}
      <section className="mb-3" aria-labelledby="filter-types">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <h2 id="filter-types" className="text-[13px] font-bold tracking-[0.02em]">
            属性
          </h2>
          <span className="text-[11.5px] text-ink-3">
            {filters.typeMode === 'any' ? '命中任一属性' : '必须同时拥有全部已选属性'}
          </span>
          <div className="ml-auto flex rounded-sm border border-line-strong bg-surface p-0.5">
            {(['any', 'all'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={[
                  'rounded-[6px] px-2.5 py-[3px] text-[11.5px] font-medium transition-[background,color] duration-150',
                  filters.typeMode === m ? 'bg-navy text-white' : 'text-ink-2 hover:text-ink',
                ].join(' ')}
                onClick={() => patch({ typeMode: m })}
                // 分段控件必须能读出「当前选的是哪个」：视觉上是底色，语义上要有 aria-pressed，
                // 否则读屏用户和自动化断言都只能看到一个没状态的按钮
                aria-pressed={filters.typeMode === m}
                data-testid={`type-mode-${m}`}
              >
                {m === 'any' ? '任一' : '全部'}
              </button>
            ))}
          </div>
        </div>

        <ul className="flex flex-wrap gap-1.5" data-testid="type-chips">
          {(facets?.types ?? []).map((t) => {
            const on = filters.types.includes(t.slug);
            return (
              <li key={t.slug}>
                <button
                  type="button"
                  className={[
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[12px] font-semibold transition-[background,border-color,color] duration-[140ms]',
                    on ? 'type-chip-on' : 'type-chip border-current hover:opacity-80',
                  ].join(' ')}
                  style={typeTintStyle(t.slug)}
                  onClick={() => patch({ types: toggleIn(filters.types, t.slug) })}
                  aria-pressed={on}
                  data-testid="type-chip"
                  data-type={t.slug}
                >
                  {/*
                   * 属性筛芯片前面也放属性图标（2026-09-29 加），与其余两处属性标签同一口径。
                   *
                   * 颜色不能写死：选中态 `type-chip-on` 是实心深底 + 白字，图标必须跟着变白；
                   * 未选中态是浅底 + 同色系深字，图标取 `--tint` 主色。
                   * 所以用 `currentColor` 语义 —— 选中态给 `text-white`，
                   * 未选中态给 `text-(--tint)`，图标自身只写 `stroke="currentColor"`，
                   * 不需要在组件里判 `on`。
                   */}
                  <i
                    className={['inline-flex shrink-0', on ? 'text-white' : 'text-(--tint)'].join(' ')}
                    aria-hidden="true"
                    data-testid="type-icon"
                  >
                    <TypeGlyph type={t.slug} size={11} />
                  </i>
                  {t.nameZh}
                  <span className={`text-[10.5px] font-normal num-tabular ${on ? 'opacity-80' : 'opacity-70'}`}>
                    {t.count}
                  </span>
                </button>
              </li>
            );
          })}
          {!facets && !facetsError && <li className="text-[12px] text-ink-3">正在读取属性…</li>}
        </ul>
      </section>

      {/* ---------------- 更多筛选 ---------------- */}
      <div className="mb-3">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-2.5 py-[5px] text-[12.5px] font-medium text-ink-2 transition-colors duration-150 hover:border-navy/40 hover:text-ink"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
          data-testid="advanced-toggle"
        >
          更多筛选
          {activeCount > 0 && (
            <span className="rounded-full bg-navy px-1.5 text-[10.5px] leading-[1.5] text-white num-tabular">
              {activeCount}
            </span>
          )}
          <span aria-hidden="true">{showAdvanced ? '▴' : '▾'}</span>
        </button>

        {activeCount > 0 && (
          <button
            type="button"
            className="ml-2 text-[12px] text-ink-3 underline transition-colors duration-150 hover:text-ink"
            onClick={reset}
            data-testid="reset"
          >
            清除全部筛选
          </button>
        )}
      </div>

      {showAdvanced && (
        <div
          className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(216px,1fr))] gap-x-5 gap-y-3 rounded-md border border-line bg-surface-2/60 p-3.5"
          data-testid="advanced-panel"
        >
          {/* 世代 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] tracking-[0.02em] text-ink-3">世代</span>
            <div className="flex flex-wrap gap-1.5">
              <Toggle
                on={filters.generations.length === 0}
                onClick={() => patch({ generations: [] })}
                testId="gen-all"
              >
                全部
              </Toggle>
              {(facets?.generations ?? []).map((g) => (
                <Toggle
                  key={g.id}
                  on={filters.generations.includes(g.id)}
                  onClick={() => patch({ generations: toggleIn(filters.generations, g.id) })}
                  testId={`gen-${g.id}`}
                >
                  {g.regionZh}
                  <span className="ml-1 text-[10.5px] opacity-70 num-tabular">{g.count}</span>
                </Toggle>
              ))}
            </div>
          </div>

          {/* 特殊标记 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] tracking-[0.02em] text-ink-3">特殊标记</span>
            <div className="flex flex-wrap gap-1.5">
              {(facets?.tags ?? []).map((t) => (
                <Toggle
                  key={t.key}
                  on={filters.tags.includes(t.key)}
                  onClick={() => patch({ tags: toggleIn(filters.tags, t.key) })}
                  testId={`tag-${t.key}`}
                >
                  {t.label}
                  <span className="ml-1 text-[10.5px] opacity-70 num-tabular">{t.count}</span>
                </Toggle>
              ))}
              {!facets && <span className="text-[11.5px] text-ink-3">—</span>}
            </div>
          </div>

          {/* 种族值总和 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] tracking-[0.02em] text-ink-3">
              种族值总和
              {facets && (
                <span className="ml-1 text-ink-3/80 num-tabular">
                  （{facets.statTotal.min}–{facets.statTotal.max}）
                </span>
              )}
            </span>
            <div className="flex items-center gap-1.5">
              <NumberField
                value={filters.statTotalMin}
                onChange={(v) => patch({ statTotalMin: v })}
                placeholder="下限"
                min={facets?.statTotal.min}
                max={facets?.statTotal.max}
                testId="stat-total-min"
              />
              <span className="text-ink-3">–</span>
              <NumberField
                value={filters.statTotalMax}
                onChange={(v) => patch({ statTotalMax: v })}
                placeholder="上限"
                min={facets?.statTotal.min}
                max={facets?.statTotal.max}
                testId="stat-total-max"
              />
            </div>
          </div>

          {/* 单项种族值 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] tracking-[0.02em] text-ink-3">单项种族值</span>
            <div className="flex items-center gap-1.5">
              <select
                className={`${FIELD} w-[84px] flex-none`}
                value={filters.statKey}
                onChange={(e) => patch({ statKey: e.target.value as StatColumnKey | '' })}
                data-testid="stat-key"
                aria-label="选择要筛选的种族值项"
              >
                <option value="">不限制</option>
                {STAT_OPTIONS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <NumberField
                value={filters.statMin}
                onChange={(v) => patch({ statMin: v })}
                placeholder="下限"
                min={0}
                max={255}
                testId="stat-min"
              />
              <span className="text-ink-3">–</span>
              <NumberField
                value={filters.statMax}
                onChange={(v) => patch({ statMax: v })}
                placeholder="上限"
                min={0}
                max={255}
                testId="stat-max"
              />
            </div>
          </div>

          {/* 特性 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] tracking-[0.02em] text-ink-3">
              特性{filters.abilities.length > 0 && `（已选 ${filters.abilities.length}）`}
            </span>
            <select
              className={`${FIELD} w-full`}
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                patch({ abilities: toggleIn(filters.abilities, e.target.value) });
              }}
              data-testid="ability-select"
              aria-label="添加特性筛选"
            >
              <option value="">选择特性…</option>
              {(facets?.abilities ?? []).map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.nameZh}（{a.count}）
                </option>
              ))}
            </select>
            {filters.abilities.length > 0 && (
              <ul className="flex flex-wrap gap-1">
                {filters.abilities.map((slug) => (
                  <li key={slug}>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-px text-[11px] text-ink-2 transition-colors duration-150 hover:border-navy/40 hover:text-ink"
                      onClick={() => patch({ abilities: toggleIn(filters.abilities, slug) })}
                    >
                      {facets?.abilities.find((a) => a.slug === slug)?.nameZh ?? slug}
                      <span aria-hidden="true">✕</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 蛋群 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] tracking-[0.02em] text-ink-3">
              蛋群{filters.eggGroups.length > 0 && `（已选 ${filters.eggGroups.length}）`}
            </span>
            <select
              className={`${FIELD} w-full`}
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                patch({ eggGroups: toggleIn(filters.eggGroups, e.target.value) });
              }}
              data-testid="egg-select"
              aria-label="添加蛋群筛选"
            >
              <option value="">选择蛋群…</option>
              {(facets?.eggGroups ?? []).map((g) => (
                <option key={g.slug} value={g.slug}>
                  {g.nameZh}（{g.count}）
                </option>
              ))}
            </select>
            {filters.eggGroups.length > 0 && (
              <ul className="flex flex-wrap gap-1">
                {filters.eggGroups.map((slug) => (
                  <li key={slug}>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-px text-[11px] text-ink-2 transition-colors duration-150 hover:border-navy/40 hover:text-ink"
                      onClick={() => patch({ eggGroups: toggleIn(filters.eggGroups, slug) })}
                    >
                      {facets?.eggGroups.find((g) => g.slug === slug)?.nameZh ?? slug}
                      <span aria-hidden="true">✕</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 排除属性 */}
          {filters.types.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11.5px] tracking-[0.02em] text-ink-3">排除已选属性</span>
              <Toggle
                on={filters.excludeTypes.length > 0}
                onClick={() =>
                  patch({ excludeTypes: filters.excludeTypes.length ? [] : [...filters.types] })
                }
                testId="exclude-types"
              >
                {filters.excludeTypes.length ? '已排除（点此取消）' : '改成排除这些属性'}
              </Toggle>
              <span className="text-[11px] leading-[1.5] text-ink-3">
                把上面选中的属性从结果里剔除：例如「毒 + 排除草」= 有毒属性但不是草系的。
              </span>
            </div>
          )}
        </div>
      )}

      {/* ---------------- 结果栏 ---------------- */}
      {view === 'list' && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-line py-2">
            <p className="text-[13px] text-ink-2" data-testid="result-count">
              共 <b className="text-[15px] font-bold num-tabular text-ink">{data?.total ?? 0}</b> 只
              {data && data.pageCount > 1 && (
                <span className="ml-1 text-ink-3">
                  · 第 <span className="num-tabular">{data.page}</span> /{' '}
                  <span className="num-tabular">{data.pageCount}</span> 页
                </span>
              )}
              {loading && <span className="ml-2 text-[11.5px] text-ink-3">查询中…</span>}
            </p>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-[12px] text-ink-3">
                排序
                <select
                  className={`${FIELD} w-[112px]`}
                  value={filters.sort}
                  onChange={(e) => patch({ sort: e.target.value as SortKey })}
                  data-testid="sort"
                >
                  {(facets?.sortOptions ?? [{ key: 'id', label: '图鉴编号' }]).map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>

              <Toggle
                on={filters.order === 'desc'}
                onClick={() => patch({ order: filters.order === 'desc' ? 'asc' : 'desc' })}
                testId="order"
              >
                {filters.order === 'desc' ? '降序 ↓' : '升序 ↑'}
              </Toggle>

              <label className="flex items-center gap-1.5 text-[12px] text-ink-3">
                每页
                <select
                  className={`${FIELD} w-[68px]`}
                  value={String(filters.pageSize)}
                  onChange={(e) => patch({ pageSize: Number(e.target.value) })}
                  data-testid="page-size"
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {anyError && (
            <p
              className="mb-3 rounded-md border border-line bg-surface-2 px-4 py-3 text-[13px] text-ink-2"
              data-testid="error"
            >
              查询失败：{anyError}
            </p>
          )}

          {!anyError && data && data.items.length === 0 && (
            <p className="mb-3 rounded-md border border-line bg-surface-2 px-4 py-6 text-center text-[13px] text-ink-2">
              没有符合条件的宝可梦。可以试试放宽属性或数值范围。
            </p>
          )}

          {data && data.items.length > 0 && (
            <ul
              className="grid grid-cols-[repeat(auto-fill,minmax(158px,1fr))] gap-3 max-[520px]:grid-cols-[repeat(auto-fill,minmax(140px,1fr))]"
              data-testid="result-grid"
            >
              {data.items.map((p) => (
                <PokedexResultCard key={p.id} pokemon={p} onOpen={open} />
              ))}
            </ul>
          )}

          {/* 翻页 */}
          {data && data.pageCount > 1 && (
            <nav
              className="mt-6 flex flex-wrap items-center justify-center gap-1.5"
              aria-label="分页"
              data-testid="pagination"
            >
              <button
                type="button"
                className="rounded-sm border border-line-strong bg-surface px-2.5 py-[5px] text-[12.5px] text-ink-2 transition-colors duration-150 hover:border-navy/40 hover:text-ink disabled:opacity-40"
                onClick={() => patch({ page: data.page - 1 })}
                disabled={data.page <= 1}
                data-testid="page-prev"
              >
                上一页
              </button>

              {pageWindow(data.page, data.pageCount).map((p, i) =>
                p === '…' ? (
                  <span key={`gap-${i}`} className="px-1 text-[12.5px] text-ink-3">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    className={[
                      'min-w-[32px] rounded-sm border px-2 py-[5px] text-[12.5px] num-tabular transition-colors duration-150',
                      p === data.page
                        ? 'border-navy bg-navy text-white'
                        : 'border-line-strong bg-surface text-ink-2 hover:border-navy/40 hover:text-ink',
                    ].join(' ')}
                    onClick={() => patch({ page: p })}
                    aria-current={p === data.page ? 'page' : undefined}
                    data-testid="page-number"
                  >
                    {p}
                  </button>
                ),
              )}

              <button
                type="button"
                className="rounded-sm border border-line-strong bg-surface px-2.5 py-[5px] text-[12.5px] text-ink-2 transition-colors duration-150 hover:border-navy/40 hover:text-ink disabled:opacity-40"
                onClick={() => patch({ page: data.page + 1 })}
                disabled={data.page >= data.pageCount}
                data-testid="page-next"
              >
                下一页
              </button>
            </nav>
          )}
        </>
      )}

      {view === 'types' && <TypeGallery onPick={pickType} />}
    </>
  );
}
