import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MT } from "../theme";
import { useMarketing } from "../context";
import NewBriefModal from "../components/NewBriefModal";
import DeadlineBadge from "../components/DeadlineBadge";
import Avatar from "../components/Avatar";
import { stageLabel, isPastDeadline } from "../types";

export default function MyTasksPage() {
  const { authedUser, briefs } = useMarketing();
  const navigate = useNavigate();
  const [showNew, setShowNew] = useState(false);
  const myRole = authedUser?.role;

  const myPending = useMemo(() => {
    return briefs
      .filter(b => b.status === "in_progress")
      .filter(b => {
        const stage = b.stages.find(s => s.key === b.currentStage);
        return stage?.role === myRole;
      })
      .sort((a, b) => {
        const sa = a.stages.find(s => s.key === a.currentStage)!;
        const sb = b.stages.find(s => s.key === b.currentStage)!;
        return sa.deadline.localeCompare(sb.deadline);
      });
  }, [briefs, myRole]);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "1.25rem 1.5rem", fontFamily: MT.font }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.1rem", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: MT.text1 }}>Mis tareas</h1>
          <p style={{ margin: "0.15rem 0 0", fontSize: 12.5, color: MT.text2 }}>
            {myRole === "laura" ? "Revisiones y briefs que necesitan tu atención" : "Entregas pendientes de Diseño"}
          </p>
        </div>
        {myRole === "laura" && (
          <button onClick={() => setShowNew(true)} style={{
            fontFamily: MT.font, fontSize: 13, fontWeight: 700, cursor: "pointer",
            background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px",
          }}>+ Nuevo</button>
        )}
      </div>

      {myPending.length === 0 ? (
        <div style={{
          background: MT.mossSoft, border: `1px solid ${MT.moss}30`, borderRadius: MT.radiusLg,
          padding: "2.5rem 1.5rem", textAlign: "center",
        }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>✓</div>
          <div style={{ fontWeight: 800, fontSize: 15, color: MT.moss }}>Estás al día</div>
          <p style={{ margin: "0.35rem 0 0", fontSize: 12.5, color: MT.text2 }}>No tienes tareas pendientes en este momento.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {myPending.map(b => {
            const stage = b.stages.find(s => s.key === b.currentStage)!;
            const overdue = isPastDeadline(stage.deadline);
            return (
              <div key={b.id} onClick={() => navigate(`/marketing/brief/${b.id}`)} style={{
                cursor: "pointer", background: MT.surface, border: `1px solid ${MT.border}`,
                borderLeft: `4px solid ${overdue ? MT.danger : MT.clay}`,
                borderRadius: 10, padding: "0.75rem 1rem",
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {myRole && <Avatar role={myRole} size={26} />}
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: MT.text1 }}>{b.reference}</div>
                    <div style={{ fontSize: 12, color: MT.text2 }}>{stageLabel(b.currentStage)}</div>
                  </div>
                </div>
                <DeadlineBadge deadline={stage.deadline} />
              </div>
            );
          })}
        </div>
      )}

      {showNew && <NewBriefModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
