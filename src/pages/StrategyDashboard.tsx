import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Agent, StrategyEntry } from "../types";
import { getAgents, updateAgentName, createAgent, verifySuperAdmin, getStrategyEntries, upsertStrategyEntry } from "../services/api";
import { getCyclesForYear, getCurrentCycleDefault } from "../services/usaCycles";

const YEARS = ["2025", "2026", "2027", "2028"];

const TABS: [string, string][] = [
  ["resumen", "Resumen"],
  ["registrar", "Registrar"],
  ["settings", "Settings"],
];

// ── Bonus constants ────────────────────────────────────────────────────────────
const BONO_BASE = 300_000;
const IND1_MAX = 260_000;
const IND2_MAX = 195_000;
const IND3_MAX = 130_000;
const IND4_MAX = 65_000;

function unitMultiplier(units: number): number {
  if (units < 800) return 0;
  if (units < 1000) return 0.5;
  if (units < 1200) return 0.75;
  return 1;
}

function roiPctScale(roi: number): number {
  if (roi >= 10) return 1;
  if (roi >= 8) return 0.70;
  if (roi >= 6) return 0.40;
  if (roi >= 5) return 0.30;
  if (roi >= 4) return 0.20;
  return 0;
}

function samplesPctScale(pct: number): number {
  if (pct >= 100) return 1;
  if (pct >= 80) return 0.80;
  if (pct >= 60) return 0.60;
  if (pct >= 40) return 0.40;
  if (pct >= 20) return 0.20;
  return 0;
}

function productScoreScale(score: number): number {
  if (score >= 4.6) return 1;
  if (score >= 4.5) return 0.80;
  if (score >= 4.3) return 0.60;
  if (score >= 4.2) return 0.30;
  if (score >= 4.1) return 0.10;
  return 0;
}

function nonBuyerScale(rate: number): number {
  if (rate <= 2) return 1;
  if (rate <= 2.5) return 0.50;
  return 0;
}

function negReviewScale(rate: number): number {
  if (rate <= 0.45) return 1;
  if (rate <= 0.80) return 0.50;
  if (rate <= 1.20) return 0.25;
  return 0;
}

function operativeScale(pct: number): number {
  if (pct >= 100) return 1;
  if (pct >= 80) return 0.75;
  if (pct >= 60) return 0.50;
  if (pct >= 40) return 0.25;
  return 0;
}

function calcBonus(e: StrategyEntry) {
  const mult = unitMultiplier(e.unitsSold);
  const ind1 = IND1_MAX * roiPctScale(e.roiPct);
  const ind2 = IND2_MAX * samplesPctScale(e.samplesContentPct);
  const pA = productScoreScale(e.productScore);
  const pB = nonBuyerScale(e.nonBuyerFaultRate);
  const pC = negReviewScale(e.negativeReviewRate);
  const ind3 = IND3_MAX * ((pA + pB + pC) / 3);
  const ind4 = IND4_MAX * operativeScale(e.operativeCompliancePct);
  const bonoVariable = (ind1 + ind2 + ind3 + ind4) * mult;
  return { ind1, ind2, ind3, pA, pB, pC, ind4, bonoVariable, total: BONO_BASE + bonoVariable, mult };
}

