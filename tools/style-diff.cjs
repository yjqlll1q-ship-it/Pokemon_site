/**
 * tools/style-diff.cjs
 * ---------------------------------------------------------------------------
 * 比对两份 style-snapshot 的结果，用来证明「重构没有改变任何视觉」。
 *
 * 用法：node tools/style-diff.cjs <before.json> <after.json> [报告输出路径]
 * 退出码：0 = 无差异；1 = 有差异；2 = 脚本异常
 *
 * 比对规则：
 *  - 带长度单位的数值（px / em / rem / %）解析成数字后按容差比，避免浮点噪声误报。
 *  - __box（元素在视口里的位置尺寸）容差放宽到 0.5px：子像素取整在不同构建下可能差一丁点。
 *  - 颜色、字体、content 这类字符串必须完全一致 —— 但先过一遍下面的「归一化」。
 *
 * 归一化（只压掉「同一个视觉结果的不同写法」，不压真实差异）：
 *  1. box-shadow：Tailwind v4 用 5 段逗号列表组合阴影
 *     （inset-shadow / inset-ring / ring-offset / ring / shadow），没用到的段是
 *     `rgba(0, 0, 0, 0) 0px 0px 0px 0px`。它们不产生任何像素，但会让字符串对不上。
 *  2. 颜色序列化：同一个颜色，Chrome 可能返回 `rgb()` / `rgba()` 或
 *     `color(srgb r g b / a)`（走 color-mix 的声明会被序列化成后者）。
 *     统一折算成 rgba(r, g, b, a) 再比。
 *  3. border-radius：Tailwind 的 rounded-full 是 `calc(infinity * 1px)`，Chrome 报
 *     3.35544e+07px；改造前写的是 999px。本站没有任何元素接近这个量级，
 *     凡是 >= 100px 的圆角一律等价。
 *  4. 对齐关键字：`start` / `end` 与 `flex-start` / `flex-end` 在 flex 容器上等价，
 *     Chrome 在不同写法下序列化不同。
 *
 * 被归一化掉、而非直接通过的项会单独列在报告末尾（`## 归一化后相等`），
 * 方便人工复核「这些确实只是写法差异」。
 */
const fs = require('fs');

const LEN_EPS = 0.02;
const BOX_EPS = 0.5;

const NUM_RE = /^(-?\d+(?:\.\d+)?)(px|em|rem|%|vh|vw|pt)?$/;

/* --------------------------- 归一化 --------------------------- */

const COLOR_SRGB_RE = /color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/g;

/** `color(srgb 0.145 0.192 0.239 / 0.34)` → `rgba(37, 49, 61, 0.34)` */
function canonColors(str) {
  return str.replace(COLOR_SRGB_RE, (_, r, g, b, a) => {
    const f = (x) => Math.round(parseFloat(x) * 255);
    const alpha = a === undefined ? 1 : parseFloat(a);
    return alpha === 1
      ? `rgb(${f(r)}, ${f(g)}, ${f(b)})`
      : `rgba(${f(r)}, ${f(g)}, ${f(b)}, ${alpha})`;
  });
}

const EMPTY_SHADOW_SEG = /^rgba\(0,\s*0,\s*0,\s*0\)\s*0px\s*0px\s*0px\s*0px$/;

/** 去掉 box-shadow 里不产生像素的占位段 */
function canonShadow(str) {
  return str
    .split(/,(?![^(]*\))/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !EMPTY_SHADOW_SEG.test(s))
    .join(', ');
}

/** >= 100px 的圆角统一折算（rounded-full 的 infinity*1px 与 999px 等价） */
function canonRadius(str) {
  const m = /^(-?\d+(?:\.\d+)?(?:e\+?\d+)?)px$/i.exec(str.trim());
  if (m && parseFloat(m[1]) >= 100) return 'FULL';
  return str;
}

/** 对齐关键字等价写法 */
function canonKeywords(str) {
  return str
    .replace(/\bflex-start\b/g, 'start')
    .replace(/\bflex-end\b/g, 'end');
}

const RADIUS_PROPS = new Set(['borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius']);
const SHADOW_PROPS = new Set(['boxShadow', 'textShadow']);
const COLOR_PROPS = new Set([
  'color',
  'backgroundColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'outlineColor',
  'textDecorationColor',
]);
const KEYWORD_PROPS = new Set(['alignItems', 'justifyContent', 'alignSelf', 'justifyItems']);
const COLOR_ANYWHERE_PROPS = new Set(['boxShadow', 'filter', 'backdropFilter', 'backgroundImage', 'textShadow']);

