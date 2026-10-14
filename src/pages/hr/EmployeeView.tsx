import { useState } from "react";
import type { HrStore } from "./hrStore";
import type { Contractor, Cycle } from "./hrData";
import {
  CURRENCIES, PAY_TYPE_LABEL, amountInWords, cycleStatusText, cycleTotals, daysOfCycle, formatMoney, isWeekend, looksEnglish, maskAccount, cycleInfo,
  overLimit, weekdayLabel, HR_HEAD,
} from "./hrData";
import { Banner, Empty, PageHeader, Stat, Tabs } from "./ui";
import SignaturePad from "./SignaturePad";
import InvoicePreview from "./InvoicePreview";
import CycleStepper from "./CycleStepper";

export default function EmployeeView({ store, c, embedded }: { store: HrStore; c: Contractor; embedded?: boolean }) {
  const [tab, setTab] = useState<"ciclo" | "historial" | "perfil">("ciclo");
  const [viewId, setViewId] = useState<number | null>(null);
  const supervisor = store.supervisors.find(s => s.id === c.supervisorId);
  const history = store.cycles.filter(x => x.contractorId === c.id).sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
  const viewing = history.find(h => h.id === viewId);

  return (
    <div>
      {!embedded && <PageHeader role="employee" name={c.legalName} title={`Hola, ${c.legalName.split(" ")[0]}`} chip={c.paymentMethod === "adp" ? "ADP" : "Contratista"} subtitle={`${c.position} · ${c.country}${c.region ? ` ${c.region}` : ""} · ${c.currency}`} />}
      <Tabs tabs={[["ciclo", "Mi ciclo actual"], ["historial", "Historial de pagos"], ["perfil", "Mi perfil"]]} value={tab} onChange={t => { setTab(t); setViewId(null); }} />

      {tab === "ciclo" && <CurrentCycle store={store} c={c} />}

      {tab === "historial" && (viewing ? (
        <div>
          <button className="btn btn-secondary btn-sm" onClick={() => setViewId(null)} style={{ marginBottom: 10 }}>← Volver</button>
          <InvoicePreview c={c} cycle={viewing} number={viewing.number ?? store.nextNumber(c.id)} provisional={viewing.number === null} />
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <p className="hr-note" style={{ marginTop: 0 }}>Aquí aparece cada ciclo apenas lo empiezas, con el punto exacto en el que va. Cuando William lo aprueba queda como pago registrado.</p>
          {history.length === 0 ? <Empty icon="–" title="Todavía no tienes ciclos" hint="Tu primer ciclo aparecerá aquí." /> : (
            <table className="data-table">
              <thead><tr><th>#</th><th>Ciclo</th><th>Total</th><th>Dónde va</th><th /></tr></thead>
              <tbody>{history.map(h => (
                <tr key={h.id}>
                  <td>{h.number ? String(h.number).padStart(4, "0") : <span style={{ color: "var(--hr-faint)" }}>—</span>}</td>
                  <td>{cycleInfo(h.year, h.month).name} {h.year}<div className="hr-note">{cycleInfo(h.year, h.month).rangeEs}</div></td>
                  <td>{formatMoney(cycleTotals(c, h).total, c.currency)}</td>
                  <td><span className={`badge ${h.status === "aprobada" ? "badge-success" : h.status === "con_hr" ? "badge-warning" : "badge-warning"}`}>{cycleStatusText(c, h, supervisor?.firstName ?? HR_HEAD)}</span></td>
                  <td><button className="btn btn-secondary btn-sm" onClick={() => setViewId(h.id)}>Ver cuenta de cobro</button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      ))}

      {tab === "perfil" && (
        <div className="hr-view">
          <div className="card">
            <h3 style={{ marginTop: 0 }}>{c.legalName}</h3>
            <p className="hr-note" style={{ marginTop: 0 }}>Esta información es fija y aparece en todas tus cuentas de cobro. Si algo está mal o falta, avisa a {HR_HEAD}: solo él puede cambiarla.</p>
            <div className="hr-kv">
              <div><span>Cargo / área</span>{c.position}</div>
              <div><span>Supervisor</span>{supervisor ? `${supervisor.firstName} ${supervisor.lastName}`.trim() : `${HR_HEAD} (sin supervisor)`}</div>
              <div><span>Ubicación</span>{c.country}{c.region ? ` — ${c.region}` : ""}</div>
              <div><span>Correo personal</span>{c.email || <em className="hr-pending">pendiente</em>}</div>
              <div><span>Teléfono</span>{c.phone || <em className="hr-pending">pendiente</em>}</div>
              <div><span>Dirección</span>{c.address || <em className="hr-pending">pendiente</em>}</div>
              <div><span>Tax ID</span>{c.taxId || <em className="hr-pending">pendiente</em>}</div>
              <div><span>Banco</span>{c.paymentMethod === "adp" ? "Paga ADP" : c.bank.bankName ? `${c.bank.bankName} (${c.bank.bankCountry})` : <em className="hr-pending">pendiente</em>}</div>
              {c.paymentMethod === "wired" && <div><span>Cuenta</span>{c.bank.accountNumber ? `${c.bank.accountType} ${maskAccount(c.bank.accountNumber)}` : <em className="hr-pending">pendiente</em>}</div>}
            </div>
          </div>
          <div className="card">
            <h4 style={{ marginTop: 0 }}>Cómo se te paga</h4>
            <div className="hr-kv">
              <div><span>Modalidad</span>{PAY_TYPE_LABEL[c.payType]}</div>
              <div><span>{c.payType === "hourly" ? "Tarifa por hora" : c.payType === "variable" ? "Base garantizada" : "Monto base mensual"}</span>
                {c.payType === "hourly" ? (c.hourlyRate ? formatMoney(c.hourlyRate, c.currency) : <em className="hr-pending">pendiente</em>) : formatMoney(c.baseAmount, c.currency)}</div>
              <div><span>Moneda</span>{c.currency}</div>
              <div><span>Método y día de pago</span>{c.paymentMethod === "adp" ? "ADP" : "Transferencia internacional"} · día {c.payDay}</div>
              <div><span>Bono</span>
                {c.payType === "variable" ? "No aplica: el supervisor reporta un monto variable cada mes"
                  : c.bonusCap > 0 ? <>Hasta <strong>{formatMoney(c.bonusCap, c.currency)}</strong> por ciclo — lo define tu supervisor</>
                  : c.issues.some(i => i.includes("tope de bono")) ? <em className="hr-pending">pendiente: William debe definir el tope</em> : "Sin bono"}</div>
              {c.monthlyCap && <div><span>Máximo total al mes</span>{formatMoney(c.monthlyCap, c.currency)}</div>}
              {c.weeklyHoursCap && <div><span>Máximo de horas por semana</span>{c.weeklyHoursCap} h</div>}
            </div>
            <p className="hr-note" style={{ marginBottom: 0 }}>🔒 En la versión real los datos bancarios y de identificación se guardan cifrados.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// People paid through ADP don't send a cuenta de cobro — they just see how they are paid.
function CurrentCycle({ store, c }: { store: HrStore; c: Contractor }) {
  const cy = store.currentCycle(c.id);
  if (!cy) {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Tu pago</h3>
        <p style={{ margin: 0 }}>{c.paymentMethod === "adp" ? "Tu pago se procesa por ADP" : "No tienes un ciclo de pago abierto"}, el día {c.payDay} de cada mes. No necesitas enviar cuenta de cobro.</p>
      </div>
    );
  }
  return <CycleEditor store={store} c={c} cy={cy} />;
}

function CycleEditor({ store, c, cy }: { store: HrStore; c: Contractor; cy: Cycle }) {
  const [signature, setSignature] = useState<string | null>(cy.signature);
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
  if (hourly && c.weeklyHoursCap) {
    const weeks = new Map<string, number>();
    cy.days.forEach(d => { const dt = new Date(`${d.date}T12:00:00`); dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); const k = dt.toISOString().slice(0, 10); weeks.set(k, (weeks.get(k) ?? 0) + d.hours); });
    const bad = [...weeks.entries()].filter(([, h]) => h > c.weeklyHoursCap!);
    if (bad.length) problems.push(`Superas el máximo de ${c.weeklyHoursCap} horas por semana (semana del ${bad[0][0]}: ${bad[0][1]} h).`);
  }
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

      <CycleStepper c={c} cy={cy} supervisorName={store.supervisors.find(x => x.id === c.supervisorId)?.firstName ?? HR_HEAD} />

      <div className="summary-cards">
        <Stat label={hourly ? "Horas registradas" : "Monto base"} value={hourly ? `${t.hours} h` : formatMoney(t.base, c.currency)} sub={hourly ? `${formatMoney(c.hourlyRate, c.currency)} por hora` : undefined} />
        <Stat label={hourly ? "Pago por horas" : c.payType === "variable" ? "Base garantizada" : "Pago base"} value={formatMoney(hourly ? t.base : c.baseAmount, c.currency)} />
        {c.payType === "variable"
          ? <Stat label="Monto variable" value={cy.variableAmount === null ? "—" : formatMoney(t.variable, c.currency)} sub="Lo define tu supervisor" grey />
          : <Stat label="Bono" value={cy.bonus === null ? "—" : formatMoney(t.bonus, c.currency)} sub={c.bonusCap > 0 ? `Lo define tu supervisor · máx. ${formatMoney(c.bonusCap, c.currency)}` : "Lo define tu supervisor"} grey />}
        <Stat strong label="Total hasta ahora" value={formatMoney(t.total, c.currency)} sub={t.total > 0 ? amountInWords(t.total, c.currency) : undefined} />
      </div>
      {over && <Banner tone="bad">El total supera el límite de {formatMoney(CURRENCIES[c.currency].limit, c.currency)}. Revisa tus horas o avisa a William.</Banner>}

      <div className="hr-split">
        <div style={{ minWidth: 0 }}>
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
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 0 }}>Tu pago no depende de horas, así que no las registras. Escribe en inglés una descripción general: la gerencia quiere ver lo que se hizo.</p>
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
  
          </div>
        <aside className="hr-split__side" aria-label="Vista previa de tu cuenta de cobro">
          <div className="hr-sidehead"><span>Tu cuenta de cobro</span><span className="hr-live">EN VIVO</span></div>
          <InvoicePreview c={c} cycle={{ ...cy, signature }} number={cy.number ?? store.nextNumber(c.id)} provisional={cy.number === null} />
        </aside>
      </div>
    </div>
  );
}
