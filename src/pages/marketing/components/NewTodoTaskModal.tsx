import SpecificNotice from "./SpecificNotice";
import { useState } from "react";
import { MT } from "../theme";
import { useMarketing } from "../context";
import TaskCategoryFields, { EMPTY_TASK_CATEGORY_STATE, taskCategoryIsComplete, taskCategoryTitle, taskCategoryDetailsBlock } from "./TaskCategoryFields";
import type { TaskCategoryState } from "./TaskCategoryFields";
import DisenoAssigneePicker from "./DisenoAssigneePicker";

export default function NewTodoTaskModal({ onClose }: { onClose: () => void }) {
  const { createTodoTask, disenoEmailList, disenoDisplayName, disenoCountry } = useMarketing();
  const [cat, setCat] = useState<TaskCategoryState>(EMPTY_TASK_CATEGORY_STATE);
  const [description, setDescription] = useState("");
  const [emailNote, setEmailNote] = useState("");
  const [assignedEmail, setAssignedEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskCategoryIsComplete(cat)) {
      setError(cat.category === "videos" ? "Completa el propósito y la descripción detallada del video (y la plataforma si elegiste Otro)." : "Selecciona la categoría y el tipo de pieza.");
      return;
    }
    if (!assignedEmail) { setError("Asigna la tarea a alguien de Diseño."); return; }
    const title = taskCategoryTitle(cat);
    const detailsBlock = taskCategoryDetailsBlock(cat);
    const fullDescription = [detailsBlock, description.trim()].filter(Boolean).join("\n—\n");
    const taskType = cat.category === "videos" ? "Video" : (cat.selectedType ?? "");
    setSaving(true);
    setError("");
    try {
      await createTodoTask(taskType, title, fullDescription, assignedEmail, emailNote.trim() || undefined);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "No se pudo crear la tarea.");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", fontFamily: MT.font, fontSize: 13.5, padding: "9px 11px",
    border: `1px solid ${MT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 6 };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MT.font }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(44,42,32,0.35)" }} />
      <div style={{ position: "relative", width: 460, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto", background: MT.surface, borderRadius: MT.radiusLg, boxShadow: MT.shadowLg, padding: 26 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: MT.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
          Nueva tarea (To Do)
        </div>
        <h3 style={{ margin: "0 0 14px", color: MT.text1, fontSize: 18 }}>Selecciona a continuación el tipo de arte a realizar</h3>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <TaskCategoryFields state={cat} onChange={setCat} />

          {cat.category !== "videos" && (
          <div>
            <label style={labelStyle}>Descripción de la tarea</label>
            <SpecificNotice />
            <textarea
              style={{ ...inputStyle, resize: "vertical", minHeight: 64 }}
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Detalles de lo que necesitas: medidas, textos, colores, referencias..."
            />
          </div>
          )}

          <div>
            <label style={labelStyle}>Mensaje adicional para el correo (opcional)</label>
            <textarea
              style={{ ...inputStyle, resize: "vertical", minHeight: 50 }}
              value={emailNote} onChange={e => setEmailNote(e.target.value)}
              placeholder="Algo que quieras que la persona vea en el correo..."
            />
          </div>

          <div>
            <label style={labelStyle}>Asignar a</label>
            <DisenoAssigneePicker
              value={assignedEmail} onChange={setAssignedEmail}
              options={disenoEmailList} disenoDisplayName={disenoDisplayName} disenoCountry={disenoCountry}
            />
          </div>

          {error && <div style={{ fontSize: 12.5, color: MT.danger, background: MT.dangerSoft, borderRadius: 8, padding: "8px 12px" }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
            <button type="button" onClick={onClose} style={{
              fontFamily: MT.font, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
              background: "transparent", color: MT.text2, border: "none", padding: "10px 16px",
            }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{
              fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
              background: MT.clay, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px",
            }}>{saving ? "Creando..." : "Asignar tarea"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
