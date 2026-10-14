import { useState } from "react";
import type { HrStore } from "./hrStore";
import { HR_HEAD, PAY_TYPE_LABEL, STATUS_LABEL, cycleTotals, formatMoney, cycleInfo } from "./hrData";
import ImportPeopleButton from "./ImportPeopleButton";
import { Banner, Empty, PageHeader, Tabs } from "./ui";
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
  const [editId, setEditId] = useState<number | null>(null);
  const toReview = store.cycles.filter(c => c.status === "con_hr");
  const open = openId !== null ? store.cycles.find(c => c.id === openId) : null;
  const noSupervisor = store.contractors.filter(c => c.supervisorId === null);
  // William is also a supervisor: his own people's cycles need his approvals first, then his final sign-off (same screen).
  const ownPending = noSupervisor.filter(c => { const cy = store.currentCycle(c.id); return cy && cy.status !== "aprobada"; }).length;

  return (
    <div>
      <PageHeader role="hr" name={HR_HEAD} title={`Hola, ${HR_HEAD}`} chip="HR" subtitle="Supervisas a tu equipo, das la aprobación final de todos los ciclos, creas personas y revisas el historial."
        right={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={() => setShowNewC(true)}>+ Nueva persona</button>
          <button className="btn btn-secondary" onClick={() => setShowNewS(true)}>+ Nuevo supervisor</button>
          <ImportPeopleButton store={store} label="⬆ Cargar contratistas desde Excel" onDone={() => { setTab("personas"); setOpenId(null); }} />
        </div>} />
      {store.isApprovalDay && <Banner tone={toReview.length > 0 ? "warn" : "ok"}>{toReview.length > 0 ? `⏰ Hoy 25 es el día de aprobar: tienes ${toReview.length} ciclo(s) esperando tu revisión.` : "✓ Hoy 25 es el día de aprobar y no tienes ciclos pendientes."}</Banner>}
      {store.isUploadDay && <Banner tone="info">Hoy 24 se están subiendo las cuentas de cobro. Mañana, 25, las apruebas.</Banner>}
      <Tabs tabs={[["revisar", `Por revisar (${toReview.length})`], ["equipo", `Mi equipo${ownPending ? ` (${ownPending})` : ""}`], ["personas", "Personas registradas"], ["historial", "Historial"]]}
        value={tab} onChange={t => { setTab(t); setOpenId(null); }} />

      {tab === "revisar" && (open ? (
        <CycleReview store={store} c={store.contractor(open.contractorId)} cy={open} mode="hr" onBack={() => setOpenId(null)} />
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          {toReview.length === 0 ? <Empty title="Todo al día" hint="No hay ciclos esperando tu aprobación. Cuando un supervisor termine el suyo, aparecerá aquí." /> : (
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

      {tab === "equipo" && <TeamList store={store} team={noSupervisor} mode="both" who={`las personas que supervisas tú, ${HR_HEAD}`} />}

      {tab === "personas" && (
        <div>
          {store.report && (
            <div className="card" style={{ borderLeft: "4px solid #0f766e" }}>
              <h4 style={{ marginTop: 0 }}>Excel cargado</h4>
              <p style={{ margin: "0 0 6px", fontSize: "0.9rem" }}>
                <strong>{store.report.contractors}</strong> personas ({store.report.international} por transferencia internacional, {store.report.adp} por ADP) · <strong>{store.report.supervisors}</strong> supervisores, {store.report.dualRole} de ellos también cobran · {store.report.needsReview} con puntos por revisar.
              </p>
              {store.report.fixes.length > 0 && <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.82rem", color: "#334155" }}>{store.report.fixes.map(f => <li key={f}>{f}</li>)}</ul>}
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "8px 0 0" }}>🔒 Estos datos solo viven en esta pestaña del navegador: no se guardan en el código ni en la base de datos. Faltan los datos fijos (correo, Tax ID, dirección y cuenta bancaria).</p>
            </div>
          )}
          <div className="card" style={{ overflowX: "auto" }}>
            <h4 style={{ marginTop: 0 }}>Personas ({store.contractors.length})</h4>
            <table className="data-table">
              <thead><tr><th>Nombre</th><th>Área</th><th>Ubicación</th><th>Método</th><th>Pago</th><th>Bono máx.</th><th>Supervisor</th><th>Ciclo actual</th><th>Revisar</th><th /></tr></thead>
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
                    <td><button className="btn btn-secondary btn-sm" onClick={() => setEditId(c.id)}>Editar</button></td>
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

      {editId !== null && <NewContractorModal initial={store.contractor(editId)} supervisors={store.supervisors} onClose={() => setEditId(null)} onSave={(c) => { store.updateContractor(editId, c); setEditId(null); }} />}
      {showNewC && <NewContractorModal supervisors={store.supervisors} onClose={() => setShowNewC(false)} onSave={(c, also) => { store.createContractor(c, also); setShowNewC(false); }} />}
      {showNewS && <NewSupervisorModal contractors={store.contractors} supervisors={store.supervisors} onClose={() => setShowNewS(false)} onSave={s => { store.createSupervisor(s); setShowNewS(false); }} />}
    </div>
  );
}

