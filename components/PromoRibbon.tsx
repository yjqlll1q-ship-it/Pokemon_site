/**
 * 宣传飘带 —— 右侧信息卡顶部那条斜切角标。
 *
 * 只在**数据里有宣传语**时渲染（`taglineZh` 有真值）。
 * 没有就整块不出现：不报错、不留白、不占位 —— 高度完全由内容决定，
 * 所以「有没有飘带」不会让卡片多出一条空行。
 *
 * 写在父卡片的**第一个子节点**上，并自带顶部圆角（`rounded-t-[21px]`，
 * 比卡片的 `--radius-lg` 22px 小 1px 是为了贴合 1px 描边内侧）。
 * 之所以不靠父容器的 `overflow-hidden` 裁圆角：那会把卡片里所有
 * 溢出内容（比如聚焦环、投影）一起切掉，是一个影响面更大的改动。
 *
 * 配色：底色用 `--poke-deep` 而不是 `--poke` —— 这是站内铁律，
 * 压白字的实心底必须用 deep 档（主色是高饱和中间调，13px 白字普遍不达 4.5。
 * 全部 10 色的 deep 档白字对比度都验算过，最低 5.06）。
 * 右侧那道更深一档的斜切是装饰，与主面板头部的 `panel-band` 同一手法（102° 斜切）。
 */
export default function PromoRibbon({ text }: { text: string }) {
  return (
    <p
      /*
       * -mx-5 -mt-4：把飘带从卡片内边距里「顶出去」，做成通栏。
       * 卡片的 px-5 py-4 是调用方定的（PokemonScreen 的 side-intro），
       * 所以这里用负外边距对齐，而不是改父容器的 padding —— 父容器还要管下面的正文。
       *
       * clip-path 的斜切角度与 panel-band 的 102deg 一致：右下角切掉一块。
       * 切割点用 78% 而不是 56%（panel-band 的比例）：飘带本身矮（约 26px 高），
       * 同一个百分比切出来的斜边会明显更陡、看起来像被削掉一角。
       */
      className={[
        'promo-ribbon',
        '-mx-5 -mt-4 mb-3 rounded-t-[21px] px-5 py-1.5',
        /*
         * 这里**不写** text-white / bg-* —— 见 globals.css 的 promo-ribbon：
         * @utility 的产物排在内置 utility 之前，同元素上再写会把它的 color 顶掉。
         */
        'text-[12.5px] leading-[1.5] font-bold tracking-[0.02em] truncate',
      ].join(' ')}
      data-testid="promo-ribbon"
    >
      {text}
    </p>
  );
}
