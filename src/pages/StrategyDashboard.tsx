import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Agent, StrategyEntry, StrategySample } from "../types";
import {
  getAgents, updateAgentName, createAgent, verifySuperAdmin,
  getStrategyEntries, upsertStrategyEntry,
  getStrategySamples, createStrategySample, updateStrategySample, deleteStrategySample,
} from "../services/api";
import { getCyclesForYear, getCurrentCycleDefault } from "../services/usaCycles";

const YEARS = ["2025", "2026", "2027", "2028"];
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const TABS: [string, string][] = [
  ["resumen", "Resumen"],
  ["roi", "ROI"],
  ["samples", "Samples"],
  ["indicadores", "Indicadores"],
  ["settings", "Settings"],
];

// ── Bonus logic ────────────────────────────────────────────────────────────────
const BONO_BASE = 300_000;
const IND1_MAX = 260_000;
const IND2_MAX = 195_000;
const IND3_MAX = 130_000;
const IND4_MAX = 65_000;

function roiScale(v: number) {
  if (v >= 10) return 1; if (v >= 8) return 0.70; if (v >= 6) return 0.40;
  if (v >= 5) return 0.30; if (v >= 4) return 0.20; return 0;
}
function samplesScale(v: number) {
  if (v >= 100) return 1; if (v >= 80) return 0.80; if (v >= 60) return 0.60;
  if (v >= 40) return 0.40; if (v >= 20) return 0.20; return 0;
}
function productScoreScale(v: number) {
  if (v >= 4.6) return 1; if (v >= 4.5) return 0.80; if (v >= 4.3) return 0.60;
  if (v >= 4.2) return 0.30; if (v >= 4.1) return 0.10; return 0;
}
function nonBuyerScale(v: number) { if (v <= 2) return 1; if (v <= 2.5) return 0.50; return 0; }
function negReviewScale(v: number) {
  if (v <= 0.45) return 1; if (v <= 0.80) return 0.50; if (v <= 1.20) return 0.25; return 0;
}
function operativeScale(v: number) {
  if (v >= 100) return 1; if (v >= 80) return 0.75; if (v >= 60) return 0.50; if (v >= 40) return 0.25; return 0;
}

function calcBonus(e: StrategyEntry, samplesPct: number) {
  const ind1 = IND1_MAX * roiScale(e.roiPct);
  const ind2 = IND2_MAX * samplesScale(samplesPct);
  const pA = productScoreScale(e.productScore);
  const pB = nonBuyerScale(e.nonBuyerFaultRate);
  const pC = negReviewScale(e.negativeReviewRate);
  const ind3 = IND3_MAX * ((pA + pB + pC) / 3);
  const ind4 = IND4_MAX * operativeScale(e.operativeCompliancePct);
  const bonoVariable = ind1 + ind2 + ind3 + ind4;
  return { ind1, ind2, ind3, pA, pB, pC, ind4, bonoVariable, total: BONO_BASE + bonoVariable };
}

function cop(n: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Math.round(n));
}
function pct(p: number) { return `${Math.round(p * 100)}%`; }

