import { isAgentActiveFor } from "../services/agentActivity";
import UsdCop from "../components/UsdCop";
import AmazonQuizCard from "../components/AmazonQuizCard";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { OpsApproval } from "../services/api";
import { useMsal } from "@azure/msal-react";
import type { AmazonQuiz } from "../services/opsBonus";
import type { Agent, OpsAppeal, OpsHandlingTime, OpsTikTokScore, OpsAmazonPerformance } from "../types";
import {
  getAgents, updateAgentName, createAgent,
  getOpsAppeals, addOpsAppeal, updateOpsAppeal, deleteOpsAppeal, invalidateOpsAppeal, revalidateOpsAppeal,
  getOpsHandlingTime, upsertOpsHandlingTime,
  getOpsTikTokScores, addOpsTikTokScore, deleteOpsTikTokScore,
  getOpsAmazonPerformance, upsertOpsAmazonPerformance,
  getOpsApprovalSettings, saveOpsApprovalSettings, getLastOpsApproval, getTiktokSpsDaily,
} from "../services/api";
import {
  getCyclesForYear, getCurrentCycleDefault, getCycleFromDate, getCycleDatesFromId, calcTikTokBonus,
} from "../services/usaCycles";
import {
  OPS_APPEALS_BONUS, OPS_APPEALS_CAP, OPS_TOTAL_CAP, calcHandlingTimeBonus,
  FULLTIME_EFFECTIVE_CYCLE_START, FULLTIME_APPEALS_CAP, FULLTIME_HANDLING_CAP, FULLTIME_TIKTOK_CAP,
  FULLTIME_AMAZON_PERF_CAP, FULLTIME_TOTAL_CAP, amazonPerfBonus, ratingFromPct, AMAZON_QUIZ_CRITERIA, calcHandlingTimeBonusFullTime, calcTikTokBonusFullTime, tiktokCycleValueFullTime, mergeTikTokEntries,
} from "../services/opsBonus";
import { useHubAccess } from "../auth/HubAccessContext";
import { buildOpsWorkbook, opsExportFileName } from "../services/opsExport";

const YEARS = ["2025", "2026", "2027", "2028"];
// Only company mailboxes may receive the HR breakdown (also enforced server-side).
const APPROVAL_EMAIL_DOMAIN = "formatucuerpo.com";
const MAX_APPROVAL_COPIES = 3;
const isCompanyEmail = (e: string) => e.toLowerCase().endsWith(`@${APPROVAL_EMAIL_DOMAIN}`);

// Admin actions in Operations (edit/delete/invalidate, agent changes) are only for this account —
// no shared password. Matched against the Microsoft login email.
const OPS_ADMIN_EMAILS = ["amazonassistant@formatucuerpo.com"];
// Katalina (online supervisor) may invalidate / revalidate Thomas's appeals only — nothing else of the admin actions.
const OPS_APPEAL_INVALIDATOR_EMAILS = ["supervisoronline@formatucuerpo.com"];
const INVALIDATE_ONLY_THOMAS_MSG = "Solo puedes invalidar o revalidar los appeals de Thomas.";
const ADMIN_ONLY_MSG = "Solo el administrador (amazonassistant@formatucuerpo.com) puede hacer esta acción.";

