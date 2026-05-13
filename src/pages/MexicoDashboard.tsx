import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Agent, MexAttendance, MexLiveSale, MexMonthlyGoal } from "../types";
import {
  getAgents, updateAgentName,
  getMexAttendance, upsertMexAttendance,
  getMexSales, addMexSale, deleteMexSale,
  getMexGoal, upsertMexGoal,
} from "../services/api";
import {
  MONTHS, ATTENDANCE_BONUS, calcGoalBonus, calcLiveSaleBonus,
} from "../services/mexBonus";

const YEARS = ["2025", "2026", "2027", "2028"];
const ADMIN_PASSWORD = "mex2026";

export default function MexicoDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("summary");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [attendance, setAttendance] = useState<MexAttendance[]>([]);
  const [sales, setSales] = useState<MexLiveSale[]>([]);
  const [goal, setGoal] = useState<MexMonthlyGoal | null>(null);

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
      setPasswordError("Incorrect password.");
    }
  };

  const getAttendance = (agentId: number) =>
    attendance.find((a) => a.agentId === agentId)?.status ?? "multiple";

  const saveAttendance = async (agentId: number, status: string) => {
    await upsertMexAttendance({ agentId, year: Number(year), month, status: status as any });
    await load();
  };

  // ── Totals per agent
  const goalBonus = goal ? calcGoalBonus(goal.goalAmount, goal.actualAmount) : 0;

  const agentTotals = agents.map((ag) => {
    const att = ATTENDANCE_BONUS[getAttendance(ag.id)] ?? 0;
    const livesBonus = sales
      .filter((s) => s.agentId === ag.id)
      .reduce((sum, s) => sum + calcLiveSaleBonus(s.salesAmount), 0);
    return { agent: ag, attendance: att, goal: goalBonus, lives: livesBonus, total: att + goalBonus + livesBonus };
  });

  // ── Sale form
  const [saleForm, setSaleForm] = useState({ agentId: 0, date: "", salesAmount: "" });

  const submitSale = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = new Date(saleForm.date);
    const saleYear = d.getFullYear();
    const saleMonth = d.getMonth() + 1;
    await addMexSale({
      agentId: Number(saleForm.agentId),
      date: saleForm.date,
      salesAmount: Number(saleForm.salesAmount),
      year: saleYear,
      month: saleMonth,
    });
    await load();
    setSaleForm({ agentId: 0, date: "", salesAmount: "" });
  };

  const handleDeleteSale = (id: number) => {
    requireAdmin(async () => { await deleteMexSale(id); await load(); });
  };

  // ── Goal form
  const [goalForm, setGoalForm] = useState({ goalAmount: "", actualAmount: "" });
  useEffect(() => {
    if (goal) {
      setGoalForm({ goalAmount: String(goal.goalAmount), actualAmount: String(goal.actualAmount) });
    } else {
      setGoalForm({ goalAmount: "", actualAmount: "" });
    }
  }, [goal]);

  const saveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    await upsertMexGoal({ year: Number(year), month, goalAmount: Number(goalForm.goalAmount), actualAmount: Number(goalForm.actualAmount) });
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

  const agentSales = (agentId: number) =>
    [...sales].filter((s) => s.agentId === agentId).sort((a, b) => b.date.localeCompare(a.date));

  const goalPct = goal && goal.goalAmount > 0
    ? ((goal.actualAmount / goal.goalAmount) * 100).toFixed(1)
    : null;

  return (
    <div>
      <nav className="top-nav">
        <div className="logo">Bonus Tracker — <span style={{ color: "#16a34a" }}>México</span></div>
        <ul className="nav-links">
          {["summary", "asistencia", "meta", "ventas", "settings"].map((tab) => (
            <li key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
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
          <button className="btn btn-secondary btn-sm" onClick={() => { sessionStorage.clear(); navigate("/"); }}>Logout</button>
        </div>
      </nav>

      <main className="content-area">

        {/* SUMMARY */}
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
            <div className="card">
              <h3>Desglose por Categoría</h3>
              <table className="data-table">
                <thead>
                  <tr><th>Categoría</th>{agents.map((a) => <th key={a.id}>{a.name}</th>)}</tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Asistencia</td>
                    {agentTotals.map((t) => <td key={t.agent.id}>MXN ${t.attendance.toFixed(2)}</td>)}
                  </tr>
                  <tr>
                    <td>Meta del Mes {goalPct ? `(${goalPct}%)` : ""}</td>
                    {agentTotals.map((t) => <td key={t.agent.id}>MXN ${t.goal.toFixed(2)}</td>)}
                  </tr>
                  <tr>
                    <td>Ventas en Live</td>
                    {agentTotals.map((t) => <td key={t.agent.id}>MXN ${t.lives.toFixed(2)}</td>)}
                  </tr>
                  <tr style={{ fontWeight: 600 }}>
                    <td>Total</td>
                    {agentTotals.map((t) => <td key={t.agent.id}>MXN ${t.total.toFixed(2)}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ASISTENCIA */}
        {activeTab === "asistencia" && (
          <section>
            <header className="section-header"><h2>Asistencia</h2></header>
            <div className="card">
              <p style={{ marginBottom: "1.5rem", color: "var(--text-muted)" }}>
                Registra la asistencia de cada agente para {MONTHS[month - 1]} {year}.
              </p>
              {agents.map((ag) => (
                <div key={ag.id} className="form-group">
                  <label>{ag.name}</label>
                  <select className="form-control" value={getAttendance(ag.id)} onChange={(e) => saveAttendance(ag.id, e.target.value)}>
                    <option value="none">Sin faltas (MXN $500)</option>
                    <option value="justified">1 falta justificada, 24h+ anticipación (MXN $200)</option>
                    <option value="multiple">Más de 1 falta (MXN $0)</option>
                  </select>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* META */}
        {activeTab === "meta" && (
          <section>
            <header className="section-header"><h2>Meta del Mes</h2></header>
            <div className="card">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
                <div className="stat-card" style={{ borderTopColor: goalPct && Number(goalPct) >= 140 ? "#f59e0b" : goalPct && Number(goalPct) >= 100 ? "#16a34a" : "#ef4444" }}>
                  <h3>Cumplimiento</h3>
                  <div className="amount">{goalPct ? `${goalPct}%` : "—"}</div>
                </div>
                <div className="stat-card">
                  <h3>Bono Meta</h3>
                  <div className="amount" style={{ color: "#16a34a" }}>MXN ${goalBonus.toFixed(2)}</div>
                </div>
                <div className="stat-card" style={{ borderTopColor: "#6366f1", fontSize: "0.8rem" }}>
                  <h3>Tabla de Bonos</h3>
                  <div style={{ fontSize: "0.8rem", textAlign: "left", marginTop: "0.5rem" }}>
                    <div>≥ 140% → MXN $1,500</div>
                    <div>≥ 100% → MXN $1,000</div>
                    <div>&lt; 100% → MXN $0</div>
                  </div>
                </div>
              </div>
              <form onSubmit={saveGoal}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Meta (MXN $)</label>
                    <input type="number" className="form-control" placeholder="ej. 500000" value={goalForm.goalAmount} onChange={(e) => setGoalForm({ ...goalForm, goalAmount: e.target.value })} required min="0" />
                  </div>
                  <div className="form-group">
                    <label>Ventas Reales (MXN $)</label>
                    <input type="number" className="form-control" placeholder="ej. 550000" value={goalForm.actualAmount} onChange={(e) => setGoalForm({ ...goalForm, actualAmount: e.target.value })} required min="0" />
                  </div>
                  <div className="form-group"><button type="submit" className="btn btn-primary" style={{ marginBottom: 3 }}>Guardar Meta</button></div>
                </div>
              </form>
            </div>
          </section>
        )}

        {/* VENTAS */}
        {activeTab === "ventas" && (
          <section>
            <header className="section-header"><h2>Ventas en Live</h2></header>
            <div className="card">
              <p style={{ marginBottom: "1rem", color: "var(--text-muted)" }}>
                Registra las ventas de cada live. El bono se calcula automáticamente por tier.
              </p>
              <form onSubmit={submitSale} className="form-row">
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
                <div className="form-group"><button type="submit" className="btn btn-primary" style={{ marginBottom: 3 }}>Agregar Live</button></div>
              </form>
            </div>

            {/* Tier reference card */}
            <div className="card" style={{ background: "#f9fafb" }}>
              <h3 style={{ marginBottom: "0.75rem" }}>Tabla de Bonos por Live</h3>
              <table className="data-table">
                <thead><tr><th>Ventas en el Live</th><th>Bono</th></tr></thead>
                <tbody>
                  {[
                    ["< $3,000", "$0"],
                    ["$3,000 – $4,999", "$50"],
                    ["$5,000 – $9,999", "$100"],
                    ["$10,000 – $19,999", "$220"],
                    ["$20,000 – $34,999", "$450"],
                    ["$35,000+", "$750"],
                  ].map(([range, bonus]) => (
                    <tr key={range}><td>{range} MXN</td><td>MXN {bonus}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Sales per agent */}
            {agents.map((ag) => {
              const agSales = agentSales(ag.id);
              const totalBonus = agSales.reduce((s, sale) => s + calcLiveSaleBonus(sale.salesAmount), 0);
              return (
                <div key={ag.id} className="card" style={{ overflowX: "auto" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <h3>{ag.name}</h3>
                    <div className="badge badge-success" style={{ fontSize: "1rem", padding: "0.5rem 1rem" }}>
                      Total Lives: MXN ${totalBonus.toFixed(2)}
                    </div>
                  </div>
                  <table className="data-table">
                    <thead><tr><th>Fecha</th><th>Ventas</th><th>Bono</th><th>Acciones</th></tr></thead>
                    <tbody>
                      {agSales.map((s) => (
                        <tr key={s.id}>
                          <td>{s.date}</td>
                          <td>MXN ${s.salesAmount.toLocaleString("es-MX")}</td>
                          <td>MXN ${calcLiveSaleBonus(s.salesAmount).toFixed(2)}</td>
                          <td><button className="btn btn-sm btn-danger" onClick={() => handleDeleteSale(s.id)}>Eliminar</button></td>
                        </tr>
                      ))}
                      {agSales.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)" }}>Sin registros</td></tr>}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </section>
        )}

        {/* SETTINGS */}
        {activeTab === "settings" && (
          <section>
            <header className="section-header"><h2>Configuración</h2></header>
            <div className="card">
              <h3>Nombres de Agentes</h3>
              {agents.map((ag) => (
                <div key={ag.id} className="form-group" style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}>
                    <label>Agente {ag.id}</label>
                    <input type="text" className="form-control" value={agentNames[ag.id] ?? ""} onChange={(e) => setAgentNames({ ...agentNames, [ag.id]: e.target.value })} />
                  </div>
                  <button className="btn btn-primary" onClick={() => saveAgentName(ag.id)}>Guardar</button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Admin Password Modal */}
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
