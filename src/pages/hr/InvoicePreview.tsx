import type { Contractor, Cycle } from "./hrData";
import { BILL_TO, amountInWords, cycleDescription, cycleTotals, formatMoney, maskAccount, monthInfo, pad4 } from "./hrData";

const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" };

// On-screen version of HR's invoice template (the real version will be a PDF with the same layout).
export default function InvoicePreview({ c, cycle, number }: { c: Contractor; cycle: Cycle; number: number | null }) {
  const info = monthInfo(cycle.year, cycle.month);
  const t = cycleTotals(c, cycle);
  const hourly = c.payType === "hourly";
  const rows = cycle.days.filter(r => Number(r.hours) > 0);
  const description = cycleDescription(c, cycle);
  const inv = { year: cycle.year, signature: cycle.signature };

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "1.5rem", fontSize: 13, color: "#0f172a", lineHeight: 1.5 }}>
      <div style={{ ...label, textAlign: "center", marginBottom: 14 }}>Document Type: Invoice</div>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <div><span style={label}>Invoice #</span><div style={{ fontSize: 20, fontWeight: 800 }}>{number ? pad4(number) : <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600 }}>(se asigna al aprobar)</span>}</div></div>
        <div style={{ textAlign: "right" }}><span style={label}>Date</span><div style={{ fontWeight: 700 }}>{info.closing}</div></div>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ flex: "1 1 240px" }}>
          <div style={label}>Contractor</div>
          <div style={{ fontWeight: 700 }}>{c.legalName.toUpperCase()}</div>
          <div>{c.address}</div>
          <div>Tax ID / EIN / Foreign tax: {c.taxId}</div>
          <div>Phone: {c.phone}</div>
          <div>e-mail: {c.email}</div>
        </div>
        <div style={{ flex: "1 1 240px" }}>
          <div style={label}>Bill to / Client name</div>
          <div style={{ fontWeight: 700 }}>{BILL_TO.name}</div>
          <div>Tax ID / EIN: {BILL_TO.taxId}</div>
          <div>{BILL_TO.address}</div>
          <div>Phone: {BILL_TO.phone}</div>
          <div>email: {BILL_TO.email}</div>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
        <thead>
          <tr style={{ background: "#f1f5f9" }}>
            <th style={{ textAlign: "left", padding: "6px 8px" }}>Description</th>
            <th style={{ padding: "6px 8px", width: 70 }}>Quantity</th>
            <th style={{ textAlign: "right", padding: "6px 8px", width: 150 }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
            <td style={{ padding: "8px", verticalAlign: "top" }}>
              <div style={{ fontWeight: 600 }}>Professional services: {description.trim() || <span style={{ color: "#94a3b8" }}>(describe the work of the month)</span>}</div>
              <div style={{ color: "#64748b" }}>{info.period}</div>
              {hourly && <div style={{ color: "#64748b" }}>{t.hours} hours × {formatMoney(c.hourlyRate, c.currency)} / hour</div>}
            </td>
            <td style={{ textAlign: "center", padding: "8px", verticalAlign: "top" }}>1</td>
            <td style={{ textAlign: "right", padding: "8px", verticalAlign: "top" }}>{formatMoney(t.base, c.currency)}</td>
          </tr>
          <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
            <td style={{ padding: "8px" }}>Performance bonus</td>
            <td style={{ textAlign: "center", padding: "8px" }}>1</td>
            <td style={{ textAlign: "right", padding: "8px" }}>{cycle.bonus === null ? <span style={{ color: "#94a3b8" }}>pending</span> : formatMoney(t.bonus, c.currency)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginLeft: "auto", maxWidth: 280, marginBottom: 12 }}>
        {[["Sub-total", formatMoney(t.total, c.currency)], ["Tax", formatMoney(0, c.currency)]].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><span>{k}</span><span>{v}</span></div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderTop: "2px solid #0f172a", fontWeight: 800 }}>
          <span>TOTAL</span><span>{formatMoney(t.total, c.currency)}</span>
        </div>
      </div>

      <div><span style={{ fontWeight: 700 }}>Amount in Words:</span> {t.total > 0 ? amountInWords(t.total, c.currency) : "—"}</div>
      <div style={{ marginBottom: 10 }}><span style={{ fontWeight: 700 }}>TERMS — Due Date:</span> {info.dueDate}</div>
      <p style={{ fontSize: 11.5, color: "#64748b", margin: "0 0 12px" }}>
        Note: I certify that the services described above were rendered in full and request payment in accordance with the agreed terms. This invoice reflects services provided as an independent contractor and does not imply any employment relationship with Xpress Shapewear FL LLC. The contractor assumes full responsibility for all applicable tax and legal obligations in their country of residence.
      </p>

      <div style={{ ...label, marginBottom: 4 }}>Payment information</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "2px 16px", marginBottom: 18 }}>
        <div>Bank Name: {c.bank.bankName}</div><div>Bank Country: {c.bank.bankCountry}</div>
        <div>SWIFT / BIC: {c.bank.swift}</div><div>Routing number: {c.bank.routing}</div>
        <div>Account holder: {c.bank.holder}</div><div>Account type: {c.bank.accountType}</div>
        <div>Account number: {maskAccount(c.bank.accountNumber)}</div>
      </div>

      <div style={{ textAlign: "center" }}>
        <div style={{ height: 70, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          {inv.signature ? <img src={inv.signature} alt="Signature" style={{ maxHeight: 64 }} /> : <span style={{ color: "#94a3b8", fontSize: 12 }}>(firma pendiente)</span>}
        </div>
        <div style={{ borderTop: "1px solid #0f172a", width: 260, margin: "0 auto", paddingTop: 2, fontSize: 12 }}>Contractor Signature</div>
      </div>

      {hourly && (
        <div style={{ marginTop: 24, borderTop: "2px dashed #cbd5e1", paddingTop: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Page 2 — Hours report ({info.name} {inv.year})</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead><tr style={{ background: "#f1f5f9" }}><th style={{ textAlign: "left", padding: "4px 8px" }}>Date</th><th style={{ padding: "4px 8px", width: 70 }}>Hours</th><th style={{ textAlign: "left", padding: "4px 8px" }}>Task</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (<tr key={i} style={{ borderBottom: "1px solid #e2e8f0" }}><td style={{ padding: "4px 8px" }}>{r.date}</td><td style={{ textAlign: "center" }}>{r.hours}</td><td style={{ padding: "4px 8px" }}>{r.note}</td></tr>))}
              {rows.length === 0 && <tr><td colSpan={3} style={{ padding: 8, color: "#94a3b8" }}>No hours registered yet.</td></tr>}
              <tr><td style={{ padding: "6px 8px", fontWeight: 800 }}>Total</td><td style={{ textAlign: "center", fontWeight: 800 }}>{t.hours}</td><td /></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
