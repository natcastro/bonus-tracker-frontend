import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Agent, OpsAppeal, OpsHandlingTime, OpsTikTokScore } from "../types";
import {
  getAgents, updateAgentName,
  getOpsAppeals, addOpsAppeal, updateOpsAppeal, deleteOpsAppeal,
  getOpsHandlingTime, upsertOpsHandlingTime,
  getOpsTikTokScores, addOpsTikTokScore, deleteOpsTikTokScore,
} from "../services/api";
import {
  getCyclesForYear, getCurrentCycleDefault, getCycleFromDate, calcTikTokBonus,
} from "../services/usaCycles";
import { OPS_APPEALS_BONUS, OPS_APPEALS_CAP, OPS_TOTAL_CAP, calcHandlingTimeBonus } from "../services/opsBonus";

const YEARS = ["2025", "2026", "2027", "2028"];
const ADMIN_PASSWORD = "ops2026!";

const OUTCOME_LABELS: Record<string, string> = {
  fullRefund: "Full Refund",
  partialRefund: "Partial Refund",
  fee: "Fee Only",
  lost: "Lost",
};

const TABS: [string, string][] = [
  ["summary", "Summary"],
  ["appeals", "Appeals"],
  ["handling", "Handling Time"],
  ["tiktok", "TikTok Score"],
  ["settings", "Settings"],
];

