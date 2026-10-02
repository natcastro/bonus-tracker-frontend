import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MT } from "../theme";
import { useMarketing } from "../context";
import { useHubAccess } from "../../../auth/HubAccessContext";
import { uploadMarketingRequestFile } from "../../../services/api";

// The public entry point — reachable by anyone with a company Microsoft login, no Marketing role
// needed. Someone internal copies this page's URL (from the Solicitudes tab) and sends it to
// whoever needs to ask Diseño for something.
export default function NewRequestPage() {
  const { createRequest } = useMarketing();
  const { email, name } = useHubAccess();
  const navigate = useNavigate();
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
      for (const f of files) attachments.push(await uploadMarketingRequestFile(email, f));
      setUploading(false);
      const sharedWithEmails = sharedWith.split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
      const id = await createRequest(title.trim(), description.trim(), attachments, sharedWithEmails);
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
          Conectado como {name || email} ({email}). Cuenta qué necesitas y Diseño te la entrega — podrás revisarla y aprobarla desde esta misma página.
        </p>

        <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, padding: "1.25rem", boxShadow: MT.shadow }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 5 }}>Nombre de la solicitud</label>
          <input style={{ ...fieldStyle, marginBottom: 14 }} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Banner para evento de tienda" autoFocus />

          <label style={{ fontSize: 11.5, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 5 }}>¿Qué necesitas?</label>
          <textarea style={{ ...fieldStyle, marginBottom: 14, resize: "vertical" }} rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe lo que necesitas, tamaños, fecha de uso, etc." />

          <label style={{ fontSize: 11.5, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 5 }}>Archivos o referencias (opcional)</label>
          <input type="file" multiple style={{ ...fieldStyle, marginBottom: 14, padding: "6px" }} onChange={e => setFiles(Array.from(e.target.files ?? []))} />

          <label style={{ fontSize: 11.5, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 5 }}>Compartir con (opcional — otros correos @formatucuerpo.com, separados por coma)</label>
          <input style={{ ...fieldStyle, marginBottom: 18 }} value={sharedWith} onChange={e => setSharedWith(e.target.value)} placeholder="colega@formatucuerpo.com" />

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
