import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Agent, OpsAppeal, OpsHandlingTime, OpsTikTokScore, OpsAmazonPerformance } from "../types";
import {
  getAgents, updateAgentName, createAgent, verifySuperAdmin,
  getOpsAppeals, addOpsAppeal, updateOpsAppeal, deleteOpsAppeal, invalidateOpsAppeal, revalidateOpsAppeal,
  getOpsHandlingTime, upsertOpsHandlingTime,
  getOpsTikTokScores, addOpsTikTokScore, deleteOpsTikTokScore,
  getOpsAmazonPerformance, upsertOpsAmazonPerformance,
} from "../services/api";
import {
  getCyclesForYear, getCurrentCycleDefault, getCycleFromDate, getCycleDatesFromId, calcTikTokBonus,
} from "../services/usaCycles";
import {
  OPS_APPEALS_BONUS, OPS_APPEALS_CAP, OPS_TOTAL_CAP, calcHandlingTimeBonus,
  FULLTIME_EFFECTIVE_CYCLE_START, FULLTIME_APPEALS_CAP, FULLTIME_HANDLING_CAP, FULLTIME_TIKTOK_CAP,
  FULLTIME_AMAZON_PERF_CAP, FULLTIME_TOTAL_CAP, AMAZON_PERFORMANCE_BONUS, calcHandlingTimeBonusFullTime,
} from "../services/opsBonus";
import { useHubAccess } from "../auth/HubAccessContext";

const YEARS = ["2025", "2026", "2027", "2028"];
const ADMIN_PASSWORD = "ops2026!";

// Thomas transitioned to full-time; Linda left the team. Both changes are date-gated
// so historical records/cycles before the cutoffs stay untouched.
const THOMAS_AGENT_ID = 5;
const LINDA_AGENT_ID = 17;
const LINDA_LAST_CYCLE_START = "2026-09-12";
const THOMAS_BLUE_DOT_RANGE: [string, string] = ["2026-08-24", "2026-09-11"];
const THOMAS_YELLOW_DOT_RANGE: [string, string] = ["2026-09-12", "2026-09-23"];

// One-off BONUS-only receipt breakdown for Thomas's Aug 24 – Sep 23, 2026 transition cycle —
// base salary is HR's calculation, not shown here. Appeals bonus figures are Natalie's own
// final numbers for each sub-period (not the raw appeals-table sum, which came out slightly
// different). Not a general formula — specific to this one cycle, requested directly by Natalie.
const THOMAS_RECEIPT_YEAR = "2026";
const THOMAS_RECEIPT_CYCLE_ID = "8";
const THOMAS_RECEIPT_FIRST_CORTE_APPEALS = 162;
const THOMAS_RECEIPT_SECOND_CORTE_APPEALS = 117;
const THOMAS_RECEIPT_AMAZON_PERF = 8.67; // prorated one-off, full-time Amazon Performance not yet active this cycle

const OUTCOME_LABELS: Record<string, string> = {
  fullRefund: "Full Refund",
  partialRefund: "Partial Refund",
  fee: "Fee Only",
  lost: "Lost",
};

const APPEAL_TYPES: { value: string; label: string }[] = [
  { value: "tiktok", label: "TikTok Appeals" },
  { value: "a2z", label: "A to Z's" },
  { value: "safety", label: "Safety Claim" },
];

const TABS: [string, string][] = [
  ["summary", "Summary"],
  ["appeals", "Appeals"],
  ["handling", "Handling Time"],
  ["performance", "Performance"],
  ["tiktok", "TikTok Score"],
  ["settings", "Settings"],
];

