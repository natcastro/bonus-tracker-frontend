import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Agent } from "../types";
import { getAgents, updateAgentName, createAgent, verifySuperAdmin } from "../services/api";
import { getCyclesForYear, getCurrentCycleDefault } from "../services/usaCycles";

const YEARS = ["2025", "2026", "2027", "2028"];

const TABS: [string, string][] = [
  ["summary", "Summary"],
  ["settings", "Settings"],
];

export default function StrategyDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("summary");
  const defaultCycle = getCurrentCycleDefault();
  const [year, setYear] = useState(defaultCycle.year);
  const [cycleId, setCycleId] = useState(defaultCycle.cycleId);
  const [cycles, setCycles] = useState(() => getCyclesForYear(Number(defaultCycle.year)));

  const [agents, setAgents] = useState<Agent[]>([]);

  const load = useCallback(async () => {
    setAgents(await getAgents("APT"));
  }, []);

  useEffect(() => { load(); }, [load]);

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

  // ── Add Agent (super-admin only)
  const [addAgentPw, setAddAgentPw] = useState("");
  const [addAgentPwError, setAddAgentPwError] = useState("");
  const [addAgentVerified, setAddAgentVerified] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [addAgentSaving, setAddAgentSaving] = useState(false);

  const checkSuperAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifySuperAdmin("APT", addAgentPw)) {
      setAddAgentVerified(true);
      setAddAgentPwError("");
    } else {
      setAddAgentPwError("Contraseña incorrecta.");
    }
  };

  const submitNewAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim()) return;
    setAddAgentSaving(true);
    try {
      await createAgent(newAgentName.trim(), "APT");
      await load();
      setNewAgentName("");
      setAddAgentVerified(false);
      setAddAgentPw("");
    } finally {
      setAddAgentSaving(false);
    }
  };

  return (
    <div>
      <nav className="top-nav">
        <div className="logo">FTC Hub — <span style={{ color: "#6366f1" }}>Strategy Team</span></div>
        <ul className="nav-links">
          {TABS.map(([key, label]) => (
            <li key={key} className={activeTab === key ? "active" : ""} onClick={() => setActiveTab(key)}>{label}</li>
          ))}
        </ul>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <select className="month-selector" value={year} onChange={(e) => {
            const y = e.target.value; setYear(y); setCycles(getCyclesForYear(Number(y))); setCycleId("0");
          }}>{YEARS.map((y) => <option key={y}>{y}</option>)}</select>
          <select className="month-selector" value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
            {cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn btn-secondary btn-sm" onClick={() => { sessionStorage.clear(); navigate("/"); }}>Logout</button>
        </div>
      </nav>

      <main className="content-area">

        {/* SUMMARY */}
        {activeTab === "summary" && (
          <section>
            <header className="section-header"><h2>Strategy Team — Summary</h2></header>
            {agents.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                <p>No agents yet. Go to Settings to add members.</p>
              </div>
            ) : (
              <>
                <div className="summary-cards">
                  {agents.map((ag) => (
                    <div key={ag.id} className="stat-card" style={{ borderLeftColor: "#6366f1" }}>
                      <h3>{ag.name}</h3>
                      <div className="amount" style={{ color: "#6366f1" }}>—</div>
                      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>Estructura de bonos por definir</p>
                    </div>
                  ))}
                </div>
                <div className="card" style={{ background: "#f5f3ff", border: "1px solid #e0e7ff" }}>
                  <p style={{ color: "#4338ca", fontSize: "0.9rem" }}>
                    La estructura de bonificaciones para el equipo de Strategy está en construcción.
                    Las categorías y montos se agregarán próximamente.
                  </p>
                </div>
              </>
            )}
          </section>
        )}

        {/* SETTINGS */}
        {activeTab === "settings" && (
          <section>
            <header className="section-header"><h2>Settings</h2></header>
            <div className="card">
              <h3 style={{ marginBottom: "1rem" }}>Team Members</h3>
              {agents.length === 0 && (
                <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>No members yet.</p>
              )}
              {agents.map((ag) => (
                <div key={ag.id} className="form-group" style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}>
                    <label>{ag.name}</label>
                    <input type="text" className="form-control" value={agentNames[ag.id] ?? ""} onChange={(e) => setAgentNames({ ...agentNames, [ag.id]: e.target.value })} />
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => saveAgentName(ag.id)}>Save</button>
                </div>
              ))}
            </div>
            <div className="card">
              <h3 style={{ marginBottom: "0.25rem" }}>Add Member</h3>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem" }}>Requires admin password + <code>!</code></p>
              {!addAgentVerified ? (
                <form onSubmit={checkSuperAdmin} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", maxWidth: 400 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: "0.85rem", fontWeight: 500 }}>Admin Password</label>
                    <input type="password" className="form-control" placeholder="Contraseña admin" value={addAgentPw} onChange={(e) => { setAddAgentPw(e.target.value); setAddAgentPwError(""); }} />
                    {addAgentPwError && <p className="error-msg">{addAgentPwError}</p>}
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm">Verificar</button>
                </form>
              ) : (
                <form onSubmit={submitNewAgent} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", maxWidth: 400 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: "0.85rem", fontWeight: 500 }}>Nombre</label>
                    <input type="text" className="form-control" placeholder="Nombre completo" value={newAgentName} onChange={(e) => setNewAgentName(e.target.value)} autoFocus required />
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={addAgentSaving}>{addAgentSaving ? "..." : "Agregar"}</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setAddAgentVerified(false); setAddAgentPw(""); }}>Cancelar</button>
                </form>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
