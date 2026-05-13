import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Agent, Appeal, UsaPeriodData, TikTokScore } from "../types";
import {
  getAgents, updateAgentName,
  getAppeals, addAppeal, updateAppeal, deleteAppeal,
  getPeriodData, upsertPeriodData,
  getTikTokScores, addTikTokScore, deleteTikTokScore,
} from "../services/api";
import {
  getCyclesForYear, getCurrentCycleDefault, getCycleFromDate,
  APPEALS_BONUS, AMAZON_BONUS, CS_BONUS, calcTikTokBonus,
} from "../services/usaCycles";

const YEARS = ["2025", "2026", "2027", "2028"];
const OUTCOME_LABELS: Record<string, string> = {
  fullRefund: "Full Refund",
  partialRefund: "Partial Refund",
  fee: "Fee",
  lost: "Lost",
};

function AmazonAgentForm({ agentId, year, cycleId, initial, currentCsQuality, onSave }: {
  agentId: number; year: number; cycleId: string; initial: string; currentCsQuality: string; onSave: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setValue(initial); }, [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await upsertPeriodData({ agentId, year, cycleId, amazonHealth: value as any, csQuality: currentCsQuality as any });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSave();
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: "1rem", alignItems: "flex-end", flexWrap: "wrap" }}>
      <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
        <select className="form-control" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="good">Good ($50)</option>
          <option value="minor">Minor Issues / Pending ($15)</option>
          <option value="bad">Bad ($0)</option>
        </select>
      </div>
      <button type="submit" className="btn btn-primary">Save</button>
      {saved && <span style={{ color: "var(--success)", fontSize: "0.875rem" }}>Saved!</span>}
    </form>
  );
}

function CSAgentForm({ agentId, year, cycleId, initial, currentAmazonHealth, onSave }: {
  agentId: number; year: number; cycleId: string; initial: string; currentAmazonHealth: string; onSave: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setValue(initial); }, [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await upsertPeriodData({ agentId, year, cycleId, amazonHealth: currentAmazonHealth as any, csQuality: value as any });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSave();
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: "1rem", alignItems: "flex-end", flexWrap: "wrap" }}>
      <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
        <select className="form-control" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="0">0 Negatives ($50)</option>
          <option value="1">1 Negative ($25)</option>
          <option value="2">2+ Negatives ($0)</option>
        </select>
      </div>
      <button type="submit" className="btn btn-primary">Save</button>
      {saved && <span style={{ color: "var(--success)", fontSize: "0.875rem" }}>Saved!</span>}
    </form>
  );
}

