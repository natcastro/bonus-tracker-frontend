import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Persona } from "./hr/hrData";
import { useHubAccess } from "../auth/HubAccessContext";
import { getHubNicknames } from "../services/api";
import { ACCOUNTANT, HR_HEAD } from "./hr/hrData";
import { useHrStore, isHrHeadName } from "./hr/hrStore";
import { Avatar, Banner } from "./hr/ui";
import type { RoleKind } from "./hr/ui";
import EmployeeView from "./hr/EmployeeView";
import SupervisorView from "./hr/SupervisorView";
import HrHeadView from "./hr/HrHeadView";
import AccountingView from "./hr/AccountingView";
import { fetchHrPeople } from "./hr/hrApi";
import "./hr/hr.css";

// PROTOTYPE — fake data (or people loaded from HR's Excel into this tab only); nothing is saved. The real
// version will store contractors/cycles server-side with encrypted bank/tax data (see the HR plan).
export default function HrDashboard() {
  const navigate = useNavigate();
  const store = useHrStore();
  const [persona, setPersona] = useState<Persona | null>(null);
  const { viewAs, email, access, getRole } = useHubAccess();
  const [loadErr, setLoadErr] = useState("");
  useEffect(() => {
    fetchHrPeople().then(r => store.loadPeople(r.contractors, r.supervisors)).catch((e: Error) => setLoadErr(e.message || "No pude cargar las personas."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Someone whose Hub Access names a specific HR role (or an admin previewing them) goes straight to
  // their own page; the main admin with no preview still gets the "pick a user" screen.
  const hrRole = getRole("HR");
  const isSpecific = !!viewAs || (!!access && !access.isAdmin && !access.teams.includes("ALL") && access.teams.some(t => t.startsWith("HR:")));
  const [nick, setNick] = useState<string | null>(null);
  useEffect(() => {
    if (!isSpecific || (hrRole !== "supervisor" && hrRole !== "staff")) { setNick(""); return; }
    getHubNicknames([email]).then(m => setNick(m[email.toLowerCase()] ?? "")).catch(() => setNick(""));
  }, [isSpecific, hrRole, email]);
  const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const autoPersona: Persona | null = !isSpecific ? null
    : hrRole === "admin" || ((hrRole === "supervisor" || hrRole === "staff") && isHrHeadName(nick ?? "")) ? { kind: "hr" }
    : hrRole === "accounting" ? { kind: "accounting" }
    : hrRole === "supervisor" ? ((s => (s ? { kind: "supervisor", id: s.id } as Persona : null))(store.supervisors.find(x => norm(`${x.firstName} ${x.lastName}`) === norm(nick ?? ""))))
    : hrRole === "staff" ? ((c => (c ? { kind: "employee", id: c.id } as Persona : null))(store.contractors.find(x => norm(x.legalName) === norm(nick ?? ""))))
    : null;
  const shown: Persona | null = persona ?? autoPersona;
  const lostPerson = isSpecific && !autoPersona && (hrRole === "supervisor" || hrRole === "staff") && nick !== null;

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
        <div style={{ fontSize: "0.85rem", color: "var(--hr-muted)" }}>{shown ? `Viendo como: ${label(shown)}` : ""}</div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {persona && !autoPersona && <button className="btn btn-secondary btn-sm" onClick={() => setPersona(null)}>Cambiar de usuario</button>}
          <button className="btn btn-secondary btn-sm" onClick={() => navigate("/")}>← Volver al Hub</button>
          <button className="btn btn-secondary btn-sm" onClick={() => { sessionStorage.clear(); navigate("/"); }}>Logout</button>
        </div>
      </nav>

      <main className="content-area">
        <div style={{ fontSize: "0.84rem", marginBottom: "1rem", color: "var(--hr-muted)" }}>
          Ciclo actual: <strong style={{ color: "var(--hr-ink)" }}>{store.info.rangeEs}</strong>
        </div>

        {store.notice && (
          <div className="hr-banner hr-banner--ok" style={{ justifyContent: "space-between" }}>
            <div>{store.notice}</div>
            <button onClick={() => store.setNotice("")} aria-label="Cerrar" style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 800, color: "inherit" }}>×</button>
          </div>
        )}

        {loadErr && <Banner tone="warn">{loadErr}</Banner>}
        {!store.ready && !loadErr && <div className="card" style={{ color: "var(--hr-muted)" }}>Cargando personas…</div>}
        {lostPerson && store.ready && (
          <Banner tone="warn">No encuentro a <strong>{nick || "esta persona"}</strong> en HR. Pídele a William que la agregue o revisa el nombre en Accesos.</Banner>
        )}

        {store.ready && !shown && (
          <section className="hr-view">
            <div className="hr-pagehead">
              <div>
                <h2>¿Cómo quieres ver HR?</h2>
                <p>Elige un usuario para ver la página como la vería esa persona.</p>
              </div>
            </div>

            {group("HR", card({ kind: "hr" }, "hr", HR_HEAD, "Jefe de HR — aprueba y crea personas", "hr"))}
            {group("Contabilidad", card({ kind: "accounting" }, "accounting", ACCOUNTANT, "Contadora — historial de pagos", "acc"))}
            {group("Supervisores", store.supervisors.map(s => card({ kind: "supervisor", id: s.id }, "supervisor", `${s.firstName} ${s.lastName}`.trim(), `${s.position}${s.contractorId ? " · también cobra" : ""}`, `s${s.id}`)))}
            {group("Empleados y contratistas", store.contractors.filter(c => !store.supervisors.some(s => s.contractorId === c.id)).map(c => card({ kind: "employee", id: c.id }, "employee", c.legalName, `${c.position} · ${c.paymentMethod === "adp" ? "ADP" : c.payType === "hourly" ? "por horas" : c.payType === "variable" ? "variable" : "monto fijo"} · ${c.currency}`, `e${c.id}`)))}
          </section>
        )}

        <div className="hr-view" key={shown ? `${shown.kind}-${"id" in shown ? shown.id : 0}` : "none"}>
          {shown?.kind === "hr" && <HrHeadView store={store} />}
          {shown?.kind === "accounting" && <AccountingView store={store} />}
          {shown?.kind === "supervisor" && <SupervisorView store={store} s={store.supervisors.find(s => s.id === shown.id)!} />}
          {shown?.kind === "employee" && <EmployeeView store={store} c={store.contractor(shown.id)} />}
        </div>
      </main>
    </div>
  );
}
