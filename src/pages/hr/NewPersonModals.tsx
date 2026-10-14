import { useState } from "react";
import type { Contractor, Currency, PayType, PaymentMethod, Supervisor } from "./hrData";
import { CURRENCIES, HR_HEAD, amountInWords, formatMoney, overLimit } from "./hrData";

const COUNTRIES = ["Colombia", "USA", "Bolivia", "Argentina", "España", "México", "Otro"];

const EMPTY: Omit<Contractor, "id"> = {
  legalName: "", position: "", email: "", phone: "", address: "", country: "Colombia", region: "", taxId: "",
  payType: "fixed", hourlyRate: 0, baseAmount: 0, currency: "USD", bonusCap: 0, supervisorId: null,
  bank: { bankName: "", bankCountry: "", swift: "", routing: "", holder: "", accountType: "Savings", accountNumber: "" },
  paymentMethod: "wired", sendsInvoice: true, payDay: 30, monthlyCap: null, weeklyHoursCap: null, notes: "", issues: [],
};

const Q: React.CSSProperties = { fontWeight: 700, fontSize: "0.9rem", margin: "0.9rem 0 0.35rem" };
const Choice = ({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) => (
  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
    {options.map(([k, l]) => (
      <button key={k} type="button" className="hr-pill" aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>
    ))}
  </div>
);

// Guided questionnaire — only William can create people, so the HR view is the only place this opens from.
export function NewContractorModal({ supervisors, onSave, onClose }: { supervisors: Supervisor[]; onSave: (c: Omit<Contractor, "id">, alsoSupervisor: boolean) => void; onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [c, setC] = useState(EMPTY);
  const [err, setErr] = useState("");
  const [alsoSupervisor, setAlsoSupervisor] = useState(false);
  const [receivesBonus, setReceivesBonus] = useState<"yes" | "no">("no");
  const [capText, setCapText] = useState("");
  const [otherCountry, setOtherCountry] = useState("");
  const set = (patch: Partial<Omit<Contractor, "id">>) => setC(prev => ({ ...prev, ...patch }));
  const setBank = (patch: Partial<Contractor["bank"]>) => setC(prev => ({ ...prev, bank: { ...prev.bank, ...patch } }));
  const cur = CURRENCIES[c.currency];
  const usesBank = c.paymentMethod === "wired";
  const bigBase = c.payType !== "hourly" && overLimit(c.baseAmount, c.currency);

  const money = (label: string, value: number, onChange: (n: number) => void, hint?: string) => (
    <div className="form-group" style={{ maxWidth: 340 }}>
      <label>{label}</label>
      <input className="form-control" type="number" min="0" step="0.01" value={value || ""} onChange={e => onChange(Number(e.target.value))}
        style={overLimit(value, c.currency) ? { borderColor: "#dc2626" } : undefined} />
      {value > 0 && <div style={{ fontSize: "0.82rem", marginTop: 4, color: overLimit(value, c.currency) ? "#b91c1c" : "#334155" }}>
        {formatMoney(value, c.currency)} = <strong>{amountInWords(value, c.currency)}</strong>{overLimit(value, c.currency) && <> — supera el límite de {formatMoney(cur.limit, c.currency)}. ¿Un cero de más?</>}
      </div>}
      {hint && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{hint}</div>}
    </div>
  );
  const field = (label: string, value: string, onChange: (v: string) => void, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="form-group" style={{ flex: "1 1 220px" }}>
      <label>{label}</label>
      <input className="form-control" value={value} onChange={e => onChange(e.target.value)} {...props} />
    </div>
  );

  const next = () => {
    setErr("");
    if (step === 1) {
      if (!c.legalName.trim()) return setErr("Escribe el nombre legal.");
      if (c.country === "Otro" && !otherCountry.trim()) return setErr("Escribe el país.");
    }
    if (step === 2) {
      if (c.payType === "hourly" && c.hourlyRate <= 0) return setErr("Escribe la tarifa por hora.");
      if (c.payType === "fixed" && c.baseAmount <= 0) return setErr("Escribe el monto fijo mensual.");
      if (bigBase) return setErr(`${formatMoney(c.baseAmount, c.currency)} supera el límite de ${formatMoney(cur.limit, c.currency)}. ¿Agregaste un cero de más?`);
      if (receivesBonus === "yes") {
        const cap = Number(capText);
        if (capText.trim() === "" || isNaN(cap) || cap <= 0) return setErr("Escribe el máximo de bono por ciclo.");
        if (overLimit(cap, c.currency)) return setErr(`Ese máximo de bono supera el límite de ${formatMoney(cur.limit, c.currency)}. ¿Un cero de más?`);
      }
      if (c.monthlyCap !== null && c.monthlyCap > 0 && overLimit(c.monthlyCap, c.currency)) return setErr("El máximo mensual supera el límite permitido.");
    }
    setStep(step + 1);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (c.sendsInvoice && (!c.email.trim() || !c.taxId.trim())) { setErr("Para quien envía cuenta de cobro, el correo personal y el Tax ID son obligatorios."); return; }
    const cap = receivesBonus === "yes" && c.payType !== "variable" ? Number(capText) : 0;
    const country = c.country === "Otro" ? otherCountry.trim() : c.country;
    onSave({ ...c, country, bonusCap: cap, legalName: c.legalName.trim(), email: c.email.trim(), bank: { ...c.bank, holder: c.bank.holder || c.legalName.trim() } }, alsoSupervisor);
  };

  return (
    <div className="modal-overlay active" style={{ overflowY: "auto" }}>
      <form className="modal" onSubmit={submit} style={{ maxWidth: 720, width: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div className="modal-header"><h3>Nueva persona — paso {step} de 3</h3></div>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          {[1, 2, 3].map(n => <div key={n} style={{ flex: 1, height: 4, borderRadius: 999, background: n <= step ? "#0f766e" : "#e2e8f0" }} />)}
        </div>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 4 }}>Solo {HR_HEAD} puede crear cuentas. {step === 1 ? "¿Quién es y dónde está?" : step === 2 ? "¿Cómo se le paga?" : "Datos fijos que salen en su cuenta de cobro."}</p>

        {step === 1 && (<>
          <div className="form-row">
            {field("Nombre legal", c.legalName, v => set({ legalName: v }), { required: true, autoFocus: true })}
            {field("Área o departamento", c.position, v => set({ position: v }), { placeholder: "Ej. TikTok - Moderadora" })}
          </div>
          <div style={Q}>¿Dónde está ubicado?</div>
          <Choice options={COUNTRIES.map(x => [x, x] as [string, string])} value={c.country} onChange={v => set({ country: v })} />
          {c.country === "USA" && <div className="form-group" style={{ maxWidth: 280, marginTop: 8 }}><label>Estado o ciudad</label><input className="form-control" value={c.region} placeholder="TX, CA, Miami…" onChange={e => set({ region: e.target.value })} /></div>}
          {c.country === "Otro" && <div className="form-group" style={{ maxWidth: 280, marginTop: 8 }}><label>País</label><input className="form-control" value={otherCountry} onChange={e => setOtherCountry(e.target.value)} /></div>}
          <div style={Q}>¿Quién es su supervisor?</div>
          <select className="form-control" style={{ maxWidth: 380 }} value={c.supervisorId ?? ""} onChange={e => set({ supervisorId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Sin supervisor (aprueba {HR_HEAD})</option>
            {supervisors.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", margin: "0.9rem 0 0", cursor: "pointer" }}>
            <input type="checkbox" checked={alsoSupervisor} onChange={e => setAlsoSupervisor(e.target.checked)} />
            <span><strong>También es supervisor</strong> — aprueba los pagos de otras personas y además llena el suyo</span>
          </label>
        </>)}

        {step === 2 && (<>
          <div style={Q}>¿Cómo se le paga?</div>
          <Choice options={[["wired", "Contratista — transferencia internacional"], ["adp", "ADP (nómina local EE. UU.)"]]} value={c.paymentMethod}
            onChange={v => set({ paymentMethod: v as PaymentMethod, sendsInvoice: v === "wired" })} />
          {c.paymentMethod === "adp" && (<>
            <div style={Q}>¿Esta persona envía cuenta de cobro cada mes?</div>
            <Choice options={[["no", "No — se paga por ADP"], ["yes", "Sí, también envía cuenta de cobro"]]} value={c.sendsInvoice ? "yes" : "no"} onChange={v => set({ sendsInvoice: v === "yes" })} />
          </>)}
          <div style={Q}>Moneda</div>
          <Choice options={(Object.keys(CURRENCIES) as Currency[]).map(k => [k, CURRENCIES[k].label] as [string, string])} value={c.currency} onChange={v => set({ currency: v as Currency })} />
          <div style={Q}>¿Cómo se calcula su pago?</div>
          <Choice options={[["fixed", "Monto fijo mensual"], ["hourly", "Por horas"], ["variable", "Variable (comisiones / monto del mes)"]]} value={c.payType} onChange={v => set({ payType: v as PayType })} />
          <div style={{ marginTop: 10 }}>
            {c.payType === "fixed" && money(`Monto fijo mensual (${c.currency})`, c.baseAmount, n => set({ baseAmount: n }))}
            {c.payType === "hourly" && (<>
              {money(`Tarifa por hora (${c.currency})`, c.hourlyRate, n => set({ hourlyRate: n }))}
              <div className="form-group" style={{ maxWidth: 340 }}><label>Máximo de horas por semana (opcional)</label>
                <input className="form-control" type="number" min="0" value={c.weeklyHoursCap ?? ""} onChange={e => set({ weeklyHoursCap: e.target.value ? Number(e.target.value) : null })} /></div>
            </>)}
            {c.payType === "variable" && money(`Base garantizada al mes (${c.currency}) — puede ser 0`, c.baseAmount, n => set({ baseAmount: n }), "Cada mes el supervisor suma el monto variable (comisiones, fletes…).")}
          </div>
          {c.payType !== "variable" && (<>
            <div style={Q}>¿Recibe bonos?</div>
            <Choice options={[["no", "No"], ["yes", "Sí"]]} value={receivesBonus} onChange={v => setReceivesBonus(v as "yes" | "no")} />
            {receivesBonus === "yes" && <div style={{ marginTop: 8 }}>{money(`Máximo de bono por ciclo (${c.currency})`, Number(capText) || 0, n => setCapText(String(n || "")), "El supervisor no podrá dar un bono mayor.")}</div>}
          </>)}
          <div className="form-row" style={{ marginTop: 10 }}>
            <div className="form-group"><label>Máximo total al mes (opcional)</label>
              <input className="form-control" type="number" min="0" value={c.monthlyCap ?? ""} placeholder="Ej. 740" onChange={e => set({ monthlyCap: e.target.value ? Number(e.target.value) : null })} /></div>
            <div className="form-group"><label>Día de pago</label>
              <input className="form-control" type="number" min="1" max="31" value={c.payDay} onChange={e => set({ payDay: Number(e.target.value) || 30 })} /></div>
          </div>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: 0 }}>Límite del sistema por persona al mes en {c.currency}: {formatMoney(cur.limit, c.currency)}.</p>
        </>)}

        {step === 3 && (<>
          <div className="form-row">
            {field("Correo personal", c.email, v => set({ email: v }), { type: "email" })}
            {field("Tax ID / EIN / Foreign tax", c.taxId, v => set({ taxId: v }), { placeholder: "CC 12345678" })}
          </div>
          <div className="form-row">
            {field("Teléfono", c.phone, v => set({ phone: v }))}
            {field("Dirección", c.address, v => set({ address: v }))}
          </div>
          {usesBank ? (<>
            <h4 style={{ margin: "1rem 0 0.5rem" }}>Información de pago <span style={{ fontWeight: 400, fontSize: "0.8rem", color: "var(--text-muted)" }}>(en la versión real se guarda cifrada)</span></h4>
            <div className="form-row">{field("Banco", c.bank.bankName, v => setBank({ bankName: v }))}{field("País del banco", c.bank.bankCountry, v => setBank({ bankCountry: v }))}</div>
            <div className="form-row">{field("SWIFT / BIC", c.bank.swift, v => setBank({ swift: v }))}{field("Routing number", c.bank.routing, v => setBank({ routing: v }))}</div>
            <div className="form-row">
              {field("Titular de la cuenta", c.bank.holder, v => setBank({ holder: v }), { placeholder: c.legalName || "Igual al nombre legal" })}
              <div className="form-group" style={{ flex: "1 1 200px" }}><label>Tipo de cuenta</label>
                <select className="form-control" value={c.bank.accountType} onChange={e => setBank({ accountType: e.target.value })}><option>Savings</option><option>Checking</option></select></div>
              {field("Número de cuenta", c.bank.accountNumber, v => setBank({ accountNumber: v }))}
            </div>
          </>) : <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Esta persona cobra por ADP: no se piden datos bancarios aquí.</p>}
        </>)}

        {err && <p className="error-msg">{err}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={step === 1 ? onClose : () => { setErr(""); setStep(step - 1); }}>{step === 1 ? "Cancelar" : "← Atrás"}</button>
          {step < 3 ? <button type="button" className="btn btn-primary" onClick={next}>Siguiente →</button> : <button type="submit" className="btn btn-primary">Crear persona</button>}
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