function normalize(prop, v) {
  if (typeof v !== 'string') return v;
  let s = v;
  if (COLOR_PROPS.has(prop) || COLOR_ANYWHERE_PROPS.has(prop)) s = canonColors(s);
  if (SHADOW_PROPS.has(prop)) s = canonShadow(s);
  if (RADIUS_PROPS.has(prop)) s = canonRadius(s);
  if (KEYWORD_PROPS.has(prop)) s = canonKeywords(s);
  return s;
}

/* --------------------------- 判定为「不可比 / 无影响」 --------------------------- */

/**
 * 这些项本工具不比，因为它们的判据在别处有更强的断言。
 * 不是「忽略清单」——每一条都必须写明替代证据在哪里。
 *
 * 键的格式是 `段.采集点.属性`，与 compareSections 里的 `${label}.${k}.${p}` 对应。
 * ⚠️ 目前快照里**没有** `cardHover` 段（卡片 hover 的采集点没被保留下来），
 * 所以下面两条现在是待用状态；一旦重新加回 `cardHover` 段它们会立刻生效。
 * 不要因为「看起来没用」就删掉 —— 它们是当初为 hover 位移/缩放写下的替代证据说明。
 */
const NOT_COMPARABLE = new Map([
  [
    'cardHover.transform',
    'Tailwind v4 的 hover:-translate-y-* 落到独立的 translate 属性，不再写 transform 矩阵；已由 ui-check.cjs [1b] 的几何断言（卡片抬起 px 数）覆盖',
  ],
  [
    'cardHover.spriteTransform',
    '同上，hover 的放大落到 scale 属性；已由 ui-check.cjs [1b] 的几何断言（立绘宽度倍率）覆盖',
  ],
]);

/**
 * 边框「样式/颜色」只有在宽度 > 0 时才看得见。
 * Tailwind 的 preflight 会给所有元素写上 `border-style: solid`（宽度 0），
 * 所以「none → solid」这种差异在宽度为 0 时纯属不可见。
 * 判据必须带上宽度一起看，不能直接放过。
 */
const BORDER_SIDE_RE = /^border(Top|Right|Bottom|Left)(Style|Color)$/;

const isZeroLen = (v) => v === '0px' || v === 0 || v === '0';

const isFullRadius = (v) =>
  v === '50%' || (() => {
    const m = /^(\d+(?:\.\d+)?(?:e\+?\d+)?)px$/i.exec(String(v).trim());
    return !!m && parseFloat(m[1]) >= 100;
  })();

/** 元素是不是正方形（用采集到的 __box 判断） */
const isSquare = (b) => Array.isArray(b) && Math.abs(b[2] - b[3]) <= 1;

/* --------------------------- 比对 --------------------------- */

const normHits = [];

function cmp(prop, a, b) {
  if (a === b) return true;
  const na = NUM_RE.exec(String(a).trim());
  const nb = NUM_RE.exec(String(b).trim());
  if (na && nb && (na[2] || '') === (nb[2] || '')) {
    if (Math.abs(parseFloat(na[1]) - parseFloat(nb[1])) <= LEN_EPS) return true;
  }
  const sa = normalize(prop, a);
  const sb = normalize(prop, b);
  if (sa === sb) {
    normHits.push({ prop, before: a, after: b });
    return true;
  }
  return false;
}

/**
 * 宽口径相等：用于段里的**非样式采集点**（纯数字 / 字符串 / 布尔 / 数组 / 简单对象）。
 * 例如 `regions.__thumbProbe`（缩略图尺寸数组）、`branchConds`（进化条件文案）、
 * `noForms`（两个布尔）。这类值没有「CSS 属性」的概念，逐属性比会走偏：
 * 数组被 Object.keys 展开成 "0"/"1"/… 下标，两个内容相同的数组因为元素是对象
 * （引用不同）永远不相等 —— 于是产生假差异。
 *
 * 数字仍然给 BOX_EPS 容差，避免不同构建下的子像素取整噪声。
 */
function looseEqual(a, b) {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= BOX_EPS;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && looseEqual(a[k], b[k]));
  }
  return false;
}

/** 是不是「一个元素的计算样式记录」——有 __box 或采到过 display 才算法 */
const isElementRecord = (v) =>
  !!v && typeof v === 'object' && !Array.isArray(v) && ('__box' in v || 'display' in v);

