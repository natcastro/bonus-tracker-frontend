import { useState } from "react";
import { HT } from "../theme";
import { useLogisticsHub } from "../context";
import type { HubOrder } from "../types";

export default function DocsModal({ order, onClose }: { order: HubOrder; onClose: () => void }) {
  const { saveLabelUrl, saveInvoiceManual } = useLogisticsHub();
  const [url, setUrl] = useState(order.labelUrl ?? "");
  const [savedLabel, setSavedLabel] = useState(order.labelStatus === "ready");
  const [savedInvoice, setSavedInvoice] = useState(order.invoiceStatus === "ready");

  const needsInvoice = order.invoiceStatus !== "ready";
  const needsLabel = order.labelStatus !== "ready";

  const isAmazon = order.platform === "amazon";

  const handleSaveLabel = () => {
    if (!url.trim()) return;
    saveLabelUrl(order.id, url.trim());
    setSavedLabel(true);
  };

  const handleUploadLabel = () => {
    saveLabelUrl(order.id, `https://amazon-docs.internal/${order.id}.pdf`);
    setSavedLabel(true);
  };

  const handleSaveInvoice = () => {
    saveInvoiceManual(order.id);
    setSavedInvoice(true);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.4)" }} />
      <div style={{
        position: "relative", width: 420, maxWidth: "92vw", background: HT.surface,
        borderRadius: HT.radiusLg, boxShadow: HT.shadowLg, padding: 26, fontFamily: HT.font,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: HT.text3, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Gestionar documentos
        </div>
        <div style={{ fontFamily: HT.mono, fontSize: 19, fontWeight: 700, color: HT.text1, marginTop: 4, marginBottom: 20 }}>
          {order.id}
          {order.location === "Colombia" && (
            <span style={{ fontFamily: HT.font, fontSize: 12, fontWeight: 600, color: HT.warn, marginLeft: 10 }}>
              Colombia — proceso manual
            </span>
          )}
        </div>

        {needsInvoice && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: HT.text1, marginBottom: 8 }}>Factura</div>
            {savedInvoice ? (
              <div style={{ fontSize: 13, color: HT.success, fontWeight: 600 }}>✓ Factura cargada</div>
            ) : (
              <button onClick={handleSaveInvoice} style={{
                fontFamily: HT.font, fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: HT.surfaceAlt, color: HT.text1, border: `1px dashed ${HT.borderStrong}`,
                borderRadius: 8, padding: "10px 14px", width: "100%",
              }}>Subir factura manual (PDF)</button>
            )}
          </div>
        )}

        {needsLabel && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: HT.text1, marginBottom: 8 }}>
              {isAmazon ? "Documento / Label (Amazon)" : "Shipping Label URL"}
            </div>
            {savedLabel ? (
              <div style={{ fontSize: 13, color: HT.success, fontWeight: 600 }}>✓ Label guardado</div>
            ) : isAmazon ? (
              <button onClick={handleUploadLabel} style={{
                fontFamily: HT.font, fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: HT.surfaceAlt, color: HT.text1, border: `1px dashed ${HT.borderStrong}`,
                borderRadius: 8, padding: "10px 14px", width: "100%",
              }}>Subir documento (PDF)</button>
            ) : (
              <>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://ship.pirateship.com/labels/…"
                  style={{
                    width: "100%", fontFamily: HT.font, fontSize: 13, padding: "10px 12px",
                    border: `1px solid ${HT.border}`, borderRadius: 8, outline: "none", marginBottom: 8, boxSizing: "border-box",
                  }}
                />
                <button onClick={handleSaveLabel} disabled={!url.trim()} style={{
                  fontFamily: HT.font, fontSize: 13, fontWeight: 700, cursor: url.trim() ? "pointer" : "not-allowed",
                  background: url.trim() ? HT.primary : HT.surfaceAlt, color: url.trim() ? "#fff" : HT.text3,
                  border: "none", borderRadius: 8, padding: "9px 16px",
                }}>Guardar Label</button>
              </>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            fontFamily: HT.font, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
            background: HT.text1, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px",
          }}>Listo</button>
        </div>
      </div>
    </div>
  );
}
