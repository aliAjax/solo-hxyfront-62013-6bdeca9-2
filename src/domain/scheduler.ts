import type { Crew, DefectComponent, ProcedureTemplate, Task } from "./types";
import { overlaps } from "./date";

/** 依据病害构件与工序模板，实例化出全部工序任务（尚未排定时间） */
export function buildTasks(
  components: DefectComponent[],
  procedures: ProcedureTemplate[]
): Task[] {
  const procMap = new Map(procedures.map((p) => [p.id, p]));
  const tasks: Task[] = [];
  for (const c of components) {
    const proc = procMap.get(c.procedure);
    if (!proc) continue;
    for (const step of proc.steps) {
      tasks.push({
        id: `${c.id}_${step.code}`,
        componentId: c.id,
        buildingId: c.buildingId,
        stepCode: step.code,
        name: step.name,
        craft: step.craft,
        duration: step.duration,
        cost: step.cost,
        dependsOn: step.dependsOn.map((d) => `${c.id}_${d}`),
        start: null,
        crewId: null,
      });
    }
  }
  return tasks;
}

interface Placement {
  crewId: string;
  start: number;
}

function crewBlocked(
  crew: Crew,
  start: number,
  duration: number,
  assigned: Map<string, Array<{ start: number; end: number }>>
): boolean {
  const end = start + duration - 1;
  // 跨项目占用
  for (const occ of crew.occupancies) {
    if (overlaps(start, end, occ.start, occ.end)) return true;
  }
  // 本方案内已分配工序
  for (const seg of assigned.get(crew.id) ?? []) {
    if (overlaps(start, end, seg.start, seg.end)) return true;
  }
  return false;
}

/**
 * 贪心自动排程：
 * 1) 按工序依赖做拓扑排序（跨构件的工序链之间允许交错）；
 * 2) 每道工序在其全部前序完成之后，寻找"有资质且最早空闲"的班组；
 *    班组空闲需同时避开其跨项目占用区间与本方案内已占用区间；
 * 3) 若不存在任何具备资质的班组，任务保留 start=null/crewId=null，交由校验器报错。
 */
export function scheduleTasks(tasks: Task[], crews: Crew[]): Task[] {
  const result = new Map<string, Task>();
  const assigned = new Map<string, Array<{ start: number; end: number }>>();
  const componentOrder = new Map<string, number>();
  tasks.forEach((t, i) => {
    if (!componentOrder.has(t.componentId)) {
      componentOrder.set(t.componentId, componentOrder.size);
    }
    void i;
  });

  const remaining = new Set(tasks.map((t) => t.id));
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  while (remaining.size > 0) {
    // 全部前序已排定的候选工序
    const ready: Task[] = [];
    for (const id of remaining) {
      const t = taskMap.get(id)!;
      if (t.dependsOn.every((d) => !remaining.has(d))) ready.push(t);
    }
    if (ready.length === 0) {
      // 依赖成环：剩余任务无法自动排定，保留未排定状态（校验器定位成环）
      for (const id of remaining) {
        const t = taskMap.get(id)!;
        result.set(id, { ...t });
      }
      break;
    }

    // 交错策略：前序最早完成者优先，其次按构件选取顺序、工序定义顺序
    ready.sort((a, b) => {
      const ea = earliestReady(a, result);
      const eb = earliestReady(b, result);
      if (ea !== eb) return ea - eb;
      const ca = componentOrder.get(a.componentId)!;
      const cb = componentOrder.get(b.componentId)!;
      if (ca !== cb) return ca - cb;
      return a.stepCode < b.stepCode ? -1 : 1;
    });

    const t = ready[0];
    const minStart = earliestReady(t, result);
    const qualified = crews.filter((c) => c.crafts.includes(t.craft));

    let best: Placement | null = null;
    for (const crew of qualified) {
      let s = minStart;
      while (s < 500 && crewBlocked(crew, s, t.duration, assigned)) s += 1;
      if (s >= 500) continue;
      if (!best || s < best.start) best = { crewId: crew.id, start: s };
    }

    const placed: Task = {
      ...t,
      start: best ? best.start : null,
      crewId: best ? best.crewId : null,
    };
    result.set(t.id, placed);
    remaining.delete(t.id);
    if (best) {
      const list = assigned.get(best.crewId) ?? [];
      list.push({ start: best.start, end: best.start + t.duration - 1 });
      assigned.set(best.crewId, list);
    }
  }

  // 保持与输入一致的顺序返回
  return tasks.map((t) => result.get(t.id)!);
}

function earliestReady(
  t: Task,
  placed: Map<string, Task>
): number {
  let r = 0;
  for (const depId of t.dependsOn) {
    const dep = placed.get(depId);
    if (!dep || dep.start === null) continue;
    r = Math.max(r, dep.start + dep.duration);
  }
  return r;
}
