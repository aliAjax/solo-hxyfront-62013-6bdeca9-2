import { useMemo, useState } from "react";
import {
  scheduleService,
  ALL_CREWS,
  COMPONENTS,
  BUILDINGS,
} from "./application/container";
import type { CommitOutcome, Draft, Plan, WorkingView } from "./domain/types";
import { USERS } from "./domain/seed";
import { CreatePlan } from "./ui/CreatePlan";
import { GanttBoard } from "./ui/GanttBoard";
import {
  BudgetPanel,
  DraftsCard,
  IssuesPanel,
  PendingPanel,
  VersionsCard,
} from "./ui/SidePanels";
import {
  runScenario,
  SCENARIO_LABELS,
  type ScenarioKey,
} from "./ui/scenarios";

type Toast = { kind: "info" | "error" | "success"; text: string } | null;

export default function App() {
  const [user, setUser] = useState(USERS[0]);
  const [plan, setPlan] = useState<Plan | null>(() => scheduleService.getPlan());
  const [tick, setTick] = useState(0);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [conflict, setConflict] = useState<CommitOutcome | null>(null);
  const [commitNote, setCommitNote] = useState("");
  const [hintDiscard, setHintDiscard] = useState(false);

  const refresh = () => {
    setPlan(scheduleService.getPlan());
    setTick((t) => t + 1);
  };

  const view: WorkingView | null = useMemo(
    () => (plan ? scheduleService.getWorkingView(user) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, user, tick]
  );
  const session = scheduleService.getSession(user);
  const versions = plan ? scheduleService.listVersions() : [];
  // 个人草稿只对当前身份可见：切换身份后重新派生
  const drafts: Draft[] = useMemo(
    () => (plan ? scheduleService.listDrafts(user) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, user, tick]
  );

  const crewMap = useMemo(() => new Map(ALL_CREWS.map((c) => [c.id, c])), []);
  const crewName = (id: string | null) =>
    id ? crewMap.get(id)?.name ?? "未指派班组" : "未指派班组";

  const notify = (t: Toast) => {
    setToast(t);
    window.setTimeout(() => setToast(null), 4200);
  };

  // ---------- 方案生成 ----------
  const handleCreate = (componentIds: string[], cap: number) => {
    const p = scheduleService.createPlan(componentIds, cap, user);
    setCommitNote("");
    setHintDiscard(false);
    setConflict(null);
    refresh();
    notify({
      kind: "success",
      text: `已生成「${p.name}」并自动排程 ${p.tasks.length} 道工序（v1）。`,
    });
  };

  // ---------- 排程调整（全部先进入待提交区） ----------
  const patchStart = (taskId: string, start: number | null) => {
    scheduleService.patchTask(user, taskId, { start });
    setFocusTaskId(taskId);
    refresh();
  };
  const patchCrew = (taskId: string, crewId: string | null) => {
    scheduleService.patchTask(user, taskId, { crewId });
    setFocusTaskId(taskId);
    refresh();
  };
  const patchCap = (cap: number) => {
    scheduleService.patchBudget(user, cap);
    refresh();
  };
  const autoAll = () => {
    scheduleService.autoSchedule(user);
    refresh();
    notify({ kind: "info", text: "自动排程结果已写入待提交区，确认后才会成为新版本。" });
  };
  const undoOne = (taskId: string) => {
    scheduleService.undoChange(user, taskId);
    refresh();
  };
  const discard = () => {
    scheduleService.discardSession(user);
    setHintDiscard(false);
    setCommitNote("");
    refresh();
    notify({ kind: "info", text: "已整体放弃待提交区的全部调整，恢复到已提交版本。" });
  };

  // ---------- 提交：版本冲突 / 规则冲突 / 成功 ----------
  const commit = () => {
    const outcome = scheduleService.commit(user, commitNote.trim());
    if (outcome.type === "committed") {
      setConflict(null);
      setCommitNote("");
      setHintDiscard(false);
      refresh();
      notify({
        kind: "success",
        text: `已确认提交，产生排程版本 v${outcome.plan.version}。`,
      });
    } else if (outcome.type === "conflict") {
      setConflict(outcome);
      refresh();
    } else {
      notify({
        kind: "error",
        text: `无法提交：仍有 ${outcome.issues.filter((i) => i.severity === "error").length} 个阻断冲突，请在问题清单中逐项消解。`,
      });
    }
  };

  const closeConflictKeepDraft = () => {
    setConflict(null);
    refresh();
    notify({
      kind: "info",
      text: "已保留你的个人草稿，可在右侧「个人草稿」中套用到最新版本。",
    });
  };

  const applyDraft = (id: string) => {
    const ok = scheduleService.applyDraft(id, user);
    refresh();
    notify(
      ok
        ? { kind: "success", text: "草稿已重放到当前最新版本（基线已更新），核对冲突后可再次提交。" }
        : { kind: "error", text: "草稿无法套用（草稿不存在、不属于当前身份或对应方案已重建）。" }
    );
  };
  const deleteDraft = (id: string) => {
    scheduleService.deleteDraft(id, user);
    refresh();
  };

  // ---------- 演示场景 ----------
  const runDemo = (key: ScenarioKey) => {
    setConflict(null);
    setCommitNote("");
    const result = runScenario(key, { service: scheduleService, user });
    setFocusTaskId(result.focusTaskId ?? null);
    setHintDiscard(!!result.hintDiscard);
    setCommitNote(result.commitNote ?? "");
    refresh();
    notify({ kind: "info", text: result.message });
    if (result.autoCommit) {
      window.setTimeout(() => commit(), 350);
    }
  };

  const resetAll = () => {
    scheduleService.reset();
    setConflict(null);
    setCommitNote("");
    setFocusTaskId(null);
    setHintDiscard(false);
    refresh();
    notify({ kind: "info", text: "本地数据已清空，可重新选取构件生成方案。" });
  };

  if (!plan || !view) {
    return (
      <Shell user={user} onUser={setUser} onReset={resetAll} onDemo={runDemo} hasPlan={false}>
        <CreatePlan user={user} onCreate={handleCreate} />
      </Shell>
    );
  }

  const compCount = view.componentIds.length;
  const buildingNames = [
    ...new Set(
      view.componentIds
        .map((cid) => COMPONENTS.find((c) => c.id === cid)?.buildingId)
        .map((bid) => BUILDINGS.find((b) => b.id === bid)?.name)
    ),
  ].join("、");

  return (
    <Shell user={user} onUser={setUser} onReset={resetAll} onDemo={runDemo} hasPlan>
      <section className="plan-meta panel">
        <div>
          <p className="eyebrow">
            {view.name} · 当前版本 v{view.version}
          </p>
          <h1>跨建筑修缮排程台</h1>
          <span className="muted">
            覆盖 {buildingNames} · {compCount} 个病害构件 · {view.tasks.length} 道工序
          </span>
        </div>
        <div className="plan-meta-right">
          <label className="note-input">
            提交说明
            <input
              value={commitNote}
              onChange={(e) => setCommitNote(e.target.value)}
              placeholder="例如：避让外部占用，油饰顺延"
            />
          </label>
        </div>
      </section>

      <div className="board-layout">
        <section className="board-main">
          <div className="panel board-panel">
            <div className="heading">
              <div>
                <p className="eyebrow">手工调整</p>
                <h2>工序甘特排程（行内修改开工日 / 班组）</h2>
              </div>
              <span className="muted">
                修改立即进入你的待提交区，不会影响他人所见版本
              </span>
            </div>
            <GanttBoard
              view={view}
              crews={ALL_CREWS}
              focusTaskId={focusTaskId}
              onFocus={setFocusTaskId}
              onPatchStart={patchStart}
              onPatchCrew={patchCrew}
            />
          </div>
        </section>

        <aside className="board-side">
          <IssuesPanel view={view} focusTaskId={focusTaskId} onFocus={setFocusTaskId} />
          <BudgetPanel view={view} onPatchCap={patchCap} />
          <PendingPanel
            view={view}
            baseVersion={session?.baseVersion ?? view.version}
            crewName={crewName}
            baselineCap={plan.budget.cap}
            hintDiscard={hintDiscard}
            onAuto={autoAll}
            onUndo={undoOne}
            onDiscard={discard}
            onCommit={commit}
          />
          <DraftsCard drafts={drafts} onApply={applyDraft} onDelete={deleteDraft} />
          <VersionsCard versions={versions} />
        </aside>
      </div>

      {conflict?.type === "conflict" && (
        <ConflictModal
          outcome={conflict}
          onKeepDraft={closeConflictKeepDraft}
          onApply={() => {
            const id = conflict.draft.id;
            setConflict(null);
            applyDraft(id);
          }}
        />
      )}

      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
    </Shell>
  );
}

