import Link from 'next/link';
import { SITE } from '@/lib/site';

/** 站点顶栏。导航项来自 lib/site.ts 的配置，加页面不用改这里 */
export default function SiteHeader() {
  return (
    <header className="header-veil sticky top-0 z-20 border-b border-line">
      <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-4 px-6 py-3.5 max-[520px]:px-4 max-[520px]:py-3">
        <Link href="/" className="flex items-center gap-2.5 text-inherit no-underline">
          <span className="brand-mark" aria-hidden="true" />
          <span className="flex flex-col leading-[1.25]">
            {/* 行高必须写死：text-base 自带 1.5，会顶掉父级给的 1.25，顶栏因此高 3.4px */}
            <strong className="text-base leading-[1.25] font-bold tracking-[0.02em]">
              {SITE.name}
            </strong>
            <em className="text-[11.5px] not-italic text-ink-3 max-[520px]:hidden">{SITE.tagline}</em>
          </span>
        </Link>

        <nav className="flex gap-1" aria-label="主导航">
          {SITE.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full border border-transparent px-3 py-1.5 text-[13.5px] text-ink-2 no-underline transition-[background,color,border-color] duration-150 hover:border-line hover:bg-surface hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
