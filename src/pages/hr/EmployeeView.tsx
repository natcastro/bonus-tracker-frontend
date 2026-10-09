import { useState } from "react";
import type { HrStore } from "./hrStore";
import type { Contractor, Cycle } from "./hrData";
import {
  CURRENCIES, STATUS_LABEL, amountInWords, cycleTotals, daysOfCycle, formatMoney, isWeekend, looksEnglish, maskAccount, cycleInfo,
  overLimit, weekdayLabel, HR_HEAD,
} from "./hrData";
import { Banner, Stat, Tabs } from "./ui";
import SignaturePad from "./SignaturePad";
import InvoicePreview from "./InvoicePreview";

export default function EmployeeView({ store, c }: { store: HrStore; c: Contractor }) {
  const [tab, setTab] = useState<"ciclo" | "historial" | "perfil">("ciclo");
  const [viewId, setViewId] = useState<number | null>(null);
  const supervisor = store.supervisors.find(s => s.id === c.supervisorId);
  const history = store.cycles.filter(x => x.contractorId === c.id && x.status === "aprobada").sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
  const viewing = history.find(h => h.id === viewId);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Hola, {c.legalName.split(" ")[0]}</h2>
      <Tabs tabs={[["ciclo", "Mi ciclo actual"], ["historial", "Historial de pagos"], ["perfil", "Mi perfil"]]} value={tab} onChange={t => { setTab(t); setViewId(null); }} />

      {tab === "ciclo" && <CurrentCycle store={store} c={c} />}

      {tab === "historial" && (viewing ? (
        <div>
          <button className="btn btn-secondary btn-sm" onClick={() => setViewId(null)} style={{ marginBottom: 10 }}>← Volver</button>
          <InvoicePreview c={c} cycle={viewing} number={viewing.number} />
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          {history.length === 0 ? <p style={{ margin: 0, color: "var(--text-muted)" }}>Todavía no tienes pagos registrados.</p> : (
            <table className="data-table">
              <thead><tr><th>#</th><th>Mes</th><th>Total</th><th>Estado</th><th /></tr></thead>
              <tbody>{history.map(h => (
                <tr key={h.id}><td>{String(h.number).padStart(4, "0")}</td><td>{cycleInfo(h.year, h.month).name} {h.year}</td>
                  <td>{formatMoney(cycleTotals(c, h).total, c.currency)}</td><td><span className="badge badge-success">{STATUS_LABEL[h.status]}</span></td>
                  <td><button className="btn btn-secondary btn-sm" onClick={() => setViewId(h.id)}>Ver cuenta de cobro</button></td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      ))}

      {tab === "perfil" && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{c.legalName}</h3>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 0 }}>Esta información es fija y aparece en todas tus cuentas de cobro. Si algo está mal, avisa a {HR_HEAD}: solo él puede cambiarla.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.4rem 1.5rem", fontSize: "0.9rem" }}>
            <div><strong>Cargo:</strong> {c.position}</div>
            <div><strong>Supervisor:</strong> {supervisor ? `${supervisor.firstName} ${supervisor.lastName}` : `${HR_HEAD} (sin supervisor)`}</div>
            <div><strong>Correo personal:</strong> {c.email}</div>
            <div><strong>Teléfono:</strong> {c.phone}</div>
            <div><strong>Dirección:</strong> {c.address}, {c.country}</div>
            <div><strong>Tax ID:</strong> {c.taxId}</div>
            <div><strong>Pago:</strong> {c.payType === "hourly" ? `Por horas — ${formatMoney(c.hourlyRate, c.currency)}/h` : `Monto base — ${formatMoney(c.baseAmount, c.currency)}`}</div>
            <div><strong>Moneda:</strong> {c.currency}</div>
            <div><strong>Bono máximo por ciclo:</strong> {formatMoney(c.bonusCap, c.currency)}</div>
            <div><strong>Banco:</strong> {c.bank.bankName} ({c.bank.bankCountry})</div>
            <div><strong>Cuenta:</strong> {c.bank.accountType} {maskAccount(c.bank.accountNumber)}</div>
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 0 }}>🔒 En la versión real estos datos se guardan cifrados.</p>
        </div>
      )}
    </div>
  );
}

