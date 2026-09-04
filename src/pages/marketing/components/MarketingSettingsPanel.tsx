import { useEffect, useState } from "react";
import { MT } from "../theme";
import { useMarketing } from "../context";
import { getMarketingAccessDirectory } from "../../../services/api";
import type { MarketingAccessPerson, MarketingNotifyEmails, MarketingNotifySlot } from "../../../services/api";

const SLOTS: { slot: MarketingNotifySlot; label: string; role: MarketingAccessPerson["role"] }[] = [
  { slot: "laura",    label: "Laura",    role: "admin" },
  { slot: "carol",    label: "Karol",    role: "carol" },
  { slot: "diseno_1", label: "Diseño 1", role: "staff" },
  { slot: "diseno_2", label: "Diseño 2", role: "staff" },
  { slot: "diseno_3", label: "Diseño 3", role: "staff" },
];

export default function MarketingSettingsPanel({ onClose }: { onClose: () => void }) {
  const { notifyEmails, updateNotifyEmail } = useMarketing();
  const [emails, setEmails] = useState<MarketingNotifyEmails>(notifyEmails);
  const [people, setPeople] = useState<MarketingAccessPerson[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getMarketingAccessDirectory().then(setPeople).catch(() => {}).finally(() => setLoadingPeople(false));
  }, []);

  const save = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      for (const { slot } of SLOTS) {
        await updateNotifyEmail(slot, emails[slot].trim());
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
        position: "relative", width: 420, maxWidth: "92vw", background: MT.surface,
        borderRadius: MT.radiusLg, boxShadow: MT.shadowLg, padding: 26,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: MT.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
          Solo visible para ti
        </div>
        <h3 style={{ margin: "0 0 6px", color: MT.text1, fontSize: 18 }}>Correos de notificación</h3>
        <p style={{ margin: "0 0 20px", color: MT.text2, fontSize: 12.5 }}>
          A dónde llegan los avisos automáticos de Marketing — elige entre las personas que ya
          tienen acceso a Marketing en Accesos del Hub.
        </p>

        {loadingPeople ? (
          <p style={{ fontSize: 12.5, color: MT.text3 }}>Cargando personas...</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {SLOTS.map(({ slot, label, role }) => {
              const options = people.filter(p => p.role === role);
              const current = emails[slot];
              const currentKnown = options.some(p => p.email === current);
              return (
                <div key={slot}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 6 }}>{label}</label>
                  <select
                    style={fieldStyle} value={current}
                    onChange={e => setEmails(prev => ({ ...prev, [slot]: e.target.value }))}
                  >
                    <option value="">Sin asignar</option>
                    {!currentKnown && current && <option value={current}>{current} (no asignado en Accesos)</option>}
                    {options.map(p => <option key={p.email} value={p.email}>{p.nickname || p.email}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        )}

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
