import type { Metadata } from 'next';
import ComingSoon from '@/components/ComingSoon';

export const metadata: Metadata = { title: '地区图鉴 | 宝可梦图鉴' };

export default function RegionsPage() {
  return <ComingSoon title="地区图鉴" note="关都 / 城都 / 丰缘的地区资料还在整理中。" />;
}
