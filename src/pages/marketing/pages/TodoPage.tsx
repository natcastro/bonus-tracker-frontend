import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MT } from "../theme";
import { useMarketing } from "../context";
import DeadlineBadge from "../components/DeadlineBadge";
import StatusPill from "../components/StatusPill";
import { SearchIcon, PaletteIcon } from "../../../components/icons";
import { todoStageLabel, isPastDeadline } from "../types";
import type { TodoTask } from "../types";
import { moodBird } from "../../../components/moodBird";

function isOverdueTodo(t: TodoTask): boolean {
  if (t.status !== "in_progress") return false;
  const stage = t.stages.find(s => s.key === t.currentStage);
  return !!stage?.deadline && isPastDeadline(stage.deadline);
}

export default function TodoPage() {
  const { todoTasks, disenoDisplayName } = useMarketing();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "in_progress" | "completed">("all");

  const pending = todoTasks.filter(t => t.status === "in_progress");
  const onTime = pending.filter(t => !isOverdueTodo(t));
  const late = pending.filter(t => isOverdueTodo(t));
  const completed = todoTasks.filter(t => t.status === "completed");
  const onTimePct = pending.length > 0 ? Math.round((100 * onTime.length) / pending.length) : 100;
  const bird = moodBird(onTimePct);

  const filtered = useMemo(() => todoTasks
    .filter(t => !search || t.title.toLowerCase().includes(search.toLowerCase()))
    .filter(t => statusFilter === "all" || t.status === statusFilter)
    .sort((a, b) => {
      const sa = a.stages.find(s => s.key === a.currentStage)?.deadline ?? a.completedAt ?? "";
      const sb = b.stages.find(s => s.key === b.currentStage)?.deadline ?? b.completedAt ?? "";
      return sb.localeCompare(sa);
    }), [todoTasks, search, statusFilter]);

  const kpi = (label: string, value: string | number, color: string, last?: boolean) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0.6rem 0.9rem", flex: 1, minWidth: 110, borderRight: last ? "none" : `1px solid ${MT.border}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: MT.text3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 16.5, fontWeight: 800, color }}>{value}</div>
    </div>
  );

  const segButton = (active: boolean, onClick: () => void, label: string) => (
    <button onClick={onClick} style={{
      fontFamily: MT.font, fontSize: 12, fontWeight: 700, cursor: "pointer",
      padding: "5px 11px", borderRadius: 7, whiteSpace: "nowrap",
      border: `1px solid ${active ? MT.clay : MT.border}`,
      background: active ? MT.claySoft : MT.surface,
      color: active ? MT.clay : MT.text2,
    }}>{label}</button>
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "1.25rem 1.5rem", fontFamily: MT.font }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.9rem", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: MT.text1 }}>To Do</h1>
          <p style={{ margin: "0.15rem 0 0", fontSize: 12.5, color: MT.text2 }}>Tareas rápidas de Karol — separado de Briefs</p>
        </div>
        <img src={bird.src} alt={bird.label} title={`${onTimePct}% a tiempo — ${bird.label}`} style={{ width: 110, height: 110, objectFit: "contain", flexShrink: 0 }} />
      </div>

      {/* KPI strip */}
      <div style={{
        display: "flex", flexWrap: "wrap", background: MT.surface, border: `1px solid ${MT.border}`,
        borderRadius: MT.radius, marginBottom: "1.25rem", overflow: "hidden", boxShadow: MT.shadow,
      }}>
        {kpi("Pendientes", pending.length, MT.text1)}
        {kpi("En proceso", pending.length, MT.info)}
        {kpi("A tiempo", onTime.length, MT.moss)}
        {kpi("En retraso", late.length, late.length > 0 ? MT.danger : MT.text1)}
        {kpi("Completadas", completed.length, MT.primary, true)}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.7rem", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 180px", maxWidth: 240 }}>
          <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", display: "flex", pointerEvents: "none" }}>
            <SearchIcon size={14} color={MT.text3} />
          </span>
          <input
            value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tarea..."
            style={{ fontFamily: MT.font, fontSize: 12.5, padding: "7px 11px 7px 30px", width: "100%", border: `1px solid ${MT.border}`, borderRadius: 7, outline: "none", boxSizing: "border-box" }}
          />
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {segButton(statusFilter === "all", () => setStatusFilter("all"), "Todos")}
          {segButton(statusFilter === "in_progress", () => setStatusFilter("in_progress"), "En proceso")}
          {segButton(statusFilter === "completed", () => setStatusFilter("completed"), "Completado")}
        </div>
      </div>

      {/* Task list */}
      <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radius, overflow: "hidden", boxShadow: MT.shadow }}>
        {filtered.length === 0 ? (
          <p style={{ padding: "2rem", textAlign: "center", color: MT.text3, fontSize: 13, margin: 0 }}>No hay tareas To Do para este filtro.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {filtered.map((t, i) => {
              const stage = t.stages.find(s => s.key === t.currentStage);
              const overdue = isOverdueTodo(t);
              return (
                <div
                  key={t.id}
                  onClick={() => navigate(`/marketing/todo/${t.id}`)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "0.75rem 1.1rem", cursor: "pointer",
                    borderTop: i === 0 ? "none" : `1px solid ${MT.border}`,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = MT.surfaceAlt)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: `${MT.clay}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <PaletteIcon size={16} color={MT.clay} />
                  </span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: MT.text1 }}>{t.title}</span>
                  <span style={{ fontSize: 11.5, color: MT.text3, minWidth: 90 }}>{disenoDisplayName(t.assignedDisenoEmail)}</span>
                  <StatusPill
                    solid={t.status === "completed"}
                    color={t.status === "completed" ? MT.primary : MT.clay}
                    label={t.status === "completed" ? "✓ Completado" : todoStageLabel(t.currentStage)}
                  />
                  {stage?.deadline && <DeadlineBadge deadline={stage.deadline} compact />}
                  {overdue && <StatusPill solid color={MT.danger} label="⚠ Urgente" />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
