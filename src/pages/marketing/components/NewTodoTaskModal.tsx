import { useMemo, useState } from "react";
import { MT } from "../theme";
import { useMarketing } from "../context";
import { TODO_TASK_TYPES } from "../types";

export default function NewTodoTaskModal({ onClose }: { onClose: () => void }) {
  const { createTodoTask, disenoEmailList, disenoDisplayName } = useMarketing();
  const [query, setQuery] = useState("");
  const [taskType, setTaskType] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [description, setDescription] = useState("");
  const [emailNote, setEmailNote] = useState("");
  const [assignedEmail, setAssignedEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filteredTypes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TODO_TASK_TYPES;
    return TODO_TASK_TYPES.filter(t => t.toLowerCase().includes(q));
  }, [query]);

  const isOtro = taskType === "Otro";
  const title = isOtro ? customTitle.trim() : (taskType ?? "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskType) { setError("Selecciona el tipo de tarea."); return; }
    if (isOtro && !customTitle.trim()) { setError("Escribe cómo se llama la tarea."); return; }
    if (!assignedEmail) { setError("Asigna la tarea a alguien de Diseño."); return; }
    setSaving(true);
    setError("");
    try {
      await createTodoTask(taskType, title, description.trim(), assignedEmail, emailNote.trim() || undefined);
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
      <div style={{ position: "relative", width: 460, maxWidth: "92vw", background: MT.surface, borderRadius: MT.radiusLg, boxShadow: MT.shadowLg, padding: 26 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: MT.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
          Nueva tarea (To Do)
        </div>
        <h3 style={{ margin: "0 0 14px", color: MT.text1, fontSize: 18 }}>Selecciona a continuación el tipo de arte a realizar</h3>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ position: "relative" }}>
            <label style={labelStyle}>Tipo de tarea</label>
            <input
              style={inputStyle}
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
                  <div style={{ padding: "10px 12px", fontSize: 12.5, color: MT.text3 }}>Sin resultados — elige "Otro" y describe la tarea.</div>
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
            <div>
              <label style={labelStyle}>¿Cómo se llama la tarea?</label>
              <input style={inputStyle} value={customTitle} onChange={e => setCustomTitle(e.target.value)} placeholder="Describe la tarea..." required />
            </div>
          )}

          <div>
            <label style={labelStyle}>Descripción de la tarea</label>
            <textarea
              style={{ ...inputStyle, resize: "vertical", minHeight: 64 }}
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Detalles de lo que necesitas..."
            />
          </div>

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
            <select style={inputStyle} value={assignedEmail} onChange={e => setAssignedEmail(e.target.value)} required>
              <option value="" disabled>Selecciona a alguien de Diseño...</option>
              {disenoEmailList.map(email => <option key={email} value={email}>{disenoDisplayName(email)}</option>)}
            </select>
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
