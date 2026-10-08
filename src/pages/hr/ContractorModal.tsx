import { useState } from "react";
import type { Contractor, Currency, PayType } from "./hrData";
import { SUPERVISORS, HR_HEAD } from "./hrData";

const EMPTY: Omit<Contractor, "id"> = {
  legalName: "", email: "", phone: "", address: "", country: "Colombia", taxId: "",
  payType: "hourly", hourlyRate: 0, baseAmount: 0, currency: "USD", supervisor: null,
  bank: { bankName: "", bankCountry: "", swift: "", routing: "", holder: "", accountType: "Savings", accountNumber: "" },
};

export default function ContractorModal({ onSave, onClose }: { onSave: (c: Omit<Contractor, "id">) => void; onClose: () => void }) {
  const [c, setC] = useState(EMPTY);
  const [err, setErr] = useState("");
  const set = (patch: Partial<Omit<Contractor, "id">>) => setC(prev => ({ ...prev, ...patch }));
  const setBank = (patch: Partial<Contractor["bank"]>) => setC(prev => ({ ...prev, bank: { ...prev.bank, ...patch } }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!c.legalName.trim() || !c.email.trim() || !c.taxId.trim()) { setErr("Nombre legal, correo personal y Tax ID son obligatorios."); return; }
    if (c.payType === "hourly" && c.hourlyRate <= 0) { setErr("Escribe la tarifa por hora."); return; }
    onSave({ ...c, legalName: c.legalName.trim(), email: c.email.trim(), bank: { ...c.bank, holder: c.bank.holder || c.legalName.trim() } });
  };

  const field = (labelText: string, value: string, onChange: (v: string) => void, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="form-group" style={{ flex: "1 1 200px" }}>
      <label>{labelText}</label>
      <input className="form-control" value={value} onChange={e => onChange(e.target.value)} {...props} />
    </div>
  );

  return (
    <div className="modal-overlay active" style={{ overflowY: "auto" }}>
      <form className="modal" onSubmit={submit} style={{ maxWidth: 720, width: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div className="modal-header"><h3>Nuevo contratista</h3></div>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 0 }}>Prueba: usa datos inventados. Nada se guarda al cerrar la página.</p>

        <h4 style={{ margin: "0.5rem 0" }}>Datos personales</h4>
        <div className="form-row">
          {field("Nombre legal", c.legalName, v => set({ legalName: v }), { required: true })}
          {field("Correo personal", c.email, v => set({ email: v }), { type: "email", required: true })}
        </div>
        <div className="form-row">
          {field("Tax ID / EIN / Foreign tax", c.taxId, v => set({ taxId: v }), { required: true, placeholder: "CC 12345678" })}
          {field("Teléfono", c.phone, v => set({ phone: v }))}
        </div>
        <div className="form-row">
          {field("Dirección", c.address, v => set({ address: v }))}
          {field("País de residencia", c.country, v => set({ country: v }))}
        </div>

        <h4 style={{ margin: "1rem 0 0.5rem" }}>Contrato</h4>
        <div className="form-row">
          <div className="form-group">
            <label>Tipo de pago</label>
            <select className="form-control" value={c.payType} onChange={e => set({ payType: e.target.value as PayType })}>
              <option value="hourly">Por horas</option><option value="fixed">Monto base fijo</option>
            </select>
          </div>
          <div className="form-group">
            <label>Moneda</label>
            <select className="form-control" value={c.currency} onChange={e => set({ currency: e.target.value as Currency })}>
              <option value="USD">USD (dólares)</option><option value="COP">COP (pesos colombianos)</option>
            </select>
          </div>
          {c.payType === "hourly"
            ? <div className="form-group"><label>Tarifa por hora ({c.currency})</label><input className="form-control" type="number" min="0" step="0.01" value={c.hourlyRate || ""} onChange={e => set({ hourlyRate: Number(e.target.value) })} /></div>
            : <div className="form-group"><label>Monto base mensual ({c.currency})</label><input className="form-control" type="number" min="0" step="0.01" value={c.baseAmount || ""} onChange={e => set({ baseAmount: Number(e.target.value) })} /></div>}
          <div className="form-group">
            <label>Supervisor</label>
            <select className="form-control" value={c.supervisor ?? ""} onChange={e => set({ supervisor: e.target.value || null })}>
              <option value="">Sin supervisor (aprueba {HR_HEAD})</option>
              {SUPERVISORS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
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
            <select className="form-control" value={c.bank.accountType} onChange={e => setBank({ accountType: e.target.value })}>
              <option>Savings</option><option>Checking</option>
            </select>
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
