import type { Plan, VersionSnapshot, Draft } from "../domain/types";
import type { PlanRepositoryPort } from "../application/ports";

const PLAN_KEY = "gujian.schedule.plan.v1";
const VERSIONS_KEY = "gujian.schedule.versions.v1";
const DRAFTS_KEY = "gujian.schedule.drafts.v1";

/** 本地运行的存储适配器：localStorage 持久化方案、版本历史与个人草稿 */
export class LocalPlanRepository implements PlanRepositoryPort {
  load(): Plan | null {
    try {
      const raw = localStorage.getItem(PLAN_KEY);
      return raw ? (JSON.parse(raw) as Plan) : null;
    } catch {
      return null;
    }
  }

  save(plan: Plan): void {
    localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  }

  listVersions(planId: string): VersionSnapshot[] {
    try {
      const all = JSON.parse(localStorage.getItem(VERSIONS_KEY) ?? "[]") as VersionSnapshot[];
      return all.filter((v) => v.planId === planId);
    } catch {
      return [];
    }
  }

  appendVersion(snapshot: VersionSnapshot): void {
    const all = JSON.parse(localStorage.getItem(VERSIONS_KEY) ?? "[]") as VersionSnapshot[];
    all.push(snapshot);
    localStorage.setItem(VERSIONS_KEY, JSON.stringify(all));
  }

  listDrafts(user: string): Draft[] {
    try {
      const all = JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? "[]") as Draft[];
      // 个人草稿只对创建人可见
      return all.filter((d) => d.user === user);
    } catch {
      return [];
    }
  }

  saveDraft(draft: Draft): void {
    const all = JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? "[]") as Draft[];
    const idx = all.findIndex((d) => d.id === draft.id);
    if (idx >= 0) all[idx] = draft;
    else all.push(draft);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(all));
  }

  deleteDraft(id: string, user: string): void {
    // 仅创建人本人可删除：先过滤归属，避免误删/越权清除他人草稿
    const all = JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? "[]") as Draft[];
    localStorage.setItem(
      DRAFTS_KEY,
      JSON.stringify(all.filter((d) => !(d.id === id && d.user === user)))
    );
  }

  reset(): void {
    localStorage.removeItem(PLAN_KEY);
    localStorage.removeItem(VERSIONS_KEY);
    localStorage.removeItem(DRAFTS_KEY);
  }
}
