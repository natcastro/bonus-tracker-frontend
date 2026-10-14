import { useState } from "react";
import type { Contractor, Cycle, Supervisor } from "./hrData";
import type { ImportReport } from "./hrImport";
import { formatMoney, HR_HEAD, SEED_CONTRACTORS, SEED_SUPERVISORS, buildSeedCycles, currentCycleKey, cycleInfo, isReadyForHr, nextCycleNumber, overLimit, cycleTotals } from "./hrData";

const PEOPLE_KEY = "hr_proto_people";
const two = (n: number) => String(n).padStart(2, "0");
export type SimDay = "real" | "upload" | "approve";

// In-memory state shared by every "view as" persona, so what one role does shows up for the next.
export function useHrStore() {
  // People loaded from HR's Excel live only in this browser tab (sessionStorage) — never in the code or a database.
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem(PEOPLE_KEY) ?? "null") as { contractors: Contractor[]; supervisors: Supervisor[] } | null; } catch { return null; } })();
  const [imported, setImported] = useState(!!saved);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [contractors, setContractors] = useState<Contractor[]>(saved?.contractors ?? SEED_CONTRACTORS);
  const [supervisors, setSupervisors] = useState<Supervisor[]>(saved?.supervisors ?? SEED_SUPERVISORS);
  const [cycles, setCycles] = useState<Cycle[]>(() => buildSeedCycles(new Date(), saved?.contractors ?? SEED_CONTRACTORS, !saved));
  const [notice, setNotice] = useState("");
  const [simDay, setSimDay] = useState<SimDay>("real");

  const real = new Date();
  const { year, month } = currentCycleKey(real);
  const info = cycleInfo(year, month);
  const realIso = `${real.getFullYear()}-${two(real.getMonth() + 1)}-${two(real.getDate())}`;
  const todayIso = simDay === "upload" ? info.uploadIso : simDay === "approve" ? info.approveIso : realIso;

  const currentCycle = (contractorId: number) => cycles.find(c => c.contractorId === contractorId && c.year === year && c.month === month) ?? null;
  const contractor = (id: number) => contractors.find(c => c.id === id)!;

  // Every change goes through here: once everything is approved, signed and the bonus is set,
  // the cycle moves to William by itself.
  const mutate = (id: number, fn: (cy: Cycle) => Cycle) => {
    const cy = cycles.find(x => x.id === id);
    if (!cy) return;
    const c = contractor(cy.contractorId);
    let next = fn(cy);
    if (isReadyForHr(c, next)) {
      next = { ...next, status: "con_hr", hrNote: undefined };
      setNotice(`Todo listo: el ciclo de ${c.legalName} se envió automáticamente a ${HR_HEAD}.`);
    }
    setCycles(cycles.map(x => (x.id === id ? next : x)));
  };

  return {
    contractors, supervisors, cycles, notice, setNotice, simDay, setSimDay,
    year, month, info, todayIso, isUploadDay: todayIso === info.uploadIso, isApprovalDay: todayIso === info.approveIso,
    currentCycle, contractor,

    // employee
    updateDay: (id: number, date: string, patch: { hours?: number; note?: string }) => mutate(id, cy => {
      const old = cy.days.find(d => d.date === date) ?? { date, hours: 0, note: "", approved: false };
      const entry = { ...old, ...patch, approved: false };
      const others = cy.days.filter(d => d.date !== date);
      const keep = entry.hours > 0 || entry.note.trim() !== "";
      return { ...cy, days: (keep ? [...others, entry] : others).sort((a, b) => a.date.localeCompare(b.date)) };
    }),
    setSummary: (id: number, text: string) => mutate(id, cy => ({ ...cy, summary: text, summaryApproved: false })),
    closeCycle: (id: number, signature: string) => mutate(id, cy => ({ ...cy, closed: true, signature })),

    // supervisor
    approveDay: (id: number, date: string) => mutate(id, cy => ({ ...cy, days: cy.days.map(d => (d.date === date ? { ...d, approved: true } : d)) })),
    approveAll: (id: number) => mutate(id, cy => ({ ...cy, days: cy.days.map(d => ({ ...d, approved: true })), summaryApproved: cy.summary.trim() !== "" ? true : cy.summaryApproved })),
    approveSummary: (id: number) => mutate(id, cy => ({ ...cy, summaryApproved: true })),
    setBonus: (id: number, amount: number): string | null => {
      const cy = cycles.find(x => x.id === id)!; const c = contractor(cy.contractorId);
      if (amount < 0) return "El bono no puede ser negativo.";
      if (amount > c.bonusCap) return `Ese bono supera el máximo de bono de ${c.legalName} (${formatMoney(c.bonusCap, c.currency)} por ciclo).`;
      if (overLimit(amount, c.currency)) return "Ese bono supera el límite permitido. ¿Escribiste un cero de más?";
      const withBonus = cycleTotals(c, { days: cy.days, bonus: amount, variableAmount: cy.variableAmount }).total;
      if (overLimit(withBonus, c.currency)) return "Con ese bono el total del ciclo supera el límite permitido.";
      if (c.monthlyCap && withBonus > c.monthlyCap) return `Con ese bono el total (${formatMoney(withBonus, c.currency)}) supera el máximo mensual de ${c.legalName} (${formatMoney(c.monthlyCap, c.currency)}).`;
      mutate(id, x => ({ ...x, bonus: amount }));
      return null;
    },

    // supervisor — "variable" people: the month's amount instead of a bonus
    setVariable: (id: number, amount: number): string | null => {
      const cy = cycles.find(x => x.id === id)!; const c = contractor(cy.contractorId);
      if (amount < 0) return "El monto no puede ser negativo.";
      const total = cycleTotals(c, { days: cy.days, bonus: null, variableAmount: amount }).total;
      if (overLimit(total, c.currency)) return "Con ese monto el total del ciclo supera el límite permitido. ¿Escribiste un cero de más?";
      if (c.monthlyCap && total > c.monthlyCap) return `Con ese monto el total (${formatMoney(total, c.currency)}) supera el máximo mensual de ${c.legalName} (${formatMoney(c.monthlyCap, c.currency)}).`;
      mutate(id, x => ({ ...x, variableAmount: amount }));
      return null;
    },

    // HR
    loadPeople: (list: Contractor[], sups: Supervisor[], rep?: ImportReport) => {
      try { sessionStorage.setItem(PEOPLE_KEY, JSON.stringify({ contractors: list, supervisors: sups })); } catch { /* too big or blocked: keep in memory only */ }
      setContractors(list); setSupervisors(sups); setCycles(buildSeedCycles(new Date(), list, false)); setImported(true); setReport(rep ?? null);
      setNotice(`Cargados ${list.length} contratistas y ${sups.length} supervisores desde el Excel. Quedan solo en esta pestaña del navegador.`);
    },
    resetDemo: () => {
      try { sessionStorage.removeItem(PEOPLE_KEY); } catch { /* ignore */ }
      setContractors(SEED_CONTRACTORS); setSupervisors(SEED_SUPERVISORS); setCycles(buildSeedCycles(new Date(), SEED_CONTRACTORS)); setImported(false); setReport(null);
      setNotice("Datos de prueba restaurados.");
    },
    imported, report,
    hrApprove: (id: number) => {
      const cy = cycles.find(x => x.id === id)!;
      setCycles(cycles.map(x => (x.id === id ? { ...x, status: "aprobada", number: nextCycleNumber(cycles, x.contractorId) } : x)));
      setNotice(`Aprobada y registrada en el historial. En la versión real se envía el PDF a usahr@formatucuerpo.com y ${contractor(cy.contractorId).legalName} recibe su copia.`);
    },
    hrReturn: (id: number, note: string) => {
      setCycles(cycles.map(x => (x.id === id ? { ...x, status: "abierto", closed: false, signature: null, hrNote: note || "Revisa tu ciclo y vuelve a firmarlo." } : x)));
      setNotice("Devuelta al equipo con tu comentario. Conserva su avance.");
    },
    createContractor: (data: Omit<Contractor, "id">, alsoSupervisor = false) => {
      const id = Math.max(0, ...contractors.map(c => c.id)) + 1;
      if (alsoSupervisor) {
        const [first, ...rest] = data.legalName.trim().split(/\s+/);
        setSupervisors([...supervisors, { id: Math.max(0, ...supervisors.map(s => s.id)) + 1, firstName: first, lastName: rest.join(" "), position: data.position, contractorId: id }]);
      }
      setContractors([...contractors, { ...data, id }]);
      if (data.sendsInvoice) setCycles([...cycles, {
        id: Math.max(0, ...cycles.map(c => c.id)) + 1, contractorId: id, year, month, days: [], summary: "", summaryApproved: false,
        bonus: null, variableAmount: null, closed: false, signature: null, status: "abierto", number: null,
      }]);
      setNotice(`Contratista creado: ${data.legalName}${alsoSupervisor ? " (también supervisor)" : ""}. Su primera cuenta de cobro será la 0001.`);
    },
    createSupervisor: (data: Omit<Supervisor, "id">) => {
      setSupervisors([...supervisors, { ...data, id: Math.max(0, ...supervisors.map(s => s.id)) + 1 }]);
      setNotice(`Supervisor creado: ${data.firstName} ${data.lastName}${data.contractorId ? " (también cobra como contratista)" : ""}.`);
    },
  };
}
export type HrStore = ReturnType<typeof useHrStore>;
