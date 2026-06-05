import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Agent, AptA2zClaim, AptSafetyClaim, AptFeedback, AptAccountHealth, AptTikTokHealth, AptPerformance } from "../types";
import {
  getAgents, updateAgentName,
  getAptA2zClaims, addAptA2zClaim, deleteAptA2zClaim,
  getAptSafetyClaims, addAptSafetyClaim, deleteAptSafetyClaim,
  getAptFeedbacks, addAptFeedback, deleteAptFeedback,
  getAptAccountHealth, addAptAccountHealth, deleteAptAccountHealth,
  getAptTikTokHealth, addAptTikTokHealth, deleteAptTikTokHealth,
  getAptPerformance, upsertAptPerformance,
} from "../services/api";
import { getCyclesForYear, getCurrentCycleDefault, getCycleFromDate } from "../services/usaCycles";
import {
  APT_TOTAL_CAP, APT_A2Z_BONUS, APT_SAFETY_BONUS, APT_FEEDBACK_BONUS,
  APT_ACCOUNT_HEALTH_BONUS, APT_TIKTOK_HEALTH_BONUS, APT_PERFORMANCE_BONUS, APT_PERFORMANCE_LABELS,
} from "../services/aptBonus";

const YEARS = ["2025", "2026", "2027", "2028"];
const ADMIN_PASSWORD = "apt2026!";

const TABS: [string, string][] = [
  ["summary", "Summary"],
  ["a2z", "A2Z Claims"],
  ["safety", "Safety Claims"],
  ["feedbacks", "Feedbacks"],
  ["health", "Account Health"],
  ["tiktok-health", "TikTok Health"],
  ["performance", "Performance"],
  ["settings", "Settings"],
];

const SAFETY_LABELS: Record<string, string> = {
  fullRecovery: "Full Recovery ($3.00)",
  partialRecovery: "Partial Recovery ($1.50)",
  fees: "Fees Only ($0.25)",
  lost: "Lost ($0.00)",
};

const HEALTH_LABELS: Record<string, string> = {
  penalty: "Penalty Removed ($5.00)",
  violation: "Violation Removed ($5.00)",
  health_appeal: "Health Appeal Won ($5.00)",
};

const TIKTOK_HEALTH_LABELS: Record<string, string> = {
  non_buyer_fault: "Non-Buyer Fault Rate ($2.00)",
  defective_item: "Defective Item Rate ($2.00)",
};

function SimpleEntryForm({ label, agentOptions, onSubmit }: {
  label: string;
  agentOptions: { id: number; name: string }[];
  onSubmit: (agentId: number, date: string) => Promise<void>;
}) {
  const [agentId, setAgentId] = useState(0);
  const [date, setDate] = useState("");
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(Number(agentId), date);
    setAgentId(0);
    setDate("");
  };
  return (
    <form onSubmit={handleSubmit} className="form-row">
      <div className="form-group">
        <label>Agent</label>
        <select className="form-control" value={agentId} onChange={(e) => setAgentId(Number(e.target.value))} required>
          <option value={0} disabled>Select agent</option>
          {agentOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label>Date</label>
        <input type="date" className="form-control" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div className="form-group"><button type="submit" className="btn btn-primary" style={{ marginBottom: 3 }}>{label}</button></div>
    </form>
  );
}

