import type {
  Building,
  CommitOutcome,
  Crew,
  DefectComponent,
  Draft,
  EditSession,
  Plan,
  ProcedureTemplate,
  Task,
  TaskPatch,
  VersionSnapshot,
  WorkingView,
} from "../domain/types";
import type {
  PlanRepositoryPort,
  ScheduleServicePort,
  SchedulerPort,
  ValidatorPort,
} from "./ports";

export const OVERHEAD_RATE = 0.15; // 综合管理费率 15%
export const DEFAULT_CAP = 180000; // 默认预算上限（元）

/**
 * 跨建筑修缮排程应用服务。
 * 只依赖端口抽象，不直接依赖调度/校验/存储的具体实现（DIP）。
 */
export class ScheduleService implements ScheduleServicePort {
  /** 内存中的编辑会话（待提交区），按用户隔离；草稿用于跨刷新保留 */
  private sessions = new Map<string, EditSession>();

  constructor(
    private readonly scheduler: SchedulerPort,
    private readonly validator: ValidatorPort,
    private readonly repo: PlanRepositoryPort,
    private readonly crewsData: Crew[],
    private readonly buildings: Building[],
    private readonly components: DefectComponent[],
    private readonly procedures: ProcedureTemplate[]
  ) {}

  getCrews(): Crew[] {
    return this.crewsData;
  }

  getPlan(): Plan | null {
    return this.repo.load();
  }

  // ---------- 生成修缮方案 ----------

  createPlan(componentIds: string[], budgetCap: number, user: string): Plan {
    const comps = this.components.filter((c) => componentIds.includes(c.id));
    let tasks = this.scheduler.buildTasks(comps, this.procedures);
    tasks = this.scheduler.autoSchedule(tasks, this.crewsData);

    const now = Date.now();
    const plan: Plan = {
      id: `plan_${now.toString(36)}`,
      name: `跨建筑联合修缮方案（${comps.length} 个病害构件）`,
      version: 1,
      componentIds: [...componentIds],
      tasks,
      budget: { cap: budgetCap, overheadRate: OVERHEAD_RATE },
      updatedBy: user,
      updatedAt: now,
      note: "生成方案并自动排程",
    };
    this.repo.save(plan);

    const view = this.computeView(plan, null);
    this.repo.appendVersion(this.snapshot(plan, view, user, "生成方案并自动排程", now));

    // 新方案生成，清掉所有人此前的待提交区（草稿仍保留，可手动重放）
    this.sessions.clear();
    return plan;
  }

  // ---------- 工作区（方案 + 待提交区） ----------

  getSession(user: string): EditSession | null {
    return this.sessions.get(user) ?? null;
  }

  getWorkingView(user: string): WorkingView | null {
    const plan = this.repo.load();
    if (!plan) return null;
    return this.computeView(plan, this.sessions.get(user) ?? null);
  }

  private computeView(plan: Plan, session: EditSession | null): WorkingView {
    const changedTaskIds: string[] = [];
    const tasks: Task[] = plan.tasks.map((t) => {
      const p = session?.taskPatches[t.id];
      if (!p) return { ...t };
      changedTaskIds.push(t.id);
      return { ...t, start: p.start, crewId: p.crewId };
    });

    const cap = session?.budgetCap ?? plan.budget.cap;
    const issues = this.validator.validate(tasks, cap, plan.budget.overheadRate);
    const directCost = tasks.reduce((s, t) => s + t.cost, 0);
    const overhead = directCost * plan.budget.overheadRate;
    const totalCost = directCost + overhead;
    const hasPatch =
      changedTaskIds.length > 0 ||
      (session?.budgetCap !== undefined && session.budgetCap !== plan.budget.cap);

    return {
      planId: plan.id,
      name: plan.name,
      version: plan.version,
      componentIds: [...plan.componentIds],
      tasks,
      tasksById: Object.fromEntries(tasks.map((t) => [t.id, t])),
      budget: { cap, overheadRate: plan.budget.overheadRate },
      directCost,
      overhead,
      totalCost,
      issues,
      errorCount: issues.filter((i) => i.severity === "error").length,
      warningCount: issues.filter((i) => i.severity === "warning").length,
      changedTaskIds,
      hasPatch,
    };
  }

  private ensureSession(user: string): EditSession {
    const plan = this.repo.load();
    let s = this.sessions.get(user);
    if (!s) {
      s = {
        user,
        baseVersion: plan?.version ?? 1,
        taskPatches: {},
        startedAt: Date.now(),
      };
      this.sessions.set(user, s);
    }
    return s;
  }

  // ---------- 待提交区操作 ----------

