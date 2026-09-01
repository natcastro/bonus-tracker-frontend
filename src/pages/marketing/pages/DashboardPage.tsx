import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MT } from "../theme";
import { formatDateHuman } from "../theme";
import { useMarketing } from "../context";
import NewBriefModal from "../components/NewBriefModal";
import DeadlineBadge from "../components/DeadlineBadge";
import { stageLabel, todayIso, isPastDeadline } from "../types";
import type { MarketingBrief, StageKey } from "../types";

const MONTHLY_GOAL = 8;

const ACTION_TEXT: Record<StageKey, string> = {
  brief: "crear el brief",
  proposal: "subir la primera propuesta",
  review1: "revisar la primera propuesta",
  adjustments: "subir los ajustes",
  review2: "revisar los ajustes",
  final: "cerrar el brief",
};

function isOverdue(brief: MarketingBrief): boolean {
  if (brief.status === "completed") return false;
  const stage = brief.stages.find(s => s.key === brief.currentStage);
  return !!stage && isPastDeadline(stage.deadline);
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

  const statCard = (label: string, value: string | number, color: string) => (
    <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderTop: `3px solid ${color}`, borderRadius: 10, padding: "0.85rem 1rem", flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: MT.text1 }}>{value}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem", fontFamily: MT.font }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: MT.text1 }}>Marketing</h1>
          <p style={{ margin: "0.25rem 0 0", fontSize: 13, color: MT.text2 }}>Flujo de briefs de producto — Laura ↔ Diseño</p>
        </div>
        {myRole === "laura" && (
          <button onClick={() => setShowNew(true)} style={{
            fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
            background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px",
          }}>+ Nuevo brief</button>
        )}
      </div>

      {/* Next action banner */}
      <div style={{
        background: nextActionBrief ? MT.claySoft : MT.mossSoft, border: `1px solid ${nextActionBrief ? MT.clay : MT.moss}30`,
        borderRadius: MT.radius, padding: "0.9rem 1.1rem", marginBottom: "1.25rem",
        display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14,
      }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: nextActionBrief ? MT.clay : MT.moss }}>{nextActionText}</div>
        {nextActionStage && <DeadlineBadge deadline={nextActionStage.deadline} />}
        {nextActionBrief && (
          <button onClick={() => navigate(`/marketing/brief/${nextActionBrief.id}`)} style={{
            fontFamily: MT.font, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
            background: MT.surface, color: MT.text1, border: `1px solid ${MT.border}`, borderRadius: 8, padding: "0.4rem 0.85rem",
          }}>Ir al brief →</button>
        )}
      </div>

      {/* Monthly dashboard */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        {statCard("Meta mensual", MONTHLY_GOAL, MT.text2)}
        {statCard("Completados", `${completedThisMonth.length}/${MONTHLY_GOAL}`, MT.primary)}
        {statCard("En proceso", inProgress, MT.info)}
        {statCard("A tiempo", `${onTimePct}%`, MT.moss)}
        {statCard("Retrasos Diseño", designDelays, designDelays > 0 ? MT.danger : MT.text2)}
      </div>

      {/* My pending list */}
      {myPending.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <p style={{ fontWeight: 700, fontSize: 12, color: MT.text2, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
            {myRole === "laura" ? "Esperando tu revisión / nuevos briefs" : "Tus entregas pendientes"}
          </p>
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            {myPending.map(b => {
              const stage = b.stages.find(s => s.key === b.currentStage)!;
              const overdue = isPastDeadline(stage.deadline);
              return (
                <div key={b.id} onClick={() => navigate(`/marketing/brief/${b.id}`)} style={{
                  cursor: "pointer", background: MT.surface, border: `1px solid ${overdue ? MT.danger : MT.border}`,
                  borderRadius: 10, padding: "0.7rem 0.9rem", minWidth: 180,
                }}>
                  <div style={{ fontWeight: 800, fontSize: 13.5, color: MT.text1 }}>{b.reference}</div>
                  <div style={{ fontSize: 11.5, color: MT.text2, marginTop: 2, marginBottom: 5 }}>{stageLabel(b.currentStage)}</div>
                  <DeadlineBadge deadline={stage.deadline} compact />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.85rem", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 200px" }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 4 }}>Buscar referencia</label>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="C05-54..." style={{
            width: "100%", fontFamily: MT.font, fontSize: 13, padding: "8px 10px",
            border: `1px solid ${MT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box",
          }} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 4 }}>Status</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} style={{ fontFamily: MT.font, fontSize: 13, padding: "8px 10px", border: `1px solid ${MT.border}`, borderRadius: 8 }}>
            <option value="all">Todos</option>
            <option value="in_progress">En proceso</option>
            <option value="completed">Completado</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 4 }}>Responsable</label>
          <select value={responsibleFilter} onChange={e => setResponsibleFilter(e.target.value as any)} style={{ fontFamily: MT.font, fontSize: 13, padding: "8px 10px", border: `1px solid ${MT.border}`, borderRadius: 8 }}>
            <option value="all">Todos</option>
            <option value="laura">Laura</option>
            <option value="diseno">Diseño</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 4 }}>Desde</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ fontFamily: MT.font, fontSize: 13, padding: "8px 10px", border: `1px solid ${MT.border}`, borderRadius: 8 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 4 }}>Hasta</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ fontFamily: MT.font, fontSize: 13, padding: "8px 10px", border: `1px solid ${MT.border}`, borderRadius: 8 }} />
        </div>
      </div>

      {/* Table */}
      <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radius, overflowX: "auto" }}>
        <p style={{ fontSize: 12.5, color: MT.text3, margin: 0, padding: "0.75rem 1rem 0" }}>{filtered.length} brief{filtered.length !== 1 ? "s" : ""}</p>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${MT.border}` }}>
              {["Referencia", "Fecha", "Status", "Responsable actual", "Deadline", "Alerta"].map(h => (
                <th key={h} style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: MT.text2, textTransform: "uppercase", letterSpacing: "0.04em", padding: "0.5rem 1rem" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: MT.text3, fontSize: 13 }}>No hay briefs para este filtro.</td></tr>
            ) : filtered.map(b => {
              const stage = b.stages.find(s => s.key === b.currentStage);
              const overdue = isOverdue(b);
              return (
                <tr key={b.id} onClick={() => navigate(`/marketing/brief/${b.id}`)} style={{ borderBottom: `1px solid ${MT.border}`, cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.background = MT.surfaceAlt)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  <td style={{ padding: "0.65rem 1rem", fontWeight: 700, fontSize: 13, color: MT.text1 }}>{b.reference}</td>
                  <td style={{ padding: "0.65rem 1rem", fontSize: 12.5, color: MT.text2 }}>{formatDateHuman(b.startDate)}</td>
                  <td style={{ padding: "0.65rem 1rem" }}>
                    <span style={{
                      fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "0.15rem 0.6rem",
                      background: b.status === "completed" ? MT.primarySoft : MT.infoSoft,
                      color: b.status === "completed" ? MT.primary : MT.info,
                    }}>
                      {b.status === "completed" ? "Completado" : stageLabel(b.currentStage)}
                    </span>
                  </td>
                  <td style={{ padding: "0.65rem 1rem", fontSize: 12.5, color: MT.text2 }}>
                    {stage ? (stage.role === "laura" ? "Laura" : "Diseño") : "—"}
                  </td>
                  <td style={{ padding: "0.65rem 1rem" }}>{stage ? <DeadlineBadge deadline={stage.deadline} compact /> : "—"}</td>
                  <td style={{ padding: "0.65rem 1rem" }}>
                    {overdue ? (
                      <span style={{ fontSize: 11.5, fontWeight: 800, color: MT.danger, background: MT.dangerSoft, borderRadius: 999, padding: "0.15rem 0.6rem" }}>⚠ Urgente</span>
                    ) : b.status === "completed" ? (
                      <span style={{ fontSize: 11.5, color: MT.text3 }}>—</span>
                    ) : (
                      <span style={{ fontSize: 11.5, color: MT.moss, fontWeight: 700 }}>A tiempo</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showNew && <NewBriefModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
