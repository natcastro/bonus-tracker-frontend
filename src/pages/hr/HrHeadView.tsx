import { useState } from "react";
import type { HrStore } from "./hrStore";
import { HR_HEAD, STATUS_LABEL, cycleTotals, formatMoney, cycleInfo } from "./hrData";
import { Banner, Tabs } from "./ui";
import CycleReview from "./CycleReview";
import TeamList from "./TeamList";
import HistoryTable from "./HistoryTable";
import { NewContractorModal, NewSupervisorModal } from "./NewPersonModals";

// William: final approvals, his own team (people without a supervisor), and the only one who can create people.
export default function HrHeadView({ store }: { store: HrStore }) {
  const [tab, setTab] = useState<"revisar" | "equipo" | "personas" | "historial">("revisar");
  const [openId, setOpenId] = useState<number | null>(null);
  const [showNewC, setShowNewC] = useState(false);
  const [showNewS, setShowNewS] = useState(false);
  const toReview = store.cycles.filter(c => c.status === "con_hr");
  const open = openId !== null ? store.cycles.find(c => c.id === openId) : null;
  const noSupervisor = store.contractors.filter(c => c.supervisorId === null);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: "0.75rem" }}>
        <h2 style={{ margin: 0 }}>Hola, {HR_HEAD}</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={() => setShowNewC(true)}>+ Nuevo contratista</button>
          <button className="btn btn-secondary" onClick={() => setShowNewS(true)}>+ Nuevo supervisor</button>
        </div>
      </div>
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
          <div className="card" style={{ overflowX: "auto" }}>
            <h4 style={{ marginTop: 0 }}>Contratistas</h4>
            <table className="data-table">
              <thead><tr><th>Nombre</th><th>Cargo</th><th>Pago</th><th>Bono máx.</th><th>Supervisor</th><th>Ciclo actual</th></tr></thead>
              <tbody>{store.contractors.map(c => {
                const sup = store.supervisors.find(s => s.id === c.supervisorId);
                const cy = store.currentCycle(c.id);
                return (
                  <tr key={c.id}><td><strong>{c.legalName}</strong><div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{c.email}</div></td><td>{c.position}</td>
                    <td>{c.payType === "hourly" ? `${formatMoney(c.hourlyRate, c.currency)}/h` : `Fijo ${formatMoney(c.baseAmount, c.currency)}`}</td>
                    <td>{formatMoney(c.bonusCap, c.currency)}</td>
                    <td>{sup ? `${sup.firstName} ${sup.lastName}` : `${HR_HEAD} (sin supervisor)`}</td><td>{cy ? STATUS_LABEL[cy.status] : "—"}</td></tr>
                );
              })}</tbody>
            </table>
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <h4 style={{ marginTop: 0 }}>Supervisores</h4>
            <table className="data-table">
              <thead><tr><th>Nombre</th><th>Cargo</th><th>Personas a cargo</th></tr></thead>
              <tbody>{store.supervisors.map(s => (
                <tr key={s.id}><td><strong>{s.firstName} {s.lastName}</strong></td><td>{s.position}</td><td>{store.contractors.filter(c => c.supervisorId === s.id).length}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "historial" && <HistoryTable store={store} />}

      {showNewC && <NewContractorModal supervisors={store.supervisors} onClose={() => setShowNewC(false)} onSave={c => { store.createContractor(c); setShowNewC(false); }} />}
      {showNewS && <NewSupervisorModal onClose={() => setShowNewS(false)} onSave={s => { store.createSupervisor(s); setShowNewS(false); }} />}
    </div>
  );
}

