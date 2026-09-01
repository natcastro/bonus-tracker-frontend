import { Fragment, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MT } from "../theme";
import { formatDateHuman, ROLE_CFG } from "../theme";
import { useMarketing } from "../context";
import NewBriefModal from "../components/NewBriefModal";
import DeadlineBadge from "../components/DeadlineBadge";
import Avatar from "../components/Avatar";
import StatusPill from "../components/StatusPill";
import { stageLabel, todayIso, isPastDeadline } from "../types";
import type { MarketingBrief, MarketingRole, StageKey } from "../types";

const MONTHLY_GOAL = 8;

const ACTION_TEXT: Record<StageKey, string> = {
  brief: "crear el brief",
  proposal: "subir la primera propuesta",
  review1: "revisar la primera propuesta",
  adjustments: "subir los ajustes",
  review2: "revisar los ajustes",
  final: "cerrar el brief",
};

type GroupKey = "overdue" | "active" | "completed";
const GROUP_DEFS: { key: GroupKey; label: string; color: string }[] = [
  { key: "overdue",   label: "⚠ Atrasados", color: MT.danger },
  { key: "active",    label: "En proceso",  color: MT.info },
  { key: "completed", label: "Completados", color: MT.primary },
];

function isOverdue(brief: MarketingBrief): boolean {
  if (brief.status === "completed") return false;
  const stage = brief.stages.find(s => s.key === brief.currentStage);
  return !!stage && isPastDeadline(stage.deadline);
}

function groupOf(b: MarketingBrief): GroupKey {
  if (b.status === "completed") return "completed";
  return isOverdue(b) ? "overdue" : "active";
}