export default function OperationsDashboard() {
  const navigate = useNavigate();
  const { access } = useHubAccess();
  const isAdmin = !!access?.isAdmin;
  const [activeTab, setActiveTab] = useState("summary");
  const defaultCycle = getCurrentCycleDefault();
  const [year, setYear] = useState(defaultCycle.year);
  const [cycleId, setCycleId] = useState(defaultCycle.cycleId);
  const [cycles, setCycles] = useState(() => getCyclesForYear(Number(defaultCycle.year)));

  const [agents, setAgents] = useState<Agent[]>([]);
  const [appeals, setAppeals] = useState<OpsAppeal[]>([]);
  const [handlingTimes, setHandlingTimes] = useState<OpsHandlingTime[]>([]);
  const [tiktokScores, setTiktokScores] = useState<OpsTikTokScore[]>([]);
  const [amazonPerformance, setAmazonPerformance] = useState<OpsAmazonPerformance[]>([]);

  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [editingAppeal, setEditingAppeal] = useState<OpsAppeal | null>(null);
  const [invalidatingAppeal, setInvalidatingAppeal] = useState<OpsAppeal | null>(null);
  const [invalidateNote, setInvalidateNote] = useState("");
  const [invalidateError, setInvalidateError] = useState("");

  const load = useCallback(async () => {
    const [ag, ap, ht, tk, apf] = await Promise.all([
      getAgents("OPS"),
      getOpsAppeals(Number(year), cycleId),
      getOpsHandlingTime(Number(year), cycleId),
      getOpsTikTokScores(Number(year), cycleId),
      getOpsAmazonPerformance(Number(year), cycleId),
    ]);
    setAgents(ag);
    setAppeals(ap);
    setHandlingTimes(ht);
    setTiktokScores(tk);
    setAmazonPerformance(apf);
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

  const cycleFrom = getCycleDatesFromId(year, cycleId).from;
  const isFullTimeCycle = cycleFrom >= FULLTIME_EFFECTIVE_CYCLE_START;
  // Linda left Sep 12, 2026 — hide her from any cycle starting on/after that date.
  // Her historical records and past cycles remain fully visible/unaffected.
  const visibleAgents = agents.filter((ag) => ag.id !== LINDA_AGENT_ID || cycleFrom < LINDA_LAST_CYCLE_START);

  const agentTotals = agents.map((ag) => {
    const agAppeals = appeals.filter((a) => a.agentId === ag.id && a.status === "completed" && !a.invalidated);
    const appealRaw = agAppeals.reduce((s, a) => s + (OPS_APPEALS_BONUS[a.outcome] ?? 0), 0);
    const ht = handlingTimes.find((h) => h.agentId === ag.id);
    const isThomasFullTime = ag.id === THOMAS_AGENT_ID && isFullTimeCycle;

    if (isThomasFullTime) {
      const appealCapped = Math.min(appealRaw, FULLTIME_APPEALS_CAP);
      const handling = ht ? calcHandlingTimeBonusFullTime(ht.hours) : 0;
      const tiktok = Math.min(tiktokBonus, FULLTIME_TIKTOK_CAP);
      const perf = amazonPerformance.find((p) => p.agentId === ag.id);
      const amazonPerf = perf ? Math.min(AMAZON_PERFORMANCE_BONUS[perf.rating] ?? 0, FULLTIME_AMAZON_PERF_CAP) : 0;
      const raw = appealCapped + handling + tiktok + amazonPerf;
      const total = Math.min(raw, FULLTIME_TOTAL_CAP);
      return { agent: ag, appealRaw, appealCapped, handling, tiktok, amazonPerf, raw, total, isFullTime: true };
    }

    const appealCapped = Math.min(appealRaw, OPS_APPEALS_CAP);
    const handling = ht ? calcHandlingTimeBonus(ht.hours) : 0;
    const raw = appealCapped + handling + tiktokBonus;
    const total = Math.min(raw, OPS_TOTAL_CAP);
    return { agent: ag, appealRaw, appealCapped, handling, tiktok: tiktokBonus, amazonPerf: 0, raw, total, isFullTime: false };
  });

  // ── Appeal filter
  const [filterAgentId, setFilterAgentId] = useState(0);

  // ── Appeal form
  const [appealForm, setAppealForm] = useState({
    agentId: 0, date: "", orderNumber: "", appealType: "tiktok", status: "pending", outcome: "fullRefund",
  });

  const submitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    const { year: ay, cycleId: ac } = getCycleFromDate(appealForm.date);
    await addOpsAppeal({
      agentId: Number(appealForm.agentId), date: appealForm.date,
      orderNumber: appealForm.orderNumber,
      appealType: appealForm.appealType as any,
      status: appealForm.status as any, outcome: appealForm.outcome as any,
      year: ay, cycleId: ac,
      invalidated: false, invalidationNote: null,
    });
    await load();
    setAppealForm({ agentId: 0, date: "", orderNumber: "", appealType: "tiktok", status: "pending", outcome: "fullRefund" });
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

  // ── Amazon Performance form per agent (full-time bonus structure only)
  const [amazonForms, setAmazonForms] = useState<Record<number, string>>({});
  const [amazonSaved, setAmazonSaved] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const forms: Record<number, string> = {};
    amazonPerformance.forEach((p) => { forms[p.agentId] = p.rating; });
    setAmazonForms(forms);
  }, [amazonPerformance]);

  const saveAmazonPerformance = async (agentId: number) => {
    const rating = amazonForms[agentId];
    if (!rating) return;
    await upsertOpsAmazonPerformance({ agentId, year: Number(year), cycleId, rating: rating as any });
    await load();
    setAmazonSaved((prev) => ({ ...prev, [agentId]: true }));
    setTimeout(() => setAmazonSaved((prev) => ({ ...prev, [agentId]: false })), 2000);
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

  // ── Add Agent (super-admin only)
  const [addAgentPw, setAddAgentPw] = useState("");
  const [addAgentPwError, setAddAgentPwError] = useState("");
  const [addAgentVerified, setAddAgentVerified] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [addAgentSaving, setAddAgentSaving] = useState(false);

  const checkSuperAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifySuperAdmin("OPS", addAgentPw)) {
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
      await createAgent(newAgentName.trim(), "OPS");
      await load();
      setNewAgentName("");
      setAddAgentVerified(false);
      setAddAgentPw("");
    } finally {
      setAddAgentSaving(false);
    }
  };

  const thomasPeriodDot = (agentId: number, date: string): { color: string; label: string } | null => {
    if (agentId !== THOMAS_AGENT_ID) return null;
    if (date >= THOMAS_BLUE_DOT_RANGE[0] && date <= THOMAS_BLUE_DOT_RANGE[1]) return { color: "#3b82f6", label: "36-hour work period" };
    if (date >= THOMAS_YELLOW_DOT_RANGE[0] && date <= THOMAS_YELLOW_DOT_RANGE[1]) return { color: "#eab308", label: "New full-time bonus period" };
    return null;
  };

  return (
    <div>
      <nav className="top-nav">
        <div className="logo">FTC Hub — <span style={{ color: "#7c3aed" }}>Operations 🇺🇸</span></div>
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
                  {t.raw > (t.isFullTime ? FULLTIME_TOTAL_CAP : OPS_TOTAL_CAP) && (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Raw: ${t.raw.toFixed(2)} (capped at ${t.isFullTime ? FULLTIME_TOTAL_CAP : OPS_TOTAL_CAP})</div>
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
                    <td>Appeals</td>
                    {agentTotals.map((t) => (
                      <td key={t.agent.id}>
                        ${t.appealCapped.toFixed(2)} <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>(cap ${t.isFullTime ? FULLTIME_APPEALS_CAP : OPS_APPEALS_CAP})</span>
                        {t.appealRaw > (t.isFullTime ? FULLTIME_APPEALS_CAP : OPS_APPEALS_CAP) && <div style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>raw ${t.appealRaw.toFixed(2)}</div>}
                      </td>
                    ))}
                  </tr>
                  <tr><td>Handling Time</td>{agentTotals.map((t) => <td key={t.agent.id}>${t.handling.toFixed(2)}</td>)}</tr>
                  <tr><td>Amazon Performance</td>{agentTotals.map((t) => <td key={t.agent.id}>{t.isFullTime ? `$${t.amazonPerf.toFixed(2)}` : "—"}</td>)}</tr>
                  <tr><td>TikTok Score (shared)</td>{agentTotals.map((t) => <td key={t.agent.id}>${t.tiktok.toFixed(2)}</td>)}</tr>
                  <tr style={{ fontWeight: 600 }}>
                    <td>Total</td>
                    {agentTotals.map((t) => <td key={t.agent.id}>${t.total.toFixed(2)} <span style={{ fontSize: "0.72rem", fontWeight: 400, color: "var(--text-muted)" }}>(cap ${t.isFullTime ? FULLTIME_TOTAL_CAP : OPS_TOTAL_CAP})</span></td>)}
                  </tr>
                </tbody>
              </table>
            </div>

            {year === THOMAS_RECEIPT_YEAR && cycleId === THOMAS_RECEIPT_CYCLE_ID && (() => {
              const thomas = agentTotals.find((t) => t.agent.id === THOMAS_AGENT_ID);
              if (!thomas) return null;
              const receiptTotal = THOMAS_RECEIPT_FIRST_CORTE_APPEALS + THOMAS_RECEIPT_SECOND_CORTE_APPEALS + THOMAS_RECEIPT_AMAZON_PERF + thomas.handling + thomas.tiktok;
              return (
                <div className="card">
                  <h3>Desglose de bono — Thomas (transición Ago 24 – Sep 23, 2026)</h3>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>Solo bono — la base salarial la calcula Recursos Humanos.</p>
                  <table className="data-table">
                    <tbody>
                      <tr><td>Bono Appeals — primer corte (Ago 24 – Sep 11)</td><td>${THOMAS_RECEIPT_FIRST_CORTE_APPEALS.toFixed(2)}</td></tr>
                      <tr><td>Bono Appeals — segundo corte (Sep 12 – Sep 23)</td><td>${THOMAS_RECEIPT_SECOND_CORTE_APPEALS.toFixed(2)}</td></tr>
                      <tr><td>Amazon Performance</td><td>${THOMAS_RECEIPT_AMAZON_PERF.toFixed(2)}</td></tr>
                      <tr><td>Handling Time</td><td>${thomas.handling.toFixed(2)}</td></tr>
                      <tr><td>TikTok Score</td><td>${thomas.tiktok.toFixed(2)}</td></tr>
                      <tr style={{ fontWeight: 700 }}><td>Total</td><td>${receiptTotal.toFixed(2)}</td></tr>
                    </tbody>
                  </table>
                </div>
              );
            })()}
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
                    {visibleAgents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
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
                  <label>Type</label>
                  <select className="form-control" value={appealForm.appealType} onChange={(e) => setAppealForm({ ...appealForm, appealType: e.target.value })}>
                    {APPEAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h3>Appeals for Selected Cycle</h3>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {(() => {
                    const blueAppeals = appeals.filter((a) => a.agentId === THOMAS_AGENT_ID && a.status === "completed" && !a.invalidated && a.date >= THOMAS_BLUE_DOT_RANGE[0] && a.date <= THOMAS_BLUE_DOT_RANGE[1]);
                    if (blueAppeals.length === 0) return null;
                    const sum = blueAppeals.reduce((s, a) => s + (OPS_APPEALS_BONUS[a.outcome] ?? 0), 0);
                    return (
                      <div className="badge" style={{ fontSize: "0.9rem", padding: "0.5rem 1rem", background: "#dbeafe", color: "#1e40af", border: "none", display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#3b82f6" }} />
                        36-hour period ({THOMAS_BLUE_DOT_RANGE[0]} – {THOMAS_BLUE_DOT_RANGE[1]}): ${sum.toFixed(2)}
                      </div>
                    );
                  })()}
                  {(() => {
                    const yellowAppeals = appeals.filter((a) => a.agentId === THOMAS_AGENT_ID && a.status === "completed" && !a.invalidated && a.date >= THOMAS_YELLOW_DOT_RANGE[0] && a.date <= THOMAS_YELLOW_DOT_RANGE[1]);
                    if (yellowAppeals.length === 0) return null;
                    const sum = yellowAppeals.reduce((s, a) => s + (OPS_APPEALS_BONUS[a.outcome] ?? 0), 0);
                    return (
                      <div className="badge" style={{ fontSize: "0.9rem", padding: "0.5rem 1rem", background: "#fef9c3", color: "#854d0e", border: "none", display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#eab308" }} />
                        Full-time period ({THOMAS_YELLOW_DOT_RANGE[0]} – {THOMAS_YELLOW_DOT_RANGE[1]}): ${sum.toFixed(2)}
                      </div>
                    );
                  })()}
                  <div className="badge badge-success" style={{ fontSize: "1rem", padding: "0.5rem 1rem" }}>
                    {(() => {
                      const raw = appeals
                        .filter((a) => (filterAgentId === 0 || a.agentId === filterAgentId) && a.status === "completed" && !a.invalidated)
                        .reduce((s, a) => s + (OPS_APPEALS_BONUS[a.outcome] ?? 0), 0);
                      const cap = filterAgentId === THOMAS_AGENT_ID && isFullTimeCycle ? FULLTIME_APPEALS_CAP : OPS_APPEALS_CAP;
                      return <>Total Bonus: ${Math.min(raw, cap).toFixed(2)} (cap ${cap})</>;
                    })()}
                  </div>
                </div>
              </div>
              {/* Agent filter pills */}
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                <button
                  onClick={() => setFilterAgentId(0)}
                  style={{ padding: "0.3rem 0.85rem", borderRadius: 9999, fontSize: "0.8rem", fontWeight: filterAgentId === 0 ? 700 : 500, cursor: "pointer", border: `2px solid ${filterAgentId === 0 ? "#7c3aed" : "#e2e8f0"}`, background: filterAgentId === 0 ? "#7c3aed15" : "white", color: filterAgentId === 0 ? "#7c3aed" : "#64748b" }}
                >
                  Todos
                </button>
                {visibleAgents.map((ag) => (
                  <button
                    key={ag.id}
                    onClick={() => setFilterAgentId(filterAgentId === ag.id ? 0 : ag.id)}
                    style={{ padding: "0.3rem 0.85rem", borderRadius: 9999, fontSize: "0.8rem", fontWeight: filterAgentId === ag.id ? 700 : 500, cursor: "pointer", border: `2px solid ${filterAgentId === ag.id ? "#7c3aed" : "#e2e8f0"}`, background: filterAgentId === ag.id ? "#7c3aed15" : "white", color: filterAgentId === ag.id ? "#7c3aed" : "#64748b" }}
                  >
                    {ag.name}
                  </button>
                ))}
              </div>
              <table className="data-table">
                <thead><tr><th>Agent</th><th>Date</th><th>Order No.</th><th>Type</th><th>Status</th><th>Outcome</th><th>Bonus</th><th>Actions</th></tr></thead>
                <tbody>
                  {[...appeals]
                    .filter((a) => filterAgentId === 0 || a.agentId === filterAgentId)
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((a) => (
                      <tr key={a.id} style={a.invalidated ? { opacity: 0.6 } : undefined}>
                        <td>{agents.find((ag) => ag.id === a.agentId)?.name ?? "—"}</td>
                        <td>
                          {a.date}
                          {(() => {
                            const dot = thomasPeriodDot(a.agentId, a.date);
                            return dot ? (
                              <span title={dot.label} style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: dot.color, marginLeft: 6, verticalAlign: "middle" }} />
                            ) : null;
                          })()}
                        </td>
                        <td>{a.orderNumber}</td>
                        <td>{APPEAL_TYPES.find((t) => t.value === a.appealType)?.label ?? "TikTok Appeals"}</td>
                        <td>
                          {a.invalidated ? (
                            <span className="badge badge-danger" title={a.invalidationNote ?? ""} style={{ background: "#fee2e2", color: "#991b1b", border: "none" }}>Invalidated</span>
                          ) : (
                            <span className={`badge ${a.status === "completed" ? "badge-success" : a.status === "pending" ? "badge-warning" : "badge-warning"}`} style={a.status === "pending" ? { background: "#fed7aa", color: "#9a3412", border: "none" } : {}}>{a.status === "completed" ? "Completed" : a.status === "pending" ? "Pending" : "In Progress"}</span>
                          )}
                          {a.invalidated && a.invalidationNote && (
                            <div style={{ fontSize: "0.72rem", color: "#991b1b", marginTop: "0.25rem", maxWidth: 220 }}>{a.invalidationNote}</div>
                          )}
                        </td>
                        <td style={a.invalidated ? { textDecoration: "line-through" } : undefined}>{a.status === "completed" ? OUTCOME_LABELS[a.outcome] : "—"}</td>
                        <td style={a.invalidated ? { textDecoration: "line-through" } : undefined}>${a.status === "completed" && !a.invalidated ? (OPS_APPEALS_BONUS[a.outcome] ?? 0).toFixed(2) : "0.00"}</td>
                        <td>
                          <button className="btn btn-sm btn-secondary" onClick={() => requireAdmin(() => setEditingAppeal(a))}>Edit</button>{" "}
                          <button className="btn btn-sm btn-danger" onClick={() => requireAdmin(async () => { await deleteOpsAppeal(a.id); await load(); })}>Delete</button>{" "}
                          {a.invalidated ? (
                            <button className="btn btn-sm btn-secondary" disabled={!isAdmin} title={isAdmin ? undefined : "Solo el administrador puede revalidar"} onClick={async () => { await revalidateOpsAppeal(a.id); await load(); }}>Revalidar</button>
                          ) : (
                            <button className="btn btn-sm btn-danger" disabled={!isAdmin} title={isAdmin ? undefined : "Solo el administrador puede invalidar"} onClick={() => { setInvalidatingAppeal(a); setInvalidateNote(""); setInvalidateError(""); }}>Invalidar</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  {appeals.filter((a) => filterAgentId === 0 || a.agentId === filterAgentId).length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)" }}>No appeals for this cycle</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* HANDLING TIME */}
        {activeTab === "handling" && (
          <section>
            <header className="section-header"><h2>Handling Time</h2></header>
            {visibleAgents.map((ag) => {
              const ht = handlingTimes.find((h) => h.agentId === ag.id);
              const val = handlingForms[ag.id] ?? "";
              const isThomasFullTime = ag.id === THOMAS_AGENT_ID && isFullTimeCycle;
              const calcFn = isThomasFullTime ? calcHandlingTimeBonusFullTime : calcHandlingTimeBonus;
              const rows = isThomasFullTime
                ? [["≤ 30 h", "$40"], ["30 – 32 h", "$32"], ["32 – 34 h", "$24"], ["34 – 36 h", "$16"], ["36 – 38.5 h", "$8"], ["> 38.5 h", "$0"]]
                : [["≤ 30 h", "$50"], ["30 – 32 h", "$40"], ["32 – 34 h", "$30"], ["34 – 36 h", "$20"], ["36 – 38.5 h", "$10"], ["> 38.5 h", "$0"]];
              const preview = val !== "" && !isNaN(Number(val)) ? calcFn(Number(val)) : null;
              return (
                <div key={ag.id} className="card">
                  <h3 style={{ marginBottom: "1rem" }}>
                    {ag.name}
                    {isThomasFullTime && <span className="badge" style={{ marginLeft: 8, fontSize: "0.7rem", background: "#fef9c3", color: "#854d0e", border: "none" }}>Full-time (cap ${FULLTIME_HANDLING_CAP})</span>}
                  </h3>
                  <table className="data-table" style={{ marginBottom: "1rem", maxWidth: 320 }}>
                    <thead><tr><th>Handling Time</th><th>Bonus</th></tr></thead>
                    <tbody>{rows.map(([r, b]) => <tr key={r}><td>{r}</td><td>{b}</td></tr>)}</tbody>
                  </table>
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
                  {ht && <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "var(--text-muted)" }}>Last saved: {ht.hours}h → ${calcFn(ht.hours).toFixed(2)}</p>}
                </div>
              );
            })}
          </section>
        )}

        {/* PERFORMANCE */}
        {activeTab === "performance" && (
          <section>
            <header className="section-header"><h2>Amazon Performance</h2></header>
            {!isFullTimeCycle ? (
              <div className="card" style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                <p style={{ fontSize: "1rem" }}>Amazon Performance bonus applies starting the full-time cycle beginning {FULLTIME_EFFECTIVE_CYCLE_START} onward.</p>
              </div>
            ) : (
              <>
                <div className="card" style={{ background: "#f9fafb", marginBottom: "1rem" }}>
                  <h3 style={{ marginBottom: "0.75rem" }}>Bonus Table</h3>
                  <table className="data-table">
                    <thead><tr><th>Rating</th><th>Bonus</th></tr></thead>
                    <tbody>
                      <tr><td>Good</td><td>${AMAZON_PERFORMANCE_BONUS.good.toFixed(2)}</td></tr>
                      <tr><td>Regular</td><td>${AMAZON_PERFORMANCE_BONUS.regular.toFixed(2)}</td></tr>
                      <tr><td>Poor</td><td>${AMAZON_PERFORMANCE_BONUS.poor.toFixed(2)}</td></tr>
                    </tbody>
                  </table>
                </div>
                {visibleAgents.filter((ag) => ag.id === THOMAS_AGENT_ID).map((ag) => {
                  const current = amazonPerformance.find((p) => p.agentId === ag.id);
                  const val = amazonForms[ag.id] ?? "";
                  return (
                    <div key={ag.id} className="card">
                      <h3 style={{ marginBottom: "1rem" }}>{ag.name}</h3>
                      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", flexWrap: "wrap" }}>
                        <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                          <label>Rating</label>
                          <select className="form-control" value={val} onChange={(e) => setAmazonForms((p) => ({ ...p, [ag.id]: e.target.value }))}>
                            <option value="" disabled>Select rating</option>
                            <option value="good">Good (${AMAZON_PERFORMANCE_BONUS.good.toFixed(2)})</option>
                            <option value="regular">Regular (${AMAZON_PERFORMANCE_BONUS.regular.toFixed(2)})</option>
                            <option value="poor">Poor (${AMAZON_PERFORMANCE_BONUS.poor.toFixed(2)})</option>
                          </select>
                        </div>
                        <button className="btn btn-primary" style={{ background: amazonSaved[ag.id] ? "#16a34a" : undefined, whiteSpace: "nowrap" }} onClick={() => saveAmazonPerformance(ag.id)}>
                          {amazonSaved[ag.id] ? "Saved! ✓" : "Save"}
                        </button>
                      </div>
                      {current && <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "var(--text-muted)" }}>Last saved: {current.rating} → ${(AMAZON_PERFORMANCE_BONUS[current.rating] ?? 0).toFixed(2)}</p>}
                    </div>
                  );
                })}
              </>
            )}
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
              <h3 style={{ marginBottom: "1rem" }}>Agent Names</h3>
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
              <h3 style={{ marginBottom: "0.25rem" }}>Add Agent</h3>
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
                    <label style={{ fontSize: "0.85rem", fontWeight: 500 }}>Nombre del agente</label>
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
                <label>Type</label>
                <select className="form-control" value={editingAppeal.appealType ?? "tiktok"} onChange={(e) => setEditingAppeal({ ...editingAppeal, appealType: e.target.value as any })}>
                  {APPEAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
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

      {/* Invalidate Appeal Modal — admin-only, requires a note */}
      {invalidatingAppeal && (
        <div className="modal-overlay active">
          <div className="modal">
            <div className="modal-header"><h3>Invalidar Appeal</h3></div>
            <p style={{ marginBottom: "1rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
              Orden {invalidatingAppeal.orderNumber} — deja una nota explicando por qué se invalida. Ya no contará para el bono.
            </p>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!invalidateNote.trim()) { setInvalidateError("La nota es obligatoria."); return; }
              try {
                await invalidateOpsAppeal(invalidatingAppeal.id, invalidateNote.trim());
                setInvalidatingAppeal(null);
                await load();
              } catch (err: any) {
                setInvalidateError(err?.message ?? "No se pudo invalidar.");
              }
            }}>
              <div className="form-group">
                <label>Nota</label>
                <textarea className="form-control" rows={3} value={invalidateNote} onChange={(e) => setInvalidateNote(e.target.value)} placeholder="Motivo de la invalidación..." autoFocus required />
              </div>
              {invalidateError && <p className="error-msg">{invalidateError}</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setInvalidatingAppeal(null)}>Cancel</button>
                <button type="submit" className="btn btn-danger">Invalidar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
