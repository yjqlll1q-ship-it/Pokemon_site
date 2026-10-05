/**
 * lib/forms.ts
 * ---------------------------------------------------------------------------
 * 形态（forms）的**共享视图类型**与解析函数。
 *
 * 与 lib/evolution.ts 同一条纪律：这里刻意不 import 任何数据
 * （不碰 data/pokedex.json、不碰 node:sqlite）。形态列表与形态横条都要跑在客户端，
 * 一旦这个模块把全量数据集拖进客户端包，431 只宝可梦的数据就会白打进 JS，
 * 而且**不会报错** —— 只是包体悄悄涨几百 KB。数据一律由调用方以 props 传进来。
 *
 * 什么算「形态」：PokéAPI 的 species.varieties。覆盖超级进化、超极巨化、原始回归、
 * 地区形态（阿罗拉 / 伽勒尔 / 洗翠 / 帕底亚）、洛托姆的家电形态、代欧奇希斯的四种形态、
 * 皮卡丘的换装与帽子形态等。**没有额外形态的宝可梦 forms 是空数组**，
 * 前端据此整块不渲染 —— 所以「以后加宝可梦不用改代码」这条依然成立。
 */

export interface PokemonForm {
  /** PokéAPI 的 variety slug，如 rotom-heat */
  slug: string;
  /** 完整展示名，如「洛托姆（加热形态）」 */
  nameZh: string;
  /** 只到形态那一段，如「加热形态」；基本形态固定是「基本形态」 */
  label: string;
  /** 是否该物种的基本形态（forms[0] 一定是） */
  isDefault: boolean;
  /** 形态与基本形态共用同一个图鉴编号 */
  dexNumber: number;
  /** 官方立绘（主面板用，单张约 130KB） */
  sprite: string;
  /** 96px 像素图（形态列表 / 横条的缩略图，单张不到 4KB）—— 小尺寸位一律用这个 */
  thumb: string;
  types: string[];
  typeNamesZh: string[];
  stats: Record<string, number>;
  statsZh: Record<string, number>;
  statTotal: number;
  heightM: number;
  weightKg: number;
}

/** 主面板展示所需的最小集合；基本形态与各形态都能提供这一份 */
export interface PokemonView {
  /** 主标题 */
  nameZh: string;
  /** 形态标签（基本形态为空串，主面板不显示） */
  subLabel: string;
  sprite: string;
  types: string[];
  typeNamesZh: string[];
  stats: Record<string, number>;
  statTotal: number;
  heightM: number;
  weightKg: number;
}

/** 传入 resolveView 的「基本形态来源」——Pokemon 结构化地满足它 */
export interface FormOwner {
  nameZh: string;
  sprite: string;
  types: string[];
  typeNamesZh: string[];
  stats: Record<string, number>;
  statTotal: number;
  heightM: number;
  weightKg: number;
}

/** 有没有可选形态（决定「形态」整块渲不渲染） */
export function hasForms(forms: PokemonForm[] | undefined | null): boolean {
  return Boolean(forms && forms.length > 1);
}

/** 基本形态；数据里没有 forms 时返回 null */
export function defaultForm(forms: PokemonForm[] | undefined | null): PokemonForm | null {
  return forms?.find((f) => f.isDefault) ?? forms?.[0] ?? null;
}

/**
 * 把「基本形态 + 选中形态」归一成主面板要的那一份视图。
 *
 * slug 为 null 或指向基本形态时，直接用 owner（即宝可梦本身）——
 * 这样没形态的宝可梦走的还是原来那条路径，一点没变。
 */
export function resolveView(
  owner: FormOwner,
  forms: PokemonForm[] | undefined | null,
  slug: string | null,
): PokemonView {
  const form = slug ? forms?.find((f) => f.slug === slug) : undefined;

  if (!form || form.isDefault) {
    return {
      nameZh: owner.nameZh,
      subLabel: '',
      sprite: owner.sprite,
      types: owner.types,
      typeNamesZh: owner.typeNamesZh,
      stats: owner.stats,
      statTotal: owner.statTotal,
      heightM: owner.heightM,
      weightKg: owner.weightKg,
    };
  }

  return {
    nameZh: form.nameZh,
    subLabel: form.label,
    sprite: form.sprite,
    types: form.types,
    typeNamesZh: form.typeNamesZh,
    stats: form.stats,
    statTotal: form.statTotal,
    heightM: form.heightM,
    weightKg: form.weightKg,
  };
}
