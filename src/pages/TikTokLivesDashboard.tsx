import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Agent, UsaLiveSchedule } from "../types";
import { getAgents, createAgent, updateAgentName, updateAgentTimezone, deleteAgent, getUsaLiveSchedules, addUsaLiveSchedule, deleteUsaLiveSchedule } from "../services/api";
import { MONTHS } from "../services/mexBonus";

const TEAM = "TKLIVES";
const YEARS = ["2025", "2026", "2027", "2028"];
const DOW_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const AGENT_COLORS = ["#1e40af", "#0891b2", "#7c3aed", "#dc2626", "#d97706", "#db2777"];
const TIMEZONES = [
  { value: "", label: "Sin definir" },
  { value: "America/Los_Angeles", label: "Pacífico (California) — PT" },
  { value: "America/Denver", label: "Montaña — MT" },
  { value: "America/Chicago", label: "Central (Houston) — CT" },
  { value: "America/New_York", label: "Este — ET" },
];
const TZ_ABBR: Record<string, string> = {
  "America/Los_Angeles": "PT",
  "America/Denver": "MT",
  "America/Chicago": "CT",
  "America/New_York": "ET",
};
const SCHED_START = 6;
const SCHED_END = 30; // 6am through 5:59am next day (24h window)
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

// Local calendar date (not UTC) — avoids "today" shifting a day in negative-UTC timezones
function todayLocalStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Minutes since midnight, rolled forward 24h if before SCHED_START so the
// 6am–5:59am window plots in order (e.g. 02:00 is treated as continuing after midnight).
function timeMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  let mins = h * 60 + m;
  if (mins < SCHED_START * 60) mins += 24 * 60;
  return mins;
}

// Offset (minutes) of `timeZone` from UTC at the instant `date` represents.
function getTzOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const map: Record<string, string> = {};
  dtf.formatToParts(date).forEach((p) => { if (p.type !== "literal") map[p.type] = p.value; });
  const asUTC = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second);
  return (asUTC - date.getTime()) / 60000;
}

// Converts a wall-clock date+time in `fromTz` to the equivalent wall-clock date+time in `toTz`.
function convertTime(dateStr: string, timeStr: string, fromTz: string, toTz: string): { date: string; time: string } {
  if (!fromTz || !toTz || fromTz === toTz) return { date: dateStr, time: timeStr };
  const timeOnly = timeStr.slice(0, 5); // "HH:MM" — Supabase may return "HH:MM:SS"
  const naiveUTC = new Date(`${dateStr}T${timeOnly}:00Z`);
  const fromOffset = getTzOffsetMinutes(naiveUTC, fromTz);
  const actualUTC = new Date(naiveUTC.getTime() - fromOffset * 60000);
  const toOffset = getTzOffsetMinutes(actualUTC, toTz);
  const target = new Date(actualUTC.getTime() + toOffset * 60000);
  const y = target.getUTCFullYear();
  const mo = String(target.getUTCMonth() + 1).padStart(2, "0");
  const da = String(target.getUTCDate()).padStart(2, "0");
  const h = String(target.getUTCHours()).padStart(2, "0");
  const mi = String(target.getUTCMinutes()).padStart(2, "0");
  return { date: `${y}-${mo}-${da}`, time: `${h}:${mi}` };
}

// dow index: 0=Lun ... 5=Sáb (matches DOW_LABELS)
function dowIndex(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const jsDow = new Date(y, m - 1, d).getDay(); // 0=Sun..6=Sat
  return jsDow === 0 ? 6 : jsDow - 1;
}

function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return toDateStr(dt);
}

const ENGLISH_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const TZ_LABEL: Record<string, string> = {
  "America/Los_Angeles": "Pacific Time (PT)",
  "America/Denver": "Mountain Time (MT)",
  "America/Chicago": "Central Time (CT)",
  "America/New_York": "Eastern Time (ET)",
};

