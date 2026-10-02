import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MT } from "../theme";
import { useMarketing } from "../context";
import { useHubAccess } from "../../../auth/HubAccessContext";
import { uploadMarketingRequestFile } from "../../../services/api";
import { TODO_TASK_TYPES, todayIso } from "../types";

// The public entry point — reachable by anyone with a company Microsoft login, no Marketing role
// needed. Someone internal copies this page's URL (from the Solicitudes tab) and sends it to
// whoever needs to ask Diseño for something.
export default function NewRequestPage() {
  const { createRequest, disenoEmailList, disenoDisplayName } = useMarketing();
  const { email, name } = useHubAccess();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [taskType, setTaskType] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [assignedDisenoEmail, setAssignedDisenoEmail] = useState("");
  const [sharedWith, setSharedWith] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isOtro = taskType === "Otro";
  const title = isOtro ? customTitle.trim() : (taskType ?? "");

  const filteredTypes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TODO_TASK_TYPES;
    return TODO_TASK_TYPES.filter(t => t.toLowerCase().includes(q));
  }, [query]);

  const fieldStyle: React.CSSProperties = {
    width: "100%", fontFamily: MT.font, fontSize: 13.5, padding: "9px 11px",
    border: `1px solid ${MT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 5 };

  const submit = async () => {
    if (!taskType) { setError("Selecciona el tipo de solicitud."); return; }
    if (isOtro && !customTitle.trim()) { setError("Escribe cómo se llama la solicitud."); return; }
    if (!description.trim()) { setError("Explica qué necesitas."); return; }
    setBusy(true); setError("");
    try {
      setUploading(true);
      const attachments: string[] = [];
      for (const f of files) attachments.push(await uploadMarketingRequestFile(email, f));
      setUploading(false);
      const sharedWithEmails = sharedWith.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
      const id = await createRequest({
        taskType, title, description: description.trim(), attachments, sharedWithEmails,
        startDate, assignedDisenoEmail: assignedDisenoEmail || undefined,
      });
      navigate(`/marketing/request/${id}`);
    } catch (err: any) {
      setError(err?.message ?? "No se pudo crear la solicitud.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: MT.bg, fontFamily: MT.font }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "2.5rem 1.5rem" }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 21, fontWeight: 800, color: MT.text1 }}>Nueva solicitud a Diseño</h1>
        <p style={{ margin: "0 0 1.5rem", fontSize: 13, color: MT.text2 }}>
          Cuenta qué necesitas y Diseño te la entrega — podrás revisarla y aprobarla desde esta misma página.
        </p>

        <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, padding: "1.25rem", boxShadow: MT.shadow }}>
          <div style={{ position: "relative", marginBottom: 14 }}>
            <label style={labelStyle}>Nombre de la solicitud</label>
            <input
              style={fieldStyle}
              value={taskType ? (isOtro ? "Otro" : taskType) : query}
              onChange={e => { setQuery(e.target.value); setTaskType(null); setShowOptions(true); }}
              onFocus={() => setShowOptions(true)}
              placeholder="Escribe para buscar..."
              autoFocus
            />
            {showOptions && !taskType && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 10,
                background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: 8, boxShadow: MT.shadowLg,
                maxHeight: 220, overflowY: "auto",
              }}>
                {filteredTypes.length === 0 ? (
                  <div style={{ padding: "10px 12px", fontSize: 12.5, color: MT.text3 }}>Sin resultados — elige "Otro" y describe la solicitud.</div>
                ) : (
                  filteredTypes.map(t => (
                    <div
                      key={t}
                      onClick={() => { setTaskType(t); setQuery(t); setShowOptions(false); }}
                      style={{ padding: "9px 12px", fontSize: 13, color: MT.text1, cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget.style.background = MT.surfaceAlt)}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >{t}</div>
                  ))
                )}
              </div>
            )}
          </div>

          {isOtro && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>¿Cómo se llama la solicitud?</label>
              <input style={fieldStyle} value={customTitle} onChange={e => setCustomTitle(e.target.value)} placeholder="Describe la solicitud..." />
            </div>
          )}

          <label style={labelStyle}>¿Qué necesitas?</label>
          <textarea style={{ ...fieldStyle, marginBottom: 14, resize: "vertical" }} rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe lo que necesitas, tamaños, fecha de uso, etc." />

          <label style={labelStyle}>¿Cuándo necesitas que se empiece?</label>
          <input type="date" style={{ ...fieldStyle, marginBottom: 14 }} value={startDate} onChange={e => setStartDate(e.target.value)} />

          <label style={labelStyle}>¿A quién se asignaría?</label>
          <select style={{ ...fieldStyle, marginBottom: 14 }} value={assignedDisenoEmail} onChange={e => setAssignedDisenoEmail(e.target.value)}>
            <option value="">No sé — que decida Karol</option>
            {disenoEmailList.map(em => <option key={em} value={em}>{disenoDisplayName(em)}</option>)}
          </select>

          <label style={labelStyle}>Archivos o referencias (opcional)</label>
          <input type="file" multiple style={{ ...fieldStyle, marginBottom: 14, padding: "6px" }} onChange={e => setFiles(Array.from(e.target.files ?? []))} />

          <label style={labelStyle}>Compartir con (opcional — otros correos @formatucuerpo.com, separados por coma)</label>
          <input style={{ ...fieldStyle, marginBottom: 14 }} value={sharedWith} onChange={e => setSharedWith(e.target.value)} placeholder="colega@formatucuerpo.com" />

          <label style={labelStyle}>Tu correo electrónico</label>
          <input style={{ ...fieldStyle, marginBottom: 18, color: MT.text2, background: MT.surfaceAlt }} value={name && name !== email ? `${name} — ${email}` : email} disabled readOnly />

          {error && <p style={{ color: MT.danger, fontSize: 12.5, marginBottom: 12 }}>{error}</p>}

          <button onClick={submit} disabled={busy} style={{
            fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
            background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", width: "100%",
          }}>{uploading ? "Subiendo archivos..." : busy ? "Creando..." : "Enviar solicitud"}</button>
        </div>
      </div>
    </div>
  );
}
