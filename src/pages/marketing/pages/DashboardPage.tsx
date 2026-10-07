import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MT } from "../theme";
import { formatDateHuman, ROLE_CFG } from "../theme";
import { useMarketing } from "../context";
import DeadlineBadge from "../components/DeadlineBadge";
import Avatar from "../components/Avatar";
import StatusPill from "../components/StatusPill";
import { SearchIcon } from "../../../components/icons";
import { stageLabel, todayIso, isPastDeadline, currentActiveStages } from "../types";
import type { MarketingBrief, MarketingRole, MarketingStage } from "../types";
import { moodBunny } from "../../../components/moodBunny";
import DisenoFilterButton from "../components/DisenoFilterButton";
import { lateExplanation } from "../lateInfo";
import { getBriefNotificationTimes } from "../../../services/api";

const MONTHLY_GOAL = 8;

type GroupKey = "overdue" | "active" | "completed";
const GROUP_DEFS: { key: GroupKey; label: string; color: string }[] = [
  { key: "overdue",   label: "⚠ Atrasados", color: MT.danger },
  { key: "active",    label: "En proceso",  color: MT.info },
  { key: "completed", label: "Completados", color: MT.primary },
];

// Only a late Diseño stage counts as "overdue" for alerts/health — a brief waiting on Laura
// (review stages) never shows as late, since that delay isn't Diseño's to answer for. For a
// variant-mode brief, it counts as overdue if ANY applicable variant's current Diseño stage is.
function isOverdue(brief: MarketingBrief): boolean {
  if (brief.status !== "in_progress") return false;
  return currentActiveStages(brief).some(s => s.role === "diseno" && !!s.deadline && isPastDeadline(s.deadline));
}

// Design delays, summed across variants for a variant-mode brief (the brief's own
// designDelayCount stays 0 in that case since delays are tracked per variant instead).
function totalDesignDelayCount(brief: MarketingBrief): number {
  if (brief.variants) return brief.variants.reduce((s, v) => s + v.designDelayCount, 0);
  return brief.designDelayCount;
}

// For list/table views, a variant-mode brief shows whichever in-progress variant is most urgent
// (overdue first, else the nearest deadline) as its one-line summary.
function representativeStage(brief: MarketingBrief) {
  const candidates = currentActiveStages(brief);
  if (candidates.length === 0) return null;
  const overdue = candidates.find(s => !!s.deadline && isPastDeadline(s.deadline));
  if (overdue) return overdue;
  return [...candidates].sort((a, b) => (a.deadline ?? "9999-99-99").localeCompare(b.deadline ?? "9999-99-99"))[0];
}

function groupOf(b: MarketingBrief): GroupKey {
  if (b.status === "completed") return "completed";
  return isOverdue(b) ? "overdue" : "active";
}

