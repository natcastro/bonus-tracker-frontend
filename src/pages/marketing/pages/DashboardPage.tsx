import { Fragment, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MT } from "../theme";
import { formatDateHuman, ROLE_CFG } from "../theme";
import { useMarketing } from "../context";
import DeadlineBadge from "../components/DeadlineBadge";
import Avatar from "../components/Avatar";
import StatusPill from "../components/StatusPill";
import { SearchIcon } from "../../../components/icons";
import { stageLabel, todayIso, isPastDeadline } from "../types";
import type { MarketingBrief, MarketingRole } from "../types";
import { moodBunny } from "../../../components/moodBunny";

const MONTHLY_GOAL = 8;

type GroupKey = "overdue" | "active" | "completed";
const GROUP_DEFS: { key: GroupKey; label: string; color: string }[] = [
  { key: "overdue",   label: "⚠ Atrasados", color: MT.danger },
  { key: "active",    label: "En proceso",  color: MT.info },
  { key: "completed", label: "Completados", color: MT.primary },
];

function isOverdue(brief: MarketingBrief): boolean {
  if (brief.status !== "in_progress") return false;
  const stage = brief.stages.find(s => s.key === brief.currentStage);
  return !!stage?.deadline && isPastDeadline(stage.deadline);
}

function groupOf(b: MarketingBrief): GroupKey {
  if (b.status === "completed") return "completed";
  return isOverdue(b) ? "overdue" : "active";
}

