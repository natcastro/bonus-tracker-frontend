import { useState } from "react";
import type { HrStore } from "./hrStore";
import type { Contractor, Cycle } from "./hrData";
import {
  CURRENCIES, STATUS_LABEL, amountInWords, approvalsComplete, cycleFileName, cycleTotals, formatMoney, monthInfo, weekdayLabel,
} from "./hrData";
import { Banner, Stat } from "./ui";
import InvoicePreview from "./InvoicePreview";

// What a supervisor (day-by-day approvals + bonus) or William (final review) sees for one contractor's cycle.
export default function CycleReview({ store, c, cy, mode, onBack }: { store: HrStore; c: Contractor; cy: Cycle; mode: "supervisor" | "hr"; onBack: () => void }) {
  const [bonusText, setBonusText] = useState(cy.bonus === null ? "" : String(cy.bonus));
  const [bonusErr, setBonusErr] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const info = monthInfo(cy.year, cy.month);
  const t = cycleTotals(c, cy);
  const hourly = c.payType === "hourly";
  const canAct = mode === "supervisor" && cy.status === "abierto";
  const pendingDays = cy.days.filter(d => d.hours > 0 && !d.approved).length;

  const saveBonus = () => {
    const n = Number(bonusText);
    if (bonusText.trim() === "" || isNaN(n)) { setBonusErr("Escribe el bono (si no hay, escribe 0)."); return; }
    const err = store.setBonus(cy.id, n);
    setBonusErr(err ?? "");
  };

  return (
    <div>
      <button className="btn btn-secondary btn-sm" onClick={onBack} style={{ marginBottom: 10 }}>← Volver</button>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: "0.75rem" }}>
        <div>
          <h3 style={{ margin: 0 }}>{c.legalName} <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: "0.9rem" }}>— {c.position}</span></h3>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Ciclo {info.name} {cy.year} · {STATUS_LABEL[cy.status]}</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowPreview(v => !v)}>{showPreview ? "Ocultar cuenta de cobro" : "Ver cuenta de cobro"}</button>
      </div>

      {cy.hrNote && cy.status === "abierto" && <Banner tone="warn">Devuelta por William: {cy.hrNote}</Banner>}

      <div className="summary-cards">
        <Stat label={hourly ? `Horas × ${formatMoney(c.hourlyRate, c.currency)}` : "Monto base"} value={formatMoney(t.base, c.currency)} sub={hourly ? `${t.hours} horas` : undefined} />
        <Stat label="Bono" value={cy.bonus === null ? "Pendiente" : formatMoney(t.bonus, c.currency)} grey={cy.bonus === null} />
        <Stat label="Total del ciclo" value={formatMoney(t.total, c.currency)} sub={t.total > 0 ? amountInWords(t.total, c.currency) : undefined} />
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <h4 style={{ margin: 0 }}>{hourly ? "Horas y notas por día" : "Entregables del mes"}</h4>
          {canAct && (
            <div style={{ display: "flex", gap: 6 }}>
              {hourly && <button className="btn btn-secondary btn-sm" disabled={pendingDays === 0} onClick={() => store.approveAll(cy.id)}>Aprobar todos los días</button>}
              <button className="btn btn-primary btn-sm" onClick={() => store.approveAll(cy.id)}>Aprobar todo el mes</button>
            </div>
          )}
        </div>

        {hourly ? (
          cy.days.length === 0 ? <p style={{ color: "var(--text-muted)", margin: 0 }}>Todavía no hay horas registradas en este ciclo.</p> : (
            <table className="data-table">
              <thead><tr><th>Día</th><th>Horas</th><th>Qué hizo</th><th /></tr></thead>
              <tbody>
                {cy.days.map(d => (
                  <tr key={d.date}>
                    <td style={{ whiteSpace: "nowrap" }}>{weekdayLabel(d.date)}</td>
                    <td>{d.hours}</td>
                    <td>{d.note || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {d.approved ? <span className="badge badge-success">✓ Aprobado</span>
                        : canAct ? <button className="btn btn-secondary btn-sm" onClick={() => store.approveDay(cy.id, d.date)}>Aprobar</button>
                          : <span className="badge badge-warning">Pendiente</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          <div>
            <p style={{ whiteSpace: "pre-wrap", margin: "0 0 8px" }}>{cy.summary || <span style={{ color: "var(--text-muted)" }}>Todavía no escribió nada.</span>}</p>
            {cy.summaryApproved ? <span className="badge badge-success">✓ Aprobado</span>
              : canAct && cy.summary.trim() ? <button className="btn btn-secondary btn-sm" onClick={() => store.approveSummary(cy.id)}>Aprobar entregables</button>
                : <span className="badge badge-warning">Pendiente</span>}
          </div>
        )}
      </div>

      {mode === "supervisor" && (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>Bono del ciclo</h4>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 0 }}>Solo tú lo defines. Si no hubo bono, escribe <strong>0</strong>: el ciclo no avanza hasta que lo confirmes.</p>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Bono ({c.currency})</label>
              <input className="form-control" type="number" min="0" step="0.01" value={bonusText} disabled={!canAct} onChange={e => { setBonusText(e.target.value); setBonusErr(""); }} />
            </div>
            <button className="btn btn-primary" disabled={!canAct} onClick={saveBonus}>Guardar bono</button>
          </div>
          {bonusText.trim() !== "" && !isNaN(Number(bonusText)) && Number(bonusText) > 0 && (
            <p style={{ fontSize: "0.8rem", margin: "0.5rem 0 0", color: "#334155" }}>= {amountInWords(Number(bonusText), c.currency)} — revisa que sea el monto correcto.</p>
          )}
          {bonusErr && <p className="error-msg">{bonusErr}</p>}
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.75rem 0 0" }}>Límite por ciclo: {formatMoney(CURRENCIES[c.currency].limit, c.currency)}.</p>
        </div>
      )}

      {mode === "supervisor" && cy.status === "abierto" && (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>Para enviarse a {"William"}</h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.875rem" }}>
            {[
              [approvalsComplete(c, cy), hourly ? "Todos los días con horas están aprobados" : "Entregables aprobados"],
              [cy.bonus !== null, "Bono confirmado (aunque sea 0)"],
              [cy.closed && !!cy.signature, `${c.legalName} firmó y cerró su ciclo`],
            ].map(([ok, text], i) => <li key={i} style={{ padding: "2px 0", color: ok ? "#166534" : "#991b1b" }}>{ok ? "✓" : "✗"} {text as string}</li>)}
          </ul>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0.5rem 0 0" }}>Cuando las tres estén ✓, el ciclo se envía solo a William.</p>
        </div>
      )}

      {mode === "hr" && cy.status === "con_hr" && (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>Tu decisión</h4>
          <p style={{ fontSize: "0.85rem", margin: "0 0 8px" }}>Archivo: <code>{cycleFileName(c, null, cy.year, cy.month)}</code> (el número se asigna al aprobar).</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <button className="btn btn-primary" onClick={() => { store.hrApprove(cy.id); onBack(); }}>✓ Aprobar y registrar en el historial</button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="form-control" style={{ flex: "1 1 260px" }} placeholder="Motivo si la devuelves…" value={returnNote} onChange={e => setReturnNote(e.target.value)} />
            <button className="btn btn-secondary" onClick={() => { store.hrReturn(cy.id, returnNote); onBack(); }}>Devolver</button>
          </div>
        </div>
      )}

      {showPreview && <div style={{ marginTop: "1rem" }}><InvoicePreview c={c} cycle={cy} number={cy.number} /></div>}
    </div>
  );
}
