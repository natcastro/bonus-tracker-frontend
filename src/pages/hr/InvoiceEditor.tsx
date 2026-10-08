import { useMemo, useRef, useState, useEffect } from "react";
import type { Contractor, HourRow, Invoice } from "./hrData";
import { amountInWords, formatMoney, invoiceFileName, invoiceTotals, looksEnglish, monthInfo, nextInvoiceNumber, pad4 } from "./hrData";
import InvoicePreview from "./InvoicePreview";

// Draw-your-signature box (a typed name is not accepted per HR's rules).
function SignaturePad({ value, onChange }: { value: string | null; onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (value) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0); img.src = value; }
  }, [value]);

  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) * (ref.current!.width / r.width), y: (e.clientY - r.top) * (ref.current!.height / r.height) }; };
  const down = (e: React.PointerEvent) => { drawing.current = true; ref.current!.setPointerCapture(e.pointerId); const ctx = ref.current!.getContext("2d")!; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext("2d")!; const p = pos(e);
    ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.strokeStyle = "#0f172a"; ctx.lineTo(p.x, p.y); ctx.stroke();
  };
  const up = () => { if (!drawing.current) return; drawing.current = false; onChange(ref.current!.toDataURL("image/png")); };

  return (
    <div>
      <canvas ref={ref} width={520} height={140} onPointerDown={down} onPointerMove={move} onPointerUp={up}
        style={{ width: "100%", maxWidth: 520, height: 140, border: "1px dashed #94a3b8", borderRadius: 8, background: "#fff", touchAction: "none", cursor: "crosshair" }} />
      <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => onChange(null)}>Borrar firma</button>
    </div>
  );
}

const lastMonthOf = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return { year: d.getFullYear(), month: d.getMonth() + 1 }; };

