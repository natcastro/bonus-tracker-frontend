import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MT, formatDateHuman } from "../theme";
import { useMarketing } from "../context";
import StatusPill from "../components/StatusPill";
import DeadlineBadge from "../components/DeadlineBadge";
import { todoStageLabel, daysBetweenIso, todayIsoBogota, stageLate, isPastDeadline } from "../types";
import type { TodoTask } from "../types";
import { formatAht, isoWeekStart, subtractDaysIso } from "./TeamDashboardPage";

// A Video person's own dashboard — the same measures the team dashboard uses for Diseño (turnaround per delivery,
// on-time share, pending / completed / overdue), computed only from the To Do tasks assigned to them.
const isOverdue = (t: TodoTask) => {
  if (t.status !== "in_progress") return false;
  const st = t.stages.find(s => s.key === t.currentStage);
  return !!st && st.role === "diseno" && !!st.deadline && isPastDeadline(st.deadline);
};

export default function VideoDashboardPage() {
  const { todoTasks, authedUser, privateTasks } = useMarketing();
  const navigate = useNavigate();

  const mine = useMemo(() => todoTasks.filter(t => t.assignedDisenoEmail.toLowerCase() === authedUser?.email.toLowerCase()), [todoTasks, authedUser?.email]);
  const pending = mine.filter(t => t.status === "in_progress" && !isOverdue(t));
  const overdue = mine.filter(isOverdue);
  const completed = mine.filter(t => t.status === "completed");

  const entries = useMemo(() => {
    const out: { completedAt: string; late: boolean; days: number }[] = [];
    for (const t of mine) {
      t.stages.forEach((s, i) => {
        if (s.role !== "diseno" || s.status !== "done" || !s.completedAt) return;
        const start = (i > 0 ? t.stages[i - 1].completedAt : t.createdAt.slice(0, 10)) ?? t.createdAt.slice(0, 10);
        out.push({ completedAt: s.completedAt, late: stageLate(s), days: Math.max(0, daysBetweenIso(start, s.completedAt)) });
      });
    }
    return out;
  }, [mine]);
  const onTimePct = entries.length > 0 ? Math.round((100 * entries.filter(e => !e.late).length) / entries.length) : 100;
  const avgDays = entries.length > 0 ? entries.reduce((s, e) => s + e.days, 0) / entries.length : null;

  const weeks = useMemo(() => {
    const map = new Map<string, { total: number; onTime: number }>();
    entries.forEach(e => { const wk = isoWeekStart(e.completedAt); const c = map.get(wk) ?? { total: 0, onTime: 0 }; c.total++; if (!e.late) c.onTime++; map.set(wk, c); });
    const today = todayIsoBogota();
    return Array.from({ length: 8 }, (_, i) => { const wk = isoWeekStart(subtractDaysIso(today, (7 - i) * 7)); const v = map.get(wk) ?? { total: 0, onTime: 0 }; return { label: wk.slice(5), ...v }; });
  }, [entries]);
  const maxWeek = Math.max(1, ...weeks.map(w => w.total));

  const kpi = (label: string, value: string | number, color: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0.9rem 1.1rem", flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: MT.text3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
    </div>
  );

  const list = (title: string, tasks: TodoTask[], tone: string) => (
    <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, padding: "1rem 1.1rem", marginBottom: "1rem", boxShadow: MT.shadow }}>
      <p style={{ fontWeight: 700, fontSize: 11, color: MT.text2, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 0.6rem" }}>{title} ({tasks.length})</p>
      {tasks.length === 0 ? <p style={{ fontSize: 12.5, color: MT.text3, margin: 0 }}>Nada por aquí.</p> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {tasks.map(t => {
            const st = t.stages.find(s => s.key === t.currentStage);
            return (
              <button key={t.id} onClick={() => navigate(`/marketing/todo/${t.id}`)} style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", cursor: "pointer", fontFamily: MT.font, background: MT.surfaceAlt, border: `1px solid transparent`, borderLeft: `3px solid ${tone}`, borderRadius: 8, padding: "9px 12px" }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: MT.text1 }}>{t.title}</span>
                {t.status === "completed"
                  ? <StatusPill color={MT.primary} label={`✓ ${formatDateHuman(t.completedAt)}`} />
                  : <><span style={{ fontSize: 11.5, color: MT.text2 }}>{todoStageLabel(t.currentStage)}</span>{st?.deadline && <DeadlineBadge deadline={st.deadline} />}</>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "1.25rem 1.5rem", fontFamily: MT.font }}>
      <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: MT.text1 }}>Mi dashboard</h1>
      <p style={{ margin: "0.15rem 0 1.25rem", fontSize: 12.5, color: MT.text2 }}>Tus tareas, tus tiempos y qué tan a tiempo vas</p>

      <div style={{ display: "flex", flexWrap: "wrap", background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, boxShadow: MT.shadow, marginBottom: "1.25rem" }}>
        {kpi("Pendientes", pending.length, MT.clay)}
        {kpi("Vencidas", overdue.length, overdue.length > 0 ? MT.danger : MT.text1)}
        {kpi("Completadas", completed.length, MT.primary)}
        {kpi("A tiempo", `${onTimePct}%`, MT.moss)}
        {kpi("Tiempo promedio", avgDays === null ? "—" : formatAht(avgDays), MT.clay)}
        {kpi("Tareas privadas", privateTasks.filter(p => !p.completed).length, MT.text1)}
      </div>

      <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, padding: "1rem 1.1rem", marginBottom: "1rem", boxShadow: MT.shadow }}>
        <p style={{ fontWeight: 700, fontSize: 11, color: MT.text2, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 0.8rem" }}>Entregas por semana (últimas 8)</p>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 110 }}>
          {weeks.map(w => (
            <div key={w.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div title={`${w.onTime} de ${w.total} a tiempo`} style={{ width: "100%", maxWidth: 38, height: Math.max(3, (w.total / maxWeek) * 80), background: w.total === w.onTime ? MT.moss : MT.warn, borderRadius: 4 }} />
              <span style={{ fontSize: 10, color: MT.text3 }}>{w.label}</span>
            </div>
          ))}
        </div>
      </div>

      {list("Vencidas", overdue, MT.danger)}
      {list("Pendientes", pending, MT.clay)}
      {list("Completadas", [...completed].sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")), MT.primary)}
    </div>
  );
}