export default function DashboardPage() {
  const { authedUser, briefs } = useMarketing();
  const navigate = useNavigate();
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all"|"in_progress"|"completed">("all");
  const [responsibleFilter, setResponsibleFilter] = useState<"all"|"laura"|"diseno">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [collapsed, setCollapsed] = useState<Record<GroupKey, boolean>>({ overdue: false, active: false, completed: true });

  const thisMonthKey = todayIso().slice(0, 7);
  const monthBriefs = briefs.filter(b => b.startDate.slice(0, 7) === thisMonthKey);
  const completedThisMonth = monthBriefs.filter(b => b.status === "completed");
  const inProgress = briefs.filter(b => b.status === "in_progress").length;
  const onTimePct = completedThisMonth.length > 0
    ? Math.round(100 * completedThisMonth.filter(b => b.designDelayCount === 0).length / completedThisMonth.length)
    : 100;
  const designDelays = monthBriefs.reduce((s, b) => s + b.designDelayCount, 0);

  const myRole = authedUser?.role;
  const myPending = useMemo(() => {
    return briefs
      .filter(b => b.status === "in_progress")
      .filter(b => {
        const stage = b.stages.find(s => s.key === b.currentStage);
        return stage?.role === myRole;
      })
      .sort((a, b) => {
        const sa = a.stages.find(s => s.key === a.currentStage)!;
        const sb = b.stages.find(s => s.key === b.currentStage)!;
        return sa.deadline.localeCompare(sb.deadline);
      });
  }, [briefs, myRole]);

  const nextActionBrief = myPending[0];
  const nextActionStage = nextActionBrief?.stages.find(s => s.key === nextActionBrief.currentStage);
  const nextActionText = nextActionBrief
    ? `Tu próxima acción: ${ACTION_TEXT[nextActionBrief.currentStage as StageKey]} de ${nextActionBrief.reference}`
    : "No tienes acciones pendientes en este momento.";

  const filtered = briefs.filter(b => {
    if (search && !b.reference.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (responsibleFilter !== "all") {
      const stage = b.stages.find(s => s.key === b.currentStage);
      if (b.status === "completed" || !stage || stage.role !== responsibleFilter) return false;
    }
    if (dateFrom && b.startDate < dateFrom) return false;
    if (dateTo && b.startDate > dateTo) return false;
    return true;
  });

  const groups = GROUP_DEFS.map(g => ({ ...g, rows: filtered.filter(b => groupOf(b) === g.key) }));

  const kpi = (label: string, value: string | number, color: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0.55rem 0.9rem", borderRight: `1px solid ${MT.border}` }}>
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.9rem", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: MT.text1 }}>Marketing</h1>
          <p style={{ margin: "0.15rem 0 0", fontSize: 12.5, color: MT.text2 }}>Flujo de briefs de producto — Laura ↔ Diseño</p>
        </div>
        {myRole === "laura" && (
          <button onClick={() => setShowNew(true)} style={{
            fontFamily: MT.font, fontSize: 13, fontWeight: 700, cursor: "pointer",
            background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px",
          }}>+ Nuevo brief</button>
        )}
      </div>

      {/* Next action banner */}
      <div style={{
        background: nextActionBrief ? MT.claySoft : MT.mossSoft, border: `1px solid ${nextActionBrief ? MT.clay : MT.moss}30`,
        borderRadius: MT.radius, padding: "0.65rem 0.9rem", marginBottom: "1rem",
        display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          {myRole && <Avatar role={myRole} size={22} />}
          <div style={{ fontSize: 13, fontWeight: 700, color: nextActionBrief ? MT.clay : MT.moss }}>{nextActionText}</div>
        </div>
        {nextActionStage && <DeadlineBadge deadline={nextActionStage.deadline} compact />}
        {nextActionBrief && (
          <button onClick={() => navigate(`/marketing/brief/${nextActionBrief.id}`)} style={{
            fontFamily: MT.font, fontSize: 12, fontWeight: 700, cursor: "pointer",
            background: MT.surface, color: MT.text1, border: `1px solid ${MT.border}`, borderRadius: 7, padding: "0.35rem 0.75rem",
          }}>Ir al brief →</button>
        )}
      </div>

      {/* KPI strip */}
      <div style={{
        display: "flex", flexWrap: "wrap", background: MT.surface, border: `1px solid ${MT.border}`,
        borderRadius: 10, marginBottom: "1rem", overflow: "hidden",
      }}>
        {kpi("Meta mensual", MONTHLY_GOAL, MT.text2)}
        {kpi("Completados", `${completedThisMonth.length}/${MONTHLY_GOAL}`, MT.primary)}
        {kpi("En proceso", inProgress, MT.info)}
        {kpi("A tiempo", `${onTimePct}%`, MT.moss)}
        <div style={{ padding: "0.55rem 0.9rem" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: MT.text3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Retrasos Diseño</div>
          <div style={{ fontSize: 16.5, fontWeight: 800, color: designDelays > 0 ? MT.danger : MT.text1 }}>{designDelays}</div>
        </div>
      </div>

      {/* My pending list */}
      {myPending.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <p style={{ fontWeight: 700, fontSize: 11, color: MT.text2, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>
            {myRole === "laura" ? "Esperando tu revisión / nuevos briefs" : "Tus entregas pendientes"}
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {myPending.map(b => {
              const stage = b.stages.find(s => s.key === b.currentStage)!;
              const overdue = isPastDeadline(stage.deadline);
              return (
                <div key={b.id} onClick={() => navigate(`/marketing/brief/${b.id}`)} style={{
                  cursor: "pointer", background: MT.surface, border: `1px solid ${overdue ? MT.danger : MT.border}`,
                  borderRadius: 9, padding: "0.55rem 0.75rem", minWidth: 160,
                }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: MT.text1 }}>{b.reference}</div>
                  <div style={{ fontSize: 11, color: MT.text2, marginTop: 1, marginBottom: 4 }}>{stageLabel(b.currentStage)}</div>
                  <DeadlineBadge deadline={stage.deadline} compact />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Toolbar: search + filters */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.7rem", alignItems: "center" }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="🔎 Buscar referencia..."
          style={{
            fontFamily: MT.font, fontSize: 12.5, padding: "7px 11px", flex: "1 1 180px", maxWidth: 240,
            border: `1px solid ${MT.border}`, borderRadius: 7, outline: "none", boxSizing: "border-box",
          }}
        />
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
      <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radius, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${MT.border}` }}>
                {["Referencia", "Fecha", "Status", "Responsable", "Deadline", "Alerta"].map(h => (
                  <th key={h} style={{ textAlign: "left", fontSize: 10.5, fontWeight: 700, color: MT.text2, textTransform: "uppercase", letterSpacing: "0.04em", padding: "0.5rem 0.9rem" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: MT.text3, fontSize: 13 }}>No hay briefs para este filtro.</td></tr>
              ) : groups.map(g => {
                if (g.rows.length === 0) return null;
                const isCollapsed = collapsed[g.key];
                return (
                  <Fragment key={g.key}>
                    <tr onClick={() => setCollapsed(c => ({ ...c, [g.key]: !c[g.key] }))}
                      style={{ background: MT.surfaceAlt, cursor: "pointer" }}>
                      <td colSpan={6} style={{ padding: "0.4rem 0.9rem" }}>
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
                      return (
                        <tr key={b.id} onClick={() => navigate(`/marketing/brief/${b.id}`)} style={{ borderBottom: `1px solid ${MT.border}`, cursor: "pointer" }}
                          onMouseEnter={e => (e.currentTarget.style.background = MT.surfaceAlt)}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                          <td style={{ padding: "0.55rem 0.9rem", fontWeight: 700, fontSize: 12.5, color: MT.text1 }}>{b.reference}</td>
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
                          <td style={{ padding: "0.55rem 0.9rem" }}>{stage ? <DeadlineBadge deadline={stage.deadline} compact /> : "—"}</td>
                          <td style={{ padding: "0.55rem 0.9rem" }}>
                            {overdue ? (
                              <StatusPill solid color={MT.danger} label="⚠ Urgente" />
                            ) : b.status === "completed" ? (
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

      {showNew && <NewBriefModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