export default function UsaDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("summary");
  const defaultCycle = getCurrentCycleDefault();
  const [year, setYear] = useState(defaultCycle.year);
  const [cycleId, setCycleId] = useState(defaultCycle.cycleId);
  const [cycles, setCycles] = useState(() => getCyclesForYear(Number(defaultCycle.year)));

  const [agents, setAgents] = useState<Agent[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [periodData, setPeriodData] = useState<UsaPeriodData[]>([]);
  const [tiktokScores, setTiktokScores] = useState<TikTokScore[]>([]);

  const [appealFilter, setAppealFilter] = useState("all");
  const [editingAppeal, setEditingAppeal] = useState<Appeal | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const ADMIN_PASSWORD = "usa2026";

  const load = useCallback(async () => {
    const [ag, ap, pd, tk] = await Promise.all([
      getAgents("USA"),
      getAppeals(Number(year), cycleId),
      getPeriodData(Number(year), cycleId),
      getTikTokScores(Number(year), cycleId),
    ]);
    setAgents(ag);
    setAppeals(ap);
    setPeriodData(pd);
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

  const agentName = (agentId: number) =>
    agents.find((a) => a.id === agentId)?.name ?? "Unknown";

  const getPeriod = (agentId: number) =>
    periodData.find((p) => p.agentId === agentId);

  const cycleInfo = getCyclesForYear(Number(year)).find((c) => c.id === cycleId);
  const cycleDays = cycleInfo?.days ?? 15;
  const tiktokBonus = calcTikTokBonus(tiktokScores, cycleDays);

  const totals = agents.map((ag) => {
    const ap = appeals.filter((a) => a.agentId === ag.id && a.status === "completed")
      .reduce((s, a) => s + (APPEALS_BONUS[a.outcome] ?? 0), 0);
    const pd = getPeriod(ag.id);
    const amz = AMAZON_BONUS[pd?.amazonHealth ?? "bad"] ?? 0;
    const cs = CS_BONUS[pd?.csQuality ?? "2"] ?? 0;
    return { agent: ag, appeals: ap, amazon: amz, cs, tiktok: tiktokBonus, total: ap + amz + cs + tiktokBonus };
  });

  // ── Appeal form state
  const [appealForm, setAppealForm] = useState({
    agentId: 0, date: "", orderNumber: "", platform: "Amazon",
    status: "inProgress", outcome: "fullRefund",
  });

  const submitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    const { year: appealYear, cycleId: appealCycleId } = getCycleFromDate(appealForm.date);
    await addAppeal({ ...appealForm, agentId: Number(appealForm.agentId), year: appealYear, cycleId: appealCycleId, platform: appealForm.platform as "Amazon" | "TikTok", status: appealForm.status as "inProgress" | "completed", outcome: appealForm.outcome as "fullRefund" | "partialRefund" | "fee" | "lost" });
    await load();
    setAppealForm({ agentId: 0, date: "", orderNumber: "", platform: "Amazon", status: "inProgress", outcome: "fullRefund" });
  };

  const submitEditAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAppeal) return;
    await updateAppeal(editingAppeal.id, editingAppeal);
    setEditingAppeal(null);
    await load();
  };

  const handleDeleteAppeal = (id: number) => {
    requireAdmin(async () => { await deleteAppeal(id); await load(); });
  };


  // ── TikTok form (date range)
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
    await addTikTokScore({ date: tiktokForm.startDate, score: Number(tiktokForm.score), duration: tiktokDuration, year: tkYear, cycleId: tkCycleId });
    await load();
    setTiktokForm({ startDate: "", endDate: "", score: "" });
  };

  const handleDeleteTikTok = (id: number) => {
    requireAdmin(async () => { await deleteTikTokScore(id); await load(); });
  };

  // ── Agent name settings
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

  const filteredAppeals = appealFilter === "all"
    ? [...appeals].sort((a, b) => b.date.localeCompare(a.date))
    : [...appeals].filter((a) => a.agentId === Number(appealFilter)).sort((a, b) => b.date.localeCompare(a.date));


  return (
    <div>
      <nav className="top-nav">
        <div className="logo">Bonus Tracker — <span style={{ color: "#1e40af" }}>USA</span></div>
        <ul className="nav-links">
          {["summary", "appeals", "amazon", "cs-quality", "tiktok", "settings"].map((tab) => (
            <li key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
              {tab === "cs-quality" ? "CS Quality" : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </li>
          ))}
        </ul>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <select className="month-selector" value={year} onChange={(e) => {
            const newYear = e.target.value;
            setYear(newYear);
            setCycles(getCyclesForYear(Number(newYear)));
            setCycleId("0");
          }}>
            {YEARS.map((y) => <option key={y}>{y}</option>)}
          </select>
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
            <header className="section-header"><h2>Bonifications Summary</h2></header>
            <div className="summary-cards">
              {totals.map((t) => (
                <div key={t.agent.id} className="stat-card">
                  <h3>{t.agent.name} Total</h3>
                  <div className="amount" style={{ color: "var(--primary)" }}>${t.total.toFixed(2)}</div>
                </div>
              ))}
              <div className="stat-card">
                <h3>Combined Total</h3>
                <div className="amount">${totals.reduce((s, t) => s + t.total, 0).toFixed(2)}</div>
              </div>
            </div>
            <div className="card">
              <h3>Category Breakdown</h3>
              <table className="data-table">
                <thead><tr><th>Category</th>{agents.map((a) => <th key={a.id}>{a.name}</th>)}</tr></thead>
                <tbody>
                  {["appeals", "amazon", "cs", "tiktok"].map((cat) => (
                    <tr key={cat}>
                      <td>{cat === "cs" ? "CS Quality" : cat === "tiktok" ? "TikTok (Shared)" : cat.charAt(0).toUpperCase() + cat.slice(1)}</td>
                      {totals.map((t) => <td key={t.agent.id}>${(t as any)[cat].toFixed(2)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* APPEALS */}
        {activeTab === "appeals" && (
          <section>
            <header className="section-header"><h2>Appeals</h2></header>
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
                  <input type="text" className="form-control" placeholder="111-2222222-3333333" value={appealForm.orderNumber} onChange={(e) => setAppealForm({ ...appealForm, orderNumber: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Platform</label>
                  <select className="form-control" value={appealForm.platform} onChange={(e) => setAppealForm({ ...appealForm, platform: e.target.value })}>
                    <option>Amazon</option><option>TikTok</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select className="form-control" value={appealForm.status} onChange={(e) => setAppealForm({ ...appealForm, status: e.target.value })}>
                    <option value="inProgress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Outcome</label>
                  <select className="form-control" value={appealForm.outcome} onChange={(e) => setAppealForm({ ...appealForm, outcome: e.target.value })} disabled={appealForm.status === "inProgress"}>
                    <option value="fullRefund">Full Refund ($4.00)</option>
                    <option value="partialRefund">Partial Refund ($2.00)</option>
                    <option value="fee">Fee ($0.50)</option>
                    <option value="lost">Lost ($0.00)</option>
                  </select>
                </div>
                <div className="form-group"><button type="submit" className="btn btn-primary" style={{ marginBottom: 3 }}>Add Appeal</button></div>
              </form>
            </div>
            <div className="card" style={{ overflowX: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h3>Appeals for Selected Period</h3>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                  <select className="form-control" style={{ width: "auto" }} value={appealFilter} onChange={(e) => setAppealFilter(e.target.value)}>
                    <option value="all">All Agents</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <div className="badge badge-success" style={{ fontSize: "1rem", padding: "0.5rem 1rem", whiteSpace: "nowrap" }}>
                    Total Bonus: ${filteredAppeals
                      .filter((a) => a.status === "completed")
                      .reduce((s, a) => s + (APPEALS_BONUS[a.outcome] ?? 0), 0)
                      .toFixed(2)}
                  </div>
                </div>
              </div>
              <table className="data-table">
                <thead><tr><th>Agent</th><th>Date</th><th>Order No.</th><th>Platform</th><th>Status</th><th>Outcome</th><th>Bonus</th><th>Actions</th></tr></thead>
                <tbody>
                  {filteredAppeals.map((a) => (
                    <tr key={a.id}>
                      <td>{agentName(a.agentId)}</td>
                      <td>{a.date}</td>
                      <td>{a.orderNumber}</td>
                      <td>{a.platform}</td>
                      <td><span className={`badge ${a.status === "inProgress" ? "badge-warning" : "badge-success"}`}>{a.status === "inProgress" ? "In Progress" : "Completed"}</span></td>
                      <td>{a.status === "completed" ? OUTCOME_LABELS[a.outcome] : "—"}</td>
                      <td>${a.status === "completed" ? (APPEALS_BONUS[a.outcome] ?? 0).toFixed(2) : "0.00"}</td>
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={() => requireAdmin(() => setEditingAppeal(a))}>Edit</button>{" "}
                        <button className="btn btn-sm btn-danger" onClick={() => handleDeleteAppeal(a.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* AMAZON */}
        {activeTab === "amazon" && (
          <section>
            <header className="section-header"><h2>Amazon Account Health</h2></header>
            {agents.map((ag) => {
              const current = getPeriod(ag.id)?.amazonHealth ?? "bad";
              return (
                <div key={ag.id} className="card">
                  <h3 style={{ marginBottom: "1rem" }}>{ag.name}</h3>
                  <AmazonAgentForm
                    agentId={ag.id} year={Number(year)} cycleId={cycleId}
                    initial={current} currentCsQuality={getPeriod(ag.id)?.csQuality ?? "2"} onSave={load}
                  />
                </div>
              );
            })}
          </section>
        )}

        {/* CS QUALITY */}
        {activeTab === "cs-quality" && (
          <section>
            <header className="section-header"><h2>Customer Service Quality</h2></header>
            {agents.map((ag) => {
              const current = getPeriod(ag.id)?.csQuality ?? "2";
              return (
                <div key={ag.id} className="card">
                  <h3 style={{ marginBottom: "1rem" }}>{ag.name}</h3>
                  <CSAgentForm
                    agentId={ag.id} year={Number(year)} cycleId={cycleId}
                    initial={current} currentAmazonHealth={getPeriod(ag.id)?.amazonHealth ?? "bad"} onSave={load}
                  />
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
              <p style={{ marginBottom: "1.5rem", color: "var(--text-muted)" }}>Shared for both agents.</p>
              <form onSubmit={submitTikTok} className="form-row">
                <div className="form-group">
                  <label>Start Date</label>
                  <input type="date" className="form-control" value={tiktokForm.startDate}
                    onChange={(e) => setTiktokForm({ ...tiktokForm, startDate: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>End Date</label>
                  <input type="date" className="form-control" value={tiktokForm.endDate}
                    min={tiktokForm.startDate}
                    onChange={(e) => setTiktokForm({ ...tiktokForm, endDate: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Score (e.g. 4.5){tiktokDuration > 0 && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> — {tiktokDuration} day{tiktokDuration !== 1 ? "s" : ""}</span>}</label>
                  <input type="number" step="0.01" min="0" max="5" className="form-control" value={tiktokForm.score}
                    onChange={(e) => setTiktokForm({ ...tiktokForm, score: e.target.value })} required />
                </div>
                <div className="form-group"><button type="submit" className="btn btn-primary" style={{ marginBottom: 3 }} disabled={tiktokDuration < 1}>Add Score</button></div>
              </form>
            </div>
            <div className="card" style={{ overflowX: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3>Daily Scores</h3>
                <div className="badge badge-success" style={{ fontSize: "1rem", padding: "0.5rem 1rem" }}>
                  Total Bonus: ${tiktokBonus.toFixed(2)}
                </div>
              </div>
              <table className="data-table">
                <thead><tr><th>Date</th><th>Score</th><th>Tier Value</th><th>Earned</th><th>Actions</th></tr></thead>
                <tbody>
                  {[...tiktokScores].sort((a, b) => b.date.localeCompare(a.date)).map((t) => {
                    const s = t.score;
                    let mv = 0;
                    if (s <= 4.0) mv = 20; else if (s <= 4.4) mv = 30; else if (s <= 4.6) mv = 60;
                    else if (s <= 4.7) mv = 70; else if (s <= 4.8) mv = 80; else mv = 100;
                    const earned = (mv / cycleDays) * t.duration;
                    return (
                      <tr key={t.id}>
                        <td>{t.duration > 1 ? (() => { const end = new Date(t.date); end.setDate(end.getDate() + t.duration - 1); return `${t.date} – ${end.toISOString().slice(0,10)}`; })() : t.date}</td>
                        <td>{t.score}</td>
                        <td>${mv.toFixed(2)}</td>
                        <td>+${earned.toFixed(2)}</td>
                        <td><button className="btn btn-sm btn-danger" onClick={() => handleDeleteTikTok(t.id)}>Delete</button></td>
                      </tr>
                    );
                  })}
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

      {/* Admin Password Modal */}
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
                <label>Platform</label>
                <select className="form-control" value={editingAppeal.platform} onChange={(e) => setEditingAppeal({ ...editingAppeal, platform: e.target.value as any })}>
                  <option>Amazon</option><option>TikTok</option>
                </select>
              </div>
              <div className="form-group">
                <label>Status</label>
                <select className="form-control" value={editingAppeal.status} onChange={(e) => setEditingAppeal({ ...editingAppeal, status: e.target.value as any })}>
                  <option value="inProgress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div className="form-group">
                <label>Outcome</label>
                <select className="form-control" value={editingAppeal.outcome} onChange={(e) => setEditingAppeal({ ...editingAppeal, outcome: e.target.value as any })} disabled={editingAppeal.status === "inProgress"}>
                  <option value="fullRefund">Full Refund ($4.00)</option>
                  <option value="partialRefund">Partial Refund ($2.00)</option>
                  <option value="fee">Fee ($0.50)</option>
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
