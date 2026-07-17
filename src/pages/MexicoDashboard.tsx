import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Agent, MexAgentGoal, MexAttendance, MexAttendanceDay, MexLiveSale, MexMonthlyGoal, MexScheduleEvent } from "../types";
import {
  getAgents, updateAgentName, createAgent, deleteAgent,
  getMexAttendance,
  getMexSales, addMexSale, deleteMexSale, updateMexSale, approveMexSale, rejectMexSale,
  getMexGoal, upsertMexGoal,
  getMexAgentGoals, upsertMexAgentGoal,
  getMexAttendanceDays, upsertMexAttendanceDay, deleteMexAttendanceDay,
  getMexScheduleEvents, addMexScheduleEvent, deleteMexScheduleEvent,
} from "../services/api";
import {
  MONTHS, ATTENDANCE_BONUS, calcGoalBonus, calcLiveSaleBonus,
} from "../services/mexBonus";

const YEARS = ["2025", "2026", "2027", "2028"];
const ADMIN_PASSWORD = "mex2026!";

const TAB_LABELS: Record<string, string> = {
  summary: "Resumen",
  asistencia: "Asistencia",
  horarios: "Horarios",
  meta: "Meta",
  ventas: "Ventas",
  settings: "Configuración",
};

const DOW_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const AGENT_COLORS = ["#16a34a", "#0891b2", "#7c3aed", "#dc2626", "#d97706", "#db2777"];
const SCHED_START = 7;
const SCHED_END = 22;
const PX_HR = 54;

function buildMonthGrid(year: number, month: number): (Date | null)[][] {
  const lastDate = new Date(year, month, 0).getDate();
  const weeks: (Date | null)[][] = [];
  let week: (Date | null)[] = new Array(6).fill(null);
  for (let d = 1; d <= lastDate; d++) {
    const dt = new Date(year, month - 1, d);
    const dow = dt.getDay();
    if (dow === 0) continue;
    week[dow - 1] = dt;
    if (dow === 6) { weeks.push(week); week = new Array(6).fill(null); }
  }
  if (week.some((x) => x !== null)) weeks.push(week);
  return weeks;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function timeMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function todayLocalStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dowIndex(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const jsDow = new Date(y, m - 1, d).getDay();
  return jsDow === 0 ? 6 : jsDow - 1;
}

function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return toDateStr(new Date(y, m - 1, d + days));
}

