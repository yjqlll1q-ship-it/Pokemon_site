import type { Metadata } from 'next';
import PokedexQuery from '@/components/PokedexQuery';

export const metadata: Metadata = {
  title: '图鉴查询 | 宝可梦图鉴',
  description: '按属性、世代、种族值、特性、蛋群多条件查询第一至第三世代共 386 只宝可梦。',
};

/**
 * 图鉴查询页。
 *
 * 这个页面本身是静态壳（服务端组件），**交互全部在客户端**：
 * 筛选条件由 PokedexQuery 维护，数据通过 /api/* 从 SQLite 现查。
 * 这样页面首屏不需要等数据库，而筛选又不用把 386 只的数据预塞进包里。
 */
export default function PokedexPage() {
  return (
    <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 pt-10 pb-16 max-[520px]:px-4 max-[520px]:pt-[26px]">
      <PokedexQuery />
    </main>
  );
}
