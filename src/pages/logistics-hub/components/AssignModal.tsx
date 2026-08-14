import { useState } from "react";
import { HT, LOCATION_CFG } from "../theme";
import { useLogisticsHub } from "../context";
import type { HubOrder, HubLocation } from "../types";

const LOCATIONS: HubLocation[] = ["Belier", "Norte", "Plaza", "Colombia"];

type Step = "select" | "confirm" | "processing" | "done";

export default function AssignModal({ order, onClose }: { order: HubOrder; onClose: () => void }) {
  const { assignOrder } = useLogisticsHub();
  const [step, setStep] = useState<Step>("select");
  const [location, setLocation] = useState<HubLocation | null>(null);
  const [progressMsg, setProgressMsg] = useState("");
  const [resultShopify, setResultShopify] = useState<string | null>(null);

  const confirm = async () => {
    if (!location) return;
    setStep("processing");
    const res = await assignOrder(order.id, location, setProgressMsg);
    if (res.ok) {
      setResultShopify(res.shopifyNumber ?? null);
      setStep("done");
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={step === "processing" ? undefined : onClose} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.4)" }} />
      <div style={{
        position: "relative", width: 420, maxWidth: "92vw", background: HT.surface,
        borderRadius: HT.radiusLg, boxShadow: HT.shadowLg, padding: 26, fontFamily: HT.font,
      }}>
        {step === "select" && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: HT.text3, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Asignar orden
            </div>
            <div style={{ fontFamily: HT.mono, fontSize: 20, fontWeight: 700, color: HT.text1, marginTop: 4, marginBottom: 18 }}>
              {order.id}
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: HT.text1, marginBottom: 10 }}>
              Seleccionar ubicación de despacho
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 22 }}>
              {LOCATIONS.map((loc) => {
                const active = location === loc;
                const color = LOCATION_CFG[loc].color;
                return (
                  <button key={loc} onClick={() => setLocation(loc)} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "12px 14px",
                    borderRadius: 10, cursor: "pointer", textAlign: "left",
                    border: `1.5px solid ${active ? color : HT.border}`,
                    background: active ? `${color}0F` : HT.surface,
                    fontFamily: HT.font, fontSize: 14, fontWeight: 600, color: HT.text1,
                  }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: color }} />
                    {loc}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={onClose} style={{
                fontFamily: HT.font, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                background: "transparent", color: HT.text2, border: "none", padding: "10px 16px",
              }}>Cancelar</button>
              <button
                disabled={!location}
                onClick={() => setStep("confirm")}
                style={{
                  fontFamily: HT.font, fontSize: 13.5, fontWeight: 700, cursor: location ? "pointer" : "not-allowed",
                  background: location ? HT.primary : HT.surfaceAlt, color: location ? "#fff" : HT.text3,
                  border: "none", borderRadius: 8, padding: "10px 18px",
                }}
              >Continuar</button>
            </div>
          </>
        )}

        {step === "confirm" && location && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: HT.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 }}>
              Confirmar asignación
            </div>
            <div style={{
              background: HT.primarySoft, borderRadius: 10, padding: "14px 16px", marginBottom: 16,
            }}>
              <div style={{ fontSize: 13, color: HT.text2 }}>Esta orden será asignada a:</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: HT.primaryDark, marginTop: 2, letterSpacing: "0.01em" }}>
                {location.toUpperCase()}
              </div>
            </div>
            <div style={{ fontSize: 13.5, color: HT.text1, lineHeight: 1.5, marginBottom: 22 }}>
              ¿Confirmar que la orden <strong style={{ fontFamily: HT.mono }}>{order.id}</strong> será despachada desde <strong>{location}</strong>?
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setStep("select")} style={{
                fontFamily: HT.font, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                background: "transparent", color: HT.text2, border: "none", padding: "10px 16px",
              }}>Cancelar</button>
              <button onClick={confirm} style={{
                fontFamily: HT.font, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
                background: HT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px",
              }}>Confirmar asignación</button>
            </div>
          </>
        )}

        {step === "processing" && (
          <div style={{ textAlign: "center", padding: "24px 8px" }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%", margin: "0 auto 16px",
              border: `3px solid ${HT.primarySoft}`, borderTopColor: HT.primary,
              animation: "hub-spin 0.8s linear infinite",
            }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: HT.text1 }}>{progressMsg || "Procesando…"}</div>
            <style>{`@keyframes hub-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {step === "done" && location && (
          <div style={{ textAlign: "center", padding: "12px 8px 4px" }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%", background: HT.successSoft,
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px",
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={HT.success} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="m4 12 5 5L20 6" />
              </svg>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: HT.text1, marginBottom: 4 }}>Orden asignada correctamente</div>
            <div style={{ fontSize: 13, color: HT.text2, marginBottom: resultShopify ? 4 : 20 }}>
              {order.id} → {location}
            </div>
            {resultShopify && (
              <div style={{ fontSize: 13, color: HT.text2, marginBottom: 20 }}>
                Shopify Order #: <strong style={{ fontFamily: HT.mono, color: HT.text1 }}>{resultShopify}</strong>
              </div>
            )}
            <button onClick={onClose} style={{
              fontFamily: HT.font, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
              background: HT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px",
            }}>Cerrar</button>
          </div>
        )}
      </div>
    </div>
  );
}
