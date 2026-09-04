import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";
import type { Agent, StrategyEntry, StrategySample, StrategyIncident, UploadBatch, UploadRow, AffiliateContestEntry, SampleAnalysisPeriod, SampleAnalysisRow } from "../types";
import {
  getAgents, updateAgentName, createAgent, verifySuperAdmin,
  getStrategyEntries, upsertStrategyEntry,
  getStrategySamples, createStrategySample, deleteStrategySample,
  getStrategyIncidents, createStrategyIncident, updateStrategyIncident, deleteStrategyIncident,
  getUploadBatches, getUploadRows, createUploadBatch, decideUploadRow, reinstateUploadRow, deleteUploadBatch,
  deleteUploadRows, decideUploadRowsBulk,
  getAffiliateContestEntries, upsertAffiliateContestSnapshot, setAffiliateContestQualified, deleteAffiliateContestEntry, deleteAffiliateContestEntries,
  addVideoLogEntriesBulk,
  getSampleAnalysisPeriods, getSampleAnalysisRows, createSampleAnalysisPeriod, deleteSampleAnalysisPeriod,
  getStrategySamplesSettings, setStrategySamplesVideoPct,
} from "../services/api";
import {
  getCyclesForYear, getCurrentCycleDefault,
  getCycleDatesFromId,
} from "../services/usaCycles";
import { moodBunny } from "../components/moodBunny";

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
const SAMPLES_GOAL = 755;
const SAMPLES_BONUS_MAX = 100_000; // of the $195,000 IND2_MAX total
const VIDEOS_BONUS_MAX = 95_000;   // the rest of IND2_MAX

function roiScale(v: number) { if(v>=10)return 1;if(v>=8)return .70;if(v>=6)return .40;if(v>=5)return .30;if(v>=4)return .20;return 0; }
// Below 4% ROI the bonus isn't a percentage of IND1_MAX — it's small fixed
// amounts to reward early-stage traction instead of paying nothing until 4%.
function roiBonusAmount(v: number): number {
  if (v >= 1 && v < 2) return 10_000;
  if (v >= 2 && v < 3) return 20_000;
  if (v >= 3 && v < 4) return 30_000;
  return IND1_MAX * roiScale(v);
}
function productScoreScale(v: number){ if(v<=0)return 0;if(v>=4.5)return 1;if(v>=4.3)return .80;if(v>=4.2)return .40;if(v>=4.1)return .30;if(v>=3.5)return .15;return 0; }
function nonBuyerScale(v: number)    { if(v<=0)return 0;if(v<=2.10)return 1;if(v<=2.20)return .95;if(v<=2.30)return .90;if(v<=2.50)return .75;if(v<=3.00)return .50;return 0; }
function negReviewScale(v: number)   { if(v<=0)return 0;if(v<0.55)return 1;if(v<=0.80)return .90;if(v<=0.90)return .75;if(v<=1.30)return .50;if(v<=1.60)return .25;return 0; }
function operativeScale(v: number)   { if(v>=100)return 1;if(v>=80)return .75;if(v>=60)return .50;if(v>=40)return .25;return 0; }

// Below 70% samples shipped, this half of the bono earns nothing. From 70% to 100%
// it's directly proportional (70% -> $70,000, 85% -> $85,000, 100% -> $100,000).
function samplesBonusAmount(samplesPct: number): number {
  if (samplesPct < 70) return 0;
  return Math.min(samplesPct, 100) / 100 * SAMPLES_BONUS_MAX;
}
// Directly proportional from 0% to 100% (e.g. 40% videos -> $38,000).
function videosBonusAmount(videoPct: number): number {
  return Math.min(Math.max(videoPct, 0), 100) / 100 * VIDEOS_BONUS_MAX;
}

