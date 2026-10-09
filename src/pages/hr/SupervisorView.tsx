import { useState } from "react";
import type { HrStore } from "./hrStore";
import type { Supervisor } from "./hrData";
import { Tabs } from "./ui";
import TeamList from "./TeamList";

export default function SupervisorView({ store, s }: { store: HrStore; s: Supervisor }) {
  const [tab, setTab] = useState<"equipo" | "perfil">("equipo");
  const team = store.contractors.filter(c => c.supervisorId === s.id);
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Hola, {s.firstName}</h2>
      <Tabs tabs={[["equipo", "Mi equipo"], ["perfil", "Mi perfil"]]} value={tab} onChange={setTab} />
      {tab === "equipo" && <TeamList store={store} team={team} who={`${s.firstName} ${s.lastName}`} />}
      {tab === "perfil" && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{s.firstName} {s.lastName}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.4rem 1.5rem", fontSize: "0.9rem" }}>
            <div><strong>Nombre:</strong> {s.firstName}</div>
            <div><strong>Apellido:</strong> {s.lastName}</div>
            <div><strong>Cargo:</strong> {s.position}</div>
            <div><strong>Personas a cargo:</strong> {team.length}</div>
          </div>
        </div>
      )}
    </div>
  );
}
