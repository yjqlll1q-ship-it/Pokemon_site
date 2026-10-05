/**
 * 全站背景装饰图形（参考稿的红蓝斜切条纹 + 精灵球圆环 + 点阵圆 + 短斜线点缀）。
 *
 * 为什么用一整块 SVG，而不是像上一版那样拆成「CSS 渐变画斜条纹 +
 * ::before/::after 画圆环/点阵」两套：
 *   1. 参考稿这组装饰一共 6+ 个独立图形，彼此有相对位置关系
 *      （红色粗带要穿过精灵球圆环、细斜线要卡在粗带下方），拆在两套坐标系里
 *      （CSS 的百分比渐变 vs 伪元素的像素定位）很难对齐，调一处要连带改两处。
 *   2. 点阵圆用 CSS 只能做「方形重复图案裁成圆」，裁切边缘容易露出半颗点；
 *      SVG 用 <pattern> 填充再裁成圆，边缘更干净。
 *   3. globals.css 文件头的 D 节记录过 Tailwind 的 var() 链在本机 Chrome 上
 *      会静默失效的坑。这组图形是纯静态装饰，不需要跟 --poke 主题色联动
 *      （参考稿本身就是全站统一的红蓝配色，不会因为某只宝可梦主题是绿色
 *      就把背景条纹染绿），所以颜色直接写死在 SVG 里，少一层出错的可能。
 *      如果以后 --color-red / --color-blue / --color-navy 改了配色，
 *      这里的十六进制要手动同步一次 —— 这是为可靠性做的取舍。
 *
 * 用 viewBox + preserveAspectRatio="xMidYMid slice" 让整组图形等比缩放铺满
 * 视口（效果类似 background-size: cover），不会随视口宽高比被拉伸变形。
 * 1536×1010 是按参考稿原图尺寸定的坐标系，所有图形坐标都是在这个画布里量出来的。
 *
 * fixed + 负 z-index + pointer-events:none：与旧版 app-frame 的处理一致，
 * 装饰钉在视口角落不随内容滚动；z-index 给 -6（比 SiteBackground.tsx 的
 * 自定义背景层 -z-10 高半档），确保用户自定义背景图能完全盖住这组装饰，
 * 而这组装饰本身又稳稳在所有正常内容之下。
 *
 * 不是交互组件，没有任何 state，所以不需要 'use client' —— 即便被
 * 'use client' 的 AppShell.tsx 直接 import 使用，打包体积也只是几百字节的
 * 内联 SVG，犯不上为它单独走「服务端组件当 children 传入」那一套。
 */
export default function BgDecor() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none fixed inset-0 -z-[6] h-full w-full"
      viewBox="0 0 1536 1010"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        {/* 点阵圆的重复图案：14px 网格、每格一个半径 1.6 的深蓝小圆点 */}
        <pattern id="bgDotPattern" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.6" fill="#0b3e65" fillOpacity="0.16" />
        </pattern>
      </defs>

      {/* 1. 顶部主红斜带：从右上角贯穿到主卡片中部，参考稿里最醒目的一条 */}
      <polygon points="760,0 1040,0 880,420 600,420" fill="#ed1912" fillOpacity="0.92" />

      {/* 2. 主红带下方的细红斜带：比主带窄，错开排布，不贴在一起糊成一块 */}
      <polygon points="840,360 920,360 820,660 740,660" fill="#ed1912" fillOpacity="0.55" />

      {/* 3. 精灵球圆环：空心大圆，压在主红带上方，呼应品牌标识 */}
      <circle cx="930" cy="78" r="68" fill="none" stroke="#ffffff" strokeWidth="9" opacity="0.92" />
      <circle cx="930" cy="78" r="10" fill="#ffffff" opacity="0.92" />

      {/* 4. logo 右侧的细蓝双斜线（小氛围装饰） */}
      <g stroke="#2a85df" strokeWidth="7" strokeLinecap="round" opacity="0.8">
        <line x1="336" y1="54" x2="372" y2="10" />
        <line x1="366" y1="78" x2="402" y2="34" />
      </g>

      {/* 5. 侧栏下方的短红斜线点缀（呼应参考稿左下角那一道） */}
      <line
        x1="96"
        y1="860"
        x2="150"
        y2="806"
        stroke="#ed1912"
        strokeWidth="10"
        strokeLinecap="round"
        opacity="0.85"
      />

      {/* 6. 左下角点阵圆：用上面定义的 pattern 填充，裁成圆 */}
      <circle cx="90" cy="990" r="150" fill="url(#bgDotPattern)" />
    </svg>
  );
}