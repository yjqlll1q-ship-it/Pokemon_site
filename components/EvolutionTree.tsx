import {
  getLineRoot,
  getPath,
  flattenLine,
  isLinearLine,
  getRouteCount,
  type EvoLine,
  type EvoMember,
  type EvoMembers,
  type EvoNode,
} from '@/lib/evolution';
import { typeTintStyle } from '@/lib/typeColors';

interface Props {
  line: EvoLine;
  /** 当前弹窗正在展示的宝可梦，会被高亮 */
  currentId: number;
  /** 形态 id → 展示信息。数据由调用方传入，本组件不读任何全局数据 */
  members: EvoMembers;
  onSelect: (id: number) => void;
}

const dexLabel = (n: number) => `#${String(n).padStart(4, '0')}`;

/** 分叉超过这个数就换两列，避免一长条往下拖 */
const WIDE_THRESHOLD = 4;

/* ------------------------------- 单个节点卡片 ------------------------------- */

function EvoNodeCard({
  node,
  member,
  isCurrent,
  onSelect,
}: {
  node: EvoNode;
  member: EvoMember | undefined;
  isCurrent: boolean;
  onSelect: (id: number) => void;
}) {
  if (!member) return null;

  return (
    <button
      type="button"
      className={[
        // 只留 border 的宽度，颜色/底色/阴影交给下面的分流决定
        'inline-flex items-center gap-2.5 rounded-md border py-1.5 pr-3.5 pl-1.5 text-left',
        'transition-[border-color,box-shadow,translate] duration-[160ms] hover:-translate-y-px',
        /*
         * 当前节点用 tint-node-active，它自带描边色 + 底色 + 内阴影。
         * 正因为如此，当前节点不能同时带 bg-surface / border-line / shadow-sm ——
         * Tailwind 把自定义 @utility 排在内置 utility 之前，这三条会整体盖掉
         * tint-node-active，把「当前所在」的高亮吃成普通节点。
         *
         * 另一个行为细节：改造前 `.node:hover` 与 `.node.current` 同权重、后者靠后，
         * 结果是「当前节点被 hover 时描边与阴影不变、但仍然抬起 1px」。
         * 这里也用 isCurrent 分流，保持一致。
         */
        isCurrent
          ? 'tint-node-active'
          : 'border-line bg-surface shadow-sm hover:tint-edge-strong hover:shadow-md',
      ].join(' ')}
      style={typeTintStyle(member.types[0] ?? 'normal')}
      onClick={() => onSelect(node.id)}
      data-testid="evo-node"
      data-pokemon-id={node.id}
      aria-current={isCurrent ? 'true' : undefined}
    >
      <img
        className="size-[52px] flex-none object-contain thumb-shadow"
        src={member.sprite}
        alt=""
        width={52}
        height={52}
        loading="lazy"
        decoding="async"
      />
      <span className="flex min-w-0 flex-col gap-px">
        <span className="font-mono text-[10.5px] tracking-[0.04em] text-ink-3">
          {dexLabel(member.dexNumber)}
        </span>
        <span className="text-[14px] font-semibold whitespace-nowrap text-ink">{member.nameZh}</span>
      </span>
    </button>
  );
}

/* --------------------------- 单线进化：横向箭头排 --------------------------- */

function LinearRow({
  nodes,
  members,
  currentId,
  onSelect,
}: {
  nodes: EvoNode[];
  members: EvoMembers;
  currentId: number;
  onSelect: (id: number) => void;
}) {
  return (
    <ol className="flex items-center gap-1 overflow-x-auto px-0.5 pt-1.5 pb-3">
      {nodes.map((node, i) => (
        <li key={node.id} className="flex flex-none items-center gap-1">
          {i > 0 && (
            <span
              className="flex min-w-[96px] max-w-[150px] flex-col items-center gap-0.5 px-1.5"
              data-testid="evo-condition"
            >
              <span className="text-center text-[11px] leading-[1.35] text-ink-2">
                {node.condition}
              </span>
              <span className="step-arrow" aria-hidden="true" />
            </span>
          )}
          <EvoNodeCard
            node={node}
            member={members[node.id]}
            isCurrent={node.id === currentId}
            onSelect={onSelect}
          />
        </li>
      ))}
    </ol>
  );
}

/* ----------------------------- 有分支：缩进树 ------------------------------ */

function Branch({
  node,
  members,
  currentId,
  onSelect,
}: {
  node: EvoNode;
  members: EvoMembers;
  currentId: number;
  onSelect: (id: number) => void;
}) {
  const wide = node.children.length > WIDE_THRESHOLD;

  return (
    <div className="flex flex-col items-start">
      <EvoNodeCard
        node={node}
        member={members[node.id]}
        isCurrent={node.id === currentId}
        onSelect={onSelect}
      />
      {node.children.length > 0 && (
        /*
         * 分叉多时用两列。这里必须用 grid 而不是 columns：
         * columns 是「列优先」，分支顺序会变成 1/3/5/7、2/4/6/8；grid 按行排，
         * 读起来才是 1/2、3/4 的自然顺序。
         */
        <ul
          className={
            wide
              ? 'grid grid-cols-2 gap-x-[22px] max-[640px]:grid-cols-1'
              : 'ml-[18px] border-l border-line-strong pl-[22px]'
          }
        >
          {node.children.map((child) => (
            <li
              key={child.id}
              className={
                wide
                  ? 'child-rail ml-[18px] border-l border-line-strong pl-[22px] max-[640px]:ml-0'
                  : 'child-rail'
              }
            >
              <span
                className="mb-1 inline-block rounded-full border border-line bg-paper-soft px-[9px] py-px text-[11px] leading-[1.4] text-ink-2"
                data-testid="evo-condition"
              >
                {child.condition}
              </span>
              <Branch node={child} members={members} currentId={currentId} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------------- 对外组件 -------------------------------- */

/**
 * 进化树。
 * 单线进化横向排（读起来像时间线），出现分支时自动切换成缩进树，
 * 两种排布共用同一份数据，不需要为每条进化线写特例。
 *
 * 形态的展示信息由 members 传进来 —— 本组件不依赖任何全局数据源，
 * 所以既能给首页（静态数据）用，也能给图鉴查询页（数据库）用。
 */
export default function EvolutionTree({ line, currentId, members, onSelect }: Props) {
  const nodes = flattenLine(line);

  if (nodes.length <= 1) {
    return <p className="text-[13.5px] text-ink-2">这只宝可梦没有进化形。</p>;
  }

  const linear = isLinearLine(line);
  const root = getLineRoot(line);
  const stageNow = Math.max(1, getPath(line, currentId).length);
  const stageMax = Math.max(...collectDepths(root)) + 1;
  const routeCount = getRouteCount(line);

  return (
    <div>
      {linear ? (
        <LinearRow nodes={nodes} members={members} currentId={currentId} onSelect={onSelect} />
      ) : (
        <Branch node={root} members={members} currentId={currentId} onSelect={onSelect} />
      )}

      <p className="mt-3.5 border-t border-dashed border-line pt-2.5 text-[12px] text-ink-3">
        点击任意形态可查看它的资料 · 当前位于第 {stageNow} 阶段，本条进化线共 {stageMax} 阶段
        {routeCount > 1 ? `，分 ${routeCount} 条进化路线` : ''}
      </p>
    </div>
  );
}

/** 树的最大深度，用于「共 N 阶段」 */
function collectDepths(root: EvoNode, depth = 0, acc: number[] = []): number[] {
  acc.push(depth);
  root.children.forEach((c) => collectDepths(c, depth + 1, acc));
  return acc;
}
