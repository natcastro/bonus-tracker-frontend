import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MT, formatDateHuman, ROLE_CFG } from "../theme";
import { useMarketing } from "../context";
import Timeline from "../components/Timeline";
import DeadlineBadge from "../components/DeadlineBadge";
import Avatar from "../components/Avatar";
import StatusPill from "../components/StatusPill";
import { stageLabel, isPastDeadline, normalizeUrl } from "../types";

const REVIEW_STAGES = new Set(["review1", "review2", "final"]);
const DESIGN_STAGES = new Set(["proposal", "adjustments"]);

export default function BriefDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { authedUser, briefs, submitDesignStage, lauraReview, requestExtraRevision } = useMarketing();
  const brief = briefs.find(b => b.id === Number(id));
  const [linkInput, setLinkInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!brief) {
    return (
      <div style={{ maxWidth: 900, margin: "3rem auto", textAlign: "center", fontFamily: MT.font, color: MT.text2 }}>
        Brief no encontrado. <button onClick={() => navigate("/marketing/dashboard")} style={{ color: MT.primary, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>Volver</button>
      </div>
    );
  }

  const currentStage = brief.stages.find(s => s.key === brief.currentStage);
  const myRole = authedUser?.role;
  const canAct = brief.status === "in_progress" && currentStage?.role === myRole;
  const isFinal = brief.currentStage === "final";

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await fn(); setLinkInput(""); }
    catch (err: any) { setError(err?.message ?? "Ocurrió un error."); }
    finally { setBusy(false); }
  };

  const fieldStyle: React.CSSProperties = {
    width: "100%", fontFamily: MT.font, fontSize: 13.5, padding: "9px 11px",
    border: `1px solid ${MT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "1.25rem 1.5rem", fontFamily: MT.font }}>
      <button onClick={() => navigate("/marketing/dashboard")} style={{
        background: "none", border: "none", color: MT.text2, cursor: "pointer", fontSize: 12.5, marginBottom: 12, padding: 0,
      }}>← Volver al dashboard</button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: "0.5rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 3 }}>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: MT.text1 }}>{brief.reference}</h1>
            <StatusPill
              solid
              color={brief.status === "completed" ? MT.primary : currentStage ? ROLE_CFG[currentStage.role].color : MT.text2}
              label={brief.status === "completed" ? "✓ Completado" : stageLabel(brief.currentStage)}
            />
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: MT.text2 }}>Inicio: {formatDateHuman(brief.startDate)}</p>
        </div>
        {brief.shiftDays > 0 && (
          <div style={{ fontSize: 11.5, color: MT.warn, background: MT.warnSoft, borderRadius: 8, padding: "0.35rem 0.65rem", fontWeight: 600 }}>
            ⏱ Deadlines de Diseño desplazados +{brief.shiftDays} día{brief.shiftDays !== 1 ? "s" : ""} por revisiones de Laura
          </div>
        )}
      </div>

      <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, padding: "1rem 1.1rem", marginBottom: "1rem" }}>
        <Timeline brief={brief} />
      </div>

      {/* Stage links history */}
      <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, padding: "1rem 1.1rem", marginBottom: "1rem" }}>
        <p style={{ fontWeight: 700, fontSize: 11, color: MT.text2, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.6rem" }}>Enlaces por etapa</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {brief.stages.map(s => (
            <div key={s.key} style={{ display: "flex", alignItems: "center", padding: "0.4rem 0.6rem", background: MT.surfaceAlt, borderRadius: 8, gap: 10 }}>
              <Avatar role={s.role} size={18} />
              <div style={{ fontSize: 12, color: MT.text1, fontWeight: 600, minWidth: 100 }}>{s.label}</div>
              <StatusPill
                color={s.status === "done" ? MT.primary : MT.text3}
                label={s.status === "done" ? `✓ ${formatDateHuman(s.completedAt)}` : formatDateHuman(s.deadline)}
              />
              {s.link ? (
                <a href={normalizeUrl(s.link)} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: MT.primary, fontWeight: 600, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {s.link}
                </a>
              ) : (
                <span style={{ fontSize: 12, color: MT.text3, flex: 1 }}>Sin enlace todavía</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Action panel */}
      {brief.status === "completed" ? (
        <div style={{ background: MT.primarySoft, border: `1px solid ${MT.primary}30`, borderRadius: MT.radiusLg, padding: "1rem", textAlign: "center" }}>
          <p style={{ margin: 0, fontWeight: 800, color: MT.primary, fontSize: 14 }}>✓ Brief completado</p>
          <p style={{ margin: "0.3rem 0 0", fontSize: 12, color: MT.text2 }}>Cerrado el {formatDateHuman(brief.completedAt)}</p>
        </div>
      ) : !canAct ? (
        <div style={{ background: MT.surfaceAlt, borderRadius: MT.radiusLg, padding: "1rem", textAlign: "center", color: MT.text2, fontSize: 12.5 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            {currentStage && <Avatar role={currentStage.role} size={18} />}
            <span>Esperando a {currentStage?.role === "laura" ? "Laura" : "Diseño"} — etapa actual: <strong>{stageLabel(brief.currentStage)}</strong></span>
          </div>
          {currentStage && <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}><DeadlineBadge deadline={currentStage.deadline} /></div>}
        </div>
      ) : (
        <div style={{ background: MT.surface, border: `2px solid ${MT.clay}`, borderRadius: MT.radiusLg, padding: "1rem" }}>
          <p style={{ fontWeight: 800, fontSize: 13.5, color: MT.text1, margin: "0 0 10px" }}>
            Tu turno — {stageLabel(brief.currentStage)}
          </p>
          {currentStage && <div style={{ marginBottom: "1rem" }}><DeadlineBadge deadline={currentStage.deadline} /></div>}

          {DESIGN_STAGES.has(brief.currentStage) && (
            <>
              <label style={{ fontSize: 12, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 6 }}>
                Link de SharePoint {brief.currentStage === "proposal" ? "de la propuesta" : "de los ajustes"}
              </label>
              <input style={fieldStyle} value={linkInput} onChange={e => setLinkInput(e.target.value)} placeholder="https://formatucuerpo.sharepoint.com/..." />
              {error && <p style={{ color: MT.danger, fontSize: 12.5, marginTop: 8 }}>{error}</p>}
              <button disabled={busy || !linkInput.trim()} onClick={() => run(() => submitDesignStage(brief.id, linkInput.trim()))} style={{
                marginTop: 12, fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
                background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px",
              }}>{busy ? "Enviando..." : "Subir y continuar"}</button>
            </>
          )}

          {REVIEW_STAGES.has(brief.currentStage) && (
            <>
              {error && <p style={{ color: MT.danger, fontSize: 12.5, marginBottom: 10 }}>{error}</p>}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button disabled={busy} onClick={() => run(() => lauraReview(brief.id, "approve"))} style={{
                  fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
                  background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px",
                }}>✓ Aprobar sin cambios / Completar</button>

                {!isFinal && (
                  <button disabled={busy} onClick={() => run(() => lauraReview(brief.id, "request_changes"))} style={{
                    fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
                    background: MT.surface, color: MT.clay, border: `1px solid ${MT.clay}`, borderRadius: 8, padding: "10px 18px",
                  }}>Solicitar ajustes / continuar</button>
                )}

                {isFinal && (
                  <button disabled={busy} onClick={() => run(() => requestExtraRevision(brief.id))} style={{
                    fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
                    background: MT.surface, color: MT.clay, border: `1px solid ${MT.clay}`, borderRadius: 8, padding: "10px 18px",
                  }}>Solicitar revisión adicional</button>
                )}
              </div>
              <p style={{ fontSize: 11.5, color: MT.text3, marginTop: 10 }}>
                {isFinal
                  ? "Completar cierra el brief. Solicitar revisión adicional reabre otra ronda de ajustes."
                  : "Aprobar sin cambios cierra el brief directamente. Solicitar ajustes lo envía de vuelta a Diseño."}
              </p>
            </>
          )}
        </div>
      )}

      {brief.status === "in_progress" && currentStage && isPastDeadline(currentStage.deadline) && (
        <p style={{ marginTop: 12, fontSize: 12, color: MT.danger, fontWeight: 600 }}>
          ⚠ Esta etapa está atrasada — venció el {formatDateHuman(currentStage.deadline)}.
        </p>
      )}
    </div>
  );
}
