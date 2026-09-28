/**
 * 自定义网页背景 —— 客户端侧的「校验 / 存取 / 持久化」。
 *
 * 这里只管数据，不碰 DOM 结构；渲染与交互在 components/SiteBackground.tsx。
 *
 * ## 限额的出处（不是拍脑袋定的）
 *
 * 单文件 5 MB，对齐的是那些**专门管背景图**的产品的规定：
 *   - 爱数「系统图片配置」：背景图支持 jpg/png，**不允许超过 5 MB**，建议 1920×1080
 *   - Zaveit 自定义页图片规范：允许格式 PNG / JPG，**每张最大 5 MB**
 * 更宽的一档（10 MB）来自通用图片服务：SiteSwan 图片指引 10 MB、
 * Cloudflare Images 10 MB。我们取严的一档 —— 背景图是每次导航都要解码的东西，
 * 放宽到 10 MB 换不来什么，只换来首屏更慢。
 *
 * 像素上限照抄 Cloudflare Images 的公开规定：单边 ≤ 12000px、总面积 ≤ 100MP。
 * （浏览器对画布/纹理有实际限制，超过这个量级解码本身就会失败。）
 *
 * ## 为什么图片放 IndexedDB 而不是 localStorage
 *
 * localStorage 只能存字符串：图片得先转 base64（体积 +33%），而它整个配额通常
 * 只有 5 MB —— 恰好等于我们允许的最大图片，**一定爆**，而且爆的时候是
 * QuotaExceededError，图片和设置会一起丢。IndexedDB 能直接存 Blob，
 * 配额也宽得多。设置本身很小，仍然放 localStorage（同步读取，首屏不闪）。
 */

/* -------------------------------------------------------------------------- */
/* 限额与格式                                                                  */
/* -------------------------------------------------------------------------- */

/** 单文件上限：5 MB（爱数 / Zaveit 的背景图规定） */
export const BG_MAX_BYTES = 5 * 1024 * 1024;

/** 单边像素上限（Cloudflare Images：12000px） */
export const BG_MAX_EDGE = 12000;

/** 总面积上限（Cloudflare Images：100 MP） */
export const BG_MAX_PIXELS = 100_000_000;

/** 低于这个宽度会明显拉伸发虚，只提示不拦截 */
export const BG_RECOMMEND_WIDTH = 1920;

/**
 * 允许的 MIME。
 *
 * **刻意不含 SVG**：SVG 是唯一能内嵌 `<script>` / `<foreignObject>` 的图片格式，
 * 而这块图片会被套进 CSS `url()` 与 `<img>`，一旦将来有人把 `src` 换成内联渲染，
 * 就是一个现成的 XSS 入口。背景图用位图完全够，没必要开这个口子。
 * （Cloudflare Images 接受 SVG，SiteSwan 也接受，但它们有服务端转码与净化；
 *   我们在客户端直存直用，没有那层缓冲。）
 */
export const BG_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/bmp',
] as const;

/** 扩展名兜底：部分浏览器对 .bmp / .avif 给出的 `File.type` 是空串 */
const BG_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp'] as const;

/** 给 <input type="file"> 用 */
export const BG_ACCEPT = [...BG_MIME_TYPES, ...BG_EXTENSIONS.map((e) => `.${e}`)].join(',');

/** 给用户看的一句话说明 */
export const BG_FORMAT_HINT = 'JPG / PNG / WebP / GIF / AVIF / BMP，单张不超过 5 MB';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/* -------------------------------------------------------------------------- */
/* 类型                                                                        */
/* -------------------------------------------------------------------------- */

export type FitMode = 'cover' | 'contain' | 'tile';

export const FIT_MODES: { value: FitMode; label: string }[] = [
  { value: 'cover', label: '铺满裁切' },
  { value: 'contain', label: '完整显示' },
  { value: 'tile', label: '平铺重复' },
];

export interface BgImageMeta {
  name: string;
  type: string;
  size: number;
  width: number;
  height: number;
}

export interface BgSettings {
  /** 关掉之后图片仍留在本地，随时可以再打开 */
  enabled: boolean;
  fit: FitMode;
  /** 0–100 */
  opacity: number;
  /** 0–24，px */
  blur: number;
  /**
   * 0–80：压在图片上的**浅色**遮罩浓度，用来救正文可读性。
   *
   * 这里刻意用纸色而不是深色：本站是「深字浅底」主题（正文 --color-ink 是深色），
   * 把底压暗只会让深色正文更糊。深色遮罩是「白字压暗底」那类站点的惯例，
   * 套到本站是反的。浅色遮罩把照片往纸色上拉，深字照样能读，照片仍看得出来。
   */
  scrim: number;
  meta: BgImageMeta | null;
}

export const BG_DEFAULTS: BgSettings = {
  enabled: true,
  fit: 'cover',
  opacity: 100,
  blur: 0,
  scrim: 52,
  meta: null,
};

/** 遮罩用哪个颜色。浅色主题 → 纸色；将来做暗色主题时改成 --color-ink 即可 */
export const BG_SCRIM_COLOR = 'var(--color-paper)';

/* -------------------------------------------------------------------------- */
/* 设置：localStorage                                                          */
/* -------------------------------------------------------------------------- */

