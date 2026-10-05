'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { ApiError, PokemonListItem, SearchResponse } from '@/lib/api-types';
import { RECENT_EVENT, readRecent, type RecentEntry } from '@/lib/recent';

/** 一次拉几条建议。够看清，也不至于把下拉撑得比屏幕还长 */
const SUGGEST_SIZE = 6;
/** 输入停顿多久才发请求 —— 太短会每敲一个字打一次接口 */
const DEBOUNCE_MS = 220;

interface Props {
  /** 侧栏当前是否展开（决定汉堡按钮的 aria-pressed 与提示文案） */
  railOpen: boolean;
  onToggleRail: () => void;
}

/**
 * 顶栏 + 全局搜索 + 两个圆形按钮（参考稿右上角那一块）。
 *
 * 参考稿里搜索框右边有两颗圆形图标按钮。它们**没有做成死按钮**：
 *   · 时钟 → 最近浏览（读 lib/recent.ts 的 localStorage，点条目直接跳详情）
 *   · 汉堡 → 折叠 / 展开左侧导航（状态托管在 AppShell，刷新后保持）
 * 参考稿本身没说明这两颗是干什么的，但一个所有元素都对齐、只有两颗按钮点了没反应的
 * 界面，比少两颗按钮更糟。
 *
 * 搜索走的是既有查询接口 `/api/pokedex?q=`（它同时认中文名 / 日文名 / 英文名 / 编号，
 * `25` 和 `0025` 都命中 #25），所以这里**没有新增任何数据通道**。
 *
 * 全部结果都从接口 / localStorage 拿，组件里不 import 任何数据源 —— 与全站的
 * 「客户端零数据」一致，引一次 lib/pokedex.ts 就会把 431 只打进浏览器包。
 */
