import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import AppShell from '@/components/AppShell';
import SiteBackground from '@/components/SiteBackground';
import { SITE } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  title: SITE.name,
  description: SITE.description,
};

/* 字体刻意用系统字体栈（见 globals.css 的 @theme）：中文字形覆盖全、不依赖外网字体，构建也更快 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {/* 背景层是 body 的负 z-index 子元素，自身即铺满视口，不影响外壳布局 */}
        <SiteBackground />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
