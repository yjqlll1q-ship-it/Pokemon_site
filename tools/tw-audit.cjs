/**
 * 检查 Tailwind 编译产物里，组件用到的关键 utility / @utility 是否都真的生成了。
 * 「类名写了但没生成」是这类改造最典型的静默失败，必须显式查。
 *
 * 用法：node tools/tw-audit.cjs <编译产物.css>
 *
 * 注意 CSS 里的类名会被转义（`.hover\:shadow-md:hover`、`.bg-\(--tint\)`、
 * `.grid-cols-\[32px_1fr_32px\]`），所以必须把「两边」都去掉转义反斜杠后再比对。
 * 早期版本只给 needle 去转义，导致所有带变体/任意值的类被误报为缺失。
 */
const fs = require('fs');

const css = fs.readFileSync(process.argv[2], 'utf8');

const must = [
  // 自定义 @utility
  'type-chip', 'badge-baby', 'tint-bar', 'tint-total', 'tint-halo', 'tint-halo-strong',
  'tint-rule', 'tint-edge', 'tint-edge-strong', 'tint-node-active',
  'header-veil', 'modal-veil', 'art-plate', 'brand-mark', 'step-arrow', 'child-rail',
  // 直写声明（Tailwind 内置 var() 链在本机 Chrome 上会静默失效，见 globals.css D 节）
  'sprite-shadow', 'art-shadow', 'thumb-shadow', 'num-tabular',
  // 关键内置 utility（含变体与任意值）
  'rounded-md', 'rounded-lg', 'rounded-sm', 'rounded-full',
  'shadow-sm', 'shadow-md', 'shadow-lg',
  'bg-surface', 'bg-surface-2', 'bg-paper-soft', 'border-line', 'border-line-strong',
  'text-ink', 'text-ink-2', 'text-ink-3',
  'font-mono', 'whitespace-nowrap', 'not-italic', 'no-underline',
  'grid-cols-[repeat(auto-fill,minmax(178px,1fr))]',
  'grid-cols-[repeat(auto-fill,minmax(148px,1fr))]',
  'grid-cols-[minmax(170px,218px)_1fr]',
  'grid-cols-[32px_1fr_32px]',
  'grid-cols-[repeat(auto-fit,minmax(88px,auto))]',
  'before:tint-halo', "before:content-['']", 'before:inset-[6%_6%_2%]', 'before:rounded-[50%]',
  'hover:tint-edge', 'hover:tint-edge-strong', 'hover:shadow-md', 'hover:-translate-y-[3px]',
  'group-hover:scale-[1.045]', 'active:-translate-y-px',
  'focus:outline-none',
  'animate-fade', 'animate-rise',
  'max-[640px]:grid-cols-1', 'max-[520px]:hidden', 'max-[720px]:grid-cols-1',
  '[&>div]:py-1',
  'bg-(--tint)',
  'ease-[cubic-bezier(0.22,0.61,0.36,1)]',
];

// 两侧统一去掉转义反斜杠，再压缩空白
const flat = css.replace(/\\/g, '').replace(/\s+/g, ' ');

const missing = [];
const found = [];
for (const m of must) {
  const needle = m.replace(/\\/g, '');
  if (flat.includes(needle)) found.push(m);
  else missing.push(m);
}

console.log('生成: ' + found.length + ' / ' + must.length);
if (missing.length) {
  console.log('\n!! 缺失（写了但没生成）:');
  for (const m of missing) console.log('   - ' + m);
} else {
  console.log('全部命中。');
}
process.exit(missing.length ? 1 : 0);