export default function AppTopBar({ railOpen, onToggleRail }: Props) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<PokemonListItem[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [recentOpen, setRecentOpen] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);
  const recentRef = useRef<HTMLDivElement>(null);

  /* ---- 最近浏览：首帧读一次，之后由自定义事件驱动 ---- */
  useEffect(() => {
    setRecent(readRecent());
    const sync = () => setRecent(readRecent());
    window.addEventListener(RECENT_EVENT, sync);
    return () => window.removeEventListener(RECENT_EVENT, sync);
  }, []);

  /* ---- 输入防抖 → 查接口 ---- */
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setItems([]);
      setOpen(false);
      setState('idle');
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      setState('loading');
      fetch(`/api/pokedex?q=${encodeURIComponent(term)}&pageSize=${SUGGEST_SIZE}`)
        .then(async (r) => {
          const body = (await r.json()) as SearchResponse | ApiError;
          if (!r.ok) throw new Error('error' in body ? body.error : `HTTP ${r.status}`);
          return body as SearchResponse;
        })
        .then((d) => {
          if (!alive) return;
          setItems(d.items ?? []);
          setActive(-1);
          setOpen(true);
          setState('done');
        })
        .catch(() => {
          if (!alive) return;
          setItems([]);
          setState('error');
        });
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [q]);

  /* ---- 点面板外面收起（两个下拉各管各的，一次监听处理完） ---- */
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (boxRef.current && !boxRef.current.contains(t)) setOpen(false);
      if (recentRef.current && !recentRef.current.contains(t)) setRecentOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const goto = (id: number) => {
    setOpen(false);
    setRecentOpen(false);
    setQ('');
    setActive(-1);
    router.push(`/pokemon/${id}`);
  };

  /** 回车：有高亮就去高亮那条，没有就直接跳第一条（用户敲完就想走） */
  const submit = () => {
    const pick = active >= 0 ? items[active] : items[0];
    if (pick) goto(pick.id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + items.length) % items.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  const showPanel = open && q.trim().length > 0;

  return (
    <header
      className="app-topbar sticky top-0 z-30 flex items-center gap-3 px-5 py-2.5 max-[900px]:px-3 max-[900px]:py-2"
      data-testid="app-topbar"
    >
      <div className="ml-auto flex w-full max-w-[524px] items-center gap-2.5">
        {/* 搜索框 */}
        <div className="relative min-w-0 flex-1" ref={boxRef}>
          <label className="sr-only" htmlFor="global-search">
            输入宝可梦名字或编号
          </label>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-white/60"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-[15px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m16.5 16.5 4 4" />
            </svg>
          </span>

          <input
            id="global-search"
            type="search"
            role="searchbox"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => q.trim() && items.length && setOpen(true)}
            placeholder="输入宝可梦名字或编号"
            data-testid="global-search"
            className="topbar-search h-9 w-full rounded-full pr-3.5 pl-9 text-[13px] outline-none"
          />

          {showPanel && (
            <ul
              className="panel-card animate-fade absolute top-[calc(100%+7px)] right-0 left-0 z-40 max-h-[336px] overflow-y-auto py-1.5"
              data-testid="search-results"
            >
              {items.length === 0 ? (
                <li className="px-3.5 py-2 text-[12.5px] text-ink-3" data-testid="search-empty">
                  {state === 'error' ? '搜索请求失败' : state === 'loading' ? '搜索中…' : '没有匹配的宝可梦'}
                </li>
              ) : (
                items.map((p, i) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => goto(p.id)}
                      data-testid="search-item"
                      data-pokemon-id={p.id}
                      className={[
                        'flex w-full items-center gap-2.5 px-3 py-1.5 text-left',
                        i === active ? 'bg-surface-2' : 'bg-transparent',
                      ].join(' ')}
                    >
                      <img
                        src={p.sprite}
                        alt=""
                        width={28}
                        height={28}
                        loading="lazy"
                        decoding="async"
                        className="size-7 flex-none object-contain"
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                        {p.nameZh}
                      </span>
                      <span className="flex-none font-mono text-[11px] text-ink-3">
                        #{String(p.dexNumber).padStart(4, '0')}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        {/* 最近浏览 */}
        <div className="relative" ref={recentRef}>
          <button
            type="button"
            onClick={() => setRecentOpen((v) => !v)}
            aria-expanded={recentOpen}
            aria-label="最近浏览"
            title="最近浏览"
            data-testid="topbar-recent"
            className="topbar-icon"
          >
            <Icon>
              <circle cx="12" cy="12" r="8" />
              <path d="M12 7.5V12l3 1.8" />
            </Icon>
          </button>

          {recentOpen && (
            <ul
              className="panel-card animate-fade absolute top-[calc(100%+9px)] right-0 z-40 w-[248px] overflow-hidden py-1.5"
              data-testid="recent-panel"
            >
              {recent.length === 0 ? (
                <li className="px-3.5 py-2 text-[12.5px] text-ink-3" data-testid="recent-empty">
                  还没有浏览记录
                </li>
              ) : (
                recent.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => goto(e.id)}
                      data-testid="recent-item"
                      data-pokemon-id={e.id}
                      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-surface-2"
                    >
                      <img
                        src={e.sprite}
                        alt=""
                        width={28}
                        height={28}
                        loading="lazy"
                        decoding="async"
                        className="size-7 flex-none object-contain"
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                        {e.nameZh}
                      </span>
                      <span className="flex-none font-mono text-[11px] text-ink-3">
                        #{String(e.id).padStart(4, '0')}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        {/* 折叠 / 展开左侧导航（窄屏的导航是顶部横条，没有折叠概念，所以隐藏） */}
        <button
          type="button"
          onClick={onToggleRail}
          aria-pressed={!railOpen}
          aria-label={railOpen ? '收起左侧导航' : '展开左侧导航'}
          title={railOpen ? '收起左侧导航' : '展开左侧导航'}
          data-testid="topbar-rail-toggle"
          className="topbar-icon max-[900px]:hidden"
        >
          <Icon>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </Icon>
        </button>
      </div>
    </header>
  );
}

/** 顶栏图标统一 17px / 1.8 描边，避免每处各写一遍 svg 属性 */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[17px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
