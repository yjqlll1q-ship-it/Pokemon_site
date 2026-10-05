/**
 * GET /api/pokedex
 * ---------------------------------------------------------------------------
 * 图鉴查询（前四世代 #1–493）。多条件搜索的唯一入口。
 *
 * 查询参数（全部可选，可重复或用逗号分隔）：
 *   q              关键词：中文名 / 英文名 / 日文名 / 分类 / 编号
 *   types          属性 slug，如 fire 或 fire,water（可重复传）
 *   typeMode       any（默认，任一命中）| all（必须同时拥有）
 *   excludeTypes   排除属性：拥有其中任一的都不返回
 *   generations    世代，1 / 2 / 3
 *   statTotalMin   种族值总和下限
 *   statTotalMax   种族值总和上限
 *   statKey        单项种族值：hp|attack|defense|spAttack|spDefense|speed
 *   statMin        单项下限（需同时给 statKey）
 *   statMax        单项上限
 *   abilities      特性 slug，任一命中即可
 *   eggGroups      蛋群 slug，任一命中即可
 *   tags           legendary | mythical | baby，任一命中即可
 *   sort           id|total|hp|attack|defense|spAttack|spDefense|speed|height|weight|capture|name
 *   order          asc（默认）| desc
 *   page           从 1 开始
 *   pageSize       12–200，默认 48
 *
 * 例：/api/pokedex?types=fire,water&typeMode=any&generations=1&statTotalMin=500&sort=total&order=desc
 */

import { NextResponse, type NextRequest } from 'next/server';
import { searchPokemon, type SearchParams } from '@/lib/pokedex-query';

// 每次请求都要读数据库，不能参与静态优化
export const dynamic = 'force-dynamic';

/**
 * 取值工具：同时支持 `?types=fire&types=water` 与 `?types=fire,water`，
 * 顺手 trim 掉空串，免得 `?types=` 被当成「筛选了一个空属性」而返回 0 条。
 */
const list = (sp: URLSearchParams, key: string): string[] =>
  sp
    .getAll(key)
    .flatMap((v) => v.split(','))
    .map((s) => s.trim())
    .filter(Boolean);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const params: SearchParams = {
    q: sp.get('q'),
    types: list(sp, 'types'),
    typeMode: sp.get('typeMode'),
    excludeTypes: list(sp, 'excludeTypes'),
    generations: list(sp, 'generations'),
    statTotalMin: sp.get('statTotalMin'),
    statTotalMax: sp.get('statTotalMax'),
    statKey: sp.get('statKey'),
    statMin: sp.get('statMin'),
    statMax: sp.get('statMax'),
    abilities: list(sp, 'abilities'),
    eggGroups: list(sp, 'eggGroups'),
    tags: list(sp, 'tags'),
    sort: sp.get('sort'),
    order: sp.get('order'),
    page: sp.get('page'),
    pageSize: sp.get('pageSize'),
  };

  try {
    const result = searchPokemon(params);
    return NextResponse.json(result, {
      // 本地开发时方便肉眼确认，生产下这里换成短缓存也安全（数据是静态的）
      headers: { 'cache-control': 'no-store' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // 数据库没建是最常见的失败，单独给一个能直接照做的提示
    const hint = message.includes('找不到数据库')
      ? '请先执行 npm run db 生成 data/pokedex.db'
      : undefined;
    return NextResponse.json({ error: message, hint }, { status: 503 });
  }
}
