import type {
  Draft,
  Issue,
  IssueKind,
  VersionSnapshot,
  WorkingView,
} from "../domain/types";
import { wan, yuan, fmtDay } from "../domain/date";

const KIND_LABEL: Record<IssueKind, string> = {
  qualification: "班组资质",
  "double-book": "资源重复占用",
  "external-occupancy": "跨项目占用",
  "dependency-cycle": "依赖成环",
  "dependency-order": "工序倒置/工期",
  budget: "预算上限",
};

export function IssuesPanel({
  view,
  focusTaskId,
  onFocus,
}: {
  view: WorkingView;
  focusTaskId: string | null;
  onFocus: (taskId: string) => void;
}) {
  const errors = view.issues.filter((i) => i.severity === "error");
  const warnings = view.issues.filter((i) => i.severity === "warning");
  return (
    <section className="panel side-panel">
      <div className="heading">
        <div>
          <p className="eyebrow">规则校验</p>
          <h2>冲突定位</h2>
        </div>
        <span className={`badge ${errors.length ? "bad" : warnings.length ? "warn" : "ok"}`}>
          {errors.length ? `${errors.length} 个阻断冲突` : warnings.length ? `${warnings.length} 个提醒` : "全部通过"}
        </span>
      </div>
      {view.issues.length === 0 && (
        <p className="empty-ok">✓ 资质、占用、依赖、工期与预算校验全部通过，可确认提交。</p>
      )}
      <ul className="issue-list">
        {[...errors, ...warnings].map((is) => (
          <IssueItem key={is.id} issue={is} focused={focusTaskId === is.taskId} onFocus={onFocus} />
        ))}
      </ul>
    </section>
  );
}

function IssueItem({
  issue,
  focused,
  onFocus,
}: {
  issue: Issue;
  focused: boolean;
  onFocus: (taskId: string) => void;
}) {
  return (
    <li className={`issue ${issue.severity}${focused ? " focused" : ""}`}>
      <div className="issue-head">
        <span className="issue-kind">{KIND_LABEL[issue.kind]}</span>
        {issue.taskId && (
          <button
            type="button"
            className="locate-btn"
            onClick={() => onFocus(issue.taskId!)}
          >
            {focused ? "● 已定位" : "定位到工序"}
          </button>
        )}
      </div>
      <p>{issue.message}</p>
    </li>
  );
}

export function BudgetPanel({
  view,
  onPatchCap,
}: {
  view: WorkingView;
  onPatchCap: (cap: number) => void;
}) {
  const ratio = Math.min(1.4, view.totalCost / view.budget.cap);
  const over = view.totalCost > view.budget.cap;
  return (
    <section className="panel side-panel">
      <div className="heading">
        <div>
          <p className="eyebrow">预算测算</p>
          <h2>预算上限</h2>
        </div>
        <span className={`badge ${over ? "bad" : "ok"}`}>
          {over ? "超预算" : "预算内"}
        </span>
      </div>
      <div className="budget-rows">
        <div><span>直接费</span><b>{yuan(view.directCost)}</b></div>
        <div><span>综合管理费（{Math.round(view.budget.overheadRate * 100)}%）</span><b>{yuan(view.overhead)}</b></div>
        <div className={over ? "over" : ""}><span>测算总额</span><b>{yuan(view.totalCost)}（{wan(view.totalCost)}）</b></div>
      </div>
      <div className="budget-bar">
        <div
          className={`budget-fill ${over ? "over" : ""}`}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
        <div className="budget-cap-mark" style={{ left: "100%" }} />
      </div>
      <label className="cap-edit">
        调整预算上限
        <input
          type="number"
          step={10000}
          value={view.budget.cap}
          onChange={(e) => onPatchCap(Number(e.target.value))}
        />
        元（调整先进入待提交区）
      </label>
    </section>
  );
}

