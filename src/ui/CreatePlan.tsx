import { useMemo, useState } from "react";
import { ALL_CREWS, BUILDINGS, COMPONENTS, PROCEDURES } from "../application/container";
import { DEFAULT_CAP } from "../application/scheduleService";
import { DEFAULT_COMPONENT_IDS } from "./scenarios";
import { yuan } from "../domain/date";

const DISEASE_COLOR: Record<string, string> = {
  糟朽: "#8a4b1e",
  开裂: "#b45309",
  变形: "#9a3412",
  虫蛀: "#4d7c0f",
};

interface Props {
  user: string;
  onCreate: (componentIds: string[], cap: number) => void;
}

/** 方案生成页：跨建筑选取病害构件 + 预算上限 -> 生成含工序/工期/班组/预算的方案 */
export function CreatePlan({ user, onCreate }: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(DEFAULT_COMPONENT_IDS)
  );
  const [cap, setCap] = useState(DEFAULT_CAP);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const procMap = useMemo(
    () => new Map(PROCEDURES.map((p) => [p.id, p])),
    []
  );

  const taskCount = useMemo(
    () =>
      COMPONENTS.filter((c) => selected.has(c.id)).reduce(
        (s, c) => s + (procMap.get(c.procedure)?.steps.length ?? 0),
        0
      ),
    [selected, procMap]
  );

  const directCost = useMemo(
    () =>
      COMPONENTS.filter((c) => selected.has(c.id)).reduce(
        (s, c) =>
          s + (procMap.get(c.procedure)?.steps.reduce((x, st) => x + st.cost, 0) ?? 0),
        0
      ),
    [selected, procMap]
  );

  return (
    <div className="create-wrap">
      <section className="hero panel">
        <p className="eyebrow">跨建筑排程台 · 古建修缮协同</p>
        <h1>跨建筑病害构件联合修缮排程</h1>
        <span className="hero-sub">
          选取不同建筑上的病害构件，系统生成包含工序、工期、班组与预算的修缮方案，
          并校验班组资质、跨项目占用、工序依赖、工期冲突与预算上限。
        </span>
        <p className="hero-user">当前操作人：{user}</p>
      </section>

      <div className="create-grid">
        <section className="panel">
          <div className="heading">
            <div>
              <p className="eyebrow">步骤一</p>
              <h2>选取病害构件（跨建筑）</h2>
            </div>
            <span className="muted">已选 {selected.size} 个构件 · {taskCount} 道工序</span>
          </div>

          {BUILDINGS.map((b) => {
            const comps = COMPONENTS.filter((c) => c.buildingId === b.id);
            return (
              <div key={b.id} className="building-block">
                <h3>
                  <span className="dynasty">{b.dynasty}</span>
                  {b.name}
                  <small className="muted">{b.location}</small>
                </h3>
                <div className="component-list">
                  {comps.map((c) => {
                    const proc = procMap.get(c.procedure);
                    const active = selected.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`component-card${active ? " active" : ""}`}
                        onClick={() => toggle(c.id)}
                      >
                        <span className="check">{active ? "☑" : "☐"}</span>
                        <span className="comp-body">
                          <b>
                            <span className="comp-code">{c.code}</span>
                            {c.name}
                            <i
                              className="disease-tag"
                              style={{ background: DISEASE_COLOR[c.disease] }}
                            >
                              {c.disease}
                            </i>
                          </b>
                          <small>
                            {c.timber} · {c.diseaseDesc}
                          </small>
                          <small className="muted">
                            {proc?.name}（{proc?.steps.length ?? 0} 道工序）
                          </small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        <aside className="create-side">
          <section className="panel">
            <div className="heading">
              <div>
                <p className="eyebrow">步骤二</p>
                <h2>预算上限</h2>
              </div>
            </div>
            <label className="budget-input">
              <span>方案总预算上限</span>
              <input
                type="number"
                min={50000}
                max={2000000}
                step={10000}
                value={cap}
                onChange={(e) => setCap(Number(e.target.value))}
              />
              <em>元</em>
            </label>
            <div className="budget-preview">
              <div>
                <span>直接费合计</span>
                <b>{yuan(directCost)}</b>
              </div>
              <div>
                <span>综合管理费 15%</span>
                <b>{yuan(directCost * 0.15)}</b>
              </div>
              <div className={directCost * 1.15 > cap ? "over" : ""}>
                <span>测算总额</span>
                <b>{yuan(directCost * 1.15)}</b>
              </div>
              <div className="cap-line">
                <span>预算上限</span>
                <b>{yuan(cap)}</b>
              </div>
            </div>
          </section>

          <section className="panel crew-panel">
            <h2>共享班组（{ALL_CREWS.length} 个）</h2>
            <ul className="crew-list">
              {ALL_CREWS.map((c) => (
                <li key={c.id}>
                  <b>{c.name}</b>
                  <small>
                    {c.crafts.join("、")} · {c.size}人
                    {c.occupancies.length > 0 && (
                      <em className="ext-flag">
                        {" "}
                        外部占用：{c.occupancies[0].project}
                      </em>
                    )}
                  </small>
                </li>
              ))}
            </ul>
          </section>

          <button
            className="primary big"
            disabled={selected.size === 0}
            onClick={() => onCreate([...selected], cap)}
          >
            生成修缮方案并自动排程
          </button>
        </aside>
      </div>
    </div>
  );
}