function compareSections(before, after, label, out) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const k of keys) {
    const A = (before || {})[k];
    const B = (after || {})[k];
    if (A && A.__missing) {
      out.skipped.push(`${label}.${k}: 基线里就选不到（${A.__missing}）`);
      continue;
    }
    if (B && B.__missing) {
      out.diffs.push({ at: `${label}.${k}`, prop: '(元素)', before: '存在', after: `选不到 ${B.__missing}` });
      continue;
    }
    if (A === undefined && B === undefined) continue;

    // 段里的「纯数据」：整体比，不做逐属性展开
    if (!isElementRecord(A) || !isElementRecord(B)) {
      if (!looseEqual(A, B)) {
        out.diffs.push({ at: `${label}.${k}`, prop: '(整体)', before: A, after: B });
      }
      continue;
    }

    if (!A || !B) {
      out.diffs.push({ at: `${label}.${k}`, prop: '(整块)', before: !!A, after: !!B });
      continue;
    }
    const props = new Set([...Object.keys(A), ...Object.keys(B)]);
    for (const p of props) {
      const va = A[p];
      const vb = B[p];
      // 有替代证据的项先摘出去。键的格式是 `段.采集点.属性`（不是「忽略清单」，每条都写了证据在哪）
      const why = NOT_COMPARABLE.get(`${label}.${k}.${p}`);
      if (why && !cmp(p, va, vb)) {
        out.notComparable.push({ at: `${label}.${k}`, prop: p, before: va, after: vb, why });
        continue;
      }
      if (p === '__box') {
        if (!Array.isArray(va) || !Array.isArray(vb)) {
          out.diffs.push({ at: `${label}.${k}`, prop: p, before: va, after: vb });
          continue;
        }
        for (let i = 0; i < 4; i++) {
          if (Math.abs((va[i] || 0) - (vb[i] || 0)) > BOX_EPS) {
            out.diffs.push({
              at: `${label}.${k}`,
              prop: `__box[${['left', 'top', 'width', 'height'][i]}]`,
              before: va[i],
              after: vb[i],
            });
          }
        }
        continue;
      }
      if (va === undefined) {
        out.diffs.push({ at: `${label}.${k}`, prop: p, before: '(无)', after: vb });
      } else if (vb === undefined) {
        out.diffs.push({ at: `${label}.${k}`, prop: p, before: va, after: '(丢失)' });
      } else if (!cmp(p, va, vb)) {
        // 圆角：正方形元素上「50%」与「半径取无穷大后被夹到短边一半」完全等价
        // （两者都退化成同一个圆）。非正方形时不等价（椭圆 vs 胶囊），必须报差异。
        if (p === 'borderRadius' && isFullRadius(va) && isFullRadius(vb) && isSquare(A.__box) && isSquare(B.__box)) {
          out.equivalent.push({
            at: `${label}.${k}`,
            prop: p,
            before: va,
            after: vb,
            why: `元素为正方形 ${A.__box[2]}×${A.__box[3]}，两种写法都退化成同一个圆`,
          });
          continue;
        }
        // 边框的样式/颜色：宽度为 0 时不可见，单独归到「无影响」
        const bm = BORDER_SIDE_RE.exec(p);
        if (bm) {
          const wp = 'border' + bm[1] + 'Width';
          if (isZeroLen(A[wp]) && isZeroLen(B[wp])) {
            out.invisible.push({
              at: `${label}.${k}`,
              prop: p,
              before: va,
              after: vb,
              why: `${wp} = 0px`,
            });
            continue;
          }
        }
        out.diffs.push({ at: `${label}.${k}`, prop: p, before: va, after: vb });
      }
    }
  }
}

