import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MT } from "../theme";
import { useMarketing } from "../context";
import DeadlineBadge from "../components/DeadlineBadge";
import StatusPill from "../components/StatusPill";
import { SearchIcon, PaletteIcon } from "../../../components/icons";
import { todoStageLabel, requestStageLabel, isPastDeadline } from "../types";
import type { TodoTask, MarketingRequest } from "../types";
import { moodBird } from "../../../components/moodBird";
import { LinkIcon } from "../../../components/icons";
import DisenoFilterButton from "../components/DisenoFilterButton";

// Only a late Diseño stage counts as "overdue" — a task waiting on Carol's review never shows
// as late, since that delay isn't Diseño's to answer for.
function isOverdueTodo(t: TodoTask): boolean {
  if (t.status !== "in_progress") return false;
  const stage = t.stages.find(s => s.key === t.currentStage);
  if (!stage || stage.role !== "diseno") return false;
  return !!stage.deadline && isPastDeadline(stage.deadline);
}

function isOverdueRequest(r: MarketingRequest): boolean {
  if (r.status !== "in_progress") return false;
  const stage = r.stages.find(s => s.key === r.currentStage);
  if (!stage || stage.role !== "diseno") return false;
  return !!stage.deadline && isPastDeadline(stage.deadline);
}

type BoardItem =
  | { kind: "todo"; id: number; title: string; assignedDisenoEmail: string; status: "in_progress" | "completed"; sortKey: string; overdue: boolean; task: TodoTask }
  | { kind: "request"; id: number; title: string; assignedDisenoEmail: string | null; status: "in_progress" | "completed"; sortKey: string; overdue: boolean; request: MarketingRequest };

export default function TodoPage() {
  const { todoTasks, disenoDisplayName, disenoEmailList, requests } = useMarketing();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "in_progress" | "completed">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "todo" | "request">("all");
  const [disenoActive, setDisenoActive] = useState(false);
  // Empty = every Diseño person, once the Diseño filter is active.
  const [disenoSelection, setDisenoSelection] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Solicitudes asignadas a Diseño show up right alongside To Do tasks on the same public board —
  // visible to everyone, editable only by whoever it's assigned to (enforced on the detail page).
  const items = useMemo<BoardItem[]>(() => {
    const todoItems: BoardItem[] = todoTasks.map(t => ({
      kind: "todo", id: t.id, title: t.title, assignedDisenoEmail: t.assignedDisenoEmail,
      status: t.status, task: t, overdue: isOverdueTodo(t),
      sortKey: t.stages.find(s => s.key === t.currentStage)?.deadline ?? t.completedAt ?? "",
    }));
    const requestItems: BoardItem[] = requests.map(r => ({
      kind: "request", id: r.id, title: r.title, assignedDisenoEmail: r.assignedDisenoEmail,
      status: r.status, request: r, overdue: isOverdueRequest(r),
      sortKey: r.stages.find(s => s.key === r.currentStage)?.deadline ?? r.completedAt ?? "",
    }));
    return [...todoItems, ...requestItems];
  }, [todoTasks, requests]);

  const pending = items.filter(i => i.status === "in_progress");
  const onTime = pending.filter(i => !i.overdue);
  const late = pending.filter(i => i.overdue);
  const completed = items.filter(i => i.status === "completed");
  const onTimePct = pending.length > 0 ? Math.round((100 * onTime.length) / pending.length) : 100;
  const bird = moodBird(onTimePct);

  const filtered = useMemo(() => items
    .filter(i => !search || i.title.toLowerCase().includes(search.toLowerCase()))
    .filter(i => statusFilter === "all" || i.status === statusFilter)
    .filter(i => typeFilter === "all" || i.kind === typeFilter)
    .filter(i => {
      if (!disenoActive || disenoSelection.length === 0) return true;
      return !!i.assignedDisenoEmail && disenoSelection.includes(i.assignedDisenoEmail.toLowerCase());
    })
    .filter(i => !dateFrom || i.sortKey >= dateFrom)
    .filter(i => !dateTo || i.sortKey <= dateTo)
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey)), [items, search, statusFilter, typeFilter, disenoActive, disenoSelection, dateFrom, dateTo]);

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
          <p style={{ margin: "0.15rem 0 0", fontSize: 12.5, color: MT.text2 }}>Tareas rápidas de Karol y solicitudes asignadas a Diseño</p>
        </div>
        <img className="ftc-mascot" src={bird.src} alt={bird.label} title={`${onTimePct}% a tiempo — ${bird.label}`} style={{ width: 110, height: 110, objectFit: "contain", flexShrink: 0 }} />
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
        <div style={{ display: "flex", gap: 4 }}>
          {segButton(typeFilter === "all", () => setTypeFilter("all"), "Ambos")}
          {segButton(typeFilter === "todo", () => setTypeFilter("todo"), "To Do")}
          {segButton(typeFilter === "request", () => setTypeFilter("request"), "Externo")}
        </div>
        <DisenoFilterButton
          active={disenoActive} onActivate={() => setDisenoActive(v => !v)}
          selected={disenoSelection} onChangeSelected={setDisenoSelection}
          options={disenoEmailList} disenoDisplayName={disenoDisplayName}
        />
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="Desde" style={{
          fontFamily: MT.font, fontSize: 12, padding: "6px 8px", border: `1px solid ${MT.border}`, borderRadius: 7,
        }} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title="Hasta" style={{
          fontFamily: MT.font, fontSize: 12, padding: "6px 8px", border: `1px solid ${MT.border}`, borderRadius: 7,
        }} />
      </div>

      {/* Board */}
      <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radius, overflow: "hidden", boxShadow: MT.shadow }}>
        {filtered.length === 0 ? (
          <p style={{ padding: "2rem", textAlign: "center", color: MT.text3, fontSize: 13, margin: 0 }}>No hay tareas To Do para este filtro.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {filtered.map((item, i) => {
              const isTodo = item.kind === "todo";
              const stage = isTodo
                ? item.task.stages.find(s => s.key === item.task.currentStage)
                : item.request.stages.find(s => s.key === item.request.currentStage);
              return (
                <div
                  key={`${item.kind}-${item.id}`}
                  onClick={() => navigate(isTodo ? `/marketing/todo/${item.id}` : `/marketing/request/${item.id}`)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "0.75rem 1.1rem", cursor: "pointer",
                    borderTop: i === 0 ? "none" : `1px solid ${MT.border}`,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = MT.surfaceAlt)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: `${isTodo ? MT.clay : MT.violet}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {isTodo ? <PaletteIcon size={16} color={MT.clay} /> : <LinkIcon size={16} color={MT.violet} />}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: MT.text1 }}>{item.title}</span>
                  <span style={{ fontSize: 11.5, color: MT.text3, minWidth: 90 }}>
                    {isTodo ? disenoDisplayName(item.assignedDisenoEmail) : (item.assignedDisenoEmail ? disenoDisplayName(item.assignedDisenoEmail) : "Sin asignar")}
                  </span>
                  <StatusPill
                    solid={item.status === "completed"}
                    color={item.status === "completed" ? MT.primary : (isTodo ? MT.clay : MT.violet)}
                    label={item.status === "completed" ? "✓ Completado" : (isTodo ? todoStageLabel(item.task.currentStage) : requestStageLabel(item.request.currentStage))}
                  />
                  {stage?.deadline && <DeadlineBadge deadline={stage.deadline} compact />}
                  {item.overdue && <StatusPill solid color={MT.danger} label="⚠ Urgente" />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
