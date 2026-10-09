import { useState } from "react";
import type { Contractor, Currency, PayType, Supervisor } from "./hrData";
import { CURRENCIES, HR_HEAD, amountInWords, formatMoney, overLimit } from "./hrData";

const EMPTY: Omit<Contractor, "id"> = {
  legalName: "", position: "", email: "", phone: "", address: "", country: "Colombia", taxId: "",
  payType: "hourly", hourlyRate: 0, baseAmount: 0, currency: "USD", supervisorId: null,
  bank: { bankName: "", bankCountry: "", swift: "", routing: "", holder: "", accountType: "Savings", accountNumber: "" },
};

// Only William can create people — the HR view is the only place these modals are opened from.
export function NewContractorModal({ supervisors, onSave, onClose }: { supervisors: Supervisor[]; onSave: (c: Omit<Contractor, "id">) => void; onClose: () => void }) {
  const [c, setC] = useState(EMPTY);
  const [err, setErr] = useState("");
  const set = (patch: Partial<Omit<Contractor, "id">>) => setC(prev => ({ ...prev, ...patch }));
  const setBank = (patch: Partial<Contractor["bank"]>) => setC(prev => ({ ...prev, bank: { ...prev.bank, ...patch } }));
  const cur = CURRENCIES[c.currency];
  const amount = c.payType === "fixed" ? c.baseAmount : c.hourlyRate;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!c.legalName.trim() || !c.email.trim() || !c.taxId.trim()) { setErr("Nombre legal, correo personal y Tax ID son obligatorios."); return; }
    if (amount <= 0) { setErr(c.payType === "fixed" ? "Escribe el monto fijo." : "Escribe la tarifa por hora."); return; }
    if (c.payType === "fixed" && overLimit(c.baseAmount, c.currency)) {
      setErr(`${formatMoney(c.baseAmount, c.currency)} supera el límite de ${formatMoney(cur.limit, c.currency)}. ¿Agregaste un cero de más?`); return;
    }
    onSave({ ...c, legalName: c.legalName.trim(), email: c.email.trim(), bank: { ...c.bank, holder: c.bank.holder || c.legalName.trim() } });
  };

  const field = (label: string, value: string, onChange: (v: string) => void, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="form-group" style={{ flex: "1 1 200px" }}>
      <label>{label}</label>
      <input className="form-control" value={value} onChange={e => onChange(e.target.value)} {...props} />
    </div>
  );
  const tooBig = c.payType === "fixed" && overLimit(c.baseAmount, c.currency);

  return (
    <div className="modal-overlay active" style={{ overflowY: "auto" }}>
      <form className="modal" onSubmit={submit} style={{ maxWidth: 720, width: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div className="modal-header"><h3>Nuevo contratista</h3></div>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 0 }}>Solo {HR_HEAD} puede crear cuentas. Prueba: usa datos inventados; nada se guarda.</p>

        <h4 style={{ margin: "0.5rem 0" }}>Datos personales</h4>
        <div className="form-row">
          {field("Nombre legal", c.legalName, v => set({ legalName: v }), { required: true })}
          {field("Cargo", c.position, v => set({ position: v }))}
        </div>
        <div className="form-row">
          {field("Correo personal", c.email, v => set({ email: v }), { type: "email", required: true })}
          {field("Tax ID / EIN / Foreign tax", c.taxId, v => set({ taxId: v }), { required: true, placeholder: "CC 12345678" })}
        </div>
        <div className="form-row">
          {field("Teléfono", c.phone, v => set({ phone: v }))}
          {field("Dirección", c.address, v => set({ address: v }))}
          {field("País de residencia", c.country, v => set({ country: v }))}
        </div>

        <h4 style={{ margin: "1rem 0 0.5rem" }}>¿Cómo se le paga?</h4>
        <div className="form-row">
          <div className="form-group">
            <label>Tipo de pago</label>
            <select className="form-control" value={c.payType} onChange={e => set({ payType: e.target.value as PayType })}>
              <option value="hourly">Por hora</option><option value="fixed">Monto fijo mensual</option>
            </select>
          </div>
          <div className="form-group">
            <label>Moneda</label>
            <select className="form-control" value={c.currency} onChange={e => set({ currency: e.target.value as Currency })}>
              {(Object.keys(CURRENCIES) as Currency[]).map(k => <option key={k} value={k}>{CURRENCIES[k].label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: "1 1 220px" }}>
            <label>{c.payType === "hourly" ? `Tarifa por hora (${c.currency})` : `Monto fijo mensual (${c.currency})`}</label>
            <input className="form-control" type="number" min="0" step="0.01" value={amount || ""} style={tooBig ? { borderColor: "#dc2626" } : undefined}
              onChange={e => set(c.payType === "hourly" ? { hourlyRate: Number(e.target.value) } : { baseAmount: Number(e.target.value) })} />
          </div>
        </div>
        {amount > 0 && (
          <p style={{ fontSize: "0.85rem", margin: "0 0 0.5rem", color: tooBig ? "#b91c1c" : "#334155" }}>
            {formatMoney(amount, c.currency)} = <strong>{amountInWords(amount, c.currency)}</strong>{c.payType === "hourly" ? " por hora" : ""}
            {tooBig && <> — supera el límite de {formatMoney(cur.limit, c.currency)}. ¿Un cero de más?</>}
          </p>
        )}
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0 0 0.5rem" }}>Límite mensual por persona en {c.currency}: {formatMoney(cur.limit, c.currency)} (incluye el bono).</p>
        <div className="form-group">
          <label>Supervisor</label>
          <select className="form-control" value={c.supervisorId ?? ""} onChange={e => set({ supervisorId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Sin supervisor (aprueba {HR_HEAD})</option>
            {supervisors.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} — {s.position}</option>)}
          </select>
        </div>

        <h4 style={{ margin: "1rem 0 0.5rem" }}>Información de pago <span style={{ fontWeight: 400, fontSize: "0.8rem", color: "var(--text-muted)" }}>(en la versión real se guarda cifrada)</span></h4>
        <div className="form-row">
          {field("Banco", c.bank.bankName, v => setBank({ bankName: v }))}
          {field("País del banco", c.bank.bankCountry, v => setBank({ bankCountry: v }))}
        </div>
        <div className="form-row">
          {field("SWIFT / BIC", c.bank.swift, v => setBank({ swift: v }))}
          {field("Routing number", c.bank.routing, v => setBank({ routing: v }))}
        </div>
        <div className="form-row">
          {field("Titular de la cuenta", c.bank.holder, v => setBank({ holder: v }), { placeholder: c.legalName || "Igual al nombre legal" })}
          <div className="form-group" style={{ flex: "1 1 200px" }}>
            <label>Tipo de cuenta</label>
            <select className="form-control" value={c.bank.accountType} onChange={e => setBank({ accountType: e.target.value })}><option>Savings</option><option>Checking</option></select>
          </div>
          {field("Número de cuenta", c.bank.accountNumber, v => setBank({ accountNumber: v }))}
        </div>

        {err && <p className="error-msg">{err}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary">Crear contratista</button>
        </div>
      </form>
    </div>
  );
}

export function NewSupervisorModal({ onSave, onClose }: { onSave: (s: Omit<Supervisor, "id">) => void; onClose: () => void }) {
  const [s, setS] = useState({ firstName: "", lastName: "", position: "" });
  return (
    <div className="modal-overlay active">
      <form className="modal" onSubmit={e => { e.preventDefault(); if (s.firstName.trim() && s.lastName.trim()) onSave(s); }}>
        <div className="modal-header"><h3>Nuevo supervisor</h3></div>
        <div className="form-group"><label>Nombre</label><input className="form-control" required value={s.firstName} onChange={e => setS({ ...s, firstName: e.target.value })} /></div>
        <div className="form-group"><label>Apellido</label><input className="form-control" required value={s.lastName} onChange={e => setS({ ...s, lastName: e.target.value })} /></div>
        <div className="form-group"><label>Cargo</label><input className="form-control" value={s.position} onChange={e => setS({ ...s, position: e.target.value })} /></div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary">Crear supervisor</button>
        </div>
      </form>
    </div>
  );
}
