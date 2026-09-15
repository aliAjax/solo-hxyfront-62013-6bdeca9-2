import type { Budget, Crew, Issue, Task } from "./types";
import { overlaps } from "./date";

export interface ValidateInput {
  tasks: Task[];
  budget: Budget;
  crews: Crew[];
  /** 任务 id -> 可读定位标签，如 "佛光寺东大殿 / 四椽栿 / 墩接新材" */
  labels: Record<string, string>;
}

/** 找出依赖图中处于环上的任务（Tarjan 强连通分量：size>1 或自环） */
function findCyclicTasks(tasks: Task[]): Set<string> {
  const ids = tasks.map((t) => t.id);
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cyclic = new Set<string>();
  let counter = 0;

  const strongConnect = (v: string) => {
    index.set(v, counter);
    low.set(v, counter);
    counter += 1;
    stack.push(v);
    onStack.add(v);

    const vt = tasks.find((t) => t.id === v)!;
    for (const w of vt.dependsOn) {
      if (!tasks.some((t) => t.id === w)) continue;
      if (!index.has(w)) {
        strongConnect(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }

    if (low.get(v) === index.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      const selfLoop = comp.some((id) => {
        const t = tasks.find((x) => x.id === id)!;
        return t.dependsOn.includes(id);
      });
      if (comp.length > 1 || selfLoop) comp.forEach((id) => cyclic.add(id));
    }
  };

  for (const id of ids) if (!index.has(id)) strongConnect(id);
  return cyclic;
}

/**
 * 五类硬校验：班组资质 / 资源重复占用 / 跨项目占用 / 工序依赖（成环·倒置）/ 预算上限。
 * 每条问题尽量挂在具体工序（taskId）上，供界面在甘特图与问题清单中定位。
 */
export function validate(input: ValidateInput): Issue[] {
  const { tasks, budget, crews, labels } = input;
  const crewMap = new Map(crews.map((c) => [c.id, c]));
  const issues: Issue[] = [];
  const push = (i: Omit<Issue, "id">) => {
    const id = `${i.kind}:${i.taskId ?? "PLAN"}:${i.relatedTaskId ?? ""}:${i.message}`;
    if (!issues.some((x) => x.id === id)) issues.push({ id, ...i });
  };

  const cyclic = findCyclicTasks(tasks);
  for (const t of tasks) {
    if (cyclic.has(t.id)) {
      push({
        kind: "dependency-cycle",
        severity: "error",
        taskId: t.id,
        message: `工序依赖成环：「${labels[t.id] ?? t.name}」与其他工序互相前置，无法排定先后`,
      });
    }
  }

  for (const t of tasks) {
    const crew = t.crewId ? crewMap.get(t.crewId) : undefined;

    // 1) 班组资质（未指派班组同样阻断提交：新版本不得缺少必要班组）
    if (t.crewId && crew && !crew.crafts.includes(t.craft)) {
      push({
        kind: "qualification",
        severity: "error",
        taskId: t.id,
        message: `资质不符：「${crew.name}」无【${t.craft}】资质，不能承担「${labels[t.id] ?? t.name}」`,
      });
    }
    if (!t.crewId) {
      push({
        kind: "qualification",
        severity: "error",
        taskId: t.id,
        message:
          crews.some((c) => c.crafts.includes(t.craft))
            ? `「${labels[t.id] ?? t.name}」尚未指派班组，补齐班组后才能确认提交`
            : `无具备【${t.craft}】资质的班组可承担「${labels[t.id] ?? t.name}」`,
      });
    }

    // 未排定开工日同样阻断提交：每道工序都必须有明确工期
    if (t.start === null) {
      push({
        kind: "dependency-order",
        severity: "error",
        taskId: t.id,
        message: `「${labels[t.id] ?? t.name}」尚未排定工期，补齐开工日后才能确认提交`,
      });
      continue;
    }

    // 2) 跨项目占用
    if (crew) {
      const end = t.start + t.duration - 1;
      for (const occ of crew.occupancies) {
        if (overlaps(t.start, end, occ.start, occ.end)) {
          push({
            kind: "external-occupancy",
            severity: "error",
            taskId: t.id,
            message: `跨项目占用：「${crew.name}」第 ${t.start + 1}–${end + 1} 天在「${occ.project}」施工，与「${labels[t.id] ?? t.name}」冲突`,
          });
        }
      }
    }

    // 3) 工序倒置（后序早于前序完成）
    if (!cyclic.has(t.id)) {
      for (const depId of t.dependsOn) {
        const dep = tasks.find((x) => x.id === depId);
        if (!dep || dep.start === null) continue;
        const depEnd = dep.start + dep.duration; // 前序可交接日（不含当日）
        if (t.start < depEnd) {
          push({
            kind: "dependency-order",
            severity: "error",
            taskId: t.id,
            relatedTaskId: depId,
            message: `工序倒置：「${labels[t.id] ?? t.name}」第 ${t.start + 1} 天开工，早于前序「${labels[depId] ?? dep.name}」第 ${depEnd + 1} 天完工`,
          });
        }
      }
    }
  }

  // 4) 资源重复占用（同一班组、同一时段、两道工序）
  const assigned = tasks.filter((t) => t.crewId && t.start !== null);
  for (let i = 0; i < assigned.length; i++) {
    for (let j = i + 1; j < assigned.length; j++) {
      const a = assigned[i];
      const b = assigned[j];
      if (a.crewId !== b.crewId) continue;
      if (
        overlaps(
          a.start!,
          a.start! + a.duration - 1,
          b.start!,
          b.start! + b.duration - 1
        )
      ) {
        push({
          kind: "double-book",
          severity: "error",
          taskId: b.id,
          relatedTaskId: a.id,
          message: `资源重复占用：「${labels[b.id] ?? b.name}」与「${labels[a.id] ?? a.name}」在第 ${Math.max(a.start!, b.start!) + 1} 天同时占用「${crewMap.get(a.crewId!)!.name}」`,
        });
      }
    }
  }

  // 5) 预算上限（计划级问题，不挂工序）
  const directCost = tasks.reduce((s, t) => s + t.cost, 0);
  const totalCost = directCost * (1 + budget.overheadRate);
  if (totalCost > budget.cap) {
    push({
      kind: "budget",
      severity: "error",
      message: `超出预算上限：测算总额 ¥${Math.round(totalCost).toLocaleString("zh-CN")}（含 ${Math.round(budget.overheadRate * 100)}% 综合管理费），超过上限 ¥${budget.cap.toLocaleString("zh-CN")}，缺口 ¥${Math.round(totalCost - budget.cap).toLocaleString("zh-CN")}`,
    });
  }

  return issues;
}