function main() {
  const [, , beforePath, afterPath, reportPath] = process.argv;
  if (!beforePath || !afterPath) {
    console.error('用法: node tools/style-diff.cjs <before.json> <after.json> [report.md]');
    process.exit(2);
  }
  const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
  const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));

  const out = { diffs: [], skipped: [], invisible: [], notComparable: [], equivalent: [] };

  /*
   * 段名一律**从快照里现取**，绝不在这里写死。
   *
   * 这里踩过一次坑：快照里的段名整体从 home/detail/branch 换成了
   * shell/lotom/bulba/forms/evoTab/evoWide/search…，而这里的列表没跟着改，
   * 于是 `compareSections(undefined, undefined, 'home', out)` 空转 ——
   * Object.keys(undefined || {}) 是空集合，一条不比、一声不吭，
   * 门禁照样打印「残余差异条数：0 / 视觉零回归」。
   * 也就是说：**大部分采集点根本没被比过**，报告却是绿的。
   *
   * 所以改成动态枚举。段名是快照自己的事，diff 不该维护第二份名单。
   */
  const SECTIONS = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((s) => s !== '__consoleErrors')
    .sort();

  for (const section of SECTIONS) {
    compareSections(before[section], after[section], section, out);
  }

  /** 采集点总数（段内的「元素记录」个数）—— 报告里要写出「到底比了多少」，不然 0 差异没有意义 */
  const countTargets = (snap) =>
    SECTIONS.reduce((n, s) => {
      const o = snap[s];
      if (!o || typeof o !== 'object') return n;
      return n + Object.values(o).filter(isElementRecord).length;
    }, 0);

  const ea = (before.__consoleErrors || []).length;
  const eb = (after.__consoleErrors || []).length;
  if (ea !== eb) out.diffs.push({ at: 'consoleErrors', prop: '数量', before: ea, after: eb });

  const lines = [];
  lines.push('# 样式回归对照（改造前 vs 改造后）');
  lines.push('');
  lines.push(`- 基线：\`${beforePath}\``);
  lines.push(`- 对照：\`${afterPath}\``);
  lines.push(`- **比对覆盖：${SECTIONS.length} 段 / ${countTargets(before)} 个元素采集点**`);
  lines.push(`- **残余差异条数：${out.diffs.length}**`);
  lines.push(`- 归一化后相等（仅写法差异）：${normHits.length}`);
  lines.push(`- 判定为无影响（边框宽度为 0，肉眼不可见）：${out.invisible.length}`);
  lines.push(`- 判定为等价（正方形上的圆角写法）：${out.equivalent.length}`);
  lines.push(`- 判定为不可比（判据在 ui-check 的几何断言里）：${out.notComparable.length}`);
  lines.push(`- 基线中就选不到、已跳过的采集点：${out.skipped.length}`);
  lines.push('');
  if (out.diffs.length) {
    lines.push('| 位置 | 属性 | 改造前 | 改造后 |');
    lines.push('| --- | --- | --- | --- |');
    for (const d of out.diffs) {
      // 值可能是数组/对象（段里的纯数据采集点），String() 会打成 [object Object]
      const f = (v) =>
        (v && typeof v === 'object' ? JSON.stringify(v) : String(v)).replace(/\|/g, '\\|').slice(0, 160);
      lines.push(`| ${d.at} | ${d.prop} | \`${f(d.before)}\` | \`${f(d.after)}\` |`);
    }
  } else {
    lines.push('**所有采集点的计算样式完全一致（视觉零回归）。**');
  }
  if (normHits.length) {
    lines.push('');
    lines.push('## 归一化后相等（人工复核用）');
    const byProp = new Map();
    for (const h of normHits) byProp.set(h.prop, (byProp.get(h.prop) || 0) + 1);
    lines.push('');
    lines.push('| 属性 | 条数 |');
    lines.push('| --- | --- |');
    for (const [p, n] of [...byProp].sort((a, b) => b[1] - a[1])) lines.push(`| ${p} | ${n} |`);
    lines.push('');
    lines.push('样例：');
    for (const h of normHits.slice(0, 6)) {
      lines.push(`- \`${h.prop}\`：\`${String(h.before).slice(0, 90)}\` → \`${String(h.after).slice(0, 90)}\``);
    }
  }
  if (out.equivalent.length) {
    lines.push('');
    lines.push('## 等价（写法不同、结果相同）');
    for (const e of out.equivalent) {
      lines.push(`- \`${e.at}.${e.prop}\`：\`${e.before}\` → \`${e.after}\`；${e.why}`);
    }
  }
  if (out.notComparable.length) {
    lines.push('');
    lines.push('## 不可比（判据在别处，附替代证据）');
    for (const n of out.notComparable) {
      lines.push(`- \`${n.at}\`：\`${String(n.before).slice(0, 60)}\` → \`${String(n.after).slice(0, 60)}\``);
      lines.push(`  - 原因与替代证据：${n.why}`);
    }
  }
  if (out.invisible.length) {
    lines.push('');
    lines.push('## 无影响（边框宽度为 0）');
    const byWhy = new Map();
    for (const h of out.invisible) byWhy.set(h.why, (byWhy.get(h.why) || 0) + 1);
    lines.push('');
    lines.push('| 判据 | 条数 |');
    lines.push('| --- | --- |');
    for (const [w, n] of [...byWhy].sort((a, b) => b[1] - a[1])) lines.push(`| ${w} | ${n} |`);
    lines.push('');
    lines.push('这些差异全部是「Tailwind 的 preflight 给所有元素补了 border-style: solid，');
    lines.push('而 border-color 由 currentColor 变成语义 token」，宽度为 0 时不产生任何像素。');
  }
  if (out.skipped.length) {
    lines.push('');
    lines.push('## 已跳过');
    for (const s of out.skipped) lines.push(`- ${s}`);
  }

  const report = lines.join('\n');
  if (reportPath) fs.writeFileSync(reportPath, report, 'utf8');
  console.log(report);
  console.log(
    '\n差异条数: ' +
      out.diffs.length +
      ' / 归一化后相等: ' +
      normHits.length +
      ' / 无影响: ' +
      out.invisible.length +
      ' / 不可比: ' +
      out.notComparable.length,
  );
  process.exit(out.diffs.length ? 1 : 0);
}

main();
