/**
 * lib/site.ts
 * 站点级的少量配置。新增页面/导航只需要改这里，组件不用动。
 */

export const SITE = {
  name: '宝可梦图鉴',
  tagline: '属性 · 进化 · 一次看全',
  description:
    '一个宝可梦资料站：点开任意宝可梦查看属性、种族值和完整进化分支，也可以按多条件查询前三世代全部 386 只。数据来自 PokéAPI，立绘使用官方 artwork。',
  /** 顶部导航。加新功能时在这里加一项即可 */
  nav: [
    { href: '/', label: '最初的伙伴' },
    { href: '/pokedex', label: '图鉴查询' },
  ] as { href: string; label: string }[],
};