function calcBonus(e: StrategyEntry, ind2: number) {
  const ind1 = roiBonusAmount(e.roiPct);
  const pA = productScoreScale(e.productScore);
  const pB = nonBuyerScale(e.nonBuyerFaultRate);
  const pC = negReviewScale(e.negativeReviewRate);
  const ind3 = IND3_MAX * (pA * 0.05 + pB * 0.50 + pC * 0.45);
  const ind4  = IND4_MAX * operativeScale(e.operativeCompliancePct);
  const bonoVariable = ind1 + ind2 + ind3 + ind4;
  return { ind1, ind2, ind3, pA, pB, pC, ind4, bonoVariable, total: BONO_BASE + bonoVariable };
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const YEARS  = ["2025", "2026", "2027", "2028"];
const TABS: [string, string][] = [
  ["resumen","Resumen"],["roi","ROI"],["uploads","Uploads"],["samples","Samples"],
  ["concurso","Concurso de Afiliados"],
  ["salud","Salud TikTok"],["cumplimiento","Cumplimiento"],["settings","Settings"],
];

const NAME_COLUMN_HINTS = /usuario|username|tiktok|nombre|creator|influencer|handle/i;

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
  if(v>=3)  return { text:"Inicial",              color:"#b45309" };
  if(v>=2)  return { text:"Inicial",              color:"#b45309" };
  if(v>=1)  return { text:"Inicial",              color:"#b45309" };
  return    { text:"Sin bono (< 1%)",             color:"#9ca3af" };
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

  // ── Uploads (agency Excel approval workflow) ───────────────────────────────
  const [uploadBatches, setUploadBatches] = useState<UploadBatch[]>([]);
  const [uploadRows,    setUploadRows]    = useState<UploadRow[]>([]);
  const loadUploads = useCallback(async () => {
    const [b, r] = await Promise.all([getUploadBatches(), getUploadRows()]);
    setUploadBatches(b); setUploadRows(r);
  }, []);
  useEffect(() => { loadUploads(); }, [loadUploads]);

  // ── Affiliate contest ("Concurso de Afiliados") ────────────────────────────
  const [contestEntries, setContestEntries] = useState<AffiliateContestEntry[]>([]);
  const loadContest = useCallback(async () => { setContestEntries(await getAffiliateContestEntries()); }, []);
  useEffect(() => { loadContest(); }, [loadContest]);

  const contestFileRef = useRef<HTMLInputElement>(null);
  const [contestImporting, setContestImporting] = useState(false);
  const [contestResult, setContestResult] = useState<{added:number; updated:number; skipped:number; matchedSamples:number; removedZero:number} | null>(null);
  const [contestSearch, setContestSearch] = useState("");

  const CONTEST_NAME_HINTS = /creator_name|username|nombre/i;
  const CONTEST_VIDEOS_HINTS = /videos_posted|videos/i;

  const handleContestFileSelected = async (file: File) => {
    setContestImporting(true); setContestResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const json = XLSX.utils.sheet_to_json<Record<string,string>>(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
      if (json.length === 0) { setContestImporting(false); return; }
      const columns = Object.keys(json[0]);
      const nameCol = columns.find(c => CONTEST_NAME_HINTS.test(c)) ?? columns[0];
      const videosCol = columns.find(c => CONTEST_VIDEOS_HINTS.test(c)) ?? columns[1];
      let skipped = 0;
      const rows: { username: string; videos: number }[] = [];
      for (const row of json) {
        const username = String(row[nameCol] ?? "").trim();
        const videos = Number(row[videosCol] ?? 0);
        if (!username || isNaN(videos)) { skipped++; continue; }
        rows.push({ username, videos });
      }

      // Compute per-row deltas against the currently loaded contest state (same rule the
      // API uses internally) so we know how many *new* videos each creator got this upload.
      const existingByUsername = new Map(contestEntries.map(e => [e.username.trim().toLowerCase(), e]));
      const deltas = new Map<string, number>();
      for (const row of rows) {
        const key = row.username.trim().toLowerCase();
        const existing = existingByUsername.get(key);
        const delta = existing ? Math.max(0, row.videos - existing.lastSeenSnapshot) : row.videos;
        deltas.set(key, (deltas.get(key) ?? 0) + delta);
      }

      const { added, updated } = await upsertAffiliateContestSnapshot(rows);

      // Push matching deltas into Samples: find the most recently sent "Entregado" sample
      // for that username and log the new videos there too (dated today).
      const today = new Date(); const off = today.getTimezoneOffset();
      const todayIso = new Date(today.getTime() - off*60000).toISOString().slice(0,10);
      let matchedSamples = 0;
      for (const [key, delta] of deltas) {
        if (delta <= 0) continue;
        const candidates = allSamples.filter(s => s.deliveryStatus === "delivered" && s.username.trim().toLowerCase() === key);
        if (candidates.length === 0) continue;
        const target = candidates.reduce((a,b) => a.sentDate >= b.sentDate ? a : b);
        await addVideoLogEntriesBulk(target.id, todayIso, delta);
        matchedSamples++;
      }

      // Remove contest entries left at 0 videos (only those — never touches anyone with >0).
      const freshEntries = await getAffiliateContestEntries();
      const zeroIds = freshEntries.filter(e => e.videosTotal === 0).map(e => e.id);
      if (zeroIds.length > 0) await deleteAffiliateContestEntries(zeroIds);

      setContestResult({ added, updated, skipped, matchedSamples, removedZero: zeroIds.length });
      await Promise.all([loadContest(), loadSamples()]);
    } catch (err: any) {
      alert(err?.message ?? "Error al importar el documento del concurso.");
    } finally { setContestImporting(false); }
  };

  const toggleContestQualified = async (entry: AffiliateContestEntry) => {
    await setAffiliateContestQualified(entry.id, !entry.qualified);
    await loadContest();
  };

  const removeContestEntry = async (id: number) => {
    if (!confirm("¿Eliminar este afiliado del concurso?")) return;
    await deleteAffiliateContestEntry(id);
    await loadContest();
  };

  const [contestSelected, setContestSelected] = useState<Set<number>>(new Set());
  const [revealedContestId, setRevealedContestId] = useState<number | null>(null);
  const CONTEST_MASK = "— — — —";
  const contestPeriodLabel = useMemo(() => {
    const fmt = (d: Date) => d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
    const start = new Date(2026, 7, 17); // 17 de agosto de 2026
    const end = new Date(); end.setDate(end.getDate() - 2);
    return `${fmt(start)} — ${fmt(end)}`;
  }, []);
  const toggleContestSelected = (id: number) => {
    setContestSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const removeSelectedContestEntries = async () => {
    if (contestSelected.size === 0) return;
    if (!confirm(`¿Eliminar ${contestSelected.size} afiliado${contestSelected.size!==1?"s":""} seleccionado${contestSelected.size!==1?"s":""} del concurso?`)) return;
    await deleteAffiliateContestEntries(Array.from(contestSelected));
    setContestSelected(new Set());
    await loadContest();
  };

  const contestRanked = useMemo(() => {
    const q = contestSearch.trim().toLowerCase();
    const sorted = [...contestEntries]
      .filter(e => !q || e.username.toLowerCase().includes(q))
      .sort((a,b) => b.videosTotal - a.videosTotal);
    let rank = 0;
    return sorted.map(e => {
      if (e.qualified) rank++;
      return { ...e, rank: e.qualified ? rank : null };
    });
  }, [contestEntries, contestSearch]);

  // ── Sample product analysis (TikTok export uploads) ────────────────────────
  const [analysisPeriods, setAnalysisPeriods] = useState<SampleAnalysisPeriod[]>([]);
  const [analysisRows, setAnalysisRows] = useState<SampleAnalysisRow[]>([]);
  const loadAnalysis = useCallback(async () => {
    const [p, r] = await Promise.all([getSampleAnalysisPeriods(), getSampleAnalysisRows()]);
    setAnalysisPeriods(p); setAnalysisRows(r);
  }, []);
  useEffect(() => { loadAnalysis(); }, [loadAnalysis]);

  const analysisFileRef = useRef<HTMLInputElement>(null);
  const [analysisParsed, setAnalysisParsed] = useState<{
    filename: string; periodStart: string; periodEnd: string;
    rows: Omit<SampleAnalysisRow,"id"|"periodId">[];
  } | null>(null);
  const [analysisSaving, setAnalysisSaving] = useState(false);
  const [analysisErr, setAnalysisErr] = useState("");

  const parseAnalysisNum = (v: any): number | null => {
    if (v === null || v === undefined) return null;
    const s = String(v).replace(/[$,]/g,"").trim();
    if (s === "" || s === "--") return null;
    const n = Number(s);
    return isNaN(n) ? null : n;
  };

  const handleAnalysisFileSelected = async (file: File) => {
    setAnalysisErr("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const json = XLSX.utils.sheet_to_json<Record<string,any>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      const rows: Omit<SampleAnalysisRow,"id"|"periodId">[] = [];
      for (const row of json) {
        const productId = String(row["Product ID"] ?? "").trim();
        const productName = String(row["Product name"] ?? "").trim();
        if (!productId || !productName) continue; // skips the blank description row
        rows.push({
          productName, productId,
          productCategory: String(row["Product category"] ?? "").trim(),
          contentGmv: parseAnalysisNum(row["Content GMV"]),
          refunds: parseAnalysisNum(row["Refunds"]),
          samplesRequested: parseAnalysisNum(row["Samples requested"]),
          samplesShipped: parseAnalysisNum(row["Samples shipped"]),
          status: String(row["Status"] ?? "").trim(),
          videosWithSamples: parseAnalysisNum(row["Videos with samples"]),
          liveStreamsWithSamples: parseAnalysisNum(row["LIVE streams with samples"]),
          roi45d: parseAnalysisNum(row["45-day ROI"]),
          roi90d: parseAnalysisNum(row["90-day ROI"]),
          creatorsMetRefundCriteria: parseAnalysisNum(row["Creators met refund criteria"]),
          targetRoi: parseAnalysisNum(row["Target ROI"]),
          refundedOrders: parseAnalysisNum(row["Refunded orders"]),
          estRefundableGmv: parseAnalysisNum(row["Est. refundable GMV"]),
          ordersNeededForRefund: parseAnalysisNum(row["Orders needed for refund"]),
          catalogId: null,
        });
      }
      if (rows.length === 0) { setAnalysisErr("No se detectaron productos en el archivo."); return; }
      const m = file.name.match(/(\d{4})(\d{2})(\d{2})-(\d{4})(\d{2})(\d{2})/);
      const periodStart = m ? `${m[1]}-${m[2]}-${m[3]}` : "";
      const periodEnd   = m ? `${m[4]}-${m[5]}-${m[6]}` : "";
      setAnalysisParsed({ filename: file.name, periodStart, periodEnd, rows });
    } catch { setAnalysisErr("No se pudo leer el archivo. Verifica que sea el export de TikTok."); }
  };

  const confirmAnalysisUpload = async () => {
    if (!analysisParsed || !analysisParsed.periodStart || !analysisParsed.periodEnd) { setAnalysisErr("Falta el rango de fechas."); return; }
    // Same exact date range as an already-saved document: it's the same period, so
    // don't add it again (that would double-count "Enviados" for that month).
    const duplicate = analysisPeriods.find(p => p.periodStart === analysisParsed.periodStart && p.periodEnd === analysisParsed.periodEnd);
    if (duplicate) {
      setAnalysisErr(`Ya subiste un documento con este mismo rango de fechas (${duplicate.periodStart} → ${duplicate.periodEnd}, "${duplicate.filename}"). No se volvió a sumar para evitar duplicados.`);
      return;
    }
    setAnalysisSaving(true);
    try {
      await createSampleAnalysisPeriod(analysisParsed.filename, analysisParsed.periodStart, analysisParsed.periodEnd, analysisParsed.rows);
      setAnalysisParsed(null);
      await loadAnalysis();
    } catch (err: any) { setAnalysisErr(err?.message ?? "Error al guardar el documento."); }
    finally { setAnalysisSaving(false); }
  };

  // Samples shipped this cycle vs the fixed monthly goal, and the shared
  // "% of videos made" setting that feeds the rest of the Indicador #2 bonus.
  const samplesShippedTotal = useMemo(() => {
    const periodsInCycle = analysisPeriods.filter(p => p.periodStart >= officialPeriod.from && p.periodEnd <= officialPeriod.to);
    const periodIds = new Set(periodsInCycle.map(p => p.id));
    return analysisRows.filter(r => periodIds.has(r.periodId)).reduce((s, r) => s + (r.samplesShipped ?? 0), 0);
  }, [analysisPeriods, analysisRows, officialPeriod]);

  const samplesPct = (samplesShippedTotal / SAMPLES_GOAL) * 100;

  const [samplesSettings, setSamplesSettingsState] = useState<{ videoContentPct: number }>({ videoContentPct: 0 });
  useEffect(() => {
    getStrategySamplesSettings(year, cycleId).then(s => setSamplesSettingsState({ videoContentPct: s?.videoContentPct ?? 0 })).catch(() => {});
  }, [year, cycleId]);

  const [videoPctDraft, setVideoPctDraft] = useState("0");
  useEffect(() => { setVideoPctDraft(String(samplesSettings.videoContentPct)); }, [samplesSettings.videoContentPct]);
  const [savingVideoPct, setSavingVideoPct] = useState(false);
  const saveVideoPct = async () => {
    const v = Math.max(0, Math.min(100, Number(videoPctDraft) || 0));
    setSavingVideoPct(true);
    try {
      await setStrategySamplesVideoPct(year, cycleId, v);
      setSamplesSettingsState({ videoContentPct: v });
    } finally { setSavingVideoPct(false); }
  };

  const ind2Amount = samplesBonusAmount(samplesPct) + videosBonusAmount(samplesSettings.videoContentPct);

  const periodsThisCycle = useMemo(() =>
    analysisPeriods
      .filter(p => p.periodStart >= officialPeriod.from && p.periodEnd <= officialPeriod.to)
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart)),
  [analysisPeriods, officialPeriod]);

  const deletePeriod = async (id: number) => {
    if (!confirm("¿Eliminar este documento y sus datos?")) return;
    await deleteSampleAnalysisPeriod(id);
    await loadAnalysis();
  };

  // ── Incident log state ────────────────────────────────────────────────────────
  type IncidentKey = string; // `${agentId}-${'non_buyer'|'neg_review'}`
  const [incidents,     setIncidents]     = useState<Record<IncidentKey, StrategyIncident[]>>({});
  const [openIncident,  setOpenIncident]  = useState<{agentId:number; metric:'non_buyer'|'neg_review'} | null>(null);
  const [incidentForm,  setIncidentForm]  = useState<{orderNumber:string;username:string;note:string;status:'solved'|'pending'|'not_solved'}>({orderNumber:"",username:"",note:"",status:"pending"});
  const [incidentSaving, setIncidentSaving] = useState(false);

  const loadIncidents = useCallback(async (agentId: number, metric: 'non_buyer'|'neg_review') => {
    const key = `${agentId}-${metric}`;
    const data = await getStrategyIncidents(agentId, year, cycleId, metric);
    setIncidents(p => ({ ...p, [key]: data }));
  }, [year, cycleId]);

  const openIncidentPanel = async (agentId: number, metric: 'non_buyer'|'neg_review') => {
    if (openIncident?.agentId === agentId && openIncident?.metric === metric) {
      setOpenIncident(null); return;
    }
    setOpenIncident({ agentId, metric });
    setIncidentForm({ orderNumber:"", username:"", note:"", status:"pending" });
    await loadIncidents(agentId, metric);
  };

  const submitIncident = async () => {
    if (!openIncident || !incidentForm.note.trim()) return;
    setIncidentSaving(true);
    try {
      const created = await createStrategyIncident({
        agentId: openIncident.agentId, year, cycleId,
        metricType: openIncident.metric,
        orderNumber: incidentForm.orderNumber || undefined,
        username: incidentForm.username || undefined,
        note: incidentForm.note, status: incidentForm.status,
      });
      const key = `${openIncident.agentId}-${openIncident.metric}`;
      setIncidents(p => ({ ...p, [key]: [created, ...(p[key] ?? [])] }));
      setIncidentForm({ orderNumber:"", username:"", note:"", status:"pending" });
    } finally { setIncidentSaving(false); }
  };

  const cycleIncidentStatus = async (inc: StrategyIncident) => {
    const next: StrategyIncident["status"] = inc.status==="pending"?"not_solved":inc.status==="not_solved"?"solved":"pending";
    await updateStrategyIncident(inc.id, { status: next });
    const key = `${inc.agentId}-${inc.metricType}`;
    setIncidents(p => ({ ...p, [key]: (p[key]??[]).map(x=>x.id===inc.id?{...x,status:next}:x) }));
  };

  const removeIncident = async (inc: StrategyIncident) => {
    await deleteStrategyIncident(inc.id);
    const key = `${inc.agentId}-${inc.metricType}`;
    setIncidents(p => ({ ...p, [key]: (p[key]??[]).filter(x=>x.id!==inc.id) }));
  };

  useEffect(() => { load(); },        [load]);
  useEffect(() => { loadSamples(); }, [loadSamples]);

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

  // ── Uploads local state ────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadsSubTab, setUploadsSubTab] = useState<"revisar"|"documentos">("revisar");
  const [parsedUpload, setParsedUpload] = useState<{
    filename: string; columns: string[]; nameColumn: string;
    rows: { data: Record<string,string>; displayName: string }[];
  } | null>(null);
  const [uploadErr, setUploadErr] = useState("");
  const [uploadSaving, setUploadSaving] = useState(false);
  const [decidingRowId, setDecidingRowId] = useState<number | null>(null);
  const [uploadSearch, setUploadSearch] = useState("");
  const [uploadStatusFilter, setUploadStatusFilter] = useState<"pending"|"accepted"|"rejected">("pending");
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{filename:string; rows:number; error?:string}[] | null>(null);
  const [reinstateMenuId, setReinstateMenuId] = useState<number | null>(null);
  const [reinstatePrompt, setReinstatePrompt] = useState<{id:number; pw:string; err:string} | null>(null);
  const [bulkNamesOpen, setBulkNamesOpen] = useState(false);
  const [bulkNamesText, setBulkNamesText] = useState("");
  const [bulkNamesSaving, setBulkNamesSaving] = useState(false);

  const submitBulkNames = async () => {
    const names = Array.from(new Set(
      bulkNamesText.split(/[\n,;]+/).map(n => n.trim()).filter(Boolean)
    ));
    if (names.length === 0) return;
    setBulkNamesSaving(true);
    try {
      await createUploadBatch(
        `Ingreso manual — ${new Date().toLocaleDateString("es-CO")}`,
        ["Username"], "Username",
        names.map(n => ({ data: { Username: n }, displayName: n }))
      );
      setBulkNamesText(""); setBulkNamesOpen(false);
      await loadUploads();
    } finally { setBulkNamesSaving(false); }
  };

  const parseWorkbookRows = (wb: XLSX.WorkBook) => {
    const json: Record<string,string>[] = wb.SheetNames.flatMap(name =>
      XLSX.utils.sheet_to_json<Record<string,string>>(wb.Sheets[name], { defval: "" })
    );
    const columns = Array.from(new Set(json.flatMap(row => Object.keys(row))));
    const guess = columns.find(c => NAME_COLUMN_HINTS.test(c)) ?? columns[0];
    return { json, columns, guess };
  };

  const handleFileSelected = async (file: File) => {
    setUploadErr("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const { json, columns, guess } = parseWorkbookRows(wb);
      if (json.length === 0) { setUploadErr("El archivo no tiene filas."); return; }
      setParsedUpload({
        filename: file.name, columns, nameColumn: guess,
        rows: json.map(row => ({ data: row, displayName: String(row[guess] ?? "").trim() })),
      });
    } catch { setUploadErr("No se pudo leer el archivo. Verifica que sea un Excel válido."); }
  };

  const handleFilesSelected = async (fileList: FileList) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    if (files.length === 1) { await handleFileSelected(files[0]); return; }
    setUploadErr(""); setBulkResult(null); setBulkUploading(true);
    const results: {filename:string; rows:number; error?:string}[] = [];
    for (const file of files) {
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const { json, columns, guess } = parseWorkbookRows(wb);
        if (json.length === 0) { results.push({ filename: file.name, rows: 0, error: "Sin filas" }); continue; }
        const rows = json.map(row => ({ data: row, displayName: String(row[guess] ?? "").trim() }));
        await createUploadBatch(file.name, columns, guess, rows);
        results.push({ filename: file.name, rows: rows.length });
      } catch (err: any) {
        results.push({ filename: file.name, rows: 0, error: err?.message ?? "No se pudo leer el archivo." });
      }
    }
    setBulkUploading(false);
    setBulkResult(results);
    await loadUploads();
  };

  const updateParsedNameColumn = (col: string) => {
    if (!parsedUpload) return;
    setParsedUpload({
      ...parsedUpload, nameColumn: col,
      rows: parsedUpload.rows.map(r => ({ ...r, displayName: String(r.data[col] ?? "").trim() })),
    });
  };

  const confirmUpload = async () => {
    if (!parsedUpload) return;
    setUploadSaving(true);
    try {
      await createUploadBatch(parsedUpload.filename, parsedUpload.columns, parsedUpload.nameColumn, parsedUpload.rows);
      setParsedUpload(null);
      await loadUploads();
    } catch (err: any) { setUploadErr(err?.message ?? "Error al guardar el archivo."); }
    finally { setUploadSaving(false); }
  };

  const acceptUploadRow = async (row: UploadRow) => {
    const agentId = agents[0]?.id;
    if (!agentId) { alert("No hay agentes. Ve a Settings primero."); return; }
    setDecidingRowId(row.id);
    try {
      const today = new Date().toISOString().slice(0,10);
      const { year: sy, month: sm } = parseDateParts(today);
      const sample = await createStrategySample({
        agentId, username: row.displayName, sku: "", sentDate: today,
        videosPublished: 0, year: sy, month: sm,
        notes: `Aprobado desde upload: ${uploadBatches.find(b=>b.id===row.uploadId)?.filename ?? ""}`,
        deliveryStatus: "requested", catalogId: undefined,
      });
      await decideUploadRow(row.id, "accepted", sample.id);
      await Promise.all([loadUploads(), loadSamples()]);
    } finally { setDecidingRowId(null); }
  };

  const rejectUploadRow = async (row: UploadRow) => {
    setDecidingRowId(row.id);
    try { await decideUploadRow(row.id, "rejected"); await loadUploads(); }
    finally { setDecidingRowId(null); }
  };

  const [uploadRowSelected, setUploadRowSelected] = useState<Set<number>>(new Set());
  const [bulkActingRows, setBulkActingRows] = useState(false);
  const toggleUploadRowSelected = (id: number) => {
    setUploadRowSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const bulkAcceptRows = async () => {
    const ids = Array.from(uploadRowSelected);
    if (ids.length === 0) return;
    if (!confirm(`¿Aceptar ${ids.length} solicitud${ids.length!==1?"es":""} seleccionada${ids.length!==1?"s":""}?`)) return;
    setBulkActingRows(true);
    try {
      const rows = filteredUploadRows.filter(r => uploadRowSelected.has(r.id));
      for (const row of rows) await acceptUploadRow(row);
      setUploadRowSelected(new Set());
    } finally { setBulkActingRows(false); }
  };

  const bulkRejectRows = async () => {
    const ids = Array.from(uploadRowSelected);
    if (ids.length === 0) return;
    if (!confirm(`¿Rechazar ${ids.length} solicitud${ids.length!==1?"es":""} seleccionada${ids.length!==1?"s":""}?`)) return;
    setBulkActingRows(true);
    try {
      await decideUploadRowsBulk(ids, "rejected");
      setUploadRowSelected(new Set());
      await loadUploads();
    } finally { setBulkActingRows(false); }
  };

  const bulkDeleteRows = async () => {
    const ids = Array.from(uploadRowSelected);
    if (ids.length === 0) return;
    if (!confirm(`¿Eliminar ${ids.length} fila${ids.length!==1?"s":""} seleccionada${ids.length!==1?"s":""}? Esto las borra por completo, no queda registro.`)) return;
    setBulkActingRows(true);
    try {
      await deleteUploadRows(ids);
      setUploadRowSelected(new Set());
      await loadUploads();
    } finally { setBulkActingRows(false); }
  };

  const reinstateRow = async (row: UploadRow, pw: string) => {
    if (!verifySuperAdmin("APT", pw)) {
      setReinstatePrompt({ id: row.id, pw, err: "Contraseña incorrecta." });
      return;
    }
    setDecidingRowId(row.id);
    try {
      if (row.decision === "accepted" && row.sampleId) await deleteStrategySample(row.sampleId);
      await reinstateUploadRow(row.id);
      setReinstatePrompt(null);
      setReinstateMenuId(null);
      await Promise.all([loadUploads(), loadSamples()]);
    } finally { setDecidingRowId(null); }
  };

  useEffect(() => { setUploadRowSelected(new Set()); }, [uploadStatusFilter]);

  const filteredUploadRows = useMemo(() => {
    const q = uploadSearch.trim().toLowerCase();
    const rows = uploadRows.filter(r =>
      r.decision === uploadStatusFilter &&
      (!q || r.displayName.toLowerCase().includes(q))
    );
    if (uploadStatusFilter !== "pending") {
      rows.sort((a,b) => new Date(b.decidedAt ?? 0).getTime() - new Date(a.decidedAt ?? 0).getTime());
    }
    return rows;
  }, [uploadRows, uploadSearch, uploadStatusFilter]);

  const uploadExtraColumns = useMemo(() => {
    const set = new Set<string>();
    uploadRows.forEach(r => {
      const batch = uploadBatches.find(b => b.id === r.uploadId);
      if (!batch) return;
      batch.columns.forEach(c => { if (c !== batch.nameColumn) set.add(c); });
    });
    return Array.from(set);
  }, [uploadRows, uploadBatches]);

  const downloadUploadBatch = (batch: UploadBatch) => {
    const rows = uploadRows.filter(r => r.uploadId === batch.id);
    const sheetRows = rows.map(r => ({
      ...r.data,
      "Decisión": r.decision === "accepted" ? "Aceptado" : r.decision === "rejected" ? "Rechazado" : "Pendiente",
    }));
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resultado");
    XLSX.writeFile(wb, `resultado_${batch.filename.replace(/\.[^.]+$/,"")}.xlsx`);
  };

  const removeUploadBatch = async (batch: UploadBatch) => {
    const rows = uploadRows.filter(r => r.uploadId === batch.id);
    if (!confirm(`¿Eliminar "${batch.filename}" y sus ${rows.length} fila${rows.length!==1?"s":""}? Los samples ya creados a partir de aceptaciones NO se borran.`)) return;
    await deleteUploadBatch(batch.id);
    await loadUploads();
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
              const b     = entry ? calcBonus(entry, ind2Amount) : null;
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
                        scalePct={roiBonusAmount(entry.roiPct)/IND1_MAX}
                        detail={`ROI del ciclo: ${entry.roiPct}%`} />
                      <IndSummaryCard num="2" weight="30%" label="Samples enviados" earned={b!.ind2} max={IND2_MAX} color={C.samples}
                        scalePct={ind2Amount/IND2_MAX}
                        detail={`${samplesShippedTotal}/${SAMPLES_GOAL} samples (${Math.round(samplesPct)}%) · Videos: ${samplesSettings.videoContentPct}%`} />
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
                  {r:"4–4.99%",d:"Muy bajo",p:"20%",b:"$52.000",c:"#dc2626"},{r:"3–3.99%",d:"Inicial",p:"monto fijo",b:"$30.000",c:"#b45309"},
                  {r:"2–2.99%",d:"Inicial",p:"monto fijo",b:"$20.000",c:"#b45309"},{r:"1–1.99%",d:"Inicial",p:"monto fijo",b:"$10.000",c:"#b45309"},
                  {r:"< 1%",d:"Sin bono",p:"0%",b:"$0",c:"#9ca3af"},
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
                        <div style={{fontSize:"1.15rem",fontWeight:800,color:C.roi}}>${cop(roiBonusAmount(d.roiPct))} COP</div>
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
                      <div style={{fontSize:"0.75rem",color:"#64748b"}}>{pct(roiBonusAmount(d.roiPct)/IND1_MAX)} del bono máximo · Máx ${cop(IND1_MAX)} COP</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* ═══ UPLOADS ════════════════════════════════════════════════════════ */}
        {tab==="uploads" && (
          <section>
            <header className="section-header">
              <div><h2>Uploads — Documentos de la agencia</h2>
                <p style={{color:"var(--text-muted)",fontSize:"0.85rem",margin:0}}>Sube el Excel de influencers, apruébalos o recházalos.</p>
              </div>
            </header>

            <div style={{display:"flex",gap:"0.4rem",marginBottom:"1rem"}}>
              <button style={{...qBtn,borderColor:uploadsSubTab==="revisar"?"#0891b2":"#e2e8f0",color:uploadsSubTab==="revisar"?C.samples:"#64748b"}} onClick={()=>setUploadsSubTab("revisar")}>Revisar</button>
              <button style={{...qBtn,borderColor:uploadsSubTab==="documentos"?"#0891b2":"#e2e8f0",color:uploadsSubTab==="documentos"?C.samples:"#64748b"}} onClick={()=>setUploadsSubTab("documentos")}>Documentos subidos</button>
            </div>

            {uploadsSubTab==="revisar" && (
              <>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" multiple style={{display:"none"}}
                  onChange={e=>{const fs=e.target.files; if(fs && fs.length) handleFilesSelected(fs); e.target.value="";}} />

                {!parsedUpload && (
                  <div style={{marginBottom:"1rem"}}>
                    <div style={{display:"flex",gap:"0.5rem",flexWrap:"wrap"}}>
                      <button className="btn btn-primary" disabled={bulkUploading} onClick={()=>fileInputRef.current?.click()}>
                        {bulkUploading?"Subiendo...":"+ Subir Excel"}
                      </button>
                      <button className="btn btn-secondary" onClick={()=>setBulkNamesOpen(v=>!v)}>+ Agregar nombres en bulk</button>
                    </div>
                    <p style={{fontSize:"0.75rem",color:"#94a3b8",margin:"0.4rem 0 0"}}>Puedes seleccionar varios archivos a la vez.</p>
                    {uploadErr && <p style={{color:"#dc2626",fontSize:"0.85rem",marginTop:"0.5rem"}}>{uploadErr}</p>}
                    {bulkNamesOpen && (
                      <div className="card" style={{marginTop:"0.75rem",maxWidth:420,border:`2px solid ${C.samples}`,background:"#f0f9ff"}}>
                        <label style={lbl}>Pega los usernames (uno por línea, o separados por coma)</label>
                        <textarea className="form-control" rows={6} placeholder={"peytonxblack\nchristinadesid\nchaoticfamof8sahm"}
                          value={bulkNamesText} onChange={e=>setBulkNamesText(e.target.value)} />
                        <p style={{fontSize:"0.75rem",color:"#64748b",margin:"0.4rem 0 0.75rem"}}>
                          {bulkNamesText.split(/[\n,;]+/).map(n=>n.trim()).filter(Boolean).length} nombre(s) detectados — entran como "Pendientes" para revisar.
                        </p>
                        <div style={{display:"flex",gap:"0.5rem"}}>
                          <button className="btn btn-primary btn-sm" disabled={bulkNamesSaving} onClick={submitBulkNames}>{bulkNamesSaving?"...":"Agregar"}</button>
                          <button className="btn btn-secondary btn-sm" onClick={()=>{setBulkNamesOpen(false);setBulkNamesText("");}}>Cancelar</button>
                        </div>
                      </div>
                    )}
                    {bulkResult && (
                      <div className="card" style={{marginTop:"0.75rem",maxWidth:420}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.5rem"}}>
                          <h4 style={{margin:0}}>Resultado de la subida masiva</h4>
                          <button className="btn btn-sm btn-secondary" onClick={()=>setBulkResult(null)}>Cerrar</button>
                        </div>
                        {bulkResult.map((r,i)=>(
                          <div key={i} style={{display:"flex",justifyContent:"space-between",gap:"0.5rem",fontSize:"0.8rem",padding:"0.25rem 0",borderBottom:i<bulkResult.length-1?"1px solid #f1f5f9":"none"}}>
                            <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.filename}</span>
                            {r.error
                              ? <span style={{color:"#b91c1c",fontWeight:600,flexShrink:0}}>✗ {r.error}</span>
                              : <span style={{color:"#166534",fontWeight:600,flexShrink:0}}>✓ {r.rows} filas</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {parsedUpload && (
                  <div className="card" style={{marginBottom:"1rem",border:`2px solid ${C.samples}`,background:"#f0f9ff"}}>
                    <h4 style={{margin:"0 0 0.75rem",color:C.samples}}>{parsedUpload.filename}</h4>
                    <p style={{fontSize:"0.82rem",color:"#64748b",margin:"0 0 0.75rem"}}>{parsedUpload.rows.length} filas detectadas.</p>
                    <div style={{marginBottom:"1rem"}}>
                      <label style={lbl}>¿Cuál columna tiene el nombre/usuario del influencer?</label>
                      <select className="form-control" style={{maxWidth:280}} value={parsedUpload.nameColumn} onChange={e=>updateParsedNameColumn(e.target.value)}>
                        {parsedUpload.columns.map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div style={{maxHeight:180,overflowY:"auto",border:"1px solid #e2e8f0",borderRadius:8,marginBottom:"1rem"}}>
                      <table className="data-table" style={{margin:0}}>
                        <thead><tr><th>#</th><th>Nombre detectado</th>{parsedUpload.columns.filter(c=>c!==parsedUpload.nameColumn).map(c=><th key={c}>{c}</th>)}</tr></thead>
                        <tbody>
                          {parsedUpload.rows.slice(0,8).map((r,i)=>(
                            <tr key={i}>
                              <td>{i+1}</td>
                              <td style={{fontWeight:600}}>{r.displayName || <em style={{color:"#94a3b8"}}>vacío</em>}</td>
                              {parsedUpload.columns.filter(c=>c!==parsedUpload.nameColumn).map(c=><td key={c} style={{fontSize:"0.82rem",color:"#64748b"}}>{r.data[c] ?? ""}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {parsedUpload.rows.length>8 && <p style={{fontSize:"0.75rem",color:"#94a3b8",padding:"0.5rem"}}>… y {parsedUpload.rows.length-8} más</p>}
                    </div>
                    {uploadErr && <p style={{color:"#dc2626",fontSize:"0.85rem",marginBottom:"0.75rem"}}>{uploadErr}</p>}
                    <div style={{display:"flex",gap:"0.5rem"}}>
                      <button className="btn btn-primary btn-sm" disabled={uploadSaving} onClick={confirmUpload}>{uploadSaving?"...":"Confirmar y guardar"}</button>
                      <button className="btn btn-secondary btn-sm" onClick={()=>{setParsedUpload(null);setUploadErr("");}}>Cancelar</button>
                    </div>
                  </div>
                )}

                <div style={{display:"flex",gap:"0.5rem",marginBottom:"0.75rem",flexWrap:"wrap",alignItems:"center"}}>
                  <input className="form-control" style={{maxWidth:260}} placeholder="Buscar por nombre..."
                    value={uploadSearch} onChange={e=>setUploadSearch(e.target.value)} />
                  <div style={{display:"flex",gap:"0.4rem"}}>
                    {([["pending","Pendientes"],["accepted","Aceptados"],["rejected","Rechazados"]] as const).map(([k,l])=>(
                      <button key={k} style={{...qBtn,borderColor:uploadStatusFilter===k?"#0891b2":"#e2e8f0",color:uploadStatusFilter===k?C.samples:"#64748b"}}
                        onClick={()=>setUploadStatusFilter(k)}>{l}</button>
                    ))}
                  </div>
                </div>

                {uploadStatusFilter==="pending" && (
                  <div style={{display:"flex",gap:"0.5rem",marginBottom:"0.75rem",flexWrap:"wrap",alignItems:"center"}}>
                    <button className="btn btn-sm btn-secondary" style={{color:"#166534",borderColor:"#bbf7d0"}}
                      disabled={uploadRowSelected.size===0||bulkActingRows} onClick={bulkAcceptRows}>
                      {bulkActingRows?"...":`✓ Aceptar seleccionados${uploadRowSelected.size>0?` (${uploadRowSelected.size})`:""}`}
                    </button>
                    <button className="btn btn-sm btn-secondary" style={{color:"#b91c1c",borderColor:"#fecaca"}}
                      disabled={uploadRowSelected.size===0||bulkActingRows} onClick={bulkRejectRows}>
                      {bulkActingRows?"...":`✗ Rechazar seleccionados${uploadRowSelected.size>0?` (${uploadRowSelected.size})`:""}`}
                    </button>
                    <button className="btn btn-sm btn-danger"
                      disabled={uploadRowSelected.size===0||bulkActingRows} onClick={bulkDeleteRows}>
                      {bulkActingRows?"...":`🗑 Eliminar seleccionados${uploadRowSelected.size>0?` (${uploadRowSelected.size})`:""}`}
                    </button>
                  </div>
                )}

                <div className="card" style={{overflowX:"auto"}}>
                  <p style={{fontSize:"0.8rem",color:"var(--text-muted)",margin:"0 0 0.75rem"}}>{filteredUploadRows.length} influencer{filteredUploadRows.length!==1?"s":""}</p>
                  {filteredUploadRows.length===0 ? (
                    <EmptyCard msg="No hay influencers en este filtro." />
                  ) : (
                    <table className="data-table">
                      <thead><tr>
                        {uploadStatusFilter==="pending" && (
                          <th style={{textAlign:"center"}}>
                            <input type="checkbox" style={{width:16,height:16,cursor:"pointer"}}
                              checked={filteredUploadRows.length>0 && filteredUploadRows.every(r=>uploadRowSelected.has(r.id))}
                              onChange={e=>setUploadRowSelected(e.target.checked ? new Set(filteredUploadRows.map(r=>r.id)) : new Set())} />
                          </th>
                        )}
                        <th>Nombre</th>{uploadExtraColumns.map(c=><th key={c}>{c}</th>)}<th>Estado</th><th>Acciones</th></tr></thead>
                      <tbody>
                        {filteredUploadRows.map(r=>{
                          const busy = decidingRowId===r.id;
                          return (
                            <tr key={r.id}>
                              {uploadStatusFilter==="pending" && (
                                <td style={{textAlign:"center"}}>
                                  <input type="checkbox" checked={uploadRowSelected.has(r.id)} onChange={()=>toggleUploadRowSelected(r.id)} style={{width:16,height:16,cursor:"pointer"}} />
                                </td>
                              )}
                              <td style={{fontWeight:600}}>{r.displayName}</td>
                              {uploadExtraColumns.map(c=><td key={c} style={{fontSize:"0.82rem",color:"var(--text-muted)"}}>{r.data[c] ?? "—"}</td>)}
                              <td>
                                {r.decision==="pending" && <span style={{background:"#f1f5f9",borderRadius:6,padding:"0.15rem 0.5rem",fontSize:"0.72rem",color:"#64748b",fontWeight:700}}>Pendiente</span>}
                                {r.decision==="accepted" && <span style={{background:"#f0fdf4",borderRadius:6,padding:"0.15rem 0.5rem",fontSize:"0.72rem",color:"#166534",fontWeight:700}}>✓ Aceptado</span>}
                                {r.decision==="rejected" && <span style={{background:"#fef2f2",borderRadius:6,padding:"0.15rem 0.5rem",fontSize:"0.72rem",color:"#b91c1c",fontWeight:700}}>✗ Rechazado</span>}
                              </td>
                              <td style={{whiteSpace:"nowrap",position:"relative"}}>
                                {r.decision==="pending" && (
                                  <div style={{display:"flex",gap:"0.3rem"}}>
                                    <button className="btn btn-sm btn-secondary" style={{color:"#166534",borderColor:"#bbf7d0"}} disabled={busy} onClick={()=>acceptUploadRow(r)}>{busy?"...":"Aceptar"}</button>
                                    <button className="btn btn-sm btn-secondary" style={{color:"#b91c1c",borderColor:"#fecaca"}} disabled={busy} onClick={()=>rejectUploadRow(r)}>{busy?"...":"Rechazar"}</button>
                                  </div>
                                )}
                                {r.decision!=="pending" && (
                                  <div style={{position:"relative",display:"inline-block"}}>
                                    <button className="btn btn-sm btn-secondary" style={{padding:"0.25rem 0.6rem"}}
                                      onClick={()=>{setReinstateMenuId(reinstateMenuId===r.id?null:r.id); setReinstatePrompt(null);}}>⋯</button>
                                    {reinstateMenuId===r.id && (
                                      <div className="card" style={{position:"absolute",right:0,top:"110%",zIndex:20,width:220,padding:"0.75rem"}}>
                                        {reinstatePrompt?.id===r.id ? (
                                          <>
                                            <label style={lbl}>Contraseña de administrador</label>
                                            <input type="password" className="form-control" autoFocus
                                              value={reinstatePrompt.pw}
                                              onChange={e=>setReinstatePrompt({id:r.id,pw:e.target.value,err:""})}
                                              onKeyDown={e=>{if(e.key==="Enter") reinstateRow(r, reinstatePrompt.pw);}} />
                                            {reinstatePrompt.err && <p style={{color:"#dc2626",fontSize:"0.75rem",margin:"0.3rem 0 0"}}>{reinstatePrompt.err}</p>}
                                            <div style={{display:"flex",gap:"0.3rem",marginTop:"0.5rem"}}>
                                              <button className="btn btn-sm btn-primary" disabled={busy} onClick={()=>reinstateRow(r, reinstatePrompt.pw)}>{busy?"...":"Confirmar"}</button>
                                              <button className="btn btn-sm btn-secondary" onClick={()=>setReinstatePrompt(null)}>Cancelar</button>
                                            </div>
                                          </>
                                        ) : (
                                          <button className="btn btn-sm btn-secondary" style={{width:"100%"}}
                                            onClick={()=>setReinstatePrompt({id:r.id,pw:"",err:""})}>↩ Reintegrar a pendientes</button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}

            {uploadsSubTab==="documentos" && (
              <div className="card" style={{overflowX:"auto"}}>
                {uploadBatches.length===0 ? (
                  <EmptyCard msg="No se han subido documentos todavía." />
                ) : (
                  <table className="data-table">
                    <thead><tr><th>Archivo</th><th>Subido</th><th>Filas</th><th>Aceptados</th><th>Rechazados</th><th>Pendientes</th><th>Acciones</th></tr></thead>
                    <tbody>
                      {uploadBatches.map(b=>{
                        const rows = uploadRows.filter(r=>r.uploadId===b.id);
                        const accepted = rows.filter(r=>r.decision==="accepted").length;
                        const rejected = rows.filter(r=>r.decision==="rejected").length;
                        const pending  = rows.filter(r=>r.decision==="pending").length;
                        return (
                          <tr key={b.id}>
                            <td style={{fontWeight:600}}>{b.filename}</td>
                            <td style={{fontSize:"0.8rem",color:"var(--text-muted)"}}>{new Date(b.uploadedAt).toLocaleString("es-CO")}</td>
                            <td>{rows.length}</td>
                            <td style={{color:"#166534",fontWeight:700}}>{accepted}</td>
                            <td style={{color:"#b91c1c",fontWeight:700}}>{rejected}</td>
                            <td style={{color:"#92400e",fontWeight:700}}>{pending}</td>
                            <td style={{whiteSpace:"nowrap",display:"flex",gap:"0.3rem"}}>
                              <button className="btn btn-sm btn-secondary" onClick={()=>downloadUploadBatch(b)}>Descargar</button>
                              <button className="btn btn-sm btn-danger" onClick={()=>removeUploadBatch(b)}>Eliminar</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </section>
        )}

        {/* ═══ SAMPLES ════════════════════════════════════════════════════════ */}
        {tab==="samples" && (
          <section>
            <header className="section-header">
              <div><h2>Samples enviados</h2>
                <p style={{color:"var(--text-muted)",fontSize:"0.85rem",margin:0}}>Indicador #2 · 30% del bono variable · Máx $195.000 COP · Meta: 755 samples enviados por ciclo</p>
              </div>
            </header>

            <input ref={analysisFileRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}}
              onChange={e=>{const f=e.target.files?.[0]; if(f) handleAnalysisFileSelected(f); e.target.value="";}} />

            {!analysisParsed && (
              <div style={{marginBottom:"1.1rem"}}>
                <button className="btn btn-primary" onClick={()=>analysisFileRef.current?.click()}>+ Subir documento</button>
                {analysisErr && <p style={{color:"#dc2626",fontSize:"0.85rem",marginTop:"0.5rem"}}>{analysisErr}</p>}
              </div>
            )}

            {analysisParsed && (
              <div className="card" style={{marginBottom:"1.1rem",border:`2px solid ${C.samples}`,background:"#f0f9ff"}}>
                <h4 style={{margin:"0 0 0.75rem",color:C.samples}}>{analysisParsed.filename}</h4>
                <p style={{fontSize:"0.82rem",color:"#64748b",margin:"0 0 0.75rem"}}>{analysisParsed.rows.length} productos detectados.</p>
                <div style={{display:"flex",gap:"0.75rem",marginBottom:"1rem"}}>
                  <div><label style={lbl}>Desde</label>
                    <input type="date" className="form-control" value={analysisParsed.periodStart}
                      onChange={e=>setAnalysisParsed({...analysisParsed,periodStart:e.target.value})} /></div>
                  <div><label style={lbl}>Hasta</label>
                    <input type="date" className="form-control" value={analysisParsed.periodEnd}
                      onChange={e=>setAnalysisParsed({...analysisParsed,periodEnd:e.target.value})} /></div>
                </div>
                {analysisErr && <p style={{color:"#dc2626",fontSize:"0.85rem",marginBottom:"0.75rem"}}>{analysisErr}</p>}
                <div style={{display:"flex",gap:"0.5rem"}}>
                  <button className="btn btn-primary btn-sm" disabled={analysisSaving} onClick={confirmAnalysisUpload}>{analysisSaving?"...":"Confirmar y guardar"}</button>
                  <button className="btn btn-secondary btn-sm" onClick={()=>{setAnalysisParsed(null);setAnalysisErr("");}}>Cancelar</button>
                </div>
              </div>
            )}

            {/* Summary: samples shipped vs goal */}
            <div className="card" style={{marginBottom:"1.1rem"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:"0.5rem"}}>
                <span style={{fontWeight:700,fontSize:"0.85rem",color:"#1e293b"}}>Samples enviados este ciclo</span>
                <span style={{fontWeight:800,fontSize:"1.1rem",color:C.samples}}>{samplesShippedTotal} / {SAMPLES_GOAL}</span>
              </div>
              <div style={{height:8,background:"#e2e8f0",borderRadius:4,overflow:"hidden",marginBottom:"0.4rem"}}>
                <div style={{width:`${Math.min(100,samplesPct)}%`,height:"100%",background:C.samples,transition:"width 0.4s",borderRadius:4}} />
              </div>
              <div style={{fontSize:"0.75rem",color:"#64748b"}}>{Math.round(samplesPct)}% de la meta</div>
            </div>

            {/* Uploaded periods within this cycle */}
            {periodsThisCycle.length === 0 ? (
              <EmptyCard msg="No hay documentos subidos para este ciclo." />
            ) : (
              <div style={{marginBottom:"1.1rem"}}>
                {periodsThisCycle.map(period => {
                  const shipped = analysisRows.filter(r => r.periodId === period.id).reduce((s,r) => s + (r.samplesShipped ?? 0), 0);
                  return (
                    <div key={period.id} className="card" style={{marginBottom:"0.6rem",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"0.5rem"}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:"0.85rem",color:"#1e293b"}}>{period.periodStart} → {period.periodEnd}</div>
                        <div style={{fontSize:"0.75rem",color:"#94a3b8"}}>{period.filename} · {shipped} samples enviados</div>
                      </div>
                      <button className="btn btn-sm btn-danger" onClick={()=>deletePeriod(period.id)}>Eliminar</button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Manual "% de videos hechos" */}
            <div className="card" style={{marginBottom:"1.1rem"}}>
              <p style={{fontWeight:700,fontSize:"0.75rem",color:C.samples,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"0.6rem"}}>% de videos hechos</p>
              <div style={{display:"flex",gap:"0.5rem",alignItems:"center"}}>
                <input type="number" min={0} max={100} className="form-control" style={{maxWidth:120}}
                  value={videoPctDraft} onChange={e=>setVideoPctDraft(e.target.value)} />
                <span style={{fontSize:"0.85rem",color:"#64748b"}}>%</span>
                <button className="btn btn-primary btn-sm" disabled={savingVideoPct} onClick={saveVideoPct}>{savingVideoPct?"...":"Guardar"}</button>
              </div>
              <p style={{fontSize:"0.75rem",color:"#94a3b8",marginTop:"0.5rem",marginBottom:0}}>
                Aproximadamente 2 videos por sample enviado es un buen punto de referencia.
              </p>
            </div>

            {/* Bonus breakdown */}
            <div className="card" style={{marginBottom:"1.1rem",background:"#f0f9ff",border:"1px solid #bae6fd"}}>
              <p style={{fontWeight:700,fontSize:"0.75rem",color:C.samples,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"0.85rem"}}>Desglose del bono</p>
              <div style={{display:"flex",justifyContent:"space-between",padding:"0.4rem 0",fontSize:"0.85rem"}}>
                <span style={{color:"#64748b"}}>Samples enviados</span>
                <span style={{fontWeight:700,color:"#1e293b"}}>${cop(samplesBonusAmount(samplesPct))} de ${cop(SAMPLES_BONUS_MAX)}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",padding:"0.4rem 0",fontSize:"0.85rem"}}>
                <span style={{color:"#64748b"}}>Videos hechos</span>
                <span style={{fontWeight:700,color:"#1e293b"}}>${cop(videosBonusAmount(samplesSettings.videoContentPct))} de ${cop(VIDEOS_BONUS_MAX)}</span>
              </div>
              <div style={{borderTop:"1px solid #bae6fd",marginTop:"0.5rem",paddingTop:"0.6rem",display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                <span style={{fontWeight:700,fontSize:"0.85rem",color:"#1e293b"}}>Total Indicador #2</span>
                <span style={{fontWeight:800,fontSize:"1.1rem",color:C.samples}}>${cop(ind2Amount)} de ${cop(IND2_MAX)} COP</span>
              </div>
            </div>
          </section>
        )}

        {/* ═══ CONCURSO DE AFILIADOS ══════════════════════════════════════════ */}
        {tab==="concurso" && (
          <section>
            <header className="section-header">
              <div><h2>Concurso de Afiliados</h2>
                <p style={{color:"var(--text-muted)",fontSize:"0.85rem",margin:0}}>
                  Ranking por videos publicados. Solo compiten los que tienen el ✓ de producto boleto de entrada.
                </p>
              </div>
            </header>

            <div style={{display:"flex",gap:"0.5rem",marginBottom:"1rem",flexWrap:"wrap",alignItems:"center"}}>
              <input ref={contestFileRef} type="file" accept=".csv,.xlsx,.xls" style={{display:"none"}}
                onChange={e=>{const f=e.target.files?.[0]; if(f) handleContestFileSelected(f); e.target.value="";}} />
              <button className="btn btn-primary" disabled={contestImporting} onClick={()=>contestFileRef.current?.click()}>
                {contestImporting?"Importando...":"⇪ Subir documento"}
              </button>
              <input type="text" className="form-control" style={{maxWidth:240}} placeholder="Buscar username..."
                value={contestSearch} onChange={e=>setContestSearch(e.target.value)} />
              <button className="btn btn-danger" disabled={contestSelected.size===0} onClick={removeSelectedContestEntries}>
                🗑 Eliminar seleccionados{contestSelected.size>0?` (${contestSelected.size})`:""}
              </button>
            </div>

            {contestResult && (
              <div className="card" style={{marginBottom:"1rem",background:"#f0fdf4",border:"1px solid #bbf7d0"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <p style={{fontSize:"0.82rem",color:"#166534",margin:0}}>
                    {contestResult.added} afiliado{contestResult.added!==1?"s":""} nuevo{contestResult.added!==1?"s":""} · {contestResult.updated} actualizado{contestResult.updated!==1?"s":""}
                    {contestResult.skipped>0 && ` · ${contestResult.skipped} omitido${contestResult.skipped!==1?"s":""} (sin username o videos inválidos)`}
                    {contestResult.matchedSamples>0 && ` · ${contestResult.matchedSamples} sample${contestResult.matchedSamples!==1?"s":""} actualizados con los nuevos videos`}
                    {contestResult.removedZero>0 && ` · ${contestResult.removedZero} afiliado${contestResult.removedZero!==1?"s":""} con 0 videos eliminado${contestResult.removedZero!==1?"s":""}`}
                  </p>
                  <button className="btn btn-sm btn-secondary" onClick={()=>setContestResult(null)}>Cerrar</button>
                </div>
              </div>
            )}

            <div className="card" style={{overflowX:"auto"}}>
              <p style={{fontSize:"0.8rem",color:"var(--text-muted)",margin:"0 0 0.25rem"}}>
                {contestRanked.length} afiliado{contestRanked.length!==1?"s":""} · {contestRanked.filter(e=>e.qualified).length} compitiendo
              </p>
              <p style={{fontSize:"0.75rem",color:"#94a3b8",margin:"0 0 0.75rem",fontWeight:600}}>
                Período: {contestPeriodLabel}
              </p>
              {contestRanked.length===0 ? (
                <EmptyCard msg="Sube el documento de la plataforma para empezar el ranking." />
              ) : (
                <table className="data-table">
                  <thead><tr>
                    <th style={{textAlign:"center"}}>
                      <input type="checkbox" style={{width:16,height:16,cursor:"pointer"}}
                        checked={contestRanked.length>0 && contestRanked.every(e=>contestSelected.has(e.id))}
                        onChange={e=>setContestSelected(e.target.checked ? new Set(contestRanked.map(r=>r.id)) : new Set())} />
                    </th>
                    <th>Puesto</th><th>Username</th><th>Videos</th><th style={{textAlign:"center"}}>✓ Boleto de entrada</th><th>Acciones</th>
                  </tr></thead>
                  <tbody>
                    {contestRanked.map(e => (
                      <tr key={e.id} style={{background: e.qualified ? undefined : "#f8fafc", opacity: e.qualified ? 1 : 0.55}}>
                        <td style={{textAlign:"center"}}>
                          <input type="checkbox" checked={contestSelected.has(e.id)} onChange={()=>toggleContestSelected(e.id)} style={{width:16,height:16,cursor:"pointer"}} />
                        </td>
                        <td style={{fontWeight:800,color:e.qualified?C.samples:"#94a3b8"}}>{e.rank ?? "—"}</td>
                        <td style={{fontWeight:600,color:e.qualified?"#1e293b":"#94a3b8",cursor:"default",userSelect:revealedContestId===e.id?"text":"none"}}
                          onMouseEnter={()=>setRevealedContestId(e.id)}
                          onMouseLeave={()=>setRevealedContestId(null)}
                          title={e.username}>
                          {revealedContestId===e.id ? e.username : CONTEST_MASK}
                        </td>
                        <td style={{fontWeight:700,color:e.qualified?"#15803d":"#94a3b8"}}>{e.videosTotal}</td>
                        <td style={{textAlign:"center"}}>
                          <input type="checkbox" checked={e.qualified} onChange={()=>toggleContestQualified(e)} style={{width:18,height:18,cursor:"pointer"}} />
                        </td>
                        <td>
                          <button className="btn btn-sm btn-danger" onClick={()=>removeContestEntry(e.id)}>Eliminar</button>
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
                        {r:"3.5–4.09",p:"15%",  setVal:3.5},
                        {r:"< 3.5",   p:"0%",   setVal:3.4},
                      ]}
                      onSetVal={v=>setF(ag.id,"productScore",v)}>
                      <input type="number" min={0} max={5} step={0.01} className="form-control"
                        value={nv(d.productScore)} onChange={e=>setF(ag.id,"productScore",parseFloat(e.target.value)||0)} />
                    </SubMetric>
                    <SubMetric color={C.health} label="B. Non-Buyer Fault Rate" sublabel="Meta: ≤ 2.10% · Peso: 50%" scalePct={pB}
                      scales={[
                        {r:"≤ 2.10%",    p:"100%", setVal:2.10},
                        {r:"2.11–2.20%", p:"95%",  setVal:2.15},
                        {r:"2.21–2.30%", p:"90%",  setVal:2.25},
                        {r:"2.31–2.50%", p:"75%",  setVal:2.40},
                        {r:"2.51–3.00%", p:"50%",  setVal:2.75},
                        {r:"> 3.00%",    p:"0%",   setVal:3.10},
                      ]}
                      onSetVal={v=>setF(ag.id,"nonBuyerFaultRate",v)}
                      incidentCount={(incidents[`${ag.id}-non_buyer`]??[]).length}
                      onOpenIncidents={()=>openIncidentPanel(ag.id,"non_buyer")}>
                      <div style={{display:"flex",gap:"0.4rem",alignItems:"center"}}>
                        <input type="number" min={0} max={20} step={0.01} className="form-control"
                          value={nv(d.nonBuyerFaultRate)} onChange={e=>setF(ag.id,"nonBuyerFaultRate",parseFloat(e.target.value)||0)} />
                        <span style={{fontSize:"0.85rem",color:"#64748b"}}>%</span>
                      </div>
                    </SubMetric>
                    <SubMetric color={C.health} label="C. Negative Review Rate" sublabel="Meta: < 0.55% · Peso: 45%" scalePct={pC}
                      scales={[
                        {r:"< 0.55%",    p:"100%", setVal:0.40},
                        {r:"0.55–0.80%", p:"90%",  setVal:0.65},
                        {r:"0.81–0.90%", p:"75%",  setVal:0.85},
                        {r:"0.91–1.30%", p:"50%",  setVal:1.10},
                        {r:"1.31–1.60%", p:"25%",  setVal:1.45},
                        {r:"> 1.60%",    p:"0%",   setVal:1.70},
                      ]}
                      onSetVal={v=>setF(ag.id,"negativeReviewRate",v)}
                      incidentCount={(incidents[`${ag.id}-neg_review`]??[]).length}
                      onOpenIncidents={()=>openIncidentPanel(ag.id,"neg_review")}>
                      <div style={{display:"flex",gap:"0.4rem",alignItems:"center"}}>
                        <input type="number" min={0} max={10} step={0.01} className="form-control"
                          value={nv(d.negativeReviewRate)} onChange={e=>setF(ag.id,"negativeReviewRate",parseFloat(e.target.value)||0)} />
                        <span style={{fontSize:"0.85rem",color:"#64748b"}}>%</span>
                      </div>
                    </SubMetric>
                  </div>
                  {/* ── Incident panel ─────────────────────────────────────── */}
                  {openIncident?.agentId === ag.id && (() => {
                    const metric = openIncident.metric;
                    const key = `${ag.id}-${metric}`;
                    const list = incidents[key] ?? [];
                    const metricLabel = metric==="non_buyer" ? "Non-Buyer Fault Rate" : "Negative Review Rate";
                    const STATUS_COLORS: Record<string, string> = { solved:"#16a34a", pending:"#ca8a04", not_solved:"#dc2626" };
                    const STATUS_LABELS: Record<string, string> = { solved:"Resuelto ✓", pending:"Pendiente ◐", not_solved:"Sin solución ✗" };
                    return (
                      <div style={{marginTop:"1rem",border:`1.5px solid ${C.health}`,borderRadius:10,overflow:"hidden"}}>
                        <div style={{background:C.health,padding:"0.6rem 1rem",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <span style={{color:"white",fontWeight:700,fontSize:"0.85rem"}}>Incidentes · {metricLabel}</span>
                          <button onClick={()=>setOpenIncident(null)} style={{background:"transparent",border:"none",color:"white",cursor:"pointer",fontSize:"1rem",lineHeight:1}}>✕</button>
                        </div>
                        <div style={{padding:"1rem",background:"white"}}>
                          {/* Add form */}
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr auto",gap:"0.5rem",marginBottom:"1rem",alignItems:"end"}}>
                            <div>
                              <label style={lbl}>N° Orden</label>
                              <input className="form-control" placeholder="Opcional" value={incidentForm.orderNumber}
                                onChange={e=>setIncidentForm(f=>({...f,orderNumber:e.target.value}))} />
                            </div>
                            <div>
                              <label style={lbl}>Usuario</label>
                              <input className="form-control" placeholder="Opcional" value={incidentForm.username}
                                onChange={e=>setIncidentForm(f=>({...f,username:e.target.value}))} />
                            </div>
                            <div>
                              <label style={lbl}>Nota *</label>
                              <input className="form-control" placeholder="¿Qué pasó?" value={incidentForm.note}
                                onChange={e=>setIncidentForm(f=>({...f,note:e.target.value}))} />
                            </div>
                            <div style={{display:"flex",flexDirection:"column",gap:"0.25rem"}}>
                              <label style={lbl}>Estado</label>
                              <div style={{display:"flex",gap:"0.25rem"}}>
                                {(["pending","not_solved","solved"] as const).map(s=>(
                                  <button key={s} onClick={()=>setIncidentForm(f=>({...f,status:s}))}
                                    style={{width:28,height:28,borderRadius:"50%",border:`2px solid ${STATUS_COLORS[s]}`,
                                      background:incidentForm.status===s?STATUS_COLORS[s]:"white",cursor:"pointer"}}
                                    title={STATUS_LABELS[s]} />
                                ))}
                              </div>
                            </div>
                          </div>
                          <button className="btn btn-primary btn-sm" onClick={submitIncident} disabled={incidentSaving||!incidentForm.note.trim()} style={{marginBottom:"1rem"}}>
                            {incidentSaving?"...":"+ Agregar incidente"}
                          </button>
                          {/* List */}
                          {list.length===0
                            ? <div style={{textAlign:"center",color:"#94a3b8",fontSize:"0.8rem",padding:"1rem"}}>Sin incidentes registrados</div>
                            : <div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}>
                                {list.map(inc=>(
                                  <div key={inc.id} style={{display:"grid",gridTemplateColumns:"auto 1fr auto",gap:"0.75rem",alignItems:"center",padding:"0.6rem 0.75rem",borderRadius:8,border:"1px solid #e2e8f0",background:"#f8fafc"}}>
                                    <button onClick={()=>cycleIncidentStatus(inc)}
                                      title={STATUS_LABELS[inc.status]}
                                      style={{width:26,height:26,borderRadius:"50%",border:`2px solid ${STATUS_COLORS[inc.status]}`,
                                        background:STATUS_COLORS[inc.status],cursor:"pointer",flexShrink:0}} />
                                    <div>
                                      <div style={{fontSize:"0.8rem",fontWeight:600,color:"#1e293b"}}>
                                        {inc.orderNumber && <span style={{color:"#64748b",marginRight:"0.5rem"}}>#{inc.orderNumber}</span>}
                                        {inc.username && <span style={{color:"#64748b",marginRight:"0.5rem"}}>@{inc.username}</span>}
                                        {inc.note}
                                      </div>
                                      <div style={{fontSize:"0.68rem",color:"#94a3b8"}}>{STATUS_LABELS[inc.status]} · {inc.createdAt.slice(0,10)}</div>
                                    </div>
                                    <button onClick={()=>removeIncident(inc)} style={{background:"transparent",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:"0.9rem"}} title="Eliminar">✕</button>
                                  </div>
                                ))}
                              </div>
                          }
                        </div>
                      </div>
                    );
                  })()}
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
              const bunny = moodBunny(compliancePct);
              return (
                <div key={ag.id} className="card" style={{borderTop:`3px solid ${C.operative}`,marginBottom:"1rem"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.5rem",flexWrap:"wrap",gap:"0.5rem"}}>
                    <div>
                      <h3 style={{margin:0,color:C.operative}}>{ag.name}</h3>
                      <p style={{margin:0,fontSize:"0.8rem",color:"var(--text-muted)"}}>{answeredCount}/{QA_ITEMS.length} preguntas respondidas</p>
                    </div>
                    <div style={{display:"flex",gap:"0.75rem",alignItems:"center"}}>
                      <img src={bunny.src} alt={bunny.label} title={bunny.label} style={{width:90,height:90,objectFit:"contain"}} />
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

function SubMetric({ color, label, sublabel, scalePct, scales, onSetVal, incidentCount, onOpenIncidents, children }:
  { color:string; label:string; sublabel:string; scalePct:number; scales:{r:string;p:string;setVal?:number}[];
    onSetVal?:(v:number)=>void; incidentCount?:number; onOpenIncidents?:()=>void; children:React.ReactNode }) {
  return (
    <div style={{background:"#f8fafc",borderRadius:10,padding:"1rem",border:`1px solid ${color}20`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"0.15rem"}}>
        <div style={{fontSize:"0.8rem",fontWeight:700,color:"#1e293b"}}>{label}</div>
        {onOpenIncidents && (
          <button onClick={onOpenIncidents}
            style={{fontSize:"0.65rem",fontWeight:700,color:"white",background:incidentCount&&incidentCount>0?"#dc2626":"#64748b",
              border:"none",borderRadius:12,padding:"0.15rem 0.5rem",cursor:"pointer",whiteSpace:"nowrap",lineHeight:1.4}}>
            {incidentCount&&incidentCount>0?`${incidentCount} incidente${incidentCount>1?"s":""}`:"Incidentes"}
          </button>
        )}
      </div>
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