export default function InvoiceEditor({ contractor: c, invoices, onSubmit, onSaveDraft, onCancel }: {
  contractor: Contractor; invoices: Invoice[];
  onSubmit: (inv: Omit<Invoice, "id" | "status">) => void; onSaveDraft: (inv: Omit<Invoice, "id" | "status">) => void; onCancel: () => void;
}) {
  const initial = lastMonthOf();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [hourRows, setHourRows] = useState<HourRow[]>([{ date: "", hours: 0, task: "" }]);
  const [baseAmount, setBaseAmount] = useState(c.payType === "fixed" ? c.baseAmount : 0);
  const [bonus, setBonus] = useState(0);
  const [description, setDescription] = useState("");
  const [signature, setSignature] = useState<string | null>(null);

  const info = monthInfo(year, month);
  const number = nextInvoiceNumber(invoices, c.id);
  const draft = { contractorId: c.id, number, year, month, hourRows, baseAmount, bonus, description, signature };
  const t = invoiceTotals(c, draft);
  const hourly = c.payType === "hourly";
  const duplicate = invoices.some(i => i.contractorId === c.id && i.year === year && i.month === month && i.status !== "devuelta" && i.status !== "borrador");

  const checks = useMemo(() => {
    const rowsOk = hourRows.filter(r => Number(r.hours) > 0).every(r => r.task.trim() && r.date >= info.firstIso && r.date <= info.lastIso);
    const list: { ok: boolean; text: string }[] = [
      { ok: true, text: `Consecutivo automático: ${pad4(number)}` },
      { ok: true, text: `Fecha de cierre automática: ${info.closing}` },
      { ok: !duplicate, text: duplicate ? `Ya existe una cuenta de cobro de ${info.name} ${year} para esta persona` : "No hay otra cuenta de cobro de este mes" },
      { ok: description.trim().length >= 15 && looksEnglish(description), text: "Descripción del trabajo del mes, escrita en inglés" },
      { ok: t.total > 0, text: `Monto total mayor que cero (${formatMoney(t.total, c.currency)})` },
      { ok: true, text: `Valor en letras generado: ${t.total > 0 ? amountInWords(t.total, c.currency) : "—"}` },
      { ok: !!signature, text: "Firma electrónica dibujada (no se acepta solo el nombre)" },
    ];
    if (hourly) {
      list.splice(4, 0,
        { ok: t.hours > 0, text: `Horas registradas: ${t.hours}` },
        { ok: rowsOk, text: "Cada fila con horas tiene tarea y una fecha dentro del mes" });
    }
    return list;
  }, [description, signature, t.total, t.hours, hourRows, duplicate, number, info, year, hourly, c.currency]);

  const allOk = checks.every(x => x.ok);
  const setRow = (i: number, patch: Partial<HourRow>) => setHourRows(rows => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const yearOptions = [new Date().getFullYear() - 1, new Date().getFullYear()];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: "1rem" }}>
        <h3 style={{ margin: 0 }}>Cuenta de cobro — {c.legalName}</h3>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>← Volver</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: "1rem", alignItems: "start" }}>
        <div>
          <div className="card">
            <h4 style={{ marginTop: 0 }}>1. Mes a facturar</h4>
            <div className="form-row">
              <div className="form-group"><label>Mes</label>
                <select className="form-control" value={month} onChange={e => setMonth(Number(e.target.value))}>
                  {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthInfo(2026, i + 1).name}</option>)}
                </select></div>
              <div className="form-group"><label>Año</label>
                <select className="form-control" value={year} onChange={e => setYear(Number(e.target.value))}>{yearOptions.map(y => <option key={y}>{y}</option>)}</select></div>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0.5rem 0 0" }}>
              Se llena solo: período <strong>{info.period}</strong> · fecha de pago <strong>{info.dueDate}</strong> · enviar a más tardar el <strong>{info.submitBy}</strong>.
            </p>
          </div>

          <div className="card">
            <h4 style={{ marginTop: 0 }}>2. {hourly ? "Mis horas" : "Mi monto"}</h4>
            {hourly ? (
              <>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 0 }}>Tarifa: {formatMoney(c.hourlyRate, c.currency)} por hora. Escribe hora por hora lo que hiciste (va en la página 2).</p>
                {hourRows.map((r, i) => (
                  <div key={i} className="form-row" style={{ marginBottom: 6 }}>
                    <div className="form-group" style={{ minWidth: 130, flex: "0 0 150px" }}><input className="form-control" type="date" min={info.firstIso} max={info.lastIso} value={r.date} onChange={e => setRow(i, { date: e.target.value })} /></div>
                    <div className="form-group" style={{ minWidth: 70, flex: "0 0 80px" }}><input className="form-control" type="number" min="0" step="0.25" placeholder="Horas" value={r.hours || ""} onChange={e => setRow(i, { hours: Number(e.target.value) })} /></div>
                    <div className="form-group"><input className="form-control" placeholder="Task (in English)" value={r.task} onChange={e => setRow(i, { task: e.target.value })} /></div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setHourRows(rows => rows.length > 1 ? rows.filter((_, j) => j !== i) : rows)}>✕</button>
                  </div>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setHourRows(rows => [...rows, { date: "", hours: 0, task: "" }])}>+ Agregar fila</button>
                <p style={{ margin: "0.75rem 0 0", fontWeight: 700 }}>Total: {t.hours} h → {formatMoney(t.base, c.currency)}</p>
              </>
            ) : (
              <div className="form-group"><label>Monto base del mes ({c.currency})</label>
                <input className="form-control" type="number" min="0" step="0.01" value={baseAmount || ""} onChange={e => setBaseAmount(Number(e.target.value))} /></div>
            )}
            <div className="form-group" style={{ marginTop: 10 }}><label>Bonos ganados este mes ({c.currency}) — opcional</label>
              <input className="form-control" type="number" min="0" step="0.01" value={bonus || ""} onChange={e => setBonus(Number(e.target.value))} /></div>
          </div>

          <div className="card">
            <h4 style={{ marginTop: 0 }}>3. ¿Qué hice este mes?</h4>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 0 }}>Escríbelo en <strong>inglés</strong>. Aunque no seas por horas, la gerencia quiere ver lo que se hizo.</p>
            <textarea className="form-control" rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Customer support, order follow-up and weekly reports." />
          </div>

          <div className="card">
            <h4 style={{ marginTop: 0 }}>4. Firma</h4>
            <SignaturePad value={signature} onChange={setSignature} />
          </div>

          <div className="card">
            <h4 style={{ marginTop: 0 }}>Revisión automática</h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.875rem" }}>
              {checks.map((x, i) => (
                <li key={i} style={{ padding: "3px 0", color: x.ok ? "#166534" : "#991b1b" }}>{x.ok ? "✓" : "✗"} {x.text}</li>
              ))}
            </ul>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0.75rem 0 0" }}>Archivo que se generará: <code>{invoiceFileName(c, number, year, month)}</code></p>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button className="btn btn-primary" disabled={!allOk} onClick={() => onSubmit(draft)}>
                Enviar a {c.supervisor ?? "William"} para aprobación
              </button>
              <button className="btn btn-secondary" onClick={() => onSaveDraft(draft)}>Guardar borrador</button>
            </div>
            {!allOk && <p style={{ fontSize: "0.8rem", color: "#991b1b", margin: "0.5rem 0 0" }}>Corrige los puntos con ✗ para poder enviarla.</p>}
          </div>
        </div>

        <div style={{ position: "sticky", top: 70 }}>
          <p style={{ fontWeight: 700, fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 6px" }}>Así se verá la cuenta de cobro</p>
          <InvoicePreview c={c} inv={draft} number={number} />
        </div>
      </div>
    </div>
  );
}
