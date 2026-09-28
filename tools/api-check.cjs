/**
 * api-check.cjs
 * ---------------------------------------------------------------------------
 * 后端查询接口的端到端验证。**需要先起服务**：
 *
 *   npm start                 # 或 npm run dev
 *   npm run api:check         # 默认打 http://127.0.0.1:3000
 *   BASE_URL=http://127.0.0.1:3100/ npm run api:check
 *
 * 断言口径对准「用户要的功能」，不是对准实现：
 *   - 不是「接口返回 200」，而是「按火属性筛选后，返回的每一只都真的有火属性」
 *   - 不是「total 字段存在」，而是「世代 1/2/3 的人数分别是 151/100/135」
 *   - 不是「排序参数被接受」，而是「降序结果里前后两项确实递减」
 *
 * --self-test 模式：故意断言一个不可能成立的条件，**要求测试框架报 FAIL**。
 * 如果框架连明显的错都抓不到，它就没有资格说「通过」——
 * 这一步是为了防止「全绿但没在测东西」。
 */

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const SELF_TEST = process.argv.includes('--self-test');

let pass = 0;
const failures = [];

function ok(label, cond, detail) {
  if (cond) {
    pass++;
  } else {
    failures.push(`${label}${detail === undefined ? '' : ` —— ${JSON.stringify(detail)}`}`);
  }
}

async function get(pathname) {
  const res = await fetch(`${BASE}${pathname}`);
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* 非 JSON 响应保持 null */
  }
  return { status: res.status, body };
}

/** items 里每一只都满足 predicate，否则返回第一个反例 */
const allOf = (items, predicate) => {
  const bad = items.find((it) => !predicate(it));
  return bad === undefined ? true : bad;
};

