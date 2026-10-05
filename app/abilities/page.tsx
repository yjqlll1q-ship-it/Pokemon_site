import type { Metadata } from 'next';
import ComingSoon from '@/components/ComingSoon';

export const metadata: Metadata = { title: '特性图鉴 | 宝可梦图鉴' };

export default function AbilitiesPage() {
  return <ComingSoon title="特性图鉴" note="特性总表（含说明与持有宝可梦）还在整理中。" />;
}
