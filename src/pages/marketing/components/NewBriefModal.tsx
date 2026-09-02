import { useState } from "react";
import { MT } from "../theme";
import { useMarketing } from "../context";
import { PRODUCT_LINES, todayIso } from "../types";

export default function NewBriefModal({ onClose }: { onClose: () => void }) {
  const { createBrief, disenoEmailList } = useMarketing();
  const [reference, setReference] = useState("");
  const [productLine, setProductLine] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [briefLink, setBriefLink] = useState("");
  const [assignedDisenoEmail, setAssignedDisenoEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reference.trim()) { setError("La referencia del producto es obligatoria."); return; }
    if (!productLine) { setError("La línea de producto es obligatoria."); return; }
    setSaving(true);
    try {
      await createBrief(reference.trim(), productLine, startDate, briefLink.trim(), assignedDisenoEmail || undefined);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "No se pudo crear el brief.");
    } finally { setSaving(false); }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", fontFamily: MT.font, fontSize: 13.5, padding: "9px 11px",
    border: `1px solid ${MT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 6 };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MT.font }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(44,42,32,0.35)" }} />
      <div style={{
        position: "relative", width: 460, maxWidth: "92vw", background: MT.surface,
        borderRadius: MT.radiusLg, boxShadow: MT.shadowLg, padding: 26,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: MT.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
          Nuevo brief
        </div>
        <h3 style={{ margin: "0 0 20px", color: MT.text1, fontSize: 18 }}>Crear brief de producto</h3>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Referencia del producto</label>
            <input style={inputStyle} value={reference} onChange={e => setReference(e.target.value)} placeholder="C05-54" autoFocus required />
          </div>
          <div>
            <label style={labelStyle}>Línea de producto</label>
            <select style={inputStyle} value={productLine} onChange={e => setProductLine(e.target.value)} required>
              <option value="" disabled>Selecciona una línea...</option>
              {PRODUCT_LINES.map(line => <option key={line} value={line}>{line}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Fecha de inicio (Día 1)</label>
            <input type="date" style={inputStyle} value={startDate} onChange={e => setStartDate(e.target.value)} required />
          </div>
          <div>
            <label style={labelStyle}>Link de SharePoint del brief</label>
            <input style={inputStyle} value={briefLink} onChange={e => setBriefLink(e.target.value)} placeholder="https://formatucuerpo.sharepoint.com/..." />
          </div>
          <div>
            <label style={labelStyle}>Asignar a Diseño (opcional)</label>
            <select style={inputStyle} value={assignedDisenoEmail} onChange={e => setAssignedDisenoEmail(e.target.value)}>
              <option value="">Sin asignar — avisar a todos</option>
              {disenoEmailList.map(email => <option key={email} value={email}>{email}</option>)}
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
              background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px",
            }}>{saving ? "Creando..." : "Crear brief"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