async function exportLivesXLSX(schedules: UsaLiveSchedule[], agents: Agent[], month: number, year: string, viewTimezone: string) {
  const XLSX = await import("xlsx");
  const monthName = ENGLISH_MONTHS[month - 1];
  const tzLabel = viewTimezone ? TZ_LABEL[viewTimezone] ?? viewTimezone : "";
  const rows = schedules.map((s) => {
    const ag = agents.find((a) => a.id === s.agentId);
    const agentName = ag?.name ?? String(s.agentId);
    const dow = new Date(s.date + "T12:00").toLocaleDateString("en-US", { weekday: "long" });
    const agentTz = viewTimezone ? (TZ_LABEL[viewTimezone] ?? viewTimezone) : (TZ_LABEL[ag?.timezone ?? ""] ?? ag?.timezone ?? "");
    const startTime = s.startTime.slice(0, 5);
    const endTime = s.endTime.slice(0, 5);
    return [agentName, s.date, dow, startTime, endTime, agentTz, s.note];
  });
  const ws = XLSX.utils.aoa_to_sheet([
    ["Agent", "Date", "Day", "Start", "End", "Timezone", "Note"],
    ...rows,
  ]);
  ws["!cols"] = [{ wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 22 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  const sheetTitle = tzLabel ? `${monthName} ${year} (${tzLabel})` : `${monthName} ${year}`;
  XLSX.utils.book_append_sheet(wb, ws, "TikTok Lives");
  // Add a title row context in cell A1 area via a separate info sheet
  const infoWs = XLSX.utils.aoa_to_sheet([
    ["TikTok Lives USA — Schedule"],
    [`Month: ${monthName} ${year}`],
    tzLabel ? [`Viewing timezone: ${tzLabel}`] : ["Timezone: each agent's local time"],
  ]);
  XLSX.utils.book_append_sheet(wb, infoWs, "Info");
  XLSX.writeFile(wb, `tiktok_lives_usa_${monthName.toLowerCase()}_${year}${tzLabel ? `_${tzLabel.replace(/[^a-z]/gi, "_")}` : ""}.xlsx`);
  void sheetTitle;
}

const CONTENIDO_PREFIX = "[contenido]";
function encodeNote(type: "live" | "contenido", note: string) {
  return type === "contenido" ? CONTENIDO_PREFIX + note : note;
}
function decodeNote(raw: string): { type: "live" | "contenido"; note: string } {
  if (raw.startsWith(CONTENIDO_PREFIX)) return { type: "contenido", note: raw.slice(CONTENIDO_PREFIX.length) };
  return { type: "live", note: raw };
}

const EMPTY_FORM = {
  agentId: 0, date: "", startTime: "09:00", endTime: "18:00", note: "",
  type: "live" as "live" | "contenido",
  repeat: false, repeatDays: [] as number[], repeatUntil: "",
};

export default function TikTokLivesDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"calendario" | "settings">("calendario");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [schedules, setSchedules] = useState<UsaLiveSchedule[]>([]);
  const [livesYear, setLivesYear] = useState(String(new Date().getFullYear()));
  const [livesMonth, setLivesMonth] = useState(new Date().getMonth() + 1);
  const todayStr = todayLocalStr();
  const [weekIdx, setWeekIdx] = useState(() => {
    const grid = buildMonthGrid(new Date().getFullYear(), new Date().getMonth() + 1);
    const idx = grid.findIndex((week) => week.some((d) => d && toDateStr(d) === todayStr));
    return idx >= 0 ? idx : 0;
  });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [viewTimezone, setViewTimezone] = useState("America/Chicago");
  const [livesCountOpen, setLivesCountOpen] = useState(false);
  const [agentColors, setAgentColors] = useState<Record<number, string>>(() => {
    try { return JSON.parse(localStorage.getItem("tklives_agent_colors") ?? "{}"); } catch { return {}; }
  });

  const agColor = (agentId: number) => {
    if (agentColors[agentId]) return agentColors[agentId];
    const idx = agents.findIndex((a) => a.id === agentId);
    return AGENT_COLORS[idx >= 0 ? idx % AGENT_COLORS.length : 0] ?? "#1e40af";
  };

  const saveAgentColor = (id: number, color: string) => {
    const next = { ...agentColors, [id]: color };
    setAgentColors(next);
    localStorage.setItem("tklives_agent_colors", JSON.stringify(next));
  };

  const copyLastWeek = async () => {
    let prevCols: (Date | null)[];
    let prevScheds = schedules;
    if (weekIdx > 0) {
      prevCols = monthGrid[weekIdx - 1];
    } else {
      const prevM = livesMonth === 1 ? 12 : livesMonth - 1;
      const prevY = livesMonth === 1 ? Number(livesYear) - 1 : Number(livesYear);
      const prevGrid = buildMonthGrid(prevY, prevM);
      prevCols = prevGrid[prevGrid.length - 1];
      try { prevScheds = await getUsaLiveSchedules(prevY, prevM); } catch { prevScheds = []; }
    }
    const prevDates = new Set(prevCols.filter(Boolean).map((d) => toDateStr(d!)));
    const toCopy = prevScheds.filter((s) => prevDates.has(s.date));
    if (toCopy.length === 0) { setError("No hay turnos en la semana anterior para copiar."); return; }
    if (!confirm(`¿Copiar ${toCopy.length} turno(s) de la semana anterior a esta semana?`)) return;
    try {
      for (const s of toCopy) {
        const prevDayIdx = prevCols.findIndex((d) => d && toDateStr(d) === s.date);
        if (prevDayIdx === -1) continue;
        const target = weekCols[prevDayIdx];
        if (!target) continue;
        const ds = toDateStr(target);
        const [y, m] = ds.split("-").map(Number);
        await addUsaLiveSchedule({ agentId: s.agentId, date: ds, startTime: s.startTime.slice(0, 5), endTime: s.endTime.slice(0, 5), note: s.note, year: y, month: m });
      }
      await load();
    } catch (e: any) { setError("Error al copiar: " + (e?.message ?? e)); }
  };

  const monthGrid = buildMonthGrid(Number(livesYear), livesMonth);
  const weekCols = monthGrid[weekIdx] ?? new Array(6).fill(null);

  // Schedules adjusted to the selected viewing timezone (converted from each agent's own timezone)
  const displaySchedules: UsaLiveSchedule[] = !viewTimezone
    ? schedules
    : schedules.map((ev) => {
        const ag = agents.find((a) => a.id === ev.agentId);
        if (!ag?.timezone) return ev;
        const start = convertTime(ev.date, ev.startTime, ag.timezone, viewTimezone);
        const end = convertTime(ev.date, ev.endTime, ag.timezone, viewTimezone);
        return { ...ev, date: start.date, startTime: start.time, endTime: end.time };
      });

  const load = useCallback(async () => {
    try {
      const [ag, sc] = await Promise.all([
        getAgents(TEAM),
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
    if (!form.agentId || form.agentId === 0) {
      setError("Selecciona un agente antes de agregar el turno.");
      return;
    }
    try {
      if (form.repeat) {
        if (!form.repeatUntil || form.repeatDays.length === 0) {
          setError("Selecciona al menos un día de la semana y una fecha final para repetir.");
          return;
        }
        const dates: string[] = [];
        let cursor = form.date;
        while (cursor <= form.repeatUntil) {
          if (form.repeatDays.includes(dowIndex(cursor))) dates.push(cursor);
          cursor = addDaysStr(cursor, 1);
        }
        for (const ds of dates) {
          const [y, m] = ds.split("-").map(Number);
          await addUsaLiveSchedule({ agentId: Number(form.agentId), date: ds, startTime: form.startTime, endTime: form.endTime, note: encodeNote(form.type, form.note), year: y, month: m });
        }
      } else {
        const [y, m] = form.date.split("-").map(Number);
        await addUsaLiveSchedule({ agentId: Number(form.agentId), date: form.date, startTime: form.startTime, endTime: form.endTime, note: encodeNote(form.type, form.note), year: y, month: m });
      }
      await load();
      setShowForm(false);
      setForm(EMPTY_FORM);
    } catch (e: any) {
      setError("Error al guardar: " + (e?.message ?? e));
    }
  };

  // ── Settings: agent management
  const [newAgentName, setNewAgentName] = useState("");
  const [agentAdded, setAgentAdded] = useState(false);
  const [agentNames, setAgentNames] = useState<Record<number, string>>({});

  useEffect(() => {
    const names: Record<number, string> = {};
    agents.forEach((a) => { names[a.id] = a.name; });
    setAgentNames(names);
  }, [agents]);

  const handleAddAgent = async () => {
    if (!newAgentName.trim()) return;
    await createAgent(newAgentName.trim(), TEAM);
    setNewAgentName("");
    setAgentAdded(true);
    setTimeout(() => setAgentAdded(false), 2000);
    await load();
  };

  const saveAgentName = async (id: number) => {
    await updateAgentName(id, agentNames[id]);
    await load();
  };

  const saveAgentTimezone = async (id: number, tz: string) => {
    await updateAgentTimezone(id, tz);
    await load();
  };

  const handleDeleteAgent = async (id: number) => {
    if (!confirm("¿Eliminar este agente? Se borrarán también sus turnos.")) return;
    await deleteAgent(id);
    await load();
  };

  const toggleRepeatDay = (i: number) => {
    setForm((f) => ({
      ...f,
      repeatDays: f.repeatDays.includes(i) ? f.repeatDays.filter((d) => d !== i) : [...f.repeatDays, i],
    }));
  };

  return (
    <div>
      <nav className="top-nav">
        <div className="logo">Bonus Tracker — <span style={{ color: "#e91e8c" }}>TikTok Lives USA</span></div>
        <ul className="nav-links">
          {(["calendario", "settings"] as const).map((tab) => (
            <li key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
              {tab === "calendario" ? "Calendario" : "Configuración"}
            </li>
          ))}
        </ul>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {activeTab === "calendario" && (
            <>
              <select className="month-selector" value={livesYear} onChange={(e) => { setLivesYear(e.target.value); setWeekIdx(0); }}>
                {YEARS.map((y) => <option key={y}>{y}</option>)}
              </select>
              <select className="month-selector" value={livesMonth} onChange={(e) => { setLivesMonth(Number(e.target.value)); setWeekIdx(0); }}>
                {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => { sessionStorage.clear(); navigate("/"); }}>Salir</button>
        </div>
      </nav>

      <main className="content-area">
        {error && (
          <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1rem" }}>
            <div style={{ fontWeight: 700, color: "#dc2626", marginBottom: "0.4rem" }}>⚠️ {error}</div>
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

        {/* CALENDARIO */}
        {activeTab === "calendario" && (
          <section>
            <header className="section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <h2 style={{ margin: 0 }}>Horarios TikTok Lives — {MONTHS[livesMonth - 1]} {livesYear}</h2>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <select className="form-control" style={{ width: "auto" }} value={viewTimezone} onChange={(e) => setViewTimezone(e.target.value)}>
                  <option value="">Hora original de cada agente</option>
                  {TIMEZONES.filter((tz) => tz.value).map((tz) => <option key={tz.value} value={tz.value}>Ver en: {tz.label}</option>)}
                </select>
                <button className="btn btn-primary btn-sm" onClick={() => exportLivesXLSX(displaySchedules, agents, livesMonth, livesYear, viewTimezone)}>⬇ Exportar Excel (.xlsx)</button>
              </div>
            </header>

            {/* ── Hours summary bar ── */}
            {(() => {
              const calcMins = (evs: typeof displaySchedules) => evs.reduce((sum, s) => {
                const [sh, sm] = s.startTime.slice(0, 5).split(":").map(Number);
                const [eh, em] = s.endTime.slice(0, 5).split(":").map(Number);
                let mins = eh * 60 + em - (sh * 60 + sm);
                if (mins < 0) mins += 24 * 60;
                return sum + mins;
              }, 0);
              const liveEvs = displaySchedules.filter((s) => decodeNote(s.note ?? "").type === "live");
              const contenidoEvs = displaySchedules.filter((s) => decodeNote(s.note ?? "").type === "contenido");
              const liveHrs = calcMins(liveEvs) / 60;
              const contenidoHrs = calcMins(contenidoEvs) / 60;
              const totalHrs = liveHrs + contenidoHrs;
              const fmt = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(1);
              const statStyle = (val: number, red = false): React.CSSProperties => ({
                fontSize: "1.35rem", fontWeight: 800,
                color: red && val > 40 ? "#dc2626" : "var(--text-primary)",
              });
              return (
                <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                  {[
                    { label: "🔴 Lives", val: liveHrs, red: false },
                    { label: "📝 Contenido", val: contenidoHrs, red: false },
                    { label: "⏱ Total", val: totalHrs, red: true },
                  ].map(({ label, val, red }) => (
                    <div key={label} className="card" style={{ flex: "1 1 120px", padding: "0.65rem 1rem", display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
                      <span style={statStyle(val, red)}>{fmt(val)}<span style={{ fontSize: "0.85rem", fontWeight: 600, marginLeft: 2 }}>h</span></span>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>

            {/* ── Agents sidebar ── */}
            <div className="card" style={{ flexShrink: 0, width: livesCountOpen ? 190 : "auto", transition: "width 0.2s" }}>
              <button onClick={() => setLivesCountOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "none", border: "none", cursor: "pointer", padding: 0, width: "100%" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>📋 Lives</span>
                <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "#94a3b8" }}>{livesCountOpen ? "▲" : "▼"}</span>
              </button>
              {livesCountOpen && (
                <div style={{ marginTop: "0.65rem" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                    {(() => {
                      const weekDateSet = new Set(weekCols.filter(Boolean).map((d) => toDateStr(d!)));
                      return agents.map((ag, i) => {
                        const agEvs = displaySchedules.filter((s) => s.agentId === ag.id);
                        const calcMins = (evs: typeof agEvs) => evs.reduce((sum, s) => {
                          const [sh, sm] = s.startTime.slice(0, 5).split(":").map(Number);
                          const [eh, em] = s.endTime.slice(0, 5).split(":").map(Number);
                          let mins = eh * 60 + em - (sh * 60 + sm);
                          if (mins < 0) mins += 24 * 60;
                          return sum + mins;
                        }, 0);
                        const monthHrs = (calcMins(agEvs) / 60).toFixed(1);
                        const weekHrs = (calcMins(agEvs.filter((s) => weekDateSet.has(s.date))) / 60).toFixed(1);
                        const color = agColor(ag.id);
                        return (
                          <div key={ag.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", minWidth: 0 }}>
                              <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                              <span style={{ fontSize: "0.78rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ag.name}</span>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, flexShrink: 0 }}>
                              <span style={{ fontSize: "0.78rem", fontWeight: 800, color, background: color + "18", borderRadius: 100, padding: "1px 8px" }}>{monthHrs}h</span>
                              <span style={{ fontSize: "0.68rem", color: "#94a3b8", fontWeight: 600, paddingRight: 4 }}>sem: {weekHrs}h</span>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                  <div style={{ marginTop: "0.6rem", paddingTop: "0.5rem", borderTop: "1px solid #f1f5f9", fontSize: "0.72rem", color: "#94a3b8" }}>
                    Turnos: <strong style={{ color: "#0f172a" }}>{displaySchedules.length}</strong>
                  </div>
                </div>
              )}
            </div>

            {/* ── Calendar card ── */}
            <div className="card" style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h3 style={{ margin: 0 }}>Semana {weekIdx + 1} / {monthGrid.length}</h3>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => setWeekIdx((i) => Math.max(0, i - 1))} disabled={weekIdx === 0}>← Anterior</button>
                  <button className="btn btn-sm btn-secondary" onClick={() => setWeekIdx((i) => Math.min(monthGrid.length - 1, i + 1))} disabled={weekIdx >= monthGrid.length - 1}>Siguiente →</button>
                  <button className="btn btn-sm btn-secondary" onClick={copyLastWeek} title="Copia los turnos de la semana anterior a esta semana">⎘ Copiar sem. anterior</button>
                  <button className="btn btn-sm btn-primary" onClick={() => { setForm((f) => ({ ...f, agentId: f.agentId || agents[0]?.id || 0 })); setShowForm(true); }}>+ Agregar Turno</button>
                </div>
              </div>

              {/* Agent color legend */}
              <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                {agents.map((ag) => (
                  <span key={ag.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.78rem" }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: agColor(ag.id), display: "inline-block" }} />
                    {ag.name}
                  </span>
                ))}
                {agents.length === 0 && <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Sin agentes — agrégalos en Configuración.</span>}
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
                          <div style={{ fontSize: "0.7rem", color: isToday ? "#dc2626" : "var(--text-muted)", fontWeight: isToday ? 700 : 400 }}>{DOW_LABELS[i]}</div>
                          <div style={{
                            fontSize: "0.9rem", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: 24, height: 24, borderRadius: "50%", margin: "0 auto",
                            background: isToday ? "#dc2626" : "transparent",
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
                    <div>
                      {Array.from({ length: SCHED_END - SCHED_START }, (_, i) => (
                        <div key={i} style={{ height: PX_HR, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 6, paddingTop: 2, fontSize: "0.65rem", color: "var(--text-muted)", borderTop: i > 0 ? "1px solid #f1f5f9" : "none" }}>
                          {String((SCHED_START + i) % 24).padStart(2, "0")}:00
                        </div>
                      ))}
                    </div>

                    {weekCols.map((day, colIdx) => {
                      const ds = day ? toDateStr(day) : "";
                      const colEvs = day ? displaySchedules.filter((e) => e.date === ds) : [];
                      const isToday = ds === todayStr;
                      return (
                        <div
                          key={colIdx}
                          style={{ position: "relative", borderLeft: "1px solid #f1f5f9", background: isToday ? "#fef2f2" : "transparent", cursor: day ? "crosshair" : "default" }}
                          onClick={day ? (e) => {
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
                            setForm((f) => ({ ...EMPTY_FORM, agentId: f.agentId || agents[0]?.id || 0, date: ds, startTime, endTime }));
                            setShowForm(true);
                          } : undefined}
                        >
                          {Array.from({ length: SCHED_END - SCHED_START }, (_, i) => (
                            <div key={i} style={{ position: "absolute", top: i * PX_HR, left: 0, right: 0, borderTop: i > 0 ? "1px solid #f1f5f9" : "none", height: PX_HR }} />
                          ))}
                          {colEvs.map((ev) => {
                            const topPx = ((timeMins(ev.startTime) - SCHED_START * 60) / 60) * PX_HR;
                            const h = Math.max(((timeMins(ev.endTime) - timeMins(ev.startTime)) / 60) * PX_HR, 22);
                            const color = agColor(ev.agentId);
                            const { type: evType, note: evNote } = decodeNote(ev.note ?? "");
                            const isContenido = evType === "contenido";
                            return (
                              <div
                                key={ev.id}
                                data-ev="1"
                                onDoubleClick={async (e) => { e.stopPropagation(); try { await deleteUsaLiveSchedule(ev.id); await load(); } catch (ex: any) { setError("Error al borrar: " + (ex?.message ?? ex)); } }}
                                title={`${isContenido ? "Contenido" : "Live"} — doble clic para eliminar`}
                                style={{
                                  position: "absolute", top: topPx, height: h, left: 2, right: 2,
                                  background: isContenido ? "transparent" : color + "22",
                                  backgroundImage: isContenido ? `repeating-linear-gradient(135deg, ${color}18 0px, ${color}18 4px, transparent 4px, transparent 10px)` : "none",
                                  border: `${isContenido ? "1.5px dashed" : "1.5px solid"} ${color}`,
                                  borderRadius: 4, padding: "2px 4px", fontSize: "0.66rem", overflow: "hidden", zIndex: 1, cursor: "pointer", userSelect: "none",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 3, lineHeight: 1.3 }}>
                                  <span style={{ fontWeight: 700, color }}>{agents.find((a) => a.id === ev.agentId)?.name ?? ""}</span>
                                  {isContenido && <span style={{ fontSize: "0.6rem", background: color, color: "white", borderRadius: 3, padding: "0 3px", fontWeight: 700, lineHeight: 1.4 }}>C</span>}
                                </div>
                                <div style={{ color: "var(--text-muted)", lineHeight: 1.2 }}>{ev.startTime.slice(0,5)}–{ev.endTime.slice(0,5)}{viewTimezone ? ` ${TZ_ABBR[viewTimezone] ?? ""}` : ""}</div>
                                {evNote && <div style={{ color: "var(--text-muted)", lineHeight: 1.2, fontStyle: "italic" }}>{evNote}</div>}
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
            </div>{/* end flex row */}

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
                      <label>{form.repeat ? "Día inicial" : "Día"}</label>
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
                      <label>Tipo</label>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        {(["live", "contenido"] as const).map((t) => (
                          <button key={t} type="button" onClick={() => setForm((f) => ({ ...f, type: t }))}
                            style={{ flex: 1, padding: "0.45rem", borderRadius: 6, fontSize: "0.85rem", fontWeight: form.type === t ? 700 : 400, cursor: "pointer",
                              border: form.type === t ? "2px solid #e91e8c" : "1px solid var(--border)",
                              background: form.type === t ? "#e91e8c15" : "white",
                              color: form.type === t ? "#e91e8c" : "var(--text-muted)" }}>
                            {t === "live" ? "🔴 Live" : "📝 Contenido"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Nota (opcional)</label>
                      <input type="text" className="form-control" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="ej. Live matutino" />
                    </div>

                    <div className="form-group" style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem", marginTop: "0.5rem" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                        <input type="checkbox" checked={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.checked })} />
                        Repetir semanalmente
                      </label>
                    </div>

                    {form.repeat && (
                      <>
                        <div className="form-group">
                          <label>Repetir los días:</label>
                          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                            {DOW_LABELS.map((label, i) => (
                              <button
                                type="button"
                                key={label}
                                onClick={() => toggleRepeatDay(i)}
                                style={{
                                  padding: "0.35rem 0.7rem", borderRadius: 6, fontSize: "0.8rem", cursor: "pointer",
                                  border: form.repeatDays.includes(i) ? "2px solid #e91e8c" : "1px solid var(--border)",
                                  background: form.repeatDays.includes(i) ? "#e91e8c15" : "white",
                                  color: form.repeatDays.includes(i) ? "#e91e8c" : "var(--text-muted)",
                                  fontWeight: form.repeatDays.includes(i) ? 700 : 400,
                                }}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="form-group">
                          <label>Repetir hasta</label>
                          <input type="date" className="form-control" value={form.repeatUntil} min={form.date} onChange={(e) => setForm({ ...form, repeatUntil: e.target.value })} required={form.repeat} />
                        </div>
                      </>
                    )}

                    <div className="modal-actions">
                      <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}>Cancelar</button>
                      <button type="submit" className="btn btn-primary">Agregar</button>
                    </div>
                  </form>
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
                  <input type="text" className="form-control" placeholder="ej. Ana Pérez" value={newAgentName} onChange={(e) => setNewAgentName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddAgent(); } }} />
                </div>
                <button className="btn btn-primary" style={{ background: agentAdded ? "#16a34a" : undefined }} onClick={handleAddAgent}>
                  {agentAdded ? "¡Agregado! ✓" : "+ Agregar"}
                </button>
              </div>
            </div>
            <div className="card">
              <h3>Agentes</h3>
              {agents.map((ag) => (
                <div key={ag.id} className="form-group" style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <label>Agente {ag.id}</label>
                    <input type="text" className="form-control" value={agentNames[ag.id] ?? ""} onChange={(e) => setAgentNames({ ...agentNames, [ag.id]: e.target.value })} />
                  </div>
                  <div style={{ minWidth: 220 }}>
                    <label>Zona horaria</label>
                    <select className="form-control" value={ag.timezone ?? ""} onChange={(e) => saveAgentTimezone(ag.id, e.target.value)}>
                      {TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label>Color</label>
                    <input type="color" value={agColor(ag.id)} onChange={(e) => saveAgentColor(ag.id, e.target.value)}
                      style={{ width: 42, height: 36, padding: 2, border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }} />
                  </div>
                  <button className="btn btn-primary" onClick={() => saveAgentName(ag.id)}>Guardar Nombre</button>
                  <button
                    className="btn btn-secondary"
                    style={{ color: "#ef4444", borderColor: "#ef4444" }}
                    onClick={() => handleDeleteAgent(ag.id)}
                  >🗑 Eliminar</button>
                </div>
              ))}
              {agents.length === 0 && <p style={{ color: "var(--text-muted)" }}>No hay agentes todavía.</p>}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
