import type { Metadata } from 'next';
import ComingSoon from '@/components/ComingSoon';

export const metadata: Metadata = { title: '道具图鉴 | 宝可梦图鉴' };

export default function ItemsPage() {
  return <ComingSoon title="道具图鉴" note="道具列表与说明文字还在抓取中。" />;
}
