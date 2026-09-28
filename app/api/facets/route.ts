/**
 * GET /api/facets
 * ---------------------------------------------------------------------------
 * 筛选面板需要的「选项 + 计数」。
 *
 * 为什么不把这些写死在前端：
 *   计数是从数据库实时算的（每个属性有几只、每个世代有几只、种族的上下界），
 *   数据一扩展（比如以后加第四世代）筛选面板会自动跟着变，不用改前端一行。
 */

import { NextResponse } from 'next/server';
import { getFacets } from '@/lib/pokedex-query';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(getFacets(), { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hint = message.includes('找不到数据库')
      ? '请先执行 npm run db 生成 data/pokedex.db'
      : undefined;
    return NextResponse.json({ error: message, hint }, { status: 503 });
  }
}
