import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MT } from "../theme";
import { useMarketing } from "../context";
import NewBriefModal from "../components/NewBriefModal";
import DeadlineBadge from "../components/DeadlineBadge";
import { PencilIcon, EyeIcon, ClockIcon, LinkIcon } from "../../../components/icons";
import { stageLabel, isPastDeadline, PUBLICATION_PLATFORMS } from "../types";

export default function MyTasksPage() {
  const { authedUser, briefs } = useMarketing();
  const navigate = useNavigate();
  const [showNew, setShowNew] = useState(false);
  const myRole = authedUser?.role;

  const myDrafts = useMemo(() => {
    if (myRole !== "laura") return [];
    return briefs
      .filter(b => b.status === "draft")
      .sort((a, b) => (a.estimatedStartDate ?? "").localeCompare(b.estimatedStartDate ?? ""));
  }, [briefs, myRole]);

  const myLinkReviews = useMemo(() => {
    if (myRole !== "carol") return [];
    return briefs
      .filter(b => b.status === "completed" && !b.linksApprovedByKarol)
      .sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""));
  }, [briefs, myRole]);

  const myPending = useMemo(() => {
    if (myRole === "carol") {
      return briefs
        .filter(b => b.status === "in_progress" && !b.assignedDisenoEmail)
        .sort((a, b) => (a.carolNotifiedAt ?? "").localeCompare(b.carolNotifiedAt ?? ""));
    }
    return briefs
      .filter(b => b.status === "in_progress")
      .filter(b => {
        const stage = b.stages.find(s => s.key === b.currentStage);
        if (stage?.role !== myRole) return false;
        // Each Diseño person only sees briefs assigned specifically to them, never a colleague's.
        if (myRole === "diseno") {
          return !!b.assignedDisenoEmail && b.assignedDisenoEmail.toLowerCase() === authedUser?.email.toLowerCase();
        }
        return true;
      })
      .sort((a, b) => {
        const sa = a.stages.find(s => s.key === a.currentStage)!;
        const sb = b.stages.find(s => s.key === b.currentStage)!;
        return (sa.deadline ?? "").localeCompare(sb.deadline ?? "");
      });
  }, [briefs, myRole, authedUser?.email]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.5rem", fontFamily: MT.font }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.75rem", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: MT.text1, letterSpacing: "-0.02em" }}>Mis tareas</h1>
          <p style={{ margin: "0.3rem 0 0", fontSize: 13.5, color: MT.text2 }}>
            {myRole === "laura" ? "Revisiones y briefs que necesitan tu atención"
              : myRole === "carol" ? "Briefs esperando que asignes a alguien de Diseño"
              : "Entregas pendientes de Diseño"}
          </p>
        </div>
        {myRole === "laura" && (
          <button onClick={() => setShowNew(true)} style={{
            fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
            background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px",
          }}>+ Nuevo</button>
        )}
      </div>

      {myDrafts.length > 0 && (
        <div style={{ marginBottom: "1.75rem" }}>
          <p style={{ fontWeight: 700, fontSize: 12, color: MT.text2, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
            Pendientes por publicar
          </p>
          <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
            {myDrafts.map(b => (
              <button
                key={b.id}
                onClick={() => navigate(`/marketing/brief/${b.id}`)}
                style={{
                  background: MT.surface, border: `1px solid ${MT.border}`, borderLeft: `3px solid ${MT.info}`,
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
                    width: 42, height: 42, borderRadius: 8, background: MT.info + "12",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <ClockIcon size={20} color={MT.info} />
                  </span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MT.info }}>
                    Pendiente
                  </span>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17, color: MT.text1, letterSpacing: "-0.01em" }}>{b.reference}</div>
                </div>
                {b.estimatedStartDate && <DeadlineBadge deadline={b.estimatedStartDate} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {myLinkReviews.length > 0 && (
        <div style={{ marginBottom: "1.75rem" }}>
          <p style={{ fontWeight: 700, fontSize: 12, color: MT.text2, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
            Enlaces de publicación por revisar
          </p>
          <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
            {myLinkReviews.map(b => {
              const filledCount = PUBLICATION_PLATFORMS.filter(p => (b.publicationLinks[p.key] ?? "").trim()).length;
              const allFilled = filledCount === PUBLICATION_PLATFORMS.length;
              const color = allFilled ? MT.primary : MT.info;
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
                      <LinkIcon size={20} color={color} />
                    </span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color }}>
                      {allFilled ? "Listo para aprobar" : "En progreso"}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 17, color: MT.text1, letterSpacing: "-0.01em" }}>{b.reference}</div>
                  </div>
                  <span style={{
                    fontSize: 12.5, fontWeight: 700, color, background: color + "12",
                    borderRadius: 999, padding: "3px 10px", width: "fit-content",
                  }}>{filledCount}/{PUBLICATION_PLATFORMS.length} enlaces</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {myDrafts.length > 0 && (
        <p style={{ fontWeight: 700, fontSize: 12, color: MT.text2, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
          Tareas inmediatas
        </p>
      )}

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
            const color = overdue ? MT.danger : myRole === "laura" ? MT.primary : myRole === "carol" ? MT.info : MT.clay;
            const Icon = stage.role === "diseno" ? PencilIcon : EyeIcon;
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
