import { useState } from "react";
import type { HrStore } from "./hrStore";
import type { Contractor } from "./hrData";
import { STATUS_LABEL, approvalsComplete, cycleTotals, formatMoney, monthInfo } from "./hrData";
import { Banner } from "./ui";
import CycleReview from "./CycleReview";

// A supervisor's people for the current cycle (also used by William for contractors without a supervisor).
export default function TeamList({ store, team, who }: { store: HrStore; team: Contractor[]; who: string }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const info = monthInfo(store.year, store.month);
  const open = openId !== null ? store.currentCycle(openId) : null;

  if (open) return <CycleReview store={store} c={store.contractor(open.contractorId)} cy={open} mode="supervisor" onBack={() => setOpenId(null)} />;

  const rows = team.map(c => ({ c, cy: store.currentCycle(c.id)! }));
  const pending = rows.filter(r => r.cy.status === "abierto");

  return (
    <div>
      {store.closingDay && pending.length > 0 && (
        <Banner tone="warn">⏰ Hoy cierra el ciclo de {info.name}. Tienes {pending.length} persona(s) sin enviar a William: {pending.map(r => r.c.legalName).join(", ")}. Aprueba lo pendiente y confirma el bono de cada una (aunque sea 0).</Banner>
      )}
      {store.closingDay && pending.length === 0 && team.length > 0 && <Banner tone="ok">✓ Todo tu equipo ya está enviado a William.</Banner>}
      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: 0 }}>Ciclo actual: <strong>{info.name} {store.year}</strong> · {who}</p>
      <div className="card" style={{ overflowX: "auto" }}>
        {team.length === 0 ? <p style={{ margin: 0, color: "var(--text-muted)" }}>No tienes personas a cargo todavía.</p> : (
          <table className="data-table">
            <thead><tr><th>Persona</th><th>Pago</th><th>Pendiente por aprobar</th><th>Bono</th><th>Total</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {rows.map(({ c, cy }) => {
                const pendDays = c.payType === "hourly" ? cy.days.filter(d => d.hours > 0 && !d.approved).length : (cy.summaryApproved ? 0 : cy.summary.trim() ? 1 : 0);
                return (
                  <tr key={c.id}>
                    <td><strong>{c.legalName}</strong><div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{c.position}</div></td>
                    <td>{c.payType === "hourly" ? "Por horas" : "Fijo"} · {c.currency}</td>
                    <td>{approvalsComplete(c, cy) ? <span className="badge badge-success">Al día</span> : pendDays > 0 ? <span className="badge badge-warning">{pendDays} {c.payType === "hourly" ? "día(s)" : "entregable"}</span> : <span style={{ color: "var(--text-muted)" }}>Sin registros</span>}</td>
                    <td>{cy.bonus === null ? <span className="badge badge-warning">Pendiente</span> : formatMoney(cy.bonus, c.currency)}</td>
                    <td>{formatMoney(cycleTotals(c, cy).total, c.currency)}</td>
                    <td>{STATUS_LABEL[cy.status]}{cy.status === "abierto" && cy.closed ? " · firmado" : ""}</td>
                    <td><button className="btn btn-primary btn-sm" onClick={() => setOpenId(c.id)}>Revisar</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
