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
  ["salud", "Salud TikTok"],
  ["cumplimiento", "Cumplimiento"],
  ["settings", "Settings"],
];

// ── Bonus constants ────────────────────────────────────────────────────────────
const BONO_BASE   = 300_000;
const IND1_MAX    = 260_000;
const IND2_MAX    = 195_000;
const IND3_MAX    = 130_000;
const IND4_MAX    =  65_000;

function roiScale(v: number)   { if(v>=10)return 1;if(v>=8)return .70;if(v>=6)return .40;if(v>=5)return .30;if(v>=4)return .20;return 0; }
function samplesScale(v: number){ if(v>=100)return 1;if(v>=80)return .80;if(v>=60)return .60;if(v>=40)return .40;if(v>=20)return .20;return 0; }

// Treat 0 as "no data" for sub-metrics where 0 happens to be a valid "perfect" value
function productScoreScale(v: number){ if(v<=0)return 0;if(v>=4.6)return 1;if(v>=4.5)return .80;if(v>=4.3)return .60;if(v>=4.2)return .30;if(v>=4.1)return .10;return 0; }
function nonBuyerScale(v: number)    { if(v<=0)return 0;if(v<=2)return 1;if(v<=2.5)return .50;return 0; }
function negReviewScale(v: number)   { if(v<=0)return 0;if(v<=0.45)return 1;if(v<=0.80)return .50;if(v<=1.20)return .25;return 0; }
function operativeScale(v: number)   { if(v>=100)return 1;if(v>=80)return .75;if(v>=60)return .50;if(v>=40)return .25;return 0; }

function calcBonus(e: StrategyEntry, samplesPct: number) {
  const ind1 = IND1_MAX * roiScale(e.roiPct);
  const ind2 = IND2_MAX * samplesScale(samplesPct);
  const pA = productScoreScale(e.productScore);
  const pB = nonBuyerScale(e.nonBuyerFaultRate);
  const pC = negReviewScale(e.negativeReviewRate);
  const healthCount = [pA > 0, pB > 0, pC > 0].filter(Boolean).length;
  const ind3 = healthCount > 0 ? IND3_MAX * ((pA + pB + pC) / 3) : 0;
  const ind4  = IND4_MAX * operativeScale(e.operativeCompliancePct);
  const bonoVariable = ind1 + ind2 + ind3 + ind4;
  return { ind1, ind2, ind3, pA, pB, pC, ind4, bonoVariable, total: BONO_BASE + bonoVariable };
}

const cop = (n: number) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Math.round(n));
const pct = (p: number) => `${Math.round(p * 100)}%`;
const numVal = (v: number) => v === 0 ? "" : v; // allow clearing numeric inputs

function roiLabel(v: number) {
  if(v>=10) return { text:"Dos dígitos o más", color:"#15803d" };
  if(v>=8)  return { text:"Buen desempeño",    color:"#16a34a" };
  if(v>=6)  return { text:"Desempeño aceptable",color:"#ca8a04" };
  if(v>=5)  return { text:"Desempeño bajo",    color:"#d97706" };
  if(v>=4)  return { text:"Muy bajo",           color:"#dc2626" };
  return { text:"Sin bono (< 4%)",              color:"#9ca3af" };
}

const C = { roi:"#7c3aed", samples:"#0891b2", health:"#16a34a", operative:"#ea580c" };

