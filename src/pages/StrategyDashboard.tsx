import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Agent, StrategyEntry, StrategySample } from "../types";
import {
  getAgents, updateAgentName, createAgent, verifySuperAdmin,
  getStrategyEntries, upsertStrategyEntry,
  getStrategySamples, createStrategySample, updateStrategySample,
  deleteStrategySample, lockSampleBonus, unlockSampleBonus,
} from "../services/api";
import {
  getCyclesForYear, getCurrentCycleDefault,
  getCycleDatesFromId, getNextCycleKey, addDaysToDateStr, getCycleFromDate,
} from "../services/usaCycles";

// ── QA items for cumplimiento ──────────────────────────────────────────────────
const QA_ITEMS = [
  { key: "seguimiento_influencers",  label: "Seguimiento a influencers" },
  { key: "respuesta_mensajes",       label: "Respuesta oportuna a mensajes" },
  { key: "revision_samples",         label: "Revisión de Sample Requests" },
  { key: "envio_semanal",            label: "Envío semanal del listado a la agencia" },
  { key: "participacion_reuniones",  label: "Participación en reuniones y estrategia" },
  { key: "documentacion",            label: "Documentación correcta" },
  { key: "registro_actualizado",     label: "Registro actualizado de samples enviados" },
];
type QaAnswer = "si" | "masomenos" | "no" | "";

function qaToCompliancePct(qa: Record<string, QaAnswer>): number {
  const scores = QA_ITEMS.map(({ key }) => {
    const a = qa[key];
    if (a === "si") return 1;
    if (a === "masomenos") return 0.5;
    return 0;
  });
  return (scores.reduce((s, v) => s + v, 0) / QA_ITEMS.length) * 100;
}

// ── Bonus constants ────────────────────────────────────────────────────────────
const BONO_BASE = 300_000;
const IND1_MAX  = 260_000;
const IND2_MAX  = 195_000;
const IND3_MAX  = 130_000;
const IND4_MAX  =  65_000;

function roiScale(v: number) { if(v>=10)return 1;if(v>=8)return .70;if(v>=6)return .40;if(v>=5)return .30;if(v>=4)return .20;return 0; }
function productScoreScale(v: number){ if(v<=0)return 0;if(v>=4.5)return 1;if(v>=4.3)return .80;if(v>=4.2)return .40;if(v>=4.1)return .30;return 0; }
function nonBuyerScale(v: number)    { if(v<=0)return 0;if(v<=2.10)return 1;if(v<=2.20)return .80;if(v<=2.30)return .60;if(v<=2.50)return .50;return 0; }
function negReviewScale(v: number)   { if(v<=0)return 0;if(v<0.55)return 1;if(v<=0.90)return .75;if(v<=1.30)return .50;if(v<=1.60)return .25;return 0; }
function operativeScale(v: number)   { if(v>=100)return 1;if(v>=80)return .75;if(v>=60)return .50;if(v>=40)return .25;return 0; }

// finalScore: 0–100 (Coverage 80pts + Additional 20pts)
function calcBonus(e: StrategyEntry, finalScore: number) {
  const ind1 = IND1_MAX * roiScale(e.roiPct);
  const ind2 = Math.round(finalScore / 100 * IND2_MAX);
  const pA = productScoreScale(e.productScore);
  const pB = nonBuyerScale(e.nonBuyerFaultRate);
  const pC = negReviewScale(e.negativeReviewRate);
  const ind3 = IND3_MAX * (pA * 0.05 + pB * 0.50 + pC * 0.45);
  const ind4  = IND4_MAX * operativeScale(e.operativeCompliancePct);
  const bonoVariable = ind1 + ind2 + ind3 + ind4;
  return { ind1, ind2, ind3, pA, pB, pC, ind4, bonoVariable, total: BONO_BASE + bonoVariable };
}

// ── Samples bonus calculation (by creator) ─────────────────────────────────────
interface SamplesStats {
  officialSamples: StrategySample[];
  pendingSamples: StrategySample[];
  countableSamples: StrategySample[];
  totalCreators: number;
  coverageCreators: number;   // ≥1 video
  additionalCreators: number; // ≥2 videos
  coverageScore: number;      // 0–80
  additionalScore: number;    // 0–20
  finalScore: number;         // 0–100
  bonusEst: number;
  gracePeriodActive: boolean;
  graceEnd: string;
  byCreator: Record<string, number>; // username → total videos
}

function getSampleCycleKey(s: StrategySample): string {
  if (s.bonusCycleKey) return s.bonusCycleKey;
  if (!s.sentDate) return "";
  const { year, cycleId } = getCycleFromDate(s.sentDate);
  return `${year}-${cycleId}`;
}

