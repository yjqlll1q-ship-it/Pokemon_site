/**
 * GET /api/types
 * ---------------------------------------------------------------------------
 * 「按属性分类」视图的数据源：18 种属性各自的
 *   - 前三世代中有几只（count）
 *   - 防守相性：弱点（2×）/ 抗性（0.5×）/ 免疫（0×）
 *   - 进攻相性：这个属性的招式克制哪些属性（2×）
 *
 * 相克数据存在 type_effect 表里（建库时从 PokéAPI 的 damage_relations 转成
 * 「进攻方视角」的矩阵），不写死在前端。
 */

import { NextResponse } from 'next/server';
import { getTypeProfiles } from '@/lib/pokedex-query';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ types: getTypeProfiles() }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hint = message.includes('找不到数据库')
      ? '请先执行 npm run db 生成 data/pokedex.db'
      : undefined;
    return NextResponse.json({ error: message, hint }, { status: 503 });
  }
}
