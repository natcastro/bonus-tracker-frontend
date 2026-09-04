import { useState } from "react";
import { MT } from "../theme";
import { useMarketing } from "../context";
import type { MarketingNotifySlot } from "../../../services/api";

const SLOTS: { slot: MarketingNotifySlot; label: string; emailPlaceholder: string; namePlaceholder: string }[] = [
  { slot: "laura",    label: "Laura",    emailPlaceholder: "laura@formatucuerpo.com",    namePlaceholder: "Laura" },
  { slot: "carol",    label: "Karol",    emailPlaceholder: "karol@formatucuerpo.com",    namePlaceholder: "Karol" },
  { slot: "diseno_1", label: "Diseño 1", emailPlaceholder: "diseno1@formatucuerpo.com",  namePlaceholder: "Nombre de la persona" },
  { slot: "diseno_2", label: "Diseño 2", emailPlaceholder: "diseno2@formatucuerpo.com",  namePlaceholder: "Nombre de la persona" },
  { slot: "diseno_3", label: "Diseño 3", emailPlaceholder: "diseno3@formatucuerpo.com",  namePlaceholder: "Nombre de la persona" },
];

export default function MarketingSettingsPanel({ onClose }: { onClose: () => void }) {
  const { notifyEmails, notifyNames, updateNotifyEntry } = useMarketing();
  const [emails, setEmails] = useState(notifyEmails);
  const [names, setNames] = useState(notifyNames);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      for (const { slot } of SLOTS) {
        await updateNotifyEntry(slot, emails[slot].trim(), names[slot].trim());
      }
      setSaved(true);
    } catch (err: any) {
      setError(err?.message ?? "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const fieldStyle: React.CSSProperties = {
    width: "100%", fontFamily: MT.font, fontSize: 13.5, padding: "9px 11px",
    border: `1px solid ${MT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MT.font }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(17,24,39,0.35)" }} />
      <div style={{
        position: "relative", width: 460, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto", background: MT.surface,
        borderRadius: MT.radiusLg, boxShadow: MT.shadowLg, padding: 26,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: MT.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
          Solo visible para ti
        </div>
        <h3 style={{ margin: "0 0 6px", color: MT.text1, fontSize: 18 }}>Correos de notificación</h3>
        <p style={{ margin: "0 0 20px", color: MT.text2, fontSize: 12.5 }}>
          A dónde llegan los avisos automáticos de Marketing, y a nombre de quién — así, cuando un
          brief queda asignado, la plataforma muestra el nombre de la persona en vez de "Diseño".
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {SLOTS.map(({ slot, label, emailPlaceholder, namePlaceholder }) => (
            <div key={slot} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: MT.text2 }}>{label}</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input
                  style={fieldStyle} value={names[slot]} placeholder={namePlaceholder}
                  onChange={e => setNames(prev => ({ ...prev, [slot]: e.target.value }))}
                />
                <input
                  style={fieldStyle} value={emails[slot]} placeholder={emailPlaceholder}
                  onChange={e => setEmails(prev => ({ ...prev, [slot]: e.target.value }))}
                />
              </div>
            </div>
          ))}
        </div>

        {error && <div style={{ fontSize: 12.5, color: MT.danger, background: MT.dangerSoft, borderRadius: 8, padding: "8px 12px", marginTop: 14 }}>{error}</div>}
        {saved && !error && <div style={{ fontSize: 12.5, color: MT.primary, background: MT.primarySoft, borderRadius: 8, padding: "8px 12px", marginTop: 14 }}>✓ Guardado</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={{
            fontFamily: MT.font, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
            background: "transparent", color: MT.text2, border: "none", padding: "10px 16px",
          }}>Cerrar</button>
          <button type="button" disabled={saving} onClick={save} style={{
            fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
            background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px",
          }}>{saving ? "Guardando..." : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}