// Thomas transitioned to full-time; Linda left the team. Both changes are date-gated
// so historical records/cycles before the cutoffs stay untouched.
const THOMAS_AGENT_ID = 5;
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
  const { access, email, hasTeam } = useHubAccess();
  const canExport = hasTeam("OPS"); // the Excel is for the Operations team only
  const isAdmin = OPS_ADMIN_EMAILS.includes(email.trim().toLowerCase());
  const isHubAdmin = !!access?.isAdmin; // only for the approval-settings gear (Natalie)
  const isAppealInvalidator = OPS_APPEAL_INVALIDATOR_EMAILS.includes(email.trim().toLowerCase());
  const canInvalidateAppeal = (a: OpsAppeal) => isAdmin || (isAppealInvalidator && a.agentId === THOMAS_AGENT_ID);
  const { instance: msal, accounts } = useMsal();
  const [activeTab, setActiveTab] = useState("summary");
  const defaultCycle = (() => {
    try {
      const ctx = sessionStorage.getItem("ops_approval_idtoken") && JSON.parse(sessionStorage.getItem("ops_approval_ctx") || "null");
      if (ctx?.year && ctx?.cycleId) return { year: String(ctx.year), cycleId: String(ctx.cycleId) };
    } catch { /* ignore */ }
    return getCurrentCycleDefault();
  })();
  const [year, setYear] = useState(defaultCycle.year);
  const [cycleId, setCycleId] = useState(defaultCycle.cycleId);
  const [cycles, setCycles] = useState(() => getCyclesForYear(Number(defaultCycle.year)));

  const [loadedFor, setLoadedFor] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [appeals, setAppeals] = useState<OpsAppeal[]>([]);
  const [handlingTimes, setHandlingTimes] = useState<OpsHandlingTime[]>([]);
  const [tiktokManual, setTiktokManual] = useState<OpsTikTokScore[]>([]);
  const [spsDaily, setSpsDaily] = useState<{ day: string; score: number }[]>([]);
  const [amazonPerformance, setAmazonPerformance] = useState<OpsAmazonPerformance[]>([]);

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
    setTiktokManual(tk);
    const rng = getCycleDatesFromId(year, cycleId);
    setSpsDaily(await getTiktokSpsDaily(rng.from, rng.to).catch(() => []));
    setAmazonPerformance(apf);
    setLoadedFor(`${year}-${cycleId}`);
  }, [year, cycleId]);

  useEffect(() => { load(); }, [load]);

  const requireAdmin = (action: () => void) => {
    if (!isAdmin) { window.alert(ADMIN_ONLY_MSG); return; }
    action();
  };

  const cycleInfo = getCyclesForYear(Number(year)).find((c) => c.id === cycleId);
  const cycleDays = cycleInfo?.days ?? 15;
  const cycleRangeForTikTok = getCycleDatesFromId(year, cycleId);
  const tiktokScores = mergeTikTokEntries(tiktokManual, spsDaily, cycleRangeForTikTok.from, cycleRangeForTikTok.to, Number(year), cycleId);
  const tiktokBonus = calcTikTokBonus(tiktokScores, cycleDays);

  const cycleDates = getCycleDatesFromId(year, cycleId);
  const cycleFrom = cycleDates.from;
  const isFullTimeCycle = cycleFrom >= FULLTIME_EFFECTIVE_CYCLE_START;
  // Who counts in the cycle being viewed — no per-person exceptions, the agent list drives everything:
  //  • someone who left (active_until) is hidden from every cycle that starts after they left, and stays in the older ones;
  //  • a newly added agent shows from the current cycle on; in a finished cycle only if they actually have records there.
  const cycleIsOver = cycleDates.to < new Date().toISOString().slice(0, 10);
  const hasCycleData = (id: number) => appeals.some((a) => a.agentId === id) || handlingTimes.some((h) => h.agentId === id) || amazonPerformance.some((p) => p.agentId === id);
  const visibleAgents = agents.filter((ag) => isAgentActiveFor(ag, cycleFrom) && (!cycleIsOver || hasCycleData(ag.id) || ag.id === THOMAS_AGENT_ID));

  const tiktokBonusFullTime = calcTikTokBonusFullTime(tiktokScores, cycleDays);

  const agentTotals = visibleAgents.map((ag) => {
    const agAppeals = appeals.filter((a) => a.agentId === ag.id && a.status === "completed" && !a.invalidated);
    const appealRaw = agAppeals.reduce((s, a) => s + (OPS_APPEALS_BONUS[a.outcome] ?? 0), 0);
    const ht = handlingTimes.find((h) => h.agentId === ag.id);
    const isFullTimeAgent = isFullTimeCycle; // every agent follows the current (full-time) structure

    if (isFullTimeAgent) {
      const appealCapped = Math.min(appealRaw, FULLTIME_APPEALS_CAP);
      const handling = ht ? calcHandlingTimeBonusFullTime(ht.hours) : 0;
      const tiktok = Math.min(tiktokBonusFullTime, FULLTIME_TIKTOK_CAP);
      const perf = amazonPerformance.find((p) => p.agentId === ag.id);
      const amazonPerf = perf ? Math.min(amazonPerfBonus(perf), FULLTIME_AMAZON_PERF_CAP) : 0;
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
  const [filterType, setFilterType] = useState("");       // "" = all types
  const [filterOutcome, setFilterOutcome] = useState(""); // "" = all, "none" = not completed yet, else an outcome key
  // The agent, type and outcome filters combine; the table and its "no results" row share this list.
  const listedAppeals = appeals
    .filter((a) => filterAgentId === 0 || a.agentId === filterAgentId)
    .filter((a) => !filterType || (a.appealType ?? "tiktok") === filterType)
    .filter((a) => !filterOutcome || (filterOutcome === "none" ? a.status !== "completed" : a.status === "completed" && a.outcome === filterOutcome));

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
    visibleAgents.forEach((ag) => {
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

  // ── Amazon Performance quiz per agent (full-time bonus structure only)
  const saveAmazonQuiz = async (agentId: number, quiz: AmazonQuiz, pct: number) => {
    await upsertOpsAmazonPerformance({ agentId, year: Number(year), cycleId, rating: ratingFromPct(pct), scorePct: pct, quiz });
    await load();
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
    if (!isAdmin) { window.alert(ADMIN_ONLY_MSG); return; }
    await updateAgentName(id, agentNames[id]);
    await load();
  };

  // ── Add Agent (admin account only)
  const [newAgentName, setNewAgentName] = useState("");
  const [addAgentSaving, setAddAgentSaving] = useState(false);

  const submitNewAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim() || !isAdmin) return;
    setAddAgentSaving(true);
    try {
      await createAgent(newAgentName.trim(), "OPS");
      await load();
      setNewAgentName("");
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

  // ── Approve & send to HR (only the configured approver can succeed — verified server-side)
  const [lastApproval, setLastApproval] = useState<OpsApproval | null>(null);
  const [approving, setApproving] = useState(false);
  const [approvalMsg, setApprovalMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showApprovalSettings, setShowApprovalSettings] = useState(false);
  const [approvalForm, setApprovalForm] = useState({ approverEmail: "", hrEmail: "", copies: ["", "", ""] as string[] });
  const [approvalSettingsMsg, setApprovalSettingsMsg] = useState("");

  useEffect(() => {
    setApprovalMsg(null);
    getLastOpsApproval(Number(year), cycleId).then(setLastApproval).catch(() => setLastApproval(null));
  }, [year, cycleId]);

  const openApprovalSettings = async () => {
    setApprovalSettingsMsg("");
    try {
      const cur = await getOpsApprovalSettings();
      const copies = cur.copyEmail.split(",").map((e) => e.trim()).filter(Boolean).slice(0, MAX_APPROVAL_COPIES);
      while (copies.length < MAX_APPROVAL_COPIES) copies.push("");
      setApprovalForm({ approverEmail: cur.approverEmail, hrEmail: cur.hrEmail, copies });
    } catch { /* table not created yet */ }
    setShowApprovalSettings(true);
  };

  const saveApprovalSettings = async () => {
    const copies = approvalForm.copies.map((e) => e.trim()).filter(Boolean);
    const bad = [approvalForm.approverEmail.trim(), approvalForm.hrEmail.trim(), ...copies].filter((e) => e && !isCompanyEmail(e));
    if (bad.length) { setApprovalSettingsMsg(`Only @${APPROVAL_EMAIL_DOMAIN} emails are allowed. Not allowed: ${bad.join(", ")}`); return; }
    try {
      await saveOpsApprovalSettings({ approverEmail: approvalForm.approverEmail, hrEmail: approvalForm.hrEmail, copyEmail: copies.join(",") });
      setApprovalSettingsMsg("Saved ✓");
    } catch (e: any) {
      setApprovalSettingsMsg(`Error: ${e.message ?? e}`);
    }
  };

  // Step 1: force a fresh Microsoft sign-in (full redirect — a popup can't reliably return here).
  const approveAndSend = async () => {
    setApproving(true);
    setApprovalMsg(null);
    try {
      sessionStorage.setItem("ops_approval_ctx", JSON.stringify({ year, cycleId }));
      await msal.acquireTokenRedirect({
        scopes: ["openid", "profile"], prompt: "login", loginHint: accounts[0]?.username,
        state: "/operations?approve=1",
      });
    } catch (e: any) {
      setApproving(false);
      setApprovalMsg({ ok: false, text: e?.errorMessage || e?.message || "Could not start sign-in." });
    }
  };

  // Step 2: back from the sign-in — once this cycle's data is loaded, send the breakdown.
  const [approvalToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem("ops_approval_idtoken");
    } catch { return null; }
  });
  const [approvalSent, setApprovalSent] = useState(false);

  const sendApproval = async (idToken: string) => {
    setApproving(true);
    setApprovalMsg(null);
    try {
      const money = (n: number) => Math.round(n * 100) / 100;
      const payload = {
        idToken, year, cycleId, team: "Operations",
        periodLabel: `${cycleDates.from} to ${cycleDates.to}`,
        agents: agentTotals.map((t) => {
          const rows = [
            { label: "Appeals", amount: money(t.appealCapped), cap: t.isFullTime ? FULLTIME_APPEALS_CAP : OPS_APPEALS_CAP },
            { label: "Handling Time", amount: money(t.handling), cap: t.isFullTime ? FULLTIME_HANDLING_CAP : 0 },
            ...(t.isFullTime ? [{ label: "Amazon Performance", amount: money(t.amazonPerf), cap: FULLTIME_AMAZON_PERF_CAP }] : []),
            { label: "TikTok Score", amount: money(t.tiktok), cap: t.isFullTime ? FULLTIME_TIKTOK_CAP : 0 },
          ];
          return { name: t.agent.name, rows, total: money(t.total), totalCap: t.isFullTime ? FULLTIME_TOTAL_CAP : OPS_TOTAL_CAP };
        }),
      };
      const resp = await fetch("/.netlify/functions/send-ops-approval", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const out = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(out.error ?? `Request failed (${resp.status})`);
      setApprovalMsg({ ok: true, text: `Sent to HR (${out.sentTo}). Approved by ${out.approvedBy}.` });
      setLastApproval(await getLastOpsApproval(Number(year), cycleId));
    } catch (e: any) {
      setApprovalMsg({ ok: false, text: e?.message || "Could not send." });
    } finally {
      setApproving(false);
    }
  };

  useEffect(() => {
    if (!approvalToken || approvalSent || !loadedFor || agentTotals.length === 0) return;
    let ctx: { year: string; cycleId: string } | null = null;
    try { ctx = JSON.parse(sessionStorage.getItem("ops_approval_ctx") || "null"); } catch { /* ignore */ }
    if (ctx && (ctx.year !== year || ctx.cycleId !== cycleId)) return; // wait for the restored cycle
    setApprovalSent(true);
    sessionStorage.removeItem("ops_approval_ctx");
    sessionStorage.removeItem("ops_approval_idtoken");
    sendApproval(approvalToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvalToken, approvalSent, loadedFor, agentTotals.length, year, cycleId]);

  // ── Excel export of everything entered for the selected cycle
  const [exporting, setExporting] = useState(false);
  const downloadExcel = async () => {
    if (!canExport) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const cycleName = getCyclesForYear(Number(year)).find((c) => c.id === cycleId)?.name ?? `Cycle ${cycleId}`;
      const earnedFor = (score: number, duration: number) => {
        const earned = isFullTimeCycle ? calcTikTokBonusFullTime([{ score, duration }], cycleDays) : calcTikTokBonus([{ score, duration }], cycleDays);
        return { earned, tier: duration > 0 ? (earned * cycleDays) / duration : 0 };
      };
      const wb = buildOpsWorkbook(XLSX, {
        cycleName, year, agents, appeals, handlingTimes, tiktokScores: tiktokScores.map((t) => ({ ...t, auto: t.id < 0 })), amazonPerformance,
        totals: agentTotals.map((t) => ({
          agentName: t.agent.name, appeals: t.appealCapped, appealsCap: t.isFullTime ? FULLTIME_APPEALS_CAP : OPS_APPEALS_CAP,
          handling: t.handling, amazon: t.amazonPerf, tiktok: t.tiktok, total: t.total, totalCap: t.isFullTime ? FULLTIME_TOTAL_CAP : OPS_TOTAL_CAP,
        })),
        appealBonus: OPS_APPEALS_BONUS, outcomeLabels: OUTCOME_LABELS,
        appealTypeLabel: (t) => APPEAL_TYPES.find((x) => x.value === t)?.label ?? "TikTok Appeals",
        handlingBonus: (_agentId, hours) => (isFullTimeCycle ? calcHandlingTimeBonusFullTime(hours) : calcHandlingTimeBonus(hours)),
        amazonBonus: amazonPerfBonus,
        tiktokEarned: earnedFor,
      });
      XLSX.writeFile(wb, opsExportFileName(cycleName, year));
    } finally {
      setExporting(false);
    }
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
          {canExport && <button className="btn btn-secondary btn-sm" onClick={downloadExcel} disabled={exporting} title="Descarga todo lo registrado en el ciclo seleccionado">{exporting ? "Generando…" : "⬇ Descargar Excel"}</button>}
          {isHubAdmin && <button className="btn btn-secondary btn-sm" onClick={openApprovalSettings} title="Approval settings (admin only)">⚙ Approval settings</button>}
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
                  <div className="amount" style={{ color: "#7c3aed" }}><UsdCop v={t.total} /></div>
                  {t.raw > (t.isFullTime ? FULLTIME_TOTAL_CAP : OPS_TOTAL_CAP) && (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Raw: ${t.raw.toFixed(2)} (capped at ${t.isFullTime ? FULLTIME_TOTAL_CAP : OPS_TOTAL_CAP})</div>
                  )}
                </div>
              ))}
            </div>
            <div className="card">
              <h3>Category Breakdown</h3>
              <table className="data-table">
                <thead><tr><th>Category</th>{visibleAgents.map((a) => <th key={a.id}>{a.name}</th>)}</tr></thead>
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
                    {agentTotals.map((t) => <td key={t.agent.id}><UsdCop v={t.total} /> <span style={{ fontSize: "0.72rem", fontWeight: 400, color: "var(--text-muted)" }}>(cap ${t.isFullTime ? FULLTIME_TOTAL_CAP : OPS_TOTAL_CAP})</span></td>)}
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
                      <tr style={{ fontWeight: 700 }}><td>Total</td><td><UsdCop v={receiptTotal} /></td></tr>
                    </tbody>
                  </table>
                </div>
              );
            })()}

            <div className="card" style={{ marginTop: "1rem" }}>
              <h3>Approval</h3>
              <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", margin: "0.25rem 0 1rem" }}>
                Sends this cycle's bonus breakdown ({cycleDates.from} – {cycleDates.to}) to HR. Only the designated approver can send it, and must sign in again to confirm.
              </p>
              <button className="btn btn-primary" onClick={approveAndSend} disabled={approving || agentTotals.length === 0}>
                {approving ? "Waiting for sign-in…" : "Approve & send to HR"}
              </button>
              {approvalMsg && <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: approvalMsg.ok ? "#16a34a" : "#dc2626" }}>{approvalMsg.text}</p>}
              {lastApproval && <p style={{ marginTop: "0.75rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>Last approved by {lastApproval.approvedBy} on {new Date(lastApproval.approvedAt).toLocaleString()}.</p>}
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
                      // each agent has their own cap; with several agents the total is the sum of what each can earn
                      const capEach = isFullTimeCycle ? FULLTIME_APPEALS_CAP : OPS_APPEALS_CAP;
                      const list = filterAgentId === 0 ? visibleAgents : visibleAgents.filter((a) => a.id === filterAgentId);
                      const earned = list.reduce((sum, ag) => sum + Math.min(appeals.filter((x) => x.agentId === ag.id && x.status === "completed" && !x.invalidated).reduce((t, x) => t + (OPS_APPEALS_BONUS[x.outcome] ?? 0), 0), capEach), 0);
                      const cap = capEach * Math.max(1, list.length);
                      return <>Total Bonus: ${earned.toFixed(2)} (cap ${cap})</>;
                    })()}
                  </div>
                </div>
              </div>
              {/* Filters: agent, type and outcome as one tidy panel of pills (each with its count) */}
              {(() => {
                const PURPLE = "#7c3aed";
                const byAgent = appeals.filter((a) => filterAgentId === 0 || a.agentId === filterAgentId);
                const typeOf = (a: OpsAppeal) => a.appealType ?? "tiktok";
                const outcomeKey = (a: OpsAppeal) => (a.status === "completed" ? a.outcome : "none");
                const OUTCOME_DOT: Record<string, string> = { fullRefund: "#16a34a", partialRefund: "#f59e0b", fee: "#3b82f6", lost: "#dc2626", none: "#94a3b8" };
                const pill = (key: string, active: boolean, onClick: () => void, label: string, count: number, dot?: string) => (
                  <button key={key} onClick={onClick} style={{
                    display: "inline-flex", alignItems: "center", gap: 6, padding: "0.3rem 0.8rem", borderRadius: 9999, fontSize: "0.8rem", cursor: "pointer",
                    fontWeight: active ? 700 : 500, border: `1.5px solid ${active ? PURPLE : "#e2e8f0"}`, background: active ? `${PURPLE}14` : "#fff", color: active ? PURPLE : "#475569",
                    transition: "all 0.15s",
                  }}>
                    {dot && <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot }} />}
                    {label}
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, padding: "0 6px", borderRadius: 9999, background: active ? PURPLE : "#f1f5f9", color: active ? "#fff" : "#64748b" }}>{count}</span>
                  </button>
                );
                const row = (title: string, children: React.ReactNode) => (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                    <span style={{ width: 70, fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8" }}>{title}</span>
                    {children}
                  </div>
                );
                const filtersOn = !!filterType || !!filterOutcome || filterAgentId !== 0;
                return (
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14, padding: "0.85rem 1rem", display: "flex", flexDirection: "column", gap: "0.65rem", marginBottom: "1rem" }}>
                    {row("Agent", <>
                      {pill("a0", filterAgentId === 0, () => setFilterAgentId(0), "All", appeals.length)}
                      {visibleAgents.map((ag) => pill(`a${ag.id}`, filterAgentId === ag.id, () => setFilterAgentId(filterAgentId === ag.id ? 0 : ag.id), ag.name, appeals.filter((x) => x.agentId === ag.id).length))}
                    </>)}
                    {row("Type", <>
                      {pill("t0", !filterType, () => setFilterType(""), "All", byAgent.length)}
                      {APPEAL_TYPES.map((t) => pill(`t${t.value}`, filterType === t.value, () => setFilterType(filterType === t.value ? "" : t.value), t.label, byAgent.filter((x) => typeOf(x) === t.value).length))}
                    </>)}
                    {row("Outcome", <>
                      {pill("o0", !filterOutcome, () => setFilterOutcome(""), "All", byAgent.length)}
                      {Object.entries(OUTCOME_LABELS).map(([k, l]) => pill(`o${k}`, filterOutcome === k, () => setFilterOutcome(filterOutcome === k ? "" : k), l, byAgent.filter((x) => outcomeKey(x) === k).length, OUTCOME_DOT[k]))}
                      {pill("onone", filterOutcome === "none", () => setFilterOutcome(filterOutcome === "none" ? "" : "none"), "No outcome yet", byAgent.filter((x) => outcomeKey(x) === "none").length, OUTCOME_DOT.none)}
                    </>)}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #e2e8f0", paddingTop: "0.5rem", fontSize: "0.8rem", color: "#64748b" }}>
                      <span>Showing <strong style={{ color: "#0f172a" }}>{listedAppeals.length}</strong> of {appeals.length} appeals</span>
                      {filtersOn && <button onClick={() => { setFilterAgentId(0); setFilterType(""); setFilterOutcome(""); }} style={{ background: "none", border: "none", color: PURPLE, fontWeight: 700, cursor: "pointer", fontSize: "0.8rem" }}>✕ Clear filters</button>}
                    </div>
                  </div>
                );
              })()}
              <table className="data-table">
                <thead><tr><th>Agent</th><th>Date</th><th>Order No.</th><th>Type</th><th>Status</th><th>Outcome</th><th>Bonus</th><th>Actions</th></tr></thead>
                <tbody>
                  {[...listedAppeals]
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
                          <button className="btn btn-sm btn-secondary" disabled={!isAdmin} title={isAdmin ? undefined : ADMIN_ONLY_MSG} onClick={() => requireAdmin(() => setEditingAppeal(a))}>Edit</button>{" "}
                          <button className="btn btn-sm btn-danger" disabled={!isAdmin} title={isAdmin ? undefined : ADMIN_ONLY_MSG} onClick={() => requireAdmin(async () => { await deleteOpsAppeal(a.id); await load(); })}>Delete</button>{" "}
                          {a.invalidated ? (
                            <button className="btn btn-sm btn-secondary" disabled={!canInvalidateAppeal(a)} title={canInvalidateAppeal(a) ? undefined : (isAppealInvalidator ? INVALIDATE_ONLY_THOMAS_MSG : ADMIN_ONLY_MSG)} onClick={async () => { if (!canInvalidateAppeal(a)) return; await revalidateOpsAppeal(a.id); await load(); }}>Revalidar</button>
                          ) : (
                            <button className="btn btn-sm btn-danger" disabled={!canInvalidateAppeal(a)} title={canInvalidateAppeal(a) ? undefined : (isAppealInvalidator ? INVALIDATE_ONLY_THOMAS_MSG : ADMIN_ONLY_MSG)} onClick={() => { if (!canInvalidateAppeal(a)) return; setInvalidatingAppeal(a); setInvalidateNote(""); setInvalidateError(""); }}>Invalidar</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  {listedAppeals.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)" }}>{appeals.length === 0 ? "No appeals for this cycle" : "No appeals match these filters"}</td></tr>
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
              const isThomasFullTime = isFullTimeCycle;
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
                  <h3 style={{ marginBottom: "0.5rem" }}>Cómo se califica</h3>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "0 0 0.75rem" }}>
                    Quien revisa califica cada área. Cada una vale un porcentaje del bono máximo de ${FULLTIME_AMAZON_PERF_CAP}; el bono es la suma de lo que se gana en cada área, sin extremos de todo o nada.
                  </p>
                  <table className="data-table">
                    <thead><tr><th>Área</th><th>Vale</th><th>Máximo</th></tr></thead>
                    <tbody>
                      {AMAZON_QUIZ_CRITERIA.map((c) => (
                        <tr key={c.key}><td>{c.label}</td><td>{c.weight}%</td><td>${((FULLTIME_AMAZON_PERF_CAP * c.weight) / 100).toFixed(2)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {visibleAgents.map((ag) => {
                  const current = amazonPerformance.find((p) => p.agentId === ag.id);
                  return (
                    <AmazonQuizCard
                      key={ag.id} name={ag.name}
                      initial={current?.quiz ?? null}
                      savedAt={current ? (current.scorePct != null ? `guardado: ${current.scorePct}%` : `calificado antes como ${current.rating}`) : ""}
                      onSave={(quiz, pct) => saveAmazonQuiz(ag.id, quiz, pct)}
                    />
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
                <div className="badge badge-success" style={{ fontSize: "1rem", padding: "0.5rem 1rem" }}>Total Bonus: ${(isFullTimeCycle ? tiktokBonusFullTime : tiktokBonus).toFixed(2)}</div>
              </div>
              <table className="data-table">
                <thead><tr><th>Date Range</th><th>Score</th><th>Tier Value</th><th>Earned</th><th>Actions</th></tr></thead>
                <tbody>
                  {[...tiktokScores].sort((a, b) => b.date.localeCompare(a.date)).map((t) => {
                    const s = t.score;
                    let mv = 0;
                    if (isFullTimeCycle) mv = tiktokCycleValueFullTime(s);
                    else {
                      if (s <= 4.0) mv = 20; else if (s <= 4.4) mv = 30; else if (s <= 4.6) mv = 60;
                      else if (s <= 4.7) mv = 70; else if (s <= 4.8) mv = 80; else mv = 100;
                    }
                    const earned = (mv / cycleDays) * t.duration;
                    const endDate = new Date(t.date);
                    endDate.setDate(endDate.getDate() + t.duration - 1);
                    return (
                      <tr key={t.id}>
                        <td>{t.duration > 1 ? `${t.date} – ${endDate.toISOString().slice(0, 10)}` : t.date}</td>
                        <td>{t.score}</td>
                        <td>${mv.toFixed(2)}</td>
                        <td>+${earned.toFixed(2)}</td>
                        <td>{t.id < 0
                          ? <span className="badge" title="Pulled automatically from TikTok Shop each day" style={{ background: "#e0f2fe", color: "#075985", border: "none" }}>Auto · TikTok</span>
                          : <button className="btn btn-sm btn-danger" disabled={!isAdmin} title={isAdmin ? undefined : ADMIN_ONLY_MSG} onClick={() => requireAdmin(async () => { await deleteOpsTikTokScore(t.id); await load(); })}>Delete</button>}</td>
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
              {visibleAgents.map((ag) => (
                <div key={ag.id} className="form-group" style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}>
                    <label>{ag.name}</label>
                    <input type="text" className="form-control" value={agentNames[ag.id] ?? ""} onChange={(e) => setAgentNames({ ...agentNames, [ag.id]: e.target.value })} />
                  </div>
                  <button className="btn btn-primary btn-sm" disabled={!isAdmin} title={isAdmin ? undefined : ADMIN_ONLY_MSG} onClick={() => saveAgentName(ag.id)}>Save</button>
                </div>
              ))}
            </div>
            <div className="card">
              <h3 style={{ marginBottom: "0.25rem" }}>Add Agent</h3>
              {!isAdmin ? (
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{ADMIN_ONLY_MSG}</p>
              ) : (
                <form onSubmit={submitNewAgent} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", maxWidth: 400 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: "0.85rem", fontWeight: 500 }}>Nombre del agente</label>
                    <input type="text" className="form-control" placeholder="Nombre completo" value={newAgentName} onChange={(e) => setNewAgentName(e.target.value)} required />
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={addAgentSaving}>{addAgentSaving ? "..." : "Agregar"}</button>
                </form>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Approval settings (admin only) */}
      {showApprovalSettings && isHubAdmin && (
        <div className="modal-overlay active">
          <div className="modal">
            <div className="modal-header"><h3>Approval settings</h3></div>
            <div className="form-group">
              <label>Approver email (the only person who can approve)</label>
              <input type="email" className="form-control" value={approvalForm.approverEmail} onChange={(e) => setApprovalForm({ ...approvalForm, approverEmail: e.target.value })} placeholder="catalina@company.com" />
            </div>
            <div className="form-group">
              <label>HR email (receives the breakdown)</label>
              <input type="email" className="form-control" value={approvalForm.hrEmail} onChange={(e) => setApprovalForm({ ...approvalForm, hrEmail: e.target.value })} placeholder="hr@company.com" />
            </div>
            {approvalForm.copies.map((c, i) => (
              <div className="form-group" key={i}>
                <label>Copy to {i + 1} (optional)</label>
                <input type="email" className="form-control" value={c} placeholder={`copy${i + 1}@${APPROVAL_EMAIL_DOMAIN}`}
                  onChange={(e) => setApprovalForm({ ...approvalForm, copies: approvalForm.copies.map((x, j) => (j === i ? e.target.value : x)) })} />
              </div>
            ))}
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Only @{APPROVAL_EMAIL_DOMAIN} addresses are accepted.</p>
            {approvalSettingsMsg && <p style={{ fontSize: "0.875rem" }}>{approvalSettingsMsg}</p>}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowApprovalSettings(false)}>Close</button>
              <button className="btn btn-primary" onClick={saveApprovalSettings}>Save</button>
            </div>
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
              if (!canInvalidateAppeal(invalidatingAppeal)) { setInvalidateError(ADMIN_ONLY_MSG); return; }
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
