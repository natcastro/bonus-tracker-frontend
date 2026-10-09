import { useState } from "react";
import type { HrStore } from "./hrStore";
import type { Supervisor } from "./hrData";
import { Tabs } from "./ui";
import TeamList from "./TeamList";
import EmployeeView from "./EmployeeView";

// A supervisor approves their team's cycles. If they are also a paid contractor they get a second tab
// with their own cycle, history and profile — their own cycle is approved by their supervisor (or William).
export default function SupervisorView({ store, s }: { store: HrStore; s: Supervisor }) {
  const own = s.contractorId ? store.contractor(s.contractorId) : null;
  const [tab, setTab] = useState<"equipo" | "mio" | "perfil">("equipo");
  const team = store.contractors.filter(c => c.supervisorId === s.id && c.id !== s.contractorId);
  const tabs: ["equipo" | "mio" | "perfil", string][] = own
    ? [["equipo", "Mi equipo (aprobar)"], ["mio", "Mi ciclo y mis pagos"], ["perfil", "Mi perfil de supervisor"]]
    : [["equipo", "Mi equipo"], ["perfil", "Mi perfil"]];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Hola, {s.firstName}</h2>
      {own && <p style={{ margin: "-0.25rem 0 0.75rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>Tienes dos roles: apruebas los pagos de tu equipo <strong>y</strong> también llenas tu propio ciclo de pago.</p>}
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "equipo" && <TeamList store={store} team={team} who={`${s.firstName} ${s.lastName}`} />}
      {tab === "mio" && own && <EmployeeView store={store} c={own} embedded />}
      {tab === "perfil" && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{s.firstName} {s.lastName}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.4rem 1.5rem", fontSize: "0.9rem" }}>
            <div><strong>Nombre:</strong> {s.firstName}</div>
            <div><strong>Apellido:</strong> {s.lastName}</div>
            <div><strong>Cargo:</strong> {s.position}</div>
            <div><strong>Personas a cargo:</strong> {team.length}</div>
            {own && <div><strong>También cobra:</strong> sí — su ciclo lo aprueba {store.supervisors.find(x => x.id === own.supervisorId) ? `${store.supervisors.find(x => x.id === own.supervisorId)!.firstName}` : "William"}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
