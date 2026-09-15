import type {
  CommitOutcome,
  Crew,
  DefectComponent,
  Draft,
  EditSession,
  Plan,
  ProcedureTemplate,
  Task,
  VersionSnapshot,
  WorkingView,
} from "../domain/types";

/**
 * 依赖倒置（DIP）：
 * 应用服务只依赖下面的"端口"（抽象），不依赖任何具体实现：
 *  - SchedulerPort   —— 排程算法（可替换为人工排程 / 网络排程服务）
 *  - ValidatorPort   —— 规则校验（可替换为规则引擎）
 *  - PlanRepositoryPort —— 方案与草稿存储（可替换为远程 API）
 * 具体适配器（domain/engine、infra/localRepository）实现这些接口，
 * 由组合根 main.tsx 注入，实现"高层策略不依赖低层细节，二者都依赖抽象"。
 */

export interface SchedulerPort {
  buildTasks(
    components: DefectComponent[],
    procedures: ProcedureTemplate[]
  ): Task[];
  autoSchedule(tasks: Task[], crews: Crew[]): Task[];
}

export interface ValidatorPort {
  validate(
    tasks: Task[],
    budgetCap: number,
    overheadRate: number
  ): WorkingView["issues"];
}

export interface PlanRepositoryPort {
  load(): Plan | null;
  save(plan: Plan): void;
  listVersions(planId: string): VersionSnapshot[];
  appendVersion(snapshot: VersionSnapshot): void;
  /** 仅返回指定用户的个人草稿 */
  listDrafts(user: string): Draft[];
  saveDraft(draft: Draft): void;
  /** 删除草稿需校验归属：非创建人无法删除他人草稿 */
  deleteDraft(id: string, user: string): void;
  /** 清空全部本地数据（演示重置用） */
  reset(): void;
}

export interface ScheduleServicePort {
  getPlan(): Plan | null;
  createPlan(componentIds: string[], budgetCap: number, user: string): Plan;
  getWorkingView(user: string): WorkingView | null;
  getSession(user: string): EditSession | null;
  autoSchedule(user: string): void;
  patchTask(user: string, taskId: string, patch: Partial<{ start: number | null; crewId: string | null }>): void;
  undoChange(user: string, taskId: string): void;
  patchBudget(user: string, cap: number): void;
  discardSession(user: string): void;
  commit(user: string, note: string): CommitOutcome;
  /** 仅返回当前用户自己的草稿 */
  listDrafts(user: string): Draft[];
  /** 仅当草稿归属当前用户时才能套用 */
  applyDraft(draftId: string, user: string): boolean;
  /** 仅当草稿归属当前用户时才能删除 */
  deleteDraft(id: string, user: string): void;
  listVersions(): VersionSnapshot[];
  /** 模拟"他人"在远程提交了一个新版本（用于并发冲突演示） */
  simulateRemoteCommit(remoteUser: string): Plan | null;
  getCrews(): Crew[];
  reset(): void;
}
