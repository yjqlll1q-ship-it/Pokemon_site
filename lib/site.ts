/**
 * lib/site.ts
 * ---------------------------------------------------------------------------
 * 站点级的少量配置。新增页面/导航只需要改这里，组件不用动。
 */

/** 导航图标名（真正画在 components/AppRail.tsx 里，这里只留名字，避免配置里塞 JSX） */
export type NavIcon = 'home' | 'pokemon' | 'region' | 'move' | 'item' | 'ability';

export const SITE = {
  name: '宝可梦图鉴',
  tagline: '属性 · 进化 · 一次看全',
  description:
    '一个宝可梦资料站：点开任意宝可梦查看属性、种族值和完整进化分支，也可以按多条件查询前三世代全部 386 只。数据来自 PokéAPI，立绘使用官方 artwork。',
  /**
   * 左侧竖导航。加新功能时在这里加一项即可（图标名见 NavIcon）。
   * 注意：地区 / 招式 / 道具 / 特性图鉴是「全部补齐」的分期目标，
   * 当前指向占位页，等各自的数据层做好后换成真实路由。
   */
  nav: [
    { href: '/', label: '图鉴首页', icon: 'home' },
    { href: '/pokedex', label: '宝可梦', icon: 'pokemon' },
    { href: '/regions', label: '地区图鉴', icon: 'region' },
    { href: '/moves', label: '招式图鉴', icon: 'move' },
    { href: '/items', label: '道具图鉴', icon: 'item' },
    { href: '/abilities', label: '特性图鉴', icon: 'ability' },
  ] as { href: string; label: string; icon: NavIcon }[],
};
