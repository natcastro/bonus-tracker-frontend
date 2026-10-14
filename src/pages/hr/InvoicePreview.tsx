import type { Contractor, Cycle } from "./hrData";
import { BILL_TO, amountInWords, cycleDescription, cycleTotals, formatMoney, maskAccount, cycleInfo, pad4 } from "./hrData";

// On-screen version of HR's invoice template (the real version will be a PDF with the same layout).
// It is always rendered from the live cycle, so it fills itself in as the person types.
export default function InvoicePreview({ c, cycle, number }: { c: Contractor; cycle: Cycle; number: number | null }) {
  const info = cycleInfo(cycle.year, cycle.month);
  const t = cycleTotals(c, cycle);
  const hourly = c.payType === "hourly";
  const rows = cycle.days.filter(r => Number(r.hours) > 0);
  const description = cycleDescription(c, cycle);
  const empty = <span style={{ color: "#a3a7ae" }}>—</span>;

  return (
    <div className="hr-desk">
      <div className="hr-paper">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, paddingBottom: 12, borderBottom: "2px solid #231f20" }}>
          <div>
            <div className="hr-k">Document type</div>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", letterSpacing: "0.02em" }}>INVOICE</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="hr-k">Invoice #</div>
            <div className="hr-num">{number ? pad4(number) : <span style={{ fontSize: "0.72rem", color: "#a3a7ae", fontFamily: "var(--font-body)", fontWeight: 600 }}>se asigna al aprobar</span>}</div>
            <div style={{ fontSize: "0.74rem", color: "#5b6068", marginTop: 2 }}>{info.closing}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, padding: "14px 0" }}>
          <div>
            <div className="hr-k">Contractor</div>
            <div style={{ fontWeight: 800 }}>{c.legalName.toUpperCase()}</div>
            <div>{c.address || empty}</div>
            <div>Tax ID / EIN / Foreign tax: {c.taxId || empty}</div>
            <div>Phone: {c.phone || empty}</div>
            <div>e-mail: {c.email || empty}</div>
          </div>
          <div>
            <div className="hr-k">Bill to / Client name</div>
            <div style={{ fontWeight: 800 }}>{BILL_TO.name}</div>
            <div>Tax ID / EIN: {BILL_TO.taxId}</div>
            <div>{BILL_TO.address}</div>
            <div>Phone: {BILL_TO.phone}</div>
            <div>email: {BILL_TO.email}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr style={{ background: "#f4f4ee" }}>
              <th className="hr-k" style={{ textAlign: "left", padding: "6px 8px" }}>Description</th>
              <th className="hr-k" style={{ padding: "6px 8px", width: 64 }}>Qty</th>
              <th className="hr-k" style={{ textAlign: "right", padding: "6px 8px", width: 130 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid #ececE6" }}>
              <td style={{ padding: "8px", verticalAlign: "top" }}>
                <div style={{ fontWeight: 700 }}>Professional services: {description.trim() || <span style={{ color: "#a3a7ae", fontWeight: 400 }}>(describe the work of the month)</span>}</div>
                <div style={{ color: "#6b6f76" }}>{info.period}</div>
                {hourly && <div style={{ color: "#6b6f76" }}>{t.hours} hours × {formatMoney(c.hourlyRate, c.currency)} / hour</div>}
              </td>
              <td style={{ textAlign: "center", padding: "8px", verticalAlign: "top" }}>1</td>
              <td style={{ textAlign: "right", padding: "8px", verticalAlign: "top" }}>{formatMoney(hourly ? t.base : c.baseAmount, c.currency)}</td>
            </tr>
            {c.payType === "variable" && (
              <tr style={{ borderBottom: "1px solid #ececE6" }}>
                <td style={{ padding: "8px" }}>Variable amount of the month</td>
                <td style={{ textAlign: "center", padding: "8px" }}>1</td>
                <td style={{ textAlign: "right", padding: "8px" }}>{cycle.variableAmount === null ? <span style={{ color: "#a3a7ae" }}>pending</span> : formatMoney(t.variable, c.currency)}</td>
              </tr>
            )}
            {c.payType !== "variable" && (
              <tr style={{ borderBottom: "1px solid #ececE6" }}>
                <td style={{ padding: "8px" }}>Performance bonus</td>
                <td style={{ textAlign: "center", padding: "8px" }}>1</td>
                <td style={{ textAlign: "right", padding: "8px" }}>{cycle.bonus === null ? <span style={{ color: "#a3a7ae" }}>pending</span> : formatMoney(t.bonus, c.currency)}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div style={{ marginLeft: "auto", maxWidth: 260, margin: "10px 0 12px auto" }}>
          {[["Sub-total", formatMoney(t.total, c.currency)], ["Tax", formatMoney(0, c.currency)]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: "#5b6068" }}><span>{k}</span><span>{v}</span></div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 0", borderTop: "2px solid #231f20", fontWeight: 800, fontSize: "0.95rem" }}>
            <span>TOTAL</span><span>{formatMoney(t.total, c.currency)}</span>
          </div>
        </div>

        <div><strong>Amount in Words:</strong> {t.total > 0 ? amountInWords(t.total, c.currency) : empty}</div>
        <div style={{ marginBottom: 8 }}><strong>TERMS — Due Date:</strong> {info.dueDate}</div>
        <p style={{ fontSize: "0.68rem", color: "#7b8088", margin: "0 0 12px", lineHeight: 1.45 }}>
          Note: I certify that the services described above were rendered in full and request payment in accordance with the agreed terms. This invoice reflects services provided as an independent contractor and does not imply any employment relationship with Xpress Shapewear FL LLC. The contractor assumes full responsibility for all applicable tax and legal obligations in their country of residence.
        </p>

        <div className="hr-k" style={{ marginBottom: 4 }}>Payment information</div>
        {c.paymentMethod === "adp" ? (
          <div style={{ marginBottom: 14 }}>Paid through ADP payroll.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "1px 14px", marginBottom: 14 }}>
            <div>Bank Name: {c.bank.bankName || empty}</div><div>Bank Country: {c.bank.bankCountry || empty}</div>
            <div>SWIFT / BIC: {c.bank.swift || empty}</div><div>Routing number: {c.bank.routing || empty}</div>
            <div>Account holder: {c.bank.holder || empty}</div><div>Account type: {c.bank.accountType}</div>
            <div>Account number: {c.bank.accountNumber ? maskAccount(c.bank.accountNumber) : empty}</div>
          </div>
        )}

        <div style={{ textAlign: "center" }}>
          <div style={{ height: 64, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            {cycle.signature ? <img src={cycle.signature} alt="Signature" style={{ maxHeight: 60 }} /> : <span style={{ color: "#a3a7ae", fontSize: "0.74rem" }}>(firma pendiente)</span>}
          </div>
          <div style={{ borderTop: "1px solid #231f20", width: 230, margin: "0 auto", paddingTop: 2, fontSize: "0.72rem" }}>Contractor Signature</div>
        </div>

        {hourly && (
          <div style={{ marginTop: 22, borderTop: "2px dashed #d9d9d0", paddingTop: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Page 2 — Hours report ({info.period})</div>
            <table style={{ fontSize: "0.76rem" }}>
              <thead><tr style={{ background: "#f4f4ee" }}><th className="hr-k" style={{ textAlign: "left", padding: "4px 8px" }}>Date</th><th className="hr-k" style={{ padding: "4px 8px", width: 56 }}>Hours</th><th className="hr-k" style={{ textAlign: "left", padding: "4px 8px" }}>Task</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (<tr key={i} style={{ borderBottom: "1px solid #ececE6" }}><td style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>{r.date}</td><td style={{ textAlign: "center" }}>{r.hours}</td><td style={{ padding: "4px 8px" }}>{r.note}</td></tr>))}
                {rows.length === 0 && <tr><td colSpan={3} style={{ padding: 8, color: "#a3a7ae" }}>No hours registered yet.</td></tr>}
                <tr><td style={{ padding: "6px 8px", fontWeight: 800 }}>Total</td><td style={{ textAlign: "center", fontWeight: 800 }}>{t.hours}</td><td /></tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