/* ---------------- 外壳：用户切换 + 场景工具栏 ---------------- */

function Shell({
  user,
  onUser,
  onReset,
  onDemo,
  hasPlan,
  children,
}: {
  user: string;
  onUser: (u: string) => void;
  onReset: () => void;
  onDemo: (key: ScenarioKey) => void;
  hasPlan: boolean;
  children: React.ReactNode;
}) {
  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-seal">古建</span>
          <div>
            <b>跨建筑修缮排程台</b>
            <small>资质 · 占用 · 依赖 · 工期 · 预算 五类校验</small>
          </div>
        </div>
        <nav className="scenario-bar">
          <span className="scenario-title">覆盖场景：</span>
          {(Object.keys(SCENARIO_LABELS) as ScenarioKey[]).map((k) => (
            <button key={k} type="button" className="chip" onClick={() => onDemo(k)}>
              {SCENARIO_LABELS[k]}
            </button>
          ))}
          <button type="button" className="chip reset-chip" onClick={onReset}>
            ↺ 清空本地数据
          </button>
        </nav>
        <label className="user-switch">
          当前身份
          <select value={user} onChange={(e) => onUser(e.target.value)}>
            {USERS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
      </header>
      {!hasPlan && (
        <div className="demo-tip">
          提示：可先选取构件生成方案，也可直接点击右上角任一「覆盖场景」一键布置（会重建演示方案）。
        </div>
      )}
      {children}
    </main>
  );
}

