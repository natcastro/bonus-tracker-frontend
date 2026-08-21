import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";
import type { Agent, StrategyEntry, StrategySample, StrategyIncident, SampleCatalogItem, UploadBatch, UploadRow, AffiliateContestEntry } from "../types";
import {
  getAgents, updateAgentName, createAgent, verifySuperAdmin,
  getStrategyEntries, upsertStrategyEntry,
  getStrategySamples, createStrategySample, updateStrategySample, bulkCreateStrategySamples,
  deleteStrategySample, lockSampleBonus, unlockSampleBonus, addVideoLogEntry, removeLastVideoLogEntry,
  getStrategyIncidents, createStrategyIncident, updateStrategyIncident, deleteStrategyIncident,
  getSampleCatalog,
  getUploadBatches, getUploadRows, createUploadBatch, decideUploadRow, reinstateUploadRow, deleteUploadBatch,
  getAffiliateContestEntries, upsertAffiliateContestSnapshot, setAffiliateContestQualified, deleteAffiliateContestEntry, deleteAffiliateContestEntries,
  addVideoLogEntriesBulk,
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

  const [catalog, setCatalog] = useState<SampleCatalogItem[]>([]);
  useEffect(() => { getSampleCatalog().then(setCatalog).catch(()=>{}); }, []);

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

  // Samples sub-tab and inventory month
  const [samplesTab, setSamplesTab] = useState<"tracking"|"inventory">("tracking");
  const [invMonth, setInvMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  });

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

  // ── Samples local state ────────────────────────────────────────────────────
  const [filterUser,   setFilterUser]   = useState("");
  const [filterSku,    setFilterSku]    = useState("");
  const [filterStatus, setFilterStatus] = useState<"all"|"requested"|"pending"|"delivered">("pending");
  const [viewMode,     setViewMode]     = useState<"samples"|"creators">("samples");
  const [showBanner,   setShowBanner]   = useState(true);
  const [viewAllPeriods, setViewAllPeriods] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo,   setFilterDateTo]   = useState("");
  const [addVideoPopoverId, setAddVideoPopoverId] = useState<number|null>(null);
  const [addVideoDate, setAddVideoDate] = useState("");
  const [videoLogBusyId, setVideoLogBusyId] = useState<number|null>(null);

  const daysSince = (dateStr: string): number => {
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return 0;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  };

  const openAddVideo = (id: number) => {
    const d = new Date(); const off = d.getTimezoneOffset();
    setAddVideoDate(new Date(d.getTime() - off*60000).toISOString().slice(0,10));
    setAddVideoPopoverId(id);
  };

  const confirmAddVideo = async (id: number) => {
    if (!addVideoDate) return;
    setVideoLogBusyId(id);
    try { await addVideoLogEntry(id, addVideoDate); setAddVideoPopoverId(null); await loadSamples(); }
    finally { setVideoLogBusyId(null); }
  };

  const removeLastVideo = async (id: number) => {
    if (!confirm("¿Quitar el último video registrado para este sample?")) return;
    setVideoLogBusyId(id);
    try { await removeLastVideoLogEntry(id); await loadSamples(); }
    finally { setVideoLogBusyId(null); }
  };

  const deleteStaleRequest = async (id: number) => {
    if (!confirm("¿Eliminar esta solicitud sin respuesta? Lleva más de 7 días sin actualizarse.")) return;
    await deleteStrategySample(id);
    await loadSamples();
  };

  // ── Historical CSV import (TikTok order export → samples pipeline) ────────
  const historyFileRef = useRef<HTMLInputElement>(null);
  const [historyImporting, setHistoryImporting] = useState(false);
  const [historyResult, setHistoryResult] = useState<{
    total:number; imported:number; skippedCancelled:number; skippedUnrecognized:number; skippedNoUsername:number; reconciled:number;
  } | null>(null);

  const mapOrderStatusToStage = (status: string, substatus: string): "pending"|"delivered"|null => {
    const s = status.trim().toLowerCase();
    const ss = substatus.trim().toLowerCase();
    if (s === "canceled" || s === "cancelled") return null;
    if (s === "completed") return "delivered";
    if (s === "shipped") return ss === "delivered" ? "delivered" : "pending";
    if (s === "to ship") return "pending";
    return null;
  };

  const parseUsDateToIso = (raw: string): string | null => {
    const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    const [, mm, dd, yyyy] = m;
    return `${yyyy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`;
  };

  const handleHistoryCsvSelected = async (file: File) => {
    const agentId = agents[0]?.id;
    if (!agentId) { alert("No hay agentes. Ve a Settings primero."); return; }
    setHistoryImporting(true); setHistoryResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const json = XLSX.utils.sheet_to_json<Record<string,string>>(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
      let skippedCancelled = 0, skippedUnrecognized = 0, skippedNoUsername = 0;
      const toInsert: Omit<StrategySample,"id">[] = [];
      for (const row of json) {
        const status    = String(row["Order Status"] ?? "").trim();
        const substatus = String(row["Order Substatus"] ?? "").trim();
        const username  = String(row["Buyer Username"] ?? "").trim();
        const orderId   = String(row["Order ID"] ?? "").trim();
        const sku       = String(row["Seller SKU"] ?? "").trim();
        const createdRaw = String(row["Created Time"] ?? "").trim();
        if (status.toLowerCase() === "canceled" || status.toLowerCase() === "cancelled") { skippedCancelled++; continue; }
        const stage = mapOrderStatusToStage(status, substatus);
        const iso = parseUsDateToIso(createdRaw);
        if (!stage || !iso) { skippedUnrecognized++; continue; }
        if (!username) { skippedNoUsername++; continue; }
        const { year, month } = parseDateParts(iso);
        toInsert.push({
          agentId, username, sku, sentDate: iso, videosPublished: 0, year, month,
          notes: `Importado de historial CSV — Order ID ${orderId} — Estado original: ${status} / ${substatus}`,
          deliveryStatus: stage, catalogId: undefined,
        });
      }
      if (toInsert.length) await bulkCreateStrategySamples(toInsert);

      // Reconcile: pre-existing "Enviado" samples with no matching creator anywhere in this
      // historical export are demoted back to "Solicitud enviada" — the shipment was never confirmed.
      const csvUsernames = new Set(
        json.map(r => String(r["Buyer Username"] ?? "").trim().toLowerCase()).filter(Boolean)
      );
      const staleOld = allSamples.filter(s =>
        s.deliveryStatus === "pending" &&
        !s.notes?.startsWith("Importado de historial CSV") &&
        !csvUsernames.has(s.username.trim().toLowerCase())
      );
      for (const s of staleOld) {
        await updateStrategySample(s.id, { deliveryStatus: "requested" });
      }

      setHistoryResult({ total: json.length, imported: toInsert.length, skippedCancelled, skippedUnrecognized, skippedNoUsername, reconciled: staleOld.length });
      await loadSamples();
    } catch (err: any) {
      alert(err?.message ?? "Error al importar el historial.");
    } finally { setHistoryImporting(false); }
  };

  const [showAdd,  setShowAdd]  = useState(false);
  const [editing,  setEditing]  = useState<StrategySample | null>(null);
  const [sErr,     setSErr]     = useState("");
  const [sSaving,  setSSaving]  = useState(false);

  const [newS, setNewS] = useState({ username:"", sku:"", sentDate:"", videosPublished:0, notes:"", deliveryStatus:"delivered" as "requested"|"pending"|"delivered", catalogId: undefined as number|undefined });

  // Password prompts
  const [delPw,  setDelPw]  = useState<{ id:number; pw:string; err:string } | null>(null);
  const [movePw, setMovePw] = useState<{ id:number; pw:string; err:string } | null>(null);
  const [lockPw, setLockPw] = useState<{ agId:number; action:"lock"|"unlock"; pw:string; err:string } | null>(null);

  const activeCatalogIds = new Set(catalog.map(c => c.id));
  const isInactiveProduct = (s: StrategySample) =>
    s.catalogId !== undefined && !activeCatalogIds.has(s.catalogId);

  const tableRows = (viewAllPeriods ? allSamples : stats.officialSamples)
    .filter(s => filterStatus === "all" || s.deliveryStatus === filterStatus)
    .filter(s => !filterUser || s.username.toLowerCase().includes(filterUser.toLowerCase()))
    .filter(s => !filterSku  || s.sku.toLowerCase().includes(filterSku.toLowerCase()))
    .filter(s => !filterDateFrom || s.sentDate >= filterDateFrom)
    .filter(s => !filterDateTo   || s.sentDate <= filterDateTo);

  const stageBase = viewAllPeriods ? allSamples : stats.officialSamples;
  const stageCounts = {
    requested: stageBase.filter(s => s.deliveryStatus === "requested").length,
    pending:   stageBase.filter(s => s.deliveryStatus === "pending").length,
    delivered: stageBase.filter(s => s.deliveryStatus === "delivered").length,
  };

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
        notes:newS.notes, deliveryStatus:newS.deliveryStatus, catalogId:newS.catalogId });
      setNewS({ username:"", sku:"", sentDate:"", videosPublished:0, notes:"", deliveryStatus:"delivered", catalogId:undefined });
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

  const markResponded = async (id: number) => {
    await updateStrategySample(id, { responded: true, deliveryStatus: "pending" });
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

                <div className="card" style={{overflowX:"auto"}}>
                  <p style={{fontSize:"0.8rem",color:"var(--text-muted)",margin:"0 0 0.75rem"}}>{filteredUploadRows.length} influencer{filteredUploadRows.length!==1?"s":""}</p>
                  {filteredUploadRows.length===0 ? (
                    <EmptyCard msg="No hay influencers en este filtro." />
                  ) : (
                    <table className="data-table">
                      <thead><tr><th>Nombre</th>{uploadExtraColumns.map(c=><th key={c}>{c}</th>)}<th>Estado</th><th>Acciones</th></tr></thead>
                      <tbody>
                        {filteredUploadRows.map(r=>{
                          const busy = decidingRowId===r.id;
                          return (
                            <tr key={r.id}>
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
              <div><h2>Sample Content Performance</h2>
                <p style={{color:"var(--text-muted)",fontSize:"0.85rem",margin:0}}>Indicador #2 · 30% del bono variable · Máx $195.000 COP · Por creador (Coverage 80pts + Additional 20pts)</p>
              </div>
            </header>

            {/* Sub-tabs */}
            <div style={{display:"flex",gap:"0.5rem",marginBottom:"1.25rem",borderBottom:"2px solid #e2e8f0",paddingBottom:"0"}}>
              {([["tracking","📦 Tracking"],["inventory","📋 Inventario de Samples"]] as const).map(([k,l])=>(
                <button key={k} onClick={()=>setSamplesTab(k)}
                  style={{padding:"0.5rem 1.1rem",border:"none",borderBottom:samplesTab===k?`2px solid ${C.samples}`:"2px solid transparent",
                    marginBottom:-2,background:"transparent",fontWeight:samplesTab===k?700:500,
                    color:samplesTab===k?C.samples:"#64748b",cursor:"pointer",fontSize:"0.85rem"}}>
                  {l}
                </button>
              ))}
            </div>

            {/* ── INVENTORY TAB ─────────────────────────────────────────────── */}
            {samplesTab==="inventory" && (
              <div>
                <div style={{display:"flex",alignItems:"center",gap:"1rem",marginBottom:"1.25rem",flexWrap:"wrap",justifyContent:"space-between"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"1rem",flexWrap:"wrap"}}>
                    <div>
                      <label style={lbl}>Mes</label>
                      <input type="month" className="form-control" value={invMonth} onChange={e=>setInvMonth(e.target.value)} style={{maxWidth:170}} />
                    </div>
                    <div style={{fontSize:"0.8rem",color:"#64748b",marginTop:"1rem"}}>
                      Mostrando samples enviados en {new Date(invMonth+"-01").toLocaleString("es-CO",{month:"long",year:"numeric"})}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const monthLabel = new Date(invMonth+"-01").toLocaleString("es-CO",{month:"long",year:"numeric"});
                      const rows = catalog.map(item => {
                        const sent  = allSamples.filter(s=>s.catalogId===item.id && s.sentDate.startsWith(invMonth) && s.deliveryStatus !== "requested").length;
                        const avail = Math.max(0, item.monthlyQuota - sent);
                        const done  = sent >= item.monthlyQuota;
                        const started = sent > 0 && !done;
                        return {
                          "Producto":       item.productName,
                          "Product ID":     item.productId || "",
                          "Cuota mensual":  item.monthlyQuota,
                          "Enviados":       sent,
                          "Disponibles":    avail,
                          "Estado":         done ? "Completo" : started ? "En progreso" : "Pendiente",
                        };
                      });
                      const totalSent = catalog.reduce((s,c)=>s+allSamples.filter(x=>x.catalogId===c.id&&x.sentDate.startsWith(invMonth) && x.deliveryStatus !== "requested").length,0);
                      rows.push({
                        "Producto": "TOTAL", "Product ID": "",
                        "Cuota mensual": catalog.reduce((s,c)=>s+c.monthlyQuota,0),
                        "Enviados": totalSent, "Disponibles": 0, "Estado": "",
                      });
                      const ws = XLSX.utils.json_to_sheet(rows);
                      ws["!cols"] = [{wch:36},{wch:20},{wch:15},{wch:12},{wch:13},{wch:14}];
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, "Inventario");
                      XLSX.writeFile(wb, `inventario_samples_${invMonth}.xlsx`);
                    }}
                    style={{
                      display:"flex",alignItems:"center",gap:"6px",
                      background:"#0891b2",color:"#fff",border:"none",borderRadius:8,
                      padding:"7px 14px",fontSize:"0.82rem",fontWeight:600,cursor:"pointer",
                      whiteSpace:"nowrap",marginTop:"1rem",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Descargar Excel
                  </button>
                </div>
                {catalog.length === 0
                  ? <div className="card" style={{textAlign:"center",color:"#94a3b8",padding:"2rem"}}>
                      Catálogo vacío — agrega productos en Supabase (tabla strategy_sample_catalog)
                    </div>
                  : <div className="card" style={{overflowX:"auto",padding:0}}>
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.82rem"}}>
                        <thead>
                          <tr style={{background:"#f8fafc",borderBottom:"2px solid #e2e8f0"}}>
                            {["Producto","Product ID","Cuota mensual","Enviados","Disponibles","Estado"].map(h=>(
                              <th key={h} style={{padding:"0.75rem 1rem",textAlign:"left",fontWeight:700,color:"#64748b",fontSize:"0.72rem",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {catalog.map((item,i)=>{
                            const sent = allSamples.filter(s=>s.catalogId===item.id && s.sentDate.startsWith(invMonth) && s.deliveryStatus !== "requested").length;
                            const avail = Math.max(0, item.monthlyQuota - sent);
                            const done  = sent >= item.monthlyQuota;
                            const started = sent > 0 && !done;
                            return (
                              <tr key={item.id} style={{borderBottom:"1px solid #f1f5f9",background:i%2===0?"white":"#fafafa"}}>
                                <td style={{padding:"0.75rem 1rem",fontWeight:600,color:"#1e293b",maxWidth:320}}>{item.productName}</td>
                                <td style={{padding:"0.75rem 1rem",color:"#64748b",fontFamily:"monospace",fontSize:"0.75rem",whiteSpace:"nowrap"}}>{item.productId || "—"}</td>
                                <td style={{padding:"0.75rem 1rem",fontWeight:700,color:"#1e293b",textAlign:"center"}}>{item.monthlyQuota}</td>
                                <td style={{padding:"0.75rem 1rem",fontWeight:700,textAlign:"center",color:done?"#15803d":started?"#ca8a04":"#64748b"}}>{sent}</td>
                                <td style={{padding:"0.75rem 1rem",textAlign:"center",color:done?"#94a3b8":"#1e293b"}}>{avail}</td>
                                <td style={{padding:"0.75rem 1rem"}}>
                                  <span style={{display:"inline-block",padding:"0.2rem 0.75rem",borderRadius:20,fontSize:"0.72rem",fontWeight:700,
                                    background:done?"#dcfce7":started?"#fef9c3":"#f1f5f9",
                                    color:done?"#15803d":started?"#854d0e":"#64748b",
                                    border:`1px solid ${done?"#bbf7d0":started?"#fef08a":"#e2e8f0"}`}}>
                                    {done?"✓ Completo":started?"En progreso":"Pendiente"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{borderTop:"2px solid #e2e8f0",background:"#f8fafc"}}>
                            <td colSpan={2} style={{padding:"0.65rem 1rem",fontWeight:700,color:"#64748b",fontSize:"0.78rem"}}>TOTAL</td>
                            <td style={{padding:"0.65rem 1rem",fontWeight:800,textAlign:"center",color:"#1e293b"}}>
                              {catalog.reduce((s,c)=>s+c.monthlyQuota,0)}
                            </td>
                            <td style={{padding:"0.65rem 1rem",fontWeight:800,textAlign:"center",color:C.samples}}>
                              {catalog.reduce((s,c)=>s+allSamples.filter(x=>x.catalogId===c.id&&x.sentDate.startsWith(invMonth) && x.deliveryStatus !== "requested").length,0)}
                            </td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                }
              </div>
            )}

            {samplesTab==="tracking" && (<>

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

            {/* Button toggles into form in-place */}
            {!showAdd && !editing && (
              <div style={{marginBottom:"0.75rem",display:"flex",gap:"0.5rem",alignItems:"center",flexWrap:"wrap"}}>
                <button className="btn btn-primary" onClick={()=>{setShowAdd(true);setSErr("");}}>+ Agregar Sample</button>
                <input ref={historyFileRef} type="file" accept=".csv,.xlsx,.xls" style={{display:"none"}}
                  onChange={e=>{const f=e.target.files?.[0]; if(f) handleHistoryCsvSelected(f); e.target.value="";}} />
                <button className="btn btn-secondary" disabled={historyImporting} onClick={()=>historyFileRef.current?.click()}>
                  {historyImporting?"Importando...":"⇪ Importar historial (CSV)"}
                </button>
              </div>
            )}
            {historyResult && (
              <div className="card" style={{marginBottom:"1rem",background:"#f0fdf4",border:"1px solid #bbf7d0"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.4rem"}}>
                  <h4 style={{margin:0,color:"#166534"}}>Historial importado</h4>
                  <button className="btn btn-sm btn-secondary" onClick={()=>setHistoryResult(null)}>Cerrar</button>
                </div>
                <p style={{fontSize:"0.82rem",color:"#166534",margin:"0 0 0.25rem"}}>
                  {historyResult.imported} de {historyResult.total} filas importadas como samples (Enviado/Entregado según estado).
                </p>
                <p style={{fontSize:"0.78rem",color:"#64748b",margin:"0 0 0.25rem"}}>
                  Omitidas: {historyResult.skippedCancelled} canceladas · {historyResult.skippedUnrecognized} estado/fecha no reconocidos · {historyResult.skippedNoUsername} sin username.
                </p>
                {historyResult.reconciled > 0 && (
                  <p style={{fontSize:"0.78rem",color:"#92400e",margin:0}}>
                    ⚠ {historyResult.reconciled} sample{historyResult.reconciled!==1?"s":""} que estaban en "Enviado" no aparecen en este historial — se regresaron a "Solicitud enviada".
                  </p>
                )}
              </div>
            )}
            {(showAdd || editing) && (
              <div className="card" style={{marginBottom:"1rem",border:`2px solid ${C.samples}`,background:"#f0f9ff"}}>
                <h4 style={{margin:"0 0 1rem",color:C.samples}}>{editing?"Editar Sample":"Agregar Nuevo Sample"}</h4>
                {sErr && <p style={{color:"#dc2626",fontSize:"0.85rem",marginBottom:"0.75rem"}}>{sErr}</p>}
                <form onSubmit={editing?submitEdit:submitSample}>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:"0.75rem",marginBottom:"0.75rem"}}>
                    {/* Username */}
                    <div><label style={lbl}>Username / User ID</label>
                      <input type="text" className="form-control" placeholder="@username" required
                        value={editing?editing.username:newS.username}
                        onChange={e=>{const v=e.target.value; editing?setEditing({...editing,username:v}):setNewS({...newS,username:v});}} />
                    </div>
                    {/* SKU autocomplete */}
                    <div style={{gridColumn:"span 2"}}>
                      <label style={lbl}>Producto</label>
                      <SkuSelect
                        catalog={catalog}
                        value={editing?editing.sku:newS.sku}
                        onSelect={(sku,catId)=>{
                          editing?setEditing({...editing,sku,catalogId:catId}):setNewS({...newS,sku,catalogId:catId});
                        }} />
                    </div>
                    {/* Date */}
                    <div><label style={lbl}>Fecha de envío</label>
                      <input type="date" className="form-control" required
                        value={editing?editing.sentDate:newS.sentDate}
                        onChange={e=>{const v=e.target.value; editing?setEditing({...editing,sentDate:v}):setNewS({...newS,sentDate:v});}} />
                    </div>
                    {/* Videos */}
                    <div><label style={lbl}>Videos publicados</label>
                      <input type="number" className="form-control" placeholder="0" min={0}
                        value={editing?nv(editing.videosPublished):nv(newS.videosPublished)}
                        onChange={e=>{const v=Number(e.target.value); editing?setEditing({...editing,videosPublished:v}):setNewS({...newS,videosPublished:v});}} />
                    </div>
                    {/* Notes with size hint */}
                    <div>
                      <label style={{...lbl,display:"flex",gap:"0.3rem",alignItems:"center"}}>
                        Notas
                        <span title="Importante: incluye la talla del creador en las notas (ej: S, M, L, XL, 2XL)" style={{cursor:"help",color:"#f59e0b",fontSize:"0.8rem"}}>⚠️</span>
                      </label>
                      <input type="text" className="form-control" placeholder="Incluye la talla aquí (ej: M)"
                        value={editing?editing.notes:newS.notes}
                        onChange={e=>{const v=e.target.value; editing?setEditing({...editing,notes:v}):setNewS({...newS,notes:v});}} />
                    </div>
                    {/* Delivery status */}
                    <div><label style={lbl}>Estado</label>
                      <select className="form-control"
                        value={editing?editing.deliveryStatus:newS.deliveryStatus}
                        onChange={e=>{const v=e.target.value as "requested"|"pending"|"delivered";editing?setEditing({...editing,deliveryStatus:v}):setNewS({...newS,deliveryStatus:v});}}>
                        <option value="requested">Solicitud enviada</option>
                        <option value="pending">Enviado</option>
                        <option value="delivered">Entregado</option>
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

            {/* Stage pipeline tabs */}
            <div style={{display:"flex",gap:"0.5rem",marginBottom:"1rem",flexWrap:"wrap"}}>
              {([
                {key:"requested", label:"📩 Solicitud enviada", count:stageCounts.requested, color:"#6366f1"},
                {key:"pending",   label:"📦 Enviado",           count:stageCounts.pending,   color:"#d97706"},
                {key:"delivered", label:"✓ Entregado",          count:stageCounts.delivered, color:"#16a34a"},
                {key:"all",       label:"Todos",                count:stageBase.length, color:"#64748b"},
              ] as const).map(t => (
                <button key={t.key}
                  onClick={()=>setFilterStatus(t.key)}
                  style={{
                    display:"flex",alignItems:"center",gap:"0.4rem",
                    border:`2px solid ${filterStatus===t.key?t.color:"#e2e8f0"}`,
                    background:filterStatus===t.key?`${t.color}14`:"#fff",
                    color:filterStatus===t.key?t.color:"#475569",
                    borderRadius:10,padding:"0.5rem 0.9rem",fontSize:"0.85rem",fontWeight:700,cursor:"pointer",
                  }}>
                  {t.label}
                  <span style={{
                    background:filterStatus===t.key?t.color:"#e2e8f0",
                    color:filterStatus===t.key?"#fff":"#475569",
                    borderRadius:999,padding:"0.05rem 0.45rem",fontSize:"0.72rem",fontWeight:800,
                  }}>{t.count}</span>
                </button>
              ))}
            </div>

            {/* Filters */}
            <div className="card" style={{marginBottom:"1rem",padding:"0.9rem 1rem"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.6rem"}}>
                <p style={{fontWeight:700,fontSize:"0.72rem",color:"#64748b",textTransform:"uppercase",letterSpacing:"0.05em",margin:0}}>Buscar (no afecta el cálculo del bono)</p>
                <div style={{display:"flex",gap:"0.4rem"}}>
                  <button style={{...qBtn,borderColor:viewMode==="samples"?"#0891b2":"#e2e8f0",color:viewMode==="samples"?C.samples:"#64748b"}} onClick={()=>setViewMode("samples")}>Por sample</button>
                  <button style={{...qBtn,borderColor:viewMode==="creators"?"#0891b2":"#e2e8f0",color:viewMode==="creators"?C.samples:"#64748b"}} onClick={()=>setViewMode("creators")}>Por creador</button>
                </div>
              </div>
              <label style={{display:"flex",alignItems:"center",gap:"0.4rem",fontSize:"0.8rem",color:"#475569",marginBottom:"0.75rem",cursor:"pointer"}}>
                <input type="checkbox" checked={viewAllPeriods} onChange={e=>setViewAllPeriods(e.target.checked)} />
                Ver historial completo (todos los períodos, no solo el actual)
              </label>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:"0.75rem",alignItems:"flex-end"}}>
                <div><label style={lbl}>Buscar username</label>
                  <input type="text" className="form-control" placeholder="@username..." value={filterUser} onChange={e=>setFilterUser(e.target.value)} />
                </div>
                <div><label style={lbl}>Buscar SKU</label>
                  <input type="text" className="form-control" placeholder="SKU..." value={filterSku} onChange={e=>setFilterSku(e.target.value)} />
                </div>
                <div><label style={lbl}>Desde</label>
                  <input type="date" className="form-control" value={filterDateFrom} onChange={e=>setFilterDateFrom(e.target.value)} />
                </div>
                <div><label style={lbl}>Hasta</label>
                  <input type="date" className="form-control" value={filterDateTo} onChange={e=>setFilterDateTo(e.target.value)} />
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
                        const inactive = isInactiveProduct(s);
                        const rowBg = inactive ? "#fef2f2"
                          : s.deliveryStatus==="requested" ? "#eef2ff"
                          : s.deliveryStatus==="pending" ? "#fffbeb"
                          : undefined;
                        return (
                          <tr key={s.id} style={{background:rowBg}}>
                            <td>
                              {s.deliveryStatus==="requested" ? (
                                <div style={{display:"flex",flexDirection:"column",gap:"0.2rem",alignItems:"flex-start"}}>
                                  <span style={{background:"#e0e7ff",borderRadius:6,padding:"0.15rem 0.5rem",fontSize:"0.72rem",color:"#4338ca",fontWeight:700}}>📩 Solicitud enviada</span>
                                  {daysSince(s.sentDate) > 7 && (
                                    <span style={{background:"#fef2f2",borderRadius:6,padding:"0.1rem 0.45rem",fontSize:"0.68rem",color:"#b91c1c",fontWeight:700}}>⚠ {daysSince(s.sentDate)} días sin respuesta</span>
                                  )}
                                </div>
                              ) : s.deliveryStatus==="pending" ? (
                                <span style={{background:"#fef3c7",borderRadius:6,padding:"0.15rem 0.5rem",fontSize:"0.72rem",color:"#92400e",fontWeight:700}}>📦 Enviado</span>
                              ) : (
                                <span style={{background:"#f0fdf4",borderRadius:6,padding:"0.15rem 0.5rem",fontSize:"0.72rem",color:"#166534",fontWeight:700}}>✓ Entregado</span>
                              )}
                            </td>
                            <td style={{fontWeight:600}}>{s.username}</td>
                            <td>
                              <span style={{background:"#f1f5f9",borderRadius:4,padding:"0.1rem 0.45rem",fontSize:"0.8rem",fontFamily:"monospace"}}>{s.sku}</span>
                              {inactive && <span style={{marginLeft:"0.4rem",background:"#fee2e2",color:"#b91c1c",borderRadius:4,padding:"0.1rem 0.4rem",fontSize:"0.68rem",fontWeight:700}}>DESCONTINUADO</span>}
                            </td>
                            <td>{s.sentDate}</td>
                            <td>
                              {s.deliveryStatus==="delivered" ? (
                                <div style={{display:"flex",alignItems:"center",gap:"0.35rem",position:"relative"}}>
                                  <button className="btn btn-sm btn-secondary" style={{padding:"0.05rem 0.5rem"}}
                                    disabled={videoLogBusyId===s.id || (s.videoLog?.length ?? 0)===0}
                                    onClick={()=>removeLastVideo(s.id)}>−</button>
                                  <span style={{fontWeight:700,minWidth:16,textAlign:"center",color:(s.videoLog?.length ?? s.videosPublished)===0?"#dc2626":"#15803d"}}>
                                    {s.videoLog?.length ?? s.videosPublished}
                                  </span>
                                  <button className="btn btn-sm btn-secondary" style={{padding:"0.05rem 0.5rem"}}
                                    disabled={videoLogBusyId===s.id}
                                    onClick={()=>openAddVideo(s.id)}>+</button>
                                  {addVideoPopoverId===s.id && (
                                    <div className="card" style={{position:"absolute",top:"110%",left:0,zIndex:20,width:190,padding:"0.6rem"}}>
                                      <label style={lbl}>Fecha del video</label>
                                      <input type="date" className="form-control" value={addVideoDate} onChange={e=>setAddVideoDate(e.target.value)} />
                                      <div style={{display:"flex",gap:"0.3rem",marginTop:"0.4rem"}}>
                                        <button className="btn btn-sm btn-primary" disabled={videoLogBusyId===s.id} onClick={()=>confirmAddVideo(s.id)}>{videoLogBusyId===s.id?"...":"Agregar"}</button>
                                        <button className="btn btn-sm btn-secondary" onClick={()=>setAddVideoPopoverId(null)}>Cancelar</button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span style={{fontWeight:700,color:s.videosPublished===0?"#dc2626":"#15803d"}}>{s.videosPublished===0?"0":"✓ "+s.videosPublished}</span>
                              )}
                            </td>
                            <td style={{fontSize:"0.75rem"}}>
                              {totalForCreator>=2 && <span style={{color:"#7c3aed",fontWeight:600}}>Coverage + Additional</span>}
                              {totalForCreator===1 && <span style={{color:"#15803d",fontWeight:600}}>Coverage</span>}
                              {totalForCreator===0 && <span style={{color:"#94a3b8"}}>Sin cumplimiento</span>}
                            </td>
                            <td style={{color:"var(--text-muted)",fontSize:"0.8rem"}}>{s.notes||"—"}</td>
                            <td style={{whiteSpace:"nowrap",display:"flex",gap:"0.3rem",flexWrap:"wrap"}}>
                              {s.deliveryStatus==="requested" && (
                                <button className="btn btn-sm btn-secondary" style={{color:"#4338ca",borderColor:"#c7d2fe"}} onClick={()=>markResponded(s.id)}>✓ Contestó → Enviado</button>
                              )}
                              {s.deliveryStatus==="requested" && daysSince(s.sentDate) > 7 && (
                                <button className="btn btn-sm btn-danger" onClick={()=>deleteStaleRequest(s.id)}>🗑 Eliminar</button>
                              )}
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
            </>)}
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
              <p style={{fontSize:"0.8rem",color:"var(--text-muted)",margin:"0 0 0.75rem"}}>
                {contestRanked.length} afiliado{contestRanked.length!==1?"s":""} · {contestRanked.filter(e=>e.qualified).length} compitiendo
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
                        {r:"0.55–0.90%", p:"75%",  setVal:0.70},
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

function SkuSelect({ catalog, value, onSelect }: {
  catalog: SampleCatalogItem[];
  value: string;
  onSelect: (sku: string, catalogId: number | undefined) => void;
}) {
  const [query, setQuery]   = useState("");
  const [open, setOpen]     = useState(false);
  const selected = catalog.find(c => c.productName === value);

  const filtered = query.trim().length === 0
    ? catalog
    : catalog.filter(c => c.productName.toLowerCase().includes(query.toLowerCase()));

  const handleOpen = () => { setQuery(""); setOpen(true); };
  const handleClose = () => setTimeout(() => { setOpen(false); setQuery(""); }, 150);

  return (
    <div style={{position:"relative"}}>
      {/* Trigger — looks like a select */}
      {!open ? (
        <button type="button" onClick={handleOpen}
          style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"0.45rem 0.75rem",border:"1px solid #e2e8f0",borderRadius:8,background:"white",
            cursor:"pointer",textAlign:"left",gap:"0.5rem",minHeight:38}}>
          <span style={{fontSize:"0.85rem",color:selected?"#1e293b":"#94a3b8",flex:1,overflow:"hidden",
            textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {selected ? selected.productName : "— Seleccionar producto —"}
          </span>
          <span style={{color:"#64748b",fontSize:"0.75rem",flexShrink:0}}>▼</span>
        </button>
      ) : (
        /* Search input when open */
        <input autoFocus type="text" className="form-control"
          placeholder="Buscar (ej: BBL, Corset, S-002)..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onBlur={handleClose}
          style={{borderRadius:"8px 8px 0 0"}}
        />
      )}

      {/* Dropdown list */}
      {open && (
        <div style={{position:"absolute",zIndex:200,left:0,right:0,top:"100%",
          background:"white",border:"1px solid #bae6fd",borderTop:"none",
          borderRadius:"0 0 8px 8px",boxShadow:"0 8px 24px rgba(0,0,0,0.12)",
          maxHeight:280,overflowY:"auto"}}>
          {filtered.length === 0
            ? <div style={{padding:"0.75rem 1rem",color:"#94a3b8",fontSize:"0.82rem"}}>Sin resultados</div>
            : filtered.map(c => (
                <div key={c.id}
                  onMouseDown={() => { onSelect(c.productName, c.id); setOpen(false); setQuery(""); }}
                  style={{padding:"0.6rem 1rem",cursor:"pointer",borderBottom:"1px solid #f1f5f9",
                    display:"flex",flexDirection:"column",gap:"0.1rem",
                    background:value===c.productName?"#eff6ff":"white"}}
                  onMouseEnter={e=>(e.currentTarget.style.background="#f0f9ff")}
                  onMouseLeave={e=>(e.currentTarget.style.background=value===c.productName?"#eff6ff":"white")}>
                  <span style={{fontSize:"0.82rem",fontWeight:600,color:"#1e293b"}}>{c.productName}</span>
                  {c.productId && <span style={{fontSize:"0.68rem",color:"#94a3b8",fontFamily:"monospace"}}>ID: {c.productId} · cuota mensual: {c.monthlyQuota}</span>}
                </div>
              ))
          }
        </div>
      )}
      {/* Hidden required input for form validation */}
      <input type="text" required style={{position:"absolute",opacity:0,height:0,pointerEvents:"none"}} value={value} readOnly />
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
