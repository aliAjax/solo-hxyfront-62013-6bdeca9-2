import { ALL_CREWS, BUILDINGS, COMPONENTS, PROCEDURES } from "../domain/seed";
import { LocalPlanRepository } from "../infra/localRepository";
import { GreedyScheduler, RuleValidator } from "./engineAdapter";
import { ScheduleService } from "./scheduleService";

/**
 * 组合根（Composition Root）：
 * 唯一一处知道"具体用哪个适配器"的地方。UI 只拿到 ScheduleServicePort，
 * 替换排程算法 / 校验规则 / 存储时只需改这里 —— 依赖倒置的装配点。
 */
const repository = new LocalPlanRepository();
const scheduler = new GreedyScheduler();
const validator = new RuleValidator(ALL_CREWS, BUILDINGS, COMPONENTS);

export const scheduleService = new ScheduleService(
  scheduler,
  validator,
  repository,
  ALL_CREWS,
  BUILDINGS,
  COMPONENTS,
  PROCEDURES
);

export { ALL_CREWS, BUILDINGS, COMPONENTS, PROCEDURES };
