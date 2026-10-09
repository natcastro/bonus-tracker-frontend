import { useState } from "react";
import type { Contractor, Currency, PayType, Supervisor } from "./hrData";
import { CURRENCIES, HR_HEAD, amountInWords, formatMoney, overLimit } from "./hrData";

const EMPTY: Omit<Contractor, "id"> = {
  legalName: "", position: "", email: "", phone: "", address: "", country: "Colombia", taxId: "",
  payType: "hourly", hourlyRate: 0, baseAmount: 0, currency: "USD", bonusCap: 0, supervisorId: null,
  bank: { bankName: "", bankCountry: "", swift: "", routing: "", holder: "", accountType: "Savings", accountNumber: "" },
};

// Only William can create people — the HR view is the only place these modals are opened from.
export function NewContractorModal({ supervisors, onSave, onClose }: { supervisors: Supervisor[]; onSave: (c: Omit<Contractor, "id">, alsoSupervisor: boolean) => void; onClose: () => void }) {
  const [c, setC] = useState(EMPTY);
  const [err, setErr] = useState("");
  const [capText, setCapText] = useState("");
  const [alsoSupervisor, setAlsoSupervisor] = useState(false);
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
    const cap = Number(capText);
    if (capText.trim() === "" || isNaN(cap) || cap < 0) { setErr("Escribe el máximo de bono por ciclo. Si esta persona no recibe bonos, escribe 0."); return; }
    if (overLimit(cap, c.currency)) { setErr(`Un máximo de bono de ${formatMoney(cap, c.currency)} supera el límite de ${formatMoney(cur.limit, c.currency)}. ¿Agregaste un cero de más?`); return; }
    onSave({ ...c, bonusCap: cap, legalName: c.legalName.trim(), email: c.email.trim(), bank: { ...c.bank, holder: c.bank.holder || c.legalName.trim() } }, alsoSupervisor);
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

        <h4 style={{ margin: "1rem 0 0.5rem" }}>¿Cómo se le paga? <span style={{ fontWeight: 400, fontSize: "0.8rem", color: "var(--text-muted)" }}>(datos fijos que salen en todas sus cuentas de cobro)</span></h4>
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
        <div className="form-group" style={{ maxWidth: 320 }}>
          <label>Máximo de bono por ciclo ({c.currency})</label>
          <input className="form-control" type="number" min="0" step="0.01" value={capText} placeholder="0 si no recibe bonos" required
            style={Number(capText) > 0 && overLimit(Number(capText), c.currency) ? { borderColor: "#dc2626" } : undefined} onChange={e => setCapText(e.target.value)} />
        </div>
        {Number(capText) > 0 && (
          <p style={{ fontSize: "0.85rem", margin: "0 0 0.5rem", color: overLimit(Number(capText), c.currency) ? "#b91c1c" : "#334155" }}>
            {formatMoney(Number(capText), c.currency)} = <strong>{amountInWords(Number(capText), c.currency)}</strong> — el supervisor no podrá dar un bono mayor.
          </p>
        )}
        <div className="form-group">
          <label>Supervisor</label>
          <select className="form-control" value={c.supervisorId ?? ""} onChange={e => set({ supervisorId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Sin supervisor (aprueba {HR_HEAD})</option>
            {supervisors.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} — {s.position}</option>)}
          </select>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", margin: "0.5rem 0", cursor: "pointer" }}>
          <input type="checkbox" checked={alsoSupervisor} onChange={e => setAlsoSupervisor(e.target.checked)} />
          <span><strong>También es supervisor</strong> — aprueba los pagos de otras personas y además llena el suyo</span>
        </label>

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

export function NewSupervisorModal({ contractors, supervisors, onSave, onClose }: { contractors: Contractor[]; supervisors: Supervisor[]; onSave: (s: Omit<Supervisor, "id">) => void; onClose: () => void }) {
  const [s, setS] = useState<Omit<Supervisor, "id">>({ firstName: "", lastName: "", position: "", contractorId: null });
  const linkable = contractors.filter(c => !supervisors.some(x => x.contractorId === c.id));
  return (
    <div className="modal-overlay active">
      <form className="modal" onSubmit={e => { e.preventDefault(); if (s.firstName.trim() && s.lastName.trim()) onSave(s); }}>
        <div className="modal-header"><h3>Nuevo supervisor</h3></div>
        <div className="form-group"><label>Nombre</label><input className="form-control" required value={s.firstName} onChange={e => setS({ ...s, firstName: e.target.value })} /></div>
        <div className="form-group"><label>Apellido</label><input className="form-control" required value={s.lastName} onChange={e => setS({ ...s, lastName: e.target.value })} /></div>
        <div className="form-group"><label>Cargo</label><input className="form-control" value={s.position} onChange={e => setS({ ...s, position: e.target.value })} /></div>
        <div className="form-group">
          <label>¿También cobra como contratista? (opcional)</label>
          <select className="form-control" value={s.contractorId ?? ""} onChange={e => setS({ ...s, contractorId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">No, solo supervisa</option>
            {linkable.map(c => <option key={c.id} value={c.id}>Sí — es {c.legalName}</option>)}
          </select>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Primero crea a la persona como contratista; aquí solo la vinculas. (O marca "También es supervisor" al crear al contratista.)</span>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary">Crear supervisor</button>
        </div>
      </form>
    </div>
  );
}
