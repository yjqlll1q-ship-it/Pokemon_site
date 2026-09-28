import { getMeta } from '@/lib/pokedex';

/** 页脚：交代数据来源和生成时间，方便日后判断数据新旧 */
export default function SiteFooter() {
  const meta = getMeta();

  return (
    <footer className="mt-14 border-t border-line bg-paper-soft">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-1.5 px-6 pt-[22px] pb-[30px] max-[520px]:px-4 max-[520px]:pt-[18px] max-[520px]:pb-[26px]">
        <p className="max-w-[70ch] text-[12px] leading-[1.7] text-ink-3">
          资料与立绘来自{' '}
          <a href="https://pokeapi.co" target="_blank" rel="noreferrer">
            PokéAPI
          </a>{' '}
          的公开数据与官方 artwork，宝可梦相关名称与形象版权归任天堂 / 宝可梦公司所有，本站仅作学习演示用途。
        </p>
        <p className="max-w-[70ch] text-[12px] leading-[1.7] text-ink-3 num-tabular">
          收录 {meta.total} 只 · 数据生成于 {meta.generatedAt}
        </p>
      </div>
    </footer>
  );
}
