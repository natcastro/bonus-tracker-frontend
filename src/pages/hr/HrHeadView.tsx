import { useRef, useState } from "react";
import type { HrStore } from "./hrStore";
import { HR_HEAD, PAY_TYPE_LABEL, STATUS_LABEL, cycleTotals, formatMoney, cycleInfo } from "./hrData";
import type { ImportReport } from "./hrImport";
import { Banner, Tabs } from "./ui";
import CycleReview from "./CycleReview";
import TeamList from "./TeamList";
import HistoryTable from "./HistoryTable";
import { NewContractorModal, NewSupervisorModal } from "./NewPersonModals";

// A person's list of things still to settle, without the generic "missing document data" line every imported person has.
const realIssues = (issues: string[]) => issues.filter(i => !i.startsWith("Faltan datos fijos"));

// William: final approvals, his own team (people without a supervisor), and the only one who can create people.
export default function HrHeadView({ store }: { store: HrStore }) {
  const [tab, setTab] = useState<"revisar" | "equipo" | "personas" | "historial">("revisar");
  const [openId, setOpenId] = useState<number | null>(null);
  const [showNewC, setShowNewC] = useState(false);
  const [showNewS, setShowNewS] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importErr, setImportErr] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const importFile = async (f: File) => {
    setImportErr("");
    if (!window.confirm(store.imported ? "Esto reemplaza a las personas cargadas ahora. ¿Continuar?" : "Esto reemplaza los datos de prueba por las personas del Excel. ¿Continuar?")) return;
    try {
      const [XLSX, { parseContractorsSheet }] = await Promise.all([import("xlsx"), import("./hrImport")]);
      const r = parseContractorsSheet(XLSX, XLSX.read(await f.arrayBuffer(), { type: "array" }));
      store.loadPeople(r.contractors, r.supervisors);
      setReport(r.report); setTab("personas"); setOpenId(null);
    } catch (e: any) { setImportErr(e?.message ?? "No pude leer ese archivo."); }
  };
  const toReview = store.cycles.filter(c => c.status === "con_hr");
  const open = openId !== null ? store.cycles.find(c => c.id === openId) : null;
  const noSupervisor = store.contractors.filter(c => c.supervisorId === null);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: "0.75rem" }}>
        <h2 style={{ margin: 0 }}>Hola, {HR_HEAD}</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={() => setShowNewC(true)}>+ Nueva persona</button>
          <button className="btn btn-secondary" onClick={() => setShowNewS(true)}>+ Nuevo supervisor</button>
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>⬆ Cargar contratistas desde Excel</button>
          {store.imported && <button className="btn btn-secondary" onClick={() => store.resetDemo()}>↺ Volver a datos de prueba</button>}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
        </div>
      </div>
      {importErr && <Banner tone="bad">{importErr}</Banner>}
      {store.isApprovalDay && <Banner tone={toReview.length > 0 ? "warn" : "ok"}>{toReview.length > 0 ? `⏰ Hoy 25 es el día de aprobar: tienes ${toReview.length} ciclo(s) esperando tu revisión.` : "✓ Hoy 25 es el día de aprobar y no tienes ciclos pendientes."}</Banner>}
      {store.isUploadDay && <Banner tone="info">Hoy 24 se están subiendo las cuentas de cobro. Mañana, 25, las apruebas.</Banner>}
      <Tabs tabs={[["revisar", `Por revisar (${toReview.length})`], ["equipo", "Mi equipo (sin supervisor)"], ["personas", "Personas registradas"], ["historial", "Historial"]]}
        value={tab} onChange={t => { setTab(t); setOpenId(null); }} />

      {tab === "revisar" && (open ? (
        <CycleReview store={store} c={store.contractor(open.contractorId)} cy={open} mode="hr" onBack={() => setOpenId(null)} />
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          {toReview.length === 0 ? <p style={{ margin: 0, color: "var(--text-muted)" }}>No hay ciclos esperando tu aprobación.</p> : (
            <table className="data-table">
              <thead><tr><th>Persona</th><th>Mes</th><th>Total</th><th>Aprobó</th><th /></tr></thead>
              <tbody>{toReview.map(cy => {
                const c = store.contractor(cy.contractorId);
                const sup = store.supervisors.find(s => s.id === c.supervisorId);
                return (
                  <tr key={cy.id}><td><strong>{c.legalName}</strong></td><td>{cycleInfo(cy.year, cy.month).name} {cy.year}</td>
                    <td>{formatMoney(cycleTotals(c, cy).total, c.currency)}</td><td>{sup ? `${sup.firstName} ${sup.lastName}` : HR_HEAD}</td>
                    <td><button className="btn btn-primary btn-sm" onClick={() => setOpenId(cy.id)}>Revisar</button></td></tr>
                );
              })}</tbody>
            </table>
          )}
        </div>
      ))}

      {tab === "equipo" && <TeamList store={store} team={noSupervisor} who="personas sin supervisor — apruebas tú" />}

      {tab === "personas" && (
        <div>
          {report && (
            <div className="card" style={{ borderLeft: "4px solid #0f766e" }}>
              <h4 style={{ marginTop: 0 }}>Excel cargado</h4>
              <p style={{ margin: "0 0 6px", fontSize: "0.9rem" }}>
                <strong>{report.contractors}</strong> personas ({report.international} por transferencia internacional, {report.adp} por ADP) · <strong>{report.supervisors}</strong> supervisores, {report.dualRole} de ellos también cobran · {report.needsReview} con puntos por revisar.
              </p>
              {report.fixes.length > 0 && <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.82rem", color: "#334155" }}>{report.fixes.map(f => <li key={f}>{f}</li>)}</ul>}
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "8px 0 0" }}>🔒 Estos datos solo viven en esta pestaña del navegador: no se guardan en el código ni en la base de datos. Faltan los datos fijos (correo, Tax ID, dirección y cuenta bancaria).</p>
            </div>
          )}
          <div className="card" style={{ overflowX: "auto" }}>
            <h4 style={{ marginTop: 0 }}>Personas ({store.contractors.length})</h4>
            <table className="data-table">
              <thead><tr><th>Nombre</th><th>Área</th><th>Ubicación</th><th>Método</th><th>Pago</th><th>Bono máx.</th><th>Supervisor</th><th>Ciclo actual</th><th>Revisar</th></tr></thead>
              <tbody>{store.contractors.map(c => {
                const sup = store.supervisors.find(s => s.id === c.supervisorId);
                const cy = store.currentCycle(c.id);
                const issues = realIssues(c.issues);
                return (
                  <tr key={c.id}>
                    <td><strong>{c.legalName}</strong>{c.email && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{c.email}</div>}</td>
                    <td>{c.position}</td>
                    <td>{c.country}{c.region ? ` — ${c.region}` : ""}</td>
                    <td>{c.paymentMethod === "adp" ? <span className="badge badge-warning">ADP</span> : <span className="badge badge-success">Transferencia</span>}{!c.sendsInvoice && <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>no envía cuenta de cobro</div>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{c.payType === "hourly" ? `${c.hourlyRate ? formatMoney(c.hourlyRate, c.currency) : "tarifa pendiente"}/h` : c.payType === "variable" ? `Variable${c.baseAmount ? ` (base ${formatMoney(c.baseAmount, c.currency)})` : ""}` : formatMoney(c.baseAmount, c.currency)}<div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{PAY_TYPE_LABEL[c.payType]}{c.monthlyCap ? ` · máx. mes ${formatMoney(c.monthlyCap, c.currency)}` : ""}{c.weeklyHoursCap ? ` · máx. ${c.weeklyHoursCap} h/sem` : ""}</div></td>
                    <td>{c.payType === "variable" ? "—" : formatMoney(c.bonusCap, c.currency)}</td>
                    <td>{sup ? `${sup.firstName} ${sup.lastName}` : `${HR_HEAD} (sin supervisor)`}</td>
                    <td>{cy ? STATUS_LABEL[cy.status] : "—"}</td>
                    <td>{issues.length > 0 ? <span className="badge badge-danger" title={issues.join("\n")}>{issues.length} punto(s)</span> : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          {store.contractors.some(c => realIssues(c.issues).length > 0) && (
            <div className="card">
              <h4 style={{ marginTop: 0 }}>Puntos por revisar</h4>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 0 }}>Cosas del Excel que conviene confirmar antes de usar a estas personas.</p>
              {store.contractors.filter(c => realIssues(c.issues).length > 0).map(c => (
                <div key={c.id} style={{ padding: "6px 0", borderTop: "1px solid #e2e8f0", fontSize: "0.85rem" }}>
                  <strong>{c.legalName}</strong>
                  <ul style={{ margin: "2px 0 0", paddingLeft: "1.1rem", color: "#991b1b" }}>{realIssues(c.issues).map(i => <li key={i}>{i}</li>)}</ul>
                </div>
              ))}
            </div>
          )}
          <div className="card" style={{ overflowX: "auto" }}>
            <h4 style={{ marginTop: 0 }}>Supervisores</h4>
            <table className="data-table">
              <thead><tr><th>Nombre</th><th>Cargo</th><th>Personas a cargo</th><th>También cobra</th></tr></thead>
              <tbody>{store.supervisors.map(s => (
                <tr key={s.id}><td><strong>{s.firstName} {s.lastName}</strong></td><td>{s.position}</td><td>{store.contractors.filter(c => c.supervisorId === s.id).length}</td><td>{s.contractorId ? "Sí" : "No"}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "historial" && <HistoryTable store={store} />}

      {showNewC && <NewContractorModal supervisors={store.supervisors} onClose={() => setShowNewC(false)} onSave={(c, also) => { store.createContractor(c, also); setShowNewC(false); }} />}
      {showNewS && <NewSupervisorModal contractors={store.contractors} supervisors={store.supervisors} onClose={() => setShowNewS(false)} onSave={s => { store.createSupervisor(s); setShowNewS(false); }} />}
    </div>
  );
}

