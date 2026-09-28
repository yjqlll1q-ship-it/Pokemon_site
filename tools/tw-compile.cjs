/**
 * 只编译 Tailwind 这一层，用来快速确认 globals.css 的 @theme / @utility 语法没问题。
 * 比跑一次 next build 快很多，适合在改样式期反复用。
 * 用法：node tools/tw-compile.cjs [输出路径]
 */
const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');

const root = path.join(__dirname, '..');
const input = path.join(root, 'app', 'globals.css');
const out = process.argv[2] || path.join(root, '_tw-out.css');

(async () => {
  const css = fs.readFileSync(input, 'utf8');
  const result = await postcss([tailwind()]).process(css, { from: input });
  fs.writeFileSync(out, result.css, 'utf8');
  console.log('written: ' + out + '  (' + result.css.length + ' bytes)');
})().catch((e) => {
  console.error('编译失败:', e.message);
  process.exit(1);
});