export default function DashboardPage() {
  const { briefs: allBriefs } = useMarketing();
  // Private/pending tasks live only in "Mis tareas" — Vista general only shows published briefs.
  const briefs = useMemo(() => allBriefs.filter(b => b.status !== "draft"), [allBriefs]);
  const navigate = useNavigate();
  const tableRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all"|"in_progress"|"completed">("all");
  const [responsibleFilter, setResponsibleFilter] = useState<"all"|"laura"|"diseno">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [collapsed, setCollapsed] = useState<Record<GroupKey, boolean>>({ overdue: false, active: false, completed: true });

  const thisMonthKey = todayIso().slice(0, 7);
  // "This month" is based on when a brief was completed, not when it started — a brief that
  // started in August and finished in September counts toward September's goal.
  const completedThisMonth = briefs.filter(b => b.status === "completed" && !!b.completedAt && b.completedAt.slice(0, 7) === thisMonthKey);
  const inProgressBriefs = briefs.filter(b => b.status === "in_progress");
  const inProgress = inProgressBriefs.length;
  // "On time" also has to reflect briefs that are in progress right now and already past their
  // current deadline — not just past delays on briefs that have already been completed.
  const onTimeCohort = [...completedThisMonth, ...inProgressBriefs];
  const onTimePct = onTimeCohort.length > 0
    ? Math.round(100 * onTimeCohort.filter(b => b.designDelayCount === 0 && !isOverdue(b)).length / onTimeCohort.length)
    : 100;
  const designDelays = [...inProgressBriefs, ...completedThisMonth].reduce((s, b) => s + b.designDelayCount, 0);
  const bunny = moodBunny(onTimePct);

  const filtered = briefs.filter(b => {
    if (search && !b.reference.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (responsibleFilter !== "all") {
      const stage = b.stages.find(s => s.key === b.currentStage);
      if (b.status !== "in_progress" || !stage || stage.role !== responsibleFilter) return false;
    }
    if (dateFrom && b.startDate < dateFrom) return false;
    if (dateTo && b.startDate > dateTo) return false;
    return true;
  });

  const groups = GROUP_DEFS.map(g => ({ ...g, rows: filtered.filter(b => groupOf(b) === g.key) }));

  const focusGroups = (keys: GroupKey[], status: "all" | "in_progress" | "completed") => {
    setStatusFilter(status);
    setCollapsed(c => {
      const next = { ...c };
      keys.forEach(k => { next[k] = false; });
      return next;
    });
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const kpi = (label: string, value: string | number, color: string, onClick?: () => void, last?: boolean) => (
    <div
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", gap: 2, padding: "0.6rem 0.9rem", flex: 1, minWidth: 110,
        borderRight: last ? "none" : `1px solid ${MT.border}`,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: MT.text3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 16.5, fontWeight: 800, color }}>{value}</div>
    </div>
  );

  const segButton = (active: boolean, onClick: () => void, label: React.ReactNode, key: string) => (
    <button key={key} onClick={onClick} style={{
      fontFamily: MT.font, fontSize: 12, fontWeight: 700, cursor: "pointer",
      padding: "5px 11px", borderRadius: 7, whiteSpace: "nowrap",
      border: `1px solid ${active ? MT.primary : MT.border}`,
      background: active ? MT.primarySoft : MT.surface,
      color: active ? MT.primary : MT.text2,
      display: "flex", alignItems: "center", gap: 5,
    }}>{label}</button>
  );

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1.25rem 1.5rem", fontFamily: MT.font }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.9rem", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: MT.text1 }}>Vista general</h1>
          <p style={{ margin: "0.15rem 0 0", fontSize: 12.5, color: MT.text2 }}>Flujo de briefs de producto — Laura ↔ Diseño</p>
        </div>
        <img src={bunny.src} alt={bunny.label} title={`${onTimePct}% a tiempo — ${bunny.label}`} style={{ width: 110, height: 110, objectFit: "contain", flexShrink: 0 }} />
      </div>

      {/* KPI strip */}
      <div style={{
        display: "flex", flexWrap: "wrap", background: MT.surface, border: `1px solid ${MT.border}`,
        borderRadius: MT.radius, marginBottom: "1.25rem", overflow: "hidden", boxShadow: MT.shadow,
      }}>
        {kpi("Meta mensual", MONTHLY_GOAL, MT.text2)}
        {kpi("Completados", `${completedThisMonth.length}/${MONTHLY_GOAL}`, MT.primary, () => focusGroups(["completed"], "completed"))}
        {kpi("En proceso", inProgress, MT.info, () => focusGroups(["overdue", "active"], "in_progress"))}
        {kpi("A tiempo", `${onTimePct}%`, MT.moss, () => focusGroups(["completed"], "completed"))}
        {kpi("Retrasos Diseño", designDelays, designDelays > 0 ? MT.danger : MT.text1, () => focusGroups(["overdue"], "in_progress"), true)}
      </div>

      {/* Toolbar: search + filters */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.7rem", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 180px", maxWidth: 240 }}>
          <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", display: "flex", pointerEvents: "none" }}>
            <SearchIcon size={14} color={MT.text3} />
          </span>
          <input
            value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar referencia..."
            style={{
              fontFamily: MT.font, fontSize: 12.5, padding: "7px 11px 7px 30px", width: "100%",
              border: `1px solid ${MT.border}`, borderRadius: 7, outline: "none", boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {segButton(statusFilter === "all", () => setStatusFilter("all"), "Todos", "st-all")}
          {segButton(statusFilter === "in_progress", () => setStatusFilter("in_progress"), "En proceso", "st-ip")}
          {segButton(statusFilter === "completed", () => setStatusFilter("completed"), "Completado", "st-done")}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {segButton(responsibleFilter === "all", () => setResponsibleFilter("all"), "Todos", "r-all")}
          {segButton(responsibleFilter === "laura", () => setResponsibleFilter("laura"), <><Avatar role="laura" size={15} />Laura</>, "r-laura")}
          {segButton(responsibleFilter === "diseno", () => setResponsibleFilter("diseno"), <><Avatar role="diseno" size={15} />Diseño</>, "r-diseno")}
        </div>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="Desde" style={{
          fontFamily: MT.font, fontSize: 12, padding: "6px 8px", border: `1px solid ${MT.border}`, borderRadius: 7,
        }} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title="Hasta" style={{
          fontFamily: MT.font, fontSize: 12, padding: "6px 8px", border: `1px solid ${MT.border}`, borderRadius: 7,
        }} />
      </div>

      {/* Grouped table */}
      <div ref={tableRef} style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radius, overflow: "hidden", boxShadow: MT.shadow }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${MT.border}` }}>
                {["Referencia", "Línea", "Fecha", "Status", "Responsable", "Deadline", "Alerta"].map(h => (
                  <th key={h} style={{ textAlign: "left", fontSize: 10.5, fontWeight: 700, color: MT.text2, textTransform: "uppercase", letterSpacing: "0.04em", padding: "0.5rem 0.9rem" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: MT.text3, fontSize: 13 }}>No hay briefs para este filtro.</td></tr>
              ) : groups.map(g => {
                if (g.rows.length === 0) return null;
                const isCollapsed = collapsed[g.key];
                return (
                  <Fragment key={g.key}>
                    <tr onClick={() => setCollapsed(c => ({ ...c, [g.key]: !c[g.key] }))}
                      style={{ background: MT.surfaceAlt, cursor: "pointer" }}>
                      <td colSpan={7} style={{ padding: "0.4rem 0.9rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ fontSize: 10, color: MT.text3, width: 10, display: "inline-block" }}>{isCollapsed ? "▸" : "▾"}</span>
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: g.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, fontWeight: 800, color: g.color }}>{g.label}</span>
                          <span style={{ fontSize: 11, color: MT.text3, fontWeight: 600 }}>({g.rows.length})</span>
                        </div>
                      </td>
                    </tr>
                    {!isCollapsed && g.rows.map(b => {
                      const stage = b.stages.find(s => s.key === b.currentStage);
                      const overdue = isOverdue(b);
                      const role: MarketingRole | undefined = stage?.role;
                      const statusColor = b.status === "completed" ? MT.primary : role ? ROLE_CFG[role].color : MT.text2;
                      const rowAccent = b.status === "in_progress" && role ? ROLE_CFG[role].color : "transparent";
                      return (
                        <tr key={b.id} onClick={() => navigate(`/marketing/brief/${b.id}`)} style={{
                          borderBottom: `1px solid ${MT.border}`, borderLeft: `3px solid ${rowAccent}`, cursor: "pointer",
                        }}
                          onMouseEnter={e => (e.currentTarget.style.background = MT.surfaceAlt)}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                          <td style={{ padding: "0.55rem 0.9rem", fontWeight: 700, fontSize: 12.5, color: MT.text1 }}>{b.reference}</td>
                          <td style={{ padding: "0.55rem 0.9rem", fontSize: 12, color: MT.text2 }}>{b.productLine || "—"}</td>
                          <td style={{ padding: "0.55rem 0.9rem", fontSize: 12, color: MT.text2 }}>{formatDateHuman(b.startDate)}</td>
                          <td style={{ padding: "0.55rem 0.9rem" }}>
                            <StatusPill solid color={statusColor} label={b.status === "completed" ? "✓ Completado" : stageLabel(b.currentStage)} />
                          </td>
                          <td style={{ padding: "0.55rem 0.9rem" }}>
                            {role ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <Avatar role={role} size={20} />
                                <span style={{ fontSize: 12, color: MT.text2 }}>{ROLE_CFG[role].label}</span>
                              </div>
                            ) : "—"}
                          </td>
                          <td style={{ padding: "0.55rem 0.9rem" }}>{stage?.deadline ? <DeadlineBadge deadline={stage.deadline} compact /> : "—"}</td>
                          <td style={{ padding: "0.55rem 0.9rem" }}>
                            {overdue ? (
                              <StatusPill solid color={MT.danger} label="⚠ Urgente" />
                            ) : b.status !== "in_progress" ? (
                              <span style={{ fontSize: 11.5, color: MT.text3 }}>—</span>
                            ) : (
                              <StatusPill color={MT.moss} label="A tiempo" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