const SETTINGS_KEY = 'pokemon-site:bg:settings:v1';

export function loadSettings(): BgSettings {
  if (typeof window === 'undefined') return { ...BG_DEFAULTS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...BG_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<BgSettings>;
    return {
      enabled: parsed.enabled !== false,
      fit: FIT_MODES.some((m) => m.value === parsed.fit) ? (parsed.fit as FitMode) : BG_DEFAULTS.fit,
      opacity: clampInt(parsed.opacity, 0, 100, BG_DEFAULTS.opacity),
      blur: clampInt(parsed.blur, 0, 24, BG_DEFAULTS.blur),
      scrim: clampInt(parsed.scrim, 0, 80, BG_DEFAULTS.scrim),
      meta: parsed.meta ?? null,
    };
  } catch {
    // 存坏了就当没有，不要让一条脏数据把整站背景卡死
    return { ...BG_DEFAULTS };
  }
}

export function saveSettings(s: BgSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* 隐私模式下写不进去，忽略：本次会话仍然生效 */
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/* -------------------------------------------------------------------------- */
/* 图片：IndexedDB                                                             */
/* -------------------------------------------------------------------------- */

const DB_NAME = 'pokemon-site';
const DB_VERSION = 1;
const STORE = 'background-image';
const BLOB_KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB 操作失败'));
        t.oncomplete = () => db.close();
        t.onerror = () => {
          db.close();
          reject(t.error ?? new Error('IndexedDB 事务失败'));
        };
      }),
  );
}

export function putImageBlob(blob: Blob): Promise<void> {
  return tx<IDBValidKey>('readwrite', (s) => s.put(blob, BLOB_KEY)).then(() => undefined);
}

export async function getImageBlob(): Promise<Blob | null> {
  try {
    const v = await tx<unknown>('readonly', (s) => s.get(BLOB_KEY));
    return v instanceof Blob ? v : null;
  } catch {
    return null;
  }
}

export async function deleteImageBlob(): Promise<void> {
  try {
    await tx<undefined>('readwrite', (s) => s.delete(BLOB_KEY));
  } catch {
    /* 删不掉就算了，下一次 put 会覆盖 */
  }
}

/* -------------------------------------------------------------------------- */
/* 校验                                                                        */
/* -------------------------------------------------------------------------- */

export interface ValidationResult {
  ok: boolean;
  /** 硬性不通过的原因 */
  error?: string;
  /** 能用但值得提醒 */
  warning?: string;
}

/** 不依赖图片内容的前置判断：格式与体积。解码前就能挡掉大部分错误输入 */
export function checkFileBasics(file: File): ValidationResult {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  const mime = (file.type || '').toLowerCase();

  if (mime === 'image/svg+xml' || ext === 'svg') {
    return { ok: false, error: 'SVG 不支持：它可以内嵌脚本，本站不做净化，请改用位图。' };
  }

  const mimeOk = (BG_MIME_TYPES as readonly string[]).includes(mime);
  const extOk = (BG_EXTENSIONS as readonly string[]).includes(ext);
  if (!mimeOk && !extOk) {
    return { ok: false, error: `格式不支持（${mime || ext || '未知'}）：只接受 ${BG_FORMAT_HINT}。` };
  }

  if (file.size === 0) return { ok: false, error: '这个文件是空的。' };
  if (file.size > BG_MAX_BYTES) {
    return {
      ok: false,
      error: `图片 ${formatBytes(file.size)}，超过 ${formatBytes(BG_MAX_BYTES)} 上限，请先压缩再上传。`,
    };
  }
  return { ok: true };
}

export interface ImageMeta {
  width: number;
  height: number;
}

/** 解码拿到真实像素尺寸。这一步同时兼作「文件真的是一张能被浏览器解开的图」的验证 */
export function readImageMeta(file: File): Promise<ImageMeta> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file)
      .then((bmp) => {
        const meta = { width: bmp.width, height: bmp.height };
        bmp.close?.();
        return meta;
      })
      .catch(() => fallbackDecode(file));
  }
  return fallbackDecode(file);
}

function fallbackDecode(file: File): Promise<ImageMeta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('浏览器无法解码这个文件'));
    };
    img.src = url;
  });
}

/** 像素量级判断（照抄 Cloudflare Images 的公开规定）*/
export function checkDimensions(meta: ImageMeta): ValidationResult {
  const { width, height } = meta;
  if (!width || !height) return { ok: false, error: '读不到图片尺寸，文件可能已损坏。' };
  if (width > BG_MAX_EDGE || height > BG_MAX_EDGE) {
    return { ok: false, error: `尺寸 ${width}×${height} 超出单边 ${BG_MAX_EDGE}px 上限。` };
  }
  if (width * height > BG_MAX_PIXELS) {
    return { ok: false, error: `尺寸 ${width}×${height} 超过 ${BG_MAX_PIXELS / 1_000_000}MP 上限。` };
  }
  if (width < BG_RECOMMEND_WIDTH) {
    return {
      ok: true,
      warning: `宽度只有 ${width}px，低于建议的 ${BG_RECOMMEND_WIDTH}px，铺满屏幕会发虚。`,
    };
  }
  return { ok: true };
}
