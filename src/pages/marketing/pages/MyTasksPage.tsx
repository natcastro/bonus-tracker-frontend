import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MT } from "../theme";
import { useMarketing } from "../context";
import NewBriefModal from "../components/NewBriefModal";
import DeadlineBadge from "../components/DeadlineBadge";
import { PencilIcon, EyeIcon } from "../../../components/icons";
import { stageLabel, isPastDeadline } from "../types";
import type { StageKey } from "../types";

const DESIGN_STAGES = new Set<StageKey>(["proposal", "adjustments"]);

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
        return (sa.deadline ?? "").localeCompare(sb.deadline ?? "");
      });
  }, [briefs, myRole]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.5rem", fontFamily: MT.font }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.75rem", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: MT.text1, letterSpacing: "-0.02em" }}>Mis tareas</h1>
          <p style={{ margin: "0.3rem 0 0", fontSize: 13.5, color: MT.text2 }}>
            {myRole === "laura" ? "Revisiones y briefs que necesitan tu atención" : "Entregas pendientes de Diseño"}
          </p>
        </div>
        {myRole === "laura" && (
          <button onClick={() => setShowNew(true)} style={{
            fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
            background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px",
          }}>+ Nuevo</button>
        )}
      </div>

      {myPending.length === 0 ? (
        <div style={{
          background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg,
          padding: "3.5rem 1.5rem", textAlign: "center", boxShadow: MT.shadow,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%", background: MT.primarySoft, color: MT.primary,
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem",
            fontSize: 26, fontWeight: 800,
          }}>✓</div>
          <div style={{ fontWeight: 800, fontSize: 17, color: MT.text1 }}>Estás al día</div>
          <p style={{ margin: "0.4rem 0 0", fontSize: 13, color: MT.text2 }}>No tienes tareas pendientes en este momento.</p>
        </div>
      ) : (
        <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
          {myPending.map(b => {
            const stage = b.stages.find(s => s.key === b.currentStage)!;
            const overdue = !!stage.deadline && isPastDeadline(stage.deadline);
            const color = overdue ? MT.danger : myRole === "laura" ? MT.primary : MT.clay;
            const Icon = DESIGN_STAGES.has(stage.key) ? PencilIcon : EyeIcon;
            return (
              <button
                key={b.id}
                onClick={() => navigate(`/marketing/brief/${b.id}`)}
                style={{
                  background: MT.surface, border: `1px solid ${MT.border}`, borderLeft: `3px solid ${color}`,
                  borderRadius: 10, padding: "1.75rem", cursor: "pointer", textAlign: "left",
                  display: "flex", flexDirection: "column", gap: "0.9rem",
                  minWidth: 260, maxWidth: 340, flex: "1 1 260px",
                  boxShadow: MT.shadow, transition: "box-shadow 0.2s, transform 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = MT.shadowLg; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = MT.shadow; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <span style={{
                    width: 42, height: 42, borderRadius: 8, background: color + "12",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <Icon size={20} color={color} />
                  </span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color }}>
                    {stageLabel(stage.key)}
                  </span>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17, color: MT.text1, letterSpacing: "-0.01em" }}>{b.reference}</div>
                </div>
                <DeadlineBadge deadline={stage.deadline!} />
              </button>
            );
          })}
        </div>
      )}

      {showNew && <NewBriefModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
