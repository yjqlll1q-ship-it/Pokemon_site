import { STAT_LABELS } from '@/lib/pokedex';
import { typeTintStyle } from '@/lib/typeColors';

interface Props {
  stats: Record<string, number>;
  total: number;
  /** 用于取色的主属性 */
  tintType: string;
}

/** 种族值上限的显示基准：160 已是准神级别，用 150 做满格参照更好读 */
const SCALE_MAX = 150;

export default function StatBars({ stats, total, tintType }: Props) {
  return (
    <div className="flex flex-col gap-2" style={typeTintStyle(tintType)}>
      <ul className="flex flex-col gap-1">
        {STAT_LABELS.map(({ key, label }) => {
          const value = stats[key] ?? 0;
          const pct = Math.min(100, Math.round((value / SCALE_MAX) * 100));
          return (
            <li
              key={key}
              className="grid grid-cols-[32px_1fr_32px] items-center gap-[9px] text-[12px]"
              data-testid="stat-bar"
            >
              <span className="text-ink-2">{label}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <span
                  className="tint-bar block h-full rounded-full transition-[width] duration-[350ms]"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="text-right font-semibold text-ink num-tabular">{value}</span>
            </li>
          );
        })}
      </ul>
      <div
        className="mt-0.5 flex items-baseline justify-between border-t border-dashed border-line pt-1.5 text-[12px] text-ink-2"
        data-testid="stat-total"
      >
        <span>种族值总和</span>
        <strong className="tint-total text-[14.5px] num-tabular">{total}</strong>
      </div>
    </div>
  );
}