export default function AccountProtectionDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("summary");
  const defaultCycle = getCurrentCycleDefault();
  const [year, setYear] = useState(defaultCycle.year);
  const [cycleId, setCycleId] = useState(defaultCycle.cycleId);
  const [cycles, setCycles] = useState(() => getCyclesForYear(Number(defaultCycle.year)));

  const [agents, setAgents] = useState<Agent[]>([]);
  const [a2zClaims, setA2zClaims] = useState<AptA2zClaim[]>([]);
  const [safetyClaims, setSafetyClaims] = useState<AptSafetyClaim[]>([]);
  const [feedbacks, setFeedbacks] = useState<AptFeedback[]>([]);
  const [accountHealth, setAccountHealth] = useState<AptAccountHealth[]>([]);
  const [tiktokHealth, setTiktokHealth] = useState<AptTikTokHealth[]>([]);
  const [performance, setPerformance] = useState<AptPerformance[]>([]);

  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const load = useCallback(async () => {
    const [ag, a2z, saf, fb, ah, th, perf] = await Promise.all([
      getAgents("APT"),
      getAptA2zClaims(Number(year), cycleId),
      getAptSafetyClaims(Number(year), cycleId),
      getAptFeedbacks(Number(year), cycleId),
      getAptAccountHealth(Number(year), cycleId),
      getAptTikTokHealth(Number(year), cycleId),
      getAptPerformance(Number(year), cycleId),
    ]);
    setAgents(ag);
    setA2zClaims(a2z);
    setSafetyClaims(saf);
    setFeedbacks(fb);
    setAccountHealth(ah);
    setTiktokHealth(th);
    setPerformance(perf);
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

  // ── Per-agent totals
  const agentTotals = agents.map((ag) => {
    const a2z = a2zClaims.filter((c) => c.agentId === ag.id).length * APT_A2Z_BONUS;
    const safety = safetyClaims.filter((c) => c.agentId === ag.id).reduce((s, c) => s + (APT_SAFETY_BONUS[c.outcome] ?? 0), 0);
    const fb = feedbacks.filter((f) => f.agentId === ag.id).length * APT_FEEDBACK_BONUS;
    const ah = accountHealth.filter((h) => h.agentId === ag.id).length * APT_ACCOUNT_HEALTH_BONUS;
    const th = tiktokHealth.filter((h) => h.agentId === ag.id).reduce((s, h) => s + (APT_TIKTOK_HEALTH_BONUS[h.type] ?? 0), 0);
    const perf = APT_PERFORMANCE_BONUS[performance.find((p) => p.agentId === ag.id)?.level ?? "deficient"] ?? 0;
    const raw = a2z + safety + fb + ah + th + perf;
    const total = Math.min(raw, APT_TOTAL_CAP);
    return { agent: ag, a2z, safety, fb, ah, th, perf, raw, total };
  });

  // ── Safety claim form
  const [safetyForm, setSafetyForm] = useState({ agentId: 0, date: "", outcome: "fullRecovery" });
  const submitSafety = async (e: React.FormEvent) => {
    e.preventDefault();
    const { year: y, cycleId: c } = getCycleFromDate(safetyForm.date);
    await addAptSafetyClaim({ agentId: Number(safetyForm.agentId), date: safetyForm.date, outcome: safetyForm.outcome as any, year: y, cycleId: c });
    await load();
    setSafetyForm({ agentId: 0, date: "", outcome: "fullRecovery" });
  };

  // ── Feedback form
  const [feedbackForm, setFeedbackForm] = useState({ agentId: 0, date: "", platform: "Amazon" });
  const submitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    const { year: y, cycleId: c } = getCycleFromDate(feedbackForm.date);
    await addAptFeedback({ agentId: Number(feedbackForm.agentId), date: feedbackForm.date, platform: feedbackForm.platform as any, year: y, cycleId: c });
    await load();
    setFeedbackForm({ agentId: 0, date: "", platform: "Amazon" });
  };

  // ── Account health form
  const [healthForm, setHealthForm] = useState({ agentId: 0, date: "", type: "penalty" });
  const submitHealth = async (e: React.FormEvent) => {
    e.preventDefault();
    const { year: y, cycleId: c } = getCycleFromDate(healthForm.date);
    await addAptAccountHealth({ agentId: Number(healthForm.agentId), date: healthForm.date, type: healthForm.type as any, year: y, cycleId: c });
    await load();
    setHealthForm({ agentId: 0, date: "", type: "penalty" });
  };

  // ── TikTok health form
  const [tikHealthForm, setTikHealthForm] = useState({ agentId: 0, date: "", type: "non_buyer_fault" });
  const submitTikHealth = async (e: React.FormEvent) => {
    e.preventDefault();
    const { year: y, cycleId: c } = getCycleFromDate(tikHealthForm.date);
    await addAptTikTokHealth({ agentId: Number(tikHealthForm.agentId), date: tikHealthForm.date, type: tikHealthForm.type as any, year: y, cycleId: c });
    await load();
    setTikHealthForm({ agentId: 0, date: "", type: "non_buyer_fault" });
  };

  // ── Performance draft & saved state
  const [perfDraft, setPerfDraft] = useState<Record<number, string>>({});
  const [perfSaved, setPerfSaved] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const draft: Record<number, string> = {};
    agents.forEach((ag) => {
      draft[ag.id] = performance.find((p) => p.agentId === ag.id)?.level ?? "deficient";
    });
    setPerfDraft(draft);
  }, [agents, performance]);

  const savePerformance = async (agentId: number) => {
    const { year: y, cycleId: c } = { year: Number(year), cycleId };
    await upsertAptPerformance({ agentId, year: y, cycleId: c, level: perfDraft[agentId] as any ?? "deficient" });
    await load();
    setPerfSaved((prev) => ({ ...prev, [agentId]: true }));
    setTimeout(() => setPerfSaved((prev) => ({ ...prev, [agentId]: false })), 2000);
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

  const agentName = (id: number) => agents.find((a) => a.id === id)?.name ?? "—";

  return (
    <div>
      <nav className="top-nav">
        <div className="logo">Bonus Tracker — <span style={{ color: "#0891b2" }}>Account Protection 🇺🇸</span></div>
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
            <header className="section-header"><h2>Bonifications Summary — Account Protection</h2></header>
            <div className="summary-cards">
              {agentTotals.map((t) => (
                <div key={t.agent.id} className="stat-card" style={{ borderTopColor: "#0891b2" }}>
                  <h3>{t.agent.name}</h3>
                  <div className="amount" style={{ color: "#0891b2" }}>${t.total.toFixed(2)}</div>
                  {t.raw > APT_TOTAL_CAP && (
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
                  <tr><td>A2Z Claims</td>{agentTotals.map((t) => <td key={t.agent.id}>${t.a2z.toFixed(2)}</td>)}</tr>
                  <tr><td>Safety Claims</td>{agentTotals.map((t) => <td key={t.agent.id}>${t.safety.toFixed(2)}</td>)}</tr>
                  <tr><td>Feedbacks Removidos</td>{agentTotals.map((t) => <td key={t.agent.id}>${t.fb.toFixed(2)}</td>)}</tr>
                  <tr><td>Account Health</td>{agentTotals.map((t) => <td key={t.agent.id}>${t.ah.toFixed(2)}</td>)}</tr>
                  <tr><td>TikTok Health</td>{agentTotals.map((t) => <td key={t.agent.id}>${t.th.toFixed(2)}</td>)}</tr>
                  <tr><td>Performance</td>{agentTotals.map((t) => <td key={t.agent.id}>${t.perf.toFixed(2)}</td>)}</tr>
                  <tr style={{ fontWeight: 600 }}>
                    <td>Total (cap $300)</td>
                    {agentTotals.map((t) => <td key={t.agent.id}>${t.total.toFixed(2)}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* A2Z CLAIMS */}
        {activeTab === "a2z" && (
          <section>
            <header className="section-header"><h2>A2Z Claims — $5.00 per case won</h2></header>
            <div className="card">
              <SimpleEntryForm label="Add A2Z Claim" agentOptions={agents} onSubmit={async (agentId, date) => {
                const { year: y, cycleId: c } = getCycleFromDate(date);
                await addAptA2zClaim({ agentId, date, year: y, cycleId: c });
                await load();
              }} />
            </div>
            <div className="card" style={{ overflowX: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3>Cases for Selected Cycle</h3>
                <div className="badge badge-success" style={{ fontSize: "1rem", padding: "0.5rem 1rem" }}>
                  Total: ${(a2zClaims.length * APT_A2Z_BONUS).toFixed(2)}
                </div>
              </div>
              <table className="data-table">
                <thead><tr><th>Agent</th><th>Date</th><th>Bonus</th><th>Actions</th></tr></thead>
                <tbody>
                  {a2zClaims.map((c) => (
                    <tr key={c.id}>
                      <td>{agentName(c.agentId)}</td>
                      <td>{c.date}</td>
                      <td>${APT_A2Z_BONUS.toFixed(2)}</td>
                      <td><button className="btn btn-sm btn-danger" onClick={() => requireAdmin(async () => { await deleteAptA2zClaim(c.id); await load(); })}>Delete</button></td>
                    </tr>
                  ))}
                  {a2zClaims.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)" }}>No claims for this cycle</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* SAFETY CLAIMS */}
        {activeTab === "safety" && (
          <section>
            <header className="section-header"><h2>Safety Claims</h2></header>
            <div className="card">
              <form onSubmit={submitSafety} className="form-row">
                <div className="form-group">
                  <label>Agent</label>
                  <select className="form-control" value={safetyForm.agentId} onChange={(e) => setSafetyForm({ ...safetyForm, agentId: Number(e.target.value) })} required>
                    <option value={0} disabled>Select agent</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" className="form-control" value={safetyForm.date} onChange={(e) => setSafetyForm({ ...safetyForm, date: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Outcome</label>
                  <select className="form-control" value={safetyForm.outcome} onChange={(e) => setSafetyForm({ ...safetyForm, outcome: e.target.value })}>
                    <option value="fullRecovery">Full Recovery ($3.00)</option>
                    <option value="partialRecovery">Partial Recovery ($1.50)</option>
                    <option value="fees">Fees Only ($0.25)</option>
                    <option value="lost">Lost ($0.00)</option>
                  </select>
                </div>
                <div className="form-group"><button type="submit" className="btn btn-primary" style={{ marginBottom: 3 }}>Add Claim</button></div>
              </form>
            </div>
            <div className="card" style={{ overflowX: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3>Claims for Selected Cycle</h3>
                <div className="badge badge-success" style={{ fontSize: "1rem", padding: "0.5rem 1rem" }}>
                  Total: ${safetyClaims.reduce((s, c) => s + (APT_SAFETY_BONUS[c.outcome] ?? 0), 0).toFixed(2)}
                </div>
              </div>
              <table className="data-table">
                <thead><tr><th>Agent</th><th>Date</th><th>Outcome</th><th>Bonus</th><th>Actions</th></tr></thead>
                <tbody>
                  {safetyClaims.map((c) => (
                    <tr key={c.id}>
                      <td>{agentName(c.agentId)}</td>
                      <td>{c.date}</td>
                      <td>{SAFETY_LABELS[c.outcome]?.split(" (")[0]}</td>
                      <td>${(APT_SAFETY_BONUS[c.outcome] ?? 0).toFixed(2)}</td>
                      <td><button className="btn btn-sm btn-danger" onClick={() => requireAdmin(async () => { await deleteAptSafetyClaim(c.id); await load(); })}>Delete</button></td>
                    </tr>
                  ))}
                  {safetyClaims.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>No claims for this cycle</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* FEEDBACKS */}
        {activeTab === "feedbacks" && (
          <section>
            <header className="section-header"><h2>Feedbacks Negativos Removidos — $0.50 cada uno</h2></header>
            <div className="card">
              <form onSubmit={submitFeedback} className="form-row">
                <div className="form-group">
                  <label>Agent</label>
                  <select className="form-control" value={feedbackForm.agentId} onChange={(e) => setFeedbackForm({ ...feedbackForm, agentId: Number(e.target.value) })} required>
                    <option value={0} disabled>Select agent</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" className="form-control" value={feedbackForm.date} onChange={(e) => setFeedbackForm({ ...feedbackForm, date: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Platform</label>
                  <select className="form-control" value={feedbackForm.platform} onChange={(e) => setFeedbackForm({ ...feedbackForm, platform: e.target.value })}>
                    <option>Amazon</option>
                    <option>TikTok</option>
                  </select>
                </div>
                <div className="form-group"><button type="submit" className="btn btn-primary" style={{ marginBottom: 3 }}>Add Feedback</button></div>
              </form>
            </div>
            <div className="card" style={{ overflowX: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3>Feedbacks for Selected Cycle</h3>
                <div className="badge badge-success" style={{ fontSize: "1rem", padding: "0.5rem 1rem" }}>
                  Total: ${(feedbacks.length * APT_FEEDBACK_BONUS).toFixed(2)}
                </div>
              </div>
              <table className="data-table">
                <thead><tr><th>Agent</th><th>Date</th><th>Platform</th><th>Bonus</th><th>Actions</th></tr></thead>
                <tbody>
                  {feedbacks.map((f) => (
                    <tr key={f.id}>
                      <td>{agentName(f.agentId)}</td>
                      <td>{f.date}</td>
                      <td>{f.platform}</td>
                      <td>${APT_FEEDBACK_BONUS.toFixed(2)}</td>
                      <td><button className="btn btn-sm btn-danger" onClick={() => requireAdmin(async () => { await deleteAptFeedback(f.id); await load(); })}>Delete</button></td>
                    </tr>
                  ))}
                  {feedbacks.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>No feedbacks for this cycle</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ACCOUNT HEALTH */}
        {activeTab === "health" && (
          <section>
            <header className="section-header"><h2>Account Health Appeals — $5.00 cada uno</h2></header>
            <div className="card">
              <form onSubmit={submitHealth} className="form-row">
                <div className="form-group">
                  <label>Agent</label>
                  <select className="form-control" value={healthForm.agentId} onChange={(e) => setHealthForm({ ...healthForm, agentId: Number(e.target.value) })} required>
                    <option value={0} disabled>Select agent</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" className="form-control" value={healthForm.date} onChange={(e) => setHealthForm({ ...healthForm, date: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Type</label>
                  <select className="form-control" value={healthForm.type} onChange={(e) => setHealthForm({ ...healthForm, type: e.target.value })}>
                    <option value="penalty">Penalty Removed</option>
                    <option value="violation">Violation Removed</option>
                    <option value="health_appeal">Health Appeal Won</option>
                  </select>
                </div>
                <div className="form-group"><button type="submit" className="btn btn-primary" style={{ marginBottom: 3 }}>Add Appeal</button></div>
              </form>
            </div>
            <div className="card" style={{ overflowX: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3>Appeals for Selected Cycle</h3>
                <div className="badge badge-success" style={{ fontSize: "1rem", padding: "0.5rem 1rem" }}>
                  Total: ${(accountHealth.length * APT_ACCOUNT_HEALTH_BONUS).toFixed(2)}
                </div>
              </div>
              <table className="data-table">
                <thead><tr><th>Agent</th><th>Date</th><th>Type</th><th>Bonus</th><th>Actions</th></tr></thead>
                <tbody>
                  {accountHealth.map((h) => (
                    <tr key={h.id}>
                      <td>{agentName(h.agentId)}</td>
                      <td>{h.date}</td>
                      <td>{HEALTH_LABELS[h.type]?.split(" (")[0]}</td>
                      <td>${APT_ACCOUNT_HEALTH_BONUS.toFixed(2)}</td>
                      <td><button className="btn btn-sm btn-danger" onClick={() => requireAdmin(async () => { await deleteAptAccountHealth(h.id); await load(); })}>Delete</button></td>
                    </tr>
                  ))}
                  {accountHealth.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>No appeals for this cycle</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TIKTOK HEALTH */}
        {activeTab === "tiktok-health" && (
          <section>
            <header className="section-header"><h2>TikTok Health Metrics</h2></header>
            <div className="card">
              <form onSubmit={submitTikHealth} className="form-row">
                <div className="form-group">
                  <label>Agent</label>
                  <select className="form-control" value={tikHealthForm.agentId} onChange={(e) => setTikHealthForm({ ...tikHealthForm, agentId: Number(e.target.value) })} required>
                    <option value={0} disabled>Select agent</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" className="form-control" value={tikHealthForm.date} onChange={(e) => setTikHealthForm({ ...tikHealthForm, date: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Type</label>
                  <select className="form-control" value={tikHealthForm.type} onChange={(e) => setTikHealthForm({ ...tikHealthForm, type: e.target.value })}>
                    <option value="non_buyer_fault">Non-Buyer Fault Rate ($2.00)</option>
                    <option value="defective_item">Defective Item Rate ($2.00)</option>
                  </select>
                </div>
                <div className="form-group"><button type="submit" className="btn btn-primary" style={{ marginBottom: 3 }}>Add Appeal</button></div>
              </form>
            </div>
            <div className="card" style={{ overflowX: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3>Appeals for Selected Cycle</h3>
                <div className="badge badge-success" style={{ fontSize: "1rem", padding: "0.5rem 1rem" }}>
                  Total: ${tiktokHealth.reduce((s, h) => s + (APT_TIKTOK_HEALTH_BONUS[h.type] ?? 0), 0).toFixed(2)}
                </div>
              </div>
              <table className="data-table">
                <thead><tr><th>Agent</th><th>Date</th><th>Type</th><th>Bonus</th><th>Actions</th></tr></thead>
                <tbody>
                  {tiktokHealth.map((h) => (
                    <tr key={h.id}>
                      <td>{agentName(h.agentId)}</td>
                      <td>{h.date}</td>
                      <td>{TIKTOK_HEALTH_LABELS[h.type]?.split(" (")[0]}</td>
                      <td>${(APT_TIKTOK_HEALTH_BONUS[h.type] ?? 0).toFixed(2)}</td>
                      <td><button className="btn btn-sm btn-danger" onClick={() => requireAdmin(async () => { await deleteAptTikTokHealth(h.id); await load(); })}>Delete</button></td>
                    </tr>
                  ))}
                  {tiktokHealth.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>No appeals for this cycle</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* PERFORMANCE */}
        {activeTab === "performance" && (
          <section>
            <header className="section-header"><h2>Bono de Performance — Evaluación Gerencial</h2></header>
            <div className="card" style={{ background: "#f0f9ff", marginBottom: "1rem" }}>
              <h3 style={{ marginBottom: "0.75rem" }}>Criterios de Evaluación</h3>
              <ul style={{ fontSize: "0.875rem", color: "var(--text-muted)", lineHeight: 1.8, paddingLeft: "1.25rem" }}>
                <li>¿Se apelaron todos los casos enviados?</li>
                <li>¿Se hizo seguimiento?</li>
                <li>¿Se cumplieron los tiempos?</li>
                <li>¿Se dejaron casos pendientes?</li>
                <li>¿Hubo iniciativa y proactividad?</li>
              </ul>
            </div>
            {agents.map((ag) => {
              const current = performance.find((p) => p.agentId === ag.id);
              const bonus = APT_PERFORMANCE_BONUS[perfDraft[ag.id] ?? "deficient"] ?? 0;
              return (
                <div key={ag.id} className="card">
                  <h3 style={{ marginBottom: "1rem" }}>{ag.name}</h3>
                  <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", flexWrap: "wrap" }}>
                    <div className="form-group" style={{ flex: 1, minWidth: 250, marginBottom: 0 }}>
                      <label>Nivel de Performance</label>
                      <select
                        className="form-control"
                        value={perfDraft[ag.id] ?? "deficient"}
                        onChange={(e) => setPerfDraft((prev) => ({ ...prev, [ag.id]: e.target.value }))}
                      >
                        {Object.entries(APT_PERFORMANCE_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ padding: "0.5rem 1rem", background: "#e0f2fe", borderRadius: "6px", fontWeight: 600, color: "#0891b2", whiteSpace: "nowrap" }}>
                      Bonus: ${bonus.toFixed(2)}
                    </div>
                    <button
                      className="btn btn-primary"
                      style={{ background: perfSaved[ag.id] ? "#16a34a" : undefined, whiteSpace: "nowrap" }}
                      onClick={() => savePerformance(ag.id)}
                    >
                      {perfSaved[ag.id] ? "Saved! ✓" : "Save"}
                    </button>
                  </div>
                  {current && <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "var(--text-muted)" }}>Last saved: {APT_PERFORMANCE_LABELS[current.level]}</p>}
                </div>
              );
            })}
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
    </div>
  );
}
