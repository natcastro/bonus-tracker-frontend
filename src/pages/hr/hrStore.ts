import { useEffect, useState } from "react";
import type { Contractor, Cycle, Supervisor } from "./hrData";
import { saveHrPerson } from "./hrApi";
import { formatMoney, HR_HEAD, buildSeedCycles, currentCycleKey, cycleInfo, isReadyForHr, nextCycleNumber, overLimit, cycleTotals } from "./hrData";

// Cycles are kept for this browser tab only (until the server-side cycle storage exists), so the work
// survives switching "view as" persona. The people themselves always come from the protected server.
const STATE_KEY = "hr_proto_state";
const readCycles = (): Cycle[] | null => { try { const v = JSON.parse(sessionStorage.getItem(STATE_KEY) ?? "null") as { cycles?: Cycle[] } | null; return v?.cycles ?? null; } catch { return null; } };

// William is the HR head AND supervises people: one person, one account.
export const isHrHeadName = (n: string) => /^will?i?am\s+calle/.test(n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim());
const two = (n: number) => String(n).padStart(2, "0");
export type SimDay = "real" | "upload" | "approve";

// In-memory state shared by every "view as" persona, so what one role does shows up for the next.
export function useHrStore() {
  // The people come from the protected server (hr-people function) and are never written to the browser.
  const [ready, setReady] = useState(false);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [notice, setNotice] = useState("");
  const persist = (kind: "contractor" | "supervisor", data: Contractor | Supervisor) => {
    saveHrPerson(kind, data).catch((e: Error) => setNotice(`No pude guardar en el servidor: ${e.message}`));
  };
  const [simDay, setSimDay] = useState<SimDay>("real");

  useEffect(() => {
    if (!ready) return;
    try { sessionStorage.setItem(STATE_KEY, JSON.stringify({ cycles })); } catch { /* too big: keep in memory */ }
  }, [ready, cycles]);

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
      setNotice(c.supervisorId === null
        ? `Todo listo con ${c.legalName}: ya puedes dar tu aprobación final en esta misma pantalla.`
        : `Todo listo: el ciclo de ${c.legalName} se envió automáticamente a ${HR_HEAD}.`);
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

    // HR — William completes or corrects a person (missing bank data, bonus cap, hourly rate…)
    updateContractor: (id: number, data: Omit<Contractor, "id">) => {
      const before = contractors.find(c => c.id === id);
      const updated = contractors.map(c => (c.id === id ? { ...data, id, issues: [] } : c));
      setContractors(updated);
      persist("contractor", { ...data, id, issues: [] });
      // someone who now sends invoices needs a cycle to fill in
      if (data.sendsInvoice && !cycles.some(x => x.contractorId === id && x.year === year && x.month === month)) {
        setCycles([...cycles, { id: Math.max(0, ...cycles.map(c => c.id)) + 1, contractorId: id, year, month, days: [], summary: "", summaryApproved: false, bonus: null, variableAmount: null, closed: false, signature: null, status: "abierto", number: null }]);
      }
      setNotice(`Guardado: ${data.legalName}.${before && before.legalName !== data.legalName ? " (nombre actualizado)" : ""}`);
    },
    nextNumber: (contractorId: number) => nextCycleNumber(cycles, contractorId),

    // HR
    loadPeople: (list: Contractor[], sups: Supervisor[]) => {
      const kept = readCycles();
      const ids = new Set(list.map(c => c.id));
      setContractors(list); setSupervisors(sups);
      setCycles(kept && kept.every(c => ids.has(c.contractorId)) ? kept : buildSeedCycles(new Date(), list, false));
      setReady(true);
    },
    ready,
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
        const sup = { id: Math.max(0, ...supervisors.map(s => s.id)) + 1, firstName: first, lastName: rest.join(" "), position: data.position, contractorId: id };
        setSupervisors([...supervisors, sup]); persist("supervisor", sup);
      }
      setContractors([...contractors, { ...data, id }]); persist("contractor", { ...data, id });
      if (data.sendsInvoice) setCycles([...cycles, {
        id: Math.max(0, ...cycles.map(c => c.id)) + 1, contractorId: id, year, month, days: [], summary: "", summaryApproved: false,
        bonus: null, variableAmount: null, closed: false, signature: null, status: "abierto", number: null,
      }]);
      setNotice(`Contratista creado: ${data.legalName}${alsoSupervisor ? " (también supervisor)" : ""}. Su primera cuenta de cobro será la 0001.`);
    },
    createSupervisor: (data: Omit<Supervisor, "id">) => {
      const sup = { ...data, id: Math.max(0, ...supervisors.map(s => s.id)) + 1 };
      setSupervisors([...supervisors, sup]); persist("supervisor", sup);
      setNotice(`Supervisor creado: ${data.firstName} ${data.lastName}${data.contractorId ? " (también cobra como contratista)" : ""}.`);
    },
  };
}
export type HrStore = ReturnType<typeof useHrStore>;
