import SpecificNotice from "./SpecificNotice";
import { useState } from "react";
import { MT } from "../theme";
import { useMarketing } from "../context";
import TaskCategoryFields, { EMPTY_TASK_CATEGORY_STATE, taskCategoryIsComplete, taskCategoryTitle, taskCategoryDetailsBlock } from "./TaskCategoryFields";
import type { TaskCategoryState } from "./TaskCategoryFields";
import DisenoAssigneePicker from "./DisenoAssigneePicker";

export default function NewTodoTaskModal({ onClose }: { onClose: () => void }) {
  const { createTodoTask, disenoEmailList, videoEmailList, disenoDisplayName, disenoCountry } = useMarketing();
  const [cat, setCatState] = useState<TaskCategoryState>(EMPTY_TASK_CATEGORY_STATE);
  const [description, setDescription] = useState("");
  // Switching between Video and the other categories changes who can receive the task, so the pick is cleared.
  const setCat = (next: TaskCategoryState) => { if ((next.category === "videos") !== (cat.category === "videos")) setAssignedEmail(""); setCatState(next); };
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
    if (!assignedEmail) { setError(cat.category === "videos" ? "Asigna la tarea a alguien de Video." : "Asigna la tarea a alguien de Diseño."); return; }
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
    <div>
        <p style={{ margin: "0 0 12px", color: MT.text2, fontSize: 13, fontWeight: 600 }}>Selecciona a continuación el tipo de arte a realizar</p>

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
            {/* Diseño and Video people share one list; the ones that can't take this kind of task are greyed out. */}
            <DisenoAssigneePicker
              value={assignedEmail} onChange={setAssignedEmail}
              options={[...disenoEmailList, ...videoEmailList]}
              disabledEmails={cat.category === "videos" ? disenoEmailList : videoEmailList}
              tags={Object.fromEntries(videoEmailList.map(e => [e, "VIDEO"]))}
              placeholder={cat.category === "videos" ? "Selecciona a alguien de Video..." : "Selecciona a alguien de Diseño..."}
              disenoDisplayName={disenoDisplayName} disenoCountry={disenoCountry}
            />
            {cat.category === "videos" && videoEmailList.length === 0 && <p style={{ fontSize: 12, color: MT.text3, margin: "6px 0 0" }}>Todavía no hay personas con el rol Video. Un administrador las agrega en Accesos (Marketing → Video).</p>}
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
  );
}
