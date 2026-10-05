import { notFound } from 'next/navigation';
import PokemonScreen from '@/components/PokemonScreen';
import { loadScreen } from '@/lib/detail';

/**
 * 图鉴首页 = 宝可梦详情主界面（参考图的版式）。
 *
 * 默认展示 #479 洛托姆（本站吉祥物，也是参考图那只）；想换默认展示对象，
 * 只改这一行的编号即可，其余全是数据驱动。
 */
const DEFAULT_ID = 479;

export default function Home() {
  const data = loadScreen(DEFAULT_ID);
  if (!data) notFound();
  return <PokemonScreen {...data} />;
}
