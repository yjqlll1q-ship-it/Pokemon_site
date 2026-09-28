'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  BG_ACCEPT,
  BG_DEFAULTS,
  BG_FORMAT_HINT,
  BG_MAX_BYTES,
  BG_RECOMMEND_WIDTH,
  BG_SCRIM_COLOR,
  FIT_MODES,
  checkDimensions,
  checkFileBasics,
  deleteImageBlob,
  formatBytes,
  getImageBlob,
  loadSettings,
  putImageBlob,
  readImageMeta,
  saveSettings,
  type BgImageMeta,
  type BgSettings,
} from '@/lib/siteBackground';

/**
 * 全站自定义背景：一个铺满视口的固定层 + 右下角浮动控件。
 *
 * ## 为什么用独立的固定层，而不是直接改 body 的 background
 *
 * body 的 `background: var(--color-paper)` 会被 CSS 规范「传播」到画布上
 * （html 未设背景时，body 的背景即为画布背景）。直接改它有两个麻烦：
 * 一是没法单独调不透明度（`body { opacity }` 会连正文一起变淡），
 * 二是「移除背景」时要准确还原回纸色。
 *
 * 改成 body 的第一个子元素：`position: fixed; inset: 0; z-index: -1`。
 * 按 CSS 2.1 附录 E 的绘制顺序，负 z-index 的子层排在「根背景之后、正常流内容之前」，
 * 所以它盖得住画布纸色、又压不住任何正文 —— 且**不需要动 body 的任何子元素**
 * （header 是 sticky + z-20，一旦去动它的定位或层级，很容易把顶栏压到内容下面）。
 *
 * ## 关于 Tailwind v4 在本机 Chrome 114 上的坑
 *
 * 动态数值（不透明度 / 模糊 / 铺法）**一律走内联 style**：
 * 这些值运行时才确定，utility 本来也表达不了；顺带绕开内置
 * `backdrop-blur-*` / `drop-shadow-*` 的 var() 链静默失效问题。
 * 面板上的静态样式用站内已有的 token 与 utility，并复用 globals.css 里的
 * `note-error` / `note-warn`（这两个是按项目约定用 @utility 直写最终值的）。
 */
