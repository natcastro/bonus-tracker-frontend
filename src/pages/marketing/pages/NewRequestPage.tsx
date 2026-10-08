import SpecificNotice from "../components/SpecificNotice";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MT } from "../theme";
import { useMarketing } from "../context";
import { useHubAccess } from "../../../auth/HubAccessContext";
import { uploadMarketingRequestFile } from "../../../services/api";
import { todayIso } from "../types";
import TaskCategoryFields, { EMPTY_TASK_CATEGORY_STATE, taskCategoryIsComplete, taskCategoryTitle, taskCategoryDetailsBlock } from "../components/TaskCategoryFields";
import type { TaskCategoryState } from "../components/TaskCategoryFields";
import DisenoAssigneePicker from "../components/DisenoAssigneePicker";

// The public entry point — reachable by anyone with a company Microsoft login, no Marketing role
// needed. Someone internal copies this page's URL (from the Solicitudes tab) and sends it to
// whoever needs to ask Diseño for something.
export default function NewRequestPage() {
  const { createRequest, disenoEmailList, disenoDisplayName, disenoCountry } = useMarketing();
  const { email, name } = useHubAccess();
  const navigate = useNavigate();
  const [cat, setCat] = useState<TaskCategoryState>(EMPTY_TASK_CATEGORY_STATE);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState(todayIso());
  const [assignedDisenoEmail, setAssignedDisenoEmail] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdId, setCreatedId] = useState<number | null>(null);

  // Prefill from the Microsoft login's display name — still editable, since a split on the first
  // space doesn't always land right for compound surnames.
  useEffect(() => {
    if (name && name !== email && !nombre && !apellido) {
      const parts = name.trim().split(/\s+/);
      setNombre(parts[0] ?? "");
      setApellido(parts.slice(1).join(" "));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, email]);

  const fieldStyle: React.CSSProperties = {
    width: "100%", fontFamily: MT.font, fontSize: 13.5, padding: "9px 11px",
    border: `1px solid ${MT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 5 };

  const submit = async () => {
    if (!nombre.trim() || !apellido.trim()) { setError("Escribe tu nombre y apellido."); return; }
    if (!taskCategoryIsComplete(cat)) { setError("Selecciona la categoría y el tipo de pieza."); return; }
    if (!description.trim()) { setError("Explica qué necesitas."); return; }
    if (!assignedDisenoEmail) { setError("Selecciona a quién se le hace la solicitud."); return; }
    setBusy(true); setError("");
    try {
      setUploading(true);
      const attachments: string[] = [];
      for (const f of files) attachments.push(await uploadMarketingRequestFile(email, f));
      setUploading(false);
      const title = taskCategoryTitle(cat);
      const taskType = cat.category === "videos" ? "Video" : (cat.selectedType ?? "");
      const identityBlock = `Nombre: ${nombre.trim()} ${apellido.trim()}`;
      const detailsBlock = taskCategoryDetailsBlock(cat);
      const fullDescription = [identityBlock, detailsBlock, description.trim()].filter(Boolean).join("\n—\n");
      const id = await createRequest({
        taskType, title, description: fullDescription, attachments, sharedWithEmails: [],
        deadline, assignedDisenoEmail,
      });
      setCreatedId(id);
    } catch (err: any) {
      setError(err?.message ?? "No se pudo crear la solicitud.");
    } finally {
      setBusy(false);
    }
  };

  if (createdId !== null) {
    return (
      <div style={{ minHeight: "100vh", background: MT.bg, fontFamily: MT.font, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 520, margin: "0 auto", padding: "2.5rem 1.5rem" }}>
          <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, padding: "2rem", boxShadow: MT.shadow, textAlign: "center" }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>✅</div>
            <h1 style={{ margin: "0 0 10px", fontSize: 19, fontWeight: 800, color: MT.text1 }}>Tu solicitud ha sido enviada</h1>
            <p style={{ margin: "0 0 14px", fontSize: 13.5, color: MT.text2, lineHeight: 1.6 }}>
              Diseño ya fue notificado y empezará a trabajar en ella. Te estaremos escribiendo por correo
              con cada avance, siempre con un enlace para que puedas hacer seguimiento al progreso y
              aprobar o pedir ajustes cuando llegue el momento.
            </p>
            <p style={{ margin: "0 0 20px", fontSize: 12.5, color: MT.text3, lineHeight: 1.6 }}>
              Por favor permanece atento a tu correo durante el proceso — si no respondes a los correos
              de seguimiento en los días indicados, tu solicitud podría quedar en pausa o cancelarse por
              falta de respuesta.
            </p>
            <button onClick={() => navigate(`/marketing/request/${createdId}`)} style={{
              fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
              background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", width: "100%",
            }}>Ver el seguimiento de mi solicitud</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: MT.bg, fontFamily: MT.font }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "2.5rem 1.5rem" }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 21, fontWeight: 800, color: MT.text1 }}>Nueva solicitud a Diseño</h1>
        <p style={{ margin: "0 0 1.5rem", fontSize: 13, color: MT.text2 }}>
          Cuenta qué necesitas y Diseño te la entrega — podrás revisarla y aprobarla desde esta misma página.
        </p>

        <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, padding: "1.25rem", boxShadow: MT.shadow }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Nombre</label>
              <input style={fieldStyle} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre" autoComplete="off" autoFocus />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Apellido</label>
              <input style={fieldStyle} value={apellido} onChange={e => setApellido(e.target.value)} placeholder="Apellido" autoComplete="off" />
            </div>
          </div>

          <label style={labelStyle}>Correo electrónico corporativo</label>
          <input style={{ ...fieldStyle, marginBottom: 14, color: MT.text2, background: MT.surfaceAlt }} value={name && name !== email ? `${name} — ${email}` : email} disabled readOnly />

          <div style={{ marginBottom: 14 }}>
            <TaskCategoryFields state={cat} onChange={setCat} />
          </div>

          <label style={labelStyle}>Descripción del pedido</label>
          <SpecificNotice />
          <textarea style={{ ...fieldStyle, marginBottom: 14, resize: "vertical" }} rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe lo que necesitas: medidas, textos, colores, referencias..." />

          <label style={labelStyle}>¿Para cuándo necesitas esto? (fecha límite)</label>
          <input type="date" style={{ ...fieldStyle, marginBottom: 14 }} value={deadline} onChange={e => setDeadline(e.target.value)} />

          <label style={labelStyle}>¿A quién se le hace la solicitud?</label>
          <div style={{ marginBottom: 14 }}>
            <DisenoAssigneePicker
              value={assignedDisenoEmail} onChange={setAssignedDisenoEmail}
              options={disenoEmailList} disenoDisplayName={disenoDisplayName} disenoCountry={disenoCountry}
            />
          </div>

          <label style={labelStyle}>Archivos o referencias (opcional)</label>
          <input type="file" multiple style={{ ...fieldStyle, marginBottom: 18, padding: "6px" }} onChange={e => setFiles(Array.from(e.target.files ?? []))} />

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