export function PendingPanel({
  view,
  baseVersion,
  crewName,
  baselineCap,
  hintDiscard,
  onAuto,
  onUndo,
  onDiscard,
  onCommit,
}: {
  view: WorkingView;
  baseVersion: number;
  crewName: (crewId: string | null) => string;
  baselineCap: number;
  hintDiscard?: boolean;
  onAuto: () => void;
  onUndo: (taskId: string) => void;
  onDiscard: () => void;
  onCommit: () => void;
}) {
  return (
    <section className={`panel side-panel pending${hintDiscard ? " hint-discard" : ""}`}>
      <div className="heading">
        <div>
          <p className="eyebrow">待提交区</p>
          <h2>未确认的调整</h2>
        </div>
        <span className="muted">基于 v{baseVersion}</span>
      </div>

      <div className="pending-actions">
        <button type="button" className="ghost" onClick={onAuto}>
          ⟳ 自动排程（全部工序）
        </button>
      </div>

      {!view.hasPatch && (
        <p className="empty-soft">
          暂无需提交的调整。在甘特图中直接修改开工日或班组，或点击自动排程，调整会先汇集到这里，
          确认无误后整体提交为新版本；也可以整体放弃。
        </p>
      )}

      <ul className="pending-list">
        {view.changedTaskIds.map((id) => {
          const task = view.tasksById[id];
          return (
            <li key={id}>
              <div>
                <b>{task.name}</b>
                <small>
                  {fmtDay(task.start)} 开工 · {crewName(task.crewId)}
                </small>
              </div>
              <button type="button" className="mini" onClick={() => onUndo(id)}>
                撤销此项
              </button>
            </li>
          );
        })}
        {view.budget.cap !== baselineCap && (
          <li className="budget-change">
            <div>
              <b>预算上限调整</b>
              <small>
                {yuan(baselineCap)} → <em className="red">{yuan(view.budget.cap)}</em>
              </small>
            </div>
          </li>
        )}
      </ul>

      <div className="pending-foot">
        <button
          type="button"
          className="danger ghost"
          onClick={onDiscard}
          disabled={!view.hasPatch}
        >
          整体放弃
        </button>
        <button
          type="button"
          className="primary"
          onClick={onCommit}
          disabled={!view.hasPatch}
        >
          确认提交（产生 v{baseVersion + 1}）
        </button>
      </div>
      {view.hasPatch && (
        <p className="pending-note">
          {view.errorCount > 0
            ? `存在 ${view.errorCount} 个阻断冲突，需消解后才能提交。`
            : "调整尚未生效，仅存在于你的待提交区；放弃不会影响当前版本。"}
        </p>
      )}
    </section>
  );
}

export function VersionsCard({ versions }: { versions: VersionSnapshot[] }) {
  return (
    <section className="panel side-panel">
      <div className="heading">
        <div>
          <p className="eyebrow">排程版本</p>
          <h2>版本历史</h2>
        </div>
        <span className="muted">{versions.length} 个版本</span>
      </div>
      <ul className="version-list">
        {[...versions].reverse().map((v) => (
          <li key={v.version} className={v.version === versions[versions.length - 1].version ? "latest" : ""}>
            <b>v{v.version}</b>
            <div>
              <span>{v.note}</span>
              <small>
                {v.committedBy} · {new Date(v.committedAt).toLocaleString("zh-CN", { hour12: false })}
              </small>
              <small className="muted">
                {v.taskCount} 道工序 · 总额 {yuan(v.totalCost)}
                {v.errorCount > 0 && <em className="red"> · 提交时含 {v.errorCount} 冲突</em>}
              </small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DraftsCard({
  drafts,
  onApply,
  onDelete,
}: {
  drafts: Draft[];
  onApply: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="panel side-panel">
      <div className="heading">
        <div>
          <p className="eyebrow">个人草稿</p>
          <h2>版本冲突保留的调整</h2>
        </div>
        <span className="muted">{drafts.length} 份</span>
      </div>
      {drafts.length === 0 && (
        <p className="empty-soft">
          并发提交发生版本冲突时，你的调整会自动保留为草稿，可在他人最新版本之上重新套用。
        </p>
      )}
      <ul className="draft-list">
        {drafts.map((d) => (
          <li key={d.id}>
            <div>
              <b>{d.label}</b>
              <small>
                {d.user} · 基于 v{d.baseVersion} · {Object.keys(d.taskPatches).length} 处工序调整
                {d.budgetCap !== undefined ? " · 含预算调整" : ""}
              </small>
            </div>
            <span className="draft-actions">
              <button type="button" className="mini primary" onClick={() => onApply(d.id)}>
                套用到最新版
              </button>
              <button type="button" className="mini" onClick={() => onDelete(d.id)}>
                删除
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
