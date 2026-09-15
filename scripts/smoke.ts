// 服务层冒烟测试（不经过 UI）：验证五类校验、待提交区放弃与并发冲突。
// 用 esbuild 打包后在 node 中运行：
//   ./node_modules/.bin/esbuild scripts/smoke.ts --bundle --platform=node --format=cjs | node
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
};

import { scheduleService } from "../src/application/container";
import { DEFAULT_CAP } from "../src/application/scheduleService";
import { DEFAULT_COMPONENT_IDS, runScenario } from "../src/ui/scenarios";

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    console.error(`  ✗ ${msg}`);
    failures++;
  }
};

const U = "张工（木作负责人）";
const fresh = () => {
  scheduleService.reset();
  scheduleService.createPlan(DEFAULT_COMPONENT_IDS, DEFAULT_CAP, U);
};

console.log("0) 生成方案 + 自动排程：无阻断冲突");
{
  fresh();
  const v = scheduleService.getWorkingView(U)!;
  assert(v.errorCount === 0, `自动排程 0 阻断（实际 ${v.errorCount}：${v.issues.map((i) => i.message).join(" / ")}）`);
  assert(v.tasks.every((t) => t.start !== null && t.crewId !== null), "全部工序已排定时间与班组");
  assert(v.totalCost <= DEFAULT_CAP, "测算总额在默认预算内");
}

console.log("1) 依赖倒置");
{
  const r = runScenario("inversion", { service: scheduleService, user: U });
  const v = scheduleService.getWorkingView(U)!;
  assert(v.issues.some((i) => i.kind === "dependency-order" && i.taskId === "ncs_pest_paint"), "油饰工序被定位为工序倒置");
  const out = scheduleService.commit(U, "test");
  assert(out.type === "invalid", "存在倒置冲突时提交被阻止");
  void r;
}

console.log("2) 资源重复占用");
{
  runScenario("double-book", { service: scheduleService, user: U });
  const v = scheduleService.getWorkingView(U)!;
  const dbl = v.issues.filter((i) => i.kind === "double-book");
  assert(dbl.length >= 1, `检出资源重复占用（${dbl.length} 条）`);
  assert(dbl.every((i) => i.taskId && i.relatedTaskId), "冲突同时定位到两道工序");
}

console.log("3) 超预算");
{
  runScenario("over-budget", { service: scheduleService, user: U });
  const v = scheduleService.getWorkingView(U)!;
  assert(v.issues.some((i) => i.kind === "budget"), "检出超出预算上限");
  // 压回预算后应可提交
  scheduleService.patchBudget(U, 500000);
  const out = scheduleService.commit(U, "追加预算");
  assert(out.type === "committed", "预算调整后可成功提交并产生新版本");
}

console.log("4) 放弃调整");
{
  runScenario("discard", { service: scheduleService, user: U });
  const before = scheduleService.getPlan()!.version;
  assert(scheduleService.getWorkingView(U)!.hasPatch, "调整已进入待提交区");
  scheduleService.discardSession(U);
  const v = scheduleService.getWorkingView(U)!;
  assert(!v.hasPatch && scheduleService.getPlan()!.version === before, "放弃后无残留调整、版本不变");
}

console.log("5) 并发版本冲突 + 个人草稿");
{
  runScenario("concurrency", { service: scheduleService, user: U });
  const out = scheduleService.commit(U, "我的油饰工序微调");
  assert(out.type === "conflict", "基于过期版本提交 -> 版本冲突");
  if (out.type === "conflict") {
    assert(out.baseVersion < out.currentVersion, "返回的版本号显示他人已提交新版");
    const drafts = scheduleService.listDrafts();
    assert(drafts.length === 1 && drafts[0].user === U, "个人调整已保留为草稿");
    const ok = scheduleService.applyDraft(drafts[0].id, U);
    assert(ok, "草稿可重放到最新版本");
    const v = scheduleService.getWorkingView(U)!;
    assert(v.hasPatch, "重放后调整重新出现在待提交区");
    assert(scheduleService.getSession(U)?.baseVersion === out.currentVersion, "待提交区基线已更新为最新版本");
  }
}

console.log("6) 跨项目占用（手排到外部占用窗口）");
{
  fresh();
  // wood1 第 0-4 天在崇福寺施工
  scheduleService.patchTask(U, "yxmt_deform_survey", { start: 0, crewId: "wood1" });
  const v = scheduleService.getWorkingView(U)!;
  assert(v.issues.some((i) => i.kind === "external-occupancy" && i.taskId === "yxmt_deform_survey"), "检出跨项目占用并定位工序");
}

console.log("7) 班组资质");
{
  fresh();
  scheduleService.patchTask(U, "ncs_pest_fumigate", { crewId: "paint1" });
  const v = scheduleService.getWorkingView(U)!;
  assert(v.issues.some((i) => i.kind === "qualification" && i.taskId === "ncs_pest_fumigate"), "无资质班组被检出");
}

console.log(failures === 0 ? "\n全部通过 ✅" : `\n${failures} 项失败 ❌`);
process.exit(failures === 0 ? 0 : 1);
