/**
 * lib/evolution.ts
 * ---------------------------------------------------------------------------
 * 进化树的**纯计算**部分与共享视图类型。
 *
 * 这里刻意不 import 任何数据（不碰 data/pokedex.json，也不碰数据库）：
 * 进化树的渲染组件要跑在客户端，一旦这个模块把全量数据集拖进客户端包，
 * 493 只宝可梦的数据就会白打进 JS。数据一律由调用方以 props 传进来。
 */

/** 进化树节点：condition 描述「从父节点进化到本节点」的条件 */
export interface EvoNode {
  id: number;
  condition: string;
  children: EvoNode[];
}

/** 一条完整进化线（rootId 是最初形态） */
export interface EvoLine {
  key: string;
  /** PokéAPI 的 evolution_chain id；静态数据与数据库两条路都会带上 */
  chainId?: number | null;
  rootId: number;
  tree: EvoNode[];
}

/** 进化树上要展示的成员信息（渲染所需的最小集合） */
export interface EvoMember {
  id: number;
  nameZh: string;
  dexNumber: number;
  sprite: string;
  /** 属性英文 key，用于取色 */
  types: string[];
}

/** 成员查找表：进化树按 id 取展示信息 */
export type EvoMembers = Record<number, EvoMember>;

/** 把进化线归一成「以最初形态为根」的一棵树，渲染时只需要这一种结构 */
export function getLineRoot(line: EvoLine): EvoNode {
  return { id: line.rootId, condition: '', children: line.tree };
}

/** 从最初形态到该节点的进化步骤（用于显示「第 N 阶段」和面包屑） */
export function getPath(line: EvoLine, id: number): EvoNode[] {
  const walk = (node: EvoNode, trail: EvoNode[]): EvoNode[] | null => {
    const next = [...trail, node];
    if (node.id === id) return next;
    for (const child of node.children) {
      const found = walk(child, next);
      if (found) return found;
    }
    return null;
  };
  return walk(getLineRoot(line), []) ?? [];
}

/** 该进化线上的全部成员（按树的先序） */
export function flattenLine(line: EvoLine): EvoNode[] {
  const out: EvoNode[] = [];
  const walk = (node: EvoNode) => {
    out.push(node);
    node.children.forEach(walk);
  };
  walk(getLineRoot(line));
  return out;
}

/** 单体线性进化（一路到底，没有岔路）用横向箭头排更直观 */
export function isLinearLine(line: EvoLine): boolean {
  return flattenLine(line).every((n) => n.children.length <= 1);
}

/**
 * 进化路线数：把进化树走到底能走出的不同末梢条数。
 * 单线进化 = 1（一路到底），有分支则 >1：伊布 8 条、无畏小子 3 条、拉鲁拉丝 2 条。
 * 用于列表上给用户一个「这条线分几条路」的提示。
 */
export function getRouteCount(line: EvoLine): number {
  return flattenLine(line).filter((n) => n.children.length === 0).length;
}
