import { useMemo, useState } from "react";
import { HT, PLATFORM_CFG } from "../theme";
import { useLogisticsHub } from "../context";
import { PRODUCT_CATALOG } from "../mockData";
import type { Platform } from "../types";

const PLATFORMS: Platform[] = ["tiktok", "amazon", "shopify"];

function todayLocal(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

export default function ManualOrderModal({ onClose }: { onClose: () => void }) {
  const { addManualOrder } = useLogisticsHub();
  const [platform, setPlatform] = useState<Platform>("tiktok");
  const [orderId, setOrderId] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState(1);
  const [date, setDate] = useState(todayLocal());
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState("");

  const suggestions = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    return PRODUCT_CATALOG.filter(
      (p) => p.product.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    ).slice(0, 5);
  }, [productQuery]);

  const selectProduct = (p: { product: string; sku: string }) => {
    setProductQuery(p.product);
    setSku(p.sku);
    setShowSuggestions(false);
  };

  const canSave = orderId.trim() && productQuery.trim() && sku.trim() && date && qty > 0;

  const save = () => {
    if (!canSave) return;
    const res = addManualOrder({
      platform, orderId: orderId.trim().toUpperCase(), product: productQuery.trim(),
      sku: sku.trim(), qty, createdAt: `${date}T12:00:00`,
    });
    if (!res.ok) { setError(res.error ?? "No se pudo agregar."); return; }
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.4)" }} />
      <div style={{
        position: "relative", width: 440, maxWidth: "92vw", background: HT.surface,
        borderRadius: HT.radiusLg, boxShadow: HT.shadowLg, padding: 26, fontFamily: HT.font,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: HT.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
          Agregar orden manualmente
        </div>
        <div style={{ fontSize: 12.5, color: HT.text2, marginBottom: 20, lineHeight: 1.5 }}>
          Úsalo cuando la integración con la plataforma no trajo la orden automáticamente.
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: HT.text3, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
            Plataforma
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {PLATFORMS.map((p) => (
              <button key={p} onClick={() => setPlatform(p)} style={{
                fontFamily: HT.font, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                padding: "7px 14px", borderRadius: 999,
                background: platform === p ? PLATFORM_CFG[p].bg : HT.surfaceAlt,
                color: platform === p ? PLATFORM_CFG[p].fg : HT.text2,
                border: platform === p ? `1px solid ${PLATFORM_CFG[p].fg}33` : "1px solid transparent",
              }}>{PLATFORM_CFG[p].label}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: HT.text2, display: "block", marginBottom: 6 }}>
            Número de orden
          </label>
          <input
            value={orderId} onChange={(e) => setOrderId(e.target.value)}
            placeholder="TT-45900"
            style={{
              width: "100%", fontFamily: HT.mono, fontSize: 13.5, padding: "10px 12px",
              border: `1px solid ${HT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: 14, position: "relative" }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: HT.text2, display: "block", marginBottom: 6 }}>
            Producto
          </label>
          <input
            value={productQuery}
            onChange={(e) => { setProductQuery(e.target.value); setSku(""); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Empieza a escribir el nombre o SKU…"
            style={{
              width: "100%", fontFamily: HT.font, fontSize: 13.5, padding: "10px 12px",
              border: `1px solid ${HT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box",
            }}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
              background: HT.surface, border: `1px solid ${HT.border}`, borderRadius: 8,
              boxShadow: HT.shadowLg, zIndex: 10, overflow: "hidden",
            }}>
              {suggestions.map((p) => (
                <button key={p.sku} onMouseDown={() => selectProduct(p)} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%",
                  padding: "9px 12px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
                }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = HT.surfaceAlt)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ fontFamily: HT.font, fontSize: 13, color: HT.text1 }}>{p.product}</span>
                  <span style={{ fontFamily: HT.mono, fontSize: 11.5, color: HT.text3 }}>{p.sku}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: HT.text2, display: "block", marginBottom: 6 }}>SKU</label>
            <input
              value={sku} onChange={(e) => setSku(e.target.value)}
              placeholder="FTC-…"
              style={{
                width: "100%", fontFamily: HT.mono, fontSize: 13, padding: "10px 12px",
                border: `1px solid ${HT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ width: 76 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: HT.text2, display: "block", marginBottom: 6 }}>Cant.</label>
            <input
              type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
              style={{
                width: "100%", fontFamily: HT.font, fontSize: 13.5, padding: "10px 12px",
                border: `1px solid ${HT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: HT.text2, display: "block", marginBottom: 6 }}>Fecha de compra</label>
            <input
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              style={{
                width: "100%", fontFamily: HT.font, fontSize: 13, padding: "10px 12px",
                border: `1px solid ${HT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        {error && (
          <div style={{ fontSize: 12.5, color: HT.danger, background: HT.dangerSoft, borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{
            fontFamily: HT.font, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
            background: "transparent", color: HT.text2, border: "none", padding: "10px 16px",
          }}>Cancelar</button>
          <button onClick={save} disabled={!canSave} style={{
            fontFamily: HT.font, fontSize: 13.5, fontWeight: 700, cursor: canSave ? "pointer" : "not-allowed",
            background: canSave ? HT.primary : HT.surfaceAlt, color: canSave ? "#fff" : HT.text3,
            border: "none", borderRadius: 8, padding: "10px 18px",
          }}>Agregar orden</button>
        </div>
      </div>
    </div>
  );
}
