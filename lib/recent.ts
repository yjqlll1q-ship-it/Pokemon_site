/**
 * 最近浏览（顶栏那个时钟按钮的下拉数据）。
 *
 * 纯客户端：只写 localStorage，不发请求、不进仓库。
 * 与 `lib/siteBackground.ts` 同一条纪律 —— 本模块**不 import 任何数据源**，
 * 因此可以被客户端组件安全引用（引一次 `lib/pokedex.ts` 就会把 431 只打进浏览器包）。
 *
 * 为什么不用 context / store：写入方只有详情页一处、读取方只有顶栏一处，
 * 两者之间隔着布局层（AppShell）。用 localStorage + 自定义事件比引一层 context 更轻，
 * 而且顺带获得「刷新后仍在」这个行为。
 */

export interface RecentEntry {
  id: number;
  nameZh: string;
  /** 详情页 96px 小图的路径（`/sprites/<id>.png`） */
  sprite: string;
  /** 访问时间戳，仅用于排序 */
  at: number;
}

const KEY = 'pokedex:recent';
/** 只留最近这么多条 —— 再多下拉就比屏幕还长了 */
export const RECENT_MAX = 8;
/** 同一个标签页内通知顶栏刷新用的自定义事件 */
export const RECENT_EVENT = 'pokedex:recent';

/**
 * 读最近浏览。
 *
 * localStorage 在隐私模式 / 禁用 Cookie 时会**直接抛异常**（不是返回 null），
 * 所以每一处访问都包在 try 里 —— 这个功能坏了不该把整页拖down。
 */
export function readRecent(): RecentEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 逐条校验：历史数据可能是旧版本写的，形状不对就整条丢掉，不要渲染出半个卡片
    return parsed.filter(isEntry).slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

/**
 * 记一次访问。同一只只保留最新一条（重新访问会把它挪到最前）。
 * 返回写入后的完整列表，方便调用方直接 setState，省一次读。
 */
export function pushRecent(entry: Omit<RecentEntry, 'at'>): RecentEntry[] {
  const next = [{ ...entry, at: Date.now() }, ...readRecent().filter((e) => e.id !== entry.id)].slice(
    0,
    RECENT_MAX,
  );
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 存不下就算了，功能降级但页面不受影响 */
  }
  window.dispatchEvent(new Event(RECENT_EVENT));
  return next;
}

export function clearRecent(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* 同上 */
  }
  window.dispatchEvent(new Event(RECENT_EVENT));
}

function isEntry(v: unknown): v is RecentEntry {
  if (!v || typeof v !== 'object') return false;
  const e = v as Partial<RecentEntry>;
  return typeof e.id === 'number' && typeof e.nameZh === 'string' && typeof e.sprite === 'string';
}
