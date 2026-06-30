import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Agent, UsaLiveSchedule } from "../types";
import { getAgents, getUsaLiveSchedules, addUsaLiveSchedule, deleteUsaLiveSchedule } from "../services/api";
import { MONTHS } from "../services/mexBonus";

const YEARS = ["2025", "2026", "2027", "2028"];
const DOW_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const AGENT_COLORS = ["#1e40af", "#0891b2", "#7c3aed", "#dc2626", "#d97706", "#db2777"];
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

async function exportLivesXLSX(schedules: UsaLiveSchedule[], agents: Agent[], monthName: string, year: string) {
  const XLSX = await import("xlsx");
  const rows = schedules.map((s) => {
    const agentName = agents.find((a) => a.id === s.agentId)?.name ?? String(s.agentId);
    const dow = new Date(s.date + "T12:00").toLocaleDateString("es-MX", { weekday: "long" });
    return [agentName, s.date, dow, s.startTime, s.endTime, s.note];
  });
  const ws = XLSX.utils.aoa_to_sheet([
    ["Agente", "Fecha", "Día", "Inicio", "Fin", "Nota"],
    ...rows,
  ]);
  ws["!cols"] = [{ wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "TikTok Lives");
  XLSX.writeFile(wb, `tiktok_lives_usa_${monthName}_${year}.xlsx`);
}

export default function TikTokLivesDashboard() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [schedules, setSchedules] = useState<UsaLiveSchedule[]>([]);
  const [livesYear, setLivesYear] = useState(String(new Date().getFullYear()));
  const [livesMonth, setLivesMonth] = useState(new Date().getMonth() + 1);
  const [weekIdx, setWeekIdx] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ agentId: 0, date: "", startTime: "09:00", endTime: "18:00", note: "" });
  const [error, setError] = useState<string | null>(null);

  const monthGrid = buildMonthGrid(Number(livesYear), livesMonth);
  const weekCols = monthGrid[weekIdx] ?? new Array(6).fill(null);

  const load = useCallback(async () => {
    try {
      const [ag, sc] = await Promise.all([
        getAgents("USA"),
        getUsaLiveSchedules(Number(livesYear), livesMonth),
      ]);
      setAgents(ag);
      setSchedules(sc);
      setError(null);
    } catch (e: any) {
      setError("Error de base de datos: " + (e?.message ?? String(e)));
    }
  }, [livesYear, livesMonth]);

  useEffect(() => { load(); }, [load]);

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const [y, m] = form.date.split("-").map(Number);
      await addUsaLiveSchedule({ agentId: Number(form.agentId), date: form.date, startTime: form.startTime, endTime: form.endTime, note: form.note, year: y, month: m });
      await load();
      setShowForm(false);
      setForm({ agentId: 0, date: "", startTime: "09:00", endTime: "18:00", note: "" });
    } catch (e: any) {
      setError("Error al guardar: " + (e?.message ?? e));
    }
  };

  return (
    <div>
      <nav className="top-nav">
        <div className="logo">Bonus Tracker — <span style={{ color: "#e91e8c" }}>TikTok Lives USA</span></div>
        <ul className="nav-links" />
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <select className="month-selector" value={livesYear} onChange={(e) => { setLivesYear(e.target.value); setWeekIdx(0); }}>
            {YEARS.map((y) => <option key={y}>{y}</option>)}
          </select>
          <select className="month-selector" value={livesMonth} onChange={(e) => { setLivesMonth(Number(e.target.value)); setWeekIdx(0); }}>
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <button className="btn btn-secondary btn-sm" onClick={() => { sessionStorage.clear(); navigate("/"); }}>Salir</button>
        </div>
      </nav>

      <main className="content-area">
        <header className="section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
          <h2 style={{ margin: 0 }}>Horarios TikTok Lives — {MONTHS[livesMonth - 1]} {livesYear}</h2>
          <button className="btn btn-primary btn-sm" onClick={() => exportLivesXLSX(schedules, agents, MONTHS[livesMonth - 1], livesYear)}>⬇ Exportar Excel (.xlsx)</button>
        </header>

        {error && (
          <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1rem" }}>
            <div style={{ fontWeight: 700, color: "#dc2626", marginBottom: "0.4rem" }}>⚠️ Error — corre este SQL en Supabase:</div>
            <pre style={{ fontSize: "0.75rem", color: "#7f1d1d", margin: 0, whiteSpace: "pre-wrap", background: "#fff5f5", padding: "0.5rem", borderRadius: 4 }}>{`CREATE TABLE IF NOT EXISTS usa_live_schedules (
  id BIGSERIAL PRIMARY KEY,
  agent_id BIGINT REFERENCES agents(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  year INT NOT NULL,
  month INT NOT NULL
);
ALTER TABLE usa_live_schedules DISABLE ROW LEVEL SECURITY;`}</pre>
          </div>
        )}

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <h3 style={{ margin: 0 }}>Semana {weekIdx + 1} / {monthGrid.length}</h3>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <button className="btn btn-sm btn-secondary" onClick={() => setWeekIdx((i) => Math.max(0, i - 1))} disabled={weekIdx === 0}>← Anterior</button>
              <button className="btn btn-sm btn-secondary" onClick={() => setWeekIdx((i) => Math.min(monthGrid.length - 1, i + 1))} disabled={weekIdx >= monthGrid.length - 1}>Siguiente →</button>
              <button className="btn btn-sm btn-primary" onClick={() => setShowForm(true)}>+ Agregar Turno</button>
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
                {weekCols.map((day, i) => (
                  <div key={i} style={{ textAlign: "center", padding: "0.4rem 0", borderLeft: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{DOW_LABELS[i]}</div>
                    <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{day ? day.getDate() : "—"}</div>
                  </div>
                ))}
              </div>

              {/* Time grid */}
              <div style={{ display: "grid", gridTemplateColumns: "52px repeat(6, 1fr)", height: `${(SCHED_END - SCHED_START) * PX_HR}px`, position: "relative" }}>
                <div>
                  {Array.from({ length: SCHED_END - SCHED_START }, (_, i) => (
                    <div key={i} style={{ height: PX_HR, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 6, paddingTop: 2, fontSize: "0.65rem", color: "var(--text-muted)", borderTop: i > 0 ? "1px solid #f1f5f9" : "none" }}>
                      {String(SCHED_START + i).padStart(2, "0")}:00
                    </div>
                  ))}
                </div>

                {weekCols.map((day, colIdx) => {
                  const ds = day ? toDateStr(day) : "";
                  const colEvs = day ? schedules.filter((e) => e.date === ds) : [];
                  return (
                    <div key={colIdx} style={{ position: "relative", borderLeft: "1px solid #f1f5f9" }}>
                      {Array.from({ length: SCHED_END - SCHED_START }, (_, i) => (
                        <div key={i} style={{ position: "absolute", top: i * PX_HR, left: 0, right: 0, borderTop: i > 0 ? "1px solid #f1f5f9" : "none", height: PX_HR }} />
                      ))}
                      {colEvs.map((ev) => {
                        const topPx = ((timeMins(ev.startTime) - SCHED_START * 60) / 60) * PX_HR;
                        const h = Math.max(((timeMins(ev.endTime) - timeMins(ev.startTime)) / 60) * PX_HR, 22);
                        const agIdx = agents.findIndex((a) => a.id === ev.agentId);
                        const color = AGENT_COLORS[agIdx % AGENT_COLORS.length] ?? "#1e40af";
                        return (
                          <div
                            key={ev.id}
                            onDoubleClick={async () => { try { await deleteUsaLiveSchedule(ev.id); await load(); } catch (e: any) { setError("Error al borrar: " + (e?.message ?? e)); } }}
                            title="Doble clic para eliminar"
                            style={{ position: "absolute", top: topPx, height: h, left: 2, right: 2, background: color + "22", border: `1.5px solid ${color}`, borderRadius: 4, padding: "2px 4px", fontSize: "0.66rem", overflow: "hidden", zIndex: 1, cursor: "pointer", userSelect: "none" }}
                          >
                            <div style={{ fontWeight: 700, color, lineHeight: 1.3 }}>{agents.find((a) => a.id === ev.agentId)?.name ?? ""}</div>
                            <div style={{ color: "var(--text-muted)", lineHeight: 1.2 }}>{ev.startTime}–{ev.endTime}</div>
                            {ev.note && <div style={{ color: "var(--text-muted)", lineHeight: 1.2, fontStyle: "italic" }}>{ev.note}</div>}
                            <div style={{ color, fontSize: "0.58rem", opacity: 0.7, lineHeight: 1.2 }}>doble clic para borrar</div>
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

        {/* Add shift modal */}
        {showForm && (
          <div className="modal-overlay active">
            <div className="modal">
              <div className="modal-header"><h3>Agregar Turno</h3></div>
              <form onSubmit={submitForm}>
                <div className="form-group">
                  <label>Agente</label>
                  <select className="form-control" value={form.agentId} onChange={(e) => setForm({ ...form, agentId: Number(e.target.value) })} required>
                    <option value={0} disabled>Seleccionar agente</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Día</label>
                  <input type="date" className="form-control" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div className="form-group">
                    <label>Inicio</label>
                    <input type="time" className="form-control" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Fin</label>
                    <input type="time" className="form-control" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required />
                  </div>
                </div>
                <div className="form-group">
                  <label>Nota (opcional)</label>
                  <input type="text" className="form-control" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="ej. Live matutino" />
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary">Agregar</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
