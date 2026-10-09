import { useState } from "react";
import type { HrStore } from "./hrStore";
import { cycleFileName, cycleTotals, formatMoney, monthInfo, pad4 } from "./hrData";
import InvoicePreview from "./InvoicePreview";

// Every approved cycle, per person and month — what accounting works from.
export default function HistoryTable({ store }: { store: HrStore }) {
  const [person, setPerson] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  const rows = store.cycles.filter(c => c.status === "aprobada" && (person === 0 || c.contractorId === person))
    .sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
  const open = rows.find(r => r.id === openId);

  if (open) {
    const c = store.contractor(open.contractorId);
    return (
      <div>
        <button className="btn btn-secondary btn-sm" onClick={() => setOpenId(null)} style={{ marginBottom: 10 }}>← Volver</button>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Archivo: <code>{cycleFileName(c, open.number, open.year, open.month)}</code></p>
        <InvoicePreview c={c} cycle={open} number={open.number} />
      </div>
    );
  }
  return (
    <div>
      <div className="form-group" style={{ maxWidth: 280 }}>
        <label>Persona</label>
        <select className="form-control" value={person} onChange={e => setPerson(Number(e.target.value))}>
          <option value={0}>Todas</option>
          {store.contractors.map(c => <option key={c.id} value={c.id}>{c.legalName}</option>)}
        </select>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        {rows.length === 0 ? <p style={{ margin: 0, color: "var(--text-muted)" }}>Todavía no hay ciclos aprobados.</p> : (
          <table className="data-table">
            <thead><tr><th>Persona</th><th>Mes</th><th>#</th><th>Pago</th><th>Bono</th><th>Total</th><th /></tr></thead>
            <tbody>{rows.map(r => {
              const c = store.contractor(r.contractorId); const t = cycleTotals(c, r);
              return (
                <tr key={r.id}><td><strong>{c.legalName}</strong></td><td>{monthInfo(r.year, r.month).name} {r.year}</td><td>{pad4(r.number ?? 0)}</td>
                  <td>{formatMoney(t.base, c.currency)}</td><td>{formatMoney(t.bonus, c.currency)}</td><td><strong>{formatMoney(t.total, c.currency)}</strong></td>
                  <td><button className="btn btn-secondary btn-sm" onClick={() => setOpenId(r.id)}>Ver cuenta de cobro</button></td></tr>
              );
            })}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