function computeSamplesStats(
  allSamples: StrategySample[],
  year: string,
  cycleId: string,
  officialPeriod: { from: string; to: string },
): SamplesStats {
  const todayStr = new Date().toISOString().split("T")[0];
  const graceEnd = addDaysToDateStr(officialPeriod.to, 7);
  const gracePeriodActive = todayStr <= graceEnd;
  const currentKey = `${year}-${cycleId}`;

  const officialSamples = allSamples.filter(s => getSampleCycleKey(s) === currentKey);
  const pendingSamples  = officialSamples.filter(s => s.deliveryStatus === "pending");

  const countableSamples = officialSamples.filter(s =>
    s.deliveryStatus === "delivered" ||
    (s.deliveryStatus === "pending" && gracePeriodActive)
  );

  const byCreator: Record<string, number> = {};
  countableSamples.forEach(s => {
    byCreator[s.username] = (byCreator[s.username] ?? 0) + s.videosPublished;
  });

  const totalCreators     = Object.keys(byCreator).length;
  const coverageCreators  = Object.values(byCreator).filter(v => v >= 1).length;
  const additionalCreators= Object.values(byCreator).filter(v => v >= 2).length;

  const coverageScore   = totalCreators > 0 ? (coverageCreators  / totalCreators) * 80 : 0;
  const additionalScore = totalCreators > 0 ? (additionalCreators / totalCreators) * 20 : 0;
  const finalScore      = coverageScore + additionalScore;

  return {
    officialSamples, pendingSamples, countableSamples,
    totalCreators, coverageCreators, additionalCreators,
    coverageScore, additionalScore, finalScore,
    bonusEst: Math.round(finalScore / 100 * IND2_MAX),
    gracePeriodActive, graceEnd, byCreator,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const YEARS  = ["2025", "2026", "2027", "2028"];
const TABS: [string, string][] = [
  ["resumen","Resumen"],["roi","ROI"],["samples","Samples"],
  ["salud","Salud TikTok"],["cumplimiento","Cumplimiento"],["settings","Settings"],
];

const cop = (n: number) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Math.round(n));
const pct  = (p: number) => `${Math.round(p * 100)}%`;
const nv   = (v: number) => (v === 0 ? "" : v);
const C = { roi:"#7c3aed", samples:"#0891b2", health:"#16a34a", operative:"#ea580c" };
const lbl: React.CSSProperties = { fontSize:"0.72rem", fontWeight:700, color:"#64748b", display:"block", marginBottom:"0.3rem", textTransform:"uppercase", letterSpacing:"0.05em" };
const qBtn: React.CSSProperties = { padding:"0.28rem 0.65rem", borderRadius:6, fontSize:"0.75rem", fontWeight:600, cursor:"pointer", border:"1px solid #e2e8f0", background:"white", color:"#64748b" };

function roiLabel(v: number) {
  if(v>=10) return { text:"Dos dígitos o más",   color:"#15803d" };
  if(v>=8)  return { text:"Buen desempeño",       color:"#16a34a" };
  if(v>=6)  return { text:"Desempeño aceptable",  color:"#ca8a04" };
  if(v>=5)  return { text:"Desempeño bajo",       color:"#d97706" };
  if(v>=4)  return { text:"Muy bajo",             color:"#dc2626" };
  return    { text:"Sin bono (< 4%)",             color:"#9ca3af" };
}

function parseDateParts(s: string) { const [y, m] = s.split("-"); return { year: y, month: Number(m) }; }

// ── Component ──────────────────────────────────────────────────────────────────
export default function StrategyDashboard() {
  const navigate = useNavigate();
  const [tab, setTab]     = useState("resumen");
  const def = getCurrentCycleDefault();
  const [year, setYear]       = useState(def.year);
  const [cycleId, setCycleId] = useState(def.cycleId);
  const [cycles, setCycles]   = useState(() => getCyclesForYear(Number(def.year)));

  const officialPeriod = useMemo(() => getCycleDatesFromId(year, cycleId), [year, cycleId]);

  const [agents,  setAgents]     = useState<Agent[]>([]);
  const [entries, setEntries]    = useState<StrategyEntry[]>([]);
  const [allSamples, setAllSamples] = useState<StrategySample[]>([]);
  const [saving,  setSaving]     = useState(false);
  const [saveErr, setSaveErr]    = useState("");

  const load = useCallback(async () => {
    const [ags, ens] = await Promise.all([getAgents("APT"), getStrategyEntries(year, cycleId)]);
    setAgents(ags); setEntries(ens);
  }, [year, cycleId]);

  const loadSamples = useCallback(async () => {
    setAllSamples(await getStrategySamples());
  }, []);

  useEffect(() => { load(); },        [load]);
  useEffect(() => { loadSamples(); }, [loadSamples]);

  // Samples stats (creator-based, official period)
  const stats = useMemo(
    () => computeSamplesStats(allSamples, year, cycleId, officialPeriod),
    [allSamples, year, cycleId, officialPeriod],
  );

  // ── Entry drafts (QA included)
  type Draft = Omit<StrategyEntry, "id" | "bonusSamplesLocked" | "bonusSamplesLockedAt" | "bonusSamplesLockedAmount">;
  type QaState = Record<string, QaAnswer>;

  const [drafts,  setDrafts]  = useState<Record<number, Draft>>({});
  const [qaState, setQaState] = useState<Record<number, QaState>>({});

  const emptyDraft = useCallback((agentId: number): Draft =>
    ({ agentId, year, cycleId, roiPct:0, productScore:0, nonBuyerFaultRate:0,
       negativeReviewRate:0, operativeCompliancePct:0, operativeQa:{} }),
  [year, cycleId]);

  useEffect(() => {
    const d: Record<number, Draft> = {};
    const q: Record<number, QaState> = {};
    agents.forEach(ag => {
      const ex = entries.find(e => e.agentId === ag.id);
      d[ag.id] = ex
        ? { agentId:ag.id, year, cycleId, roiPct:ex.roiPct, productScore:ex.productScore,
            nonBuyerFaultRate:ex.nonBuyerFaultRate, negativeReviewRate:ex.negativeReviewRate,
            operativeCompliancePct:ex.operativeCompliancePct, operativeQa:ex.operativeQa }
        : emptyDraft(ag.id);
      const savedQa: QaState = {};
      QA_ITEMS.forEach(({ key }) => { savedQa[key] = (ex?.operativeQa?.[key] as QaAnswer) ?? ""; });
      q[ag.id] = savedQa;
    });
    setDrafts(d); setQaState(q);
  }, [agents, entries, year, cycleId, emptyDraft]);

  const setF = (agId: number, field: keyof Pick<Draft,"roiPct"|"productScore"|"nonBuyerFaultRate"|"negativeReviewRate"|"operativeCompliancePct">, val: number) =>
    setDrafts(p => ({ ...p, [agId]: { ...p[agId], [field]: val } }));

  const setQa = (agId: number, key: string, answer: QaAnswer) => {
    const updated = { ...qaState[agId], [key]: answer };
    setQaState(p => ({ ...p, [agId]: updated }));
    setDrafts(p => ({ ...p, [agId]: { ...p[agId], operativeCompliancePct: qaToCompliancePct(updated), operativeQa: updated } }));
  };

  const saveEntry = async (agentId: number) => {
    const d = drafts[agentId]; if (!d) return;
    setSaving(true); setSaveErr("");
    try { await upsertStrategyEntry(d as any); await load(); }
    catch (err: any) { setSaveErr(err?.message ?? "Error al guardar. Verifica las políticas RLS en Supabase."); }
    finally { setSaving(false); }
  };

  const currentCycleName = cycles.find(c => c.id === cycleId)?.name ?? cycleId;

  // ── Samples local state ────────────────────────────────────────────────────
  const [filterUser,   setFilterUser]   = useState("");
  const [filterSku,    setFilterSku]    = useState("");
  const [filterStatus, setFilterStatus] = useState<"all"|"delivered"|"pending">("all");
  const [viewMode,     setViewMode]     = useState<"samples"|"creators">("samples");
  const [showBanner,   setShowBanner]   = useState(true);

  const [showAdd,  setShowAdd]  = useState(false);
  const [editing,  setEditing]  = useState<StrategySample | null>(null);
  const [sErr,     setSErr]     = useState("");
  const [sSaving,  setSSaving]  = useState(false);

  const [newS, setNewS] = useState({ username:"", sku:"", sentDate:"", videosPublished:0, notes:"", deliveryStatus:"delivered" as "delivered"|"pending" });

  // Password prompts
  const [delPw,  setDelPw]  = useState<{ id:number; pw:string; err:string } | null>(null);
  const [movePw, setMovePw] = useState<{ id:number; pw:string; err:string } | null>(null);
  const [lockPw, setLockPw] = useState<{ agId:number; action:"lock"|"unlock"; pw:string; err:string } | null>(null);

  // Sync local filter from/to are not needed — we filter on officialSamples directly
  const tableRows = stats.officialSamples
    .filter(s => filterStatus === "all" || s.deliveryStatus === filterStatus)
    .filter(s => !filterUser || s.username.toLowerCase().includes(filterUser.toLowerCase()))
    .filter(s => !filterSku  || s.sku.toLowerCase().includes(filterSku.toLowerCase()));

  // Creator summary for "creators" view
  const creatorRows = Object.entries(stats.byCreator).map(([username, totalVideos]) => ({
    username, totalVideos,
    coverage:   totalVideos >= 1,
    additional: totalVideos >= 2,
    samples: stats.countableSamples.filter(s => s.username === username),
  })).sort((a, b) => b.totalVideos - a.totalVideos);

  const submitSample = async (e: React.FormEvent) => {
    e.preventDefault(); setSErr("");
    if (!newS.username.trim() || !newS.sku.trim() || !newS.sentDate) { setSErr("Completa todos los campos requeridos."); return; }
    const agentId = agents[0]?.id;
    if (!agentId) { setSErr("No hay agentes. Ve a Settings primero."); return; }
    const { year: sy, month: sm } = parseDateParts(newS.sentDate);
    setSSaving(true);
    try {
      await createStrategySample({ agentId, username:newS.username.trim(), sku:newS.sku.trim(),
        sentDate:newS.sentDate, videosPublished:newS.videosPublished, year:sy, month:sm,
        notes:newS.notes, deliveryStatus:newS.deliveryStatus });
      setNewS({ username:"", sku:"", sentDate:"", videosPublished:0, notes:"", deliveryStatus:"delivered" });
      setShowAdd(false);
      await loadSamples();
    } catch(err: any) { setSErr(err?.message ?? "Error al guardar."); }
    finally { setSSaving(false); }
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editing) return;
    setSSaving(true);
    try {
      await updateStrategySample(editing.id, {
        username:editing.username, sku:editing.sku, sentDate:editing.sentDate,
        videosPublished:editing.videosPublished, notes:editing.notes, deliveryStatus:editing.deliveryStatus,
      });
      setEditing(null); await loadSamples();
    } catch(err: any) { setSErr(err?.message ?? "Error al guardar."); }
    finally { setSSaving(false); }
  };

  const markDelivered = async (id: number) => {
    await updateStrategySample(id, { deliveryStatus: "delivered" });
    await loadSamples();
  };

  const confirmDelete = async (id: number, pw: string) => {
    if (!verifySuperAdmin("APT", pw)) { setDelPw({ id, pw, err:"Contraseña incorrecta." }); return; }
    await deleteStrategySample(id);
    setDelPw(null);
    await loadSamples();
  };

  const confirmMove = async (id: number, pw: string) => {
    if (!verifySuperAdmin("APT", pw)) { setMovePw({ id, pw, err:"Contraseña incorrecta." }); return; }
    const nextKey = getNextCycleKey(year, cycleId);
    await updateStrategySample(id, { bonusCycleKey: nextKey });
    setMovePw(null);
    await loadSamples();
  };

  const confirmLock = async (agId: number, action: "lock"|"unlock", pw: string) => {
    if (!verifySuperAdmin("APT", pw)) { setLockPw({ agId, action, pw, err:"Contraseña incorrecta." }); return; }
    if (action === "lock") {
      await lockSampleBonus(agId, year, cycleId, stats.bonusEst);
    } else {
      await unlockSampleBonus(agId, year, cycleId);
    }
    setLockPw(null);
    await load();
  };

  // Settings state
  const [agentNames, setAgentNames] = useState<Record<number,string>>({});
  useEffect(() => { const n:Record<number,string>={};agents.forEach(a=>{n[a.id]=a.name;});setAgentNames(n); }, [agents]);
  const saveAgentName = async (id: number) => { await updateAgentName(id,agentNames[id]); await load(); };
  const [addPw,setAddPw]=useState(""); const [addPwErr,setAddPwErr]=useState(""); const [addVer,setAddVer]=useState(false);
  const [newName,setNewName]=useState(""); const [addSaving,setAddSaving]=useState(false);
  const checkAdmin=(e:React.FormEvent)=>{e.preventDefault();if(verifySuperAdmin("APT",addPw)){setAddVer(true);setAddPwErr("");}else setAddPwErr("Contraseña incorrecta.");};
  const submitAgent=async(e:React.FormEvent)=>{e.preventDefault();if(!newName.trim())return;setAddSaving(true);try{await createAgent(newName.trim(),"APT");await load();setNewName("");setAddVer(false);setAddPw("");}finally{setAddSaving(false);}};

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <nav className="top-nav">
        <div className="logo">FTC Hub — <span style={{color:"#6366f1"}}>Strategy Team</span></div>
        <ul className="nav-links">
          {TABS.map(([k,l]) => (
            <li key={k} className={tab===k?"active":""} onClick={()=>setTab(k)}>{l}</li>
          ))}
        </ul>
        <div style={{display:"flex",gap:"0.5rem",alignItems:"center"}}>
          <select className="month-selector" value={year} onChange={e=>{const y=e.target.value;setYear(y);setCycles(getCyclesForYear(Number(y)));setCycleId("0");}}>
            {YEARS.map(y=><option key={y}>{y}</option>)}
          </select>
          <select className="month-selector" value={cycleId} onChange={e=>setCycleId(e.target.value)}>
            {cycles.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn btn-secondary btn-sm" onClick={()=>{sessionStorage.clear();navigate("/");}}>Logout</button>
        </div>
      </nav>

      <main className="content-area">

        {/* ═══ RESUMEN ════════════════════════════════════════════════════════ */}
        {tab==="resumen" && (
          <section>
            <header className="section-header"><h2>Resumen de Bonus — {currentCycleName}</h2></header>
            {saveErr && <ErrBox msg={saveErr} />}
            {agents.length===0 ? (
              <EmptyCard msg="No hay agentes. Ve a Settings." />
            ) : agents.map(ag => {
              const entry = entries.find(e => e.agentId === ag.id);
              const b     = entry ? calcBonus(entry, stats.finalScore) : null;
              return (
                <div key={ag.id} style={{maxWidth:860,margin:"0 auto 2rem"}}>
                  <h3 style={{fontWeight:800,fontSize:"1.1rem",color:"#1e293b",marginBottom:"1rem",textAlign:"center"}}>{ag.name}</h3>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"0.75rem",marginBottom:"1.25rem"}}>
                    <SummaryBox label="Bono Base"     value={BONO_BASE}          color="#15803d" sub="Garantizado" />
                    <SummaryBox label="Bono Variable"  value={b?.bonoVariable??0} color="#6366f1" sub={`de $${cop(650_000)} máx`} />
                    <SummaryBox label="Total Estimado" value={b?.total??BONO_BASE} color="#1d4ed8" sub="Base + Variable" large />
                  </div>
                  {!entry ? (
                    <EmptyCard msg="Sin datos para este ciclo. Registra los indicadores en los tabs correspondientes." />
                  ) : (
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.75rem"}}>
                      <IndSummaryCard num="1" weight="40%" label="ROI Programa Afiliados" earned={b!.ind1} max={IND1_MAX} color={C.roi}
                        scalePct={roiScale(entry.roiPct)}
                        detail={`ROI del ciclo: ${entry.roiPct}%`} />
                      <IndSummaryCard num="2" weight="30%" label="Samples con Contenido" earned={b!.ind2} max={IND2_MAX} color={C.samples}
                        scalePct={stats.finalScore/100}
                        detail={`Score: ${stats.finalScore.toFixed(1)}pts · Coverage: ${stats.coverageCreators}/${stats.totalCreators} creadores`}
                        locked={entry.bonusSamplesLocked}
                        lockedAmount={entry.bonusSamplesLockedAmount} />
                      <IndSummaryCard num="3" weight="20%" label="Salud Cuenta TikTok" earned={b!.ind3} max={IND3_MAX} color={C.health}
                        scalePct={b!.pA*0.05+b!.pB*0.50+b!.pC*0.45}
                        detail={`Score ${entry.productScore} · NBFR ${entry.nonBuyerFaultRate}% · NRR ${entry.negativeReviewRate}%`} />
                      <IndSummaryCard num="4" weight="10%" label="Cumplimiento Operativo" earned={b!.ind4} max={IND4_MAX} color={C.operative}
                        scalePct={operativeScale(entry.operativeCompliancePct)}
                        detail={`${Math.round(entry.operativeCompliancePct)}% cumplimiento`} />
                    </div>
                  )}
                  <div style={{marginTop:"0.75rem",padding:"0.55rem 1rem",background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,fontSize:"0.75rem",color:"#94a3b8",textAlign:"center"}}>
                    Período oficial: {officialPeriod.from} → {officialPeriod.to}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* ═══ ROI ════════════════════════════════════════════════════════════ */}
        {tab==="roi" && (
          <section>
            <header className="section-header">
              <div><h2>ROI Mensual — Programa de Afiliados</h2>
                <p style={{color:"var(--text-muted)",fontSize:"0.85rem",margin:0}}>Indicador #1 · 40% del bono variable · Máx $260.000 COP</p>
              </div>
            </header>
            <div className="card" style={{marginBottom:"1.25rem",background:"#faf5ff",border:"1px solid #e9d5ff"}}>
              <p style={{fontWeight:700,fontSize:"0.75rem",color:"#7c3aed",marginBottom:"0.75rem",textTransform:"uppercase",letterSpacing:"0.06em"}}>Escala de desempeño</p>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"0.5rem"}}>
                {[{r:"≥ 10%",d:"Dos dígitos",p:"100%",b:"$260.000",c:"#15803d"},{r:"8–9.99%",d:"Buen desempeño",p:"70%",b:"$182.000",c:"#16a34a"},
                  {r:"6–7.99%",d:"Aceptable",p:"40%",b:"$104.000",c:"#ca8a04"},{r:"5–5.99%",d:"Bajo",p:"30%",b:"$78.000",c:"#d97706"},
                  {r:"4–4.99%",d:"Muy bajo",p:"20%",b:"$52.000",c:"#dc2626"},{r:"1–3.99%",d:"Sin bono",p:"0%",b:"$0",c:"#9ca3af"},
                ].map(t=>(
                  <div key={t.r} style={{border:`1px solid ${t.c}30`,borderLeft:`3px solid ${t.c}`,borderRadius:8,padding:"0.55rem 0.75rem"}}>
                    <div style={{fontWeight:800,fontSize:"0.9rem",color:t.c}}>{t.r}</div>
                    <div style={{fontSize:"0.72rem",color:"#64748b"}}>{t.d} · {t.p}</div>
                    <div style={{fontWeight:700,fontSize:"0.85rem",color:"#1e293b",marginTop:"0.15rem"}}>{t.b} COP</div>
                  </div>
                ))}
              </div>
            </div>
            {saveErr && <ErrBox msg={saveErr} />}
            {agents.map(ag=>{
              const d = drafts[ag.id]; if(!d) return null;
              const rl = roiLabel(d.roiPct);
              return (
                <div key={ag.id} className="card" style={{marginBottom:"1rem"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.25rem",flexWrap:"wrap",gap:"0.5rem"}}>
                    <div><h3 style={{margin:0,color:"#4f46e5"}}>{ag.name}</h3>
                      <p style={{margin:0,fontSize:"0.8rem",color:"var(--text-muted)"}}>Ciclo: {currentCycleName}</p>
                    </div>
                    <div style={{display:"flex",gap:"0.75rem",alignItems:"center"}}>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:"0.7rem",color:rl.color,fontWeight:700,textTransform:"uppercase"}}>{rl.text}</div>
                        <div style={{fontSize:"1.15rem",fontWeight:800,color:C.roi}}>${cop(IND1_MAX*roiScale(d.roiPct))} COP</div>
                      </div>
                      <button className="btn btn-primary btn-sm" onClick={()=>saveEntry(ag.id)} disabled={saving}>{saving?"...":"Guardar"}</button>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:"1.5rem",alignItems:"flex-end",flexWrap:"wrap"}}>
                    <div><label style={lbl}>ROI del ciclo (%)</label>
                      <input type="number" min={0} max={100} step={0.01} className="form-control"
                        style={{maxWidth:160,fontSize:"1.3rem",fontWeight:700,textAlign:"center"}}
                        value={nv(d.roiPct)} onChange={e=>setF(ag.id,"roiPct",parseFloat(e.target.value)||0)} />
                    </div>
                    <div style={{flex:1,minWidth:200}}>
                      <div style={{height:10,background:"#e2e8f0",borderRadius:5,overflow:"hidden",marginBottom:"0.5rem"}}>
                        <div style={{width:`${Math.min(100,(d.roiPct/10)*100)}%`,height:"100%",background:rl.color,transition:"width 0.3s",borderRadius:5}} />
                      </div>
                      <div style={{fontSize:"0.75rem",color:"#64748b"}}>{pct(roiScale(d.roiPct))} del bono máximo · Máx ${cop(IND1_MAX)} COP</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* ═══ SAMPLES ════════════════════════════════════════════════════════ */}
        {tab==="samples" && (
          <section>
            <header className="section-header">
              <div><h2>Sample Content Performance</h2>
                <p style={{color:"var(--text-muted)",fontSize:"0.85rem",margin:0}}>Indicador #2 · 30% del bono variable · Máx $195.000 COP · Por creador (Coverage 80pts + Additional 20pts)</p>
              </div>
            </header>

            {/* Official period banner */}
            <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:10,marginBottom:"1.1rem",overflow:"hidden"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.6rem 1.1rem",cursor:"pointer"}} onClick={()=>setShowBanner(v=>!v)}>
                <div style={{display:"flex",gap:"1rem",alignItems:"center"}}>
                  <span style={{fontWeight:700,fontSize:"0.72rem",color:"#1d4ed8",textTransform:"uppercase",letterSpacing:"0.06em"}}>Período oficial del bono</span>
                  <span style={{fontWeight:800,fontSize:"0.95rem",color:"#1e293b"}}>{officialPeriod.from} → {officialPeriod.to}</span>
                  {stats.gracePeriodActive && <span style={{background:"#fefce8",border:"1px solid #fef08a",borderRadius:6,padding:"0.1rem 0.5rem",fontSize:"0.72rem",color:"#854d0e",fontWeight:600}}>⏳ Gracia hasta {stats.graceEnd}</span>}
                </div>
                <span style={{fontSize:"0.72rem",color:"#3b82f6",fontWeight:600}}>{showBanner ? "Ocultar ▲" : "Ver detalles ▼"}</span>
              </div>
              {showBanner && (
                <div style={{padding:"0 1.1rem 0.85rem",display:"flex",gap:"1rem",alignItems:"flex-start",flexWrap:"wrap",borderTop:"1px solid #bfdbfe"}}>
                  <div style={{flex:1,minWidth:260,fontSize:"0.75rem",color:"#3b82f6",lineHeight:1.5,paddingTop:"0.65rem"}}>
                    Bonus calculations are based on all eligible samples assigned to the selected bonus period, regardless of the table filters currently applied.
                  </div>
                  {!stats.gracePeriodActive && (
                    <div style={{background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:8,padding:"0.45rem 0.8rem",fontSize:"0.75rem",color:"#64748b",fontWeight:600,marginTop:"0.65rem"}}>
                      Período de gracia terminó el {stats.graceEnd}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bonus score cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"0.65rem",marginBottom:"1.1rem"}}>
              {[
                { label:"Creadores elegibles", value:stats.totalCreators,         color:C.samples },
                { label:"Con ≥1 video (Coverage)", value:stats.coverageCreators,  color:"#15803d" },
                { label:"Con ≥2 videos (Additional)", value:stats.additionalCreators, color:"#7c3aed" },
                { label:"Score final", value:`${stats.finalScore.toFixed(1)} pts`, color:"#1d4ed8" },
                { label:"Bono estimado", value:`$${cop(stats.bonusEst)}`, color:C.operative },
              ].map(s => (
                <div key={s.label} style={{border:`1px solid ${s.color}30`,borderTop:`3px solid ${s.color}`,borderRadius:10,padding:"0.75rem 1rem",background:"white"}}>
                  <div style={{fontSize:"0.65rem",fontWeight:700,color:s.color,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"0.25rem"}}>{s.label}</div>
                  <div style={{fontSize:"1.15rem",fontWeight:800,color:"#1e293b"}}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Bonus breakdown */}
            <div className="card" style={{marginBottom:"1.1rem",background:"#f0f9ff",border:"1px solid #bae6fd"}}>
              <p style={{fontWeight:700,fontSize:"0.75rem",color:C.samples,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"0.85rem"}}>Desglose del bono</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem",marginBottom:"0.85rem"}}>
                <BonusBar label="A. Sample Coverage" weight="80 pts" description={`${stats.coverageCreators} de ${stats.totalCreators} creadores publicaron ≥1 video`}
                  rate={stats.totalCreators>0?stats.coverageCreators/stats.totalCreators:0}
                  score={stats.coverageScore} maxScore={80} color="#15803d" />
                <BonusBar label="B. Additional Content" weight="20 pts" description={`${stats.additionalCreators} de ${stats.totalCreators} creadores publicaron ≥2 videos`}
                  rate={stats.totalCreators>0?stats.additionalCreators/stats.totalCreators:0}
                  score={stats.additionalScore} maxScore={20} color="#7c3aed" />
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.65rem 0.85rem",background:"white",borderRadius:8,border:"1px solid #e0f2fe"}}>
                <div>
                  <span style={{fontSize:"0.75rem",color:"#64748b"}}>Score final = {stats.coverageScore.toFixed(1)} + {stats.additionalScore.toFixed(1)} = </span>
                  <span style={{fontWeight:800,fontSize:"1rem",color:"#1d4ed8"}}>{stats.finalScore.toFixed(1)} pts</span>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:"0.7rem",color:"#64748b"}}>Bono estimado ({stats.finalScore.toFixed(1)}% × $195.000)</div>
                  <div style={{fontWeight:800,fontSize:"1.2rem",color:C.operative}}>${cop(stats.bonusEst)} COP</div>
                </div>
              </div>
              <p style={{fontSize:"0.7rem",color:"#94a3b8",marginTop:"0.6rem",marginBottom:0}}>
                Nota: el máximo aporte por creador es 2 niveles (1 por Coverage + 1 por Additional). Videos adicionales se registran pero no generan puntos extra.
              </p>
            </div>

            {/* Pending alert */}
            {stats.pendingSamples.length > 0 && (
              <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:10,padding:"0.85rem 1.1rem",marginBottom:"1.1rem"}}>
                <p style={{fontWeight:700,fontSize:"0.82rem",color:"#9a3412",marginBottom:"0.5rem"}}>
                  ⚠ {stats.pendingSamples.length} sample{stats.pendingSamples.length>1?"s":""} pendiente{stats.pendingSamples.length>1?"s":""} de entrega
                </p>
                {stats.gracePeriodActive ? (
                  <p style={{fontSize:"0.78rem",color:"#c2410c",margin:"0 0 0.5rem"}}>Período de gracia activo — aún cuentan para el bono. Márcalos como entregados o muévelos al siguiente período.</p>
                ) : (
                  <p style={{fontSize:"0.78rem",color:"#c2410c",margin:"0 0 0.5rem"}}>Período de gracia expirado — estos samples ya no cuentan en el bono actual. Muévelos al siguiente período o elimínalos.</p>
                )}
                <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap"}}>
                  {stats.pendingSamples.map(s => (
                    <span key={s.id} style={{background:"#fee2e2",borderRadius:6,padding:"0.2rem 0.6rem",fontSize:"0.75rem",color:"#991b1b",fontWeight:600}}>{s.username} / {s.sku}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Button toggles into form in-place */}
            {!showAdd && !editing && (
              <div style={{marginBottom:"0.75rem"}}>
                <button className="btn btn-primary" onClick={()=>{setShowAdd(true);setSErr("");}}>+ Agregar Sample</button>
              </div>
            )}
            {(showAdd || editing) && (
              <div className="card" style={{marginBottom:"1rem",border:`2px solid ${C.samples}`,background:"#f0f9ff"}}>
                <h4 style={{margin:"0 0 1rem",color:C.samples}}>{editing?"Editar Sample":"Agregar Nuevo Sample"}</h4>
                {sErr && <p style={{color:"#dc2626",fontSize:"0.85rem",marginBottom:"0.75rem"}}>{sErr}</p>}
                <form onSubmit={editing?submitEdit:submitSample}>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:"0.75rem",marginBottom:"0.75rem"}}>
                    {[
                      {field:"username",label:"Username / User ID",ph:"@username",type:"text",req:true},
                      {field:"sku",label:"SKU del producto",ph:"SKU-123",type:"text",req:true},
                      {field:"sentDate",label:"Fecha de envío",ph:"",type:"date",req:true},
                      {field:"videosPublished",label:"Videos publicados",ph:"0",type:"number",req:false},
                      {field:"notes",label:"Notas",ph:"Opcional",type:"text",req:false},
                    ].map(({field,label,ph,type,req})=>(
                      <div key={field}><label style={lbl}>{label}</label>
                        <input type={type} className="form-control" placeholder={ph} required={req} min={type==="number"?0:undefined}
                          value={editing?(editing as any)[field]:(newS as any)[field]}
                          onChange={e=>{const v=type==="number"?Number(e.target.value):e.target.value;
                            editing?setEditing({...editing,[field]:v} as StrategySample):setNewS({...newS,[field]:v} as any);}} />
                      </div>
                    ))}
                    <div><label style={lbl}>Estado de entrega</label>
                      <select className="form-control"
                        value={editing?editing.deliveryStatus:newS.deliveryStatus}
                        onChange={e=>{const v=e.target.value as "delivered"|"pending";editing?setEditing({...editing,deliveryStatus:v}):setNewS({...newS,deliveryStatus:v});}}>
                        <option value="delivered">Entregado</option>
                        <option value="pending">Pendiente</option>
                      </select>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:"0.5rem"}}>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={sSaving}>{sSaving?"...":editing?"Guardar cambios":"Agregar"}</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={()=>{setShowAdd(false);setEditing(null);setSErr("");}}>Cancelar</button>
                  </div>
                </form>
              </div>
            )}

            {/* Filters */}
            <div className="card" style={{marginBottom:"1rem",padding:"0.9rem 1rem"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.6rem"}}>
                <p style={{fontWeight:700,fontSize:"0.72rem",color:"#64748b",textTransform:"uppercase",letterSpacing:"0.05em",margin:0}}>Filtros de tabla (no afectan el cálculo del bono)</p>
                <div style={{display:"flex",gap:"0.4rem"}}>
                  <button style={{...qBtn,borderColor:viewMode==="samples"?"#0891b2":"#e2e8f0",color:viewMode==="samples"?C.samples:"#64748b"}} onClick={()=>setViewMode("samples")}>Por sample</button>
                  <button style={{...qBtn,borderColor:viewMode==="creators"?"#0891b2":"#e2e8f0",color:viewMode==="creators"?C.samples:"#64748b"}} onClick={()=>setViewMode("creators")}>Por creador</button>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:"0.75rem",alignItems:"flex-end"}}>
                <div><label style={lbl}>Buscar username</label>
                  <input type="text" className="form-control" placeholder="@username..." value={filterUser} onChange={e=>setFilterUser(e.target.value)} />
                </div>
                <div><label style={lbl}>Buscar SKU</label>
                  <input type="text" className="form-control" placeholder="SKU..." value={filterSku} onChange={e=>setFilterSku(e.target.value)} />
                </div>
                <div><label style={lbl}>Estado</label>
                  <select className="form-control" value={filterStatus} onChange={e=>setFilterStatus(e.target.value as any)}>
                    <option value="all">Todos</option>
                    <option value="delivered">Entregados</option>
                    <option value="pending">Pendientes</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Password prompts */}
            {delPw && (
              <PwPrompt title="Confirmar eliminación" desc="Ingresa la contraseña de admin para eliminar."
                pw={delPw.pw} err={delPw.err} btnLabel="Eliminar" btnColor="#dc2626"
                onChange={pw=>setDelPw({...delPw,pw,err:""})}
                onConfirm={()=>confirmDelete(delPw.id,delPw.pw)}
                onCancel={()=>setDelPw(null)} />
            )}
            {movePw && (
              <PwPrompt title="Mover al siguiente período" desc={`El sample se asignará al período: ${getNextCycleKey(year,cycleId)}`}
                pw={movePw.pw} err={movePw.err} btnLabel="Mover" btnColor="#0891b2"
                onChange={pw=>setMovePw({...movePw,pw,err:""})}
                onConfirm={()=>confirmMove(movePw.id,movePw.pw)}
                onCancel={()=>setMovePw(null)} />
            )}

            {/* Table — samples view */}
            {viewMode==="samples" && (
              <div className="card" style={{overflowX:"auto"}}>
                <p style={{fontSize:"0.8rem",color:"var(--text-muted)",margin:"0 0 0.75rem"}}>{tableRows.length} resultado{tableRows.length!==1?"s":""} · período oficial: {stats.officialSamples.length} samples</p>
                {tableRows.length===0 ? (
                  <EmptyCard msg="No hay samples para este período." />
                ) : (
                  <table className="data-table">
                    <thead><tr><th>Estado</th><th>Username</th><th>SKU</th><th>Fecha envío</th><th>Videos</th><th>Aporte al bono</th><th>Notas</th><th>Acciones</th></tr></thead>
                    <tbody>
                      {tableRows.map(s => {
                        const totalForCreator = stats.byCreator[s.username] ?? 0;
                        return (
                          <tr key={s.id} style={{background:s.deliveryStatus==="pending"?"#fffbeb":undefined}}>
                            <td>
                              {s.deliveryStatus==="pending" ? (
                                <span style={{background:"#fef3c7",borderRadius:6,padding:"0.15rem 0.5rem",fontSize:"0.72rem",color:"#92400e",fontWeight:700}}>⏳ Pendiente</span>
                              ) : (
                                <span style={{background:"#f0fdf4",borderRadius:6,padding:"0.15rem 0.5rem",fontSize:"0.72rem",color:"#166534",fontWeight:700}}>✓ Entregado</span>
                              )}
                            </td>
                            <td style={{fontWeight:600}}>{s.username}</td>
                            <td><span style={{background:"#f1f5f9",borderRadius:4,padding:"0.1rem 0.45rem",fontSize:"0.8rem",fontFamily:"monospace"}}>{s.sku}</span></td>
                            <td>{s.sentDate}</td>
                            <td><span style={{fontWeight:700,color:s.videosPublished===0?"#dc2626":"#15803d"}}>{s.videosPublished===0?"0":"✓ "+s.videosPublished}</span></td>
                            <td style={{fontSize:"0.75rem"}}>
                              {totalForCreator>=2 && <span style={{color:"#7c3aed",fontWeight:600}}>Coverage + Additional</span>}
                              {totalForCreator===1 && <span style={{color:"#15803d",fontWeight:600}}>Coverage</span>}
                              {totalForCreator===0 && <span style={{color:"#94a3b8"}}>Sin cumplimiento</span>}
                            </td>
                            <td style={{color:"var(--text-muted)",fontSize:"0.8rem"}}>{s.notes||"—"}</td>
                            <td style={{whiteSpace:"nowrap",display:"flex",gap:"0.3rem",flexWrap:"wrap"}}>
                              {s.deliveryStatus==="pending" && (
                                <button className="btn btn-sm btn-secondary" onClick={()=>markDelivered(s.id)}>Entregar</button>
                              )}
                              <button className="btn btn-sm btn-secondary" onClick={()=>{setEditing(s);setShowAdd(false);setSErr("");setDelPw(null);setMovePw(null);}}>Editar</button>
                              <button className="btn btn-sm btn-secondary" style={{color:"#0891b2",borderColor:"#bae6fd"}} onClick={()=>setMovePw({id:s.id,pw:"",err:""})}>→ Sig. período</button>
                              <button className="btn btn-sm btn-danger" onClick={()=>setDelPw({id:s.id,pw:"",err:""})}>Eliminar</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Table — creators view */}
            {viewMode==="creators" && (
              <div className="card" style={{overflowX:"auto"}}>
                <p style={{fontSize:"0.8rem",color:"var(--text-muted)",margin:"0 0 0.75rem"}}>{creatorRows.length} creadores en este período (de muestras contables)</p>
                {creatorRows.length===0 ? (
                  <EmptyCard msg="No hay creadores para este período." />
                ) : (
                  <table className="data-table">
                    <thead><tr><th>Creador</th><th>Total videos</th><th>Coverage (≥1 video)</th><th>Additional (≥2 videos)</th><th>Samples enviados</th></tr></thead>
                    <tbody>
                      {creatorRows.map(r => (
                        <tr key={r.username}>
                          <td style={{fontWeight:700}}>{r.username}</td>
                          <td style={{fontWeight:700,color:r.totalVideos>0?"#15803d":"#dc2626"}}>{r.totalVideos}</td>
                          <td>{r.coverage ? <span style={{color:"#15803d",fontWeight:700}}>✓ Sí</span> : <span style={{color:"#94a3b8"}}>✗ No</span>}</td>
                          <td>{r.additional ? <span style={{color:"#7c3aed",fontWeight:700}}>✓ Sí</span> : <span style={{color:"#94a3b8"}}>✗ No</span>}</td>
                          <td style={{fontSize:"0.78rem",color:"#64748b"}}>{r.samples.map(s=>s.sku).join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Bonus authorization */}
            {agents.map(ag => {
              const entry = entries.find(e => e.agentId === ag.id);
              return (
                <div key={ag.id} className="card" style={{marginTop:"1.25rem",border:`1px solid ${entry?.bonusSamplesLocked?"#16a34a":"#e2e8f0"}`,background:entry?.bonusSamplesLocked?"#f0fdf4":"white"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"1rem",flexWrap:"wrap"}}>
                    <div>
                      <p style={{fontWeight:700,fontSize:"0.82rem",color:entry?.bonusSamplesLocked?"#15803d":"#64748b",textTransform:"uppercase",letterSpacing:"0.05em",margin:"0 0 0.3rem"}}>
                        {entry?.bonusSamplesLocked ? "🔒 Bono autorizado y bloqueado" : "Autorizar bono final"}
                      </p>
                      {entry?.bonusSamplesLocked ? (
                        <>
                          <p style={{fontSize:"1.3rem",fontWeight:800,color:"#15803d",margin:"0 0 0.2rem"}}>${cop(entry.bonusSamplesLockedAmount ?? stats.bonusEst)} COP</p>
                          <p style={{fontSize:"0.75rem",color:"#64748b",margin:0}}>Bloqueado el {entry.bonusSamplesLockedAt ? new Date(entry.bonusSamplesLockedAt).toLocaleString("es-CO") : "—"}</p>
                        </>
                      ) : (
                        <>
                          <p style={{fontSize:"1.3rem",fontWeight:800,color:C.operative,margin:"0 0 0.2rem"}}>${cop(stats.bonusEst)} COP <span style={{fontSize:"0.75rem",color:"#94a3b8",fontWeight:400}}>(calculado en vivo)</span></p>
                          <p style={{fontSize:"0.75rem",color:"#94a3b8",margin:0}}>Al bloquear se congela el monto actual.</p>
                        </>
                      )}
                    </div>
                    <div>
                      {entry?.bonusSamplesLocked ? (
                        <button className="btn btn-secondary btn-sm" onClick={()=>setLockPw({agId:ag.id,action:"unlock",pw:"",err:""})}>Desbloquear</button>
                      ) : (
                        <button className="btn btn-primary btn-sm" style={{background:"#15803d",borderColor:"#15803d"}} onClick={()=>{if(!entry){alert("Guarda primero los indicadores del período.");return;}setLockPw({agId:ag.id,action:"lock",pw:"",err:""});}}>
                          Autorizar y bloquear bono
                        </button>
                      )}
                    </div>
                  </div>
                  {lockPw && lockPw.agId === ag.id && (
                    <div style={{marginTop:"1rem"}}>
                      <PwPrompt title={lockPw.action==="lock"?"Confirmar autorización":"Confirmar desbloqueo"}
                        desc="Ingresa la contraseña de admin para continuar."
                        pw={lockPw.pw} err={lockPw.err}
                        btnLabel={lockPw.action==="lock"?"Autorizar":"Desbloquear"}
                        btnColor={lockPw.action==="lock"?"#15803d":"#0891b2"}
                        onChange={pw=>setLockPw({...lockPw,pw,err:""})}
                        onConfirm={()=>confirmLock(lockPw.agId,lockPw.action,lockPw.pw)}
                        onCancel={()=>setLockPw(null)} />
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {/* ═══ SALUD TIKTOK ═══════════════════════════════════════════════════ */}
        {tab==="salud" && (
          <section>
            <header className="section-header">
              <div><h2>Salud de la Cuenta TikTok</h2>
                <p style={{color:"var(--text-muted)",fontSize:"0.85rem",margin:0}}>Indicador #3 · 20% del bono variable · Máx $130.000 COP · Pesos: Neg. Review 45% · Non-Buyer 45% · Product Score 10%</p>
              </div>
            </header>
            {saveErr && <ErrBox msg={saveErr} />}
            {agents.map(ag=>{
              const d = drafts[ag.id]; if(!d) return null;
              const pA=productScoreScale(d.productScore), pB=nonBuyerScale(d.nonBuyerFaultRate), pC=negReviewScale(d.negativeReviewRate);
              const earned=IND3_MAX*(pA*0.05+pB*0.50+pC*0.45);
              return (
                <div key={ag.id} className="card" style={{borderTop:`3px solid ${C.health}`,marginBottom:"1rem"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.5rem",flexWrap:"wrap",gap:"0.5rem"}}>
                    <h3 style={{margin:0,color:C.health}}>{ag.name}</h3>
                    <div style={{display:"flex",gap:"0.75rem",alignItems:"center"}}>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:"0.7rem",color:"#64748b"}}>Bono estimado (de ${cop(IND3_MAX)} máx)</div>
                        <div style={{fontSize:"1.2rem",fontWeight:800,color:C.health}}>${cop(earned)} COP</div>
                      </div>
                      <button className="btn btn-primary btn-sm" onClick={()=>saveEntry(ag.id)} disabled={saving}>{saving?"...":"Guardar"}</button>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"1rem"}}>
                    <SubMetric color={C.health} label="A. Product Satisfaction Score" sublabel="Meta: ≥ 4.5 · Peso: 5%" scalePct={pA}
                      scales={[
                        {r:"≥ 4.5",   p:"100%", setVal:4.5},
                        {r:"4.3–4.49",p:"80%",  setVal:4.3},
                        {r:"4.2–4.29",p:"40%",  setVal:4.2},
                        {r:"4.1–4.19",p:"30%",  setVal:4.1},
                        {r:"< 4.1",   p:"0%",   setVal:4.0},
                      ]}
                      onSetVal={v=>setF(ag.id,"productScore",v)}>
                      <input type="number" min={0} max={5} step={0.01} className="form-control"
                        value={nv(d.productScore)} onChange={e=>setF(ag.id,"productScore",parseFloat(e.target.value)||0)} />
                    </SubMetric>
                    <SubMetric color={C.health} label="B. Non-Buyer Fault Rate" sublabel="Meta: ≤ 2.10% · Peso: 50%" scalePct={pB}
                      scales={[
                        {r:"≤ 2.10%",    p:"100%", setVal:2.10},
                        {r:"2.11–2.20%", p:"80%",  setVal:2.15},
                        {r:"2.21–2.30%", p:"60%",  setVal:2.25},
                        {r:"2.31–2.50%", p:"50%",  setVal:2.40},
                        {r:"> 2.50%",    p:"0%",   setVal:2.60},
                      ]}
                      onSetVal={v=>setF(ag.id,"nonBuyerFaultRate",v)}>
                      <div style={{display:"flex",gap:"0.4rem",alignItems:"center"}}>
                        <input type="number" min={0} max={20} step={0.01} className="form-control"
                          value={nv(d.nonBuyerFaultRate)} onChange={e=>setF(ag.id,"nonBuyerFaultRate",parseFloat(e.target.value)||0)} />
                        <span style={{fontSize:"0.85rem",color:"#64748b"}}>%</span>
                      </div>
                    </SubMetric>
                    <SubMetric color={C.health} label="C. Negative Review Rate" sublabel="Meta: < 0.55% · Peso: 45%" scalePct={pC}
                      scales={[
                        {r:"< 0.55%",    p:"100%", setVal:0.40},
                        {r:"0.55–0.90%", p:"75%",  setVal:0.70},
                        {r:"0.91–1.30%", p:"50%",  setVal:1.10},
                        {r:"1.31–1.60%", p:"25%",  setVal:1.45},
                        {r:"> 1.60%",    p:"0%",   setVal:1.70},
                      ]}
                      onSetVal={v=>setF(ag.id,"negativeReviewRate",v)}>
                      <div style={{display:"flex",gap:"0.4rem",alignItems:"center"}}>
                        <input type="number" min={0} max={10} step={0.01} className="form-control"
                          value={nv(d.negativeReviewRate)} onChange={e=>setF(ag.id,"negativeReviewRate",parseFloat(e.target.value)||0)} />
                        <span style={{fontSize:"0.85rem",color:"#64748b"}}>%</span>
                      </div>
                    </SubMetric>
                  </div>
                  <div style={{marginTop:"1rem",padding:"0.65rem 1rem",background:"#f0fdf4",borderRadius:8,fontSize:"0.78rem",color:"#166534",border:"1px solid #bbf7d0"}}>
                    Score ponderado: Neg.Review {pct(pC)}×45% + Non-Buyer {pct(pB)}×50% + Product {pct(pA)}×5% → {pct(pA*0.05+pB*0.50+pC*0.45)} · Valores en 0 = sin dato
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* ═══ CUMPLIMIENTO ═══════════════════════════════════════════════════ */}
        {tab==="cumplimiento" && (
          <section>
            <header className="section-header">
              <div><h2>Cumplimiento Operativo</h2>
                <p style={{color:"var(--text-muted)",fontSize:"0.85rem",margin:0}}>Indicador #4 · 10% del bono variable · Máx $65.000 COP · Sí=100% · Más o menos=50% · No=0%</p>
              </div>
            </header>
            {saveErr && <ErrBox msg={saveErr} />}
            {agents.map(ag=>{
              const d  = drafts[ag.id]; if(!d) return null;
              const qa = qaState[ag.id] ?? {};
              const compliancePct = qaToCompliancePct(qa);
              const earned = IND4_MAX * operativeScale(compliancePct);
              const answeredCount = QA_ITEMS.filter(({key})=>qa[key]==="si"||qa[key]==="masomenos"||qa[key]==="no").length;
              return (
                <div key={ag.id} className="card" style={{borderTop:`3px solid ${C.operative}`,marginBottom:"1rem"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.5rem",flexWrap:"wrap",gap:"0.5rem"}}>
                    <div>
                      <h3 style={{margin:0,color:C.operative}}>{ag.name}</h3>
                      <p style={{margin:0,fontSize:"0.8rem",color:"var(--text-muted)"}}>{answeredCount}/{QA_ITEMS.length} preguntas respondidas</p>
                    </div>
                    <div style={{display:"flex",gap:"0.75rem",alignItems:"center"}}>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:"0.85rem",color:C.operative,fontWeight:700}}>{Math.round(compliancePct)}% cumplimiento</div>
                        <div style={{fontSize:"1.2rem",fontWeight:800,color:C.operative}}>${cop(earned)} de ${cop(IND4_MAX)} COP</div>
                      </div>
                      <button className="btn btn-primary btn-sm" onClick={()=>saveEntry(ag.id)} disabled={saving}>{saving?"...":"Guardar"}</button>
                    </div>
                  </div>
                  <div style={{height:8,background:"#e2e8f0",borderRadius:4,overflow:"hidden",marginBottom:"1.25rem"}}>
                    <div style={{width:`${compliancePct}%`,height:"100%",background:C.operative,transition:"width 0.3s",borderRadius:4}} />
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:"0.6rem"}}>
                    {QA_ITEMS.map(({key,label},i)=>{
                      const ans = qa[key] ?? "";
                      return (
                        <div key={key} style={{display:"grid",gridTemplateColumns:"1fr auto",gap:"1rem",alignItems:"center",padding:"0.65rem 0.85rem",background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0"}}>
                          <div style={{fontSize:"0.85rem",fontWeight:600,color:"#1e293b"}}>
                            <span style={{fontSize:"0.7rem",color:"#94a3b8",marginRight:"0.4rem"}}>#{i+1}</span>{label}
                          </div>
                          <div style={{display:"flex",gap:"0.35rem"}}>
                            {(["si","masomenos","no"] as QaAnswer[]).map(opt=>(
                              <button key={opt} onClick={()=>setQa(ag.id,key,opt)}
                                style={{padding:"0.3rem 0.7rem",borderRadius:6,fontSize:"0.78rem",fontWeight:600,cursor:"pointer",
                                  border:`2px solid ${ans===opt?(opt==="si"?"#15803d":opt==="masomenos"?"#d97706":"#dc2626"):"#e2e8f0"}`,
                                  background:ans===opt?(opt==="si"?"#f0fdf4":opt==="masomenos"?"#fffbeb":"#fef2f2"):"white",
                                  color:ans===opt?(opt==="si"?"#15803d":opt==="masomenos"?"#d97706":"#dc2626"):"#64748b"}}>
                                {opt==="si"?"✓ Sí":opt==="masomenos"?"~ Más o menos":"✗ No"}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{marginTop:"1rem",padding:"0.6rem 0.85rem",background:"#fff7ed",borderRadius:8,border:"1px solid #fed7aa",fontSize:"0.75rem",color:"#9a3412"}}>
                    Cada pregunta vale 1/7 del cumplimiento total. Sí=100% · Más o menos=50% · No=0%.
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* ═══ SETTINGS ═══════════════════════════════════════════════════════ */}
        {tab==="settings" && (
          <section>
            <header className="section-header"><h2>Settings</h2></header>
            <div className="card">
              <h3 style={{marginBottom:"1rem"}}>Team Members</h3>
              {agents.map(ag=>(
                <div key={ag.id} className="form-group" style={{display:"flex",gap:"0.5rem",alignItems:"flex-end"}}>
                  <div style={{flex:1}}><label>{ag.name}</label>
                    <input type="text" className="form-control" value={agentNames[ag.id]??""} onChange={e=>setAgentNames({...agentNames,[ag.id]:e.target.value})} />
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={()=>saveAgentName(ag.id)}>Save</button>
                </div>
              ))}
            </div>
            <div className="card">
              <h3 style={{marginBottom:"0.25rem"}}>Agregar Miembro</h3>
              <p style={{fontSize:"0.85rem",color:"var(--text-muted)",marginBottom:"1rem"}}>Requiere contraseña admin + <code>!</code></p>
              {!addVer ? (
                <form onSubmit={checkAdmin} style={{display:"flex",gap:"0.5rem",alignItems:"flex-end",maxWidth:400}}>
                  <div style={{flex:1}}><label style={{fontSize:"0.85rem",fontWeight:500}}>Admin Password</label>
                    <input type="password" className="form-control" value={addPw} onChange={e=>{setAddPw(e.target.value);setAddPwErr("");}} />
                    {addPwErr && <p className="error-msg">{addPwErr}</p>}
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm">Verificar</button>
                </form>
              ) : (
                <form onSubmit={submitAgent} style={{display:"flex",gap:"0.5rem",alignItems:"flex-end",maxWidth:400}}>
                  <div style={{flex:1}}><label style={{fontSize:"0.85rem",fontWeight:500}}>Nombre</label>
                    <input type="text" className="form-control" value={newName} onChange={e=>setNewName(e.target.value)} autoFocus required />
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={addSaving}>{addSaving?"...":"Agregar"}</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={()=>{setAddVer(false);setAddPw("");}}>Cancelar</button>
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
function ErrBox({ msg }: { msg: string }) {
  return <div style={{marginBottom:"1rem",padding:"0.75rem 1rem",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,color:"#dc2626",fontSize:"0.85rem"}}>{msg}</div>;
}
function EmptyCard({ msg }: { msg: string }) {
  return <div className="card" style={{textAlign:"center",padding:"2.5rem",color:"var(--text-muted)"}}>{msg}</div>;
}

function PwPrompt({ title, desc, pw, err, btnLabel, btnColor, onChange, onConfirm, onCancel }:
  { title:string; desc:string; pw:string; err:string; btnLabel:string; btnColor:string; onChange:(pw:string)=>void; onConfirm:()=>void; onCancel:()=>void }) {
  return (
    <div className="card" style={{border:"2px solid #dc2626",background:"#fef2f2",marginBottom:"1rem"}}>
      <h4 style={{margin:"0 0 0.35rem",color:"#dc2626"}}>{title}</h4>
      <p style={{fontSize:"0.82rem",color:"#64748b",margin:"0 0 0.6rem"}}>{desc}</p>
      {err && <p style={{color:"#dc2626",fontSize:"0.82rem",margin:"0 0 0.5rem"}}>{err}</p>}
      <div style={{display:"flex",gap:"0.5rem",alignItems:"center"}}>
        <input type="password" className="form-control" style={{maxWidth:220}} placeholder="Contraseña admin"
          value={pw} onChange={e=>onChange(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onConfirm()} autoFocus />
        <button className="btn btn-sm" style={{background:btnColor,color:"white",border:"none"}} onClick={onConfirm}>{btnLabel}</button>
        <button className="btn btn-sm btn-secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

function BonusBar({ label, weight, description, rate, score, maxScore, color }:
  { label:string; weight:string; description:string; rate:number; score:number; maxScore:number; color:string }) {
  return (
    <div style={{background:"white",borderRadius:10,padding:"1rem",border:`1px solid ${color}20`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:"0.3rem"}}>
        <span style={{fontWeight:700,fontSize:"0.82rem",color:"#1e293b"}}>{label}</span>
        <span style={{fontSize:"0.72rem",color,fontWeight:700}}>máx {weight}</span>
      </div>
      <div style={{fontSize:"0.75rem",color:"#64748b",marginBottom:"0.6rem"}}>{description}</div>
      <div style={{height:8,background:"#e2e8f0",borderRadius:4,overflow:"hidden",marginBottom:"0.4rem"}}>
        <div style={{width:`${rate*100}%`,height:"100%",background:color,transition:"width 0.4s",borderRadius:4}} />
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.75rem"}}>
        <span style={{color:"#64748b"}}>{Math.round(rate*100)}% de creadores</span>
        <span style={{fontWeight:700,color}}>{score.toFixed(1)} / {maxScore} pts</span>
      </div>
    </div>
  );
}

function SummaryBox({ label, value, color, sub, large }:{ label:string; value:number; color:string; sub:string; large?:boolean }) {
  return (
    <div style={{border:`1px solid ${color}25`,borderTop:`3px solid ${color}`,borderRadius:12,padding:"1.1rem 1.25rem",background:"white",textAlign:"center"}}>
      <div style={{fontSize:"0.7rem",fontWeight:700,color,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"0.4rem"}}>{label}</div>
      <div style={{fontSize:large?"1.5rem":"1.25rem",fontWeight:800,color:large?color:"#1e293b"}}>
        ${new Intl.NumberFormat("es-CO",{maximumFractionDigits:0}).format(Math.round(value))}
        <span style={{fontSize:"0.7rem",fontWeight:400,color:"#94a3b8",marginLeft:3}}>COP</span>
      </div>
      <div style={{fontSize:"0.72rem",color:"#94a3b8",marginTop:"0.3rem"}}>{sub}</div>
    </div>
  );
}

function IndSummaryCard({ num, weight, label, earned, max, color, scalePct, detail, locked, lockedAmount }:
  { num:string; weight:string; label:string; earned:number; max:number; color:string; scalePct:number; detail:string; locked?:boolean; lockedAmount?:number }) {
  const displayEarned = locked && lockedAmount != null ? lockedAmount : Math.round(earned);
  return (
    <div style={{border:`1px solid ${color}20`,borderTop:`3px solid ${color}`,borderRadius:10,padding:"1rem 1.1rem",background:"white",position:"relative"}}>
      {locked && <span style={{position:"absolute",top:"0.6rem",right:"0.75rem",fontSize:"0.65rem",background:"#f0fdf4",color:"#15803d",border:"1px solid #bbf7d0",borderRadius:4,padding:"0.1rem 0.4rem",fontWeight:700}}>🔒 Bloqueado</span>}
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:"0.3rem"}}>
        <span style={{fontSize:"0.65rem",fontWeight:800,color,textTransform:"uppercase"}}>#{num} · {weight}</span>
        <span style={{fontSize:"0.65rem",color:"#94a3b8"}}>máx ${new Intl.NumberFormat("es-CO",{maximumFractionDigits:0}).format(max)}</span>
      </div>
      <div style={{fontSize:"0.82rem",fontWeight:700,color:"#1e293b",marginBottom:"0.5rem"}}>{label}</div>
      <div style={{height:6,background:"#e2e8f0",borderRadius:3,overflow:"hidden",marginBottom:"0.5rem"}}>
        <div style={{width:`${Math.min(100,scalePct*100)}%`,height:"100%",background:color,transition:"width 0.4s",borderRadius:3}} />
      </div>
      <div style={{fontSize:"0.7rem",color:"#64748b",marginBottom:"0.4rem"}}>{detail}</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
        <div style={{fontSize:"1.05rem",fontWeight:800,color}}>${new Intl.NumberFormat("es-CO",{maximumFractionDigits:0}).format(displayEarned)}</div>
        <div style={{fontSize:"0.7rem",color:"#94a3b8"}}>{Math.round(scalePct*100)}%</div>
      </div>
    </div>
  );
}

function SubMetric({ color, label, sublabel, scalePct, scales, onSetVal, children }:
  { color:string; label:string; sublabel:string; scalePct:number; scales:{r:string;p:string;setVal?:number}[]; onSetVal?:(v:number)=>void; children:React.ReactNode }) {
  return (
    <div style={{background:"#f8fafc",borderRadius:10,padding:"1rem",border:`1px solid ${color}20`}}>
      <div style={{fontSize:"0.8rem",fontWeight:700,color:"#1e293b",marginBottom:"0.15rem"}}>{label}</div>
      <div style={{fontSize:"0.7rem",color:"#64748b",marginBottom:"0.75rem"}}>{sublabel}</div>
      {children}
      <div style={{height:6,background:"#e2e8f0",borderRadius:3,overflow:"hidden",margin:"0.6rem 0 0.4rem"}}>
        <div style={{width:`${scalePct*100}%`,height:"100%",background:color,transition:"width 0.3s",borderRadius:3}} />
      </div>
      <div style={{fontSize:"0.7rem",color,fontWeight:700,marginBottom:"0.5rem"}}>{Math.round(scalePct*100)}% de este sub-indicador</div>
      {onSetVal && <div style={{fontSize:"0.6rem",color:"#94a3b8",marginBottom:"0.35rem"}}>Clic para autocompletar →</div>}
      <div style={{display:"flex",flexDirection:"column",gap:"0.2rem"}}>
        {scales.map(s=>{
          const clickable = onSetVal && s.setVal != null;
          return (
            <div key={s.r}
              onClick={clickable ? ()=>onSetVal!(s.setVal!) : undefined}
              style={{display:"flex",justifyContent:"space-between",fontSize:"0.68rem",padding:"0.2rem 0.4rem",borderRadius:4,
                cursor:clickable?"pointer":"default",
                color:clickable?"#374151":"#64748b",
                border:clickable?"1px solid #e2e8f0":"1px solid transparent",
                background:"white",transition:"background 0.15s"}}>
              <span>{s.r}</span>
              <span style={{fontWeight:700,color:clickable?color:"#64748b"}}>{s.p}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
