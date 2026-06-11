import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Agent, AptClaim, AptPerformance } from "../types";
import {
  getAgents, updateAgentName,
  getAptClaims, addAptClaim, updateAptClaim, deleteAptClaim,
  getAptPerformance, upsertAptPerformance,
} from "../services/api";
import { getCyclesForYear, getCurrentCycleDefault, getCycleFromDate } from "../services/usaCycles";
import {
  APT_PERFORMANCE_BONUS, APT_PERFORMANCE_LABELS,
  CLAIM_TYPE_LABELS, CLAIM_SUB_TYPES, calcAptClaimBonus,
} from "../services/aptBonus";

const YEARS = ["2025", "2026", "2027", "2028"];
const ADMIN_PASSWORD = "apt2026!";

const TABS: [string, string][] = [
  ["summary", "Summary"],
  ["claims", "Claims"],
  ["performance", "Performance"],
  ["settings", "Settings"],
];

const DEFAULT_SUB: Record<string, string> = {
  a2z: "fullRecovery",
  safety: "fullRecovery",
  feedback: "Amazon",
  account_health: "penalty",
  tiktok_health: "non_buyer_fault",
};

export default function AccountProtectionDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("summary");
  const defaultCycle = getCurrentCycleDefault();
  const [year, setYear] = useState(defaultCycle.year);
  const [cycleId, setCycleId] = useState(defaultCycle.cycleId);
  const [cycles, setCycles] = useState(() => getCyclesForYear(Number(defaultCycle.year)));

  const [agents, setAgents] = useState<Agent[]>([]);
  const [claims, setClaims] = useState<AptClaim[]>([]);
  const [performance, setPerformance] = useState<AptPerformance[]>([]);

  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [editingClaim, setEditingClaim] = useState<AptClaim | null>(null);

  const load = useCallback(async () => {
    const [ag, cl, perf] = await Promise.all([
      getAgents("APT"),
      getAptClaims(Number(year), cycleId),
      getAptPerformance(Number(year), cycleId),
    ]);
    setAgents(ag);
    setClaims(cl);
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

  // ── Per-agent totals (no cap) — pending claims count $0
  const agentTotals = agents.map((ag) => {
    const claimsBonus = claims
      .filter((c) => c.agentId === ag.id && c.status !== "pending")
      .reduce((s, c) => s + calcAptClaimBonus(c.claimType, c.subType), 0);
    const perf = APT_PERFORMANCE_BONUS[performance.find((p) => p.agentId === ag.id)?.level ?? "deficient"] ?? 0;
    const total = claimsBonus + perf;
    return { agent: ag, claims: claimsBonus, perf, total };
  });

  // ── Claims form
  const [claimForm, setClaimForm] = useState({
    agentId: 0, date: "", referenceNumber: "",
    claimType: "a2z" as AptClaim["claimType"],
    subType: "",
    status: "pending" as AptClaim["status"],
  });

  const subTypeOptions = CLAIM_SUB_TYPES[claimForm.claimType] ?? [];
  const bonusPreview = calcAptClaimBonus(claimForm.claimType, claimForm.subType);

  const handleClaimTypeChange = (type: string) => {
    setClaimForm((prev) => ({
      ...prev,
      claimType: type as AptClaim["claimType"],
      subType: DEFAULT_SUB[type] ?? "",
    }));
  };

  const submitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    const { year: y, cycleId: c } = getCycleFromDate(claimForm.date);
    await addAptClaim({
      agentId: Number(claimForm.agentId),
      date: claimForm.date,
      referenceNumber: claimForm.referenceNumber,
      claimType: claimForm.claimType,
      subType: claimForm.subType,
      status: claimForm.status,
      year: y,
      cycleId: c,
    });
    await load();
    setClaimForm({ agentId: 0, date: "", referenceNumber: "", claimType: "a2z", subType: "", status: "pending" });
  };

  const submitEditClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClaim) return;
    await updateAptClaim(editingClaim.id, editingClaim);
    setEditingClaim(null);
    await load();
  };

  // ── Filter
  const [filterType, setFilterType] = useState("all");
  const [filterAgent, setFilterAgent] = useState("all");

  const filteredClaims = claims.filter((c) => {
    const typeMatch = filterType === "all" || c.claimType === filterType;
    const agentMatch = filterAgent === "all" || c.agentId === Number(filterAgent);
    return typeMatch && agentMatch;
  });

  const filteredTotal = filteredClaims.filter((c) => c.status !== "pending").reduce((s, c) => s + calcAptClaimBonus(c.claimType, c.subType), 0);

  // ── Performance
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
    await upsertAptPerformance({ agentId, year: Number(year), cycleId, level: perfDraft[agentId] as any ?? "deficient" });
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

  const subTypeLabel = (c: AptClaim) => {
    if (!c.subType) return "—";
    return CLAIM_SUB_TYPES[c.claimType]?.find((o) => o.value === c.subType)?.label.split(" (")[0] ?? c.subType;
  };

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
                </div>
              ))}
            </div>
            <div className="card">
              <h3>Category Breakdown</h3>
              <table className="data-table">
                <thead><tr><th>Category</th>{agents.map((a) => <th key={a.id}>{a.name}</th>)}</tr></thead>
                <tbody>
                  <tr><td>Claims & Appeals</td>{agentTotals.map((t) => <td key={t.agent.id}>${t.claims.toFixed(2)}</td>)}</tr>
                  <tr><td>Performance</td>{agentTotals.map((t) => <td key={t.agent.id}>${t.perf.toFixed(2)}</td>)}</tr>
                  <tr style={{ fontWeight: 600 }}>
                    <td>Total</td>
                    {agentTotals.map((t) => <td key={t.agent.id}>${t.total.toFixed(2)}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* CLAIMS */}
        {activeTab === "claims" && (
          <section>
            <header className="section-header"><h2>Claims & Appeals</h2></header>

            {/* Add form */}
            <div className="card">
              <h3 style={{ marginBottom: "1rem" }}>Add New Entry</h3>
              <form onSubmit={submitClaim}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Agent</label>
                    <select className="form-control" value={claimForm.agentId} onChange={(e) => setClaimForm({ ...claimForm, agentId: Number(e.target.value) })} required>
                      <option value={0} disabled>Select agent</option>
                      {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Date</label>
                    <input type="date" className="form-control" value={claimForm.date} onChange={(e) => setClaimForm({ ...claimForm, date: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Reference # (order / claim / appeal)</label>
                    <input type="text" className="form-control" placeholder="ej. 114-1234567-8901234" value={claimForm.referenceNumber} onChange={(e) => setClaimForm({ ...claimForm, referenceNumber: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Type</label>
                    <select className="form-control" value={claimForm.claimType} onChange={(e) => handleClaimTypeChange(e.target.value)}>
                      {Object.entries(CLAIM_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select className="form-control" value={claimForm.status} onChange={(e) => setClaimForm({ ...claimForm, status: e.target.value as AptClaim["status"] })}>
                      <option value="pending">Pending</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  {subTypeOptions.length > 0 && (
                    <div className="form-group">
                      <label>Outcome / Detail</label>
                      <select className="form-control" value={claimForm.subType} onChange={(e) => setClaimForm({ ...claimForm, subType: e.target.value })} disabled={claimForm.status === "pending"} style={claimForm.status === "pending" ? { opacity: 0.4, cursor: "not-allowed" } : {}}>
                        {subTypeOptions.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "0.75rem" }}>
                  <div style={{ padding: "0.5rem 1rem", background: "#e0f2fe", borderRadius: "6px", fontWeight: 600, color: claimForm.status === "pending" ? "var(--text-muted)" : "#0891b2" }}>
                    Bonus: {claimForm.status === "pending" ? "—" : `$${bonusPreview.toFixed(2)}`}
                  </div>
                  <button type="submit" className="btn btn-primary">Add Entry</button>
                </div>
              </form>
            </div>

            {/* Filter + table */}
            <div className="card" style={{ overflowX: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
                <h3>Entries for Selected Cycle</h3>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                  <select className="form-control" style={{ width: "auto" }} value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)}>
                    <option value="all">All Agents</option>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <select className="form-control" style={{ width: "auto" }} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                    <option value="all">All Types</option>
                    {Object.entries(CLAIM_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <div className="badge badge-success" style={{ fontSize: "1rem", padding: "0.5rem 1rem", whiteSpace: "nowrap" }}>
                    Total: ${filteredTotal.toFixed(2)}
                  </div>
                </div>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Date</th>
                    <th>Reference #</th>
                    <th>Type</th>
                    <th>Detail</th>
                    <th>Status</th>
                    <th>Bonus</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClaims.map((c) => (
                    <tr key={c.id}>
                      <td>{agentName(c.agentId)}</td>
                      <td>{c.date}</td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{c.referenceNumber || "—"}</td>
                      <td><span className="badge badge-warning" style={{ background: "#e0f2fe", color: "#0891b2", border: "none" }}>{CLAIM_TYPE_LABELS[c.claimType]}</span></td>
                      <td>{subTypeLabel(c)}</td>
                      <td>
                        {c.status === "pending"
                          ? <span className="badge" style={{ background: "#fed7aa", color: "#9a3412", border: "none" }}>Pending</span>
                          : <span className="badge badge-success">Completed</span>}
                      </td>
                      <td style={{ fontWeight: 600, color: c.status === "pending" ? "var(--text-muted)" : undefined }}>{c.status === "pending" ? "—" : `$${calcAptClaimBonus(c.claimType, c.subType).toFixed(2)}`}</td>
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={() => setEditingClaim(c)}>Edit</button>{" "}
                        <button className="btn btn-sm btn-danger" onClick={() => requireAdmin(async () => { await deleteAptClaim(c.id); await load(); })}>Delete</button>
                      </td>
                    </tr>
                  ))}
                  {filteredClaims.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)" }}>No entries for this cycle</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* PERFORMANCE */}
        {activeTab === "performance" && (
          <section>
            <header className="section-header"><h2>Performance Bonus — Managerial Evaluation</h2></header>
            <div className="card" style={{ background: "#f0f9ff", marginBottom: "1rem" }}>
              <h3 style={{ marginBottom: "0.75rem" }}>Evaluation Criteria</h3>
              <ul style={{ fontSize: "0.875rem", color: "var(--text-muted)", lineHeight: 1.8, paddingLeft: "1.25rem" }}>
                <li>Were all assigned cases appealed?</li>
                <li>Was proper follow-up done?</li>
                <li>Were deadlines met?</li>
                <li>Were any cases left pending?</li>
                <li>Was there initiative and proactivity?</li>
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
                      <label>Performance Level</label>
                      <select className="form-control" value={perfDraft[ag.id] ?? "deficient"} onChange={(e) => setPerfDraft((prev) => ({ ...prev, [ag.id]: e.target.value }))}>
                        {Object.entries(APT_PERFORMANCE_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ padding: "0.5rem 1rem", background: "#e0f2fe", borderRadius: "6px", fontWeight: 600, color: "#0891b2", whiteSpace: "nowrap" }}>
                      Bonus: ${bonus.toFixed(2)}
                    </div>
                    <button className="btn btn-primary" style={{ background: perfSaved[ag.id] ? "#16a34a" : undefined, whiteSpace: "nowrap" }} onClick={() => savePerformance(ag.id)}>
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

      {/* Edit Claim Modal */}
      {editingClaim && (
        <div className="modal-overlay active">
          <div className="modal">
            <div className="modal-header"><h3>Edit Entry</h3></div>
            <form onSubmit={submitEditClaim}>
              <div className="form-group">
                <label>Agent</label>
                <select className="form-control" value={editingClaim.agentId} onChange={(e) => setEditingClaim({ ...editingClaim, agentId: Number(e.target.value) })}>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" className="form-control" value={editingClaim.date} onChange={(e) => setEditingClaim({ ...editingClaim, date: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Reference #</label>
                <input type="text" className="form-control" value={editingClaim.referenceNumber} onChange={(e) => setEditingClaim({ ...editingClaim, referenceNumber: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Type</label>
                <select className="form-control" value={editingClaim.claimType} onChange={(e) => setEditingClaim({ ...editingClaim, claimType: e.target.value as AptClaim["claimType"], subType: DEFAULT_SUB[e.target.value] ?? "" })}>
                  {Object.entries(CLAIM_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Status</label>
                <select className="form-control" value={editingClaim.status} onChange={(e) => setEditingClaim({ ...editingClaim, status: e.target.value as AptClaim["status"] })}>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div className="form-group">
                <label>Outcome / Detail</label>
                <select className="form-control" value={editingClaim.subType} onChange={(e) => setEditingClaim({ ...editingClaim, subType: e.target.value })} disabled={editingClaim.status === "pending"} style={editingClaim.status === "pending" ? { opacity: 0.4, cursor: "not-allowed" } : {}}>
                  {(CLAIM_SUB_TYPES[editingClaim.claimType] ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingClaim(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

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
