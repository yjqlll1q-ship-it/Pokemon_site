/**
 * lib/detail.ts
 * ---------------------------------------------------------------------------
 * 详情页的**服务端**取数：把「一只宝可梦 + 它的进化线 + 进化树渲染信息」
 * 打包成 PokemonScreen 需要的 props。
 *
 * 单独成文件而不是塞进页面：首页（默认展示洛托姆）和 /pokemon/[id] 都要
 * 这段逻辑，两处各写一遍迟早会漂移。
 *
 * 服务端专用（import 了全量 JSON）。
 */

import type { EvoLine, EvoMembers } from './evolution';
import type { Pokemon } from './pokedex';
import { buildMembersMap, getLineFor, getPokemon } from './pokedex';

export interface ScreenData {
  pokemon: Pokemon;
  line: EvoLine;
  members: EvoMembers;
}

/**
 * 取一只宝可梦的完整详情数据。
 * 取不到返回 null（页面据此走 404），**不抛异常** —— 用户手敲一个不存在的编号
 * 是常见操作，不该变成 500。
 */
export function loadScreen(id: number): ScreenData | null {
  const pokemon = getPokemon(id);
  if (!pokemon) return null;

  // 没有进化线（如 #479 洛托姆）时给一个空树，组件按「无进化」渲染
  const line: EvoLine = getLineFor(id) ?? {
    key: pokemon.name,
    chainId: null,
    rootId: id,
    tree: [],
  };

  return { pokemon, line, members: buildMembersMap([line]) };
}
