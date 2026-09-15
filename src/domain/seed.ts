import type {
  Building,
  Crew,
  DefectComponent,
  ProcedureTemplate,
} from "./types";

/** 跨建筑：三处在修古建 */
export const BUILDINGS: Building[] = [
  {
    id: "fgs",
    name: "佛光寺东大殿",
    dynasty: "唐",
    location: "山西忻州",
  },
  {
    id: "yxmt",
    name: "应县木塔",
    dynasty: "辽",
    location: "山西朔州",
  },
  {
    id: "ncs",
    name: "南禅寺大殿",
    dynasty: "唐",
    location: "山西忻州",
  },
];

/** 修缮工序链模板库（工序依赖 / 工期 / 费用 / 所需资质） */
export const PROCEDURES: ProcedureTemplate[] = [
  {
    id: "rot",
    name: "糟朽墩接工序链",
    steps: [
      { code: "protect", name: "现状支护与遮护", craft: "综合", duration: 2, cost: 6000, dependsOn: [] },
      { code: "survey", name: "糟朽范围勘察", craft: "木作", duration: 2, cost: 8000, dependsOn: ["protect"] },
      { code: "remove", name: "剔除糟朽木芯", craft: "木作", duration: 2, cost: 12000, dependsOn: ["survey"] },
      { code: "splice", name: "墩接新材", craft: "木作", duration: 2, cost: 18000, dependsOn: ["remove"] },
      { code: "tenon", name: "榫卯修整", craft: "木作", duration: 1, cost: 9000, dependsOn: ["splice"] },
      { code: "paint", name: "油饰断白", craft: "油饰", duration: 1, cost: 7000, dependsOn: ["tenon"] },
      { code: "caihui", name: "彩画复原", craft: "彩绘", duration: 2, cost: 14000, dependsOn: ["paint"] },
    ],
  },
  {
    id: "crack",
    name: "开裂修补工序链",
    steps: [
      { code: "protect", name: "现状支护与遮护", craft: "综合", duration: 1, cost: 5000, dependsOn: [] },
      { code: "survey", name: "裂隙勘察", craft: "木作", duration: 1, cost: 6000, dependsOn: ["protect"] },
      { code: "reinforce", name: "扁钢加固", craft: "木作", duration: 2, cost: 16000, dependsOn: ["survey"] },
      { code: "fill", name: "灌缝补腻", craft: "木作", duration: 1, cost: 6000, dependsOn: ["reinforce"] },
      { code: "paint", name: "油饰断白", craft: "油饰", duration: 1, cost: 6000, dependsOn: ["fill"] },
      { code: "caihui", name: "彩画复原", craft: "彩绘", duration: 1, cost: 9000, dependsOn: ["paint"] },
    ],
  },
  {
    id: "deform",
    name: "斗栱变形矫正工序链",
    steps: [
      { code: "protect", name: "现状支护与遮护", craft: "综合", duration: 1, cost: 4000, dependsOn: [] },
      { code: "survey", name: "变形测绘", craft: "木作", duration: 2, cost: 10000, dependsOn: ["protect"] },
      { code: "jack", name: "抬升归安", craft: "木作", duration: 2, cost: 16000, dependsOn: ["survey"] },
      { code: "repair", name: "斗栱修整", craft: "木作", duration: 2, cost: 13000, dependsOn: ["jack"] },
    ],
  },
  {
    id: "pest",
    name: "虫蛀治理工序链",
    steps: [
      { code: "survey", name: "虫害勘察", craft: "虫害防治", duration: 1, cost: 5000, dependsOn: [] },
      { code: "fumigate", name: "熏蒸除虫", craft: "虫害防治", duration: 2, cost: 12000, dependsOn: ["survey"] },
      { code: "repair", name: "蛀损修补", craft: "木作", duration: 1, cost: 8000, dependsOn: ["fumigate"] },
      { code: "paint", name: "油饰断白", craft: "油饰", duration: 1, cost: 4000, dependsOn: ["repair"] },
    ],
  },
];

