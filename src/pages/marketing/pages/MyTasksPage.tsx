import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MT } from "../theme";
import { useMarketing } from "../context";
import NewBriefModal from "../components/NewBriefModal";
import DeadlineBadge from "../components/DeadlineBadge";
import ConstructionBanner from "../components/ConstructionBanner";
import { PencilIcon, EyeIcon, ClockIcon, LinkIcon, TrashIcon } from "../../../components/icons";
import { stageLabel, isPastDeadline, PUBLICATION_PLATFORMS } from "../types";

function formatDueIn(dueAt: string): { label: string; overdue: boolean } {
  const diffMs = new Date(dueAt).getTime() - Date.now();
  const overdue = diffMs < 0;
  const abs = Math.abs(diffMs);
  const hours = Math.floor(abs / 3_600_000);
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  const text = days > 0 ? `${days}d ${remHours}h` : `${hours}h`;
  return { label: overdue ? `Venció hace ${text}` : `Quedan ${text}`, overdue };
}

export default function MyTasksPage() {
  const { authedUser, briefs, privateTasks, createPrivateTask, togglePrivateTaskCompleted, deletePrivateTask } = useMarketing();
  const navigate = useNavigate();
  const [showNew, setShowNew] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);
  const myRole = authedUser?.role;

  const pendingPrivateTasks = useMemo(
    () => privateTasks.filter(t => !t.completed).sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
    [privateTasks],
  );
  const completedPrivateTasks = useMemo(
    () => privateTasks.filter(t => t.completed).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
    [privateTasks],
  );
  // Average turnaround on your own private tasks — a simple, self-contained stand-in for
  // "how long do I usually take", independent of brief-stage timing.
  const avgCompletionHours = useMemo(() => {
    const done = completedPrivateTasks.filter(t => t.completedAt);
    if (done.length === 0) return null;
    const totalHours = done.reduce((s, t) => s + (new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime()) / 3_600_000, 0);
    return totalHours / done.length;
  }, [completedPrivateTasks]);

  const submitNewTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !taskDue) return;
    setTaskSaving(true);
    try {
      await createPrivateTask(taskTitle.trim(), new Date(taskDue).toISOString());
      setTaskTitle(""); setTaskDue(""); setShowNewTask(false);
    } finally {
      setTaskSaving(false);
    }
  };

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
      <ConstructionBanner label="Tareas privadas" />

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

      {/* Private tasks — a personal to-do only the owner can see, like what people currently
          track in MS Planner. Laura already has "+ Nuevo" for her own drafts, so this is only
          for Diseño and Carol. */}
      {myRole !== "laura" && (
      <div style={{
        background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg,
        padding: "1.25rem", marginBottom: "1.75rem", boxShadow: MT.shadow,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.9rem", flexWrap: "wrap", gap: 8 }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 12, color: MT.text2, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
              Tareas privadas — solo tú las ves
            </p>
            {avgCompletionHours !== null && (
              <p style={{ fontSize: 12, color: MT.text3, margin: "0.3rem 0 0" }}>
                Promedio en completarlas: {avgCompletionHours < 24 ? `${Math.round(avgCompletionHours)}h` : `${(avgCompletionHours / 24).toFixed(1)}d`}
              </p>
            )}
          </div>
          <button onClick={() => setShowNewTask(v => !v)} style={{
            fontFamily: MT.font, fontSize: 13, fontWeight: 700, cursor: "pointer",
            background: showNewTask ? MT.surfaceAlt : MT.moss, color: showNewTask ? MT.text2 : "#fff",
            border: "none", borderRadius: 8, padding: "8px 14px",
          }}>{showNewTask ? "Cancelar" : "+ Nueva tarea privada"}</button>
        </div>

        {showNewTask && (
          <form onSubmit={submitNewTask} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: "1rem" }}>
            <div style={{ flex: "1 1 220px" }}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 4 }}>Qué tienes que hacer</label>
              <input
                autoFocus value={taskTitle} onChange={e => setTaskTitle(e.target.value)}
                placeholder="Ej. Revisar catálogo de octubre"
                style={{ width: "100%", fontFamily: MT.font, fontSize: 13, padding: "8px 10px", border: `1px solid ${MT.border}`, borderRadius: 6, outline: "none" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 4 }}>Para cuándo</label>
              <input
                type="datetime-local" value={taskDue} onChange={e => setTaskDue(e.target.value)}
                style={{ fontFamily: MT.font, fontSize: 13, padding: "8px 10px", border: `1px solid ${MT.border}`, borderRadius: 6, outline: "none" }}
              />
            </div>
            <button type="submit" disabled={taskSaving || !taskTitle.trim() || !taskDue} style={{
              fontFamily: MT.font, fontSize: 13, fontWeight: 700, cursor: taskSaving ? "not-allowed" : "pointer",
              background: MT.moss, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px",
            }}>{taskSaving ? "Guardando..." : "Guardar"}</button>
          </form>
        )}

        {pendingPrivateTasks.length === 0 ? (
          <p style={{ fontSize: 12.5, color: MT.text3, margin: 0 }}>Sin tareas privadas pendientes.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {pendingPrivateTasks.map(t => {
              const due = formatDueIn(t.dueAt);
              return (
                <div key={t.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "0.55rem 0.7rem",
                  background: due.overdue ? MT.dangerSoft : MT.surfaceAlt, borderRadius: 8,
                }}>
                  <input type="checkbox" checked={false} onChange={() => togglePrivateTaskCompleted(t.id, true)} />
                  <span style={{ flex: 1, fontSize: 13, color: MT.text1 }}>{t.title}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: due.overdue ? MT.danger : MT.text2 }}>{due.label}</span>
                  <button onClick={() => deletePrivateTask(t.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", color: MT.text3, display: "flex", padding: 2 }}>
                    <TrashIcon size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {completedPrivateTasks.length > 0 && (
          <details style={{ marginTop: "0.9rem" }}>
            <summary style={{ fontSize: 11.5, color: MT.text3, cursor: "pointer" }}>{completedPrivateTasks.length} completada(s)</summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {completedPrivateTasks.map(t => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "0.5rem 0.7rem", background: MT.surfaceAlt, borderRadius: 8, opacity: 0.7 }}>
                  <input type="checkbox" checked onChange={() => togglePrivateTaskCompleted(t.id, false)} />
                  <span style={{ flex: 1, fontSize: 13, color: MT.text2, textDecoration: "line-through" }}>{t.title}</span>
                  <button onClick={() => deletePrivateTask(t.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", color: MT.text3, display: "flex", padding: 2 }}>
                    <TrashIcon size={14} />
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
      )}

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