export default function OperationsDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("summary");
  const defaultCycle = getCurrentCycleDefault();
  const [year, setYear] = useState(defaultCycle.year);
  const [cycleId, setCycleId] = useState(defaultCycle.cycleId);
  const [cycles, setCycles] = useState(() => getCyclesForYear(Number(defaultCycle.year)));

  const [agents, setAgents] = useState<Agent[]>([]);
  const [appeals, setAppeals] = useState<OpsAppeal[]>([]);
  const [handlingTimes, setHandlingTimes] = useState<OpsHandlingTime[]>([]);
  const [tiktokScores, setTiktokScores] = useState<OpsTikTokScore[]>([]);

  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [editingAppeal, setEditingAppeal] = useState<OpsAppeal | null>(null);

  const load = useCallback(async () => {
    const [ag, ap, ht, tk] = await Promise.all([
      getAgents("OPS"),
      getOpsAppeals(Number(year), cycleId),
      getOpsHandlingTime(Number(year), cycleId),
      getOpsTikTokScores(Number(year), cycleId),
    ]);
    setAgents(ag);
    setAppeals(ap);
    setHandlingTimes(ht);
    setTiktokScores(tk);
  }, [year, cycleId]);

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

  const cycleInfo = getCyclesForYear(Number(year)).find((c) => c.id === cycleId);
  const cycleDays = cycleInfo?.days ?? 15;
  const tiktokBonus = calcTikTokBonus(tiktokScores, cycleDays);

  const agentTotals = agents.map((ag) => {
    const agAppeals = appeals.filter((a) => a.agentId === ag.id && a.status === "completed");
    const appealRaw = agAppeals.reduce((s, a) => s + (OPS_APPEALS_BONUS[a.outcome] ?? 0), 0);
    const appealCapped = Math.min(appealRaw, OPS_APPEALS_CAP);
    const ht = handlingTimes.find((h) => h.agentId === ag.id);
    const handling = ht ? calcHandlingTimeBonus(ht.hours) : 0;
    const raw = appealCapped + handling + tiktokBonus;
    const total = Math.min(raw, OPS_TOTAL_CAP);
    return { agent: ag, appealRaw, appealCapped, handling, tiktok: tiktokBonus, raw, total };
  });

  // ── Appeal form
  const [appealForm, setAppealForm] = useState({
    agentId: 0, date: "", orderNumber: "", status: "pending", outcome: "fullRefund",
  });

  const submitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    const { year: ay, cycleId: ac } = getCycleFromDate(appealForm.date);
    await addOpsAppeal({
      agentId: Number(appealForm.agentId), date: appealForm.date,
      orderNumber: appealForm.orderNumber,
      status: appealForm.status as any, outcome: appealForm.outcome as any,
      year: ay, cycleId: ac,
    });
    await load();
    setAppealForm({ agentId: 0, date: "", orderNumber: "", status: "pending", outcome: "fullRefund" });
  };

  const submitEditAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAppeal) return;
    await updateOpsAppeal(editingAppeal.id, editingAppeal);
    setEditingAppeal(null);
    await load();
  };

  // ── Handling time form per agent
  const [handlingForms, setHandlingForms] = useState<Record<number, string>>({});
  const [handlingSaved, setHandlingSaved] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const forms: Record<number, string> = {};
    agents.forEach((ag) => {
      const ht = handlingTimes.find((h) => h.agentId === ag.id);
      forms[ag.id] = ht ? String(ht.hours) : "";
    });
    setHandlingForms(forms);
  }, [agents, handlingTimes]);

  const saveHandlingTime = async (agentId: number) => {
    const hours = Number(handlingForms[agentId]);
    if (isNaN(hours) || hours < 0) return;
    await upsertOpsHandlingTime({ agentId, year: Number(year), cycleId, hours });
    await load();
    setHandlingSaved((prev) => ({ ...prev, [agentId]: true }));
    setTimeout(() => setHandlingSaved((prev) => ({ ...prev, [agentId]: false })), 2000);
  };

  // ── TikTok form
  const [tiktokForm, setTiktokForm] = useState({ startDate: "", endDate: "", score: "" });
  const tiktokDuration = (() => {
    if (!tiktokForm.startDate || !tiktokForm.endDate) return 0;
    const diff = (new Date(tiktokForm.endDate).getTime() - new Date(tiktokForm.startDate).getTime()) / 86400000;
    return diff >= 0 ? Math.round(diff) + 1 : 0;
  })();

  const submitTikTok = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tiktokDuration < 1) return;
    const { year: tkYear, cycleId: tkCycleId } = getCycleFromDate(tiktokForm.startDate);
    await addOpsTikTokScore({ date: tiktokForm.startDate, score: Number(tiktokForm.score), duration: tiktokDuration, year: tkYear, cycleId: tkCycleId });
    await load();
    setTiktokForm({ startDate: "", endDate: "", score: "" });
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

  return (
    <div>
      <nav className="top-nav">
        <div className="logo">Bonus Tracker — <span style={{ color: "#7c3aed" }}>Operations 🇺🇸</span></div>
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
            <header className="section-header"><h2>Bonifications Summary — Operations</h2></header>
            <div className="summary-cards">
              {agentTotals.map((t) => (
                <div key={t.agent.id} className="stat-card" style={{ borderTopColor: "#7c3aed" }}>
                  <h3>{t.agent.name}</h3>
                  <div className="amount" style={{ color: "#7c3aed" }}>${t.total.toFixed(2)}</div>
                  {t.raw > OPS_TOTAL_CAP && (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Raw: ${t.raw.toFixed(2)} (capped at $300)</div>
                  )}
                </div>
              ))}
            </div>
            <div className="card">
              <h3>Category Breakdown</h3>
              <table className="data-table">
                <thead><tr><th>Category</th>{agents.map((a) => <th key={a.id}>{a.name}</th>)}</tr></thead>
                <tbody>
                  <tr>
                    <td>Appeals TikTok (cap $200)</td>
                    {agentTotals.map((t) => (
                      <td key={t.agent.id}>
                        ${t.appealCapped.toFixed(2)}
                        {t.appealRaw > OPS_APPEALS_CAP && <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}> (raw ${t.appealRaw.toFixed(2)})</span>}
                      </td>
                    ))}
                  </tr>
                  <tr><td>Handling Time</td>{agentTotals.map((t) => <td key={t.agent.id}>${t.handling.toFixed(2)}</td>)}</tr>
                  <tr><td>TikTok Score (shared)</td>{agentTotals.map((t) => <td key={t.agent.id}>${t.tiktok.toFixed(2)}</td>)}</tr>
                  <tr style={{ fontWeight: 600 }}>
                    <td>Total (cap $300)</td>
                    {agentTotals.map((t) => <td key={t.agent.id}>${t.total.toFixed(2)}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* APPEALS */}
        {activeTab === "appeals" && (
          <section>
            <header className="section-header"><h2>Appeals — TikTok Devolutions</h2></header>
            <div className="card">
              <h3>Add New Appeal</h3>
              <form onSubmit={submitAppeal} className="form-row">
                <div className="form-group">
                  <label>Agent</label>
                  <select className="form-control" value={appealForm.agentId} onChange={(e) => setAppealForm({ ...appealForm, agentId: Number(e.target.value) })} required>
                    <option value={0} disabled>Select agent</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" className="form-control" value={appealForm.date} onChange={(e) => setAppealForm({ ...appealForm, date: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Order Number</label>
                  <input type="text" className="form-control" placeholder="Order #" value={appealForm.orderNumber} onChange={(e) => setAppealForm({ ...appealForm, orderNumber: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select className="form-control" value={appealForm.status} onChange={(e) => setAppealForm({ ...appealForm, status: e.target.value })}>
                    <option value="pending">Pending</option>
                    <option value="inProgress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Outcome</label>
                  <select className="form-control" value={appealForm.outcome} onChange={(e) => setAppealForm({ ...appealForm, outcome: e.target.value })} disabled={appealForm.status !== "completed"}>
                    <option value="fullRefund">Full Refund ($3.00)</option>
                    <option value="partialRefund">Partial Refund ($1.50)</option>
                    <option value="fee">Fee Only ($0.25)</option>
                    <option value="lost">Lost ($0.00)</option>
                  </select>
                </div>
                <div className="form-group"><button type="submit" className="btn btn-primary" style={{ marginBottom: 3 }}>Add Appeal</button></div>
              </form>
            </div>
            <div className="card" style={{ overflowX: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h3>Appeals for Selected Cycle</h3>
                <div className="badge badge-success" style={{ fontSize: "1rem", padding: "0.5rem 1rem" }}>
                  Total Bonus: ${Math.min(
                    appeals.filter((a) => a.status === "completed").reduce((s, a) => s + (OPS_APPEALS_BONUS[a.outcome] ?? 0), 0),
                    OPS_APPEALS_CAP
                  ).toFixed(2)} (cap $200)
                </div>
              </div>
              <table className="data-table">
                <thead><tr><th>Agent</th><th>Date</th><th>Order No.</th><th>Status</th><th>Outcome</th><th>Bonus</th><th>Actions</th></tr></thead>
                <tbody>
                  {[...appeals].sort((a, b) => b.date.localeCompare(a.date)).map((a) => (
                    <tr key={a.id}>
                      <td>{agents.find((ag) => ag.id === a.agentId)?.name ?? "—"}</td>
                      <td>{a.date}</td>
                      <td>{a.orderNumber}</td>
                      <td><span className={`badge ${a.status === "completed" ? "badge-success" : a.status === "pending" ? "badge-warning" : "badge-warning"}`} style={a.status === "pending" ? { background: "#fed7aa", color: "#9a3412", border: "none" } : {}}>{a.status === "completed" ? "Completed" : a.status === "pending" ? "Pending" : "In Progress"}</span></td>
                      <td>{a.status === "completed" ? OUTCOME_LABELS[a.outcome] : "—"}</td>
                      <td>${a.status === "completed" ? (OPS_APPEALS_BONUS[a.outcome] ?? 0).toFixed(2) : "0.00"}</td>
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={() => requireAdmin(() => setEditingAppeal(a))}>Edit</button>{" "}
                        <button className="btn btn-sm btn-danger" onClick={() => requireAdmin(async () => { await deleteOpsAppeal(a.id); await load(); })}>Delete</button>
                      </td>
                    </tr>
                  ))}
                  {appeals.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)" }}>No appeals for this cycle</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* HANDLING TIME */}
        {activeTab === "handling" && (
          <section>
            <header className="section-header"><h2>Handling Time</h2></header>
            <div className="card" style={{ background: "#f9fafb", marginBottom: "1rem" }}>
              <h3 style={{ marginBottom: "0.75rem" }}>Bonus Table</h3>
              <table className="data-table">
                <thead><tr><th>Handling Time</th><th>Bonus</th></tr></thead>
                <tbody>
                  {[["≤ 15 h","$50"],["15 – 20 h","$40"],["20 – 25 h","$30"],["25 – 30 h","$20"],["30 – 35 h","$10"],["> 35 h","$0"]].map(([r, b]) => (
                    <tr key={r}><td>{r}</td><td>{b}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            {agents.map((ag) => {
              const ht = handlingTimes.find((h) => h.agentId === ag.id);
              const val = handlingForms[ag.id] ?? "";
              const preview = val !== "" && !isNaN(Number(val)) ? calcHandlingTimeBonus(Number(val)) : null;
              return (
                <div key={ag.id} className="card">
                  <h3 style={{ marginBottom: "1rem" }}>{ag.name}</h3>
                  <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", flexWrap: "wrap" }}>
                    <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                      <label>Handling Time (hours)</label>
                      <input type="number" min="0" step="0.1" className="form-control" placeholder="ej. 18.5"
                        value={val} onChange={(e) => setHandlingForms((p) => ({ ...p, [ag.id]: e.target.value }))} />
                    </div>
                    {preview !== null && (
                      <div style={{ padding: "0.5rem 1rem", background: "#f3f0ff", borderRadius: "6px", fontWeight: 600, color: "#7c3aed", whiteSpace: "nowrap" }}>
                        Bonus: ${preview.toFixed(2)}
                      </div>
                    )}
                    <button className="btn btn-primary" style={{ background: handlingSaved[ag.id] ? "#16a34a" : undefined, whiteSpace: "nowrap" }} onClick={() => saveHandlingTime(ag.id)}>
                      {handlingSaved[ag.id] ? "Saved! ✓" : "Save"}
                    </button>
                  </div>
                  {ht && <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "var(--text-muted)" }}>Last saved: {ht.hours}h → ${calcHandlingTimeBonus(ht.hours).toFixed(2)}</p>}
                </div>
              );
            })}
          </section>
        )}

        {/* TIKTOK */}
        {activeTab === "tiktok" && (
          <section>
            <header className="section-header"><h2>TikTok Account Score</h2></header>
            <div className="card">
              <form onSubmit={submitTikTok} className="form-row">
                <div className="form-group">
                  <label>Start Date</label>
                  <input type="date" className="form-control" value={tiktokForm.startDate} onChange={(e) => setTiktokForm({ ...tiktokForm, startDate: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>End Date</label>
                  <input type="date" className="form-control" value={tiktokForm.endDate} min={tiktokForm.startDate} onChange={(e) => setTiktokForm({ ...tiktokForm, endDate: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Score (0–5){tiktokDuration > 0 && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> — {tiktokDuration} day{tiktokDuration !== 1 ? "s" : ""}</span>}</label>
                  <input type="number" step="0.01" min="0" max="5" className="form-control" value={tiktokForm.score} onChange={(e) => setTiktokForm({ ...tiktokForm, score: e.target.value })} required />
                </div>
                <div className="form-group"><button type="submit" className="btn btn-primary" style={{ marginBottom: 3 }} disabled={tiktokDuration < 1}>Add Score</button></div>
              </form>
            </div>
            <div className="card" style={{ overflowX: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3>Scores</h3>
                <div className="badge badge-success" style={{ fontSize: "1rem", padding: "0.5rem 1rem" }}>Total Bonus: ${tiktokBonus.toFixed(2)}</div>
              </div>
              <table className="data-table">
                <thead><tr><th>Date Range</th><th>Score</th><th>Tier Value</th><th>Earned</th><th>Actions</th></tr></thead>
                <tbody>
                  {[...tiktokScores].sort((a, b) => b.date.localeCompare(a.date)).map((t) => {
                    const s = t.score;
                    let mv = 0;
                    if (s <= 4.0) mv = 20; else if (s <= 4.4) mv = 30; else if (s <= 4.6) mv = 60;
                    else if (s <= 4.7) mv = 70; else if (s <= 4.8) mv = 80; else mv = 100;
                    const earned = (mv / cycleDays) * t.duration;
                    const endDate = new Date(t.date);
                    endDate.setDate(endDate.getDate() + t.duration - 1);
                    return (
                      <tr key={t.id}>
                        <td>{t.duration > 1 ? `${t.date} – ${endDate.toISOString().slice(0, 10)}` : t.date}</td>
                        <td>{t.score}</td>
                        <td>${mv.toFixed(2)}</td>
                        <td>+${earned.toFixed(2)}</td>
                        <td><button className="btn btn-sm btn-danger" onClick={() => requireAdmin(async () => { await deleteOpsTikTokScore(t.id); await load(); })}>Delete</button></td>
                      </tr>
                    );
                  })}
                  {tiktokScores.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>No scores for this cycle</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* SETTINGS */}
        {activeTab === "settings" && (
          <section>
            <header className="section-header"><h2>Settings</h2></header>
            <div className="card">
              <h3>Agent Names</h3>
              {agents.map((ag) => (
                <div key={ag.id} className="form-group" style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}>
                    <label>Agent {ag.id}</label>
                    <input type="text" className="form-control" value={agentNames[ag.id] ?? ""} onChange={(e) => setAgentNames({ ...agentNames, [ag.id]: e.target.value })} />
                  </div>
                  <button className="btn btn-primary" onClick={() => saveAgentName(ag.id)}>Save</button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Password Modal */}
      {showPassword && (
        <div className="modal-overlay active">
          <div className="modal">
            <div className="modal-header"><h3>Admin Authorization</h3></div>
            <p style={{ marginBottom: "1rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>This action requires the admin password.</p>
            <form onSubmit={handlePasswordSubmit}>
              <input type="password" className="form-control" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" autoFocus required />
              {passwordError && <p className="error-msg">{passwordError}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPassword(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Authorize</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Appeal Modal */}
      {editingAppeal && (
        <div className="modal-overlay active">
          <div className="modal">
            <div className="modal-header"><h3>Edit Appeal</h3></div>
            <form onSubmit={submitEditAppeal}>
              <div className="form-group">
                <label>Agent</label>
                <select className="form-control" value={editingAppeal.agentId} onChange={(e) => setEditingAppeal({ ...editingAppeal, agentId: Number(e.target.value) })}>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" className="form-control" value={editingAppeal.date} onChange={(e) => setEditingAppeal({ ...editingAppeal, date: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Order Number</label>
                <input type="text" className="form-control" value={editingAppeal.orderNumber} onChange={(e) => setEditingAppeal({ ...editingAppeal, orderNumber: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select className="form-control" value={editingAppeal.status} onChange={(e) => setEditingAppeal({ ...editingAppeal, status: e.target.value as any })}>
                  <option value="pending">Pending</option>
                  <option value="inProgress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div className="form-group">
                <label>Outcome</label>
                <select className="form-control" value={editingAppeal.outcome} onChange={(e) => setEditingAppeal({ ...editingAppeal, outcome: e.target.value as any })} disabled={editingAppeal.status !== "completed"}>
                  <option value="fullRefund">Full Refund ($3.00)</option>
                  <option value="partialRefund">Partial Refund ($1.50)</option>
                  <option value="fee">Fee Only ($0.25)</option>
                  <option value="lost">Lost ($0.00)</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingAppeal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