async function main() {
  console.log(`[api-check] 目标 ${BASE}\n`);

  /* ------------------------------ 连通性 ------------------------------ */
  const probe = await get('/api/pokedex?pageSize=1');
  if (probe.status !== 200) {
    console.error(`[api-check] 服务不可用（HTTP ${probe.status}）。请先 npm start。`);
    process.exit(1);
  }

  /* ------------------------------ 筛选面 ------------------------------ */
  const facets = await get('/api/facets');
  ok('facets: 200', facets.status === 200, facets.status);
  ok('facets: 范围内共 386 只', facets.body?.total === 386, facets.body?.total);
  ok('facets: 18 种属性', facets.body?.types?.length === 18, facets.body?.types?.length);
  ok('facets: 3 个世代', facets.body?.generations?.length === 3, facets.body?.generations?.length);
  ok(
    'facets: 世代人数 151 / 100 / 135',
    JSON.stringify(facets.body?.generations?.map((g) => g.count)) === '[151,100,135]',
    facets.body?.generations?.map((g) => g.count),
  );
  ok(
    'facets: 属性计数之和 ≥ 386（双属性会被计两次）',
    (facets.body?.types ?? []).reduce((s, t) => s + t.count, 0) >= 386,
    (facets.body?.types ?? []).reduce((s, t) => s + t.count, 0),
  );
  ok('facets: 种族值区间上界 > 下界', (facets.body?.statTotal?.max ?? 0) > (facets.body?.statTotal?.min ?? 0));
  ok('facets: 有幼年形态标记', (facets.body?.tags ?? []).some((t) => t.key === 'baby' && t.count > 0));

  /* ------------------------------ 默认列表 ------------------------------ */
  const base = await get('/api/pokedex');
  ok('默认查询: total = 386', base.body?.total === 386, base.body?.total);
  ok('默认查询: 默认每页 48 条', base.body?.items?.length === 48, base.body?.items?.length);
  ok('默认查询: 按编号升序，第一项是 #1', base.body?.items?.[0]?.id === 1, base.body?.items?.[0]?.id);
  ok('默认查询: 每项都有中文名与立绘', allOf(base.body?.items ?? [], (it) => it.nameZh && it.sprite) === true);
  ok(
    '默认查询: 每项至少有一个属性',
    allOf(base.body?.items ?? [], (it) => Array.isArray(it.types) && it.types.length >= 1) === true,
  );
  // 分类为空串时卡片会静默退回显示世代，搜索也搜不到 —— 必须逐项卡住
  ok(
    '默认查询: 每项都带分类（genusZh 非空）',
    allOf(base.body?.items ?? [], (it) => Boolean(it.genusZh)) === true,
    (base.body?.items ?? []).filter((it) => !it.genusZh).map((it) => it.id).slice(0, 5),
  );

  /* ------------------------------ 关键词 ------------------------------ */
  const q1 = await get('/api/pokedex?q=' + encodeURIComponent('皮卡丘'));
  ok('关键词「皮卡丘」命中 1 只', q1.body?.total === 1, q1.body?.total);
  ok('关键词「皮卡丘」返回的确实是皮卡丘', q1.body?.items?.[0]?.nameZh === '皮卡丘', q1.body?.items?.[0]?.nameZh);

  const q2 = await get('/api/pokedex?q=025');
  ok('关键词「025」能按编号命中 #25', (q2.body?.items ?? []).some((it) => it.id === 25), q2.body?.total);

  const q3 = await get('/api/pokedex?q=' + encodeURIComponent('鼠宝可梦'));
  ok('关键词「鼠宝可梦」能按分类命中', (q3.body?.total ?? 0) > 0, q3.body?.total);

  // 反向：不存在的关键词必须返回 0，而不是「忽略条件返回全部」
  const q4 = await get('/api/pokedex?q=' + encodeURIComponent('绝对不存在的宝可梦名字xyz'));
  ok('不存在的关键词返回 0（不是忽略条件）', q4.body?.total === 0, q4.body?.total);

  /* ------------------------------ 属性筛选 ------------------------------ */
  const fire = await get('/api/pokedex?types=fire&pageSize=200');
  ok('火属性: 结果数 < 386（确实筛掉了东西）', (fire.body?.total ?? 0) < 386, fire.body?.total);
  ok(
    '火属性: 返回的每一只都真的有火属性',
    allOf(fire.body?.items ?? [], (it) => it.types.includes('fire')) === true,
    (fire.body?.items ?? []).find((it) => !it.types.includes('fire'))?.nameZh,
  );
  ok(
    '火属性: 结果数与 facets 的火属性计数一致',
    fire.body?.total === facets.body?.types?.find((t) => t.slug === 'fire')?.count,
    [fire.body?.total, facets.body?.types?.find((t) => t.slug === 'fire')?.count],
  );

  const twoAny = await get('/api/pokedex?types=fire,water&pageSize=200');
  ok('属性任一: 结果 ≥ 单属性火', (twoAny.body?.total ?? 0) >= (fire.body?.total ?? 0), twoAny.body?.total);
  ok(
    '属性任一: 每只至少命中火或水之一',
    allOf(twoAny.body?.items ?? [], (it) => it.types.includes('fire') || it.types.includes('water')) === true,
  );

  const twoAll = await get('/api/pokedex?types=fire,water&typeMode=all&pageSize=200');
  ok('属性全部: 结果少于「任一」', (twoAll.body?.total ?? 0) < (twoAny.body?.total ?? 0), [
    twoAll.body?.total,
    twoAny.body?.total,
  ]);
  ok(
    '属性全部: 每一只同时拥有火和水',
    allOf(
      twoAll.body?.items ?? [],
      (it) => it.types.includes('fire') && it.types.includes('water'),
    ) === true,
    (twoAll.body?.items ?? []).find((it) => !(it.types.includes('fire') && it.types.includes('water')))?.nameZh,
  );

  const excluded = await get('/api/pokedex?types=fire&excludeTypes=fire&pageSize=10');
  ok('自相矛盾的条件（火 且 排除火）返回 0', excluded.body?.total === 0, excluded.body?.total);

  /*
   * 排除属性要挑一个「真的出现在该属性结果里」的属性来排 ——
   * 前三世代没有火+草的宝可梦，用 excludeTypes=grass 去排火系，
   * 集合本来就不相交，结果数不变，断言会得到一个既非 bug 也非通过的假象。
   * 火+飞行是真实存在的（喷火龙 / 火焰鸟 / 凤王），排掉它必须让结果变少。
   */
  const noFlying = await get('/api/pokedex?types=fire&excludeTypes=flying&pageSize=200');
  ok(
    '排除属性: 结果里没有飞行属性',
    allOf(noFlying.body?.items ?? [], (it) => !it.types.includes('flying')) === true,
    (noFlying.body?.items ?? []).find((it) => it.types.includes('flying'))?.nameZh,
  );
  ok(
    '排除属性: 排掉火系里真实存在的飞行后，结果确实变少',
    (noFlying.body?.total ?? 0) > 0 && (noFlying.body?.total ?? 0) < (fire.body?.total ?? 0),
    [noFlying.body?.total, fire.body?.total],
  );

  /* ------------------------------ 世代 ------------------------------ */
  const gen1 = await get('/api/pokedex?generations=1');
  ok('世代 1: 151 只', gen1.body?.total === 151, gen1.body?.total);
  ok('世代 1: 每一只 generation 都是 1', allOf(gen1.body?.items ?? [], (it) => it.generation === 1) === true);
  const gen23 = await get('/api/pokedex?generations=2,3');
  ok('世代 2+3: 235 只', gen23.body?.total === 235, gen23.body?.total);
  ok(
    '世代 2+3: 没有第一世代的混进来',
    allOf(gen23.body?.items ?? [], (it) => it.generation === 2 || it.generation === 3) === true,
  );

  /* ------------------------------ 种族值 ------------------------------ */
  const high = await get('/api/pokedex?statTotalMin=600&sort=total&order=desc&pageSize=50');
  ok('种族值总和 ≥600: 结果非空', (high.body?.total ?? 0) > 0, high.body?.total);
  ok(
    '种族值总和 ≥600: 每一项都达标',
    allOf(high.body?.items ?? [], (it) => it.statTotal >= 600) === true,
    (high.body?.items ?? []).find((it) => it.statTotal < 600)?.nameZh,
  );
  ok(
    '排序 desc: 结果确实递减',
    (high.body?.items ?? []).every((it, i, arr) => i === 0 || arr[i - 1].statTotal >= it.statTotal) === true,
    (high.body?.items ?? []).slice(0, 5).map((it) => it.statTotal),
  );
  ok('降序第一名是 680 级的神兽', (high.body?.items?.[0]?.statTotal ?? 0) === 680, high.body?.items?.[0]);

  const slow = await get('/api/pokedex?statKey=speed&statMin=150&pageSize=50');
  ok('速度 ≥150: 每项速度达标', allOf(slow.body?.items ?? [], (it) => it.stats.speed >= 150) === true, slow.body?.total);
  ok('速度 ≥150: 结果非空', (slow.body?.total ?? 0) > 0, slow.body?.total);

  // 上下界传反了应自动交换，而不是返回空
  const swapped = await get('/api/pokedex?statTotalMin=600&statTotalMax=200');
  ok('上下界传反时自动交换（结果 = 200–600 区间，非 0）', (swapped.body?.total ?? 0) > 0, swapped.body?.total);

  /* ------------------------------ 标记 ------------------------------ */
  const legend = await get('/api/pokedex?tags=legendary&pageSize=100');
  ok('传说标记: 每项都是传说', allOf(legend.body?.items ?? [], (it) => it.isLegendary) === true, legend.body?.total);
  ok('传说标记: 结果非空', (legend.body?.total ?? 0) > 0, legend.body?.total);

  const myth = await get('/api/pokedex?tags=mythical&pageSize=100');
  ok('幻兽标记: 至少 4 只（梦幻/雪拉比/基拉祈/代欧奇希斯）', (myth.body?.total ?? 0) >= 4, myth.body?.total);
  ok(
    '传说与幻兽是两个不同的集合（幻兽不算传说）',
    (legend.body?.items ?? []).every((it) => !(myth.body?.items ?? []).some((m) => m.id === it.id)) === true,
  );

  /* ------------------------------ 组合条件 ------------------------------ */
  const combo = await get(
    '/api/pokedex?generations=1&types=psychic&statTotalMin=400&sort=total&order=desc&pageSize=100',
  );
  const comboOk = allOf(
    combo.body?.items ?? [],
    (it) => it.generation === 1 && it.types.includes('psychic') && it.statTotal >= 400,
  );
  ok('三条件组合（一世代 + 超能 + 种族值≥400）全部满足', comboOk === true, comboOk === true ? undefined : comboOk);
  ok('三条件组合: 结果非空', (combo.body?.total ?? 0) > 0, combo.body?.total);
  ok(
    '三条件组合: 结果里包含超梦（#150）',
    (combo.body?.items ?? []).some((it) => it.id === 150),
    (combo.body?.items ?? []).map((it) => it.id).slice(0, 10),
  );

  /* ------------------------------ 分页 ------------------------------ */
  const p1 = await get('/api/pokedex?page=1&pageSize=24');
  const p2 = await get('/api/pokedex?page=2&pageSize=24');
  ok('分页: 第一页 24 条', p1.body?.items?.length === 24, p1.body?.items?.length);
  ok('分页: pageCount = ceil(386/24) = 17', p1.body?.pageCount === 17, p1.body?.pageCount);
  ok(
    '分页: 两页没有重叠',
    (p1.body?.items ?? []).every((a) => !(p2.body?.items ?? []).some((b) => b.id === a.id)) === true,
  );
  ok('分页: 第二页首项是 #25', p2.body?.items?.[0]?.id === 25, p2.body?.items?.[0]?.id);

  const last = await get('/api/pokedex?page=999&pageSize=24');
  ok('分页: 超出范围时夹到最后一页而不是空结果', (last.body?.items?.length ?? 0) > 0, last.body?.page);

  const bigPage = await get('/api/pokedex?pageSize=9999');
  ok('分页: pageSize 超上限被夹到 200', bigPage.body?.pageSize === 200, bigPage.body?.pageSize);

  /* ------------------------------ 详情 ------------------------------ */
  const d25 = await get('/api/pokedex/25');
  ok('详情 #25: 200', d25.status === 200, d25.status);
  ok('详情 #25: 是皮卡丘', d25.body?.pokemon?.nameZh === '皮卡丘', d25.body?.pokemon?.nameZh);
  ok('详情 #25: 有 6 项种族值', Object.keys(d25.body?.pokemon?.stats ?? {}).length === 6);
  ok('详情 #25: 有特性', (d25.body?.pokemon?.abilities?.length ?? 0) > 0);
  ok('详情 #25: 进化线根节点是皮丘（#172）', d25.body?.line?.rootId === 172, d25.body?.line?.rootId);
  ok('详情 #25: 链上有雷丘（#26）', d25.body?.members?.['26'] !== undefined || d25.body?.members?.[26] !== undefined);
  ok('详情 #25: 进化树非空', Array.isArray(d25.body?.line?.tree) && d25.body.line.tree.length > 0);
  ok(
    '详情 #25: 进化树第 1 层只有皮丘一个根分支的子节点',
    d25.body?.line?.tree?.[0]?.id === 25 || d25.body?.line?.tree?.[0]?.id === 26,
    d25.body?.line?.tree?.map((n) => n.id),
  );

  const d133 = await get('/api/pokedex/133');
  /*
   * 树结构约定：line.tree 是**根节点的子节点数组**，根节点自身不在 tree 里
   * （根由 line.rootId 单独表达，前端 getLineRoot() 负责把两者拼起来）。
   * 所以伊布这条链的 8 条分支 = tree.length，而不是 tree[0].children.length。
   */
  const eeveeChildren = d133.body?.line?.tree?.length ?? 0;
  ok('详情 #133（伊布）: 根下 8 条分支', eeveeChildren === 8, eeveeChildren);
  ok('详情 #133: 成员数 ≥ 9（伊布 + 8 进化形）', Object.keys(d133.body?.members ?? {}).length >= 9, Object.keys(d133.body?.members ?? {}).length);

  const d465 = await get('/api/pokedex/465');
  ok('详情 #465（巨蔓藤，第四世代）: 也能查到，保证进化树完整', d465.status === 200, d465.status);
  ok('详情 #465: 它的进化线包含巨蔓藤自己', d465.body?.members?.[465] !== undefined || d465.body?.members?.['465'] !== undefined);

  const missing = await get('/api/pokedex/99999');
  ok('详情: 不存在的编号返回 404', missing.status === 404, missing.status);

  const bad = await get('/api/pokedex/abc');
  ok('详情: 非数字编号返回 400', bad.status === 400, bad.status);

  /* ------------------------------ 属性分类 ------------------------------ */
  const types = await get('/api/types');
  ok('/api/types: 18 种属性', types.body?.types?.length === 18, types.body?.types?.length);
  const fireProfile = types.body?.types?.find((t) => t.slug === 'fire');
  ok('火属性: 弱点包含水/地面/岩石', ['water', 'ground', 'rock'].every((s) => fireProfile?.weakTo?.some((w) => w.slug === s)), fireProfile?.weakTo);
  ok('火属性: 招式克制包含草', fireProfile?.strongAgainst?.some((s) => s.slug === 'grass') === true, fireProfile?.strongAgainst);
  const normalProfile = types.body?.types?.find((t) => t.slug === 'normal');
  ok('一般属性: 免疫幽灵（no_damage_from 正确转入矩阵）', normalProfile?.immuneTo?.some((s) => s.slug === 'ghost') === true, normalProfile?.immuneTo);
  ok('每种属性都有中文名', allOf(types.body?.types ?? [], (t) => Boolean(t.nameZh)) === true);

  /* --------------------------- 反向验证（自检） --------------------------- */
  if (SELF_TEST) {
    const before = failures.length;
    ok('[自检] 这个断言必须失败：386 应该等于 999', 386 === 999);
    if (failures.length === before + 1) {
      failures.length = before; // 把这个故意的失败收回去
      console.log('\n[api-check] 自检通过：框架确实会捕获错误断言。');
    } else {
      console.error('\n[api-check] 自检失败：框架没有捕获到明显错误的断言，测试结果不可信。');
      process.exit(1);
    }
  }

  /* ------------------------------ 汇总 ------------------------------ */
  console.log(`[api-check] ${pass} / ${pass + failures.length} 项通过`);
  if (failures.length) {
    console.error(`\n未通过 ${failures.length} 项：`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log('[api-check] 全部通过');
}

main().catch((err) => {
  console.error('[api-check] 执行失败:', err);
  process.exit(1);
});
