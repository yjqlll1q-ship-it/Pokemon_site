import type { Metadata } from 'next';
import ComingSoon from '@/components/ComingSoon';

export const metadata: Metadata = { title: '招式图鉴 | 宝可梦图鉴' };

export default function MovesPage() {
  return <ComingSoon title="招式图鉴" note="招式列表与威力、命中、PP 等资料还在抓取中。" />;
}