/** 各建筑内已登记的病害构件 */
export const COMPONENTS: DefectComponent[] = [
  {
    id: "fgs_rot",
    buildingId: "fgs",
    code: "L-A03",
    name: "四椽栿（梁架）",
    timber: "楠木",
    disease: "糟朽",
    diseaseDesc: "梁端与斗栱交接处糟朽约 40cm",
    procedure: "rot",
  },
  {
    id: "fgs_crack",
    buildingId: "fgs",
    code: "C-05",
    name: "东檐柱",
    timber: "松木",
    disease: "开裂",
    diseaseDesc: "顺柱身纵向裂缝，长约 1.2m",
    procedure: "crack",
  },
  {
    id: "yxmt_deform",
    buildingId: "yxmt",
    code: "DG-217",
    name: "二层外檐斗栱",
    timber: "榆木",
    disease: "变形",
    diseaseDesc: "栌斗压陷、栱臂外倾",
    procedure: "deform",
  },
  {
    id: "yxmt_rot",
    buildingId: "yxmt",
    code: "L-112",
    name: "内槽乳栿",
    timber: "松木",
    disease: "糟朽",
    diseaseDesc: "栿底局部糟朽，截面损失约 1/5",
    procedure: "rot",
  },
  {
    id: "ncs_pest",
    buildingId: "ncs",
    code: "C-11",
    name: "西内柱",
    timber: "榆木",
    disease: "虫蛀",
    diseaseDesc: "柱脚发现粉蠹蛀道",
    procedure: "pest",
  },
  {
    id: "ncs_crack",
    buildingId: "ncs",
    code: "L-08",
    name: "搭牵",
    timber: "松木",
    disease: "开裂",
    diseaseDesc: "端部榫根处开裂",
    procedure: "crack",
  },
  {
    id: "ncs_rot",
    buildingId: "ncs",
    code: "C-02",
    name: "前檐明柱",
    timber: "楠木",
    disease: "糟朽",
    diseaseDesc: "柱心糟朽、表层尚完整",
    procedure: "rot",
  },
];

/**
 * 修缮班组（跨项目共享资源）。
 * occupancies 表示班组在【其他文保项目】的占用区间，形成跨项目占用约束。
 */
export const ALL_CREWS: Crew[] = [
  {
    id: "wood1",
    name: "一队·大木作班",
    crafts: ["木作"],
    size: 8,
    occupancies: [{ project: "崇福寺弥陀殿抢险", start: 0, end: 4 }],
  },
  {
    id: "wood2",
    name: "二队·木作班",
    crafts: ["木作"],
    size: 6,
    occupancies: [],
  },
  {
    id: "bracket",
    name: "三队·斗栱专修班",
    crafts: ["木作"],
    size: 5,
    occupancies: [{ project: "晋祠圣母殿落架大修", start: 6, end: 12 }],
  },
  {
    id: "paint1",
    name: "四队·油饰班",
    crafts: ["油饰"],
    size: 4,
    occupancies: [{ project: "永乐宫壁画维护配合", start: 6, end: 9 }],
  },
  {
    id: "caihui1",
    name: "五队·彩绘班",
    crafts: ["彩绘", "油饰"],
    size: 5,
    occupancies: [],
  },
  {
    id: "pest1",
    name: "六队·虫害防治班",
    crafts: ["虫害防治"],
    size: 3,
    occupancies: [{ project: "镇国寺万佛殿勘察", start: 0, end: 2 }],
  },
  {
    id: "general",
    name: "综合班·支护搭架",
    crafts: ["综合"],
    size: 6,
    occupancies: [],
  },
];

/** 当前用户（多账号用于演示并发） */
export const USERS = ["张工（木作负责人）", "李工（项目管理员）", "王工（彩画负责人）"];