function CurrentCycle({ store, c }: { store: HrStore; c: Contractor }) {
  const cy = store.currentCycle(c.id) as Cycle;
  const [signature, setSignature] = useState<string | null>(cy.signature);
  const [showPreview, setShowPreview] = useState(false);
  const info = cycleInfo(cy.year, cy.month);
  const t = cycleTotals(c, cy);
  const hourly = c.payType === "hourly";
  const locked = cy.closed || cy.status !== "abierto";
  const over = overLimit(t.total, c.currency);
  const notesBad = cy.days.filter(d => d.hours > 0 && !d.note.trim()).length;
  const text = hourly ? cy.days.map(d => d.note).join(" ") : cy.summary;

  const problems: string[] = [];
  if (hourly && t.hours === 0) problems.push("Registra al menos un día con horas.");
  if (hourly && notesBad > 0) problems.push(`Faltan notas en ${notesBad} día(s) con horas.`);
  if (!hourly && cy.summary.trim().length < 15) problems.push("Describe lo que entregaste este mes (mínimo una frase).");
  if (text.trim() && !looksEnglish(text)) problems.push("Escribe las notas en inglés.");
  if (!signature) problems.push("Dibuja tu firma.");
  if (over) problems.push("El total supera el límite permitido; avisa a William.");

  return (
    <div>
      {cy.hrNote && cy.status === "abierto" && !cy.closed && <Banner tone="warn">William devolvió tu ciclo: {cy.hrNote} Corrígelo y vuelve a firmar.</Banner>}
      {store.isUploadDay && !locked && <Banner tone="warn">⏰ Hoy {store.info.uploadIso.slice(8)} es el día de subir tu cuenta de cobro (ciclo del {info.rangeEs}). Completa tus {hourly ? "horas y notas" : "entregables"}, firma y ciérralo. Mañana William la aprueba.</Banner>}
      {store.isApprovalDay && !locked && <Banner tone="bad">⚠ Hoy es el día en que William aprueba y tu ciclo sigue abierto. Ciérralo ya con tu firma; si no, se pagará el mes siguiente.</Banner>}
      {!store.isUploadDay && !store.isApprovalDay && !locked && <Banner tone="info">Tu ciclo de <strong>{info.name} {cy.year}</strong> va del {info.rangeEs}. El 24 subes tu cuenta de cobro y el 25 William la aprueba.</Banner>}
      {cy.status === "con_hr" && <Banner tone="ok">✓ Tu ciclo ya pasó por tu supervisor y está con William para la aprobación final.</Banner>}
      {cy.status === "aprobada" && <Banner tone="ok">✓ Ciclo aprobado y registrado.</Banner>}
      {cy.closed && cy.status === "abierto" && <Banner tone="info">Firmaste tu ciclo. Falta que {store.supervisors.find(s => s.id === c.supervisorId)?.firstName ?? HR_HEAD} apruebe y confirme el bono.</Banner>}

      <div className="summary-cards">
        <Stat label={hourly ? "Horas registradas" : "Monto base"} value={hourly ? `${t.hours} h` : formatMoney(t.base, c.currency)} sub={hourly ? `${formatMoney(c.hourlyRate, c.currency)} por hora` : undefined} />
        <Stat label={hourly ? "Pago por horas" : "Pago base"} value={formatMoney(t.base, c.currency)} />
        <Stat label="Bono" value={cy.bonus === null ? "—" : formatMoney(t.bonus, c.currency)} sub="Lo define tu supervisor" grey />
        <Stat label="Total hasta ahora" value={formatMoney(t.total, c.currency)} sub={t.total > 0 ? amountInWords(t.total, c.currency) : undefined} />
      </div>
      {over && <Banner tone="bad">El total supera el límite de {formatMoney(CURRENCIES[c.currency].limit, c.currency)}. Revisa tus horas o avisa a William.</Banner>}

      <div className="card" style={{ overflowX: "auto" }}>
        {hourly ? (
          <>
            <h4 style={{ marginTop: 0 }}>¿Cuántas horas trabajaste cada día y qué hiciste?</h4>
            <table className="data-table">
              <thead><tr><th>Día</th><th style={{ width: 90 }}>Horas</th><th>Qué hice (en inglés)</th><th /></tr></thead>
              <tbody>
                {daysOfCycle(cy.year, cy.month).map(d => {
                  const e = cy.days.find(x => x.date === d);
                  const future = d > store.todayIso;
                  const off = locked || future || !!e?.approved;
                  return (
                    <tr key={d} style={{ opacity: future ? 0.45 : 1, background: isWeekend(d) ? "#f8fafc" : undefined }}>
                      <td style={{ whiteSpace: "nowrap" }}>{weekdayLabel(d)}</td>
                      <td><input className="form-control" type="number" min="0" max="24" step="0.25" disabled={off} value={e?.hours || ""} placeholder="0"
                        onChange={ev => store.updateDay(cy.id, d, { hours: Math.min(24, Number(ev.target.value) || 0) })} /></td>
                      <td><input className="form-control" disabled={off} value={e?.note ?? ""} placeholder={future ? "" : "Ex: Answered customer chats…"}
                        onChange={ev => store.updateDay(cy.id, d, { note: ev.target.value })} /></td>
                      <td>{e?.approved ? <span className="badge badge-success">✓ Aprobado</span> : e && e.hours > 0 ? <span className="badge badge-warning">Pendiente</span> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        ) : (
          <>
            <h4 style={{ marginTop: 0 }}>¿Qué entregaste este mes?</h4>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 0 }}>Tu pago es fijo, así que no registras horas. Escribe en inglés una descripción general: la gerencia quiere ver lo que se hizo.</p>
            <textarea className="form-control" rows={5} disabled={locked || cy.summaryApproved} value={cy.summary} onChange={e => store.setSummary(cy.id, e.target.value)} placeholder="Ex: Designed the monthly campaign banners and updated product images." />
            {cy.summaryApproved && <span className="badge badge-success" style={{ marginTop: 8 }}>✓ Aprobado</span>}
          </>
        )}
      </div>

      {!locked && (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>Firma y cierre</h4>
          <SignaturePad value={signature} onChange={setSignature} />
          {problems.length > 0 && <ul style={{ color: "#991b1b", fontSize: "0.85rem", paddingLeft: "1.1rem" }}>{problems.map(p => <li key={p}>{p}</li>)}</ul>}
          <button className="btn btn-primary" style={{ marginTop: 8 }} disabled={problems.length > 0} onClick={() => store.closeCycle(cy.id, signature!)}>Firmar y cerrar mi ciclo</button>
        </div>
      )}

      <button className="btn btn-secondary btn-sm" onClick={() => setShowPreview(v => !v)}>{showPreview ? "Ocultar mi cuenta de cobro" : "Ver cómo quedará mi cuenta de cobro"}</button>
      {showPreview && <div style={{ marginTop: "1rem" }}><InvoicePreview c={c} cycle={{ ...cy, signature }} number={cy.number} /></div>}
    </div>
  );
}