// ── AgentGoalRow (separate component to own its draft state) ─────────────────
function AgentGoalRow({ agent, agGoal, actual, pct, bonus, pctColor, year, month, onSaved, isAdmin }: {
  agent: Agent; agGoal: MexAgentGoal | null; actual: number;
  pct: number | null; bonus: number; pctColor: string;
  year: number; month: number; onSaved: () => void; isAdmin: boolean;
}) {
  const [draft, setDraft] = useState(String(agGoal?.goalAmount ?? ""));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saving) setDraft(String(agGoal?.goalAmount ?? ""));
  }, [agGoal?.goalAmount]);

  const save = async () => {
    if (!draft || isNaN(Number(draft))) return;
    setSaving(true);
    try {
      await upsertMexAgentGoal({ agentId: agent.id, year, month, goalAmount: Number(draft) });
      await onSaved();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      alert("Error al guardar meta: " + (e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>{agent.name}</td>
      <td style={{ padding: "0.6rem 0.75rem" }}>
        {isAdmin ? (
          <input
            type="number" min="0" placeholder="ej. 50000"
            className="form-control" style={{ width: 130, fontSize: "0.85rem" }}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setSaved(false); }}
            onBlur={save}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        ) : (
          <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
            {agGoal ? `MXN $${agGoal.goalAmount.toLocaleString("es-MX")}` : "—"}
          </span>
        )}
      </td>
      <td style={{ padding: "0.6rem 0.75rem" }}>MXN ${actual.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
      <td style={{ padding: "0.6rem 0.75rem", fontWeight: 700, color: pctColor }}>
        {pct !== null ? `${pct.toFixed(1)}%` : "—"}
      </td>
      <td style={{ padding: "0.6rem 0.75rem", fontWeight: 700, color: bonus > 0 ? "#16a34a" : "#64748b" }}>
        {pct !== null ? `MXN $${bonus.toLocaleString("es-MX")}` : "—"}
      </td>
      <td style={{ padding: "0.6rem 0.75rem" }}>
        {saved && <span style={{ color: "#16a34a", fontSize: "0.8rem" }}>✓ Guardado</span>}
        {saving && <span style={{ color: "#64748b", fontSize: "0.8rem" }}>Guardando...</span>}
      </td>
    </tr>
  );
}

// ── Export ventas to .xlsx (one row per SKU) ─────────────────────────────────
async function exportVentasXLSX(sales: MexLiveSale[], agents: Agent[], monthName: string, year: string) {
  const XLSX = await import("xlsx");
  const rows: (string | number)[][] = [];
  for (const s of sales) {
    const agentName = agents.find((a) => a.id === s.agentId)?.name ?? String(s.agentId);
    const skus = s.skus ? s.skus.split("|").filter(Boolean) : [""];
    const amountPerSku = skus.length > 1 ? s.salesAmount / skus.length : s.salesAmount;
    for (const sku of skus) {
      rows.push([agentName, s.date, amountPerSku, s.quantity, sku]);
    }
  }
  const ws = XLSX.utils.aoa_to_sheet([
    ["Agente", "Fecha", "Total Vendido (MXN)", "Cantidad", "SKU"],
    ...rows,
  ]);
  // Column widths
  ws["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ventas");
  XLSX.writeFile(wb, `ventas_mexico_${monthName}_${year}.xlsx`);
}

export default function MexicoDashboard() {
  const navigate = useNavigate();
  const isAdmin = sessionStorage.getItem("role") !== "staff";
  const [activeTab, setActiveTab] = useState("summary");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [attendance, setAttendance] = useState<MexAttendance[]>([]);
  const [attendanceDays, setAttendanceDays] = useState<MexAttendanceDay[]>([]);
  const [scheduleEvents, setScheduleEvents] = useState<MexScheduleEvent[]>([]);
  const [sales, setSales] = useState<MexLiveSale[]>([]);
  const [goal, setGoal] = useState<MexMonthlyGoal | null>(null);
  const [agentGoals, setAgentGoals] = useState<MexAgentGoal[]>([]);
  const [monthlyGoalDraft, setMonthlyGoalDraft] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);

  // Edit sale (SKU cancellation)
  const [editSale, setEditSale] = useState<MexLiveSale | null>(null);
  const [editSkus, setEditSkus] = useState<string[]>([]);
  const [editRefunds, setEditRefunds] = useState<Record<number, string>>({});
  const [savingSale, setSavingSale] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const load = useCallback(async () => {
    const [ag, att, sa, go] = await Promise.all([
      getAgents("MEX"),
      getMexAttendance(Number(year), month),
      getMexSales(Number(year), month),
      getMexGoal(Number(year), month),
    ]);
    setAgents(ag);
    setAttendance(att);
    setSales(sa);
    setGoal(go);
    // These tables may not exist yet — load independently so the rest of the page still works
    let hasErr = false;
    try {
      const attDays = await getMexAttendanceDays(Number(year), month);
      setAttendanceDays(attDays);
    } catch (e: any) {
      hasErr = true;
      setDbError("Falta crear tabla mex_attendance_days en Supabase: " + (e?.message ?? String(e)));
    }
    try {
      const schEv = await getMexScheduleEvents(Number(year), month);
      setScheduleEvents(schEv);
    } catch (e: any) {
      hasErr = true;
      setDbError((prev) => (prev ?? "") + "\nFalta crear tabla mex_schedule_events en Supabase: " + (e?.message ?? String(e)));
    }
    if (!hasErr) setDbError(null);
    try {
      const ag2 = await getMexAgentGoals(Number(year), month);
      setAgentGoals(ag2);
    } catch { /* table may not exist yet */ }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const requireAdmin = (action: () => void) => {
    setPendingAction(() => action);
    setPassword("");
    setPasswordError("");
    setShowPassword(true);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setShowPassword(false);
      pendingAction?.();
      setPendingAction(null);
    } else {
      setPasswordError("Contraseña incorrecta.");
    }
  };

  const getAttendance = (agentId: number) =>
    attendance.find((a) => a.agentId === agentId)?.status ?? "multiple";

  // ── Attendance day calendar
  const [calendarAgent, setCalendarAgent] = useState<Agent | null>(null);
  // noteDay: day whose note is being edited inline
  const [noteDay, setNoteDay] = useState<{ agentId: number; date: string; note: string } | null>(null);

  // Cycle order: unmarked → present → absent → late → justified → (delete)
  const STATUS_CYCLE: Array<MexAttendanceDay["status"]> = ["present", "absent", "late", "justified"];

  const handleDayClick = async (agentId: number, day: Date) => {
    if (!isAdmin) return;
    const ds = toDateStr(day);
    const existing = attendanceDays.find((d) => d.agentId === agentId && d.date === ds);
    const nextIdx = existing ? (STATUS_CYCLE.indexOf(existing.status) + 1) % (STATUS_CYCLE.length + 1) : 0;

    // Optimistically update UI first
    if (nextIdx === STATUS_CYCLE.length) {
      // Cycle back to unmarked — delete
      setAttendanceDays((prev) => prev.filter((d) => !(d.agentId === agentId && d.date === ds)));
      if (existing) {
        try { await deleteMexAttendanceDay(existing.id); } catch (e: any) { setDbError("Error al borrar día: " + (e?.message ?? e)); await load(); }
      }
    } else {
      const newStatus = STATUS_CYCLE[nextIdx];
      if (existing) {
        setAttendanceDays((prev) => prev.map((d) => d.agentId === agentId && d.date === ds ? { ...d, status: newStatus } : d));
      } else {
        setAttendanceDays((prev) => [...prev, { id: -1, agentId, date: ds, status: newStatus, note: "", year: Number(year), month }]);
      }
      try {
        await upsertMexAttendanceDay({ agentId, date: ds, status: newStatus, note: existing?.note ?? "", year: Number(year), month });
        await load();
      } catch (e: any) {
        setDbError("Error al guardar asistencia: " + (e?.message ?? e));
        await load();
      }
    }
  };

  const saveNote = async () => {
    if (!noteDay) return;
    try {
      const ex = attendanceDays.find((d) => d.agentId === noteDay.agentId && d.date === noteDay.date);
      if (ex) {
        await upsertMexAttendanceDay({ agentId: ex.agentId, date: ex.date, status: ex.status, note: noteDay.note, year: Number(year), month });
        await load();
      }
      setNoteDay(null);
    } catch (e: any) {
      setDbError("Error al guardar nota: " + (e?.message ?? e));
    }
  };

  const monthGrid = buildMonthGrid(Number(year), month);
  const todayStr = todayLocalStr();
  const [weekIdx, setWeekIdx] = useState(() => {
    const grid = buildMonthGrid(new Date().getFullYear(), new Date().getMonth() + 1);
    const idx = grid.findIndex((week) => week.some((d) => d && toDateStr(d) === todayLocalStr()));
    return idx >= 0 ? idx : 0;
  });

  // ── Schedule events
  const [showSchedForm, setShowSchedForm] = useState(false);
  const [livesCountOpen, setLivesCountOpen] = useState(false);
  const [schedForm, setSchedForm] = useState({ agentId: 0, date: "", startTime: "09:00", endTime: "18:00", note: "", repeat: false, repeatDays: [] as number[], repeatUntil: "" });

  const weekCols = monthGrid[weekIdx] ?? new Array(6).fill(null);

  const copyLastWeek = async () => {
    let prevCols: (Date | null)[];
    let prevScheds = scheduleEvents;
    if (weekIdx > 0) {
      prevCols = monthGrid[weekIdx - 1];
    } else {
      const prevM = month === 1 ? 12 : month - 1;
      const prevY = month === 1 ? Number(year) - 1 : Number(year);
      const prevGrid = buildMonthGrid(prevY, prevM);
      prevCols = prevGrid[prevGrid.length - 1];
      try { prevScheds = await getMexScheduleEvents(prevY, prevM); } catch { prevScheds = []; }
    }
    const prevDates = new Set(prevCols.filter(Boolean).map((d) => toDateStr(d!)));
    const toCopy = prevScheds.filter((s) => prevDates.has(s.date));
    if (toCopy.length === 0) { setDbError("No hay turnos en la semana anterior para copiar."); return; }
    if (!confirm(`¿Copiar ${toCopy.length} turno(s) de la semana anterior a esta semana?`)) return;
    try {
      for (const s of toCopy) {
        const prevDayIdx = prevCols.findIndex((d) => d && toDateStr(d) === s.date);
        if (prevDayIdx === -1) continue;
        const target = weekCols[prevDayIdx];
        if (!target) continue;
        const ds = toDateStr(target);
        const [sy, sm] = ds.split("-").map(Number);
        await addMexScheduleEvent({ agentId: s.agentId, date: ds, startTime: s.startTime.slice(0, 5), endTime: s.endTime.slice(0, 5), note: s.note, year: sy, month: sm });
      }
      await load();
    } catch (e: any) { setDbError("Error al copiar: " + (e?.message ?? e)); }
  };

  const submitSched = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedForm.agentId) { setDbError("Selecciona un agente."); return; }
    try {
      if (schedForm.repeat) {
        if (!schedForm.repeatUntil || schedForm.repeatDays.length === 0) {
          setDbError("Selecciona al menos un día y una fecha final para repetir.");
          return;
        }
        let cursor = schedForm.date;
        while (cursor <= schedForm.repeatUntil) {
          if (schedForm.repeatDays.includes(dowIndex(cursor))) {
            const [sy, sm] = cursor.split("-").map(Number);
            await addMexScheduleEvent({ agentId: Number(schedForm.agentId), date: cursor, startTime: schedForm.startTime, endTime: schedForm.endTime, note: schedForm.note, year: sy, month: sm });
          }
          cursor = addDaysStr(cursor, 1);
        }
      } else {
        const [schYear, schMonth] = schedForm.date.split("-").map(Number);
        await addMexScheduleEvent({ agentId: Number(schedForm.agentId), date: schedForm.date, startTime: schedForm.startTime, endTime: schedForm.endTime, note: schedForm.note, year: schYear, month: schMonth });
      }
      await load();
      setShowSchedForm(false);
      setSchedForm({ agentId: 0, date: "", startTime: "09:00", endTime: "18:00", note: "", repeat: false, repeatDays: [], repeatUntil: "" });
    } catch (e: any) {
      setDbError("Error al guardar turno: " + (e?.message ?? e));
    }
  };

  // ── Totals per agent
  const agentTotals = agents.map((ag) => {
    const agDays = attendanceDays.filter((d) => d.agentId === ag.id);
    const att = agDays.length > 0
      ? (agDays.some((d) => d.status === "absent" || d.status === "late") ? 0 : 1000)
      : (ATTENDANCE_BONUS[getAttendance(ag.id)] ?? 0);
    const agGoal = agentGoals.find((g) => g.agentId === ag.id);
    const agSalesTotal = sales.filter((s) => s.agentId === ag.id).reduce((sum, s) => sum + s.salesAmount, 0);
    const goalBonus = agGoal ? calcGoalBonus(agGoal.goalAmount, agSalesTotal) : 0;
    const livesBonus = sales
      .filter((s) => s.agentId === ag.id)
      .reduce((sum, s) => sum + calcLiveSaleBonus(s.salesAmount), 0);
    return { agent: ag, attendance: att, goal: goalBonus, lives: livesBonus, total: att + goalBonus + livesBonus };
  });

  // ── Sale form
  const [saleForm, setSaleForm] = useState({ agentId: 0, date: "", salesAmount: "", quantity: "", skus: [""] });
  const [saleError, setSaleError] = useState<string | null>(null);
  const [saleSaved, setSaleSaved] = useState(false);

  const submitSale = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaleError(null);
    if (!saleForm.agentId || saleForm.agentId === 0) {
      setSaleError("Selecciona un agente.");
      return;
    }
    if (!saleForm.date) {
      setSaleError("Selecciona una fecha.");
      return;
    }
    try {
      // Parse date parts directly from "YYYY-MM-DD" string — avoids all timezone issues
      const [saleYear, saleMonth] = saleForm.date.split("-").map(Number);
      if (saleYear !== Number(year) || saleMonth !== month) {
        setSaleError(`La fecha es de ${MONTHS[saleMonth - 1]} ${saleYear}, pero estás viendo ${MONTHS[month - 1]} ${year}. Cambia el mes/año arriba para ver esta venta después de guardar.`);
      }
      await addMexSale({
        agentId: Number(saleForm.agentId),
        date: saleForm.date,
        salesAmount: Number(saleForm.salesAmount),
        quantity: Number(saleForm.quantity),
        skus: saleForm.skus.filter((s) => s.trim() !== "").join("|"),
        year: saleYear,
        month: saleMonth,
        status: isAdmin ? "approved" : "pending",
      });
      await load();
      setSaleForm({ agentId: 0, date: "", salesAmount: "", quantity: "", skus: [""] });
      setSaleSaved(true);
      setTimeout(() => setSaleSaved(false), 2000);
    } catch (err: any) {
      setSaleError("Error al guardar venta: " + (err?.message ?? err));
    }
  };

  const handleDeleteSale = (id: number) => {
    requireAdmin(async () => { await deleteMexSale(id); await load(); });
  };

  const handleApproveSale = async (id: number) => {
    await approveMexSale(id);
    await load();
  };

  const handleRejectSale = async (id: number) => {
    await rejectMexSale(id);
    await load();
  };


  // ── Agent names
  const [agentNames, setAgentNames] = useState<Record<number, string>>({});
  useEffect(() => {
    const names: Record<number, string> = {};
    agents.forEach((a) => { names[a.id] = a.name; });
    setAgentNames(names);
  }, [agents]);

  const saveAgentName = async (id: number) => {
    await updateAgentName(id, agentNames[id]);
    await load();
  };

  // ── Add agent
  const [newAgentName, setNewAgentName] = useState("");
  const [agentAdded, setAgentAdded] = useState(false);

  const handleAddAgent = async () => {
    if (!newAgentName.trim()) return;
    await createAgent(newAgentName.trim(), "MEX");
    setNewAgentName("");
    setAgentAdded(true);
    setTimeout(() => setAgentAdded(false), 2000);
    await load();
  };

  const agentSales = (agentId: number) =>
    [...sales].filter((s) => s.agentId === agentId && s.status === "approved").sort((a, b) => b.date.localeCompare(a.date));
  const pendingSales = [...sales].filter((s) => s.status === "pending").sort((a, b) => b.date.localeCompare(a.date));

  const goalPct = goal && goal.goalAmount > 0
    ? ((goal.actualAmount / goal.goalAmount) * 100).toFixed(1)
    : null;

  return (
    <div>
      <nav className="top-nav">
        <div className="logo">Bonus Tracker — <span style={{ color: "#16a34a" }}>México</span></div>
        <ul className="nav-links">
          {["summary", "asistencia", "horarios", "meta", "ventas", ...(isAdmin ? ["settings"] : [])].map((tab) => (
            <li key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
              {TAB_LABELS[tab]}
            </li>
          ))}
        </ul>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <select className="month-selector" value={year} onChange={(e) => setYear(e.target.value)}>
            {YEARS.map((y) => <option key={y}>{y}</option>)}
          </select>
          <select className="month-selector" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <button className="btn btn-secondary btn-sm" onClick={() => { sessionStorage.clear(); navigate("/"); }}>Salir</button>
        </div>
      </nav>

      <main className="content-area">

        {/* RESUMEN */}
        {activeTab === "summary" && (
          <section>
            <header className="section-header"><h2>Resumen de Bonos — {MONTHS[month - 1]} {year}</h2></header>
            <div className="summary-cards">
              {agentTotals.map((t) => (
                <div key={t.agent.id} className="stat-card" style={{ borderTopColor: "#16a34a" }}>
                  <h3>{t.agent.name}</h3>
                  <div className="amount" style={{ color: "#16a34a" }}>MXN ${t.total.toFixed(2)}</div>
                </div>
              ))}
            </div>
            <div className="card" style={{ overflowX: "auto" }}>
              <h3>Desglose por Categoría</h3>
              <div style={{ overflowX: "auto" }}>
                <table className="data-table" style={{ minWidth: 400 }}>
                  <thead>
                    <tr><th>Categoría</th>{agents.map((a) => <th key={a.id} style={{ whiteSpace: "nowrap" }}>{a.name}</th>)}</tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ whiteSpace: "nowrap" }}>Asistencia</td>
                      {agentTotals.map((t) => <td key={t.agent.id}>MXN ${t.attendance.toFixed(2)}</td>)}
                    </tr>
                    <tr>
                      <td style={{ whiteSpace: "nowrap" }}>Meta del Mes {goalPct ? `(${goalPct}%)` : ""}</td>
                      {agentTotals.map((t) => <td key={t.agent.id}>MXN ${t.goal.toFixed(2)}</td>)}
                    </tr>
                    <tr>
                      <td style={{ whiteSpace: "nowrap" }}>Ventas en Live</td>
                      {agentTotals.map((t) => <td key={t.agent.id}>MXN ${t.lives.toFixed(2)}</td>)}
                    </tr>
                    <tr style={{ fontWeight: 600 }}>
                      <td style={{ whiteSpace: "nowrap" }}>Total</td>
                      {agentTotals.map((t) => <td key={t.agent.id}>MXN ${t.total.toFixed(2)}</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ASISTENCIA */}
        {activeTab === "asistencia" && (
          <section>
            <header className="section-header"><h2>Asistencia — {MONTHS[month - 1]} {year}</h2></header>

            {/* DB error banner */}
            {dbError && (
              <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1rem" }}>
                <div style={{ fontWeight: 700, color: "#dc2626", marginBottom: "0.4rem" }}>⚠️ Error de base de datos — corre este SQL en Supabase:</div>
                <pre style={{ fontSize: "0.75rem", color: "#7f1d1d", margin: "0 0 0.4rem", whiteSpace: "pre-wrap", background: "#fff5f5", padding: "0.5rem", borderRadius: 4 }}>{`CREATE TABLE IF NOT EXISTS mex_attendance_days (
  id BIGSERIAL PRIMARY KEY,
  agent_id BIGINT REFERENCES agents(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'present',
  note TEXT NOT NULL DEFAULT '',
  year INT NOT NULL, month INT NOT NULL,
  UNIQUE(agent_id, date)
);

CREATE TABLE IF NOT EXISTS mex_schedule_events (
  id BIGSERIAL PRIMARY KEY,
  agent_id BIGINT REFERENCES agents(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TEXT NOT NULL, end_time TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  year INT NOT NULL, month INT NOT NULL
);`}</pre>
                <div style={{ fontSize: "0.75rem", color: "#991b1b" }}>Error técnico: {dbError}</div>
              </div>
            )}

            {/* Agent list — click name to open calendar */}
            <div className="card">
              {agents.map((ag) => {
                const agDays = attendanceDays.filter((d) => d.agentId === ag.id);
                const hasAbsent = agDays.some((d) => d.status === "absent" || d.status === "late");
                const bonus = agDays.length > 0 ? (hasAbsent ? 0 : 1000) : null;
                const presentCount = agDays.filter((d) => d.status === "present" || d.status === "justified").length;
                const absentCount = agDays.filter((d) => d.status === "absent").length;
                const lateCount = agDays.filter((d) => d.status === "late").length;
                return (
                  <div key={ag.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 0", borderBottom: "1px solid #f1f5f9", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <button className="btn btn-secondary" style={{ fontWeight: 600 }} onClick={() => { setCalendarAgent(ag); setNoteDay(null); }}>
                        {ag.name}
                      </button>
                      <div style={{ display: "flex", gap: "0.4rem", fontSize: "0.78rem" }}>
                        {presentCount > 0 && <span style={{ background: "#dcfce7", color: "#16a34a", border: "1px solid #16a34a", borderRadius: 4, padding: "1px 6px" }}>✓ {presentCount}</span>}
                        {lateCount > 0 && <span style={{ background: "#fef3c7", color: "#d97706", border: "1px solid #d97706", borderRadius: 4, padding: "1px 6px" }}>⏰ {lateCount}</span>}
                        {absentCount > 0 && <span style={{ background: "#fee2e2", color: "#ef4444", border: "1px solid #ef4444", borderRadius: 4, padding: "1px 6px" }}>✗ {absentCount}</span>}
                      </div>
                    </div>
                    {bonus !== null && (
                      <span style={{ fontSize: "0.82rem", fontWeight: 600, color: hasAbsent ? "#ef4444" : "#16a34a" }}>
                        MXN ${bonus.toLocaleString()}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Calendar modal ── */}
            {calendarAgent && (() => {
              const ag = calendarAgent;
              const agDays = attendanceDays.filter((d) => d.agentId === ag.id);
              const STATUS_COLOR: Record<string, { bg: string; border: string; label: string }> = {
                present:   { bg: "#dcfce7", border: "#16a34a", label: "✓" },
                absent:    { bg: "#fee2e2", border: "#ef4444", label: "✗" },
                late:      { bg: "#fef3c7", border: "#d97706", label: "⏰" },
                justified: { bg: "#d1fae5", border: "#059669", label: "J" },
              };
              return (
                <div className="modal-overlay active" onClick={(e) => { if (e.target === e.currentTarget) { setCalendarAgent(null); setNoteDay(null); } }}>
                  <div className="modal" style={{ maxWidth: 400, width: "95vw" }}>
                    <div className="modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <h3 style={{ margin: 0 }}>Asistencia — {ag.name}</h3>
                      <button onClick={() => { setCalendarAgent(null); setNoteDay(null); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.4rem", lineHeight: 1, color: "var(--text-muted)" }}>×</button>
                    </div>

                    {/* Legend */}
                    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.85rem", fontSize: "0.74rem", color: "#64748b" }}>
                      <span>Clic para cambiar estado:</span>
                      {Object.entries(STATUS_COLOR).map(([s, c]) => (
                        <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                          <span style={{ width: 13, height: 13, backgroundColor: c.bg, border: `2px solid ${c.border}`, borderRadius: 3 }} />
                          {s === "present" ? "Presente" : s === "absent" ? "Falta" : s === "late" ? "Tarde" : "Justificada"}
                        </span>
                      ))}
                    </div>

                    {/* Calendar grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4 }}>
                      {DOW_LABELS.map((l) => (
                        <div key={l} style={{ textAlign: "center", fontSize: "0.68rem", fontWeight: 700, color: "#94a3b8", paddingBottom: 4 }}>{l}</div>
                      ))}
                      {monthGrid.map((week) =>
                        week.map((day, di) => {
                          if (!day) return <div key={`e-${di}`} />;
                          const ds = toDateStr(day);
                          const rec = agDays.find((d) => d.date === ds);
                          const sc = rec ? STATUS_COLOR[rec.status] : null;
                          const bg = sc ? sc.bg : "#f1f5f9";
                          const bc = sc ? sc.border : "#cbd5e1";
                          return (
                            <div
                              key={ds}
                              onClick={() => handleDayClick(ag.id, day)}
                              style={{ aspectRatio: "1", backgroundColor: bg, border: `2px solid ${bc}`, borderRadius: 7, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700, color: sc ? bc : "#64748b", userSelect: "none", transition: "transform 0.07s", lineHeight: 1.1 }}
                              onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.92)")}
                              onMouseUp={(e) => (e.currentTarget.style.transform = "")}
                              onMouseLeave={(e) => (e.currentTarget.style.transform = "")}
                            >
                              {day.getDate()}
                              {sc && <span style={{ fontSize: "0.58rem", marginTop: 1 }}>{sc.label}</span>}
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Note editor for absent/late days */}
                    <div style={{ marginTop: "0.85rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      {agDays.filter((d) => d.status === "absent" || d.status === "late").map((d) => (
                        <div key={d.id} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem" }}>
                          <span style={{ color: STATUS_COLOR[d.status].border, fontWeight: 700, whiteSpace: "nowrap", minWidth: 50 }}>
                            {new Date(d.date + "T12:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                          </span>
                          {noteDay?.date === d.date ? (
                            <>
                              <input autoFocus className="form-control" style={{ fontSize: "0.78rem", padding: "0.2rem 0.4rem", flex: 1 }} value={noteDay.note} onChange={(e) => setNoteDay({ ...noteDay, note: e.target.value })} placeholder="Nota..." />
                              <button className="btn btn-primary btn-sm" onClick={saveNote}>OK</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => setNoteDay(null)}>×</button>
                            </>
                          ) : (
                            <>
                              <span style={{ flex: 1, color: "#64748b" }}>{d.note || <em style={{ color: "#94a3b8" }}>Sin nota</em>}</span>
                              {isAdmin && <button className="btn btn-secondary btn-sm" onClick={() => setNoteDay({ agentId: d.agentId, date: d.date, note: d.note })}>✏️</button>}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

          </section>
        )}

        {/* HORARIOS */}
        {activeTab === "horarios" && (
          <section>
            <header className="section-header"><h2>Horarios — {MONTHS[month - 1]} {year}</h2></header>

            {dbError && (
              <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "0.6rem 0.9rem", marginBottom: "0.75rem", fontSize: "0.8rem", color: "#dc2626" }}>
                ⚠️ {dbError} — <strong>corre en Supabase:</strong> <code>ALTER TABLE mex_schedule_events DISABLE ROW LEVEL SECURITY;</code>
              </div>
            )}

            <div style={{ position: "relative" }}>
              {/* Floating lives count overlay */}
              {livesCountOpen && (
                <div style={{ position: "absolute", top: "3.75rem", left: 0, zIndex: 30, background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "0.85rem 1rem", minWidth: 180, boxShadow: "0 6px 20px rgba(0,0,0,0.13)" }}>
                  <div style={{ fontSize: "0.7rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.6rem" }}>Turnos por agente</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                    {agents.map((ag, i) => {
                      const count = scheduleEvents.filter((s) => s.agentId === ag.id).length;
                      const color = AGENT_COLORS[i % AGENT_COLORS.length];
                      return (
                        <div key={ag.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", minWidth: 0 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                            <span style={{ fontSize: "0.82rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ag.name}</span>
                          </div>
                          <span style={{ fontSize: "0.82rem", fontWeight: 800, color, background: color + "18", borderRadius: 100, padding: "1px 8px", flexShrink: 0 }}>{count}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: "0.6rem", paddingTop: "0.5rem", borderTop: "1px solid #f1f5f9", fontSize: "0.72rem", color: "#94a3b8" }}>
                    Total: <strong style={{ color: "#0f172a" }}>{scheduleEvents.length}</strong>
                  </div>
                </div>
              )}

              {/* Weekly calendar — full width */}
              <div className="card" style={{ minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <button
                      onClick={() => setLivesCountOpen((o) => !o)}
                      title="Ver resumen de turnos por agente"
                      style={{ background: livesCountOpen ? "#f0fdf4" : "white", border: `1px solid ${livesCountOpen ? "#15803d" : "#e2e8f0"}`, borderRadius: 7, padding: "0.3rem 0.6rem", cursor: "pointer", fontSize: "0.78rem", fontWeight: 700, color: livesCountOpen ? "#15803d" : "#64748b", display: "flex", alignItems: "center", gap: "0.3rem" }}
                    >
                      📋 {livesCountOpen ? "▲" : "▼"}
                    </button>
                    <h3 style={{ margin: 0 }}>Horarios Registrados</h3>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => setWeekIdx((i) => Math.max(0, i - 1))} disabled={weekIdx === 0}>← Anterior</button>
                    <span style={{ fontSize: "0.82rem", fontWeight: 600, minWidth: 90, textAlign: "center" }}>Semana {weekIdx + 1} / {monthGrid.length}</span>
                    <button className="btn btn-sm btn-secondary" onClick={() => setWeekIdx((i) => Math.min(monthGrid.length - 1, i + 1))} disabled={weekIdx >= monthGrid.length - 1}>Siguiente →</button>
                    {isAdmin && <button className="btn btn-sm btn-secondary" onClick={copyLastWeek} title="Copia los turnos de la semana anterior a esta semana">⎘ Copiar sem. anterior</button>}
                    {isAdmin && <button className="btn btn-sm btn-primary" onClick={() => { setSchedForm((f) => ({ ...f, agentId: f.agentId || agents[0]?.id || 0 })); setShowSchedForm(true); }}>+ Agregar Turno</button>}
                  </div>
                </div>

                {/* Agent color legend */}
                <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                  {agents.map((ag, i) => (
                    <span key={ag.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.78rem" }}>
                      <span style={{ width: 12, height: 12, borderRadius: 3, background: AGENT_COLORS[i % AGENT_COLORS.length], display: "inline-block" }} />
                      {ag.name}
                    </span>
                  ))}
                </div>

                <div style={{ overflowX: "auto" }}>
                  <div style={{ minWidth: 560 }}>
                    {/* Day header */}
                    <div style={{ display: "grid", gridTemplateColumns: "52px repeat(6, 1fr)", borderBottom: "2px solid var(--border)" }}>
                      <div />
                      {weekCols.map((day, i) => {
                        const isToday = day ? toDateStr(day) === todayStr : false;
                        return (
                          <div key={i} style={{ textAlign: "center", padding: "0.4rem 0", borderLeft: "1px solid var(--border)" }}>
                            <div style={{ fontSize: "0.7rem", color: isToday ? "#15803d" : "var(--text-muted)", fontWeight: isToday ? 700 : 400 }}>{DOW_LABELS[i]}</div>
                            <div style={{
                              fontSize: "0.9rem", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center",
                              width: 24, height: 24, borderRadius: "50%", margin: "0 auto",
                              background: isToday ? "#15803d" : "transparent",
                              color: isToday ? "white" : "inherit",
                            }}>
                              {day ? day.getDate() : "—"}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Time grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "52px repeat(6, 1fr)", height: `${(SCHED_END - SCHED_START) * PX_HR}px`, position: "relative" }}>
                      {/* Hour labels */}
                      <div>
                        {Array.from({ length: SCHED_END - SCHED_START }, (_, i) => (
                          <div key={i} style={{ height: PX_HR, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 6, paddingTop: 2, fontSize: "0.65rem", color: "var(--text-muted)", borderTop: i > 0 ? "1px solid #f1f5f9" : "none" }}>
                            {String(SCHED_START + i).padStart(2, "0")}:00
                          </div>
                        ))}
                      </div>

                      {/* Day columns */}
                      {weekCols.map((day, colIdx) => {
                        const ds = day ? toDateStr(day) : "";
                        const colEvs = day ? scheduleEvents.filter((e) => e.date === ds) : [];
                        const isToday = ds === todayStr;
                        return (
                          <div
                            key={colIdx}
                            style={{ position: "relative", borderLeft: "1px solid #f1f5f9", background: isToday ? "#f0fdf4" : "transparent", cursor: day && isAdmin ? "crosshair" : "default" }}
                            onClick={day && isAdmin ? (e) => {
                              if ((e.target as HTMLElement).closest("[data-ev]")) return;
                              const rect = e.currentTarget.getBoundingClientRect();
                              const clickY = e.clientY - rect.top;
                              const rawMins = SCHED_START * 60 + (clickY / PX_HR) * 60;
                              const snapped = Math.round(rawMins / 30) * 30;
                              const sh = Math.floor(snapped / 60) % 24;
                              const sm = snapped % 60;
                              const eh = Math.floor((snapped + 180) / 60) % 24;
                              const em = (snapped + 180) % 60;
                              const startTime = `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}`;
                              const endTime = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
                              setSchedForm((f) => ({ ...f, agentId: f.agentId || agents[0]?.id || 0, date: ds, startTime, endTime }));
                              setShowSchedForm(true);
                            } : undefined}
                          >
                            {Array.from({ length: SCHED_END - SCHED_START }, (_, i) => (
                              <div key={i} style={{ position: "absolute", top: i * PX_HR, left: 0, right: 0, borderTop: i > 0 ? "1px solid #f1f5f9" : "none", height: PX_HR }} />
                            ))}
                            {colEvs.map((ev) => {
                              const topPx = ((timeMins(ev.startTime) - SCHED_START * 60) / 60) * PX_HR;
                              const h = Math.max(((timeMins(ev.endTime) - timeMins(ev.startTime)) / 60) * PX_HR, 22);
                              const agIdx = agents.findIndex((a) => a.id === ev.agentId);
                              const color = AGENT_COLORS[agIdx % AGENT_COLORS.length] ?? "#16a34a";
                              return (
                                <div
                                  key={ev.id}
                                  data-ev="1"
                                  onDoubleClick={isAdmin ? async (e) => { e.stopPropagation(); try { await deleteMexScheduleEvent(ev.id); await load(); } catch (e: any) { setDbError("Error al borrar turno: " + (e?.message ?? e)); } } : undefined}
                                  title={isAdmin ? "Doble clic para eliminar" : undefined}
                                  style={{ position: "absolute", top: topPx, height: h, left: 2, right: 2, background: color + "22", border: `1.5px solid ${color}`, borderRadius: 4, padding: "2px 4px", fontSize: "0.66rem", overflow: "hidden", zIndex: 1, cursor: "pointer", userSelect: "none" }}
                                >
                                  <div style={{ fontWeight: 700, color, lineHeight: 1.3 }}>{agents.find((a) => a.id === ev.agentId)?.name ?? ""}</div>
                                  <div style={{ color: "var(--text-muted)", lineHeight: 1.2 }}>{ev.startTime}–{ev.endTime}</div>
                                  {ev.note && <div style={{ color: "var(--text-muted)", lineHeight: 1.2, fontStyle: "italic" }}>{ev.note}</div>}
                                  {isAdmin && <div style={{ color, fontSize: "0.58rem", opacity: 0.7, lineHeight: 1.2 }}>doble clic para borrar</div>}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Add shift modal */}
            {showSchedForm && (
              <div className="modal-overlay active">
                <div className="modal">
                  <div className="modal-header"><h3>Agregar Turno</h3></div>
                  <form onSubmit={submitSched}>
                    <div className="form-group">
                      <label>Agente</label>
                      <select className="form-control" value={schedForm.agentId} onChange={(e) => setSchedForm({ ...schedForm, agentId: Number(e.target.value) })} required>
                        <option value={0} disabled>Seleccionar agente</option>
                        {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Día</label>
                      <input type="date" className="form-control" value={schedForm.date} onChange={(e) => setSchedForm({ ...schedForm, date: e.target.value })} required />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                      <div className="form-group">
                        <label>Inicio</label>
                        <input type="time" className="form-control" value={schedForm.startTime} onChange={(e) => setSchedForm({ ...schedForm, startTime: e.target.value })} required />
                      </div>
                      <div className="form-group">
                        <label>Fin</label>
                        <input type="time" className="form-control" value={schedForm.endTime} onChange={(e) => setSchedForm({ ...schedForm, endTime: e.target.value })} required />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Nota (opcional)</label>
                      <input type="text" className="form-control" value={schedForm.note} onChange={(e) => setSchedForm({ ...schedForm, note: e.target.value })} placeholder="ej. Turno matutino" />
                    </div>
                    <div className="form-group">
                      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                        <input type="checkbox" checked={schedForm.repeat} onChange={(e) => setSchedForm({ ...schedForm, repeat: e.target.checked, repeatDays: [], repeatUntil: "" })} />
                        Repetir semanalmente
                      </label>
                    </div>
                    {schedForm.repeat && (
                      <>
                        <div className="form-group">
                          <label>Repetir los días:</label>
                          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.3rem" }}>
                            {DOW_LABELS.map((d, i) => (
                              <button key={i} type="button" onClick={() => setSchedForm((f) => ({ ...f, repeatDays: f.repeatDays.includes(i) ? f.repeatDays.filter((x) => x !== i) : [...f.repeatDays, i] }))}
                                style={{ padding: "0.35rem 0.8rem", borderRadius: 100, fontSize: "0.8rem", cursor: "pointer", fontWeight: schedForm.repeatDays.includes(i) ? 700 : 400, border: "2px solid", borderColor: schedForm.repeatDays.includes(i) ? "#e91e8c" : "var(--border)", background: schedForm.repeatDays.includes(i) ? "#e91e8c15" : "white", color: schedForm.repeatDays.includes(i) ? "#e91e8c" : "var(--text-muted)" }}>
                                {d}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="form-group">
                          <label>Repetir hasta</label>
                          <input type="date" className="form-control" value={schedForm.repeatUntil} onChange={(e) => setSchedForm({ ...schedForm, repeatUntil: e.target.value })} required={schedForm.repeat} />
                        </div>
                      </>
                    )}
                    <div className="modal-actions">
                      <button type="button" className="btn btn-secondary" onClick={() => { setShowSchedForm(false); setSchedForm({ agentId: 0, date: "", startTime: "09:00", endTime: "18:00", note: "", repeat: false, repeatDays: [], repeatUntil: "" }); }}>Cancelar</button>
                      <button type="submit" className="btn btn-primary">Agregar</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </section>
        )}

        {/* META */}
        {activeTab === "meta" && (
          <section>
            <header className="section-header"><h2>Meta del Mes — {MONTHS[month - 1]} {year}</h2></header>

            {/* ── Monthly goal + live distribution ── */}
            {(() => {
              const totalLives = scheduleEvents.length;
              const totalSales = sales.reduce((s, x) => s + x.salesAmount, 0);
              const metaAmount = goal?.goalAmount ?? 0;
              return (
                <div className="card" style={{ marginBottom: "1.25rem" }}>
                  {/* Goal input row */}
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginBottom: metaAmount > 0 ? "1.25rem" : 0 }}>
                    <div>
                      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Meta del mes</div>
                      {isAdmin ? (
                        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                          <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#64748b" }}>MXN $</span>
                          <input
                            type="number" min="0" placeholder="ej. 266000"
                            value={monthlyGoalDraft || (metaAmount > 0 ? String(metaAmount) : "")}
                            onChange={(e) => setMonthlyGoalDraft(e.target.value)}
                            style={{ width: 130, padding: "0.3rem 0.6rem", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: "0.9rem" }}
                          />
                          <button className="btn btn-primary btn-sm" disabled={savingGoal} onClick={async () => {
                            const v = Number(monthlyGoalDraft);
                            if (!v) return;
                            setSavingGoal(true);
                            try {
                              await upsertMexGoal({ year: Number(year), month, goalAmount: v, actualAmount: totalSales });
                              // Auto-sync proportional goals to per-agent table
                              if (totalLives > 0) {
                                for (const ag of agents) {
                                  const agLives = scheduleEvents.filter((s) => s.agentId === ag.id).length;
                                  const propMeta = Math.round((agLives / totalLives) * v);
                                  await upsertMexAgentGoal({ agentId: ag.id, year: Number(year), month, goalAmount: propMeta });
                                }
                              }
                              await load(); setMonthlyGoalDraft("");
                            }
                            catch (e: any) { setDbError("Error al guardar meta: " + (e?.message ?? e)); }
                            finally { setSavingGoal(false); }
                          }}>{savingGoal ? "..." : "Guardar y sincronizar"}</button>
                        </div>
                      ) : (
                        <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#0f172a" }}>
                          {metaAmount > 0 ? `MXN $${metaAmount.toLocaleString("es-MX")}` : "—"}
                        </div>
                      )}
                    </div>
                    {metaAmount > 0 && (
                      <>
                        <div style={{ width: 1, height: 40, background: "#e2e8f0" }} />
                        <div>
                          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Total lives</div>
                          <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#0f172a" }}>{totalLives}</div>
                        </div>
                        <div style={{ width: 1, height: 40, background: "#e2e8f0" }} />
                        <div>
                          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Ventas totales</div>
                          <div style={{ fontSize: "1.3rem", fontWeight: 800, color: totalSales >= metaAmount ? "#16a34a" : "#dc2626" }}>MXN ${totalSales.toLocaleString("es-MX")}</div>
                        </div>
                        <div style={{ width: 1, height: 40, background: "#e2e8f0" }} />
                        <div>
                          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Cumplimiento</div>
                          <div style={{ fontSize: "1.3rem", fontWeight: 800, color: totalSales >= metaAmount ? "#16a34a" : "#dc2626" }}>{((totalSales / metaAmount) * 100).toFixed(1)}%</div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Distribution table */}
                  {metaAmount > 0 && totalLives > 0 && (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                        <thead>
                          <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                            <th style={{ padding: "0.45rem 0.75rem" }}>Agente</th>
                            <th style={{ padding: "0.45rem 0.75rem", textAlign: "center" }}>Lives</th>
                            <th style={{ padding: "0.45rem 0.75rem", textAlign: "center" }}>% de lives</th>
                            <th style={{ padding: "0.45rem 0.75rem", textAlign: "right" }}>Meta proporcional</th>
                            <th style={{ padding: "0.45rem 0.75rem", textAlign: "right" }}>Ventas reales</th>
                            <th style={{ padding: "0.45rem 0.75rem", textAlign: "center" }}>Cumplimiento</th>
                          </tr>
                        </thead>
                        <tbody>
                          {agents.map((ag, i) => {
                            const agLives = scheduleEvents.filter((s) => s.agentId === ag.id).length;
                            const agSales = sales.filter((s) => s.agentId === ag.id).reduce((sum, s) => sum + s.salesAmount, 0);
                            const pctLives = totalLives > 0 ? (agLives / totalLives) * 100 : 0;
                            const propMeta = (pctLives / 100) * metaAmount;
                            const cumplimiento = propMeta > 0 ? (agSales / propMeta) * 100 : null;
                            const color = AGENT_COLORS[i % AGENT_COLORS.length];
                            return (
                              <tr key={ag.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                <td style={{ padding: "0.5rem 0.75rem" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                    <span style={{ width: 9, height: 9, borderRadius: 2, background: color, flexShrink: 0 }} />
                                    <span style={{ fontWeight: 600 }}>{ag.name}</span>
                                  </div>
                                </td>
                                <td style={{ padding: "0.5rem 0.75rem", textAlign: "center", fontWeight: 700 }}>{agLives}</td>
                                <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>
                                  <span style={{ background: color + "18", color, fontWeight: 700, borderRadius: 100, padding: "2px 10px", fontSize: "0.78rem" }}>{pctLives.toFixed(1)}%</span>
                                </td>
                                <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 700 }}>MXN ${Math.round(propMeta).toLocaleString("es-MX")}</td>
                                <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: cumplimiento !== null && cumplimiento >= 100 ? "#16a34a" : "#64748b" }}>MXN ${agSales.toLocaleString("es-MX")}</td>
                                <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>
                                  {cumplimiento !== null ? (
                                    <span style={{ fontWeight: 800, color: cumplimiento >= 100 ? "#16a34a" : cumplimiento >= 70 ? "#d97706" : "#dc2626" }}>{cumplimiento.toFixed(1)}%</span>
                                  ) : <span style={{ color: "#94a3b8" }}>—</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Bonus reference card */}
            <div className="card" style={{ marginBottom: "1rem", display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "center", fontSize: "0.85rem" }}>
              <strong>Tabla de bonos:</strong>
              <span style={{ color: "#f59e0b" }}>≥ 140% → MXN $1,500</span>
              <span style={{ color: "#16a34a" }}>≥ 100% → MXN $1,000</span>
              <span style={{ color: "#ef4444" }}>&lt; 100% → MXN $0</span>
            </div>

            {/* Per-agent goals table */}
            <div className="card" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                    <th style={{ padding: "0.5rem 0.75rem" }}>Agente</th>
                    <th style={{ padding: "0.5rem 0.75rem" }}>Meta (MXN $)</th>
                    <th style={{ padding: "0.5rem 0.75rem" }}>Ventas Reales</th>
                    <th style={{ padding: "0.5rem 0.75rem" }}>Cumplimiento</th>
                    <th style={{ padding: "0.5rem 0.75rem" }}>Bono</th>
                    <th style={{ padding: "0.5rem 0.75rem" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((ag) => {
                    const agGoal = agentGoals.find((g) => g.agentId === ag.id);
                    const actual = sales.filter((s) => s.agentId === ag.id).reduce((sum, s) => sum + s.salesAmount, 0);
                    const pct = agGoal && agGoal.goalAmount > 0 ? (actual / agGoal.goalAmount) * 100 : null;
                    const bonus = pct !== null ? calcGoalBonus(agGoal!.goalAmount, actual) : 0;
                    const pctColor = pct === null ? "#64748b" : pct >= 140 ? "#f59e0b" : pct >= 100 ? "#16a34a" : "#ef4444";
                    return (
                      <AgentGoalRow
                        key={ag.id}
                        agent={ag}
                        agGoal={agGoal ?? null}
                        actual={actual}
                        pct={pct}
                        bonus={bonus}
                        pctColor={pctColor}
                        year={Number(year)}
                        month={month}
                        onSaved={load}
                        isAdmin={isAdmin}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* VENTAS */}
        {activeTab === "ventas" && (
          <section>
            <header className="section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>Ventas en Live</h2>
              <button className="btn btn-primary btn-sm" onClick={() => exportVentasXLSX(sales, agents, MONTHS[month - 1], year)}>⬇ Exportar Excel (.xlsx)</button>
            </header>

            {/* Cola de aprobaciones (solo admin) */}
            {isAdmin && pendingSales.length > 0 && (
              <div className="card" style={{ borderLeft: "4px solid #d97706", marginBottom: "1.25rem" }}>
                <h3 style={{ marginBottom: "0.75rem", color: "#d97706" }}>⏳ Ventas Pendientes de Aprobación ({pendingSales.length})</h3>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Agente</th>
                      <th>Fecha</th>
                      <th>Total Vendido</th>
                      <th>Artículos</th>
                      <th>SKUs</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingSales.map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 600 }}>{agents.find((a) => a.id === s.agentId)?.name ?? "—"}</td>
                        <td>{s.date}</td>
                        <td>MXN ${s.salesAmount.toLocaleString("es-MX")}</td>
                        <td style={{ textAlign: "center" }}>{s.quantity}</td>
                        <td style={{ maxWidth: 180 }}>
                          {s.skus ? s.skus.split("|").map((sku, i) => (
                            <span key={i} style={{ display: "inline-block", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 4, padding: "0.1rem 0.4rem", fontSize: "0.76rem", fontFamily: "monospace", marginRight: "0.25rem", marginBottom: "0.15rem" }}>{sku.trim()}</span>
                          )) : "—"}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "0.4rem" }}>
                            <button className="btn btn-sm btn-primary" style={{ background: "#16a34a", borderColor: "#16a34a" }} onClick={() => handleApproveSale(s.id)}>✓ Aprobar</button>
                            <button className="btn btn-sm btn-danger" onClick={() => handleRejectSale(s.id)}>✗ Rechazar</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Formulario de registro */}
            <div className="card">
              <p style={{ marginBottom: "1rem", color: "var(--text-muted)" }}>
                {isAdmin
                  ? "Registra las ventas de cada live. El bono se calcula automáticamente por tier."
                  : "Registra una venta para que el administrador la revise y apruebe."}
              </p>
              <form onSubmit={submitSale}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Agente</label>
                    <select className="form-control" value={saleForm.agentId} onChange={(e) => setSaleForm({ ...saleForm, agentId: Number(e.target.value) })} required>
                      <option value={0} disabled>Seleccionar agente</option>
                      {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Fecha</label>
                    <input type="date" className="form-control" value={saleForm.date} onChange={(e) => setSaleForm({ ...saleForm, date: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Total Vendido (MXN $)</label>
                    <input type="number" min="0" className="form-control" placeholder="ej. 12500" value={saleForm.salesAmount} onChange={(e) => setSaleForm({ ...saleForm, salesAmount: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Cantidad de Artículos</label>
                    <input type="number" min="0" className="form-control" placeholder="ej. 35" value={saleForm.quantity} onChange={(e) => setSaleForm({ ...saleForm, quantity: e.target.value })} required />
                  </div>
                </div>
                <div className="form-group" style={{ marginTop: "0.5rem" }}>
                  <label>SKUs / Referencias</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {saleForm.skus.map((sku, i) => (
                      <div key={i} style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="ej. SKU-001"
                          value={sku}
                          onChange={(e) => {
                            const updated = [...saleForm.skus];
                            updated[i] = e.target.value;
                            setSaleForm({ ...saleForm, skus: updated });
                          }}
                          style={{ fontFamily: "monospace", fontSize: "0.875rem" }}
                        />
                        {saleForm.skus.length > 1 && (
                          <button type="button" onClick={() => setSaleForm({ ...saleForm, skus: saleForm.skus.filter((_, j) => j !== i) })}
                            style={{ background: "none", border: "1px solid var(--border)", borderRadius: "4px", cursor: "pointer", color: "var(--text-muted)", padding: "0.3rem 0.6rem", lineHeight: 1 }}>
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <button type="button" onClick={() => setSaleForm({ ...saleForm, skus: [...saleForm.skus, ""] })}
                      style={{ alignSelf: "flex-start", background: "none", border: "1px dashed var(--border)", borderRadius: "4px", cursor: "pointer", color: "#059669", padding: "0.3rem 0.75rem", fontSize: "0.875rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                      <span style={{ fontSize: "1.1rem", lineHeight: 1 }}>+</span> Agregar SKU
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "1rem" }}>
                  <button type="submit" className="btn btn-primary">{saleSaved ? "¡Enviado! ✓" : isAdmin ? "Agregar Live" : "Enviar para aprobación"}</button>
                  {saleError && <span style={{ color: "#ef4444", fontSize: "0.85rem" }}>⚠ {saleError}</span>}
                  {saleSaved && <span style={{ color: "#16a34a", fontSize: "0.85rem" }}>Venta registrada correctamente.</span>}
                </div>
              </form>
            </div>

            {/* Layout de dos columnas: agentes a la izquierda, tabla de tiers a la derecha */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "1.5rem", alignItems: "start" }}>

              {/* Columna izquierda: bonificaciones por agente */}
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                {agents.map((ag) => {
                  const agSales = agentSales(ag.id);
                  const totalBonus = agSales.reduce((s, sale) => s + calcLiveSaleBonus(sale.salesAmount), 0);
                  return (
                    <div key={ag.id} className="card" style={{ overflowX: "auto" }}>
                      {/* Banner de advertencia */}
                      <div style={{
                        background: "#fef9c3",
                        border: "1px solid #fde047",
                        borderRadius: "6px",
                        padding: "0.6rem 0.9rem",
                        marginBottom: "1rem",
                        fontSize: "0.82rem",
                        color: "#713f12",
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "flex-start",
                      }}>
                        <span style={{ fontSize: "1rem" }}>⚠️</span>
                        <span>
                          <strong>Importante:</strong> todas las ventas realizadas en un mismo día deben registrarse como
                          una sola entrada con el total sumado. Subir entradas separadas por el mismo día puede afectar
                          el cálculo del bono mensual.
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                        <h3>{ag.name}</h3>
                        <div className="badge badge-success" style={{ fontSize: "1rem", padding: "0.5rem 1rem" }}>
                          Total Lives: MXN ${totalBonus.toFixed(2)}
                        </div>
                      </div>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Total Vendido</th>
                            <th>Artículos</th>
                            <th>SKUs / Referencias</th>
                            <th>Bono</th>
                            <th>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {agSales.map((s) => (
                            <tr key={s.id}>
                              <td>{s.date}</td>
                              <td>MXN ${s.salesAmount.toLocaleString("es-MX")}</td>
                              <td style={{ textAlign: "center" }}>{s.quantity}</td>
                              <td style={{ maxWidth: "220px" }}>
                                {s.skus
                                  ? s.skus.split("|").map((sku, i) => (
                                      <span key={i} style={{ display: "inline-block", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "4px", padding: "0.1rem 0.45rem", fontSize: "0.78rem", fontFamily: "monospace", marginRight: "0.3rem", marginBottom: "0.2rem" }}>{sku.trim()}</span>
                                    ))
                                  : "—"}
                              </td>
                              <td>MXN ${calcLiveSaleBonus(s.salesAmount).toFixed(2)}</td>
                              {isAdmin && <td>
                                <div style={{ display: "flex", gap: "0.3rem" }}>
                                  <button className="btn btn-sm btn-secondary" onClick={() => { setEditSale(s); setEditSkus(s.skus ? s.skus.split("|").map((x) => x.trim()).filter(Boolean) : []); setEditRefunds({}); }}>✏️ Editar</button>
                                  <button className="btn btn-sm btn-danger" onClick={() => handleDeleteSale(s.id)}>Eliminar</button>
                                </div>
                              </td>}
                            </tr>
                          ))}
                          {agSales.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)" }}>Sin registros</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>

              {/* Columna derecha: tabla de tiers (fija al hacer scroll) */}
              <div style={{ position: "sticky", top: "1rem" }}>
                <div className="card" style={{ background: "#f9fafb" }}>
                  <h3 style={{ marginBottom: "0.75rem" }}>Tabla de Bonos por Live</h3>
                  <table className="data-table">
                    <thead><tr><th>Ventas en el Live</th><th>Bono</th></tr></thead>
                    <tbody>
                      {[
                        ["$0 – $2,999", "$0"],
                        ["$3,000 – $4,999", "$50"],
                        ["$5,000 – $9,999", "$70"],
                        ["$10,000 – $19,999", "$100"],
                        ["$20,000 – $34,999", "$200"],
                        ["$35,000 – $49,900", "$350"],
                        ["$50,000 o más", "$500"],
                      ].map(([range, bonus]) => (
                        <tr key={range}><td>{range}</td><td>{bonus}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* ── Edit sale modal ── */}
            {editSale && (
              <div className="modal-overlay active">
                <div className="modal" style={{ maxWidth: 480 }}>
                  <div className="modal-header">
                    <h3>✏️ Editar venta — {editSale.date}</h3>
                  </div>
                  <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#64748b" }}>
                    Quita los SKUs cancelados e ingresa el monto reembolsado de cada uno. El total se ajustará automáticamente.
                  </p>

                  {/* SKU list */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1rem" }}>
                    {editSkus.map((sku, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.75rem", borderRadius: 8, border: "1.5px solid", borderColor: editRefunds[i] !== undefined ? "#fca5a5" : "#e2e8f0", background: editRefunds[i] !== undefined ? "#fef2f2" : "#f8fafc" }}>
                        <span style={{ fontFamily: "monospace", fontWeight: 600, fontSize: "0.88rem", flex: 1 }}>{sku}</span>
                        {editRefunds[i] !== undefined ? (
                          <>
                            <input
                              type="number" min="0" placeholder="Reembolso MXN $"
                              value={editRefunds[i]}
                              onChange={(e) => setEditRefunds((r) => ({ ...r, [i]: e.target.value }))}
                              style={{ width: 130, padding: "0.25rem 0.5rem", border: "1px solid #fca5a5", borderRadius: 6, fontSize: "0.85rem" }}
                            />
                            <button type="button" onClick={() => setEditRefunds((r) => { const n = { ...r }; delete n[i]; return n; })}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "1rem" }}>↩</button>
                          </>
                        ) : (
                          <button type="button" onClick={() => setEditRefunds((r) => ({ ...r, [i]: "" }))}
                            style={{ fontSize: "0.75rem", padding: "0.2rem 0.65rem", borderRadius: 100, border: "1px solid #fca5a5", background: "white", color: "#dc2626", cursor: "pointer", fontWeight: 600 }}>
                            Cancelar SKU
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Summary */}
                  {Object.keys(editRefunds).length > 0 && (() => {
                    const totalRefund = Object.values(editRefunds).reduce((s, v) => s + (Number(v) || 0), 0);
                    const newAmount = Math.max(0, editSale.salesAmount - totalRefund);
                    const cancelledSkus = Object.keys(editRefunds).length;
                    const newQty = Math.max(0, editSale.quantity - cancelledSkus);
                    return (
                      <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.85rem" }}>
                        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                          <div><span style={{ color: "#64748b" }}>Reembolso total: </span><strong style={{ color: "#dc2626" }}>MXN ${totalRefund.toLocaleString("es-MX")}</strong></div>
                          <div><span style={{ color: "#64748b" }}>Nuevo total: </span><strong style={{ color: "#16a34a" }}>MXN ${newAmount.toLocaleString("es-MX")}</strong></div>
                          <div><span style={{ color: "#64748b" }}>Artículos: </span><strong>{newQty}</strong></div>
                          <div><span style={{ color: "#64748b" }}>Bono nuevo: </span><strong style={{ color: "#16a34a" }}>MXN ${calcLiveSaleBonus(newAmount).toFixed(2)}</strong></div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={() => { setEditSale(null); setEditRefunds({}); setEditSkus([]); }}>Cancelar</button>
                    <button className="btn btn-primary" disabled={savingSale || Object.keys(editRefunds).length === 0} onClick={async () => {
                      setSavingSale(true);
                      try {
                        const totalRefund = Object.values(editRefunds).reduce((s, v) => s + (Number(v) || 0), 0);
                        const cancelledIdxs = new Set(Object.keys(editRefunds).map(Number));
                        const newSkus = editSkus.filter((_, i) => !cancelledIdxs.has(i));
                        const newAmount = Math.max(0, editSale.salesAmount - totalRefund);
                        const newQty = Math.max(0, editSale.quantity - cancelledIdxs.size);
                        await updateMexSale(editSale.id, { salesAmount: newAmount, quantity: newQty, skus: newSkus.join("|") });
                        await load();
                        setEditSale(null); setEditRefunds({}); setEditSkus([]);
                      } catch (e: any) { setDbError("Error al actualizar: " + (e?.message ?? e)); }
                      finally { setSavingSale(false); }
                    }}>{savingSale ? "Guardando..." : "Guardar cambios"}</button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* CONFIGURACIÓN */}
        {activeTab === "settings" && (
          <section>
            <header className="section-header"><h2>Configuración</h2></header>
            <div className="card">
              <h3>Agregar Agente</h3>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", marginTop: "0.5rem" }}>
                <div style={{ flex: 1 }}>
                  <label>Nombre del nuevo agente</label>
                  <input type="text" className="form-control" placeholder="ej. María López" value={newAgentName} onChange={(e) => setNewAgentName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddAgent(); } }} />
                </div>
                <button className="btn btn-primary" style={{ background: agentAdded ? "#16a34a" : undefined }} onClick={handleAddAgent}>
                  {agentAdded ? "¡Agregado! ✓" : "+ Agregar"}
                </button>
              </div>
            </div>
            <div className="card">
              <h3>Nombres de Agentes</h3>
              {agents.map((ag) => (
                <div key={ag.id} className="form-group" style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}>
                    <label>Agente {ag.id}</label>
                    <input type="text" className="form-control" value={agentNames[ag.id] ?? ""} onChange={(e) => setAgentNames({ ...agentNames, [ag.id]: e.target.value })} />
                  </div>
                  <button className="btn btn-primary" onClick={() => saveAgentName(ag.id)}>Guardar</button>
                  <button
                    className="btn btn-secondary"
                    style={{ color: "#ef4444", borderColor: "#ef4444" }}
                    onClick={() => requireAdmin(async () => { await deleteAgent(ag.id); await load(); })}
                    title="Eliminar agente (requiere contraseña)"
                  >🗑 Eliminar</button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Modal de contraseña */}
      {showPassword && (
        <div className="modal-overlay active">
          <div className="modal">
            <div className="modal-header"><h3>Autorización</h3></div>
            <p style={{ marginBottom: "1rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>Esta acción requiere la contraseña de administrador.</p>
            <form onSubmit={handlePasswordSubmit}>
              <input type="password" className="form-control" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña" autoFocus required />
              {passwordError && <p className="error-msg">{passwordError}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPassword(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Autorizar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
