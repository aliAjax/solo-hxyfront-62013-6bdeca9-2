import { buildTasks, scheduleTasks } from "../domain/scheduler";
import { validate } from "../domain/validator";
import type {
  Crew,
  Building,
  DefectComponent,
  Issue,
  Task,
} from "../domain/types";
import type { SchedulerPort, ValidatorPort } from "./ports";

/** 排程端口的贪心算法适配器（包装 domain/scheduler） */
export class GreedyScheduler implements SchedulerPort {
  buildTasks(
    components: DefectComponent[],
    procedures: import("../domain/types").ProcedureTemplate[]
  ): Task[] {
    return buildTasks(components, procedures);
  }

  autoSchedule(tasks: Task[], crews: Crew[]): Task[] {
    return scheduleTasks(tasks, crews);
  }
}

/** 校验端口的规则引擎适配器（包装 domain/validator），标签在构造时固定 */
export class RuleValidator implements ValidatorPort {
  constructor(
    private readonly crews: Crew[],
    private readonly buildings: Building[],
    private readonly components: DefectComponent[]
  ) {}

  validate(
    tasks: Task[],
    budgetCap: number,
    overheadRate: number
  ): Issue[] {
    const buildingMap = new Map(this.buildings.map((b) => [b.id, b]));
    const componentMap = new Map(this.components.map((c) => [c.id, c]));
    const labels: Record<string, string> = {};
    for (const t of tasks) {
      const comp = componentMap.get(t.componentId);
      const bld = buildingMap.get(t.buildingId);
      labels[t.id] = `${bld?.name ?? ""} / ${comp?.name ?? t.componentId} / ${t.name}`;
    }
    return validate({
      tasks,
      budget: { cap: budgetCap, overheadRate },
      crews: this.crews,
      labels,
    });
  }
}
