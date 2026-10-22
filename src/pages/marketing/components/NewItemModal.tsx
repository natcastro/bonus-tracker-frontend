import { useState } from "react";
import { MT } from "../theme";
import { useMarketing } from "../context";
import NewBriefModal from "./NewBriefModal";
import NewTodoTaskModal from "./NewTodoTaskModal";

type Tab = "brief" | "todo" | "privada";

// One "+ Nuevo" for everything: Brief, To Do and Tarea privada live in tabs of the same window, so there are no
// separate buttons per kind. Which tabs show depends on the role (Laura: Brief + To Do, Karol: all three, Diseño/Video: private only).
export default function NewItemModal({ onClose }: { onClose: () => void }) {
  const { authedUser, createPrivateTask } = useMarketing();
  const role = authedUser?.role;
  const tabs: { key: Tab; label: string }[] = [
    ...(role === "laura" || role === "carol" ? [{ key: "brief" as Tab, label: "Brief" }, { key: "todo" as Tab, label: "To Do" }] : []),
    ...(role !== "laura" ? [{ key: "privada" as Tab, label: "Tarea privada" }] : []),
  ];
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? "privada");

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MT.font }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(44,42,32,0.35)" }} />
      <div style={{ position: "relative", width: 480, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto", background: MT.surface, borderRadius: MT.radiusLg, boxShadow: MT.shadowLg, padding: 26 }}>
        <h3 style={{ margin: "0 0 14px", color: MT.text1, fontSize: 19, fontWeight: 800 }}>Nuevo</h3>

        {tabs.length > 1 && (
          <div role="tablist" style={{ display: "flex", gap: 6, marginBottom: 18, background: MT.surfaceAlt, borderRadius: 8, padding: 3 }}>
            {tabs.map(t => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} type="button" onClick={() => setTab(t.key)} style={{
                flex: 1, fontFamily: MT.font, fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: "8px 10px", borderRadius: 6, border: "none",
                background: tab === t.key ? MT.surface : "transparent", color: tab === t.key ? MT.text1 : MT.text2, boxShadow: tab === t.key ? MT.shadow : "none",
              }}>{t.label}</button>
            ))}
          </div>
        )}

        {tab === "brief" && <NewBriefModal forReview={role === "carol"} onClose={onClose} />}
        {tab === "todo" && <NewTodoTaskModal onClose={onClose} />}
        {tab === "privada" && <PrivateTaskForm onClose={onClose} onCreate={createPrivateTask} />}
      </div>
    </div>
  );
}

// A personal to-do only its owner (and the admin) can see.
function PrivateTaskForm({ onClose, onCreate }: { onClose: () => void; onCreate: (title: string, dueAt: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const field: React.CSSProperties = { width: "100%", fontFamily: MT.font, fontSize: 13.5, padding: "9px 11px", border: `1px solid ${MT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box" };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 6 };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !due) { setError("Escribe qué tienes que hacer y para cuándo."); return; }
    setSaving(true); setError("");
    try { await onCreate(title.trim(), new Date(due).toISOString()); onClose(); }
    catch (err: any) { setError(err?.message ?? "No se pudo guardar."); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: MT.text3 }}>Solo tú la ves (y los administradores). No se avisa a nadie.</p>
      <div>
        <label style={label}>Qué tienes que hacer</label>
        <input autoFocus style={field} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Revisar catálogo de octubre" />
      </div>
      <div>
        <label style={label}>Para cuándo</label>
        <input type="datetime-local" style={field} value={due} onChange={e => setDue(e.target.value)} />
      </div>
      {error && <div style={{ fontSize: 12.5, color: MT.danger, background: MT.dangerSoft, borderRadius: 8, padding: "8px 12px" }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" onClick={onClose} style={{ fontFamily: MT.font, fontSize: 13.5, fontWeight: 600, cursor: "pointer", background: "transparent", color: MT.text2, border: "none", padding: "10px 16px" }}>Cancelar</button>
        <button type="submit" disabled={saving} style={{ fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", background: MT.moss, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px" }}>{saving ? "Guardando..." : "Guardar"}</button>
      </div>
    </form>
  );
}
