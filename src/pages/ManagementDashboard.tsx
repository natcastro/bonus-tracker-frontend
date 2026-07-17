import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Agent } from "../types";
import {
  getAgents,
  getAppeals, getPeriodData, getTikTokScores,
  getOpsAppeals, getOpsHandlingTime, getOpsTikTokScores,
  getMexSales, getMexAttendance, getMexGoal, getMexAgentGoals,
} from "../services/api";
import {
  getCyclesForYear, getCurrentCycleDefault,
  APPEALS_BONUS, AMAZON_BONUS, CS_BONUS, calcTikTokBonus,
} from "../services/usaCycles";
import { OPS_APPEALS_BONUS, OPS_APPEALS_CAP, OPS_TOTAL_CAP, calcHandlingTimeBonus } from "../services/opsBonus";
import { MONTHS, ATTENDANCE_BONUS, calcGoalBonus, calcLiveSaleBonus } from "../services/mexBonus";

const YEARS = ["2025", "2026", "2027", "2028"];
type TeamTab = "usa" | "ops" | "mex";

export default function ManagementDashboard() {
  const navigate = useNavigate();
  const [team, setTeam] = useState<TeamTab>("usa");
  const defaultCycle = getCurrentCycleDefault();
  const [year, setYear] = useState(defaultCycle.year);
  const [cycleId, setCycleId] = useState(defaultCycle.cycleId);
  const [cycles, setCycles] = useState(() => getCyclesForYear(Number(defaultCycle.year)));
  const [month, setMonth] = useState(new Date().getMonth()); // 0-indexed for México

  // ── USA data
  const [usaAgents, setUsaAgents] = useState<Agent[]>([]);
  const [usaAppeals, setUsaAppeals] = useState<any[]>([]);
  const [usaPeriod, setUsaPeriod] = useState<any[]>([]);
  const [usaTiktok, setUsaTiktok] = useState<any[]>([]);

  // ── OPS data
  const [opsAgents, setOpsAgents] = useState<Agent[]>([]);
  const [opsAppeals, setOpsAppeals] = useState<any[]>([]);
  const [opsHandling, setOpsHandling] = useState<any[]>([]);
  const [opsTiktok, setOpsTiktok] = useState<any[]>([]);

  // ── MEX data
  const [mexAgents, setMexAgents] = useState<Agent[]>([]);
  const [mexSales, setMexSales] = useState<any[]>([]);
  const [mexAttendance, setMexAttendance] = useState<any[]>([]);
  const [mexGoal, setMexGoal] = useState<any>(null);
  const [mexAgentGoals, setMexAgentGoals] = useState<any[]>([]);

  const loadUsaOps = useCallback(async () => {
    const [ua, ub, uc, ud, oa, ob, oc, od] = await Promise.all([
      getAgents("USA"),
      getAppeals(Number(year), cycleId),
      getPeriodData(Number(year), cycleId),
      getTikTokScores(Number(year), cycleId),
      getAgents("OPS"),
      getOpsAppeals(Number(year), cycleId),
      getOpsHandlingTime(Number(year), cycleId),
      getOpsTikTokScores(Number(year), cycleId),
    ]);
    setUsaAgents(ua); setUsaAppeals(ub); setUsaPeriod(uc); setUsaTiktok(ud);
    setOpsAgents(oa); setOpsAppeals(ob); setOpsHandling(oc); setOpsTiktok(od);
  }, [year, cycleId]);

  const loadMex = useCallback(async () => {
    const [ma, mb, mc, md, me] = await Promise.all([
      getAgents("MEX"),
      getMexSales(Number(year), month + 1),
      getMexAttendance(Number(year), month + 1),
      getMexGoal(Number(year), month + 1),
      getMexAgentGoals(Number(year), month + 1),
    ]);
    setMexAgents(ma); setMexSales(mb); setMexAttendance(mc); setMexGoal(md); setMexAgentGoals(me);
  }, [year, month]);

  useEffect(() => {
    if (team !== "mex") loadUsaOps();
    else loadMex();
  }, [team, loadUsaOps, loadMex]);

  const cycleInfo = getCyclesForYear(Number(year)).find((c) => c.id === cycleId);
  const cycleDays = cycleInfo?.days ?? 15;

  // ── USA totals per agent
  const usaTikTokBonus = calcTikTokBonus(usaTiktok, cycleDays);
  const usaTotals = usaAgents.map((ag) => {
    const agAppeals = usaAppeals.filter((a) => a.agentId === ag.id && a.status === "completed");
    const appeals = agAppeals.reduce((s: number, a: any) => s + (APPEALS_BONUS[a.outcome] ?? 0), 0);
    const period = usaPeriod.find((p: any) => p.agentId === ag.id);
    const cs = period ? (CS_BONUS[String(period.csScore)] ?? 0) : 0;
    const amazon = period ? (AMAZON_BONUS[period.amazonScore] ?? 0) : 0;
    const total = appeals + cs + amazon + usaTikTokBonus;
    return { agent: ag, appeals, cs, amazon, tiktok: usaTikTokBonus, total };
  });

  // ── OPS totals per agent
  const opsTikTokBonus = calcTikTokBonus(opsTiktok, cycleDays);
  const opsTotals = opsAgents.map((ag) => {
    const agAppeals = opsAppeals.filter((a: any) => a.agentId === ag.id && a.status === "completed");
    const appealRaw = agAppeals.reduce((s: number, a: any) => s + (OPS_APPEALS_BONUS[a.outcome] ?? 0), 0);
    const appealCapped = Math.min(appealRaw, OPS_APPEALS_CAP);
    const ht = opsHandling.find((h: any) => h.agentId === ag.id);
    const handling = ht ? calcHandlingTimeBonus(ht.hours) : 0;
    const raw = appealCapped + handling + opsTikTokBonus;
    const total = Math.min(raw, OPS_TOTAL_CAP);
    return { agent: ag, appeals: appealCapped, handling, tiktok: opsTikTokBonus, total };
  });

  // ── MEX totals per agent
  const approvedSales = mexSales.filter((s: any) => s.status === "approved");
  const totalLivesSales = approvedSales.reduce((s: number, sale: any) => s + (sale.salesAmount ?? 0), 0);
  const livesBonus = calcLiveSaleBonus(totalLivesSales);
  const mexTotals = mexAgents.map((ag) => {
    const att = mexAttendance.find((a: any) => a.agentId === ag.id);
    const attBonus = att ? (ATTENDANCE_BONUS[att.status] ?? 0) : 0;
    const agentGoal = mexAgentGoals.find((g: any) => g.agentId === ag.id);
    const agSales = approvedSales.filter((s: any) => s.agentId === ag.id).reduce((s: number, x: any) => s + (x.salesAmount ?? 0), 0);
    const goalBonus = agentGoal ? calcGoalBonus(agentGoal.goalAmount, agSales) : 0;
    const total = attBonus + goalBonus + livesBonus;
    return { agent: ag, attBonus, goalBonus, livesBonus, total };
  });

  const TAB_COLOR: Record<TeamTab, string> = { usa: "#1e40af", ops: "#7c3aed", mex: "#15803d" };
  const color = TAB_COLOR[team];

  return (
    <div>
      <nav className="top-nav">
        <div className="logo">FTC Hub — <span style={{ color: "#64748b" }}>Management</span></div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          {/* Team tabs */}
          {(["usa", "ops", "mex"] as TeamTab[]).map((t) => (
            <button key={t} className={`btn btn-sm ${team === t ? "btn-primary" : "btn-secondary"}`}
              style={team === t ? { background: TAB_COLOR[t] } : {}}
              onClick={() => setTeam(t)}>
              {t === "usa" ? "FTC USA" : t === "ops" ? "Operaciones" : "FTC México"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <select className="month-selector" value={year} onChange={(e) => {
            const y = e.target.value; setYear(y); setCycles(getCyclesForYear(Number(y))); setCycleId("0");
          }}>{YEARS.map((y) => <option key={y}>{y}</option>)}</select>
          {team !== "mex" ? (
            <select className="month-selector" value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
              {cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : (
            <select className="month-selector" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => { sessionStorage.clear(); navigate("/"); }}>Logout</button>
        </div>
      </nav>

      <main className="content-area">
        <header className="section-header">
          <h2>
            {team === "usa" ? "FTC USA — Historial" : team === "ops" ? "Operaciones — Historial" : "FTC México — Historial"}
            <span style={{ fontSize: "0.85rem", fontWeight: 400, color: "var(--text-muted)", marginLeft: "0.75rem" }}>
              {team !== "mex"
                ? cycleInfo?.name ?? ""
                : `${MONTHS[month]} ${year}`}
            </span>
          </h2>
        </header>

        {/* ── FTC USA ── */}
        {team === "usa" && (
          <>
            <div className="summary-cards">
              {usaTotals.map((t) => (
                <div key={t.agent.id} className="stat-card" style={{ borderLeftColor: color }}>
                  <h3>{t.agent.name}</h3>
                  <div className="amount" style={{ color }}>${t.total.toFixed(2)}</div>
                </div>
              ))}
            </div>
            <div className="card" style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Appeals</th>
                    <th>CS Score</th>
                    <th>Amazon Score</th>
                    <th>TikTok (shared)</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {usaTotals.map((t) => (
                    <tr key={t.agent.id}>
                      <td style={{ fontWeight: 600 }}>{t.agent.name}</td>
                      <td>${t.appeals.toFixed(2)}</td>
                      <td>${t.cs.toFixed(2)}</td>
                      <td>${t.amazon.toFixed(2)}</td>
                      <td>${t.tiktok.toFixed(2)}</td>
                      <td style={{ fontWeight: 700, color }}>${t.total.toFixed(2)}</td>
                    </tr>
                  ))}
                  {usaTotals.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)" }}>No data for this cycle</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Operaciones ── */}
        {team === "ops" && (
          <>
            <div className="summary-cards">
              {opsTotals.map((t) => (
                <div key={t.agent.id} className="stat-card" style={{ borderLeftColor: color }}>
                  <h3>{t.agent.name}</h3>
                  <div className="amount" style={{ color }}>${t.total.toFixed(2)}</div>
                </div>
              ))}
            </div>
            <div className="card" style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Appeals (cap $200)</th>
                    <th>Handling Time</th>
                    <th>TikTok (shared)</th>
                    <th>Total (cap $300)</th>
                  </tr>
                </thead>
                <tbody>
                  {opsTotals.map((t) => (
                    <tr key={t.agent.id}>
                      <td style={{ fontWeight: 600 }}>{t.agent.name}</td>
                      <td>${t.appeals.toFixed(2)}</td>
                      <td>${t.handling.toFixed(2)}</td>
                      <td>${t.tiktok.toFixed(2)}</td>
                      <td style={{ fontWeight: 700, color }}>${t.total.toFixed(2)}</td>
                    </tr>
                  ))}
                  {opsTotals.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>No data for this cycle</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── FTC México ── */}
        {team === "mex" && (
          <>
            <div style={{ marginBottom: "0.75rem" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Valores en MXN · Lives team total: ${totalLivesSales.toLocaleString()} → Lives bonus: ${livesBonus.toFixed(0)}
              </span>
            </div>
            <div className="summary-cards">
              {mexTotals.map((t) => (
                <div key={t.agent.id} className="stat-card" style={{ borderLeftColor: color }}>
                  <h3>{t.agent.name}</h3>
                  <div className="amount" style={{ color }}>${t.total.toFixed(0)}</div>
                </div>
              ))}
            </div>
            <div className="card" style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Agente</th>
                    <th>Asistencia</th>
                    <th>Meta de ventas</th>
                    <th>Lives (compartido)</th>
                    <th>Total (MXN)</th>
                  </tr>
                </thead>
                <tbody>
                  {mexTotals.map((t) => (
                    <tr key={t.agent.id}>
                      <td style={{ fontWeight: 600 }}>{t.agent.name}</td>
                      <td>${t.attBonus.toFixed(0)}</td>
                      <td>${t.goalBonus.toFixed(0)}</td>
                      <td>${t.livesBonus.toFixed(0)}</td>
                      <td style={{ fontWeight: 700, color }}>${t.total.toFixed(0)}</td>
                    </tr>
                  ))}
                  {mexTotals.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>No data for this month</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {mexGoal && (
              <div className="card" style={{ marginTop: 0 }}>
                <h3 style={{ marginBottom: "0.5rem" }}>Meta del equipo</h3>
                <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                  Meta: ${mexGoal.goalAmount?.toLocaleString()} · Real: ${mexGoal.actualAmount?.toLocaleString()}
                  {mexGoal.goalAmount > 0 && ` · ${((mexGoal.actualAmount / mexGoal.goalAmount) * 100).toFixed(1)}%`}
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