  autoSchedule(user: string): void {
    const plan = this.repo.load();
    if (!plan) return;
    const rescheduled = this.scheduler.autoSchedule(
      plan.tasks.map((t) => ({ ...t })),
      this.crewsData
    );
    const session = this.ensureSession(user);
    for (const t of rescheduled) {
      const base = plan.tasks.find((x) => x.id === t.id)!;
      if (base.start !== t.start || base.crewId !== t.crewId) {
        session.taskPatches[t.id] = { start: t.start, crewId: t.crewId };
      } else {
        delete session.taskPatches[t.id];
      }
    }
    if (session.budgetCap === plan.budget.cap) delete session.budgetCap;
  }

  patchTask(
    user: string,
    taskId: string,
    patch: Partial<{ start: number | null; crewId: string | null }>
  ): void {
    const plan = this.repo.load();
    if (!plan) return;
    const base = plan.tasks.find((t) => t.id === taskId);
    if (!base) return;
    const session = this.ensureSession(user);
    const prev: TaskPatch = session.taskPatches[taskId] ?? {
      start: base.start,
      crewId: base.crewId,
    };
    const next: TaskPatch = { ...prev, ...patch };
    // 与已提交版本一致即视为"无改动"，撤销该项
    if (next.start === base.start && next.crewId === base.crewId) {
      delete session.taskPatches[taskId];
    } else {
      session.taskPatches[taskId] = next;
    }
  }

  undoChange(user: string, taskId: string): void {
    delete this.sessions.get(user)?.taskPatches[taskId];
  }

  patchBudget(user: string, cap: number): void {
    const plan = this.repo.load();
    if (!plan) return;
    const session = this.ensureSession(user);
    if (cap === plan.budget.cap) delete session.budgetCap;
    else session.budgetCap = cap;
  }

  discardSession(user: string): void {
    this.sessions.delete(user);
  }

  // ---------- 提交：先查版本冲突，再查规则冲突，通过后产生版本 ----------

  commit(user: string, note: string): CommitOutcome {
    const plan = this.repo.load();
    const session = this.sessions.get(user);
    if (!plan || !session) {
      const v = this.getWorkingView(user);
      return {
        type: "invalid",
        issues: v?.issues ?? [{
          id: "empty-session",
          kind: "qualification",
          severity: "warning",
          message: "待提交区为空，没有可确认的调整",
        }],
      };
    }

    // 乐观锁：进入编辑后，方案已被他人提交为更新版本
    if (session.baseVersion !== plan.version) {
      const draft: Draft = {
        id: `draft_${Date.now().toString(36)}_${user.slice(0, 1)}`,
        user,
        planId: plan.id,
        baseVersion: session.baseVersion,
        createdAt: Date.now(),
        taskPatches: structuredClone(session.taskPatches),
        budgetCap: session.budgetCap,
        label: note || "未命名调整",
      };
      this.repo.saveDraft(draft);
      this.sessions.delete(user);
      return {
        type: "conflict",
        currentVersion: plan.version,
        baseVersion: session.baseVersion,
        draft,
      };
    }

    const view = this.computeView(plan, session);
    if (view.errorCount > 0) {
      return { type: "invalid", issues: view.issues };
    }

    const now = Date.now();
    const next: Plan = {
      ...plan,
      version: plan.version + 1,
      tasks: view.tasks.map((t) => ({ ...t })),
      budget: { ...plan.budget, cap: view.budget.cap },
      updatedBy: user,
      updatedAt: now,
      note: note || "手工调整排程",
    };
    this.repo.save(next);
    const snapshot: VersionSnapshot = {
      version: next.version,
      planId: next.id,
      name: next.name,
      committedBy: user,
      committedAt: now,
      note: note || "手工调整排程",
      taskCount: next.tasks.length,
      totalCost: view.totalCost,
      errorCount: view.errorCount,
    };
    this.repo.appendVersion(snapshot);
    this.sessions.delete(user);
    return { type: "committed", plan: next, snapshot };
  }

  private snapshot(
    plan: Plan,
    view: WorkingView,
    user: string,
    note: string,
    at: number
  ): VersionSnapshot {
    return {
      version: plan.version,
      planId: plan.id,
      name: plan.name,
      committedBy: user,
      committedAt: at,
      note,
      taskCount: plan.tasks.length,
      totalCost: view.totalCost,
      errorCount: view.errorCount,
    };
  }

  // ---------- 版本与草稿 ----------

  listVersions(): VersionSnapshot[] {
    const plan = this.repo.load();
    return plan ? this.repo.listVersions(plan.id) : [];
  }

  listDrafts(): Draft[] {
    return this.repo.listDrafts();
  }

