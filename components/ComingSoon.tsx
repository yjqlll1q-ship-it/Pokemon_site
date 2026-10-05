import Link from 'next/link';

/**
 * 未实现模块的占位页。
 *
 * 侧栏导航要「全部补齐」（参考图有 6 项），但地区 / 招式 / 道具 / 特性图鉴
 * 的数据层还没做，先给一个明确的占位页 —— 比让链接 404 或干脆不显示更诚实。
 * 等各自的数据层做好后，把对应路由换成真实页面即可。
 */
export default function ComingSoon({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mx-auto w-full max-w-[680px] px-5 py-16 max-[520px]:px-3">
      <div className="panel-card px-8 py-14 text-center">
        <h1 className="text-[22px] font-bold tracking-[0.01em]">{title}</h1>
        <p className="mx-auto mt-3 max-w-[40ch] text-[13.5px] leading-[1.8] text-ink-2">
          {note ?? '这个图鉴还在建设中 —— 数据层与页面会作为后续阶段补上。'}
        </p>
        <Link
          href="/"
          className="theme-fill mt-6 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[13.5px] font-semibold no-underline"
        >
          先去看宝可梦 →
        </Link>
      </div>
    </div>
  );
}