/* ---------------- 并发版本冲突弹窗 ---------------- */

function ConflictModal({
  outcome,
  onKeepDraft,
  onApply,
}: {
  outcome: Extract<CommitOutcome, { type: "conflict" }>;
  onKeepDraft: () => void;
  onApply: () => void;
}) {
  return (
    <div className="modal-mask">
      <div className="modal">
        <h2>⚠ 版本冲突</h2>
        <p>
          你的调整基于 <b>v{outcome.baseVersion}</b>，但该方案已被他人提交为{" "}
          <b>v{outcome.currentVersion}</b>。为避免覆盖他人修改，本次提交已阻止。
        </p>
        <p className="modal-draft">
          你的 {Object.keys(outcome.draft.taskPatches).length} 处工序调整
          {outcome.draft.budgetCap !== undefined ? "及预算调整 " : " "}
          已自动保存为个人草稿「{outcome.draft.label}」，不会丢失。
        </p>
        <ul className="modal-choices">
          <li>
            <b>保留草稿</b>：关闭弹窗，稍后可在右侧草稿区查看，或切换身份对比他人版本。
          </li>
          <li>
            <b>套用到最新版</b>：把你的调整重放到 v{outcome.currentVersion}{" "}
            之上（基线更新为最新版），重新校验后可再次提交。
          </li>
        </ul>
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onKeepDraft}>
            保留个人草稿
          </button>
          <button type="button" className="primary" onClick={onApply}>
            套用到最新版并重校
          </button>
        </div>
      </div>
    </div>
  );
}
