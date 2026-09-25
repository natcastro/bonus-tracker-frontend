import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MT, formatDateHuman } from "../theme";
import { useMarketing } from "../context";
import DeadlineBadge from "../components/DeadlineBadge";
import Avatar from "../components/Avatar";
import StatusPill from "../components/StatusPill";
import ConstructionBanner from "../components/ConstructionBanner";
import { TrashIcon } from "../../../components/icons";
import { todoStageLabel, normalizeUrl } from "../types";
import { uploadTodoTaskFile } from "../../../services/api";

export default function TodoTaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { authedUser, todoTasks, advanceTodoTask, deleteTodoTask, disenoDisplayName } = useMarketing();
  const task = todoTasks.find(t => t.id === Number(id));
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  if (!task) {
    return (
      <div style={{ maxWidth: 900, margin: "3rem auto", textAlign: "center", fontFamily: MT.font, color: MT.text2 }}>
        Tarea no encontrada. <button onClick={() => navigate("/marketing/todo")} style={{ color: MT.clay, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>Volver</button>
      </div>
    );
  }

  const currentStage = task.stages.find(s => s.key === task.currentStage);
  const myRole = authedUser?.role;
  const canAct = task.status === "in_progress" && currentStage?.role === myRole;
  const needsLink = currentStage?.role === "diseno";

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await fn(); setLink(""); setNote(""); }
    catch (err: any) { setError(err?.message ?? "Ocurrió un error."); }
    finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`¿Eliminar la tarea "${task.title}"? Esta acción no se puede deshacer.`)) return;
    await deleteTodoTask(task.id);
    navigate("/marketing/todo");
  };

  const handleFile = async (file: File) => {
    setUploadError("");
    setUploading(true);
    try {
      const url = await uploadTodoTaskFile(task.id, task.currentStage, file);
      setLink(url);
    } catch (err: any) {
      setUploadError(err?.message ?? "No se pudo subir el archivo.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: "2rem 1.5rem", fontFamily: MT.font }}>
      <ConstructionBanner label="To Do — detalle" />
      <button onClick={() => navigate("/marketing/todo")} style={{
        background: "none", border: "none", cursor: "pointer", color: MT.text2, fontSize: 13, fontWeight: 600,
        marginBottom: 14, padding: 0, display: "flex", alignItems: "center", gap: 6,
      }}>← Volver</button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: MT.text1 }}>{task.title}</h1>
          <p style={{ margin: "0.3rem 0 0", fontSize: 13, color: MT.text2 }}>
            Asignada a {disenoDisplayName(task.assignedDisenoEmail)} · {task.status === "completed" ? "Completada" : todoStageLabel(task.currentStage)}
          </p>
        </div>
        <button onClick={handleDelete} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", color: MT.text3, display: "flex" }}>
          <TrashIcon size={18} />
        </button>
      </div>

      {task.description && (
        <div style={{ background: MT.surfaceAlt, borderRadius: MT.radiusLg, padding: "0.9rem 1.1rem", marginBottom: "1rem", fontSize: 13, color: MT.text1, lineHeight: 1.5 }}>
          {task.description}
        </div>
      )}

      {/* Stage list */}
      <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, padding: "1rem 1.1rem", marginBottom: "1rem" }}>
        <p style={{ fontWeight: 700, fontSize: 11, color: MT.text2, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.6rem" }}>Etapas</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {task.stages.map(s => {
            const isCurrent = task.status === "in_progress" && s.key === task.currentStage;
            return (
              <div key={s.key} style={{
                display: "flex", alignItems: "center", padding: "0.6rem 0.75rem", gap: 10,
                background: isCurrent ? MT.claySoft : MT.surfaceAlt,
                border: isCurrent ? `1px solid ${MT.clay}50` : "1px solid transparent", borderRadius: 8,
              }}>
                <Avatar role={s.role} size={18} />
                <div style={{ fontSize: 12, color: MT.text1, fontWeight: 600, minWidth: 100 }}>{s.label}</div>
                <StatusPill
                  color={s.status === "done" ? MT.primary : isCurrent ? MT.clay : MT.text3}
                  label={s.status === "done" ? `✓ ${formatDateHuman(s.completedAt)}` : formatDateHuman(s.deadline)}
                />
                {s.status === "done" && s.late && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: MT.danger, background: `${MT.danger}18`, borderRadius: 999, padding: "2px 7px" }}>⚠ tarde</span>
                )}
                {s.link && (
                  <a href={normalizeUrl(s.link)} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: MT.clay, fontWeight: 600, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {s.link}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {task.status === "completed" ? (
        <div style={{ background: MT.primarySoft, border: `1px solid ${MT.primary}30`, borderRadius: MT.radiusLg, padding: "1rem", textAlign: "center" }}>
          <p style={{ margin: 0, fontWeight: 800, color: MT.primary, fontSize: 14 }}>✓ Tarea completada</p>
          <p style={{ margin: "0.3rem 0 0", fontSize: 12, color: MT.text2 }}>Cerrada el {formatDateHuman(task.completedAt)}</p>
        </div>
      ) : !canAct ? (
        <div style={{ background: MT.surfaceAlt, borderRadius: MT.radiusLg, padding: "1rem", textAlign: "center", fontSize: 13, color: MT.text2 }}>
          Esperando a {currentStage?.role === "diseno" ? disenoDisplayName(task.assignedDisenoEmail) : "Karol"} — etapa actual: <strong>{todoStageLabel(task.currentStage)}</strong>
        </div>
      ) : (
        <div style={{ background: MT.surface, border: `2px solid ${MT.clay}`, borderRadius: MT.radiusLg, padding: "1rem" }}>
          <p style={{ fontWeight: 800, fontSize: 13.5, color: MT.text1, margin: "0 0 10px" }}>Tu turno — {todoStageLabel(task.currentStage)}</p>
          {currentStage?.deadline && <div style={{ marginBottom: "1rem" }}><DeadlineBadge deadline={currentStage.deadline} /></div>}

          <label style={{ fontSize: 12, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 6 }}>
            Link con el arte / entrega{needsLink ? "" : " (opcional)"}
          </label>
          <input
            style={{ width: "100%", fontFamily: MT.font, fontSize: 13.5, padding: "9px 11px", border: `1px solid ${MT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box", marginBottom: 8 }}
            value={link} onChange={e => setLink(e.target.value)} placeholder="https://formatucuerpo.sharepoint.com/..."
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <input
              type="file"
              disabled={uploading}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
              style={{ fontSize: 12 }}
            />
            {uploading && <span style={{ fontSize: 12, color: MT.text3 }}>Subiendo…</span>}
          </div>
          {link && /^https?:\/\/.*\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(link) && (
            <img src={link} alt="Entrega" style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8, marginBottom: 8, display: "block" }} />
          )}
          {uploadError && <p style={{ color: MT.danger, fontSize: 12.5, marginBottom: 8 }}>{uploadError}</p>}
          <label style={{ fontSize: 12, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 6, marginTop: 4 }}>Nota (opcional)</label>
          <textarea
            style={{ width: "100%", fontFamily: MT.font, fontSize: 13.5, padding: "9px 11px", border: `1px solid ${MT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box", marginBottom: 12, resize: "vertical", minHeight: 60 }}
            value={note} onChange={e => setNote(e.target.value)}
          />
          {error && <p style={{ color: MT.danger, fontSize: 12.5, marginBottom: 10 }}>{error}</p>}
          <button
            disabled={busy || (needsLink && !link.trim())}
            onClick={() => run(() => advanceTodoTask(task.id, needsLink ? link.trim() : undefined, note.trim() || undefined))}
            style={{
              fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
              background: MT.clay, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px",
            }}
          >{busy ? "Enviando..." : task.currentStage === "approved" ? "Aprobar y cerrar" : "Continuar"}</button>
        </div>
      )}
    </div>
  );
}
