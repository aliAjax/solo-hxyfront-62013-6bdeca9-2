import { BUILDINGS, COMPONENTS, ALL_CREWS } from "../application/container";
import type { Crew, Issue, Task, WorkingView } from "../domain/types";
import { fmtShort, overlaps } from "../domain/date";

const DAY_W = 26;
const LABEL_W = 300;
const ROW_H = 54;
const GROUP_H = 32;
const HEAD_H = 34;

const CRAFT_COLOR: Record<string, string> = {
  综合: "#64748b",
  木作: "#854d0e",
  虫害防治: "#4d7c0f",
  油饰: "#a16207",
  彩绘: "#9d174d",
};

interface Props {
  view: WorkingView;
  crews: Crew[];
  focusTaskId: string | null;
  onFocus: (taskId: string) => void;
  onPatchStart: (taskId: string, value: number | null) => void;
  onPatchCrew: (taskId: string, crewId: string | null) => void;
}

export function GanttBoard({
  view,
  crews,
  focusTaskId,
  onFocus,
  onPatchStart,
  onPatchCrew,
}: Props) {
  const crewMap = new Map(crews.map((c) => [c.id, c]));
  const compMap = new Map(COMPONENTS.map((c) => [c.id, c]));
  const bldMap = new Map(BUILDINGS.map((b) => [b.id, b]));

  const issuesByTask = new Map<string, Issue[]>();
  for (const is of view.issues) {
    if (!is.taskId) continue;
    const list = issuesByTask.get(is.taskId) ?? [];
    list.push(is);
    issuesByTask.set(is.taskId, list);
  }

  const maxEnd = Math.max(
    18,
    ...view.tasks.map((t) => (t.start === null ? 0 : t.start + t.duration))
  );
  const days = maxEnd + 2;

  // 行分组（建筑 -> 构件 -> 工序）
  const groups = view.componentIds.map((cid) => ({
    component: compMap.get(cid)!,
    tasks: view.tasks.filter((t) => t.componentId === cid),
  }));
  const totalH =
    HEAD_H + groups.reduce((s, g) => s + GROUP_H + g.tasks.length * ROW_H, 0);

  const weekends: number[] = [];
  for (let d = 0; d < days; d++) {
    const date = new Date("2026-09-16T00:00:00");
    date.setDate(date.getDate() + d);
    if (date.getDay() === 0 || date.getDay() === 6) weekends.push(d);
  }

  const gridTpl = `${LABEL_W}px repeat(${days}, ${DAY_W}px)`;

  return (
    <div className="board-scroll">
      <div
        className="board"
        style={{ width: LABEL_W + days * DAY_W, height: totalH }}
      >
        {/* 周末底色 */}
        {weekends.map((d) => (
          <div
            key={d}
            className="weekend-col"
            style={{ left: LABEL_W + d * DAY_W, width: DAY_W }}
          />
        ))}

        {/* 表头 */}
        <div className="board-head" style={{ gridTemplateColumns: gridTpl }}>
          <div className="head-label sticky-left">工序 / 班组 / 开工日</div>
          {Array.from({ length: days }, (_, d) => (
            <div key={d} className="head-day">
              <b>{d + 1}</b>
              <small>{fmtShort(d)}</small>
            </div>
          ))}
        </div>

        {groups.map(({ component, tasks }) => {
          const bld = bldMap.get(component.buildingId);
          return (
            <div key={component.id}>
              <div
                className="group-row"
                style={{ gridTemplateColumns: gridTpl }}
              >
                <div className="sticky-left group-label">
                  <b>{bld?.name}</b>
                  <span>
                    {component.code} · {component.name}
                  </span>
                  <i className="disease-mini">{component.disease}</i>
                </div>
              </div>
              {tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  days={days}
                  gridTpl={gridTpl}
                  crew={t.crewId ? crewMap.get(t.crewId) : undefined}
                  crews={crews}
                  issues={issuesByTask.get(t.id) ?? []}
                  changed={view.changedTaskIds.includes(t.id)}
                  focused={focusTaskId === t.id}
                  hasDeps={t.dependsOn.length > 0}
                  onFocus={() => onFocus(t.id)}
                  onPatchStart={(v) => onPatchStart(t.id, v)}
                  onPatchCrew={(cid) => onPatchCrew(t.id, cid)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface RowProps {
  task: Task;
  days: number;
  gridTpl: string;
  crew: Crew | undefined;
  crews: Crew[];
  issues: Issue[];
  changed: boolean;
  focused: boolean;
  hasDeps: boolean;
  onFocus: () => void;
  onPatchStart: (value: number | null) => void;
  onPatchCrew: (crewId: string | null) => void;
}

function TaskRow({
  task,
  days,
  gridTpl,
  crew,
  crews,
  issues,
  changed,
  focused,
  hasDeps,
  onFocus,
  onPatchStart,
  onPatchCrew,
}: RowProps) {
  const hasError = issues.some((i) => i.severity === "error");
  const hasWarning = !hasError && issues.length > 0;
  const end = task.start === null ? null : task.start + task.duration - 1;
  const externalHit =
    crew && task.start !== null
      ? crew.occupancies.find((o) => overlaps(task.start!, end!, o.start, o.end))
      : undefined;

  const depNames = task.dependsOn
    .map((d) => d.split("_").slice(-1)[0])
    .join(",");

  return (
    <div
      className={`trow${focused ? " focused" : ""}`}
      style={{ gridTemplateColumns: gridTpl }}
    >
      <div className="tlabel sticky-left">
        <div className="tlabel-top">
          <button type="button" className="tname" onClick={onFocus} title="点击在问题清单中定位">
            {task.name}
          </button>
          <span className="craft-tag" style={{ background: CRAFT_COLOR[task.craft] }}>
            {task.craft}
          </span>
          {changed && <span className="changed-badge">待提交</span>}
          {hasDeps && <span className="dep-hint" title={task.dependsOn.join("、")}>
            依赖[{depNames}]
          </span>}
        </div>
        <div className="tlabel-controls">
          <select
            value={task.crewId ?? ""}
            onChange={(e) => onPatchCrew(e.target.value || null)}
            className={crew && !crew.crafts.includes(task.craft) ? "bad-select" : ""}
          >
            <option value="">未指派班组</option>
            {crews.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.crafts.includes(task.craft) ? "" : "（无" + task.craft + "资质）"}
              </option>
            ))}
          </select>
          <span className="start-edit">
            第
            <input
              type="number"
              min={1}
              max={days}
              value={task.start === null ? "" : task.start + 1}
              onChange={(e) => {
                const v = e.target.value;
                onPatchStart(v === "" ? null : Math.max(1, Math.min(days, Number(v))) - 1);
              }}
            />
            天
          </span>
        </div>
        {externalHit && <div className="ext-warn">⚠ 该时段班组在「{externalHit.project}」</div>}
      </div>

      {/* 任务条 */}
      {task.start !== null && (
        <button
          type="button"
          className={`tbar${hasError ? " error" : ""}${hasWarning ? " warning" : ""}${changed ? " changed" : ""}${focused ? " focused-bar" : ""}`}
          style={{
            gridColumn: `${task.start + 2} / span ${task.duration}`,
            background: CRAFT_COLOR[task.craft],
          }}
          onClick={onFocus}
          title={issues.map((i) => i.message).join("\n") || task.name}
        >
          <span className="tbar-name">{task.name}</span>
          <span className="tbar-crew">{crew?.name.split("·")[0]}</span>
          {issues.length > 0 && <span className="tbar-flag">⚠</span>}
        </button>
      )}
      {task.start === null && (
        <div className="unscheduled" style={{ gridColumn: `2 / span ${days}` }}>
          未排定 —— 在左侧设置开工日，或点击「自动排程」
        </div>
      )}
    </div>
  );
}
