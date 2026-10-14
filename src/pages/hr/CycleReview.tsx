import { useState } from "react";
import type { HrStore } from "./hrStore";
import type { Contractor, Cycle } from "./hrData";
import {
  CURRENCIES, HR_HEAD, STATUS_LABEL, amountInWords, approvalsComplete, cycleFileName, cycleTotals, formatMoney, cycleInfo, weekdayLabel,
} from "./hrData";
import { Banner, Stat } from "./ui";
import InvoicePreview from "./InvoicePreview";
import MoneyInput from "./MoneyInput";
import CycleStepper from "./CycleStepper";

// What a supervisor (day-by-day approvals + bonus) or William (final review) sees for one contractor's cycle.
export default function CycleReview({ store, c, cy, mode, onBack }: { store: HrStore; c: Contractor; cy: Cycle; mode: "supervisor" | "hr"; onBack: () => void }) {
  const variable = c.payType === "variable";
  const [bonusVal, setBonusVal] = useState<number | null>(variable ? cy.variableAmount : cy.bonus);
  const [bonusErr, setBonusErr] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const info = cycleInfo(cy.year, cy.month);
  const t = cycleTotals(c, cy);
  const hourly = c.payType === "hourly";
  const canAct = mode === "supervisor" && cy.status === "abierto";
  const pendingDays = cy.days.filter(d => d.hours > 0 && !d.approved).length;

  const saveBonus = (amount: number | null = bonusVal) => {
    if (amount === null) { setBonusErr(variable ? "Escribe el monto del mes (si no hubo, escribe 0)." : "Escribe el bono (si no hay, escribe 0)."); return; }
    const err = variable ? store.setVariable(cy.id, amount) : store.setBonus(cy.id, amount);
    setBonusErr(err ?? "");
  };


  return (
    <div>
      <button className="btn btn-secondary btn-sm" onClick={onBack} style={{ marginBottom: 10 }}>← Volver</button>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: "0.75rem" }}>
        <div>
          <h3 style={{ margin: 0 }}>{c.legalName} <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: "0.9rem" }}>— {c.position}</span></h3>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Ciclo {info.name} {cy.year} ({info.rangeEs}) · {STATUS_LABEL[cy.status]}</div>
        </div>
      </div>

      {cy.hrNote && cy.status === "abierto" && <Banner tone="warn">Devuelta por William: {cy.hrNote}</Banner>}

      <CycleStepper c={c} cy={cy} supervisorName={store.supervisors.find(x => x.id === c.supervisorId)?.firstName ?? HR_HEAD} />

      <div className="summary-cards">
        <Stat label={hourly ? `Horas × ${formatMoney(c.hourlyRate, c.currency)}` : variable ? "Base garantizada" : "Monto base"} value={formatMoney(hourly ? t.base : c.baseAmount, c.currency)} sub={hourly ? `${t.hours} horas` : undefined} />
        {variable
          ? <Stat label="Monto variable" value={cy.variableAmount === null ? "Pendiente" : formatMoney(t.variable, c.currency)} sub={c.monthlyCap ? `Máx. del mes: ${formatMoney(c.monthlyCap, c.currency)}` : undefined} grey={cy.variableAmount === null} />
          : <Stat label="Bono" value={cy.bonus === null ? "Pendiente" : formatMoney(t.bonus, c.currency)} sub={`Máximo: ${formatMoney(c.bonusCap, c.currency)}`} grey={cy.bonus === null} />}
        <Stat strong label="Total del ciclo" value={formatMoney(t.total, c.currency)} sub={t.total > 0 ? amountInWords(t.total, c.currency) : undefined} />
      </div>

      <div className="hr-split">
        <div style={{ minWidth: 0 }}>
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
            <h4 style={{ marginTop: 0 }}>{variable ? "Monto variable del mes" : "Bono del ciclo"}</h4>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 0 }}>Solo tú lo defines. Si {variable ? "no hubo monto variable" : "no hubo bono"}, escribe <strong>0</strong>: el ciclo no avanza hasta que lo confirmes.{variable && c.notes ? <> Nota de HR: <em>{c.notes}</em></> : null}</p>
            {!variable && c.bonusCap === 0 ? (
              <div>
                <p style={{ margin: "0 0 10px", fontSize: "0.88rem" }}><strong>{c.legalName}</strong> no tiene bono configurado (máximo {formatMoney(0, c.currency)}). Si no recibe bono este mes, confírmalo para poder enviar el ciclo.</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <button className="btn btn-primary" disabled={!canAct || cy.bonus === 0} onClick={() => saveBonus(0)}>{cy.bonus === 0 ? "✓ Sin bono confirmado" : "Confirmar: sin bono"}</button>
                  <span className="hr-note">¿Debería tener bono? Pídele a William que defina el tope en <em>Personas registradas → Editar</em>.</span>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div className="form-group" style={{ marginBottom: 0, minWidth: 230 }}>
                  <label>{variable ? "Monto variable" : "Bono"} ({c.currency})</label>
                  <MoneyInput value={bonusVal} currency={c.currency} disabled={!canAct} onChange={(n) => { setBonusVal(n); setBonusErr(""); }} />
                </div>
                <button className="btn btn-primary" disabled={!canAct} onClick={() => saveBonus()}>{variable ? "Guardar monto" : "Guardar bono"}</button>
                {!variable && <button className="btn btn-secondary" disabled={!canAct} onClick={() => { setBonusVal(0); saveBonus(0); }}>Sin bono (0)</button>}
              </div>
            )}
            {bonusVal !== null && bonusVal > 0 && (
              <p style={{ fontSize: "0.82rem", margin: "0.5rem 0 0", color: "#334155" }}>{formatMoney(bonusVal, c.currency)} = <strong>{amountInWords(bonusVal, c.currency)}</strong> — revisa que sea el monto correcto.</p>
            )}
            {bonusErr && <p className="error-msg">{bonusErr}</p>}
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.75rem 0 0" }}>
              {!variable && <>Máximo de bono de {c.legalName}: <strong>{formatMoney(c.bonusCap, c.currency)}</strong> por ciclo (lo define William). </>}
              {c.monthlyCap ? <>Máximo total al mes: <strong>{formatMoney(c.monthlyCap, c.currency)}</strong>. </> : null}
              Límite total del ciclo: {formatMoney(CURRENCIES[c.currency].limit, c.currency)}.
            </p>
          </div>
        )}
  
        {mode === "supervisor" && cy.status === "abierto" && (
          <div className="card">
            <h4 style={{ marginTop: 0 }}>Para enviarse a {"William"}</h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.875rem" }}>
              {[
                [approvalsComplete(c, cy), hourly ? "Todos los días con horas están aprobados" : "Entregables aprobados"],
                [variable ? cy.variableAmount !== null : cy.bonus !== null, variable ? "Monto variable confirmado (aunque sea 0)" : "Bono confirmado (aunque sea 0)"],
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
  
          </div>
        <aside className="hr-split__side" aria-label="Vista previa de la cuenta de cobro">
          <div className="hr-sidehead"><span>Cuenta de cobro</span><span className="hr-live">EN VIVO</span></div>
          <InvoicePreview c={c} cycle={cy} number={cy.number ?? store.nextNumber(c.id)} provisional={cy.number === null} />
        </aside>
      </div>
    </div>
  );
}