function roiLabel(v: number) {
  if (v >= 10) return { label: "Dos dígitos o más", color: "#15803d", pct: 100 };
  if (v >= 8)  return { label: "Buen desempeño", color: "#16a34a", pct: 70 };
  if (v >= 6)  return { label: "Desempeño aceptable", color: "#ca8a04", pct: 40 };
  if (v >= 5)  return { label: "Desempeño bajo", color: "#d97706", pct: 30 };
  if (v >= 4)  return { label: "Muy bajo", color: "#dc2626", pct: 20 };
  if (v >= 1)  return { label: "No aplica bono", color: "#9ca3af", pct: 0 };
  return { label: "Sin datos", color: "#9ca3af", pct: 0 };
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function StrategyDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("resumen");
  const defaultCycle = getCurrentCycleDefault();
  const [year, setYear] = useState(defaultCycle.year);
  const [cycleId, setCycleId] = useState(defaultCycle.cycleId);
  const [cycles, setCycles] = useState(() => getCyclesForYear(Number(defaultCycle.year)));

  const currentMonth = new Date().getMonth() + 1;
  const [sampleMonth, setSampleMonth] = useState(currentMonth);
  const [sampleYear, setSampleYear] = useState(new Date().getFullYear().toString());

  const [agents, setAgents] = useState<Agent[]>([]);
  const [entries, setEntries] = useState<StrategyEntry[]>([]);
  const [samples, setSamples] = useState<StrategySample[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [ags, ens] = await Promise.all([
      getAgents("APT"),
      getStrategyEntries(year, cycleId),
    ]);
    setAgents(ags);
    setEntries(ens);
  }, [year, cycleId]);

  const loadSamples = useCallback(async () => {
    const s = await getStrategySamples(sampleYear, sampleMonth);
    setSamples(s);
  }, [sampleYear, sampleMonth]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSamples(); }, [loadSamples]);

  // ── Entry drafts
  const [drafts, setDrafts] = useState<Record<number, Omit<StrategyEntry, "id">>>({});
  const emptyEntry = useCallback((agentId: number): Omit<StrategyEntry, "id"> => ({
    agentId, year, cycleId, roiPct: 0, productScore: 0,
    nonBuyerFaultRate: 0, negativeReviewRate: 0, operativeCompliancePct: 0,
  }), [year, cycleId]);

  useEffect(() => {
    const d: Record<number, Omit<StrategyEntry, "id">> = {};
    agents.forEach((ag) => {
      const ex = entries.find((e) => e.agentId === ag.id);
      d[ag.id] = ex
        ? { agentId: ag.id, year, cycleId, roiPct: ex.roiPct, productScore: ex.productScore, nonBuyerFaultRate: ex.nonBuyerFaultRate, negativeReviewRate: ex.negativeReviewRate, operativeCompliancePct: ex.operativeCompliancePct }
        : emptyEntry(ag.id);
    });
    setDrafts(d);
  }, [agents, entries, year, cycleId, emptyEntry]);

  const setField = (agentId: number, field: keyof Omit<StrategyEntry, "id" | "agentId" | "year" | "cycleId">, value: number) =>
    setDrafts((p) => ({ ...p, [agentId]: { ...p[agentId], [field]: value } }));

  const saveEntry = async (agentId: number) => {
    const d = drafts[agentId]; if (!d) return;
    setSaving(true);
    try { await upsertStrategyEntry(d); await load(); } finally { setSaving(false); }
  };

  // ── Samples state
  const [showAddSample, setShowAddSample] = useState(false);
  const [filterZeroVideos, setFilterZeroVideos] = useState(false);
  const [filterSku, setFilterSku] = useState("");
  const [editingSample, setEditingSample] = useState<StrategySample | null>(null);
  const [newSample, setNewSample] = useState({ username: "", sku: "", sentDate: "", videosPublished: 0, notes: "" });
  const [sampleSaving, setSampleSaving] = useState(false);

  const submitSample = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSample.username.trim() || !newSample.sku.trim() || !newSample.sentDate) return;
    const agentId = agents[0]?.id ?? 0;
    const d = new Date(newSample.sentDate);
    setSampleSaving(true);
    try {
      await createStrategySample({
        agentId, username: newSample.username.trim(), sku: newSample.sku.trim(),
        sentDate: newSample.sentDate, videosPublished: newSample.videosPublished,
        year: String(d.getFullYear()), month: d.getMonth() + 1, notes: newSample.notes,
      });
      setNewSample({ username: "", sku: "", sentDate: "", videosPublished: 0, notes: "" });
      setShowAddSample(false);
      await loadSamples();
    } finally { setSampleSaving(false); }
  };

  const saveEditSample = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSample) return;
    setSampleSaving(true);
    try {
      await updateStrategySample(editingSample.id, {
        username: editingSample.username, sku: editingSample.sku,
        sentDate: editingSample.sentDate, videosPublished: editingSample.videosPublished,
        notes: editingSample.notes,
      });
      setEditingSample(null);
      await loadSamples();
    } finally { setSampleSaving(false); }
  };

  const removeSample = async (id: number) => {
    if (!confirm("¿Eliminar este sample?")) return;
    await deleteStrategySample(id);
    await loadSamples();
  };

  // ── Agent settings
  const [agentNames, setAgentNames] = useState<Record<number, string>>({});
  useEffect(() => {
    const n: Record<number, string> = {};
    agents.forEach((a) => { n[a.id] = a.name; });
    setAgentNames(n);
  }, [agents]);

  const saveAgentName = async (id: number) => {
    const { updateAgentName } = await import("../services/api");
    await updateAgentName(id, agentNames[id]); await load();
  };

  const [addPw, setAddPw] = useState(""); const [addPwErr, setAddPwErr] = useState("");
  const [addVerified, setAddVerified] = useState(false); const [newName, setNewName] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  const checkAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifySuperAdmin("APT", addPw)) { setAddVerified(true); setAddPwErr(""); }
    else setAddPwErr("Contraseña incorrecta.");
  };
  const submitAgent = async (e: React.FormEvent) => {
    e.preventDefault(); if (!newName.trim()) return;
    setAddSaving(true);
    try { await createAgent(newName.trim(), "APT"); await load(); setNewName(""); setAddVerified(false); setAddPw(""); }
    finally { setAddSaving(false); }
  };

  // ── Derived: samples pct for current month cycle context
  const allSamplesForYear = useCallback(async () => getStrategySamples(year), [year]);
  const [yearSamples, setYearSamples] = useState<StrategySample[]>([]);
  useEffect(() => { allSamplesForYear().then(setYearSamples); }, [allSamplesForYear]);

  // Find cycle month for bonus calc (use month of cycle end date — approximate)
  const currentCycle = cycles.find((c) => c.id === cycleId);
  const cycleMonthApprox = currentMonth; // fallback to current month

  const samplesPctForCycle = useCallback((agentId: number) => {
    const relevant = yearSamples.filter((s) => s.agentId === agentId && s.month === cycleMonthApprox);
    if (!relevant.length) return 0;
    const withContent = relevant.filter((s) => s.videosPublished > 0).length;
    return (withContent / relevant.length) * 100;
  }, [yearSamples, cycleMonthApprox]);

  // ── Filtered samples list
  const filteredSamples = samples
    .filter((s) => !filterZeroVideos || s.videosPublished === 0)
    .filter((s) => !filterSku || s.sku.toLowerCase().includes(filterSku.toLowerCase()));

  const totalSamples = samples.length;
  const withContent = samples.filter((s) => s.videosPublished > 0).length;
  const contentRate = totalSamples > 0 ? Math.round((withContent / totalSamples) * 100) : 0;

  // ── Color helper
  const indColor = { roi: "#7c3aed", samples: "#0891b2", health: "#16a34a", operative: "#ea580c" };

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

        {/* ── RESUMEN ──────────────────────────────────────────────────────────── */}
        {activeTab === "resumen" && (
          <section>
            <header className="section-header"><h2>Resumen de Bonus</h2></header>

            {agents.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
                No hay agentes. Ve a Settings para agregar miembros.
              </div>
            ) : agents.map((ag) => {
              const entry = entries.find((e) => e.agentId === ag.id);
              const spct = samplesPctForCycle(ag.id);
              const b = entry ? calcBonus(entry, spct) : null;

              return (
                <div key={ag.id} style={{ marginBottom: "1.5rem" }}>
                  <h3 style={{ fontWeight: 800, fontSize: "1.1rem", color: "#1e293b", marginBottom: "1rem" }}>{ag.name}</h3>

                  {/* Totals row */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.75rem", marginBottom: "1.25rem" }}>
                    <TotalCard label="Bono Base" value={BONO_BASE} color="#15803d" sublabel="Garantizado todos los meses" />
                    <TotalCard label="Bono Variable" value={b?.bonoVariable ?? 0} color="#6366f1" sublabel={`de $${cop(650_000)} máx`} />
                    <TotalCard label="Total del Ciclo" value={b?.total ?? BONO_BASE} color="#1d4ed8" sublabel="Base + Variable" large />
                  </div>

                  {!entry ? (
                    <div style={{ background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 10, padding: "1.25rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.875rem" }}>
                      Sin datos para este ciclo. Registra los indicadores en los tabs correspondientes.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "0.75rem" }}>
                      <BonusIndCard num="1" weight="40%" label="ROI Programa Afiliados" earned={b!.ind1} max={IND1_MAX} color={indColor.roi}
                        detail={`ROI: ${entry.roiPct}%`} scalePct={roiScale(entry.roiPct)} />
                      <BonusIndCard num="2" weight="30%" label="Samples con Contenido" earned={b!.ind2} max={IND2_MAX} color={indColor.samples}
                        detail={`${Math.round(spct)}% generaron video`} scalePct={samplesScale(spct)} />
                      <BonusIndCard num="3" weight="20%" label="Salud Cuenta TikTok" earned={b!.ind3} max={IND3_MAX} color={indColor.health}
                        detail={`Score ${entry.productScore} · NBFR ${entry.nonBuyerFaultRate}% · NRR ${entry.negativeReviewRate}%`} scalePct={(b!.pA + b!.pB + b!.pC) / 3} />
                      <BonusIndCard num="4" weight="10%" label="Cumplimiento Operativo" earned={b!.ind4} max={IND4_MAX} color={indColor.operative}
                        detail={`${entry.operativeCompliancePct}% cumplimiento`} scalePct={operativeScale(entry.operativeCompliancePct)} />
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {/* ── ROI ──────────────────────────────────────────────────────────────── */}
        {activeTab === "roi" && (
          <section>
            <header className="section-header">
              <div>
                <h2>ROI Mensual — Programa de Afiliados</h2>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: 0 }}>Indicador #1 · 40% del bono variable · Máx $260.000 COP</p>
              </div>
            </header>

            {/* Scale reference */}
            <div className="card" style={{ marginBottom: "1.25rem", background: "#faf5ff", border: "1px solid #e9d5ff" }}>
              <p style={{ fontWeight: 700, fontSize: "0.8rem", color: "#7c3aed", marginBottom: "0.6rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Escala de desempeño</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {[
                  { range: "≥ 10%", desc: "Dos dígitos", pct: "100%", bono: "$260.000", color: "#15803d" },
                  { range: "8–9.99%", desc: "Buen desempeño", pct: "70%", bono: "$182.000", color: "#16a34a" },
                  { range: "6–7.99%", desc: "Aceptable", pct: "40%", bono: "$104.000", color: "#ca8a04" },
                  { range: "5–5.99%", desc: "Bajo", pct: "30%", bono: "$78.000", color: "#d97706" },
                  { range: "4–4.99%", desc: "Muy bajo", pct: "20%", bono: "$52.000", color: "#dc2626" },
                  { range: "1–3.99%", desc: "Sin bono", pct: "0%", bono: "$0", color: "#9ca3af" },
                ].map((t) => (
                  <div key={t.range} style={{ border: `1px solid ${t.color}30`, borderLeft: `3px solid ${t.color}`, borderRadius: 8, padding: "0.5rem 0.75rem", minWidth: 120 }}>
                    <div style={{ fontWeight: 800, fontSize: "0.85rem", color: t.color }}>{t.range}</div>
                    <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{t.desc} · {t.pct}</div>
                    <div style={{ fontWeight: 700, fontSize: "0.8rem", color: "#1e293b", marginTop: "0.2rem" }}>{t.bono}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Per-agent ROI form */}
            {agents.map((ag) => {
              const d = drafts[ag.id]; if (!d) return null;
              const rl = roiLabel(d.roiPct);
              const earned = IND1_MAX * roiScale(d.roiPct);
              return (
                <div key={ag.id} className="card" style={{ marginBottom: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div>
                      <h3 style={{ margin: 0, color: "#4f46e5" }}>{ag.name}</h3>
                      <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>Ciclo: {currentCycle?.name ?? cycleId}</p>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "0.7rem", color: rl.color, fontWeight: 700, textTransform: "uppercase" }}>{rl.label}</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 800, color: indColor.roi }}>${cop(earned)}</div>
                      </div>
                      <button className="btn btn-primary btn-sm" onClick={() => saveEntry(ag.id)} disabled={saving}>
                        {saving ? "..." : "Guardar"}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-end", flexWrap: "wrap" }}>
                    <div style={{ flex: "0 0 auto" }}>
                      <label style={lbl}>ROI del ciclo (%)</label>
                      <input type="number" min={0} max={100} step={0.01} className="form-control" style={{ maxWidth: 150, fontSize: "1.2rem", fontWeight: 700 }}
                        value={d.roiPct}
                        onChange={(e) => setField(ag.id, "roiPct", Number(e.target.value))} />
                    </div>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ height: 8, background: "#e2e8f0", borderRadius: 4, overflow: "hidden", marginBottom: "0.4rem" }}>
                        <div style={{ width: `${Math.min(100, (d.roiPct / 10) * 100)}%`, height: "100%", background: rl.color, transition: "width 0.3s", borderRadius: 4 }} />
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        {pct(roiScale(d.roiPct))} del bono máximo ({cop(IND1_MAX)} COP)
                      </div>
                    </div>
                  </div>

                  {/* Historical hint */}
                  <div style={{ marginTop: "1rem", padding: "0.6rem 0.85rem", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                    <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Consejo: cambia el ciclo en la barra superior para ver o editar el ROI de periodos anteriores.</span>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* ── SAMPLES ──────────────────────────────────────────────────────────── */}
        {activeTab === "samples" && (
          <section>
            <header className="section-header">
              <div>
                <h2>Samples que Generan Contenido</h2>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: 0 }}>Indicador #2 · 30% del bono variable · Máx $195.000 COP</p>
              </div>
              <button className="btn btn-primary" onClick={() => { setShowAddSample(true); setEditingSample(null); }}>
                + Agregar Sample
              </button>
            </header>

            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "0.75rem", marginBottom: "1.25rem" }}>
              <StatChip label="Total enviados" value={totalSamples} color="#0891b2" />
              <StatChip label="Con contenido" value={withContent} color="#15803d" />
              <StatChip label="Sin contenido" value={totalSamples - withContent} color="#dc2626"
                onClick={() => setFilterZeroVideos((v) => !v)} clickable active={filterZeroVideos} />
              <StatChip label="Tasa de contenido" value={`${contentRate}%`} color="#7c3aed" />
              <StatChip label="Bono estimado" value={`$${cop(IND2_MAX * samplesScale(contentRate))}`} color="#ea580c" />
            </div>

            {/* Filters */}
            <div className="card" style={{ marginBottom: "1rem", padding: "0.85rem 1rem" }}>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <label style={lbl}>Mes</label>
                  <select className="month-selector" value={sampleMonth}
                    onChange={(e) => setSampleMonth(Number(e.target.value))}>
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Año</label>
                  <select className="month-selector" value={sampleYear}
                    onChange={(e) => setSampleYear(e.target.value)}>
                    {YEARS.map((y) => <option key={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Filtrar por SKU</label>
                  <input type="text" className="form-control" style={{ maxWidth: 180 }} placeholder="Buscar SKU..."
                    value={filterSku} onChange={(e) => setFilterSku(e.target.value)} />
                </div>
                <div style={{ marginTop: "1.2rem" }}>
                  <button
                    onClick={() => setFilterZeroVideos((v) => !v)}
                    style={{ padding: "0.4rem 0.85rem", borderRadius: 20, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
                      border: `2px solid ${filterZeroVideos ? "#dc2626" : "#e2e8f0"}`,
                      background: filterZeroVideos ? "#fef2f2" : "white",
                      color: filterZeroVideos ? "#dc2626" : "#64748b" }}>
                    {filterZeroVideos ? "✕ Solo sin videos" : "Solo sin videos (0)"}
                  </button>
                </div>
              </div>
            </div>

            {/* Add / Edit form */}
            {(showAddSample || editingSample) && (
              <div className="card" style={{ marginBottom: "1rem", border: "2px solid #0891b2", background: "#f0f9ff" }}>
                <h4 style={{ margin: "0 0 1rem", color: "#0891b2" }}>{editingSample ? "Editar Sample" : "Agregar Nuevo Sample"}</h4>
                <form onSubmit={editingSample ? saveEditSample : submitSample}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.75rem", marginBottom: "0.75rem" }}>
                    <div>
                      <label style={lbl}>Username / User ID</label>
                      <input type="text" className="form-control" placeholder="@username" required
                        value={editingSample ? editingSample.username : newSample.username}
                        onChange={(e) => editingSample
                          ? setEditingSample({ ...editingSample, username: e.target.value })
                          : setNewSample({ ...newSample, username: e.target.value })} />
                    </div>
                    <div>
                      <label style={lbl}>SKU</label>
                      <input type="text" className="form-control" placeholder="SKU del producto" required
                        value={editingSample ? editingSample.sku : newSample.sku}
                        onChange={(e) => editingSample
                          ? setEditingSample({ ...editingSample, sku: e.target.value })
                          : setNewSample({ ...newSample, sku: e.target.value })} />
                    </div>
                    <div>
                      <label style={lbl}>Fecha de envío</label>
                      <input type="date" className="form-control" required
                        value={editingSample ? editingSample.sentDate : newSample.sentDate}
                        onChange={(e) => editingSample
                          ? setEditingSample({ ...editingSample, sentDate: e.target.value })
                          : setNewSample({ ...newSample, sentDate: e.target.value })} />
                    </div>
                    <div>
                      <label style={lbl}>Videos publicados</label>
                      <input type="number" min={0} step={1} className="form-control"
                        value={editingSample ? editingSample.videosPublished : newSample.videosPublished}
                        onChange={(e) => editingSample
                          ? setEditingSample({ ...editingSample, videosPublished: Number(e.target.value) })
                          : setNewSample({ ...newSample, videosPublished: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label style={lbl}>Notas</label>
                      <input type="text" className="form-control" placeholder="Opcional"
                        value={editingSample ? editingSample.notes : newSample.notes}
                        onChange={(e) => editingSample
                          ? setEditingSample({ ...editingSample, notes: e.target.value })
                          : setNewSample({ ...newSample, notes: e.target.value })} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={sampleSaving}>
                      {sampleSaving ? "..." : editingSample ? "Guardar cambios" : "Agregar"}
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowAddSample(false); setEditingSample(null); }}>
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Samples table */}
            <div className="card" style={{ overflowX: "auto" }}>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0 0 0.75rem" }}>
                {filteredSamples.length} {filteredSamples.length === 1 ? "resultado" : "resultados"} · {MONTHS[sampleMonth - 1]} {sampleYear}
              </p>
              {filteredSamples.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
                  No hay samples para este periodo.
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>SKU</th>
                      <th>Fecha envío</th>
                      <th>Videos</th>
                      <th>Notas</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSamples.map((s) => (
                      <tr key={s.id} style={{ background: s.videosPublished === 0 ? "#fff7f7" : undefined }}>
                        <td style={{ fontWeight: 600 }}>{s.username}</td>
                        <td><span style={{ background: "#f1f5f9", borderRadius: 4, padding: "0.1rem 0.5rem", fontSize: "0.8rem", fontFamily: "monospace" }}>{s.sku}</span></td>
                        <td>{s.sentDate}</td>
                        <td>
                          <span style={{ fontWeight: 700, color: s.videosPublished === 0 ? "#dc2626" : "#15803d", fontSize: "0.9rem" }}>
                            {s.videosPublished === 0 ? "⚠ 0" : `✓ ${s.videosPublished}`}
                          </span>
                        </td>
                        <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{s.notes || "—"}</td>
                        <td>
                          <button className="btn btn-sm btn-secondary" onClick={() => { setEditingSample(s); setShowAddSample(false); }}>Editar</button>{" "}
                          <button className="btn btn-sm btn-danger" onClick={() => removeSample(s.id)}>Eliminar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {/* ── INDICADORES ──────────────────────────────────────────────────────── */}
        {activeTab === "indicadores" && (
          <section>
            <header className="section-header"><h2>Indicadores 3 y 4</h2></header>

            {agents.map((ag) => {
              const d = drafts[ag.id]; if (!d) return null;
              const pA = productScoreScale(d.productScore);
              const pB = nonBuyerScale(d.nonBuyerFaultRate);
              const pC = negReviewScale(d.negativeReviewRate);
              const ind3 = IND3_MAX * ((pA + pB + pC) / 3);
              const ind4 = IND4_MAX * operativeScale(d.operativeCompliancePct);

              return (
                <div key={ag.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                    <h3 style={{ fontWeight: 800, color: "#1e293b" }}>{ag.name}</h3>
                    <button className="btn btn-primary btn-sm" onClick={() => saveEntry(ag.id)} disabled={saving}>
                      {saving ? "Guardando..." : "Guardar cambios"}
                    </button>
                  </div>

                  {/* Ind 3 */}
                  <div className="card" style={{ borderTop: `3px solid ${indColor.health}`, marginBottom: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                      <div>
                        <span style={{ fontSize: "0.7rem", fontWeight: 800, color: indColor.health, textTransform: "uppercase" }}>Indicador #3 · 20%</span>
                        <h4 style={{ margin: "0.15rem 0 0", color: "#1e293b" }}>Salud de la Cuenta TikTok (Product Satisfaction)</h4>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "0.7rem", color: "#64748b" }}>Promedio de 3 métricas</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 800, color: indColor.health }}>${cop(ind3)}</div>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1rem" }}>
                      <MetricInput label="A. Product Satisfaction Score" sublabel="Meta: ≥ 4.5" hint="≥4.6=100% · 4.5-4.59=80% · 4.3-4.49=60% · 4.2-4.29=30% · 4.1-4.19=10% · <4.1=0%"
                        value={d.productScore} step={0.01} max={5} scalePct={pA} color={indColor.health}
                        onChange={(v) => setField(ag.id, "productScore", v)} />
                      <MetricInput label="B. Non-Buyer Fault Rate" sublabel="Meta: < 2%" hint="≤2%=100% · 2.01-2.50%=50% · >2.50%=0%"
                        value={d.nonBuyerFaultRate} step={0.01} max={10} scalePct={pB} color={indColor.health}
                        onChange={(v) => setField(ag.id, "nonBuyerFaultRate", v)} unit="%" />
                      <MetricInput label="C. Negative Review Rate" sublabel="Meta: < 1.2%" hint="≤0.45%=100% · ≤0.80%=50% · ≤1.20%=25% · >1.20%=0%"
                        value={d.negativeReviewRate} step={0.01} max={5} scalePct={pC} color={indColor.health}
                        onChange={(v) => setField(ag.id, "negativeReviewRate", v)} unit="%" />
                    </div>

                    <div style={{ marginTop: "1rem", padding: "0.6rem 0.85rem", background: "#f0fdf4", borderRadius: 8, fontSize: "0.78rem", color: "#166534" }}>
                      Si alguna métrica está en 0%, el bono máximo del indicador se verá afectado. Promedio actual: {pct((pA + pB + pC) / 3)}
                    </div>
                  </div>

                  {/* Ind 4 */}
                  <div className="card" style={{ borderTop: `3px solid ${indColor.operative}`, marginBottom: "1.5rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
                      <div>
                        <span style={{ fontSize: "0.7rem", fontWeight: 800, color: indColor.operative, textTransform: "uppercase" }}>Indicador #4 · 10%</span>
                        <h4 style={{ margin: "0.15rem 0 0", color: "#1e293b" }}>Cumplimiento Operativo</h4>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "0.7rem", color: "#64748b" }}>{pct(operativeScale(d.operativeCompliancePct))} del máximo</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 800, color: indColor.operative }}>${cop(ind4)}</div>
                      </div>
                    </div>

                    <MetricInput label="% de cumplimiento mensual" sublabel="100%=100% · 80-99%=75% · 60-79%=50% · 40-59%=25% · <40%=0%"
                      value={d.operativeCompliancePct} step={1} max={100} scalePct={operativeScale(d.operativeCompliancePct)} color={indColor.operative}
                      onChange={(v) => setField(ag.id, "operativeCompliancePct", v)} unit="%" wide />

                    <div style={{ marginTop: "0.75rem", padding: "0.6rem 0.85rem", background: "#fff7ed", borderRadius: 8, fontSize: "0.75rem", color: "#9a3412" }}>
                      Incluye: seguimiento a influencers · respuesta oportuna · revisión de sample requests · documentación · envío semanal · registro actualizado · reuniones y estrategia.
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* ── SETTINGS ─────────────────────────────────────────────────────────── */}
        {activeTab === "settings" && (
          <section>
            <header className="section-header"><h2>Settings</h2></header>
            <div className="card">
              <h3 style={{ marginBottom: "1rem" }}>Team Members</h3>
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
              <h3 style={{ marginBottom: "0.25rem" }}>Agregar Miembro</h3>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem" }}>Requiere contraseña admin + <code>!</code></p>
              {!addVerified ? (
                <form onSubmit={checkAdmin} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", maxWidth: 400 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: "0.85rem", fontWeight: 500 }}>Admin Password</label>
                    <input type="password" className="form-control" value={addPw} onChange={(e) => { setAddPw(e.target.value); setAddPwErr(""); }} />
                    {addPwErr && <p className="error-msg">{addPwErr}</p>}
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm">Verificar</button>
                </form>
              ) : (
                <form onSubmit={submitAgent} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", maxWidth: 400 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: "0.85rem", fontWeight: 500 }}>Nombre</label>
                    <input type="text" className="form-control" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus required />
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={addSaving}>{addSaving ? "..." : "Agregar"}</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setAddVerified(false); setAddPw(""); }}>Cancelar</button>
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

const lbl: React.CSSProperties = {
  fontSize: "0.75rem", fontWeight: 600, color: "#64748b", display: "block", marginBottom: "0.3rem", textTransform: "uppercase", letterSpacing: "0.05em",
};

function TotalCard({ label, value, color, sublabel, large }: { label: string; value: number | string; color: string; sublabel: string; large?: boolean }) {
  return (
    <div style={{ border: `1px solid ${color}30`, borderTop: `3px solid ${color}`, borderRadius: 10, padding: "1rem 1.1rem", background: "white" }}>
      <div style={{ fontSize: "0.7rem", fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.35rem" }}>{label}</div>
      <div style={{ fontSize: large ? "1.4rem" : "1.2rem", fontWeight: 800, color: large ? color : "#1e293b" }}>
        ${typeof value === "number" ? new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Math.round(value)) : value}
        <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "#94a3b8", marginLeft: 3 }}>COP</span>
      </div>
      <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "0.25rem" }}>{sublabel}</div>
    </div>
  );
}

function BonusIndCard({ num, weight, label, earned, max, color, detail, scalePct }: {
  num: string; weight: string; label: string; earned: number; max: number; color: string; detail: string; scalePct: number;
}) {
  return (
    <div style={{ border: `1px solid ${color}20`, borderTop: `3px solid ${color}`, borderRadius: 10, padding: "0.9rem 1rem", background: "white" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
        <span style={{ fontSize: "0.65rem", fontWeight: 800, color, textTransform: "uppercase" }}>#{num} · {weight}</span>
        <span style={{ fontSize: "0.65rem", color: "#94a3b8" }}>máx ${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(max)}</span>
      </div>
      <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#1e293b", marginBottom: "0.4rem" }}>{label}</div>
      <div style={{ height: 5, background: "#e2e8f0", borderRadius: 3, overflow: "hidden", marginBottom: "0.5rem" }}>
        <div style={{ width: `${Math.min(100, scalePct * 100)}%`, height: "100%", background: color, transition: "width 0.4s", borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: "0.7rem", color: "#64748b", marginBottom: "0.4rem" }}>{detail}</div>
      <div style={{ fontSize: "1rem", fontWeight: 800, color }}>${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Math.round(earned))}</div>
    </div>
  );
}

function StatChip({ label, value, color, onClick, clickable, active }: {
  label: string; value: number | string; color: string; onClick?: () => void; clickable?: boolean; active?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{ border: `1px solid ${active ? color : color + "30"}`, borderTop: `3px solid ${color}`, borderRadius: 10, padding: "0.75rem 1rem",
        background: active ? color + "08" : "white", cursor: clickable ? "pointer" : "default",
        transition: "all 0.15s" }}>
      <div style={{ fontSize: "0.65rem", fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>{label}</div>
      <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#1e293b" }}>{value}</div>
    </div>
  );
}

function MetricInput({ label, sublabel, hint, value, step, max, scalePct, color, onChange, unit, wide }: {
  label: string; sublabel: string; hint?: string; value: number; step: number; max: number;
  scalePct: number; color: string; onChange: (v: number) => void; unit?: string; wide?: boolean;
}) {
  return (
    <div style={wide ? { gridColumn: "1 / -1" } : {}}>
      <label style={{ fontSize: "0.8rem", fontWeight: 700, color: "#1e293b", display: "block", marginBottom: "0.2rem" }}>{label}</label>
      <div style={{ fontSize: "0.7rem", color: "#64748b", marginBottom: "0.4rem" }}>{sublabel}</div>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <input type="number" min={0} max={max} step={step} className="form-control" style={{ maxWidth: 130 }}
          value={value} onChange={(e) => onChange(Number(e.target.value))} />
        {unit && <span style={{ fontSize: "0.85rem", color: "#64748b" }}>{unit}</span>}
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden", marginBottom: "0.2rem" }}>
            <div style={{ width: `${scalePct * 100}%`, height: "100%", background: color, transition: "width 0.3s", borderRadius: 3 }} />
          </div>
          <span style={{ fontSize: "0.7rem", color }}>{Math.round(scalePct * 100)}% del indicador</span>
        </div>
      </div>
      {hint && <div style={{ fontSize: "0.65rem", color: "#94a3b8", marginTop: "0.35rem" }}>{hint}</div>}
    </div>
  );
}
