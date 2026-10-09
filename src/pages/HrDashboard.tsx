import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { UsersIcon } from "../components/icons";
import type { Persona } from "./hr/hrData";
import { ACCOUNTANT, HR_HEAD } from "./hr/hrData";
import { useHrStore } from "./hr/hrStore";
import { COLOR, Banner } from "./hr/ui";
import EmployeeView from "./hr/EmployeeView";
import SupervisorView from "./hr/SupervisorView";
import HrHeadView from "./hr/HrHeadView";
import AccountingView from "./hr/AccountingView";

// PROTOTYPE — fake data, everything lives in memory and disappears on refresh. The real version will
// store contractors/cycles server-side with encrypted bank/tax data (see the HR plan).
export default function HrDashboard() {
  const navigate = useNavigate();
  const store = useHrStore();
  const [persona, setPersona] = useState<Persona | null>(null);

  const label = (p: Persona): string => {
    if (p.kind === "hr") return `${HR_HEAD} — HR`;
    if (p.kind === "accounting") return `${ACCOUNTANT} — Contabilidad`;
    if (p.kind === "supervisor") { const s = store.supervisors.find(x => x.id === p.id)!; return `${s.firstName} ${s.lastName} — Supervisor${s.contractorId ? " y contratista" : ""}`; }
    return `${store.contractor(p.id).legalName} — Empleado`;
  };

  const card = (p: Persona, title: string, sub: string, key: string) => (
    <button key={key} onClick={() => setPersona(p)} style={{
      textAlign: "left", fontFamily: "inherit", cursor: "pointer", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
      padding: "0.9rem 1.1rem", minWidth: 220, flex: "1 1 220px", boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    }}>
      <div style={{ fontWeight: 800, color: "#0f172a" }}>{title}</div>
      <div style={{ fontSize: 12.5, color: "#64748b" }}>{sub}</div>
    </button>
  );
  const group = (title: string, cards: React.ReactNode) => (
    <div style={{ marginBottom: "1.25rem" }}>
      <p style={{ fontWeight: 700, fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>{title}</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{cards}</div>
    </div>
  );

  return (
    <div>
      <nav className="top-nav">
        <div className="logo">FTC Hub — <span style={{ color: COLOR }}>HR</span></div>
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{persona ? `Viendo como: ${label(persona)}` : ""}</div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {persona && <button className="btn btn-secondary btn-sm" onClick={() => setPersona(null)}>Cambiar de usuario</button>}
          <button className="btn btn-secondary btn-sm" onClick={() => navigate("/")}>← Volver al Hub</button>
          <button className="btn btn-secondary btn-sm" onClick={() => { sessionStorage.clear(); navigate("/"); }}>Logout</button>
        </div>
      </nav>

      <main className="content-area">
        <Banner tone="warn">🧪 Página de prueba — todos los datos son falsos y no se guardan. Al recargar vuelve al inicio.</Banner>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", marginBottom: "1rem", flexWrap: "wrap" }}>
          <span>Fecha simulada:</span>
          <select className="form-control" style={{ width: "auto" }} value={store.simDay} onChange={e => store.setSimDay(e.target.value as "real" | "upload" | "approve")}>
            <option value="real">Hoy (real)</option>
            <option value="upload">Día 24 — subir las cuentas de cobro</option>
            <option value="approve">Día 25 — William aprueba</option>
          </select>
          <span style={{ color: "var(--text-muted)" }}>Ciclo actual: {store.info.rangeEs}. Sirve para ver los recordatorios y habilitar todos los días.</span>
        </div>
        {store.notice && (
          <div style={{ background: "#dcfce7", color: "#166534", borderRadius: 8, padding: "0.6rem 1rem", fontSize: "0.85rem", marginBottom: "1rem", display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span>{store.notice}</span><button onClick={() => store.setNotice("")} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>×</button>
          </div>
        )}

        {!persona && (
          <section>
            <header className="section-header"><h2 style={{ display: "flex", alignItems: "center", gap: 8 }}><UsersIcon size={22} color={COLOR} /> ¿Cómo quieres ver HR?</h2></header>
            <p style={{ color: "var(--text-muted)", marginTop: 0 }}>Elige un usuario para ver la página como la vería esa persona.</p>
            {group("HR", card({ kind: "hr" }, HR_HEAD, "Jefe de HR — aprueba, crea contratistas", "hr"))}
            {group("Contabilidad", card({ kind: "accounting" }, ACCOUNTANT, "Contadora — historial de pagos", "acc"))}
            {group("Supervisores", store.supervisors.map(s => card({ kind: "supervisor", id: s.id }, `${s.firstName} ${s.lastName}`, `${s.position}${s.contractorId ? " · también cobra como contratista" : ""}`, `s${s.id}`)))}
            {group("Empleados / contratistas", store.contractors.filter(c => !store.supervisors.some(s => s.contractorId === c.id)).map(c => card({ kind: "employee", id: c.id }, c.legalName, `${c.position} · ${c.payType === "hourly" ? "por horas" : "monto fijo"} · ${c.currency}`, `e${c.id}`)))}
          </section>
        )}

        {persona?.kind === "hr" && <HrHeadView store={store} />}
        {persona?.kind === "accounting" && <AccountingView store={store} />}
        {persona?.kind === "supervisor" && <SupervisorView store={store} s={store.supervisors.find(s => s.id === persona.id)!} />}
        {persona?.kind === "employee" && <EmployeeView store={store} c={store.contractor(persona.id)} />}
      </main>
    </div>
  );
}
