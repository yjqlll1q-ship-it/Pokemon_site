import { STAT_LABELS, statColorStyle } from '@/lib/statMeta';
import { typeTintStyle } from '@/lib/typeColors';

interface Props {
  stats: Record<string, number>;
  total: number;
  /** 用于给「总和」上色的主属性 */
  tintType: string;
}

/** 种族值上限的显示基准：160 已是准神级别，用 150 做满格参照更好读 */
const SCALE_MAX = 150;

/**
 * 种族值面板（参考图的「能力值」块）。
 *
 * 六条**各一个颜色**（HP 红 / 攻击 橙 / 防御 黄 / 特攻 绿 / 特防 蓝 / 速度 紫），
 * 色值来自 globals.css 的 `--stat-*`（复用既有的 18 档属性色，不新增自己拍的色）。
 * 每行只往元素上注入 `--stat`，条本身用 `stat-bar-fill` —— 加一项能力值
 * 只需要动 lib/statMeta.ts 与 globals.css，这个组件不用改。
 */
export default function StatBars({ stats, total, tintType }: Props) {
  return (
    <div className="flex flex-col gap-2.5" style={typeTintStyle(tintType)}>
      <ul className="flex flex-col gap-[7px]">
        {STAT_LABELS.map(({ key, label, colorKey }) => {
          const value = stats[key] ?? 0;
          const pct = Math.min(100, Math.round((value / SCALE_MAX) * 100));
          return (
            <li
              key={key}
              className="grid grid-cols-[42px_1fr_38px] items-center gap-3 text-[12.5px]"
              style={statColorStyle(colorKey)}
              data-testid="stat-bar"
              data-stat={colorKey}
            >
              <span className="text-ink-2">{label}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-line">
                <span
                  className="stat-bar-fill block h-full rounded-full transition-[width] duration-[350ms]"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="text-right font-semibold text-ink num-tabular">{value}</span>
            </li>
          );
        })}
      </ul>
      <div
        className="mt-0.5 flex items-end justify-between border-t border-dashed border-line pt-2"
        data-testid="stat-total"
      >
        <span className="text-[12px] text-ink-2">总和</span>
        <strong className="tint-total text-[26px] leading-none font-bold num-tabular">{total}</strong>
      </div>
    </div>
  );
}
