import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Persona } from "./hr/hrData";
import { ACCOUNTANT, HR_HEAD } from "./hr/hrData";
import { useHrStore } from "./hr/hrStore";
import { Avatar, Banner } from "./hr/ui";
import type { RoleKind } from "./hr/ui";
import EmployeeView from "./hr/EmployeeView";
import SupervisorView from "./hr/SupervisorView";
import HrHeadView from "./hr/HrHeadView";
import AccountingView from "./hr/AccountingView";
import ImportPeopleButton from "./hr/ImportPeopleButton";
import "./hr/hr.css";

// PROTOTYPE — fake data (or people loaded from HR's Excel into this tab only); nothing is saved. The real
// version will store contractors/cycles server-side with encrypted bank/tax data (see the HR plan).
export default function HrDashboard() {
  const navigate = useNavigate();
  const store = useHrStore();
  const [persona, setPersona] = useState<Persona | null>(null);

  const label = (p: Persona): string => {
    if (p.kind === "hr") return `${HR_HEAD} — HR`;
    if (p.kind === "accounting") return `${ACCOUNTANT} — Contabilidad`;
    if (p.kind === "supervisor") { const s = store.supervisors.find(x => x.id === p.id)!; return `${`${s.firstName} ${s.lastName}`.trim()} — Supervisor${s.contractorId ? " y contratista" : ""}`; }
    return `${store.contractor(p.id).legalName} — Empleado`;
  };

  let n = 0;
  const card = (p: Persona, role: RoleKind, title: string, sub: string, key: string) => (
    <button key={key} className="hr-persona" data-role={role} style={{ ["--i" as string]: n++ }} onClick={() => setPersona(p)}>
      <Avatar name={title} role={role} size={40} />
      <span className="hr-persona__body">
        <div className="hr-persona__name">{title}</div>
        <div className="hr-persona__sub">{sub}</div>
      </span>
    </button>
  );
  const group = (title: string, cards: React.ReactNode) => (
    <div>
      <div className="hr-group-title">{title}</div>
      <div className="hr-grid">{cards}</div>
    </div>
  );

  return (
    <div className="hr-root">
      <nav className="top-nav">
        <div className="logo">FTC Hub — <span style={{ color: "var(--hr-accent)" }}>HR</span></div>
        <div style={{ fontSize: "0.85rem", color: "var(--hr-muted)" }}>{persona ? `Viendo como: ${label(persona)}` : ""}</div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {persona && <button className="btn btn-secondary btn-sm" onClick={() => setPersona(null)}>Cambiar de usuario</button>}
          <button className="btn btn-secondary btn-sm" onClick={() => navigate("/")}>← Volver al Hub</button>
          <button className="btn btn-secondary btn-sm" onClick={() => { sessionStorage.clear(); navigate("/"); }}>Logout</button>
        </div>
      </nav>

      <main className="content-area">
        <Banner tone="warn">Página de prueba — los datos no se guardan en ninguna base de datos. {store.imported ? "Las personas vienen de tu Excel y viven solo en esta pestaña." : "Al recargar vuelve al inicio."}</Banner>

        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.84rem", marginBottom: "1rem", flexWrap: "wrap", color: "var(--hr-muted)" }}>
          <span>Fecha simulada:</span>
          <select className="form-control" style={{ width: "auto", padding: "0.4rem 0.7rem" }} value={store.simDay} onChange={e => store.setSimDay(e.target.value as "real" | "upload" | "approve")}>
            <option value="real">Hoy (real)</option>
            <option value="upload">Día 24 — subir las cuentas de cobro</option>
            <option value="approve">Día 25 — William aprueba</option>
          </select>
          <span>Ciclo actual: <strong style={{ color: "var(--hr-ink)" }}>{store.info.rangeEs}</strong></span>
        </div>

        {store.notice && (
          <div className="hr-banner hr-banner--ok" style={{ justifyContent: "space-between" }}>
            <div>{store.notice}</div>
            <button onClick={() => store.setNotice("")} aria-label="Cerrar" style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 800, color: "inherit" }}>×</button>
          </div>
        )}

        {!persona && (
          <section className="hr-view">
            <div className="hr-pagehead">
              <div>
                <h2>¿Cómo quieres ver HR?</h2>
                <p>Elige un usuario para ver la página como la vería esa persona.</p>
              </div>
            </div>

            <div className="card" style={{ borderLeft: `4px solid ${store.imported ? "#16a34a" : "#f59e0b"}` }}>
              {store.imported ? (
                <>
                  <strong>Contratistas reales cargados</strong> — {store.contractors.length} personas y {store.supervisors.length} supervisores. Quedan solo en esta pestaña del navegador.
                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <ImportPeopleButton store={store} label="⬆ Cargar otro Excel" />
                    <button className="btn btn-secondary" onClick={() => store.resetDemo()}>↺ Volver a los datos de prueba</button>
                  </div>
                </>
              ) : (
                <>
                  <strong>Ahora ves personas de prueba.</strong> Para ver a los contratistas, empleados y supervisores reales, carga el Excel <em>"Base de Datos contratistas Int y Locales"</em>. No están guardados en la página por privacidad: se leen desde tu archivo y solo viven en esta pestaña.
                  <div style={{ marginTop: 10 }}><ImportPeopleButton store={store} primary label="⬆ Cargar contratistas desde Excel" /></div>
                </>
              )}
            </div>

            {group("HR", card({ kind: "hr" }, "hr", HR_HEAD, "Jefe de HR — aprueba y crea personas", "hr"))}
            {group("Contabilidad", card({ kind: "accounting" }, "accounting", ACCOUNTANT, "Contadora — historial de pagos", "acc"))}
            {group("Supervisores", store.supervisors.map(s => card({ kind: "supervisor", id: s.id }, "supervisor", `${s.firstName} ${s.lastName}`.trim(), `${s.position}${s.contractorId ? " · también cobra" : ""}`, `s${s.id}`)))}
            {group("Empleados y contratistas", store.contractors.filter(c => !store.supervisors.some(s => s.contractorId === c.id)).map(c => card({ kind: "employee", id: c.id }, "employee", c.legalName, `${c.position} · ${c.paymentMethod === "adp" ? "ADP" : c.payType === "hourly" ? "por horas" : c.payType === "variable" ? "variable" : "monto fijo"} · ${c.currency}`, `e${c.id}`)))}
          </section>
        )}

        <div className="hr-view" key={persona ? `${persona.kind}-${"id" in persona ? persona.id : 0}` : "none"}>
          {persona?.kind === "hr" && <HrHeadView store={store} />}
          {persona?.kind === "accounting" && <AccountingView store={store} />}
          {persona?.kind === "supervisor" && <SupervisorView store={store} s={store.supervisors.find(s => s.id === persona.id)!} />}
          {persona?.kind === "employee" && <EmployeeView store={store} c={store.contractor(persona.id)} />}
        </div>
      </main>
    </div>
  );
}
