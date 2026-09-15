// 领域模型：古建筑跨建筑修缮排程
// 注意：所有时间均以"相对开工日"（第 0 天为基准日，见 date.ts 的 DAY0）表达，
// 避免跨浏览器时区问题，界面展示时再换算为真实日期。

/** 工种（工序所需资质 = 班组所持资质） */
export type Craft =
  | "木作"
  | "瓦作"
  | "油饰"
  | "虫害防治"
  | "彩绘"
  | "综合";

export type Severity = "error" | "warning";

/** 校验规则类型，用于问题分类与统计 */
export type IssueKind =
  | "qualification" // 班组资质不符
  | "double-book" // 同一班组被多道工序在同一时段重复占用
  | "external-occupancy" // 班组在其他项目被占用（跨项目占用）
  | "dependency-cycle" // 工序依赖成环（倒置的极端形态）
  | "dependency-order" // 工序倒置：后序被排在前序完成之前
  | "budget"; // 超出预算上限

export interface Building {
  id: string;
  name: string;
  dynasty: string;
  location: string;
}

/** 病害构件（跨建筑选取的最小单位） */
export interface DefectComponent {
  id: string; // bdg_rot / fgs_crack …
  buildingId: string;
  code: string; // 构件编号
  name: string; // 部位名称
  timber: string; // 木材种类
  disease: "糟朽" | "开裂" | "变形" | "虫蛀";
  diseaseDesc: string;
  /** 修缮工序链模板 id */
  procedure: string;
}

/** 工序模板定义（修缮工艺知识库） */
export interface ProcedureStepTemplate {
  /** 同一工序链内唯一的短码，用作任务 id 后缀 */
  code: string;
  name: string;
  craft: Craft;
  duration: number; // 工期（天）
  cost: number; // 直接费用（元）
  /** 必须先完成的工序 code 列表（工序依赖） */
  dependsOn: string[];
}

export interface ProcedureTemplate {
  id: string;
  name: string;
  steps: ProcedureStepTemplate[];
}

/** 班组在其他项目的占用区间（跨项目占用，不可排入） */
export interface Occupancy {
  project: string;
  /** 占用起、止日（含端点，按整日计，[start, end] 闭区间） */
  start: number;
  end: number;
}

export interface Crew {
  id: string;
  name: string;
  crafts: Craft[]; // 所持资质
  size: number; // 班组人数
  occupancies: Occupancy[];
}

/** 排程后的一道修缮工序实例 */
export interface Task {
  id: string; // `${componentId}_${stepCode}`
  componentId: string;
  buildingId: string;
  stepCode: string;
  name: string;
  craft: Craft;
  duration: number;
  cost: number;
  dependsOn: string[]; // 依赖的其他任务 id
  start: number | null; // 相对开工日；null 表示尚未排上
  crewId: string | null;
}

export interface Issue {
  id: string;
  kind: IssueKind;
  severity: Severity;
  taskId?: string; // 冲突定位到的具体工序
  relatedTaskId?: string;
  message: string;
}

/** 预算口径 */
export interface Budget {
  cap: number; // 预算上限（元）
  overheadRate: number; // 综合管理费率（作用于直接费之和）
}

/** 已提交方案（不可变，每次确认产生一个版本） */
export interface Plan {
  id: string;
  name: string;
  version: number; // 乐观锁版本号
  componentIds: string[];
  tasks: Task[];
  budget: Budget;
  updatedBy: string;
  updatedAt: number; // epoch ms
  note?: string;
}

export interface VersionSnapshot {
  version: number;
  planId: string;
  name: string;
  committedBy: string;
  committedAt: number;
  note: string;
  taskCount: number;
  totalCost: number;
  errorCount: number;
}

/** 待提交区中的单道工序调整 */
export interface TaskPatch {
  start: number | null;
  crewId: string | null;
}

/** 一次编辑会话 = 待提交区 */
export interface EditSession {
  user: string;
  /** 进入编辑时所基于的方案版本 */
  baseVersion: number;
  taskPatches: Record<string, TaskPatch>;
  budgetCap?: number;
  startedAt: number;
}

/** 版本冲突时为个人保留的草稿 */
export interface Draft {
  id: string;
  user: string;
  planId: string;
  baseVersion: number;
  createdAt: number;
  taskPatches: Record<string, TaskPatch>;
  budgetCap?: number;
  label: string;
}

/** 工作区视图 = 方案（已提交版本）叠加待提交区后的计算结果 */
export interface WorkingView {
  planId: string;
  name: string;
  version: number;
  componentIds: string[];
  tasks: Task[];
  budget: Budget;
  tasksById: Record<string, Task>;
  directCost: number;
  overhead: number;
  totalCost: number;
  issues: Issue[];
  errorCount: number;
  warningCount: number;
  changedTaskIds: string[];
  hasPatch: boolean;
}

/** 提交结果 */
export type CommitOutcome =
  | { type: "committed"; plan: Plan; snapshot: VersionSnapshot }
  | { type: "invalid"; issues: Issue[] }
  | { type: "conflict"; currentVersion: number; baseVersion: number; draft: Draft };