export default function SiteBackground() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<BgSettings>(BG_DEFAULTS);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const urlRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const replaceUrl = useCallback((next: string | null) => {
    if (urlRef.current && urlRef.current !== next) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next;
    setObjectUrl(next);
  }, []);

  /* ---- 首帧：把上次的选择读回来 ---------------------------------------- */
  useEffect(() => {
    let alive = true;
    void (async () => {
      const stored = loadSettings();
      const blob = await getImageBlob();
      if (!alive) return;
      if (blob) {
        replaceUrl(URL.createObjectURL(blob));
        setSettings(stored);
      } else {
        // 图没了（换浏览器 / 清了站点数据）就把开关一起关掉，不留半死状态
        setSettings({ ...stored, enabled: false, meta: null });
      }
      setMounted(true);
    })();
    return () => {
      alive = false;
    };
  }, [replaceUrl]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const active = mounted && settings.enabled && !!objectUrl;

  // 同步到 <body data-site-bg>：给 CSS 留钩子，也让自动化能直接断言状态
  useEffect(() => {
    if (!mounted) return;
    document.body.dataset.siteBg = active ? 'on' : 'off';
    return () => {
      delete document.body.dataset.siteBg;
    };
  }, [active, mounted]);

  /* ---- 交互 ------------------------------------------------------------- */
  const patch = useCallback((part: Partial<BgSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...part };
      saveSettings(next);
      return next;
    });
  }, []);

  const onFile = useCallback(
    async (file: File | null | undefined) => {
      setError(null);
      setNotice(null);
      if (!file) return;
      setReading(true);
      try {
        const basic = checkFileBasics(file);
        if (!basic.ok) {
          setError(basic.error ?? '这个文件不能用。');
          return;
        }
        const size = await readImageMeta(file);
        const dim = checkDimensions(size);
        if (!dim.ok) {
          setError(dim.error ?? '图片尺寸不合格。');
          return;
        }
        await putImageBlob(file);
        replaceUrl(URL.createObjectURL(file));
        const meta: BgImageMeta = {
          name: file.name,
          type: file.type || '',
          size: file.size,
          width: size.width,
          height: size.height,
        };
        setSettings((prev) => {
          const next: BgSettings = { ...prev, enabled: true, meta };
          saveSettings(next);
          return next;
        });
        setNotice(dim.warning ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : '读取这张图片时出错了。');
      } finally {
        setReading(false);
        // 清空 value：同一个文件再选一次也能触发 change
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [replaceUrl],
  );

  const removeImage = useCallback(async () => {
    await deleteImageBlob();
    replaceUrl(null);
    setError(null);
    setNotice(null);
    setSettings((prev) => {
      const next: BgSettings = { ...prev, enabled: false, meta: null };
      saveSettings(next);
      return next;
    });
  }, [replaceUrl]);

  // Esc 关面板 + 焦点还给开关；点面板外也关
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      toggleRef.current?.focus();
    };
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  /* ---- 背景层 ----------------------------------------------------------- */
  const layerStyle: CSSProperties = {
    backgroundImage: objectUrl ? `url("${objectUrl}")` : undefined,
    backgroundSize: settings.fit === 'tile' ? 'auto' : settings.fit,
    backgroundRepeat: settings.fit === 'tile' ? 'repeat' : 'no-repeat',
    backgroundPosition: 'center center',
    opacity: settings.opacity / 100,
    // 模糊会让边缘露出底色，放大一点点把边补回去
    filter: settings.blur > 0 ? `blur(${settings.blur}px)` : undefined,
    transform: settings.blur > 0 ? 'scale(1.06)' : undefined,
  };

  return (
    <>
      {active && (
        <>
          <div
            className="pointer-events-none fixed inset-0 -z-10"
            style={layerStyle}
            aria-hidden="true"
            data-testid="bg-layer"
            data-fit={settings.fit}
            data-blur={settings.blur}
          />
          <div
            className="pointer-events-none fixed inset-0 -z-10"
            style={{ backgroundColor: BG_SCRIM_COLOR, opacity: settings.scrim / 100 }}
            aria-hidden="true"
            data-testid="bg-scrim"
          />
        </>
      )}

      <div
        ref={rootRef}
        className="fixed right-4 bottom-4 z-40 flex flex-col items-end gap-2 max-[520px]:right-3 max-[520px]:bottom-3"
      >
        {open && (
          <div
            id="bg-panel"
            role="dialog"
            aria-label="自定义网页背景"
            data-testid="bg-panel"
            className="animate-rise w-[min(340px,calc(100vw-24px))] rounded-lg border border-line bg-surface p-4 shadow-lg"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[14px] font-semibold text-ink">自定义网页背景</h2>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  toggleRef.current?.focus();
                }}
                data-testid="bg-close"
                aria-label="关闭背景设置"
                className="size-7 rounded-full border border-line bg-surface text-[14px] leading-none text-ink-2 transition-colors duration-150 hover:border-line-strong hover:bg-surface-2 hover:text-ink"
              >
                ×
              </button>
            </div>

            <input
              ref={fileRef}
              id="bg-file-input"
              type="file"
              accept={BG_ACCEPT}
              data-testid="bg-file"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <label
              htmlFor="bg-file-input"
              data-testid="bg-pick"
              className="flex h-9 cursor-pointer items-center justify-center rounded-sm border border-line-strong bg-surface text-[13px] font-medium text-navy transition-colors duration-150 hover:border-navy/40 hover:bg-surface-2"
            >
              {reading ? '正在读取…' : objectUrl ? '换一张图片' : '选择本地图片'}
            </label>

            {settings.meta && objectUrl ? (
              <div className="mt-3 flex gap-3" data-testid="bg-preview">
                {/* 预览用普通 img：本站不使用 next/image（见 README 的取舍说明） */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={objectUrl}
                  alt=""
                  className="size-14 flex-none rounded-sm border border-line object-cover"
                />
                <div className="min-w-0 flex-1 text-[11.5px] leading-[1.7] text-ink-2">
                  <p className="truncate text-ink" title={settings.meta.name}>
                    {settings.meta.name}
                  </p>
                  <p className="num-tabular" data-testid="bg-meta-size">
                    {settings.meta.width}×{settings.meta.height} · {formatBytes(settings.meta.size)}
                  </p>
                  <p className="text-ink-3">上限 {formatBytes(BG_MAX_BYTES)} / 建议宽 {BG_RECOMMEND_WIDTH}px</p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-[11.5px] leading-[1.7] text-ink-3" data-testid="bg-empty">
                支持 {BG_FORMAT_HINT}。图片只存在你这台机器的浏览器里，不会上传到任何服务器。
              </p>
            )}

            {error && (
              <p role="alert" data-testid="bg-error" className="note-error mt-3 rounded-sm px-2.5 py-2 text-[12px] leading-[1.6]">
                {error}
              </p>
            )}
            {notice && (
              <p data-testid="bg-notice" className="note-warn mt-3 rounded-sm px-2.5 py-2 text-[12px] leading-[1.6]">
                {notice}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-3 border-t border-line pt-3">
              <label className="flex items-center gap-2.5 text-[12.5px] text-ink">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  disabled={!objectUrl}
                  data-testid="bg-enabled"
                  onChange={(e) => patch({ enabled: e.target.checked })}
                  className="size-[15px] accent-navy disabled:opacity-40"
                />
                <span className={objectUrl ? '' : 'text-ink-3'}>启用背景</span>
              </label>

              <label className="flex items-center justify-between gap-3 text-[12.5px] text-ink-2">
                <span>铺法</span>
                <select
                  value={settings.fit}
                  data-testid="bg-fit"
                  onChange={(e) => patch({ fit: e.target.value as BgSettings['fit'] })}
                  className="h-8 rounded-sm border border-line-strong bg-surface px-2 text-[12.5px] text-ink outline-none transition-colors duration-150 hover:border-navy/40"
                >
                  {FIT_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>

              <Slider
                label="不透明度"
                value={settings.opacity}
                suffix="%"
                testid="bg-opacity"
                onChange={(v) => patch({ opacity: v })}
              />
              <Slider
                label="模糊"
                value={settings.blur}
                suffix="px"
                testid="bg-blur"
                onChange={(v) => patch({ blur: v })}
              />
              <Slider
                label="背景淡化"
                value={settings.scrim}
                suffix="%"
                testid="bg-scrim-range"
                onChange={(v) => patch({ scrim: v })}
              />
            </div>

            <button
              type="button"
              onClick={() => void removeImage()}
              disabled={!objectUrl}
              data-testid="bg-remove"
              className="mt-3 h-8 w-full rounded-sm border border-line bg-surface text-[12.5px] text-ink-2 transition-colors duration-150 hover:border-red/45 hover:text-red disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-2"
            >
              移除背景
            </button>
          </div>
        )}

        <button
          ref={toggleRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="bg-panel"
          aria-label="自定义网页背景"
          data-testid="bg-toggle"
          data-active={active}
          className="flex h-11 items-center gap-2 rounded-full border border-line bg-surface pr-[15px] pl-[13px] text-[13px] font-medium text-ink shadow-md transition-[background,border-color,translate] duration-150 hover:-translate-y-px hover:border-navy/40 hover:bg-surface-2"
        >
          <span
            aria-hidden="true"
            className={`size-2 flex-none rounded-full ${active ? 'bg-navy' : 'bg-line-strong'}`}
          />
          <span>背景</span>
        </button>
      </div>
    </>
  );
}

function Slider({
  label,
  value,
  suffix,
  testid,
  onChange,
}: {
  label: string;
  value: number;
  suffix: string;
  testid: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center justify-between text-[12.5px] text-ink-2">
        <span>{label}</span>
        <span className="num-tabular text-ink">
          {value}
          {suffix}
        </span>
      </label>
      <input
        type="range"
        min={0}
        max={testid === 'bg-blur' ? 24 : testid === 'bg-scrim-range' ? 80 : 100}
        value={value}
        data-testid={testid}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-navy"
      />
    </div>
  );
}