  deleteDraft(id: string): void {
    this.repo.deleteDraft(id);
  }

  /** 把个人草稿重放到当前最新版本之上（保留个人调整，基线更新到最新） */
  applyDraft(draftId: string, user: string): boolean {
    const plan = this.repo.load();
    const draft = this.repo.listDrafts().find((d) => d.id === draftId);
    if (!plan || !draft || draft.planId !== plan.id) return false;
    // 草稿中涉及的工序若在最新版本中已不存在，则丢弃该部分
    const taskIds = new Set(plan.tasks.map((t) => t.id));
    const taskPatches: Record<string, TaskPatch> = {};
    for (const [id, p] of Object.entries(draft.taskPatches)) {
      if (taskIds.has(id)) taskPatches[id] = { ...p };
    }
    this.sessions.set(user, {
      user,
      baseVersion: plan.version,
      taskPatches,
      budgetCap:
        draft.budgetCap !== undefined ? draft.budgetCap : undefined,
      startedAt: Date.now(),
    });
    this.repo.deleteDraft(draftId);
    return true;
  }

  /** 模拟另一用户在远程提交新版本（确定性调整：寻找可安全前移的工序并提前） */
  simulateRemoteCommit(remoteUser: string): Plan | null {
    const plan = this.repo.load();
    if (!plan) return null;

    const tasks = plan.tasks.map((t) => ({ ...t }));
    let remoteNote = "远程协同调整";

    // 寻找一次真实且合法的远程调整：
    //  1) 优先把工序安全前移（允许改派到其他有资质班组）；
    //  2) 否则把一个"叶子工序"（无后续工序依赖它）在原班组顺延 1 天。
    type Candidate = { task: Task; newStart: number; newCrewId: string; advance: number };
    const isLeaf = (t: Task) => !tasks.some((x) => x.dependsOn.includes(t.id));
    const crewFreeAt = (crewId: string, start: number, duration: number, selfId: string) => {
      const crew = this.crewsData.find((c) => c.id === crewId);
      if (!crew) return false;
      const end = start + duration - 1;
      return (
        !crew.occupancies.some((o) => o.start <= end && start <= o.end) &&
        !tasks.some(
          (x) =>
            x.id !== selfId &&
            x.crewId === crewId &&
            x.start !== null &&
            x.start <= end &&
            start <= x.start + x.duration - 1
        )
      );
    };
    const earliestReady = (t: Task) =>
      t.dependsOn.reduce((m, d) => {
        const dep = tasks.find((x) => x.id === d);
        return dep && dep.start !== null ? Math.max(m, dep.start + dep.duration) : m;
      }, 0);

    let best: Candidate | null = null;
    let delay: Candidate | null = null;
    for (const target of tasks) {
      if (target.start === null || !target.crewId) continue;
      const minStart = earliestReady(target);
      for (const crew of this.crewsData) {
        if (!crew.crafts.includes(target.craft)) continue;
        if (minStart < target.start && crewFreeAt(crew.id, minStart, target.duration, target.id)) {
          if (!best || target.start - minStart > best.advance) {
            best = { task: target, newStart: minStart, newCrewId: crew.id, advance: target.start - minStart };
          }
        }
      }
      if (
        !delay &&
        isLeaf(target) &&
        crewFreeAt(target.crewId, target.start + 1, target.duration, target.id)
      ) {
        delay = { task: target, newStart: target.start + 1, newCrewId: target.crewId, advance: 0 };
      }
    }
    const chosen = best ?? delay;

    if (chosen) {
      const crewName = this.crewsData.find((c) => c.id === chosen!.newCrewId)?.name ?? "";
      const switched = chosen.newCrewId !== chosen.task.crewId;
      chosen.task.start = chosen.newStart;
      chosen.task.crewId = chosen.newCrewId;
      remoteNote = best
        ? switched
          ? `远程：将「${chosen.task.name}」改派${crewName}并提前至第 ${chosen.newStart + 1} 天开工`
          : `远程：将「${chosen.task.name}」提前至第 ${chosen.newStart + 1} 天开工`
        : `远程：将「${chosen.task.name}」顺延至第 ${chosen.newStart + 1} 天开工`;
    }

    const now = Date.now();
    const next: Plan = {
      ...plan,
      version: plan.version + 1,
      tasks,
      updatedBy: remoteUser,
      updatedAt: now,
      note: remoteNote,
    };
    this.repo.save(next);
    const view = this.computeView(next, null);
    this.repo.appendVersion(this.snapshot(next, view, remoteUser, remoteNote, now));
    return next;
  }

  reset(): void {
    this.sessions.clear();
    this.repo.reset();
  }
}