// ── Helpers ────────────────────────────────────────────────────────────────────
function parseDateParts(dateStr: string): { year: string; month: number } {
  const [y, m] = dateStr.split("-");
  return { year: y, month: Number(m) };
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function StrategyDashboard() {
  const navigate  = useNavigate();
  const [tab, setTab] = useState("resumen");
  const def = getCurrentCycleDefault();
  const [year, setYear]     = useState(def.year);
  const [cycleId, setCycleId] = useState(def.cycleId);
  const [cycles, setCycles] = useState(() => getCyclesForYear(Number(def.year)));

  const nowMonth = new Date().getMonth() + 1;
  const nowYear  = String(new Date().getFullYear());
  const [sampleMonth, setSampleMonth] = useState(nowMonth);
  const [sampleYear,  setSampleYear]  = useState(nowYear);

  const [agents,  setAgents]  = useState<Agent[]>([]);
  const [entries, setEntries] = useState<StrategyEntry[]>([]);
  const [samples, setSamples] = useState<StrategySample[]>([]);
  const [saving,  setSaving]  = useState(false);

  const load = useCallback(async () => {
    const [ags, ens] = await Promise.all([getAgents("APT"), getStrategyEntries(year, cycleId)]);
    setAgents(ags); setEntries(ens);
  }, [year, cycleId]);

  const loadSamples = useCallback(async () => {
    setSamples(await getStrategySamples(sampleYear, sampleMonth));
  }, [sampleYear, sampleMonth]);

  useEffect(() => { load(); },        [load]);
  useEffect(() => { loadSamples(); }, [loadSamples]);

  // ── Entry drafts
  type Draft = Omit<StrategyEntry, "id">;
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});

  const emptyDraft = useCallback((agentId: number): Draft =>
    ({ agentId, year, cycleId, roiPct:0, productScore:0, nonBuyerFaultRate:0, negativeReviewRate:0, operativeCompliancePct:0 }),
  [year, cycleId]);

  useEffect(() => {
    const d: Record<number, Draft> = {};
    agents.forEach((ag) => {
      const ex = entries.find((e) => e.agentId === ag.id);
      d[ag.id] = ex
        ? { agentId:ag.id, year, cycleId, roiPct:ex.roiPct, productScore:ex.productScore, nonBuyerFaultRate:ex.nonBuyerFaultRate, negativeReviewRate:ex.negativeReviewRate, operativeCompliancePct:ex.operativeCompliancePct }
        : emptyDraft(ag.id);
    });
    setDrafts(d);
  }, [agents, entries, year, cycleId, emptyDraft]);

  const setF = (agId: number, field: keyof Pick<Draft,"roiPct"|"productScore"|"nonBuyerFaultRate"|"negativeReviewRate"|"operativeCompliancePct">, val: number) =>
    setDrafts((p) => ({ ...p, [agId]: { ...p[agId], [field]: val } }));

  const saveEntry = async (agentId: number) => {
    const d = drafts[agentId]; if (!d) return;
    setSaving(true);
    try { await upsertStrategyEntry(d); await load(); } finally { setSaving(false); }
  };

  // ── Samples state
  const [showAdd, setShowAdd]         = useState(false);
  const [filterZero, setFilterZero]   = useState(false);
  const [filterSku, setFilterSku]     = useState("");
  const [editing, setEditing]         = useState<StrategySample | null>(null);
  const [sErr, setSErr]               = useState("");
  const [sSaving, setSSaving]         = useState(false);
  const [newS, setNewS] = useState({ username:"", sku:"", sentDate:"", videosPublished:0, notes:"" });

  const submitSample = async (e: React.FormEvent) => {
    e.preventDefault(); setSErr("");
    if (!newS.username.trim() || !newS.sku.trim() || !newS.sentDate) { setSErr("Completa todos los campos requeridos."); return; }
    const agentId = agents[0]?.id;
    if (!agentId) { setSErr("No hay agentes registrados. Ve a Settings primero."); return; }
    const { year: sy, month: sm } = parseDateParts(newS.sentDate);
    setSSaving(true);
    try {
      await createStrategySample({ agentId, username: newS.username.trim(), sku: newS.sku.trim(), sentDate: newS.sentDate, videosPublished: newS.videosPublished, year: sy, month: sm, notes: newS.notes });
      setNewS({ username:"", sku:"", sentDate:"", videosPublished:0, notes:"" });
      setShowAdd(false);
      // Switch filter to match saved month so it appears immediately
      setSampleYear(sy); setSampleMonth(sm);
      await getStrategySamples(sy, sm).then(setSamples);
    } catch(err: any) { setSErr(err?.message ?? "Error al guardar."); }
    finally { setSSaving(false); }
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editing) return;
    setSSaving(true);
    try {
      await updateStrategySample(editing.id, { username: editing.username, sku: editing.sku, sentDate: editing.sentDate, videosPublished: editing.videosPublished, notes: editing.notes });
      setEditing(null); await loadSamples();
    } catch(err: any) { setSErr(err?.message ?? "Error al guardar."); }
    finally { setSSaving(false); }
  };

  const removeSample = async (id: number) => {
    if (!confirm("¿Eliminar este sample?")) return;
    await deleteStrategySample(id); await loadSamples();
  };

  // ── Agent settings
  const [agentNames, setAgentNames] = useState<Record<number,string>>({});
  useEffect(() => { const n:Record<number,string>={}; agents.forEach(a=>{n[a.id]=a.name;}); setAgentNames(n); }, [agents]);
  const saveAgentName = async (id: number) => { const { updateAgentName } = await import("../services/api"); await updateAgentName(id, agentNames[id]); await load(); };

  const [addPw,setAddPw]=useState(""); const [addPwErr,setAddPwErr]=useState(""); const [addVer,setAddVer]=useState(false);
  const [newName,setNewName]=useState(""); const [addSaving,setAddSaving]=useState(false);
  const checkAdmin=(e:React.FormEvent)=>{ e.preventDefault(); if(verifySuperAdmin("APT",addPw)){setAddVer(true);setAddPwErr("");}else setAddPwErr("Contraseña incorrecta."); };
  const submitAgent=async(e:React.FormEvent)=>{ e.preventDefault(); if(!newName.trim())return; setAddSaving(true); try{await createAgent(newName.trim(),"APT");await load();setNewName("");setAddVer(false);setAddPw("");}finally{setAddSaving(false);} };

  // ── Samples pct for cycle (computed from yearSamples)
  const [yearSamples, setYearSamples] = useState<StrategySample[]>([]);
  useEffect(() => { getStrategySamples(year).then(setYearSamples); }, [year]);
  const cycleMonth = nowMonth;
  const samplesPctForAgent = (agId: number) => {
    const rel = yearSamples.filter(s => s.agentId===agId && s.month===cycleMonth);
    if (!rel.length) return 0;
    return (rel.filter(s=>s.videosPublished>0).length / rel.length) * 100;
  };

  // ── Filtered samples
  const filtered = samples.filter(s => (!filterZero || s.videosPublished===0) && (!filterSku || s.sku.toLowerCase().includes(filterSku.toLowerCase())));
  const withContent = samples.filter(s=>s.videosPublished>0).length;
  const contentRate = samples.length>0 ? Math.round((withContent/samples.length)*100) : 0;
  const currentCycleName = cycles.find(c=>c.id===cycleId)?.name ?? cycleId;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <nav className="top-nav">
        <div className="logo">FTC Hub — <span style={{color:"#6366f1"}}>Strategy Team</span></div>
        <ul className="nav-links">
          {TABS.map(([k,l])=>(
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

        {/* ═══ RESUMEN ═══════════════════════════════════════════════════════ */}
        {tab==="resumen" && (
          <section>
            <header className="section-header"><h2>Resumen de Bonus — {currentCycleName}</h2></header>

            {agents.length===0 ? (
              <div className="card" style={{textAlign:"center",padding:"3rem",color:"var(--text-muted)"}}>No hay agentes. Ve a Settings.</div>
            ) : agents.map(ag=>{
              const entry = entries.find(e=>e.agentId===ag.id);
              const spct  = samplesPctForAgent(ag.id);
              const b     = entry ? calcBonus(entry, spct) : null;

              return (
                <div key={ag.id} style={{maxWidth:900,margin:"0 auto 2rem"}}>
                  <h3 style={{fontWeight:800,fontSize:"1.1rem",color:"#1e293b",marginBottom:"1rem",textAlign:"center"}}>{ag.name}</h3>

                  {/* ── Totals ── */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"0.75rem",marginBottom:"1.25rem"}}>
                    <SummaryBox label="Bono Base" value={BONO_BASE} color="#15803d" sub="Garantizado" />
                    <SummaryBox label="Bono Variable" value={b?.bonoVariable??0} color="#6366f1" sub={`de $${cop(650_000)} máx`} />
                    <SummaryBox label="Total Estimado" value={b?.total??BONO_BASE} color="#1d4ed8" sub="Base + Variable" large />
                  </div>

                  {!entry ? (
                    <div style={{background:"#f8fafc",border:"1px dashed #cbd5e1",borderRadius:10,padding:"1.5rem",textAlign:"center",color:"var(--text-muted)",fontSize:"0.875rem"}}>
                      Sin datos para este ciclo. Registra los indicadores en los tabs correspondientes.
                    </div>
                  ) : (
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.75rem"}}>
                      <IndSummaryCard num="1" weight="40%" label="ROI Programa Afiliados"
                        earned={b!.ind1} max={IND1_MAX} color={C.roi}
                        scalePct={roiScale(entry.roiPct)}
                        detail={`ROI del ciclo: ${entry.roiPct}%`} />
                      <IndSummaryCard num="2" weight="30%" label="Samples con Contenido"
                        earned={b!.ind2} max={IND2_MAX} color={C.samples}
                        scalePct={samplesScale(spct)}
                        detail={`${Math.round(spct)}% generaron video este mes`} />
                      <IndSummaryCard num="3" weight="20%" label="Salud Cuenta TikTok"
                        earned={b!.ind3} max={IND3_MAX} color={C.health}
                        scalePct={(b!.pA+b!.pB+b!.pC)/3}
                        detail={`Score ${entry.productScore} · NBFR ${entry.nonBuyerFaultRate}% · NRR ${entry.negativeReviewRate}%`} />
                      <IndSummaryCard num="4" weight="10%" label="Cumplimiento Operativo"
                        earned={b!.ind4} max={IND4_MAX} color={C.operative}
                        scalePct={operativeScale(entry.operativeCompliancePct)}
                        detail={`${entry.operativeCompliancePct}% cumplimiento`} />
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {/* ═══ ROI ════════════════════════════════════════════════════════════ */}
        {tab==="roi" && (
          <section>
            <header className="section-header">
              <div>
                <h2>ROI Mensual — Programa de Afiliados</h2>
                <p style={{color:"var(--text-muted)",fontSize:"0.85rem",margin:0}}>Indicador #1 · 40% del bono variable · Máx $260.000 COP</p>
              </div>
            </header>

            {/* Scale */}
            <div className="card" style={{marginBottom:"1.25rem",background:"#faf5ff",border:"1px solid #e9d5ff"}}>
              <p style={{fontWeight:700,fontSize:"0.75rem",color:"#7c3aed",marginBottom:"0.75rem",textTransform:"uppercase",letterSpacing:"0.06em"}}>Escala de desempeño</p>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"0.5rem"}}>
                {[
                  {range:"≥ 10%",    desc:"Dos dígitos",  pct:"100%",bono:"$260.000",color:"#15803d"},
                  {range:"8–9.99%",  desc:"Buen desempeño",pct:"70%", bono:"$182.000",color:"#16a34a"},
                  {range:"6–7.99%",  desc:"Aceptable",    pct:"40%", bono:"$104.000",color:"#ca8a04"},
                  {range:"5–5.99%",  desc:"Bajo",          pct:"30%", bono:"$78.000", color:"#d97706"},
                  {range:"4–4.99%",  desc:"Muy bajo",      pct:"20%", bono:"$52.000", color:"#dc2626"},
                  {range:"1–3.99%",  desc:"Sin bono",      pct:"0%",  bono:"$0",      color:"#9ca3af"},
                ].map(t=>(
                  <div key={t.range} style={{border:`1px solid ${t.color}30`,borderLeft:`3px solid ${t.color}`,borderRadius:8,padding:"0.55rem 0.75rem"}}>
                    <div style={{fontWeight:800,fontSize:"0.9rem",color:t.color}}>{t.range}</div>
                    <div style={{fontSize:"0.72rem",color:"#64748b"}}>{t.desc} · {t.pct}</div>
                    <div style={{fontWeight:700,fontSize:"0.85rem",color:"#1e293b",marginTop:"0.15rem"}}>{t.bono} COP</div>
                  </div>
                ))}
              </div>
            </div>

            {agents.map(ag=>{
              const d = drafts[ag.id]; if (!d) return null;
              const rl = roiLabel(d.roiPct);
              return (
                <div key={ag.id} className="card" style={{marginBottom:"1rem"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.25rem",flexWrap:"wrap",gap:"0.5rem"}}>
                    <div>
                      <h3 style={{margin:0,color:"#4f46e5"}}>{ag.name}</h3>
                      <p style={{margin:0,fontSize:"0.8rem",color:"var(--text-muted)"}}>Ciclo: {currentCycleName}</p>
                    </div>
                    <div style={{display:"flex",gap:"0.75rem",alignItems:"center"}}>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:"0.7rem",color:rl.color,fontWeight:700,textTransform:"uppercase"}}>{rl.text}</div>
                        <div style={{fontSize:"1.15rem",fontWeight:800,color:C.roi}}>${cop(IND1_MAX*roiScale(d.roiPct))}</div>
                      </div>
                      <button className="btn btn-primary btn-sm" onClick={()=>saveEntry(ag.id)} disabled={saving}>{saving?"...":"Guardar"}</button>
                    </div>
                  </div>

                  <div style={{display:"flex",gap:"1.5rem",alignItems:"flex-end",flexWrap:"wrap"}}>
                    <div>
                      <label style={lbl}>ROI del ciclo (%)</label>
                      <input type="number" min={0} max={100} step={0.01} className="form-control"
                        style={{maxWidth:160,fontSize:"1.3rem",fontWeight:700,textAlign:"center"}}
                        value={numVal(d.roiPct)}
                        onChange={e=>setF(ag.id,"roiPct",parseFloat(e.target.value)||0)} />
                    </div>
                    <div style={{flex:1,minWidth:200}}>
                      <div style={{height:10,background:"#e2e8f0",borderRadius:5,overflow:"hidden",marginBottom:"0.5rem"}}>
                        <div style={{width:`${Math.min(100,(d.roiPct/10)*100)}%`,height:"100%",background:rl.color,transition:"width 0.3s",borderRadius:5}} />
                      </div>
                      <div style={{fontSize:"0.75rem",color:"#64748b"}}>{pct(roiScale(d.roiPct))} del bono máximo · Máx ${cop(IND1_MAX)} COP</div>
                    </div>
                  </div>

                  <div style={{marginTop:"1rem",padding:"0.6rem 0.85rem",background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0"}}>
                    <span style={{fontSize:"0.75rem",color:"#94a3b8"}}>Cambia el ciclo en la barra superior para registrar o revisar el ROI de periodos anteriores.</span>
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
              <div>
                <h2>Samples que Generan Contenido</h2>
                <p style={{color:"var(--text-muted)",fontSize:"0.85rem",margin:0}}>Indicador #2 · 30% del bono variable · Máx $195.000 COP</p>
              </div>
              <button className="btn btn-primary" onClick={()=>{setShowAdd(true);setEditing(null);setSErr("");}}>+ Agregar Sample</button>
            </header>

            {/* Stats */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"0.65rem",marginBottom:"1.25rem"}}>
              {[
                {label:"Total enviados",value:samples.length,color:C.samples},
                {label:"Con contenido",value:withContent,color:"#15803d"},
                {label:"Sin contenido",value:samples.length-withContent,color:"#dc2626",click:()=>setFilterZero(v=>!v),active:filterZero},
                {label:"Tasa contenido",value:`${contentRate}%`,color:"#7c3aed"},
                {label:"Bono estimado",value:`$${cop(IND2_MAX*samplesScale(contentRate))}`,color:C.operative},
              ].map(s=>(
                <div key={s.label} onClick={s.click} style={{border:`1px solid ${s.active?s.color:s.color+"30"}`,borderTop:`3px solid ${s.color}`,borderRadius:10,padding:"0.75rem 1rem",background:s.active?s.color+"0d":"white",cursor:s.click?"pointer":"default"}}>
                  <div style={{fontSize:"0.65rem",fontWeight:700,color:s.color,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"0.25rem"}}>{s.label}</div>
                  <div style={{fontSize:"1.15rem",fontWeight:800,color:"#1e293b"}}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="card" style={{marginBottom:"1rem",padding:"0.85rem 1rem"}}>
              <div style={{display:"flex",gap:"0.75rem",flexWrap:"wrap",alignItems:"flex-end"}}>
                <div><label style={lbl}>Mes</label>
                  <select className="month-selector" value={sampleMonth} onChange={e=>setSampleMonth(Number(e.target.value))}>
                    {MONTHS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Año</label>
                  <select className="month-selector" value={sampleYear} onChange={e=>setSampleYear(e.target.value)}>
                    {YEARS.map(y=><option key={y}>{y}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Buscar SKU</label>
                  <input type="text" className="form-control" style={{maxWidth:200}} placeholder="Filtrar por SKU..." value={filterSku} onChange={e=>setFilterSku(e.target.value)} />
                </div>
                <button onClick={()=>setFilterZero(v=>!v)}
                  style={{padding:"0.42rem 0.9rem",borderRadius:20,fontSize:"0.8rem",fontWeight:600,cursor:"pointer",border:`2px solid ${filterZero?"#dc2626":"#e2e8f0"}`,background:filterZero?"#fef2f2":"white",color:filterZero?"#dc2626":"#64748b"}}>
                  {filterZero?"✕ Solo sin videos":"Sin videos (0)"}
                </button>
              </div>
            </div>

            {/* Add / Edit form */}
            {(showAdd||editing) && (
              <div className="card" style={{marginBottom:"1rem",border:`2px solid ${C.samples}`,background:"#f0f9ff"}}>
                <h4 style={{margin:"0 0 1rem",color:C.samples}}>{editing?"Editar Sample":"Agregar Nuevo Sample"}</h4>
                {sErr && <p style={{color:"#dc2626",fontSize:"0.85rem",marginBottom:"0.75rem"}}>{sErr}</p>}
                <form onSubmit={editing?submitEdit:submitSample}>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:"0.75rem",marginBottom:"0.75rem"}}>
                    {([
                      {field:"username",label:"Username / User ID",placeholder:"@username",type:"text",required:true},
                      {field:"sku",label:"SKU del producto",placeholder:"SKU-123",type:"text",required:true},
                      {field:"sentDate",label:"Fecha de envío",placeholder:"",type:"date",required:true},
                      {field:"videosPublished",label:"Videos publicados",placeholder:"0",type:"number",required:false},
                      {field:"notes",label:"Notas",placeholder:"Opcional",type:"text",required:false},
                    ] as const).map(({field,label,placeholder,type,required})=>(
                      <div key={field}>
                        <label style={lbl}>{label}</label>
                        <input
                          type={type} className="form-control" placeholder={placeholder} required={required}
                          min={type==="number"?0:undefined}
                          value={editing ? (editing as any)[field] : (newS as any)[field]}
                          onChange={e=>{
                            const v = type==="number" ? Number(e.target.value) : e.target.value;
                            editing ? setEditing({...editing,[field]:v} as StrategySample) : setNewS({...newS,[field]:v} as any);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:"0.5rem"}}>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={sSaving}>{sSaving?"...":editing?"Guardar cambios":"Agregar"}</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={()=>{setShowAdd(false);setEditing(null);setSErr("");}}>Cancelar</button>
                  </div>
                </form>
              </div>
            )}

            {/* Table */}
            <div className="card" style={{overflowX:"auto"}}>
              <p style={{fontSize:"0.8rem",color:"var(--text-muted)",margin:"0 0 0.75rem"}}>{filtered.length} resultado{filtered.length!==1?"s":""} · {MONTHS[sampleMonth-1]} {sampleYear}</p>
              {filtered.length===0 ? (
                <div style={{textAlign:"center",padding:"2.5rem",color:"var(--text-muted)"}}>No hay samples para este periodo.</div>
              ) : (
                <table className="data-table">
                  <thead><tr><th>Username</th><th>SKU</th><th>Fecha envío</th><th>Videos</th><th>Notas</th><th>Acciones</th></tr></thead>
                  <tbody>
                    {filtered.map(s=>(
                      <tr key={s.id} style={{background:s.videosPublished===0?"#fff7f7":undefined}}>
                        <td style={{fontWeight:600}}>{s.username}</td>
                        <td><span style={{background:"#f1f5f9",borderRadius:4,padding:"0.1rem 0.45rem",fontSize:"0.8rem",fontFamily:"monospace"}}>{s.sku}</span></td>
                        <td>{s.sentDate}</td>
                        <td><span style={{fontWeight:700,color:s.videosPublished===0?"#dc2626":"#15803d"}}>{s.videosPublished===0?"⚠ 0":`✓ ${s.videosPublished}`}</span></td>
                        <td style={{color:"var(--text-muted)",fontSize:"0.8rem"}}>{s.notes||"—"}</td>
                        <td>
                          <button className="btn btn-sm btn-secondary" onClick={()=>{setEditing(s);setShowAdd(false);setSErr("");}}>Editar</button>{" "}
                          <button className="btn btn-sm btn-danger" onClick={()=>removeSample(s.id)}>Eliminar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {/* ═══ SALUD TIKTOK ═══════════════════════════════════════════════════ */}
        {tab==="salud" && (
          <section>
            <header className="section-header">
              <div>
                <h2>Salud de la Cuenta TikTok</h2>
                <p style={{color:"var(--text-muted)",fontSize:"0.85rem",margin:0}}>Indicador #3 · 20% del bono variable · Máx $130.000 COP</p>
              </div>
            </header>

            {agents.map(ag=>{
              const d = drafts[ag.id]; if (!d) return null;
              const pA = productScoreScale(d.productScore);
              const pB = nonBuyerScale(d.nonBuyerFaultRate);
              const pC = negReviewScale(d.negativeReviewRate);
              const earned = IND3_MAX * ((pA+pB+pC)/3);

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
                    {/* A */}
                    <SubMetric color={C.health} label="A. Product Satisfaction Score" sublabel="Meta: ≥ 4.5" scalePct={pA}
                      scales={[{r:"≥ 4.6",p:"100%"},{r:"4.5–4.59",p:"80%"},{r:"4.3–4.49",p:"60%"},{r:"4.2–4.29",p:"30%"},{r:"4.1–4.19",p:"10%"},{r:"< 4.1",p:"0%"}]}>
                      <input type="number" min={0} max={5} step={0.01} className="form-control"
                        value={numVal(d.productScore)} onChange={e=>setF(ag.id,"productScore",parseFloat(e.target.value)||0)} />
                    </SubMetric>
                    {/* B */}
                    <SubMetric color={C.health} label="B. Non-Buyer Fault Rate" sublabel="Meta: < 2%" scalePct={pB}
                      scales={[{r:"≤ 2%",p:"100%"},{r:"2.01–2.50%",p:"50%"},{r:"> 2.50%",p:"0%"}]}>
                      <div style={{display:"flex",gap:"0.4rem",alignItems:"center"}}>
                        <input type="number" min={0} max={20} step={0.01} className="form-control"
                          value={numVal(d.nonBuyerFaultRate)} onChange={e=>setF(ag.id,"nonBuyerFaultRate",parseFloat(e.target.value)||0)} />
                        <span style={{fontSize:"0.85rem",color:"#64748b"}}>%</span>
                      </div>
                    </SubMetric>
                    {/* C */}
                    <SubMetric color={C.health} label="C. Negative Review Rate" sublabel="Meta: < 1.2%" scalePct={pC}
                      scales={[{r:"≤ 0.45%",p:"100%"},{r:"≤ 0.80%",p:"50%"},{r:"≤ 1.20%",p:"25%"},{r:"> 1.20%",p:"0%"}]}>
                      <div style={{display:"flex",gap:"0.4rem",alignItems:"center"}}>
                        <input type="number" min={0} max={10} step={0.01} className="form-control"
                          value={numVal(d.negativeReviewRate)} onChange={e=>setF(ag.id,"negativeReviewRate",parseFloat(e.target.value)||0)} />
                        <span style={{fontSize:"0.85rem",color:"#64748b"}}>%</span>
                      </div>
                    </SubMetric>
                  </div>

                  <div style={{marginTop:"1rem",padding:"0.65rem 1rem",background:"#f0fdf4",borderRadius:8,fontSize:"0.78rem",color:"#166534",border:"1px solid #bbf7d0"}}>
                    Promedio actual: {pct((pA+pB+pC)/3)} · Si alguna métrica está en 0 (sin dato), se excluye del cálculo.
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
              <div>
                <h2>Cumplimiento Operativo</h2>
                <p style={{color:"var(--text-muted)",fontSize:"0.85rem",margin:0}}>Indicador #4 · 10% del bono variable · Máx $65.000 COP</p>
              </div>
            </header>

            {agents.map(ag=>{
              const d = drafts[ag.id]; if (!d) return null;
              const sp = operativeScale(d.operativeCompliancePct);
              const earned = IND4_MAX * sp;

              return (
                <div key={ag.id} className="card" style={{borderTop:`3px solid ${C.operative}`,marginBottom:"1rem"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.5rem",flexWrap:"wrap",gap:"0.5rem"}}>
                    <h3 style={{margin:0,color:C.operative}}>{ag.name}</h3>
                    <div style={{display:"flex",gap:"0.75rem",alignItems:"center"}}>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:"0.7rem",color:"#64748b"}}>Bono estimado (de ${cop(IND4_MAX)} máx)</div>
                        <div style={{fontSize:"1.2rem",fontWeight:800,color:C.operative}}>${cop(earned)} COP</div>
                      </div>
                      <button className="btn btn-primary btn-sm" onClick={()=>saveEntry(ag.id)} disabled={saving}>{saving?"...":"Guardar"}</button>
                    </div>
                  </div>

                  {/* Scale reference */}
                  <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:8,padding:"0.85rem 1rem",marginBottom:"1.25rem"}}>
                    <p style={{fontWeight:700,fontSize:"0.75rem",color:C.operative,marginBottom:"0.6rem",textTransform:"uppercase",letterSpacing:"0.06em"}}>Escala</p>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"0.5rem"}}>
                      {[
                        {range:"100%",  pct:"100%",bono:"$65.000",color:"#15803d"},
                        {range:"80–99%",pct:"75%", bono:"$48.750",color:"#16a34a"},
                        {range:"60–79%",pct:"50%", bono:"$32.500",color:"#ca8a04"},
                        {range:"40–59%",pct:"25%", bono:"$16.250",color:"#d97706"},
                        {range:"< 40%", pct:"0%",  bono:"$0",     color:"#9ca3af"},
                      ].map(t=>(
                        <div key={t.range} style={{border:`1px solid ${t.color}30`,borderLeft:`3px solid ${t.color}`,borderRadius:8,padding:"0.5rem 0.65rem"}}>
                          <div style={{fontWeight:800,fontSize:"0.85rem",color:t.color}}>{t.range}</div>
                          <div style={{fontSize:"0.7rem",color:"#64748b"}}>{t.pct} → {t.bono}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Input */}
                  <div style={{display:"flex",gap:"1.5rem",alignItems:"flex-end",flexWrap:"wrap"}}>
                    <div>
                      <label style={lbl}>% de cumplimiento del mes</label>
                      <div style={{display:"flex",gap:"0.5rem",alignItems:"center"}}>
                        <input type="number" min={0} max={100} step={1} className="form-control"
                          style={{maxWidth:150,fontSize:"1.3rem",fontWeight:700,textAlign:"center"}}
                          value={numVal(d.operativeCompliancePct)}
                          onChange={e=>setF(ag.id,"operativeCompliancePct",parseFloat(e.target.value)||0)} />
                        <span style={{fontSize:"1rem",color:"#64748b",fontWeight:600}}>%</span>
                      </div>
                    </div>
                    <div style={{flex:1,minWidth:200}}>
                      <div style={{height:10,background:"#e2e8f0",borderRadius:5,overflow:"hidden",marginBottom:"0.5rem"}}>
                        <div style={{width:`${sp*100}%`,height:"100%",background:C.operative,transition:"width 0.3s",borderRadius:5}} />
                      </div>
                      <div style={{fontSize:"0.75rem",color:"#64748b"}}>{pct(sp)} del bono · ${cop(earned)} de ${cop(IND4_MAX)} máx</div>
                    </div>
                  </div>

                  {/* Items list */}
                  <div style={{marginTop:"1.25rem",padding:"0.85rem 1rem",background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0"}}>
                    <p style={{fontSize:"0.75rem",fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"0.6rem"}}>Incluye</p>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:"0.3rem"}}>
                      {["Seguimiento a influencers","Respuesta oportuna a mensajes","Revisión de Sample Requests","Documentación correcta","Envío semanal del listado a la agencia","Registro actualizado de samples enviados","Participación en reuniones y estrategia"].map(item=>(
                        <div key={item} style={{fontSize:"0.78rem",color:"#475569",display:"flex",alignItems:"center",gap:"0.4rem"}}>
                          <span style={{color:C.operative}}>•</span> {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* ═══ SETTINGS ══════════════════════════════════════════════════════ */}
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
const lbl: React.CSSProperties = {fontSize:"0.72rem",fontWeight:700,color:"#64748b",display:"block",marginBottom:"0.3rem",textTransform:"uppercase",letterSpacing:"0.05em"};

function SummaryBox({label,value,color,sub,large}:{label:string;value:number;color:string;sub:string;large?:boolean}) {
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

function IndSummaryCard({num,weight,label,earned,max,color,scalePct,detail}:{num:string;weight:string;label:string;earned:number;max:number;color:string;scalePct:number;detail:string}) {
  return (
    <div style={{border:`1px solid ${color}20`,borderTop:`3px solid ${color}`,borderRadius:10,padding:"1rem 1.1rem",background:"white"}}>
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
        <div style={{fontSize:"1.05rem",fontWeight:800,color}}>${new Intl.NumberFormat("es-CO",{maximumFractionDigits:0}).format(Math.round(earned))}</div>
        <div style={{fontSize:"0.7rem",color:"#94a3b8"}}>{Math.round(scalePct*100)}%</div>
      </div>
    </div>
  );
}

function SubMetric({color,label,sublabel,scalePct,scales,children}:{color:string;label:string;sublabel:string;scalePct:number;scales:{r:string;p:string}[];children:React.ReactNode}) {
  return (
    <div style={{background:"#f8fafc",borderRadius:10,padding:"1rem",border:`1px solid ${color}20`}}>
      <div style={{fontSize:"0.8rem",fontWeight:700,color:"#1e293b",marginBottom:"0.15rem"}}>{label}</div>
      <div style={{fontSize:"0.7rem",color:"#64748b",marginBottom:"0.75rem"}}>{sublabel}</div>
      {children}
      <div style={{height:6,background:"#e2e8f0",borderRadius:3,overflow:"hidden",margin:"0.6rem 0 0.4rem"}}>
        <div style={{width:`${scalePct*100}%`,height:"100%",background:color,transition:"width 0.3s",borderRadius:3}} />
      </div>
      <div style={{fontSize:"0.7rem",color,fontWeight:700,marginBottom:"0.6rem"}}>{Math.round(scalePct*100)}% de este sub-indicador</div>
      <div style={{display:"flex",flexDirection:"column",gap:"0.25rem"}}>
        {scales.map(s=>(
          <div key={s.r} style={{display:"flex",justifyContent:"space-between",fontSize:"0.68rem",color:"#64748b",padding:"0.1rem 0"}}>
            <span>{s.r}</span><span style={{fontWeight:600}}>{s.p}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
