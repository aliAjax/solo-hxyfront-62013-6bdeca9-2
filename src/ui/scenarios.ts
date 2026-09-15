import { DEFAULT_CAP } from "../application/scheduleService";
import type { ScheduleServicePort } from "../application/ports";
import type { WorkingView } from "../domain/types";

/** 演示默认选取：每栋建筑各一个病害构件（梁架糟朽 / 斗栱变形 / 柱虫蛀） */
export const DEFAULT_COMPONENT_IDS = ["fgs_rot", "yxmt_deform", "ncs_pest"];

export type ScenarioKey =
  | "inversion"
  | "double-book"
  | "over-budget"
  | "discard"
  | "concurrency";

export interface ScenarioResult {
  message: string;
  focusTaskId?: string;
  hintDiscard?: boolean;
  /** 场景布置完成后立即尝试提交（并发冲突场景用） */
  autoCommit?: boolean;
  commitNote?: string;
  remoteUser?: string;
}

interface Ctx {
  service: ScheduleServicePort;
  user: string;
}

/** 每个场景都重建为确定性的默认方案，保证可重复演示 */
function ensureFreshPlan(service: ScheduleServicePort, user: string): WorkingView {
  service.reset();
  service.createPlan(DEFAULT_COMPONENT_IDS, DEFAULT_CAP, user);
  return service.getWorkingView(user)!;
}

export function runScenario(key: ScenarioKey, ctx: Ctx): ScenarioResult {
  const { service, user } = ctx;

  switch (key) {
    case "inversion": {
      // 依赖倒置：把"油饰断白"强行提到第 1 天，早于前序"蛀损修补"完工
      ensureFreshPlan(service, user);
      service.patchTask(user, "ncs_pest_paint", { start: 0, crewId: "paint1" });
      return {
        message: "场景已布置：西内柱·油饰断白被提前到第 1 天，早于前序完工 —— 查看右侧「工序倒置」冲突。",
        focusTaskId: "ncs_pest_paint",
      };
    }

    case "double-book": {
      // 资源重复占用：两道木作工序在第 13 天同时占用二队·木作班
      ensureFreshPlan(service, user);
      service.patchTask(user, "yxmt_deform_repair", { start: 12, crewId: "wood2" });
      service.patchTask(user, "ncs_pest_repair", { start: 12, crewId: "wood2" });
      return {
        message: "场景已布置：斗栱修整与蛀损修补在第 13 天同时占用二队·木作班 —— 查看「资源重复占用」冲突。",
        focusTaskId: "yxmt_deform_repair",
      };
    }

    case "over-budget": {
      // 超预算：把预算上限压到 10 万
      ensureFreshPlan(service, user);
      service.patchBudget(user, 100000);
      return {
        message: "场景已布置：预算上限下调至 ¥100,000，测算总额超限 —— 查看「超出预算上限」冲突。",
      };
    }

    case "discard": {
      // 放弃调整：布置两处合规调整进入待提交区，引导整体放弃
      const view = ensureFreshPlan(service, user);
      const caihui = view.tasksById["fgs_rot_caihui"];
      if (caihui?.start !== null) {
        service.patchTask(user, "fgs_rot_caihui", { start: caihui.start! + 3 });
      }
      const paint = view.tasksById["ncs_pest_paint"];
      if (paint?.start !== null) {
        service.patchTask(user, "ncs_pest_paint", { start: paint.start! + 3 });
      }
      return {
        message: "两处调整已进入待提交区（尚未生效）。可逐项撤销，也可「整体放弃」恢复到已提交版本。",
        hintDiscard: true,
      };
    }

    case "concurrency": {
      // 并发冲突：本人有待提交调整时，另一管理员先提交了新版本
      const view = ensureFreshPlan(service, user);
      const repair = view.tasksById["yxmt_deform_repair"];
      if (repair?.start !== null) {
        service.patchTask(user, "yxmt_deform_repair", { start: repair.start! + 2 });
      }
      const remoteUser = "李工（项目管理员）";
      service.simulateRemoteCommit(remoteUser);
      return {
        message: `你持有未提交调整，${remoteUser} 已先一步提交 v${view.version + 1}。请尝试「确认提交」触发版本冲突 —— 个人调整会自动存为草稿。`,
        autoCommit: true,
        commitNote: "斗栱修整顺延两天",
        remoteUser,
      };
    }
  }
}

export const SCENARIO_LABELS: Record<ScenarioKey, string> = {
  inversion: "场景1 · 依赖倒置",
  "double-book": "场景2 · 资源重复占用",
  "over-budget": "场景3 · 超出预算",
  discard: "场景4 · 放弃调整",
  concurrency: "场景5 · 并发版本冲突",
};
