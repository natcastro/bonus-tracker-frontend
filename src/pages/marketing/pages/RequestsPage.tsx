import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MT, formatDateHuman, ROLE_CFG } from "../theme";
import { useMarketing } from "../context";
import DeadlineBadge from "../components/DeadlineBadge";
import StatusPill from "../components/StatusPill";
import { requestStageLabel } from "../types";
import { uploadMarketingRequestFile } from "../../../services/api";

function NewRequestForm({ onDone }: { onDone: () => void }) {
  const { createRequest, authedUser } = useMarketing();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sharedWith, setSharedWith] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fieldStyle: React.CSSProperties = {
    width: "100%", fontFamily: MT.font, fontSize: 13.5, padding: "9px 11px",
    border: `1px solid ${MT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box",
  };

  const submit = async () => {
    if (!title.trim()) { setError("Ponle un nombre a la solicitud."); return; }
    if (!description.trim()) { setError("Explica qué necesitas."); return; }
    setBusy(true); setError("");
    try {
      setUploading(true);
      const attachments: string[] = [];
      for (const f of files) attachments.push(await uploadMarketingRequestFile(authedUser!.email, f));
      setUploading(false);
      const sharedWithEmails = sharedWith.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
      await createRequest(title.trim(), description.trim(), attachments, sharedWithEmails);
      onDone();
    } catch (err: any) {
      setError(err?.message ?? "No se pudo crear la solicitud.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, padding: "1.1rem", marginBottom: "1.25rem", boxShadow: MT.shadow }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 14.5, fontWeight: 800, color: MT.text1 }}>Nueva solicitud</h3>

      <label style={{ fontSize: 11.5, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 5 }}>Nombre de la solicitud</label>
      <input style={{ ...fieldStyle, marginBottom: 12 }} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Banner para evento de tienda" />

      <label style={{ fontSize: 11.5, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 5 }}>¿Qué necesitas?</label>
      <textarea style={{ ...fieldStyle, marginBottom: 12, resize: "vertical" }} rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe lo que necesitas, tamaños, fecha de uso, etc." />

      <label style={{ fontSize: 11.5, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 5 }}>Archivos o referencias (opcional)</label>
      <input type="file" multiple style={{ ...fieldStyle, marginBottom: 12, padding: "6px" }} onChange={e => setFiles(Array.from(e.target.files ?? []))} />

      <label style={{ fontSize: 11.5, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 5 }}>Compartir con (opcional — otros correos @formatucuerpo.com, separados por coma)</label>
      <input style={{ ...fieldStyle, marginBottom: 14 }} value={sharedWith} onChange={e => setSharedWith(e.target.value)} placeholder="colega@formatucuerpo.com" />

      {error && <p style={{ color: MT.danger, fontSize: 12.5, marginBottom: 10 }}>{error}</p>}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onDone} disabled={busy} style={{
          fontFamily: MT.font, fontSize: 13, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
          background: MT.surfaceAlt, color: MT.text1, border: `1px solid ${MT.border}`, borderRadius: 8, padding: "9px 16px",
        }}>Cancelar</button>
        <button onClick={submit} disabled={busy} style={{
          fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
          background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px",
        }}>{uploading ? "Subiendo archivos..." : busy ? "Creando..." : "Crear solicitud"}</button>
      </div>
    </div>
  );
}

export default function RequestsPage() {
  const { requests, authedUser, disenoDisplayName } = useMarketing();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);

  const visible = useMemo(() => {
    if (authedUser?.role !== "enlace") return requests;
    const me = authedUser.email.toLowerCase();
    return requests.filter(r => r.requesterEmail.toLowerCase() === me || r.sharedWithEmails.some(e => e.toLowerCase() === me));
  }, [requests, authedUser]);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "1.25rem 1.5rem", fontFamily: MT.font }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: MT.text1 }}>Solicitudes</h1>
          <p style={{ margin: "0.15rem 0 0", fontSize: 12.5, color: MT.text2 }}>
            {authedUser?.role === "enlace" ? "Tus solicitudes a Diseño" : "Solicitudes de usuarios enlace"}
          </p>
        </div>
        {authedUser?.role === "enlace" && !showForm && (
          <button onClick={() => setShowForm(true)} style={{
            fontFamily: MT.font, fontSize: 13, fontWeight: 700, cursor: "pointer",
            background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px",
          }}>+ Nueva solicitud</button>
        )}
      </div>

      {showForm && <NewRequestForm onDone={() => setShowForm(false)} />}

      <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, overflow: "hidden", boxShadow: MT.shadow }}>
        {visible.length === 0 ? (
          <p style={{ padding: "2rem", textAlign: "center", color: MT.text3, fontSize: 13, margin: 0 }}>
            {authedUser?.role === "enlace" ? "Todavía no has creado ninguna solicitud." : "No hay solicitudes todavía."}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {visible.map((r, i) => {
              const stage = r.stages.find(s => s.key === r.currentStage);
              return (
                <div
                  key={r.id}
                  onClick={() => navigate(`/marketing/request/${r.id}`)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "0.75rem 1.1rem", cursor: "pointer",
                    borderTop: i === 0 ? "none" : `1px solid ${MT.border}`,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = MT.surfaceAlt)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: MT.text1 }}>{r.title}</span>
                  {authedUser?.role !== "enlace" && <span style={{ fontSize: 11.5, color: MT.text3, minWidth: 140 }}>{r.requesterEmail}</span>}
                  <span style={{ fontSize: 11.5, color: MT.text3, minWidth: 90 }}>{r.assignedDisenoEmail ? disenoDisplayName(r.assignedDisenoEmail) : "Sin asignar"}</span>
                  <StatusPill
                    solid={r.status === "completed"}
                    color={r.status === "completed" ? MT.primary : stage ? ROLE_CFG[stage.role].color : MT.text2}
                    label={r.status === "completed" ? "✓ Completada" : requestStageLabel(r.currentStage)}
                  />
                  {stage?.deadline && <DeadlineBadge deadline={stage.deadline} compact />}
                  <span style={{ fontSize: 11, color: MT.text3, minWidth: 70, textAlign: "right" }}>{formatDateHuman(r.createdAt.slice(0, 10))}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
