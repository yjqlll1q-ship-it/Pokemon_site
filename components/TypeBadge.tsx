import { typeTintStyle } from '@/lib/typeColors';
import { TypeGlyph } from './typeIcons';

interface Props {
  /** 属性英文 key，用于取色与取图标 */
  type: string;
  /** 属性中文名 */
  label: string;
  size?: 'sm' | 'md';
  /**
   * 外观：
   *   · soft（默认）—— 浅底 + 同色系深字。图鉴列表卡片里用它，
   *     一屏几十个徽章，实心会糊成一片。
   *   · solid —— 实心属性色 + 白字。详情页头部用它（参考稿就是实心胶囊，
   *     那只宝可梦的属性要在第一屏一眼看清）。
   *
   * 实心底用的是「掺深档」的配方（见 globals.css 的 type-chip-solid），
   * 不是纯属性色 —— 纯色配白字在浅属性（冰 / 妖精 / 飞行 / 电）上对比度不达标。
   */
  variant?: 'soft' | 'solid';
}

/**
 * 属性小标签。底色与字色都由内联的 `--tint` 派生，
 * 派生配方收在 globals.css 的 @utility 里（新增属性只需在 :root 加一个变量与一个图标）。
 *
 * 2026-09-29：前面的纯色圆点换成**属性图标**（见 components/typeIcons.tsx）。
 * 图标颜色分两档：
 *   · solid —— 继承胶囊的 `#fff`，即白图标。实心底上叠同色图标会看不见，
 *     原版圆点也是这个处理（`bg-white/70`）。
 *   · soft   —— 给图标单独套 `text-(--tint)`，即**直接用主属性色**。
 *     文字是同色系深字（`--tint` 掺深），但图标用主色：一屏几十个徽章扫过去，
 *     「图标那一点主属性色」比灰度深浅更容易分辨属性（11px 下实测看得出差别）。
 *     这个类只作用在图标那一个子节点上，不影响文字色。
 */
export default function TypeBadge({ type, label, size = 'md', variant = 'soft' }: Props) {
  const sm = size === 'sm';
  const solid = variant === 'solid';

  return (
    <span
      className={[
        'inline-flex items-center rounded-full font-semibold whitespace-nowrap tracking-[0.02em] leading-[1.5]',
        solid ? 'type-chip-solid' : 'type-chip border border-current',
        sm
          ? 'gap-1 py-px pr-[7px] pl-[6px] text-[11px]'
          : 'gap-[5px] py-[3px] pr-[10px] pl-[8px] text-[12px]',
      ].join(' ')}
      style={typeTintStyle(type)}
      data-testid="type-badge"
      data-type={type}
      data-variant={variant}
    >
      {/*
       * 图标外面这层 `<i>` 是**有盒子的**（inline-flex + shrink-0），不是 `contents` ——
       * 胶囊靠 flex `gap` 拉开图标与文字，摊平成 contents 后 gap 就不生效、两者会贴在一起。
       *
       * 尺寸跟着文字档走（11px 字配 10px 图标、12px 字配 11px 图标）：
       * 再大会把胶囊撑高，再小在 10px 上细笔画会被抗锯齿吃掉、看起来像脏点。
       */}
      <i
        className={['inline-flex shrink-0', solid ? '' : 'text-(--tint)'].join(' ')}
        aria-hidden="true"
        data-testid="type-icon"
      >
        <TypeGlyph type={type} size={sm ? 10 : 11} />
      </i>
      {label}
    </span>
  );
}