export default function DashboardPage() {
  const { briefs: allBriefs, disenoDisplayName, disenoEmailList } = useMarketing();
  // Private/pending tasks live only in "Mis tareas" — Vista general only shows published briefs.
  const briefs = useMemo(() => allBriefs.filter(b => b.status !== "draft"), [allBriefs]);
  const navigate = useNavigate();
  const tableRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all"|"in_progress"|"completed">("all");
  const [responsibleFilter, setResponsibleFilter] = useState<"all"|"laura"|"diseno">("all");
  // Empty = every Diseño person, once "diseno" is the active responsibleFilter.
  const [disenoSelection, setDisenoSelection] = useState<string[]>([]);
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
    ? Math.round(100 * onTimeCohort.filter(b => totalDesignDelayCount(b) === 0 && !isOverdue(b)).length / onTimeCohort.length)
    : 100;
  const designDelays = [...inProgressBriefs, ...completedThisMonth].reduce((s, b) => s + totalDesignDelayCount(b), 0);
  const bunny = moodBunny(onTimePct);

  // ── Diseño delay history: every Diseño stage that was delivered late, with when it was delivered.
  const [delaysOpen, setDelaysOpen] = useState(false);
  const [notifTimes, setNotifTimes] = useState<Record<number, { createdAt: string; message: string }[]>>({});
  const delayRows = useMemo(() => {
    const rows: { brief: MarketingBrief; stage: MarketingStage; variant?: string }[] = [];
    [...inProgressBriefs, ...completedThisMonth].forEach(b => {
      if (b.variants) b.variants.forEach(v => v.stages.filter(st => st.role === "diseno" && st.status === "done" && st.late).forEach(st => rows.push({ brief: b, stage: st, variant: v.key })));
      else b.stages.filter(st => st.role === "diseno" && st.status === "done" && st.late).forEach(st => rows.push({ brief: b, stage: st }));
    });
    return rows.sort((a, b) => (b.stage.completedAt ?? "").localeCompare(a.stage.completedAt ?? ""));
  }, [inProgressBriefs, completedThisMonth]);
  useEffect(() => {
    if (!delaysOpen) return;
    const ids = [...new Set(delayRows.map(r => r.brief.id))].filter(id => !notifTimes[id]);
    if (ids.length === 0) return;
    Promise.all(ids.map(async id => [id, await getBriefNotificationTimes(id)] as const))
      .then(res => setNotifTimes(prev => ({ ...prev, ...Object.fromEntries(res) })));
  }, [delaysOpen, delayRows, notifTimes]);

  const filtered = briefs.filter(b => {
    if (search && !b.reference.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (responsibleFilter !== "all") {
      const stage = representativeStage(b);
      if (b.status !== "in_progress" || !stage || stage.role !== responsibleFilter) return false;
      if (responsibleFilter === "diseno" && disenoSelection.length > 0) {
        if (!b.assignedDisenoEmail || !disenoSelection.includes(b.assignedDisenoEmail.toLowerCase())) return false;
      }
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
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: MT.text1 }}>Briefs</h1>
          <p style={{ margin: "0.15rem 0 0", fontSize: 12.5, color: MT.text2 }}>Flujo de briefs de producto — Laura ↔ Diseño</p>
        </div>
        <img className="ftc-mascot" src={bunny.src} alt={bunny.label} title={`${onTimePct}% a tiempo — ${bunny.label}`} style={{ width: 110, height: 110, objectFit: "contain", flexShrink: 0 }} />
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
        {kpi("Retrasos Diseño", designDelays, designDelays > 0 ? MT.danger : MT.text1, () => setDelaysOpen(true), true)}
      </div>


      {delaysOpen && (
        <div onClick={() => setDelaysOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: MT.surface, borderRadius: MT.radiusLg, maxWidth: 720, width: "100%", maxHeight: "85vh", overflow: "auto", padding: "1.25rem 1.4rem", boxShadow: MT.shadowLg, fontFamily: MT.font }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: MT.text1 }}>Historial de retrasos — Diseño</h2>
              <button onClick={() => setDelaysOpen(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: MT.text2 }} aria-label="Cerrar">×</button>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 12.5, color: MT.text2 }}>Entregas de Diseño marcadas como tardías (briefs en proceso y completados este mes). Hora en Colombia.</p>
            {delayRows.length === 0 ? (
              <p style={{ fontSize: 13, color: MT.text3 }}>Sin retrasos registrados.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {delayRows.map(({ brief, stage, variant }) => (
                  <div key={`${brief.id}-${variant ?? ""}-${stage.key}`} style={{ border: `1px solid ${MT.border}`, borderLeft: `3px solid ${MT.danger}`, borderRadius: 8, padding: "0.65rem 0.85rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 800, fontSize: 13, color: MT.text1 }}>{brief.reference}{variant ? ` · ${variant}` : ""} — {stage.label}</span>
                      <button onClick={() => navigate(`/marketing/brief/${brief.id}`)} style={{ fontFamily: MT.font, fontSize: 12, fontWeight: 700, color: MT.primary, background: "none", border: "none", cursor: "pointer", padding: 0 }}>Ver brief →</button>
                    </div>
                    <div style={{ fontSize: 12.5, color: MT.text1, marginTop: 4, lineHeight: 1.5 }}>
                      {notifTimes[brief.id] ? lateExplanation(stage, notifTimes[brief.id]) : "Cargando hora de entrega…"}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 14, textAlign: "right" }}>
              <button onClick={() => { setDelaysOpen(false); focusGroups(["overdue"], "in_progress"); }} style={{ fontFamily: MT.font, fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: "6px 12px", borderRadius: 7, border: `1px solid ${MT.border}`, background: MT.surface, color: MT.text2 }}>Ver briefs atrasados en proceso</button>
            </div>
          </div>
        </div>
      )}

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
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {segButton(responsibleFilter === "all", () => setResponsibleFilter("all"), "Cualquiera", "r-all")}
          {segButton(responsibleFilter === "laura", () => setResponsibleFilter("laura"), <><Avatar role="laura" size={15} />Laura</>, "r-laura")}
          <DisenoFilterButton
            active={responsibleFilter === "diseno"} onActivate={() => setResponsibleFilter("diseno")}
            selected={disenoSelection} onChangeSelected={setDisenoSelection}
            options={disenoEmailList} disenoDisplayName={disenoDisplayName}
          />
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
                      const stage = representativeStage(b);
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
                            <StatusPill solid color={statusColor} label={b.status === "completed" ? "✓ Completado" : b.variants ? (stage?.label ? `${stage.label} (variante)` : "Con variantes") : stageLabel(b.currentStage)} />
                          </td>
                          <td style={{ padding: "0.55rem 0.9rem" }}>
                            {role ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <Avatar role={role} size={20} />
                                <span style={{ fontSize: 12, color: MT.text2 }}>
                                  {role === "diseno" && b.assignedDisenoEmail ? disenoDisplayName(b.assignedDisenoEmail) : ROLE_CFG[role].label}
                                </span>
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
