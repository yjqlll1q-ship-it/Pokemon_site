import { typeTintStyle } from '@/lib/typeColors';

interface Props {
  /** 属性英文 key，用于取色 */
  type: string;
  /** 属性中文名 */
  label: string;
  size?: 'sm' | 'md';
}

/**
 * 属性小标签。底色与字色都由内联的 --tint 派生，
 * 派生配方收在 globals.css 的 @utility type-chip 里（新增属性只需在 @theme 加一个变量）。
 */
export default function TypeBadge({ type, label, size = 'md' }: Props) {
  const sm = size === 'sm';

  return (
    <span
      className={[
        'type-chip inline-flex items-center rounded-full font-semibold whitespace-nowrap tracking-[0.02em] leading-[1.5]',
        // 改造前的写法是 `border: 1px solid color-mix(in srgb, var(--tint) 26%, #fff)`，
        // 但 Chrome 不解析「border 简写 + 参与 color-mix 的 var()」，这个颜色一直落到
        // currentColor。重构保持既有渲染不变，所以这里就写 border-current。
        'border border-current',
        sm
          ? 'gap-1 py-px pr-[7px] pl-[6px] text-[11px]'
          : 'gap-[5px] py-[3px] pr-[9px] pl-[7px] text-[12px]',
      ].join(' ')}
      style={typeTintStyle(type)}
      data-testid="type-badge"
      data-type={type}
    >
      <i
        className={`${sm ? 'size-[5px]' : 'size-1.5'} flex-none rounded-full bg-(--tint)`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