function cop(n: number) {
  return new Intl.NumberFormat("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n));
}

function pctLabel(p: number) {
  return `${Math.round(p * 100)}%`;
}

function unitLabel(units: number) {
  if (units < 800) return { label: "< 800 — Sin bono variable", color: "#dc2626", pct: 0 };
  if (units < 1000) return { label: `${units} — 50% del bono variable`, color: "#d97706", pct: 50 };
  if (units < 1200) return { label: `${units} — 75% del bono variable`, color: "#ca8a04", pct: 75 };
  return { label: `${units} — 100% del bono variable`, color: "#15803d", pct: 100 };
}

const EMPTY_ENTRY = (agentId: number, year: string, cycleId: string): Omit<StrategyEntry, "id"> => ({
  agentId, year, cycleId,
  unitsSold: 0, roiPct: 0, samplesContentPct: 0,
  productScore: 0, nonBuyerFaultRate: 0, negativeReviewRate: 0,
  operativeCompliancePct: 0,
});

// ── Component ──────────────────────────────────────────────────────────────────

export default function StrategyDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("resumen");
  const defaultCycle = getCurrentCycleDefault();
  const [year, setYear] = useState(defaultCycle.year);
  const [cycleId, setCycleId] = useState(defaultCycle.cycleId);
  const [cycles, setCycles] = useState(() => getCyclesForYear(Number(defaultCycle.year)));

  const [agents, setAgents] = useState<Agent[]>([]);
  const [entries, setEntries] = useState<StrategyEntry[]>([]);
  const [saving, setSaving] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [ags, ens] = await Promise.all([
      getAgents("APT"),
      getStrategyEntries(year, cycleId),
    ]);
    setAgents(ags);
    setEntries(ens);
  }, [year, cycleId]);

  useEffect(() => { load(); }, [load]);

  // ── Draft edits per agent (registrar tab)
  const [drafts, setDrafts] = useState<Record<number, Omit<StrategyEntry, "id">>>({});

  useEffect(() => {
    const d: Record<number, Omit<StrategyEntry, "id">> = {};
    agents.forEach((ag) => {
      const existing = entries.find((e) => e.agentId === ag.id);
      d[ag.id] = existing
        ? { agentId: ag.id, year, cycleId, unitsSold: existing.unitsSold, roiPct: existing.roiPct, samplesContentPct: existing.samplesContentPct, productScore: existing.productScore, nonBuyerFaultRate: existing.nonBuyerFaultRate, negativeReviewRate: existing.negativeReviewRate, operativeCompliancePct: existing.operativeCompliancePct }
        : EMPTY_ENTRY(ag.id, year, cycleId);
    });
    setDrafts(d);
  }, [agents, entries, year, cycleId]);

  const setField = (agentId: number, field: keyof Omit<StrategyEntry, "id" | "agentId" | "year" | "cycleId">, value: number) => {
    setDrafts((prev) => ({ ...prev, [agentId]: { ...prev[agentId], [field]: value } }));
  };

  const saveDraft = async (agentId: number) => {
    const draft = drafts[agentId];
    if (!draft) return;
    setSaving(agentId);
    try {
      await upsertStrategyEntry(draft);
      await load();
    } finally {
      setSaving(null);
    }
  };

  // ── Agent settings
  const [agentNames, setAgentNames] = useState<Record<number, string>>({});
  useEffect(() => {
    const names: Record<number, string> = {};
    agents.forEach((a) => { names[a.id] = a.name; });
    setAgentNames(names);
  }, [agents]);

  const saveAgentName = async (id: number) => {
    const { updateAgentName: update } = await import("../services/api");
    await update(id, agentNames[id]);
    await load();
  };

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

  // ── Render ─────────────────────────────────────────────────────────────────

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

        {/* ── RESUMEN ────────────────────────────────────────────────────────── */}
        {activeTab === "resumen" && (
          <section>
            <header className="section-header"><h2>Resumen de Bonus — Strategy Team</h2></header>

            {/* Estructura rápida */}
            <div className="card" style={{ background: "#f5f3ff", border: "1px solid #e0e7ff", marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.1em" }}>Bono Base</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#1e1b4b" }}>$300.000 COP</div>
                  <div style={{ fontSize: "0.72rem", color: "#6366f1" }}>Garantizado</div>
                </div>
                <div style={{ fontSize: "1.5rem", color: "#a5b4fc" }}>+</div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.1em" }}>Bono Variable Máx.</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#1e1b4b" }}>$650.000 COP</div>
                  <div style={{ fontSize: "0.72rem", color: "#6366f1" }}>≈ USD 200 · 4 indicadores</div>
                </div>
                <div style={{ fontSize: "1.5rem", color: "#a5b4fc" }}>=</div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.1em" }}>Total Posible</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#4f46e5" }}>$950.000 COP</div>
                  <div style={{ fontSize: "0.72rem", color: "#6366f1" }}>≈ USD 292</div>
                </div>
              </div>
            </div>

            {agents.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                No hay agentes. Ve a Settings para agregar miembros.
              </div>
            ) : (
              agents.map((ag) => {
                const entry = entries.find((e) => e.agentId === ag.id);
                if (!entry) {
                  return (
                    <div key={ag.id} className="card" style={{ borderLeft: "4px solid #6366f1", marginBottom: "1rem" }}>
                      <h3 style={{ color: "#4f46e5", marginBottom: "0.5rem" }}>{ag.name}</h3>
                      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Sin datos para este ciclo. Ve a <strong>Registrar</strong> para ingresar métricas.</p>
                    </div>
                  );
                }
                const b = calcBonus(entry);
                const ul = unitLabel(entry.unitsSold);

                return (
                  <div key={ag.id} className="card" style={{ borderLeft: "4px solid #6366f1", marginBottom: "1.25rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
                      <h3 style={{ color: "#4f46e5" }}>{ag.name}</h3>
                      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                        <div style={{ background: "#f5f3ff", border: "1px solid #e0e7ff", borderRadius: 8, padding: "0.4rem 0.9rem", textAlign: "center" }}>
                          <div style={{ fontSize: "0.65rem", color: "#6366f1", fontWeight: 700, textTransform: "uppercase" }}>Bono Base</div>
                          <div style={{ fontSize: "1rem", fontWeight: 800, color: "#1e1b4b" }}>${cop(BONO_BASE)}</div>
                        </div>
                        <div style={{ background: b.bonoVariable > 0 ? "#f0fdf4" : "#fef2f2", border: `1px solid ${b.bonoVariable > 0 ? "#bbf7d0" : "#fecaca"}`, borderRadius: 8, padding: "0.4rem 0.9rem", textAlign: "center" }}>
                          <div style={{ fontSize: "0.65rem", color: b.bonoVariable > 0 ? "#15803d" : "#dc2626", fontWeight: 700, textTransform: "uppercase" }}>Bono Variable</div>
                          <div style={{ fontSize: "1rem", fontWeight: 800, color: b.bonoVariable > 0 ? "#15803d" : "#dc2626" }}>${cop(b.bonoVariable)}</div>
                        </div>
                        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "0.4rem 0.9rem", textAlign: "center" }}>
                          <div style={{ fontSize: "0.65rem", color: "#1d4ed8", fontWeight: 700, textTransform: "uppercase" }}>Total</div>
                          <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#1d4ed8" }}>${cop(b.total)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Umbral */}
                    <div style={{ marginBottom: "1rem", padding: "0.6rem 0.9rem", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <span style={{ fontWeight: 700, fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase" }}>Umbral Ventas:</span>
                      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: ul.color }}>{ul.label}</span>
                      {b.mult < 1 && b.mult > 0 && (
                        <span style={{ fontSize: "0.75rem", color: "#64748b" }}> · Bono variable × {b.mult}</span>
                      )}
                    </div>

                    {/* Indicadores */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.75rem" }}>
                      {/* Ind 1 */}
                      <IndCard
                        num="1" pct={40} label="ROI Programa Afiliados"
                        earned={b.ind1} max={IND1_MAX} mult={b.mult}
                        detail={`ROI: ${entry.roiPct}% → ${pctLabel(roiPctScale(entry.roiPct))}`}
                        color="#7c3aed"
                      />
                      {/* Ind 2 */}
                      <IndCard
                        num="2" pct={30} label="% Samples con Contenido"
                        earned={b.ind2} max={IND2_MAX} mult={b.mult}
                        detail={`${entry.samplesContentPct}% publican → ${pctLabel(samplesPctScale(entry.samplesContentPct))}`}
                        color="#0891b2"
                      />
                      {/* Ind 3 */}
                      <IndCard
                        num="3" pct={20} label="Salud Cuenta TikTok"
                        earned={b.ind3} max={IND3_MAX} mult={b.mult}
                        detail={`Score ${entry.productScore} (${pctLabel(b.pA)}) · NBFR ${entry.nonBuyerFaultRate}% (${pctLabel(b.pB)}) · NRR ${entry.negativeReviewRate}% (${pctLabel(b.pC)})`}
                        color="#16a34a"
                      />
                      {/* Ind 4 */}
                      <IndCard
                        num="4" pct={10} label="Cumplimiento Operativo"
                        earned={b.ind4} max={IND4_MAX} mult={b.mult}
                        detail={`${entry.operativeCompliancePct}% cumplimiento → ${pctLabel(operativeScale(entry.operativeCompliancePct))}`}
                        color="#ea580c"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </section>
        )}

        {/* ── REGISTRAR ──────────────────────────────────────────────────────── */}
        {activeTab === "registrar" && (
          <section>
            <header className="section-header"><h2>Registrar Métricas</h2></header>
            {agents.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                No hay agentes. Ve a Settings para agregar miembros.
              </div>
            ) : (
              agents.map((ag) => {
                const d = drafts[ag.id];
                if (!d) return null;
                const preview = calcBonus({ ...d, id: 0 });
                const ul = unitLabel(d.unitsSold);
                return (
                  <div key={ag.id} className="card" style={{ borderLeft: "4px solid #6366f1", marginBottom: "1.25rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.5rem" }}>
                      <h3 style={{ color: "#4f46e5" }}>{ag.name}</h3>
                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <span style={{ fontSize: "0.8rem", color: "#64748b" }}>Total estimado:</span>
                        <span style={{ fontSize: "1rem", fontWeight: 800, color: "#4f46e5" }}>${cop(preview.total)}</span>
                        <button className="btn btn-primary btn-sm" onClick={() => saveDraft(ag.id)} disabled={saving === ag.id}>
                          {saving === ag.id ? "Guardando..." : "Guardar"}
                        </button>
                      </div>
                    </div>

                    {/* Umbral */}
                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.9rem 1rem", marginBottom: "1rem" }}>
                      <label style={{ fontWeight: 700, fontSize: "0.8rem", color: "#374151", display: "block", marginBottom: "0.4rem" }}>
                        Unidades vendidas en el mes
                        <span style={{ fontWeight: 400, color: "#64748b", marginLeft: "0.4rem" }}>(&lt;800 = 0% · 800–999 = 50% · 1000–1199 = 75% · ≥1200 = 100%)</span>
                      </label>
                      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                        <input
                          type="number" min={0} step={1}
                          className="form-control" style={{ maxWidth: 160 }}
                          value={d.unitsSold}
                          onChange={(e) => setField(ag.id, "unitsSold", Number(e.target.value))}
                        />
                        <span style={{ fontSize: "0.85rem", fontWeight: 600, color: ul.color }}>{ul.label}</span>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.85rem" }}>
                      {/* Ind 1 */}
                      <FieldCard color="#7c3aed" num="1" pct={40} label="ROI Mensual Programa Afiliados" maxCop={IND1_MAX}>
                        <label style={fieldLbl}>ROI %</label>
                        <input type="number" min={0} max={100} step={0.1} className="form-control" value={d.roiPct}
                          onChange={(e) => setField(ag.id, "roiPct", Number(e.target.value))} />
                        <ScaleHint tiers={[
                          { range: "≥10%", pct: "100%" }, { range: "8–9.99%", pct: "70%" },
                          { range: "6–7.99%", pct: "40%" }, { range: "5–5.99%", pct: "30%" },
                          { range: "4–4.99%", pct: "20%" }, { range: "1–3.99%", pct: "0%" },
                        ]} />
                        <BonusPreview val={IND1_MAX * roiPctScale(d.roiPct) * preview.mult} />
                      </FieldCard>

                      {/* Ind 2 */}
                      <FieldCard color="#0891b2" num="2" pct={30} label="% Samples que Generan Contenido" maxCop={IND2_MAX}>
                        <label style={fieldLbl}>% de samples que publicaron video</label>
                        <input type="number" min={0} max={100} step={0.1} className="form-control" value={d.samplesContentPct}
                          onChange={(e) => setField(ag.id, "samplesContentPct", Number(e.target.value))} />
                        <ScaleHint tiers={[
                          { range: "100%", pct: "100%" }, { range: "80–99.9%", pct: "80%" },
                          { range: "60–79.9%", pct: "60%" }, { range: "40–59.9%", pct: "40%" },
                          { range: "20–39.9%", pct: "20%" }, { range: "<20%", pct: "0%" },
                        ]} />
                        <BonusPreview val={IND2_MAX * samplesPctScale(d.samplesContentPct) * preview.mult} />
                      </FieldCard>

                      {/* Ind 3 */}
                      <FieldCard color="#16a34a" num="3" pct={20} label="Salud de la Cuenta TikTok" maxCop={IND3_MAX}>
                        <label style={fieldLbl}>A. Product Satisfaction Score (meta: ≥4.5)</label>
                        <input type="number" min={0} max={5} step={0.01} className="form-control" value={d.productScore}
                          onChange={(e) => setField(ag.id, "productScore", Number(e.target.value))} />
                        <ScaleHint tiers={[
                          { range: "≥4.6", pct: "100%" }, { range: "4.5–4.59", pct: "80%" },
                          { range: "4.3–4.49", pct: "60%" }, { range: "4.2–4.29", pct: "30%" },
                          { range: "4.1–4.19", pct: "10%" }, { range: "<4.1", pct: "0%" },
                        ]} />
                        <label style={{ ...fieldLbl, marginTop: "0.75rem" }}>B. 60 días Non-Buyer Fault Rate % (meta: &lt;2%)</label>
                        <input type="number" min={0} max={100} step={0.01} className="form-control" value={d.nonBuyerFaultRate}
                          onChange={(e) => setField(ag.id, "nonBuyerFaultRate", Number(e.target.value))} />
                        <ScaleHint tiers={[
                          { range: "≤2%", pct: "100%" }, { range: "2.01–2.50%", pct: "50%" }, { range: ">2.50%", pct: "0%" },
                        ]} />
                        <label style={{ ...fieldLbl, marginTop: "0.75rem" }}>C. 60 Negative Review Rate % (meta: &lt;1.2%)</label>
                        <input type="number" min={0} max={100} step={0.01} className="form-control" value={d.negativeReviewRate}
                          onChange={(e) => setField(ag.id, "negativeReviewRate", Number(e.target.value))} />
                        <ScaleHint tiers={[
                          { range: "≤0.45%", pct: "100%" }, { range: "0.46–0.80%", pct: "50%" },
                          { range: "0.81–1.20%", pct: "25%" }, { range: ">1.20%", pct: "0%" },
                        ]} />
                        <BonusPreview val={IND3_MAX * ((productScoreScale(d.productScore) + nonBuyerScale(d.nonBuyerFaultRate) + negReviewScale(d.negativeReviewRate)) / 3) * preview.mult} />
                      </FieldCard>

                      {/* Ind 4 */}
                      <FieldCard color="#ea580c" num="4" pct={10} label="Cumplimiento Operativo" maxCop={IND4_MAX}>
                        <label style={fieldLbl}>% de cumplimiento</label>
                        <input type="number" min={0} max={100} step={1} className="form-control" value={d.operativeCompliancePct}
                          onChange={(e) => setField(ag.id, "operativeCompliancePct", Number(e.target.value))} />
                        <ScaleHint tiers={[
                          { range: "100%", pct: "100%" }, { range: "80–99%", pct: "75%" },
                          { range: "60–79%", pct: "50%" }, { range: "40–59%", pct: "25%" }, { range: "<40%", pct: "0%" },
                        ]} />
                        <BonusPreview val={IND4_MAX * operativeScale(d.operativeCompliancePct) * preview.mult} />
                      </FieldCard>
                    </div>
                  </div>
                );
              })
            )}
          </section>
        )}

        {/* ── SETTINGS ───────────────────────────────────────────────────────── */}
        {activeTab === "settings" && (
          <section>
            <header className="section-header"><h2>Settings</h2></header>
            <div className="card">
              <h3 style={{ marginBottom: "1rem" }}>Team Members</h3>
              {agents.length === 0 && (
                <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>No hay miembros.</p>
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

// ── Sub-components ─────────────────────────────────────────────────────────────

const fieldLbl: React.CSSProperties = {
  fontSize: "0.8rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: "0.3rem",
};

function IndCard({ num, pct, label, earned, max, mult, detail, color }: {
  num: string; pct: number; label: string; earned: number; max: number; mult: number; detail: string; color: string;
}) {
  const earnedBeforeMult = mult > 0 ? earned / mult : earned;
  return (
    <div style={{ border: `1px solid ${color}30`, borderRadius: 10, padding: "0.85rem", background: "#fafafa" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
        <span style={{ fontSize: "0.7rem", fontWeight: 800, color, textTransform: "uppercase" }}>#{num} · {pct}%</span>
        <span style={{ fontSize: "0.7rem", color: "#64748b" }}>Máx ${cop(max)}</span>
      </div>
      <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#1e293b", marginBottom: "0.5rem" }}>{label}</div>
      <div style={{ fontSize: "0.72rem", color: "#64748b", marginBottom: "0.5rem" }}>{detail}</div>
      <div style={{ borderRadius: 4, background: "#e2e8f0", height: 6, overflow: "hidden", marginBottom: "0.4rem" }}>
        <div style={{ width: `${Math.min(100, (earnedBeforeMult / max) * 100)}%`, height: "100%", background: color, transition: "width 0.3s" }} />
      </div>
      <div style={{ fontSize: "0.9rem", fontWeight: 800, color }}>
        ${cop(earned)}
        {mult < 1 && <span style={{ fontSize: "0.7rem", fontWeight: 400, color: "#94a3b8", marginLeft: 4 }}>(con umbral)</span>}
      </div>
    </div>
  );
}

function FieldCard({ num, pct, label, maxCop, color, children }: {
  num: string; pct: number; label: string; maxCop: number; color: string; children: React.ReactNode;
}) {
  return (
    <div style={{ border: `2px solid ${color}40`, borderRadius: 10, padding: "1rem", background: "white" }}>
      <div style={{ fontSize: "0.7rem", fontWeight: 800, color, textTransform: "uppercase", marginBottom: "0.2rem" }}>
        Indicador #{num} · {pct}% · Máx ${cop(maxCop)}
      </div>
      <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1e293b", marginBottom: "0.85rem" }}>{label}</div>
      {children}
    </div>
  );
}

function ScaleHint({ tiers }: { tiers: { range: string; pct: string }[] }) {
  return (
    <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.4rem", marginBottom: "0.3rem" }}>
      {tiers.map((t) => (
        <span key={t.range} style={{ fontSize: "0.65rem", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 4, padding: "0.1rem 0.4rem", color: "#475569" }}>
          {t.range} → {t.pct}
        </span>
      ))}
    </div>
  );
}

function BonusPreview({ val }: { val: number }) {
  return (
    <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", fontWeight: 700, color: "#4f46e5" }}>
      Bono estimado: ${cop(val)} COP
    </div>
  );
}
