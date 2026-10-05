import { notFound } from 'next/navigation';
import PokemonScreen from '@/components/PokemonScreen';
import { loadScreen } from '@/lib/detail';
import { getAllIds } from '@/lib/pokedex';

interface Props {
  // Next 16：动态段 params 是 Promise，必须 await
  params: Promise<{ id: string }>;
}

/**
 * 预生成全部宝可梦的详情页。
 * 数据在构建期就有，预渲染后切换宝可梦是纯静态命中，不需要等接口 ——
 * 这也是「切换 → 主题色随之变」能瞬间完成的原因。
 */
export function generateStaticParams() {
  return getAllIds().map((id) => ({ id: String(id) }));
}

/** 只允许预生成过的编号；其余走 404，避免动态渲染拖慢首屏 */
export const dynamicParams = false;

export default async function PokemonPage({ params }: Props) {
  const { id } = await params;
  const numeric = Number.parseInt(id, 10);
  if (!Number.isFinite(numeric)) notFound();

  const data = loadScreen(numeric);
  if (!data) notFound();

  return <PokemonScreen {...data} />;
}
