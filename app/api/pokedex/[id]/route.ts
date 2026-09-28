/**
 * GET /api/pokedex/[id]
 * ---------------------------------------------------------------------------
 * 单只宝可梦的完整资料 + 所属进化链 + 链上全部形态。
 *
 * 返回的 pokemon 字段与 data/pokedex.json 里的单只结构同构，
 * 所以前端可以直接把它交给 PokémonDetail 组件渲染，不需要做二次转换。
 *
 * 注意：id 是**全国图鉴编号**。进化链上可能出现第四世代及以后的成员
 * （如 Tangrowth #465），它们同样可以在这里查到 —— 进化树才能画完整。
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getPokemonDetail } from '@/lib/pokedex-query';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numeric = Number.parseInt(id, 10);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return NextResponse.json({ error: `无效的图鉴编号：${id}` }, { status: 400 });
  }

  try {
    const detail = getPokemonDetail(numeric);
    if (!detail) {
      return NextResponse.json({ error: `数据库里没有 #${numeric}` }, { status: 404 });
    }
    return NextResponse.json(detail, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
